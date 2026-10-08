const {randomUUID} = require("node:crypto");
const {Timestamp} = require("firebase-admin/firestore");
const {loadPracticeClubCopies} = require("./fieldPracticeSessionService");

function validId(value) {
  return typeof value === "string" && value.length > 0 &&
    value !== "." && value !== ".." && !value.includes("/");
}

function validateSession(session, user, venueId, sessionId, now) {
  if (session?.kind !== "venueLeague" ||
      session.environment !== "practice" ||
      session.venueId !== venueId || session.sessionId !== sessionId ||
      session.userId !== user?.uid || session.status !== "active" ||
      typeof session.expiresAt?.toMillis !== "function" ||
      session.expiresAt.toMillis() <= now) {
    throw new Error("This Field Practice session is unavailable or expired.");
  }
}

function seasonSettings(settings) {
  const name = String(settings?.name || "").trim();
  const startsOn = String(settings?.startsOn || "");
  const parsed = new Date(`${startsOn}T12:00:00Z`);
  if (!name || name.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== startsOn) {
    throw new Error("Enter a valid season name and start date.");
  }
  const money = value => {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number) || number < 0 || number > 100000000) {
      throw new Error("Enter valid entry fee and prize amounts.");
    }
    return Math.round(number * 100) / 100;
  };
  const podium = value => Object.fromEntries(
    ["first", "second", "third"].map(key => [key, money(value?.[key])])
  );
  const prizes = podium(settings.prizes);
  const startTime = settings.startTime || "18:00";
  const matchMinutes = Number(settings.matchMinutes ?? 40);
  const halftimeMinutes = Number(settings.halftimeMinutes ?? 5);
  const turnaroundMinutes = Number(settings.turnaroundMinutes ?? 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !Number.isInteger(matchMinutes) || matchMinutes < 2 ||
      matchMinutes > 180 ||
      !Number.isInteger(halftimeMinutes) || halftimeMinutes < 0 ||
      halftimeMinutes > 30 ||
      !Number.isInteger(turnaroundMinutes) || turnaroundMinutes < 0 ||
      turnaroundMinutes > 30) {
    throw new Error("Enter valid match times.");
  }
  return {
    name, startsOn, entryFee: money(settings.entryFee),
    prizes, prizeMoney: prizes.first + prizes.second + prizes.third,
    prizeIncreasePerClub: podium(settings.prizeIncreasePerClub),
    minimumClubs: Number(settings.minimumClubs) || 3,
    signupClosesOn: settings.signupClosesOn || "",
    gameFormat: settings.gameFormat || "5_V_5",
    currency: "ZAR", scheduleVersion: 1,
    scheduleSettings: {
      startTime, matchMinutes, halftimeMinutes, turnaroundMinutes,
      intervalDays: 7,
    },
    matchSeconds: matchMinutes * 60,
  };
}

async function announce({
  db, user, venueId, sessionId, settings, now = Date.now(),
  loadCopies = loadPracticeClubCopies,
}) {
  if (!validId(venueId) || !validId(sessionId)) {
    throw new Error("Choose a valid Field Practice session.");
  }
  const config = seasonSettings(settings);
  const sessionRef = db.doc(`practiceSessions/${sessionId}`);
  validateSession((await sessionRef.get()).data(),
    user, venueId, sessionId, now);

  const clubs = await loadCopies({db, venueId});
  if (!clubs.length) throw new Error("No active member Clubs are available.");
  if (clubs.length > 6 || clubs.some(c => c.players.length > 6)) {
    throw new Error("Practice supports six Clubs with six players each.");
  }

  const root = `sandboxes/practice/leagueVenues/${venueId}/sessions/${sessionId}`;
  const rootRef = db.doc(root);
  const newSeasonId = randomUUID();
  const at = Timestamp.fromMillis(now);

  return db.runTransaction(async tx => {
    const [sessionSnap, rootSnap] = await Promise.all([
      tx.get(sessionRef), tx.get(rootRef),
    ]);
    validateSession(sessionSnap.data(), user, venueId, sessionId, now);
    if (!rootSnap.exists ||
        rootSnap.data().environment !== "practice" ||
        rootSnap.data().practiceSessionId !== sessionId) {
      throw new Error("This Field Practice workspace is unavailable.");
    }
    const draft = rootSnap.data().league?.activeSeason || null;
    if (draft && (
      !validId(draft.id) ||
      draft.announcedAtMs ||
      Object.keys(draft.invitations || {}).length ||
      (draft.clubIds || []).length ||
      (draft.fixtures || []).length ||
      (draft.matchDays || []).length ||
      (draft.results || []).length ||
      (draft.allEvents || []).length ||
      (draft.matchDayHistory || []).length ||
      Object.keys(draft.liveMatches || {}).length ||
      Object.keys(draft.savedLineups || {}).length
    )) {
      throw new Error("Close the current Practice season before inviting Clubs again.");
    }
    const seasonId = draft?.id || newSeasonId;

    const invitations = Object.fromEntries(clubs.map(club => [
      club.clubId, {
        clubId: club.clubId, clubName: club.name,
        status: "accepted", invitedByUid: user.uid,
        invitedAt: at, respondedAt: at,
        responseSource: "simulated-practice-captain",
      },
    ]));
    const season = {
      ...config, id: seasonId, status: "active",
      ...(draft?.previousSeasonId
        ? {previousSeasonId: draft.previousSeasonId} : {}),
      registrationOpen: true, announcedAtMs: now,
      announcedByUid: user.uid, environment: "practice",
      practiceSessionId: sessionId,
      clubIds: clubs.map(c => c.clubId), invitations,
      fixtures: [], matchDays: [], results: [], allEvents: [],
      liveMatches: {}, savedLineups: {}, matchDayHistory: [],
      allowEarlyStarts: true,
    };
    tx.update(rootRef, {"league.activeSeason": season});
    tx.set(db.doc(`${root}/seasons/${seasonId}`), season);
    for (const club of clubs) {
      tx.set(db.doc(`${root}/clubs/${club.clubId}`), club);
    }
    return {seasonId, invited: clubs.length, accepted: clubs.length};
  });
}

module.exports = {announce, validateSession, seasonSettings};
