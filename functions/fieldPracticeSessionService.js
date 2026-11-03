const {randomUUID} = require("node:crypto");
const {Timestamp} = require("firebase-admin/firestore");

function validId(value) {
  return typeof value === "string" &&
    value.trim() === value && value.length > 0 &&
    value !== "." && value !== ".." && !value.includes("/");
}

function canPractice(venue, staff, user) {
  return Boolean(user?.uid && !user.cameraSession && (
    venue.ownerUid === user.uid ||
    (staff?.status === "active" && (
      staff.isAdministrator === true || ["field_manager","assistant_manager","field_assistant","other_staff","referee"].includes(staff.role)
    ))
  ));
}

function cleanSeason(source, now) {
  return {
    id: source.id,
    name: source.name || "Practice League",
    status: "active",
    gameFormat: source.gameFormat || "5_V_5",
    leagueMode: source.leagueMode || "venue_league",
    matchMode: source.matchMode || "fixtured",
    matchSeconds: source.matchSeconds || 3600,
    scheduleVersion: source.scheduleVersion || 1,
    clubIds: [...(source.clubIds || [])],
    invitations: source.invitations || {},
    fixtures: (source.fixtures || []).map(f => ({
      id: f.id,
      clubAId: f.clubAId,
      clubBId: f.clubBId,
      matchDayId: f.matchDayId,
      scheduledLocal: f.scheduledLocal || "",
      status: "scheduled",
    })),
    matchDays: (source.matchDays || []).map(day => ({
      id: day.id,
      dateLocal: day.dateLocal,
      fixtureIds: [...(day.fixtureIds || [])],
      opensAtMs: now,
      status: "scheduled",
    })),
    allowEarlyStarts: true,
    savedLineups: {},
    liveMatches: {},
    results: [],
    allEvents: [],
    matchDayHistory: [],
    streaks: {},
  };
}

// Prefer the Field's own Clubs, then public football data from other Clubs.
// All resulting records are session-local copies; no private player data is read.
async function loadPracticeClubCopies({db, venueId, minimumClubs = 3}) {
  return require("./fieldPracticeClubPool.cjs").loadPublicPracticeClubs({db,venueId,minimumClubs});
}

async function start({db, user, venueId, now = Date.now()}) {
  if (!validId(venueId) || !user?.uid) {
    throw new Error("Sign in and choose a Field.");
  }
  const [venueSnap, staffSnap] = await Promise.all([
    db.doc(`leagueVenues/${venueId}`).get(),
    db.doc(`leagueVenues/${venueId}/staff/${user.uid}`).get(),
  ]);
  if (!venueSnap.exists) throw new Error("Field not found.");
  const venue = venueSnap.data();
  if (!canPractice(venue, staffSnap.data(), user)) {
    throw new Error("Only an authorized Field official can start Practice.");
  }

  const sessionId = randomUUID();
  const root = `sandboxes/practice/leagueVenues/${venueId}/sessions/${sessionId}`;
  const startedAt = Timestamp.fromMillis(now);
  const expiresAt = Timestamp.fromMillis(now + 15 * 60 * 1000);
  const batch = db.batch();

  batch.set(db.doc(`practiceSessions/${sessionId}`), {
    kind: "venueLeague", environment: "practice",
    venueId, sessionId, userId: user.uid,
    status: "active", startedAt, expiresAt,
    durationSeconds: 900, unlimitedPractice: true,
  });
  batch.set(db.doc(root), {
    venueId,
    name: venue.name || "Field",
    branding: venue.branding || {},
    logoUrl: venue.logoUrl || "",
    league: {activeSeason: null},
    practiceClubLimit: 6,
    environment: "practice",
    practiceSessionId: sessionId,
  });
  await batch.commit();
  return {
    venueId, sessionId, seasonId: "",
    startedAt: startedAt.toDate().toISOString(),
    expiresAt: expiresAt.toDate().toISOString(),
    durationSeconds: 900,
  };
}

module.exports = {start, cleanSeason, canPractice, loadPracticeClubCopies};
