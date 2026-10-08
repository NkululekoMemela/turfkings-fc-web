const {createHash} = require("node:crypto");
const {FieldValue} = require("firebase-admin/firestore");
const service = require("./fieldSeasonSquadService");
const {loadSeasonStartSquad} = require("./fieldSeasonStartSquad");

const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);
const fingerprint = value => createHash("sha256")
  .update(JSON.stringify(value)).digest("hex");

function project({scope, day, fixture, candidates, saved}) {
  const revision = fingerprint({
    scope, date: day.dateLocal, fixtureId: fixture.id,
    scheduledLocal: fixture.scheduledLocal || "",
    players: candidates.map(player => ({
      memberId: player.memberId, sourcePlayerId: player.sourcePlayerId,
      fullName: player.fullName,
      originalMemberId: player.originalMemberId || "",
    })).sort((a, b) => a.memberId.localeCompare(b.memberId)),
  });
  const selected = Array.isArray(saved?.memberIds) ? saved.memberIds : [];
  const byId = new Map(candidates.map(player => [player.memberId, player]));
  const validSelection = selected.length >= 5 && selected.length <= 6 &&
    new Set(selected).size === selected.length &&
    selected.every(id => byId.has(id));
  const confirmed = validSelection && saved?.fingerprint === revision;
  const draftIds = validSelection ? selected :
    candidates.length <= 6 ? candidates.map(player => player.memberId) : [];
  return {
    matchDayId: day.id, dateLocal: day.dateLocal,
    fixtureId: fixture.id, fingerprint: revision,
    confirmed, needsSelection: candidates.length > 6 && !validSelection,
    selectedMemberIds: draftIds,
    players: draftIds.map(id => byId.get(id)),
    submittedAtMs: confirmed ? Number(saved.submittedAtMs || 0) : 0,
  };
}

function sendWindow({day, fixture, now = Date.now(), testMode = false,
  projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || ""}) {
  const opensAtMs = Date.parse(`${day.dateLocal}T00:00:00+02:00`) - 86400000;
  const closesAtMs = Date.parse(`${fixture.scheduledLocal}+02:00`);
  if (!Number.isFinite(opensAtMs) || !Number.isFinite(closesAtMs)) {
    throw new Error("The fixture needs a valid date and kickoff time.");
  }
  const testException = testMode === true &&
    projectId === "five-asides-near-me-staging" &&
    now < opensAtMs;
  return {
    opensAtMs, closesAtMs, testException,
    sendAllowed: testException || (now >= opensAtMs && now < closesAtMs),
  };
}

async function loadDay({tx, db, scope, matchDayId}) {
  if (!validId(matchDayId)) throw new Error("Choose a valid match day.");
  const context = await service.loadContext(tx, db, scope);
  if (context.season.gameFormat !== "5_V_5") {
    throw new Error("Five or six-player squads apply to five-a-side leagues.");
  }
  if (!context.season.schedulePublishedAtMs) {
    throw new Error("The Field must release its fixtures first.");
  }
  const policy = await import("./fieldSeasonAvailabilityPolicy.mjs");
  const live = await tx.get(db.doc(
    `leagueVenues/${scope.venueId}/seasons/${scope.seasonId}/matches/current`
  ));
  const {day, fixture} = policy.assertClubMatchDayEditable({
    season: context.season, clubId: scope.clubId, matchDayId,
    liveMatch: live.data() || null,
  });
  const base = await loadSeasonStartSquad({transaction: tx, db, scope});
  const availability = context.squad?.matchDayAvailability?.[matchDayId] || {};
  const replacements = context.squad?.matchDayReplacements?.[matchDayId] || {};
  const candidates = [];
  const vacancies = [];
  const seenMembers = new Set();
  const seenPlayers = new Set();

  for (const original of base?.eligible || []) {
    let player = original;
    if (availability[original.memberId]?.status === "unavailable") {
      const cover = replacements[original.memberId];
      if (cover?.invitationStatus !== "accepted") {
        vacancies.push({
          memberId: original.memberId, fullName: original.fullName,
          coverStatus: cover?.invitationStatus || "",
        });
        continue;
      }
      if (![cover.memberId, cover.sourcePlayerId].every(validId) ||
          cover.originalMemberId !== original.memberId ||
          cover.memberId === original.memberId ||
          Object.values(context.squad.entries || {}).some(entry =>
            entry.memberId === cover.memberId ||
            entry.sourcePlayerId === cover.sourcePlayerId)) {
        throw new Error("Correct the replacement player link.");
      }
      const [memberSnap, profileSnap] = await tx.getAll(
        context.clubRef.collection("members").doc(cover.memberId),
        context.clubRef.collection("players").doc(cover.sourcePlayerId)
      );
      const member = memberSnap.data();
      const profile = profileSnap.data();
      if (!member || (member.status || "active") !== "active" ||
          member.playerId !== cover.sourcePlayerId ||
          !profile || String(profile.status || "active").toLowerCase() !== "active") {
        vacancies.push({
          memberId: original.memberId, fullName: original.fullName,
          coverStatus: "invalid",
        });
        continue;
      }
      const fullName = String(profile.fullName || profile.displayName ||
        profile.name || profile.playerName || "").trim();
      if (!fullName) throw new Error("The replacement needs a registered name.");
      player = {
        memberId: cover.memberId, sourcePlayerId: cover.sourcePlayerId,
        fullName, clubId: scope.clubId,
        mentality: profile.mentality ?? null,
        shooting: profile.shooting ?? null,
        originalMemberId: original.memberId, isFillIn: true,
      };
    }
    if (seenMembers.has(player.memberId) || seenPlayers.has(player.sourcePlayerId)) {
      throw new Error("A player cannot occupy two squad places.");
    }
    seenMembers.add(player.memberId);
    seenPlayers.add(player.sourcePlayerId);
    candidates.push(player);
  }
  candidates.sort((a, b) => a.fullName.localeCompare(b.fullName));
  const submission = project({
    scope, day, fixture, candidates,
    saved: context.squad?.matchDaySubmissions?.[matchDayId],
  });
  return {...context, day, fixture, candidates, vacancies, submission};
}

async function getClubDay({db, user, body}) {
  const {venueId, seasonId, clubId, matchDayId} = body || {};
  const scope = {venueId, seasonId, clubId};
  return db.runTransaction(async tx => {
    const data = await loadDay({tx, db, scope, matchDayId});
    if (!service.canManageSquad(data.club, user)) {
      throw new Error("Only this Club's captain or administrator can confirm its squad.");
    }
    return {
      ...data.submission, candidates: data.candidates,
      vacancies: data.vacancies,
      ...sendWindow({
        day: data.day, fixture: data.fixture, testMode: body.testMode,
      }),
    };
  });
}

async function submit({db, user, body, now = Date.now()}) {
  const {venueId, seasonId, clubId, matchDayId, memberIds} = body || {};
  const scope = {venueId, seasonId, clubId};
  if (!Array.isArray(memberIds) || memberIds.length < 5 ||
      memberIds.length > 6 ||
      new Set(memberIds).size !== memberIds.length ||
      !memberIds.every(validId)) {
    throw new Error("Select five or six different players. Six is the maximum.");
  }
  return db.runTransaction(async tx => {
    const data = await loadDay({tx, db, scope, matchDayId});
    if (!service.canManageSquad(data.club, user)) {
      throw new Error("Only this Club's captain or administrator can send its squad.");
    }
    const window = sendWindow({
      day: data.day, fixture: data.fixture, now, testMode: body.testMode,
    });
    if (!window.sendAllowed) {
      throw new Error("Send Squad opens the day before the fixture and closes at kickoff.");
    }
    const eligible = new Set(data.candidates.map(player => player.memberId));
    if (!memberIds.every(id => eligible.has(id))) {
      throw new Error("A selected player is unavailable or no longer eligible. Review the matrix.");
    }
    // Field-owned copy of the captain's submitted match-day roster.
    const selectedPlayers = memberIds.map(memberId =>
      data.candidates.find(player => player.memberId === memberId)
    ).map(player => ({
      clubId,
      memberId: player.memberId,
      sourcePlayerId: player.sourcePlayerId,
      fullName: player.fullName,
      photoData: player.photoData || "",
      mentality: player.mentality ?? null,
      shooting: player.shooting ?? null,
      originalMemberId: player.originalMemberId || "",
      isFillIn: player.isFillIn === true,
    }));
    tx.set(db.doc(
      `leagueVenues/${venueId}/seasons/${seasonId}/` +
      `fieldMatchDayManifests/${matchDayId}/clubs/${clubId}`
    ), {
      version: 1,
      venueId, seasonId, clubId, matchDayId,
      fixtureId: data.fixture.id,
      dateLocal: data.day.dateLocal,
      scheduledLocal: data.fixture.scheduledLocal || "",
      name: data.club.name || data.club.shortName || clubId,
      logoUrl: data.club.branding?.logoUrl ||
        data.club.transparentLogoUrl || data.club.logoUrl || "",
      fingerprint: data.submission.fingerprint,
      selectedMemberIds: memberIds,
      players: selectedPlayers,
      confirmed: true,
      status: "confirmed",
      submittedByUid: user.uid,
      submittedAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(data.squadRef, {
      [`matchDaySubmissions.${matchDayId}`]: {
        memberIds, fingerprint: data.submission.fingerprint,
        submittedByUid: user.uid, submittedAtMs: now,
        submittedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {status: "confirmed", matchDayId};
  });
}

async function getFieldDay({db, user, body}) {
  const {venueId, seasonId, matchDayId} = body || {};
  if (![venueId, seasonId, matchDayId].every(validId)) {
    throw new Error("Choose a valid Field match day.");
  }
  return db.runTransaction(async tx => {
    const venueRef = db.doc(`leagueVenues/${venueId}`);
    const [venueSnap, staffSnap] = await tx.getAll(
      venueRef, venueRef.collection("staff").doc(user.uid)
    );
    const venue = venueSnap.data();
    const season = venue?.league?.activeSeason;
    if (season?.id !== seasonId || season.status !== "active" ||
        !season.schedulePublishedAtMs) throw new Error("This season is unavailable.");
    const day = season.matchDays?.find(item => item.id === matchDayId);
    if (!day || day.status !== "scheduled") throw new Error("Choose an upcoming match day.");
    let allowed = venue.ownerUid === user.uid ||
      venue.adminUids?.includes(user.uid) ||
      staffSnap.data()?.status === "active";
    const clubIds = season.clubIds || [];
    if (clubIds.length > 100) throw new Error("Invalid league capacity.");
    const clubs = [];
    for (const clubId of clubIds) {
      service.squadId({venueId, seasonId, clubId});
    }
    const clubSnapshots = clubIds.length
      ? await tx.getAll(...clubIds.map(clubId => db.doc(`clubs/${clubId}`)))
      : [];
    if (clubSnapshots.some(snapshot =>
      service.canManageSquad(snapshot.data(), user))) allowed = true;
    const squadSnapshots = !allowed && clubIds.length
      ? await tx.getAll(...clubIds.map(clubId => db.doc(
          `leagueSeasonSquads/${venueId}~${seasonId}~${clubId}`
        )))
      : [];
    for (const [index, clubId] of clubIds.entries()) {
      const clubSnap = clubSnapshots[index];
      const club = clubSnap.data();
      if (service.canManageSquad(club, user)) allowed = true;
      if (!allowed) {
        const squadSnap = squadSnapshots[index];
        const entries = Object.values(squadSnap.data()?.entries || {})
          .filter(entry => validId(entry.memberId) &&
            entry.invitationStatus === "accepted");
        if (entries.length > 30) throw new Error("Invalid squad capacity.");
        if (entries.length) {
          const members = await tx.getAll(...entries.map(entry =>
            db.doc(`clubs/${clubId}/members/${entry.memberId}`)));
          allowed = entries.some((entry, index) =>
            service.ownsMember(members[index].data(), user) &&
            members[index].data()?.playerId === entry.sourcePlayerId);
        }
      }
      clubs.push({
        clubId, name: club?.name || club?.shortName || clubId,
        canManageFormation: service.canManageSquad(club, user),
        logoUrl: club?.branding?.logoUrl || club?.transparentLogoUrl || club?.logoUrl || "",
      });
    }
    if (!allowed) throw new Error("Sign in as Field staff or a participating Club member.");
    const snapshots = clubs.length
      ? await tx.getAll(...clubs.map(club => db.doc(
          `leagueVenues/${venueId}/seasons/${seasonId}/` +
          `fieldMatchDayManifests/${matchDayId}/clubs/${club.clubId}`
        )))
      : [];
    const result = clubs.map((club, index) => {
      const fixtures = (season.fixtures || []).filter(fixture =>
        fixture.matchDayId === matchDayId &&
        [fixture.clubAId, fixture.clubBId].includes(club.clubId));
      if (!fixtures.length) return {...club, status: "bye", players: []};
      const manifest = snapshots[index].data();
      const fixture = fixtures.find(item => item.id === manifest?.fixtureId);
      const valid = manifest?.version === 1 &&
        manifest.venueId === venueId && manifest.seasonId === seasonId &&
        manifest.clubId === club.clubId && manifest.matchDayId === matchDayId &&
        manifest.confirmed === true && Boolean(fixture) &&
        manifest.dateLocal === day.dateLocal &&
        manifest.scheduledLocal === (fixture.scheduledLocal || "") &&
        Array.isArray(manifest.players) &&
        manifest.players.length >= 5 && manifest.players.length <= 6;
      if (!valid) return {
        ...club, confirmed: false, status: "awaiting_confirmation", players: [],
      };
      return {
        ...club,
        matchDayId, dateLocal: day.dateLocal,
        fixtureId: manifest.fixtureId,
        fingerprint: manifest.fingerprint,
        selectedMemberIds: manifest.selectedMemberIds,
        players: manifest.players,
        submittedAtMs: manifest.submittedAtMs,
        confirmed: true, status: "confirmed",
        candidateCount: manifest.players.length, vacancies: 0,
      };
    });
    return {matchDayId, dateLocal: day.dateLocal, clubs: result};
  });
}

exports.project = project;
exports.sendWindow = sendWindow;
exports.loadDay = loadDay;
exports.submit = submit;
exports.getClubDay = getClubDay;
exports.getFieldDay = getFieldDay;
