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
      staff.isAdministrator === true || staff.role === "referee"
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

// Called when a Practice invitation is announced, not on session entry.
async function loadPracticeClubCopies({db, venueId}) {
  if (!validId(venueId)) throw new Error("Choose a valid Field.");
  const memberships = await db.collection("clubFieldMemberships")
    .where("venueId", "==", venueId).get();

  const eligible = memberships.docs
    .filter(doc => doc.data().status === "active")
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 6);

  const copies = await Promise.all(eligible.map(async membership => {
    const clubId = membership.id;
    const [clubSnap, playersSnap] = await Promise.all([
      db.doc(`clubs/${clubId}`).get(),
      db.collection(`clubs/${clubId}/players`).get(),
    ]);
    const club = clubSnap.data() || {};
    if (!clubSnap.exists) return null;

    const players = playersSnap.docs
      .filter(doc =>
        String(doc.data().status || "active").toLowerCase() === "active"
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(doc => {
        const p = doc.data();
        const fullName = String(
          p.fullName || p.name || p.displayName || p.playerName || ""
        ).trim();
        return {
          sourcePlayerId: doc.id,
          memberId: String(p.memberId || doc.id),
          fullName,
          shortName: String(p.shortName || fullName.split(" ")[0]),
          mentality: p.mentality ?? null,
          shooting: p.shooting ?? null,
          photoData: p.photoData || p.photoUrl || p.photoURL || p.avatarUrl || "",
          status: "active",
        };
      })
      .filter(p => p.fullName)
      .slice(0, 6);

    return {
      clubId,
      name: club.name || clubId,
      // Preserve the same identity inputs used by Official's buildClubIdentity.
      logoUrl: club.logoUrl || "",
      branding: {
        uploadedLogoUrl: club.branding?.uploadedLogoUrl || "",
        transparentLogoUrl: club.branding?.transparentLogoUrl || "",
      },
      media: {
        logoOriginalUrl: club.media?.logoOriginalUrl || "",
        logoTransparentUrl: club.media?.logoTransparentUrl || "",
      },
      logo: club.logo || club.branding?.logoUrl || "",
      logoPath: club.logoPath || "",
      badgeUrl: club.badgeUrl || club.badge || "",
      image: club.image || "",
      environment: "practice",
      simulated: true,
      players,
    };
  }));
  return copies.filter(Boolean);
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
