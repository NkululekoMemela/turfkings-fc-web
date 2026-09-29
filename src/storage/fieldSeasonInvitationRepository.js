import {
  FIELD_GAME_FORMATS, fieldSeasonHasPlayRecords, fieldSeasonPrizeAmounts,
} from "../core/fieldSeasonLifecycle.js";
import { auth, db } from "../firebaseConfig.js";
import {
  collection, doc, getDocs, query, where, runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { canManageClubField } from "./clubFieldMembershipRepository.js";

export function fieldSeasonNeedsAnnouncement(season) {
  return !season?.announcedAtMs && !fieldSeasonHasPlayRecords(season);
}

export async function announceFieldSeason({
  venueId, name, startsOn, entryFee, prizes, gameFormat,
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as a Field administrator.");
  const title = String(name || "").trim();
  const fee = Number(entryFee);
  const podium = fieldSeasonPrizeAmounts(prizes);
  const prize = Math.round(
    (podium.first + podium.second + podium.third) * 100
  ) / 100;
  if (!FIELD_GAME_FORMATS.some(([format]) => format === gameFormat)) {
    throw new Error("Choose 5, 6, 7 or 11-a-side.");
  }
  const date = String(startsOn || "");
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!title || title.length > 80) throw new Error("Enter a season name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a valid season start date.");
  }
  if (entryFee === "" ||
      !Number.isFinite(fee) || !Number.isFinite(prize) ||
      fee < 0 || prize < 0 ||
      fee > 100000000 || prize > 100000000) {
    throw new Error("Enter valid entry fee and prize amounts.");
  }

  const members = await getDocs(query(
    collection(db, "clubFieldMemberships"),
    where("venueId", "==", venueId)
  ));
  const clubIds = members.docs
    .filter(snapshot => snapshot.data().status === "active")
    .map(snapshot => snapshot.id);

  if (!clubIds.length) {
    throw new Error("A Club must join this Field before invitations can be sent.");
  }
  if (clubIds.length > 200) {
    throw new Error("This Field needs a larger invitation service before announcing.");
  }

  const venueRef = doc(db, "leagueVenues", venueId);
  const seasonId = `season-${crypto.randomUUID()}`;

  return runTransaction(db, async transaction => {
    const venueSnapshot = await transaction.get(venueRef);
    const staffSnapshot = await transaction.get(
      doc(db, "leagueVenues", venueId, "staff", user.uid)
    );
    const membershipSnapshots = [];
    const clubSnapshots = [];
    for (const clubId of clubIds) {
      membershipSnapshots.push(await transaction.get(
        doc(db, "clubFieldMemberships", clubId)
      ));
      clubSnapshots.push(await transaction.get(doc(db, "clubs", clubId)));
    }

    if (!venueSnapshot.exists()) throw new Error("Field no longer exists.");
    const venue = venueSnapshot.data();
    const staff = staffSnapshot.data();
    if (venue.ownerUid !== user.uid &&
        !(staff?.status === "active" && staff.isAdministrator === true)) {
      throw new Error("Only a Field administrator can announce a season.");
    }
    const existing = venue.league?.activeSeason;
    if (!fieldSeasonNeedsAnnouncement(existing)) {
      throw new Error("This season is already announced or has match records.");
    }

    const invitations = {};
    clubIds.forEach((clubId, index) => {
      const membership = membershipSnapshots[index].data();
      const club = clubSnapshots[index].data();
      if (membership?.status === "active" &&
          membership.venueId === venueId && club) {
        invitations[clubId] = {
          clubId,
          clubName: club.name || clubId,
          status: "pending",
          invitedByUid: user.uid,
          invitedAt: serverTimestamp(),
        };
      }
    });
    const count = Object.keys(invitations).length;
    if (!count) throw new Error("No active member Clubs remain at this Field.");

    transaction.update(venueRef, {
      "league.activeSeason": {
        ...(existing || {}),
        id: existing?.id || seasonId,
        name: title,
        startsOn: date,
        entryFee: Math.round(fee * 100) / 100,
        prizeMoney: prize,
        prizes: podium,
        gameFormat,
        currency: "ZAR",
        status: "active",
        registrationOpen: true,
        announcedAtMs: Date.now(),
        announcedByUid: user.uid,
        clubIds: [],
        invitations,
        fixtures: existing?.fixtures || [],
        results: [],
        liveMatches: {},
        matchDayHistory: [],
        allEvents: [],
      },
      updatedAt: serverTimestamp(),
    });
    return count;
  });
}

export async function respondToFieldSeason({ venueId, clubId, seasonId, status }) {
  const user = auth.currentUser;
  if (!user?.uid || !["accepted", "declined"].includes(status)) {
    throw new Error("Sign in as a Club administrator.");
  }

  const venueRef = doc(db, "leagueVenues", venueId);
  return runTransaction(db, async transaction => {
    const venueSnapshot = await transaction.get(venueRef);
    const clubSnapshot = await transaction.get(doc(db, "clubs", clubId));
    const membershipSnapshot = await transaction.get(
      doc(db, "clubFieldMemberships", clubId)
    );
    if (!canManageClubField(clubSnapshot.data(), user)) {
      throw new Error("Only your Club administrator can respond.");
    }
    const membership = membershipSnapshot.data();
    if (membership?.status !== "active" || membership.venueId !== venueId) {
      throw new Error("Your Club is no longer a member of this Field.");
    }
    const season = venueSnapshot.data()?.league?.activeSeason;
    const invitation = season?.invitations?.[clubId];
    if (season?.id !== seasonId || season.registrationOpen !== true ||
        invitation?.status !== "pending") {
      throw new Error("This invitation has changed or registration has closed.");
    }

    transaction.update(venueRef, {
      "league.activeSeason": {
        ...season,
        invitations: {
          ...season.invitations,
          [clubId]: {
            ...invitation,
            status,
            confirmedByUid: user.uid,
            confirmedAt: serverTimestamp(),
          },
        },
        clubIds: status === "accepted"
          ? [...new Set([...(season.clubIds || []), clubId])]
          : (season.clubIds || []),
        lastRespondingClubId: clubId,
      },
      updatedAt: serverTimestamp(),
    });
  });
}
