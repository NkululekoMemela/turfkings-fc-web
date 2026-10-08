import {venueLeagueRootPath} from "../core/venueLeaguePaths.js";
import { selectDatedFieldPairing } from "../core/fieldDatedPairing.js";
import { rescheduleRemainingKickoffs } from "../core/fieldRemainingKickoffs.js";
import { assertFieldMatchDayProgression } from "../../functions/fieldMatchDayProgression.mjs";
import { buildDatedMatchDayArchive } from "../core/fieldMatchDayArchive.js";
import { getDoc as startGetDoc } from "firebase/firestore";
import {
  getActiveFirebaseFunctionsBaseUrl as startFunctionsUrl,
} from "../firebaseConfig.js";
import {
  leagueBookingScope as startBookingScope,
  paidLeagueManifest as startPaidManifest,
} from "../core/leagueBookingPolicy.js";
import { getPlayerDoc as startPlayerDoc } from "../core/clubFirestorePaths.js";
import { buildFieldLeagueSchedule } from "../core/fieldLeagueSchedule.js";
import { reconcileFieldSeasonFixtures } from "../core/fieldSeasonFixtures.js";
import {
  fieldSeasonHasPlayRecords, fieldSeasonCancellationReason,
} from "../core/fieldSeasonLifecycle.js";
import { auth, db } from "../firebaseConfig.js";
import {
  doc,
  FieldPath,
  deleteField,
  arrayUnion,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  runTransaction,
} from "firebase/firestore";

import {
  buildVenueLiveMatchDocument,
  getVenueLiveMatchDoc,
} from "./venueLiveMatchRepository.js";
import { buildCurrentMatchFromFixture } from "../core/scheduledFixtures.js";
import { computeNextFromResult } from "../core/rotation.js";

export function recordVenueAction(transaction, {
  scope = null,
  venueId, seasonId = "", fixtureId = "", action, label, details = "",
}) {
  const user = auth.currentUser;
  if (!user?.uid || !venueId) {
    throw new Error("Sign in to record this Field action.");
  }
  if (scope && scope.venueId !== venueId) {
    throw new Error("Action log Field scope mismatch.");
  }
  const root = scope ? venueLeagueRootPath(scope) : `leagueVenues/${venueId}`;
  const entryRef = doc(db, `${root}/actionLog/${crypto.randomUUID()}`);
  transaction.set(entryRef, {
    venueId,
    seasonId: String(seasonId || ""),
    fixtureId: String(fixtureId || ""),
    action,
    label: String(label || "").slice(0, 100),
    details: String(details || "").slice(0, 500),
    actorUid: user.uid,
    actorEmail: user.email || "",
    actorName: String(user.displayName || user.email || user.uid).slice(0, 100),
    at: serverTimestamp(),
  });
}

export async function cancelVenueFixtureStart({ scope }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as a Field official.");

  const venueId = String(scope?.venueId || "").trim();
  const seasonId = String(scope?.seasonId || "").trim();
  if (!venueId || !seasonId) {
    throw new Error("The Field match reference is missing.");
  }

  const root = venueLeagueRootPath(scope);
  const venueRef = doc(db, root);
  const liveRef = getVenueLiveMatchDoc(db, scope, "current");

  await runTransaction(db, async (transaction) => {
    if (scope.environment === "practice") {
      await requireFieldPracticeMatchSession(transaction, scope, user.uid);
    }
    const venueSnap = await transaction.get(venueRef);
    const liveSnap = await transaction.get(liveRef);
    if (!venueSnap.exists() || !liveSnap.exists()) {
      throw new Error("The pending Field match no longer exists.");
    }

    const season = venueSnap.data().league?.activeSeason;
    const live = liveSnap.data();
    const fixtureId = String(live.fixtureId || "").trim();
    if (
      season?.id !== seasonId ||
      !fixtureId ||
      season.liveMatches?.[fixtureId]?.status !== "live" ||
      live.status !== "live"
    ) {
      throw new Error("This match is no longer live and cannot be cancelled.");
    }

    transaction.update(
      venueRef,
      new FieldPath("league", "activeSeason", "liveMatches", fixtureId),
      deleteField(),
      "updatedAt",
      serverTimestamp()
    );
    transaction.delete(liveRef);
  });
}

import {
  FORMATIONS_5,
  FORMATIONS_6,
  FORMATIONS_7,
  buildCleanSheetEventsForMatch,
} from "../core/lineups.js";
import {
  GAME_FORMAT,
  normalizeGameFormat,
} from "../core/matchConfig.js";

export function watchVenueSeason(venueId, onSeason, onError) {
  return onSnapshot(
    doc(db, "leagueVenues", venueId),
    (snapshot) => onSeason(snapshot.exists()
      ? snapshot.data().league?.activeSeason || null
      : null),
    onError
  );
}

export async function chooseVenueFixturePairing({
  scope = null, venueId, seasonId, clubAId, clubBId,
}) {
  const user = auth.currentUser;
  if (!user?.uid || !venueId || !seasonId) {
    throw new Error("Sign in as a Field official.");
  }
  const practice = scope?.environment === "practice";
  if (scope && (scope.venueId !== venueId || scope.seasonId !== seasonId)) {
    throw new Error("Pairing session scope mismatch.");
  }
  const root = scope ? venueLeagueRootPath(scope) : `leagueVenues/${venueId}`;
  const venueRef = doc(db, root);
  return runTransaction(db, async transaction => {
    const venueSnap = await transaction.get(venueRef);
    const liveSnap = await transaction.get(
      doc(db, `${root}/seasons/${seasonId}/matches/current`));
    const venue = venueSnap.data();
    if (!venue) throw new Error("Field no longer exists.");
    if (practice) {
      await requireFieldPracticeMatchSession(transaction, scope, user.uid);
    } else {
      const staffSnap = await transaction.get(
        doc(db, "leagueVenues", venueId, "staff", user.uid));
      const staff = staffSnap.data();
      if (venue.ownerUid !== user.uid &&
          !(staff?.status === "active" &&
            (staff.isAdministrator === true || staff.role === "referee"))) {
        throw new Error("Only an approved Field official can select the pairing.");
      }
    }
    const season = venue.league?.activeSeason;
    if (season?.id !== seasonId || season.status !== "active") {
      throw new Error("The active season changed.");
    }
    if (liveSnap.data()?.status === "live" ||
        Object.values(season.liveMatches || {}).some(item => item.status === "live")) {
      throw new Error("Finish the live match before selecting another pairing.");
    }
    const {fixture, fixtureIndex, matchDayIndex} = selectDatedFieldPairing({
      season, clubAId, clubBId,
    });
    transaction.update(venueRef, {
      "league.activeSeason.selectedFixtureId": fixture.id,
      "league.activeSeason.selectedFixtureIndex": fixtureIndex,
      "league.activeSeason.selectedMatchDayIndex": matchDayIndex,
      updatedAt: serverTimestamp(),
    });
    recordVenueAction(transaction, {
      scope, venueId, seasonId, fixtureId: fixture.id,
      action: "fixture_pairing_selected", label: "Fixture pairing selected",
      details: `${fixture.clubAName || clubAId} vs ${fixture.clubBName || clubBId}`,
    });
    return fixture.id;
  });
}

export async function prepareVenueSeasonForMatch({ venueId }) {
  const user = auth.currentUser;
  if (!user?.uid || !venueId) {
    throw new Error("Sign in as the Field Manager.");
  }

  const venueRef = doc(db, "leagueVenues", venueId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(venueRef);
    if (!snapshot.exists()) throw new Error("Field no longer exists.");

    const venue = snapshot.data();
    if (venue.ownerUid !== user.uid) {
      throw new Error("Only the Field Manager can start the season.");
    }

    const existing = venue.league?.activeSeason || {};
    if (Object.values(existing.liveMatches || {})
      .some((match) => match?.status === "live")) {
      throw new Error("A Field match is already live.");
    }

    const clubs = new Map();
    for (const invitation of Object.values(existing.invitations || {})) {
      if (invitation?.clubId &&
          (!existing.announcedAtMs || invitation.status === "accepted")) {
        clubs.set(invitation.clubId, invitation.clubName || invitation.clubId);
      }
    }
    for (const fixture of existing.fixtures || []) {
      if (fixture?.clubAId &&
          (!existing.announcedAtMs || clubs.has(fixture.clubAId))) {
        clubs.set(fixture.clubAId, fixture.clubAName || fixture.clubAId);
      }
      if (fixture?.clubBId &&
          (!existing.announcedAtMs || clubs.has(fixture.clubBId))) {
        clubs.set(fixture.clubBId, fixture.clubBName || fixture.clubBId);
      }
    }

    const minimum = Number(existing.minimumClubs) || 3;
    if (clubs.size < minimum) {
      throw new Error(
        `This season needs ${minimum} registered Clubs; ${clubs.size} have signed up. ` +
        "Wait for more signups or cancel the season with an explanation."
      );
    }

    if (existing.announcedAtMs && (existing.fixtures || []).some(
      fixture => !clubs.has(fixture.clubAId) || !clubs.has(fixture.clubBId)
    )) {
      throw new Error("Every scheduled Club must accept its season invitation first.");
    }

    const seasonId = existing.id || `season-${Date.now()}`;
    const clubIds = [...clubs.keys()];
    const invitations = { ...(existing.invitations || {}) };
    for (const [clubId, clubName] of clubs) {
      invitations[clubId] = {
        ...(invitations[clubId] || {}),
        clubId,
        clubName,
        status: "accepted",
        confirmedByUid: invitations[clubId]?.confirmedByUid || user.uid,
      };
    }

    const datedSchedule =
      existing.scheduleVersion === 1 && !(existing.fixtures || []).length
        ? buildFieldLeagueSchedule({
            seasonId, clubs, startsOn: existing.startsOn,
            ...existing.scheduleSettings,
          })
        : null;
    const fixtures = datedSchedule?.fixtures || reconcileFieldSeasonFixtures({
      season: { ...existing, id: seasonId },
      clubs,
      actorUid: user.uid,
    });

    const nextFixture = fixtures.find((fixture) =>
      fixture?.status === "scheduled" &&
      !existing.liveMatches?.[fixture.id]
    );
    if (!nextFixture) {
      throw new Error("This season has no remaining fixture.");
    }

    const season = {
      ...existing,
      id: seasonId,
      name: existing.name || "Field League Season",
      startsOn: existing.startsOn || new Date().toISOString().slice(0, 10),
      status: "active",
      clubIds,
      invitations,
      fixtures,
      matchDays: datedSchedule?.matchDays || existing.matchDays || [],
      registrationOpen: datedSchedule ? false : (existing.registrationOpen ?? false),
      schedulePublishedAtMs: datedSchedule ? Date.now() : (existing.schedulePublishedAtMs || null),
      liveMatches: existing.liveMatches || {},
      results: existing.results || [],
      allEvents: existing.allEvents || [],
      currentMatchNo: Number(existing.currentMatchNo) || 1,
      gameFormat: existing.gameFormat || "5_V_5",
      matchSeconds: Number(existing.matchSeconds) || 3600,
    };

    transaction.update(venueRef, {
      "league.activeSeason": season,
      updatedAt: serverTimestamp(),
    });
    if (existing.status !== "active") {
      recordVenueAction(transaction, {
        venueId, seasonId,
        action: "season_started",
        label: "Season started",
        details: season.name || "Field League Season",
      });
    }
    return { season, fixtureId: nextFixture.id };
  });
}

export async function createVenueSeason({
  venueId, name, startsOn, endsOn = "",
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  const title = String(name || "").trim();
  if (!title || title.length > 80) throw new Error("Enter a season name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ||
      (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) ||
      (endsOn && endsOn < startsOn)) {
    throw new Error("Enter valid season dates in order.");
  }

  const ref = doc(db, "leagueVenues", venueId);
  const seasonId = `season-${startsOn}`;
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Venue no longer exists.");
    const venue = snapshot.data();
    if (venue.ownerUid !== user.uid) {
      throw new Error("Only this venue's field manager can create a season.");
    }
    if (venue.league?.activeSeason) {
      throw new Error("This venue already has an active season.");
    }
    transaction.update(ref, {
      "league.activeSeason": {
        id: seasonId, name: title, startsOn, endsOn,
        status: "setup", clubIds: [],
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
    recordVenueAction(transaction, {
      venueId, seasonId,
      action: "season_created",
      label: "Season created",
      details: title,
    });
  });
}

export async function inviteClubToVenueSeason({ venueId, clubId }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !clubId) throw new Error("Select a club to invite.");

  const venueRef = doc(db, "leagueVenues", venueId);
  const clubRef = doc(db, "clubs", clubId);
  const [venueSnapshot, clubSnapshot] = await Promise.all([
    getDoc(venueRef),
    getDoc(clubRef),
  ]);
  if (!venueSnapshot.exists() || !clubSnapshot.exists()) {
    throw new Error("The venue or selected club no longer exists.");
  }

  const venue = venueSnapshot.data();
  const season = venue.league?.activeSeason;
  if (venue.ownerUid !== user.uid) {
    throw new Error("Only this venue's field manager can invite clubs.");
  }
  if (!season) throw new Error("Create a venue season before inviting clubs.");
  if (season.invitations?.[clubId]) {
    throw new Error("This club already has an invitation for this season.");
  }

  await updateDoc(
    venueRef,
    new FieldPath("league", "activeSeason", "invitations", clubId),
    {
      clubId,
      clubName: clubSnapshot.data().name || clubId,
      status: "pending",
      invitedByUid: user.uid,
      invitedAt: serverTimestamp(),
    },
    "updatedAt",
    serverTimestamp()
  );
}

export async function confirmVenueClubParticipation({ venueId, clubId }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !clubId) throw new Error("Select an invited club.");

  const venueRef = doc(db, "leagueVenues", venueId);
  const snapshot = await getDoc(venueRef);
  if (!snapshot.exists()) throw new Error("Venue no longer exists.");
  const venue = snapshot.data();
  if (venue.ownerUid !== user.uid) {
    throw new Error("Only this venue's field manager can confirm participation.");
  }
  if (venue.league?.activeSeason?.announcedAtMs) {
    throw new Error("The Club administrator must accept this invitation from their Club entry page.");
  }
  const invitation = venue.league?.activeSeason?.invitations?.[clubId];
  if (invitation?.status !== "pending") {
    throw new Error("This club does not have a pending invitation.");
  }

  await updateDoc(
    venueRef,
    new FieldPath("league", "activeSeason", "invitations", clubId, "status"),
    "accepted",
    new FieldPath("league", "activeSeason", "invitations", clubId, "confirmedByUid"),
    user.uid,
    new FieldPath("league", "activeSeason", "invitations", clubId, "confirmedAt"),
    serverTimestamp(),
    new FieldPath("league", "activeSeason", "clubIds"),
    arrayUnion(clubId),
    "updatedAt",
    serverTimestamp()
  );
}

export async function setVenueScheduleTesting({
  scope = null, venueId, seasonId, enabled,
}) {
  const uid = auth.currentUser?.uid;
  if (!uid || typeof enabled !== "boolean") {
    throw new Error("Sign in and choose a valid testing setting.");
  }
  const practice = scope?.environment === "practice";
  if (scope && (scope.venueId !== venueId || scope.seasonId !== seasonId)) {
    throw new Error("Testing session scope mismatch.");
  }
  const root = scope ? venueLeagueRootPath(scope) : `leagueVenues/${venueId}`;
  const venueRef = doc(db, root);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(venueRef);
    if (!snapshot.exists()) throw new Error("Field no longer exists.");
    const venue = snapshot.data();
    if (practice) await requireFieldPracticeMatchSession(transaction, scope, uid);
    if (!practice && venue.ownerUid !== uid) {
      throw new Error("Only the Field creator can change testing mode.");
    }
    if (venue.league?.activeSeason?.id !== seasonId) {
      throw new Error("The season has changed.");
    }
    transaction.update(venueRef, {
      "league.activeSeason.allowEarlyStarts": enabled,
      "league.activeSeason.testingChangedByUid": uid,
      "league.activeSeason.testingChangedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function rescheduleRemainingVenueKickoffs({
  venueId, seasonId, matchDayId, startTime,
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in as a Field administrator.");
  const venueRef = doc(db, "leagueVenues", venueId);
  return runTransaction(db, async transaction => {
    const venueSnap = await transaction.get(venueRef);
    const staffSnap = await transaction.get(
      doc(db, "leagueVenues", venueId, "staff", uid));
    const liveSnap = await transaction.get(
      doc(db, "leagueVenues", venueId, "seasons", seasonId, "matches", "current"));
    const venue = venueSnap.data();
    const staff = staffSnap.data();
    if (!venue || (venue.ownerUid !== uid &&
        !(staff?.status === "active" && staff.isAdministrator === true))) {
      throw new Error("Only a Field administrator can change kickoff times.");
    }
    const season = venue.league?.activeSeason;
    if (season?.id !== seasonId) throw new Error("The season has changed.");
    const updated = rescheduleRemainingKickoffs({
      season, matchDayId, startTime, actorUid: uid,
      liveMatch: liveSnap.exists() ? liveSnap.data() : null,
    });
    transaction.update(venueRef, {
      "league.activeSeason.fixtures": updated.fixtures,
      "league.activeSeason.matchDays": updated.matchDays,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function rescheduleVenueMatchDay({
  venueId, seasonId, matchDayId, dateLocal, startTime,
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as a Field administrator.");
  if (!venueId || !seasonId || !matchDayId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(dateLocal || "")) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(startTime || ""))) {
    throw new Error("Choose a valid match date and first kickoff.");
  }
  const date = new Date(`${dateLocal}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dateLocal) {
    throw new Error("Choose a valid match date.");
  }
  const venueRef = doc(db, "leagueVenues", venueId);
  const staffRef = doc(db, "leagueVenues", venueId, "staff", user.uid);

  return runTransaction(db, async transaction => {
    const venueSnap = await transaction.get(venueRef);
    const staffSnap = await transaction.get(staffRef);
    if (!venueSnap.exists()) throw new Error("Field no longer exists.");
    const venue = venueSnap.data();
    const staff = staffSnap.data();
    if (venue.ownerUid !== user.uid &&
        !(staff?.status === "active" && staff.isAdministrator === true)) {
      throw new Error("Only a Field administrator can change the schedule.");
    }
    const season = venue.league?.activeSeason;
    if (season?.id !== seasonId) throw new Error("The season has changed.");
    const day = (season.matchDays || []).find(item => item.id === matchDayId);
    if (!day || day.status !== "scheduled") {
      throw new Error("This match day is no longer available for rescheduling.");
    }

    const fixtures = season.fixtures || [];
    const dayFixtures = fixtures.filter(item => item.matchDayId === matchDayId);
    if (!dayFixtures.length) throw new Error("This match day has no fixtures.");
    if (dayFixtures.some(item => item.status !== "scheduled" ||
        season.liveMatches?.[item.id])) {
      throw new Error("This day has already started. Its recorded schedule is locked.");
    }
    if ((season.matchDays || []).some(item =>
        item.id !== matchDayId && item.dateLocal === dateLocal)) {
      throw new Error("Another match day already uses this date.");
    }

    const settings = season.scheduleSettings || {};
    const play = Number(settings.matchMinutes ?? 40);
    const halftime = Number(settings.halftimeMinutes ?? 5);
    const turnaround = Number(settings.turnaroundMinutes ?? 5);
    if (![play, halftime, turnaround].every(Number.isFinite) ||
        play < 2 || halftime < 0 || turnaround < 0) {
      throw new Error("The season duration settings need correcting.");
    }
    const [hour, minute] = startTime.split(":").map(Number);
    const firstMinute = hour * 60 + minute;
    const ordered = [...dayFixtures].sort((a, b) =>
      String(a.scheduledLocal).localeCompare(String(b.scheduledLocal)));
    const replacements = new Map();
    ordered.forEach((fixture, index) => {
      const kickoff = firstMinute + index * (play + halftime + turnaround);
      if (kickoff + play + halftime >= 1440) {
        throw new Error("These games will not fit before midnight. Start earlier.");
      }
      const time = `${String(Math.floor(kickoff / 60)).padStart(2, "0")}:` +
        String(kickoff % 60).padStart(2, "0");
      replacements.set(fixture.id, {
        ...fixture,
        scheduledLocal: `${dateLocal}T${time}`,
        rescheduledByUid: user.uid,
        rescheduledAtMs: Date.now(),
      });
    });

    transaction.update(venueRef, {
      "league.activeSeason.fixtures":
        fixtures.map(item => replacements.get(item.id) || item),
      "league.activeSeason.matchDays": season.matchDays.map(item =>
        item.id === matchDayId ? {
          ...item, dateLocal, startTime,
          opensAtMs: Date.parse(`${dateLocal}T00:00:00+02:00`),
          rescheduledByUid: user.uid, rescheduledAtMs: Date.now(),
        } : item),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function scheduleVenueFixture({
  venueId,
  clubAId,
  clubBId,
  scheduledLocal,
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !clubAId || !clubBId || clubAId === clubBId) {
    throw new Error("Choose two different participating clubs.");
  }
  if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(scheduledLocal)) {
    throw new Error("Enter a fixture date and time.");
  }

  const ref = doc(db, "leagueVenues", venueId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("Venue no longer exists.");
  const venue = snapshot.data();
  if (venue.ownerUid !== user.uid) {
    throw new Error("Only this venue's field manager can schedule fixtures.");
  }
  const season = venue.league?.activeSeason;
  if (!season) throw new Error("Create a season first.");
  const confirmed = new Set(season.clubIds || []);
  if (!confirmed.has(clubAId) || !confirmed.has(clubBId)) {
    throw new Error("Both clubs must be confirmed for this season.");
  }
  const clubA = season.invitations?.[clubAId];
  const clubB = season.invitations?.[clubBId];
  if (clubA?.status !== "accepted" || clubB?.status !== "accepted") {
    throw new Error("Both invitations must be accepted.");
  }
  if ((season.fixtures || []).some((fixture) =>
    fixture.scheduledLocal === scheduledLocal &&
    [clubAId, clubBId].includes(fixture.clubAId) &&
    [clubAId, clubBId].includes(fixture.clubBId))) {
    throw new Error("These clubs already have a fixture at this time.");
  }

  const fixture = {
    id: crypto.randomUUID(),
    clubAId,
    clubBId,
    clubAName: clubA.clubName,
    clubBName: clubB.clubName,
    scheduledLocal,
    timezone: "Africa/Johannesburg",
    status: "scheduled",
    createdByUid: user.uid,
    createdAtMs: Date.now(),
  };
  await updateDoc(
    ref,
    new FieldPath("league", "activeSeason", "fixtures"),
    arrayUnion(fixture),
    "updatedAt",
    serverTimestamp()
  );
  return fixture;
}

export async function startVenueFixture({
  venueId, fixtureId, teams = [], matchSeconds = 3600,
  currentMatchNo = 1, controller = null,
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !fixtureId) throw new Error("Select a scheduled fixture.");
  const ref = doc(db, "leagueVenues", venueId);
  const preliminary = await startGetDoc(ref);
  const approvalSeasonId = preliminary.data()?.league?.activeSeason?.id;
  if (!approvalSeasonId) throw new Error("The active season is missing.");
  const token = await user.getIdToken();
  const response = await fetch(
    `${startFunctionsUrl().replace(/\/$/, "")}/approveFieldMatchStart`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({venueId, seasonId: approvalSeasonId, fixtureId}),
    }
  );
  const approvalResponse = await response.json();
  if (!response.ok || !approvalResponse.approvalId) {
    throw new Error(approvalResponse.error || "Server match approval failed.");
  }
  const approvalRef = doc(db, "leagueVenues", venueId, "seasons",
    approvalSeasonId, "startApprovals", approvalResponse.approvalId);

  return runTransaction(db, async (transaction) => {
    const approvalSnapshot = await transaction.get(approvalRef);
    const approval = approvalSnapshot.data();
    if (!approvalSnapshot.exists() || approval.used ||
        approval.actorUid !== user.uid ||
        approval.expiresAt?.toMillis() <= Date.now()) {
      throw new Error("Match approval expired. Please try again.");
    }
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Venue no longer exists.");
    const venue = snapshot.data();

    const staffRef = doc(
      db,
      "leagueVenues",
      venueId,
      "staff",
      user.uid
    );
    const staffSnapshot = await transaction.get(staffRef);
    const staff = staffSnapshot.exists()
      ? staffSnapshot.data()
      : null;

    const isActiveFieldOperator =
      venue.ownerUid === user.uid ||
      (
        staff?.status === "active" &&
        (
          staff?.isAdministrator === true ||
          staff?.role === "referee"
        )
      );

    if (!isActiveFieldOperator) {
      throw new Error(
        "Only an approved Field official or referee can start this match."
      );
    }

    const season = venue.league?.activeSeason;
    if (season?.id !== approvalSeasonId) {
      throw new Error("The season changed. Please reopen the fixture.");
    }
    const minimum = Number(season?.minimumClubs) || 3;
    if ((season?.clubIds || []).length < minimum) {
      throw new Error(`At least ${minimum} registered Clubs are required before play.`);
    }
    const registeredClubs = new Map(
      (season.clubIds || []).map(clubId => [
        clubId, season.invitations?.[clubId]?.clubName || clubId,
      ])
    );
    const reconciledFixtures = reconcileFieldSeasonFixtures({
      season,
      clubs: registeredClubs,
      actorUid: user.uid,
    });
    const fixture = reconciledFixtures.find((item) =>
      item.id === fixtureId && item.status === "scheduled");
    if (!fixture || season.liveMatches?.[fixtureId]) {
      throw new Error("This fixture is unavailable or already started.");
    }
    if (Object.values(season.liveMatches || {})
      .some((match) => match.status === "live")) {
      throw new Error("Finish the current live match first.");
    }

    if (season.scheduleVersion === 1) {
      const day = (season.matchDays || []).find(item =>
        item.id === fixture.matchDayId);
      if (!day || day.status !== "scheduled") {
        throw new Error("This fixture needs an available scheduled match day.");
      }
      assertFieldMatchDayProgression({season, matchDayId: day.id});
      const opensAtMs = Date.parse(`${day.dateLocal}T00:00:00+02:00`);
      if (!Number.isFinite(opensAtMs)) {
        throw new Error("This match day has an invalid date.");
      }
      if (season.allowEarlyStarts !== true && Date.now() < opensAtMs) {
        throw new Error(`This match day opens on ${day.dateLocal}.`);
      }
    }

    if (season.scheduleVersion !== 1 || !fixture.matchDayId) {
      throw new Error("Publish dated league fixtures before starting this match.");
    }

    const requiredPlayers = {
      "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11,
    }[season.gameFormat];
    if (!requiredPlayers) {
      throw new Error("Choose a supported league game format.");
    }

    const paidSquadsForStart = approval.squads || {};
    if (season.gameFormat === "5_V_5" &&
        [fixture.clubAId, fixture.clubBId].some(clubId =>
          !approval.startingLineups?.[clubId])) {
      throw new Error("The approved starting lineup is missing. Try again.");
    }
    for (const clubId of [fixture.clubAId, fixture.clubBId]) {
      const players = paidSquadsForStart[clubId];
      if (!Array.isArray(players) || players.length < requiredPlayers ||
          players.some(player => player.clubId !== clubId ||
            !player.playerId || !player.sourcePlayerId || !player.fullName)) {
        throw new Error("The approved league lineup is incomplete. Try again.");
      }
    }

    const confirmedTeams = teams.filter((team) =>
      (season.clubIds || []).includes(team?.id)
    );
    const selected = buildCurrentMatchFromFixture({
      teamAId: fixture.clubAId,
      teamBId: fixture.clubBId,
    }, confirmedTeams);

    if (!selected?.standbyId) {
      throw new Error("Three confirmed clubs are required to start a League match.");
    }

    const match = {
      fixtureId,
      standbyId: selected.standbyId,
      clubAId: fixture.clubAId,
      clubBId: fixture.clubBId,
      clubAName: fixture.clubAName,
      clubBName: fixture.clubBName,
      scoreA: 0,
      scoreB: 0,
      status: "live",
      startedByUid: user.uid,
      startedAt: serverTimestamp(),
    };
    if (reconciledFixtures.length !== (season.fixtures || []).length) {
      transaction.update(ref, {
        "league.activeSeason.fixtures": reconciledFixtures,
      });
    }
    transaction.update(
      ref,
      new FieldPath("league", "activeSeason", "liveMatches", fixtureId),
      match,
      "updatedAt",
      serverTimestamp()
    );
    if (!controller?.deviceId || controller.uid !== user.uid) {
      throw new Error("The referee device identity is missing.");
    }

    const scope = {
      kind: "venueLeague",
      environment: "official",
      venueId,
      seasonId: season.id,
    };
    const { data } = buildVenueLiveMatchDocument({
      scope,
      match,
      teams,
      matchSeconds: Number(season.matchSeconds) || matchSeconds,
      currentMatchNo: Number(season.currentMatchNo) || currentMatchNo,
      startedByUid: user.uid,
      controller,
    });
    transaction.set(getVenueLiveMatchDoc(db, scope, "current"), {
      ...data,
      startApprovalId: approvalResponse.approvalId,
      paidSquads: paidSquadsForStart,
      confirmedLineupSnapshot: season.gameFormat === "5_V_5"
        ? approval.startingLineups : null,
      clockVersion: 1,
      clockPhase: "first_half",
      halftimeSeconds: Number(season.scheduleSettings?.halftimeMinutes ?? 5) * 60,
      halftimeEndsAtMs: 0,
      fixtureIndex: reconciledFixtures.findIndex(item => item.id === fixture.id),
      matchDayIndex: (season.matchDays || []).findIndex(item =>
        item.id === fixture.matchDayId),
    });
    transaction.update(approvalRef, {used: true});
    recordVenueAction(transaction, {
      venueId,
      seasonId: season.id,
      fixtureId,
      action: "match_started",
      label: "Match started",
      details: `${fixture.clubAName || fixture.clubAId} vs ${fixture.clubBName || fixture.clubBId}; referee UID: ${user.uid}`,
    });
    return match;
  });
}


function normalizedEventList(events) {
  return Array.isArray(events)
    ? events.filter(
        (event) =>
          event &&
          typeof event === "object"
      )
    : [];
}

export async function completeVenueFixture({
  scope = null,
  venueId,
  fixtureId,
  summary = {},
  currentEvents = [],
  confirmedLineupSnapshot = null,
  lineupTimeline = [],
}) {
  const user = auth.currentUser;

  if (!user?.uid) {
    throw new Error(
      "Sign in as an approved Field official."
    );
  }

  if (!venueId || !fixtureId) {
    throw new Error(
      "The active Field fixture is missing."
    );
  }

  const practice = scope?.environment === "practice";
  const root = scope
    ? venueLeagueRootPath(scope)
    : `leagueVenues/${venueId}`;
  if (scope && scope.venueId !== venueId) {
    throw new Error("The match scope belongs to another Field.");
  }
  const venueRef = doc(db, root);

  return runTransaction(
    db,
    async (transaction) => {
      if (practice) {
        await requireFieldPracticeMatchSession(transaction, scope, user.uid);
      }
      const venueSnapshot =
        await transaction.get(venueRef);

      if (!venueSnapshot.exists()) {
        throw new Error(
          "Venue no longer exists."
        );
      }

      const venue = venueSnapshot.data();

      let isActiveFieldOperator = practice;
      if (!practice) {
        const staffSnapshot = await transaction.get(
          doc(db, "leagueVenues", venueId, "staff", user.uid)
        );
        const staff = staffSnapshot.exists() ? staffSnapshot.data() : null;
        isActiveFieldOperator = venue.ownerUid === user.uid || (
          staff?.status === "active" &&
          (staff.isAdministrator === true || staff.role === "referee")
        );
      }

      if (!isActiveFieldOperator) {
        throw new Error(
          "Only an approved Field official or referee can finish this match."
        );
      }

      const season =
        venue.league?.activeSeason;

      if (practice && season?.id !== scope.seasonId) {
        throw new Error("The Practice season changed.");
      }
      if (!season?.id) {
        throw new Error(
          "The active Field season is missing."
        );
      }

      const fixtures = Array.isArray(
        season.fixtures
      )
        ? season.fixtures
        : [];

      const fixtureIndex =
        fixtures.findIndex(
          (fixture) =>
            fixture?.id === fixtureId
        );

      if (fixtureIndex < 0) {
        throw new Error(
          "The active Field fixture could not be found."
        );
      }

      const fixture = fixtures[fixtureIndex];
      const liveMatch =
        season.liveMatches?.[fixtureId];

      if (
        !liveMatch ||
        liveMatch.status !== "live"
      ) {
        throw new Error(
          "This Field match is no longer live."
        );
      }

      const teamAId = String(
        summary?.teamAId ||
        fixture.clubAId ||
        ""
      ).trim();

      const teamBId = String(
        summary?.teamBId ||
        fixture.clubBId ||
        ""
      ).trim();

      if (
        teamAId !== fixture.clubAId ||
        teamBId !== fixture.clubBId
      ) {
        throw new Error(
          "The completed clubs do not match the scheduled fixture."
        );
      }

      const goalsA = Math.max(
        0,
        Number(summary?.goalsA) || 0
      );

      const goalsB = Math.max(
        0,
        Number(summary?.goalsB) || 0
      );

      const standbyId = String(liveMatch.standbyId || "").trim();
      if (!standbyId ||
          standbyId === teamAId ||
          standbyId === teamBId ||
          !(season.clubIds || []).includes(standbyId)) {
        throw new Error("The live match is missing its confirmed standby club.");
      }

      const rotation = computeNextFromResult(
        season.streaks || {},
        { teamAId, teamBId, standbyId, goalsA, goalsB }
      );

      const matchNo =
        Number(season.currentMatchNo) ||
        (
          Array.isArray(season.results)
            ? season.results.length + 1
            : 1
        );

      const completedAtMs = Date.now();
      const gameFormat = normalizeGameFormat(
        season.gameFormat || GAME_FORMAT.FIVE_V_FIVE,
        GAME_FORMAT.FIVE_V_FIVE
      );
      const formationMap = gameFormat === GAME_FORMAT.SIX_V_SIX
        ? FORMATIONS_6
        : gameFormat === GAME_FORMAT.SEVEN_V_SEVEN
          ? FORMATIONS_7
          : FORMATIONS_5;
      const matchMeta = {
        matchType: "LEAGUE",
        gameFormat,
        matchMode: "scheduled_target",
      };
      const committedEvents = normalizedEventList(currentEvents)
        .map((event) => ({ ...event, ...matchMeta, matchNo }));
      const cleanSheetEvents = buildCleanSheetEventsForMatch({
        matchNo,
        teamAId,
        teamBId,
        goalsA,
        goalsB,
        verifiedLineups: confirmedLineupSnapshot,
        formationMap,
      }).map((event) => ({ ...event, ...matchMeta }));
      const allCommittedEvents = [
        ...committedEvents,
        ...cleanSheetEvents,
      ];

      const result = {
        ...matchMeta,
        id: fixtureId,
        fixtureId,
        matchNo,
        teamAId,
        teamBId,
        standbyId,
        clubAId: teamAId,
        clubBId: teamBId,
        teamAName:
          fixture.clubAName || teamAId,
        teamBName:
          fixture.clubBName || teamBId,
        clubAName:
          fixture.clubAName || teamAId,
        clubBName:
          fixture.clubBName || teamBId,
        goalsA,
        goalsB,
        scoreA: goalsA,
        scoreB: goalsB,
        winnerId: rotation.winnerId,
        isDraw: rotation.isDraw,
        status: "completed",
        scheduledLocal:
          fixture.scheduledLocal || "",
        timezone:
          fixture.timezone ||
          "Africa/Johannesburg",
        events: committedEvents,
        confirmedLineupSnapshot:
          confirmedLineupSnapshot || null,
        lineupTimeline: Array.isArray(lineupTimeline)
          ? lineupTimeline
          : [],
        completedByUid: user.uid,
        completedAtMs,
      };

      const nextFixtures =
        fixtures.map((item, index) =>
          index === fixtureIndex
            ? {
                ...item,
                status: "completed",
                goalsA,
                goalsB,
                scoreA: goalsA,
                scoreB: goalsB,
                winnerId: result.winnerId,
                isDraw: result.isDraw,
                completedByUid: user.uid,
                completedAtMs,
              }
            : item
        );

      const nextFixture = nextFixtures.find(
        (item) => item?.status === "scheduled"
      );
      const nextCurrentMatch = nextFixture
        ? buildCurrentMatchFromFixture(
            {
              teamAId: nextFixture.clubAId,
              teamBId: nextFixture.clubBId,
            },
            (season.clubIds || []).map((id) => ({ id }))
          )
        : {
            teamAId: rotation.nextTeamAId,
            teamBId: rotation.nextTeamBId,
            standbyId: rotation.nextStandbyId,
          };

      const nextLiveMatches = {
        ...(season.liveMatches || {}),
        [fixtureId]: {
          ...liveMatch,
          status: "completed",
          scoreA: goalsA,
          scoreB: goalsB,
          goalsA,
          goalsB,
          winnerId: result.winnerId,
          isDraw: result.isDraw,
          completedByUid: user.uid,
          completedAtMs,
        },
      };

      const previousResults =
        Array.isArray(season.results)
          ? season.results.filter(
              (item) =>
                item?.fixtureId !== fixtureId &&
                item?.id !== fixtureId
            )
          : [];

      const nextSeason = {
        ...season,
        status: "active",
        fixtures: nextFixtures,
        liveMatches: nextLiveMatches,
        results: [
          ...previousResults,
          result,
        ],
        allEvents: [
          ...(Array.isArray(season.allEvents) ? season.allEvents : []),
          ...allCommittedEvents,
        ],
        currentMatchNo: matchNo + 1,
        currentMatch: nextCurrentMatch,
        streaks: rotation.updatedStreaks,
        updatedAtMs: completedAtMs,
      };

      transaction.update(
        venueRef,
        {
          "league.activeSeason":
            nextSeason,
          updatedAt:
            serverTimestamp(),
        }
      );

      if (practice) {
        transaction.set(doc(db, `${root}/actionLog/${crypto.randomUUID()}`), {
          environment: "practice",
          practiceSessionId: scope.practiceSessionId,
          seasonId: season.id, fixtureId,
          action: "match_completed",
          actorUid: user.uid, createdAtMs: completedAtMs,
          details: `${result.teamAName} ${goalsA}–${goalsB} ${result.teamBName}`,
        });
      } else {
      recordVenueAction(transaction, {
        venueId,
        seasonId: season.id,
        fixtureId,
        action: "match_completed",
        label: "Match completed",
        details: `${result.teamAName} ${goalsA}–${goalsB} ${result.teamBName}; completed by UID: ${user.uid}`,
      });
      }
      return {
        result,
        season: nextSeason,
      };
    }
  );
}

async function requireVenueStaffPower(transaction, venue, venueId, uid, power) {
  if (venue.ownerUid === uid) return;
  const staffSnapshot = await transaction.get(
    doc(db, "leagueVenues", venueId, "staff", uid)
  );
  const permissionSnapshot = await transaction.get(
    doc(db, "leagueVenues", venueId, "staffPermissions", uid)
  );
  if (!staffSnapshot.exists() ||
      staffSnapshot.data().status !== "active" ||
      !permissionSnapshot.exists() ||
      permissionSnapshot.data()[power] !== true) {
    throw new Error("The Field creator has not assigned you this power.");
  }
}

export async function archiveVenueMatchDay({ scope = null, venueId, seasonId, matchDayId = "" }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the Field Manager.");

  const practice = scope?.environment === "practice";
  if (scope && (scope.venueId !== venueId || scope.seasonId !== seasonId)) {
    throw new Error("Season action scope mismatch.");
  }
  const root = scope ? venueLeagueRootPath(scope) : `leagueVenues/${venueId}`;
  const venueRef = doc(db, root);
  const liveRef = doc(db,
    `${root}/seasons/${seasonId}/matches/current`
  );
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(venueRef);
    const liveSnapshot = await transaction.get(liveRef);
    if (!snapshot.exists()) throw new Error("Field no longer exists.");

    const venue = snapshot.data();
    if (practice) {
      await requireFieldPracticeMatchSession(transaction, scope, user.uid);
    } else {
    await requireVenueStaffPower(
      transaction, venue, venueId, user.uid, "endMatchDay"
    );
    }
    if (liveSnapshot.exists() && liveSnapshot.data().status === "live") {
      throw new Error("Finish the live match before ending the match day.");
    }

    const season = venue.league?.activeSeason;
    if (!season?.id || season.id !== seasonId || season.status !== "active") {
      throw new Error("The active Field season has changed. Reload and try again.");
    }
    if (Object.values(season.liveMatches || {}).some(
      (match) => match?.status === "live"
    )) {
      throw new Error("Finish the live match before ending the match day.");
    }

    const history = Array.isArray(season.matchDayHistory)
      ? season.matchDayHistory : [];
    const now = Date.now();
    const day = buildDatedMatchDayArchive({
      season, matchDayId, actorUid: user.uid, now,
    });
    const dayResults = day.results;

    transaction.update(venueRef, {
      "league.activeSeason.matchDayHistory": [...history, day],
      "league.activeSeason.updatedAtMs": now,
      updatedAt: serverTimestamp(),
    });
    if (liveSnapshot.exists()) transaction.delete(liveRef);
    recordVenueAction(transaction, {
      scope, venueId, seasonId,
      action: "match_day_saved",
      label: "Match Day saved",
      details: `${dayResults.length} completed match(es) archived; day ID: ${day.id}`,
    });
    return day;
  });
}

export async function discardVenueMatchDay({ scope = null, venueId, seasonId }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the Field Manager.");

  const practice = scope?.environment === "practice";
  if (scope && (scope.venueId !== venueId || scope.seasonId !== seasonId)) {
    throw new Error("Discard session scope mismatch.");
  }
  const root = scope ? venueLeagueRootPath(scope) : `leagueVenues/${venueId}`;
  const venueRef = doc(db, root);
  const liveRef = doc(db, `${root}/seasons/${seasonId}/matches/current`);

  return runTransaction(db, async (transaction) => {
    const venueSnapshot = await transaction.get(venueRef);
    const liveSnapshot = await transaction.get(liveRef);
    if (!venueSnapshot.exists()) throw new Error("Field no longer exists.");

    const venue = venueSnapshot.data();
    if (practice) {
      await requireFieldPracticeMatchSession(transaction, scope, user.uid);
    }
    if (!practice && venue.ownerUid !== user.uid) {
      throw new Error("Only the Field Manager can discard this match day.");
    }
    const season = venue.league?.activeSeason;
    if (season?.id !== seasonId || season.status !== "active") {
      throw new Error("The active Field season changed. Reload and try again.");
    }
    if (Object.values(season.liveMatches || {}).some(
      (match) => match?.status === "live"
    ) || (liveSnapshot.exists() &&
      liveSnapshot.data().status === "live")) {
      throw new Error("Finish the live match first.");
    }

    const archivedIds = new Set(
      (season.matchDayHistory || []).flatMap((day) =>
        (day.results || []).map((result) =>
          String(result.fixtureId || result.id || ""))
      )
    );
    const discardResults = (season.results || []).filter((result) =>
      result?.status === "completed" &&
      !archivedIds.has(String(result.fixtureId || result.id || "")));
    if (!discardResults.length) {
      throw new Error("There are no unarchived games to delete.");
    }
    const discardIds = new Set(discardResults.map((result) =>
      String(result.fixtureId || result.id)));
    const discardMatchNos = new Set(discardResults.map((result) =>
      Number(result.matchNo)));
    const keptResults = (season.results || []).filter((result) =>
      !discardIds.has(String(result.fixtureId || result.id || "")));
    const fixtures = (season.fixtures || []).map((fixture) => {
      if (!discardIds.has(String(fixture.id))) return fixture;
      const {
        goalsA, goalsB, scoreA, scoreB, winnerId, isDraw,
        completedByUid, completedAtMs, ...scheduled
      } = fixture;
      return { ...scheduled, status: "scheduled" };
    });
    const liveMatches = { ...(season.liveMatches || {}) };
    for (const id of discardIds) delete liveMatches[id];

    let streaks = Object.fromEntries(
      (season.clubIds || []).map((id) => [id, 0]));
    for (const result of [...keptResults].sort(
      (a, b) => Number(a.matchNo) - Number(b.matchNo))) {
      streaks = computeNextFromResult(streaks, {
        teamAId: result.teamAId || result.clubAId,
        teamBId: result.teamBId || result.clubBId,
        standbyId: result.standbyId,
        goalsA: Number(result.goalsA ?? result.scoreA) || 0,
        goalsB: Number(result.goalsB ?? result.scoreB) || 0,
      }).updatedStreaks;
    }
    const nextFixture = fixtures.find((item) =>
      item.status === "scheduled");
    const nextMatch = nextFixture
      ? buildCurrentMatchFromFixture({
          teamAId: nextFixture.clubAId,
          teamBId: nextFixture.clubBId,
        }, (season.clubIds || []).map((id) => ({ id })))
      : season.currentMatch;

    transaction.update(venueRef, {
      "league.activeSeason": {
        ...season,
        fixtures,
        liveMatches,
        results: keptResults,
        allEvents: (season.allEvents || []).filter((event) =>
          !discardMatchNos.has(Number(event.matchNo))),
        currentMatchNo: Math.max(0, ...keptResults.map(
          (result) => Number(result.matchNo) || 0)) + 1,
        currentMatch: nextMatch,
        streaks,
        updatedAtMs: Date.now(),
      },
      updatedAt: serverTimestamp(),
    });
    if (liveSnapshot.exists() &&
      discardIds.has(String(liveSnapshot.data().fixtureId))) {
      transaction.delete(liveRef);
    }
    recordVenueAction(transaction, {
      scope, venueId, seasonId,
      action: "match_day_discarded",
      label: "Day's games deleted",
      details: `${discardResults.length} completed match(es) removed: ${[...discardIds].join(", ")}`,
    });
    return discardResults.length;
  });
}

export async function endVenueSeason({
  scope = null, venueId, seasonId, mode = "complete", cancellationReason = "",
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the Field Manager.");

  const practice = scope?.environment === "practice";
  if (scope && (scope.venueId !== venueId || scope.seasonId !== seasonId)) {
    throw new Error("Season action scope mismatch.");
  }
  const root = scope ? venueLeagueRootPath(scope) : `leagueVenues/${venueId}`;
  const venueRef = doc(db, root);
  const archiveRef = doc(db, `${root}/seasons/${seasonId}`);

  return runTransaction(db, async (transaction) => {
    const venueSnapshot = await transaction.get(venueRef);
    const archiveSnapshot = await transaction.get(archiveRef);
    const currentSnapshot = await transaction.get(
      doc(db, `${root}/seasons/${seasonId}/matches/current`)
    );
    if (!venueSnapshot.exists()) throw new Error("Field no longer exists.");

    const venue = venueSnapshot.data();
    if (practice) {
      await requireFieldPracticeMatchSession(transaction, scope, user.uid);
    } else {
    await requireVenueStaffPower(
      transaction, venue, venueId, user.uid, "endSeason"
    );
    }
    const season = venue.league?.activeSeason;
    if (!season?.id || season.id !== seasonId ||
        season.status !== "active") {
      throw new Error("The active Field season has changed. Reload and try again.");
    }
    if (archiveSnapshot.exists() && (
      !practice || ["completed", "cancelled"].includes(archiveSnapshot.data().status)
    )) {
      throw new Error("This Field season is already archived.");
    }
    if (Object.values(season.liveMatches || {}).some(
      (match) => match?.status === "live"
    )) {
      throw new Error("Finish the live match before ending the season.");
    }

    if (!["cancel", "complete"].includes(mode)) {
      throw new Error("Choose whether to cancel or complete the season.");
    }
    const cancelling = mode === "cancel";
    const hasPlay = fieldSeasonHasPlayRecords(season) || currentSnapshot.exists();
    if (currentSnapshot.data()?.status === "live") {
      throw new Error("Finish the live match before ending the season.");
    }
    if (cancelling && hasPlay) {
      throw new Error("Play is recorded. This season must be ended, not cancelled.");
    }
    if (!cancelling && !hasPlay) {
      throw new Error("No play is recorded. Cancel the season with an explanation.");
    }
    const reason = cancelling
      ? fieldSeasonCancellationReason(cancellationReason) : "";

    const archivedIds = new Set(
      (season.matchDayHistory || []).flatMap((day) =>
        (day.results || []).map((result) => String(result.fixtureId || result.id || ""))
      )
    );
    const unarchived = (season.results || []).filter(
      (result) => result?.status === "completed" &&
        !archivedIds.has(String(result.fixtureId || result.id || ""))
    );
    if (unarchived.length) {
      throw new Error("End Match Day for all completed matches first.");
    }

    const now = Date.now();
    const nextId = `season-${now}-${crypto.randomUUID().slice(0, 8)}`;
    const nextSeason = {
      id: nextId,
      name: "Field League Season",
      status: "active",
      previousSeasonId: season.id,
      createdAtMs: now,
      startsOn: new Date(now).toISOString().slice(0, 10),
      clubIds: [],
      invitations: {},
      fixtures: [],
      liveMatches: {},
      results: [],
      allEvents: [],
      matchDayHistory: [],
      currentMatchNo: 1,
      gameFormat: season.gameFormat || "5_V_5",
      matchSeconds: Number(season.matchSeconds) || 3600,
    };

    transaction.set(archiveRef, {
      ...season,
      status: cancelling ? "cancelled" : "completed",
      registrationOpen: false,
      ...(cancelling ? { cancellationReason: reason } : {}),
      endedAtMs: now,
      endedByUid: user.uid,
    });
    transaction.update(
      venueRef,
      new FieldPath("league", "activeSeason"), nextSeason,
      "updatedAt", serverTimestamp()
    );
    recordVenueAction(transaction, {
      scope, venueId, seasonId,
      action: cancelling ? "season_cancelled" : "season_ended",
      label: cancelling ? "Season cancelled" : "Season ended",
      details: cancelling
        ? `${season.name || season.id}: ${reason}`.slice(0, 500)
        : `${season.name || season.id} archived; new season: ${nextId}`,
    });
    return nextSeason;
  });
}

export async function deleteCurrentEmptyVenueSeason({
  venueId, seasonId,
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the Field Manager.");

  const venueRef = doc(db, "leagueVenues", venueId);
  return runTransaction(db, async (transaction) => {
    const venueSnapshot = await transaction.get(venueRef);
    if (!venueSnapshot.exists()) throw new Error("Field no longer exists.");

    const venue = venueSnapshot.data();
    if (venue.ownerUid !== user.uid) {
      throw new Error("Only the Field Manager can delete this season.");
    }

    const current = venue.league?.activeSeason;
    if (current?.id !== seasonId || current.status !== "active") {
      throw new Error("The current season changed. Reload and try again.");
    }

    const previousId = current.previousSeasonId;
    if (!previousId) {
      throw new Error("There is no previous season to restore.");
    }

    const previousRef = doc(
      db, "leagueVenues", venueId, "seasons", previousId
    );
    const liveRef = doc(
      db, "leagueVenues", venueId, "seasons", seasonId,
      "matches", "current"
    );
    const previousSnapshot = await transaction.get(previousRef);
    const liveSnapshot = await transaction.get(liveRef);

    if (!previousSnapshot.exists() ||
        previousSnapshot.data().status !== "completed") {
      throw new Error("The previous season is unavailable.");
    }

    const hasRecords = [
      "clubIds", "fixtures", "results", "allEvents",
      "matchDayHistory", "currentEvents",
    ].some((key) => (current[key] || []).length > 0);

    if (hasRecords ||
        Object.keys(current.invitations || {}).length ||
        Object.keys(current.liveMatches || {}).length ||
        liveSnapshot.exists()) {
      throw new Error(
        "Only a completely empty current season can be deleted."
      );
    }

    const { endedAtMs, endedByUid, ...previous } =
      previousSnapshot.data();
    transaction.update(venueRef, {
      "league.activeSeason": { ...previous, status: "active" },
      updatedAt: serverTimestamp(),
    });
    transaction.delete(previousRef);
    recordVenueAction(transaction, {
      venueId,
      seasonId,
      action: "empty_season_deleted",
      label: "Empty season deleted",
      details: `Restored previous season: ${previous.name || previousId}`,
    });
    return previousId;
  });
}

export async function correctVenueRecordedGoal({
  venueId,
  fixtureId,
  action,
  eventId = "",
  goal = {},
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the Field Manager.");
  if (!["add", "edit", "delete"].includes(action)) {
    throw new Error("Choose a valid goal correction.");
  }

  const venueRef = doc(db, "leagueVenues", venueId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(venueRef);
    if (!snapshot.exists()) throw new Error("Field no longer exists.");

    const venue = snapshot.data();
    if (venue.ownerUid !== user.uid) {
      throw new Error("Only the Field Manager can correct a recorded match.");
    }

    const season = venue.league?.activeSeason;
    const results = Array.isArray(season?.results) ? season.results : [];
    const index = results.findIndex((item) =>
      item.fixtureId === fixtureId && item.status === "completed"
    );
    if (index < 0) throw new Error("Completed fixture not found.");

    const result = results[index];
    const matchNo = Number(result.matchNo);
    const oldEvents = Array.isArray(season.allEvents)
      ? season.allEvents : [];
    const matchEvents = oldEvents.filter((event) =>
      Number(event.matchNo) === matchNo
    );
    const target = matchEvents.find((event) =>
      String(event.id) === String(eventId) && event.type === "goal"
    );
    if (action !== "add" && !target) {
      throw new Error("Recorded goal no longer exists.");
    }

    const teamId = String(goal.teamId || target?.teamId || "").trim();
    const scorer = String(goal.scorer || "").trim();
    const assist = String(goal.assist || "").trim();
    if (action !== "delete" && (
      ![result.teamAId, result.teamBId].includes(teamId) || !scorer
    )) {
      throw new Error("Choose a participating club and scorer.");
    }

    const correctedGoal = action === "delete" ? null : {
      ...(target || {}),
      id: target?.id || crypto.randomUUID(),
      fixtureId,
      matchNo,
      type: "goal",
      teamId,
      scorer,
      assist: assist && assist !== scorer ? assist : null,
      timeSeconds: Number(goal.timeSeconds ?? target?.timeSeconds ?? 0),
    };

    let nextMatchEvents = matchEvents.filter((event) =>
      action === "add" || String(event.id) !== String(eventId)
    );
    if (correctedGoal) nextMatchEvents.push(correctedGoal);

    const goalsA = nextMatchEvents.filter((event) =>
      event.type === "goal" && event.teamId === result.teamAId
    ).length;
    const goalsB = nextMatchEvents.filter((event) =>
      event.type === "goal" && event.teamId === result.teamBId
    ).length;

    // A score correction can change clean-sheet awards.
    nextMatchEvents = nextMatchEvents.filter((event) =>
      event.type !== "clean_sheet"
    );
    const gameFormat = normalizeGameFormat(
      result.gameFormat || season.gameFormat || GAME_FORMAT.FIVE_V_FIVE,
      GAME_FORMAT.FIVE_V_FIVE
    );
    const formationMap = gameFormat === GAME_FORMAT.SIX_V_SIX
      ? FORMATIONS_6
      : gameFormat === GAME_FORMAT.SEVEN_V_SEVEN
        ? FORMATIONS_7 : FORMATIONS_5;
    nextMatchEvents.push(...buildCleanSheetEventsForMatch({
      matchNo,
      teamAId: result.teamAId,
      teamBId: result.teamBId,
      goalsA,
      goalsB,
      verifiedLineups: result.confirmedLineupSnapshot,
      formationMap,
    }).map((event) => ({
      ...event,
      fixtureId,
      matchType: "LEAGUE",
      gameFormat,
      matchMode: "scheduled_target",
    })));

    const winnerId = goalsA === goalsB ? null
      : goalsA > goalsB ? result.teamAId : result.teamBId;
    const nextResult = {
      ...result,
      goalsA, goalsB,
      scoreA: goalsA, scoreB: goalsB,
      winnerId,
      isDraw: goalsA === goalsB,
      events: nextMatchEvents,
      correctedAtMs: Date.now(),
      correctedByUid: user.uid,
    };
    const nextResults = [...results];
    nextResults[index] = nextResult;
    const nextHistory = (season.matchDayHistory || []).map((day) => {
      if (!(day.results || []).some((saved) =>
        String(saved.fixtureId || saved.id) === String(fixtureId)
      )) return day;
      return {
        ...day,
        results: day.results.map((saved) =>
          String(saved.fixtureId || saved.id) === String(fixtureId)
            ? nextResult : saved
        ),
        allEvents: [
          ...(day.allEvents || []).filter((event) =>
            Number(event.matchNo) !== matchNo
          ),
          ...nextMatchEvents,
        ],
      };
    });

    const nextFixtures = (season.fixtures || []).map((fixture) =>
      fixture.id === fixtureId
        ? {
            ...fixture, goalsA, goalsB,
            scoreA: goalsA, scoreB: goalsB,
            winnerId, isDraw: goalsA === goalsB,
          }
        : fixture
    );
    const nextLiveMatch = {
      ...season.liveMatches?.[fixtureId],
      goalsA, goalsB,
      scoreA: goalsA, scoreB: goalsB,
      winnerId,
      isDraw: goalsA === goalsB,
    };

    transaction.update(
      venueRef,
      new FieldPath("league", "activeSeason", "allEvents"),
      [
        ...oldEvents.filter((event) =>
          Number(event.matchNo) !== matchNo
        ),
        ...nextMatchEvents,
      ],
      new FieldPath("league", "activeSeason", "results"),
      nextResults,
      new FieldPath("league", "activeSeason", "matchDayHistory"),
      nextHistory,
      new FieldPath("league", "activeSeason", "fixtures"),
      nextFixtures,
      new FieldPath("league", "activeSeason", "liveMatches", fixtureId),
      nextLiveMatch,
      "updatedAt",
      serverTimestamp()
    );
    return nextResult;
  });
}


export async function deleteVenueRecordedMatch({ venueId, fixtureId }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the Field Manager.");

  const venueRef = doc(db, "leagueVenues", venueId);

  return runTransaction(db, async (transaction) => {
    const venueSnap = await transaction.get(venueRef);
    if (!venueSnap.exists()) throw new Error("Field no longer exists.");

    const venue = venueSnap.data();
    if (venue.ownerUid !== user.uid) {
      throw new Error("Only the Field Manager can delete a recorded match.");
    }

    const season = venue.league?.activeSeason;
    if (!season?.id) throw new Error("Active Field season is missing.");

    const matchRef = doc(
      db, "leagueVenues", venueId, "seasons", season.id,
      "matches", "current"
    );
    const matchSnap = await transaction.get(matchRef);

    const results = Array.isArray(season.results) ? season.results : [];
    const result = results.find((item) =>
      item.fixtureId === fixtureId && item.status === "completed"
    );
    if (!result) throw new Error("Completed match no longer exists.");
    if ((season.matchDayHistory || []).some((day) =>
      (day.results || []).some((saved) =>
        String(saved.fixtureId || saved.id) === String(fixtureId)
      )
    )) {
      throw new Error(
        "This match day is saved. Correct the result instead of deleting it."
      );
    }

    const matchNo = Number(result.matchNo);
    if (!Number.isInteger(matchNo) ||
        results.some((item) => Number(item.matchNo) > matchNo) ||
        Number(season.currentMatchNo) !== matchNo + 1) {
      throw new Error("Only the latest completed Field match can be deleted.");
    }

    const fixture = (season.fixtures || []).find((item) =>
      item.id === fixtureId
    );
    if (fixture?.status !== "completed" ||
        season.liveMatches?.[fixtureId]?.status !== "completed") {
      throw new Error("Fixture state changed; deletion was stopped.");
    }

    if (Object.values(season.liveMatches || {}).some((item) =>
      item?.status === "live"
    )) {
      throw new Error("Finish or cancel the live match before deleting a result.");
    }

    if (matchSnap.exists() &&
        (matchSnap.data().fixtureId !== fixtureId ||
         matchSnap.data().status !== "completed")) {
      throw new Error("Current match document changed; deletion was stopped.");
    }

    const {
      goalsA, goalsB, scoreA, scoreB, winnerId, isDraw,
      completedByUid, completedAtMs, ...scheduledFixture
    } = fixture;
    const nextFixtures = season.fixtures.map((item) =>
      item.id === fixtureId
        ? { ...scheduledFixture, status: "scheduled" }
        : item
    );
    const nextLiveMatches = { ...(season.liveMatches || {}) };
    delete nextLiveMatches[fixtureId];

    transaction.update(venueRef, {
      "league.activeSeason": {
        ...season,
        status: "active",
        fixtures: nextFixtures,
        liveMatches: nextLiveMatches,
        results: results.filter((item) => item.fixtureId !== fixtureId),
        allEvents: (season.allEvents || []).filter((event) =>
          Number(event.matchNo) !== matchNo
        ),
        currentMatchNo: matchNo,
        updatedAtMs: Date.now(),
      },
      updatedAt: serverTimestamp(),
    });

    if (matchSnap.exists()) transaction.delete(matchRef);
  });
}


async function requireFieldPracticeMatchSession(transaction, scope, uid) {
  // The resolver rejects Club scopes, invalid environments and missing IDs.
  venueLeagueRootPath(scope);
  if (scope.environment !== "practice" || !scope.seasonId) {
    throw new Error("An explicit Field Practice season is required.");
  }
  const snapshot = await transaction.get(
    doc(db, "practiceSessions", scope.practiceSessionId)
  );
  const session = snapshot.data();
  if (
    session?.kind !== "venueLeague" ||
    session.environment !== "practice" ||
    session.sessionId !== scope.practiceSessionId ||
    session.venueId !== scope.venueId ||
    session.userId !== uid ||
    session.status !== "active" ||
    typeof session.expiresAt?.toMillis !== "function" ||
    session.expiresAt.toMillis() <= Date.now()
  ) {
    throw new Error("This Field Practice session is unavailable or expired.");
  }
}
