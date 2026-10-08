const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {randomUUID} = require("node:crypto");

exports.approvalHandler = async (req, res, dependencies = {}) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Use POST."});
    }
    try {
      const bearer = String(req.headers.authorization || "")
        .match(/^Bearer (.+)$/);
      if (!bearer) return res.status(401).json({error: "Sign in first."});
      const verifyToken = dependencies.verifyToken ||
        ((token, revoked) => admin.auth().verifyIdToken(token, revoked));
      const user = await verifyToken(bearer[1], true);
      const {venueId, seasonId, fixtureId} = req.body || {};
      if ([venueId, seasonId, fixtureId].some(value =>
        typeof value !== "string" ||
        !/^[A-Za-z0-9_-]{1,150}$/.test(value))) {
        return res.status(400).json({error: "Invalid match reference."});
      }

      const db = dependencies.db || getFirestore();
      const venueRef = db.doc(`leagueVenues/${venueId}`);
      const approvalId = randomUUID();
      const approvalRef = venueRef.collection("seasons").doc(seasonId)
        .collection("startApprovals").doc(approvalId);

      await db.runTransaction(async transaction => {
        const venueSnap = await transaction.get(venueRef);
        const staffSnap = await transaction.get(
          venueRef.collection("staff").doc(user.uid)
        );
        if (!venueSnap.exists) throw new Error("Field no longer exists.");
        const venue = venueSnap.data();
        const staff = staffSnap.data();
        if (venue.ownerUid !== user.uid &&
            !(staff?.status === "active" &&
              (staff.isAdministrator === true || staff.role === "referee"))) {
          throw new Error("Only an approved Field official can start a match.");
        }

        const season = venue.league?.activeSeason;
        const fixture = (season?.fixtures || [])
          .find(item => item.id === fixtureId);
        const day = (season?.matchDays || [])
          .find(item => item.id === fixture?.matchDayId);
        if (season?.id !== seasonId || season.status !== "active" ||
            season.scheduleVersion !== 1 ||
            fixture?.status !== "scheduled" ||
            day?.status !== "scheduled" ||
            !day.fixtureIds?.includes(fixtureId) ||
            season.liveMatches?.[fixtureId] ||
            Object.values(season.liveMatches || {})
              .some(item => item.status === "live")) {
          throw new Error("This fixture is unavailable.");
        }
        const {assertFieldMatchDayProgression} =
          await import("./fieldMatchDayProgression.mjs");
        assertFieldMatchDayProgression({season, matchDayId: day.id});
        const opensAtMs = Date.parse(`${day.dateLocal}T00:00:00+02:00`);
        if (!Number.isFinite(opensAtMs) ||
            (season.allowEarlyStarts !== true && Date.now() < opensAtMs)) {
          throw new Error("This match day has not opened.");
        }
        const minimum = {
          "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11,
        }[season.gameFormat];
        if (!minimum) throw new Error("Unsupported game format.");

        for (const clubId of [fixture.clubAId, fixture.clubBId]) {
          if (season.invitations?.[clubId]?.status !== "accepted") {
            throw new Error("Both Clubs must accept the league invitation before playing.");
          }
        }

        const {loadFieldMatchRoster} = require("./fieldMatchRoster.js");
        const {squads, bookingVersions, squadVersions, squadFingerprints} =
          await loadFieldMatchRoster({
            transaction, db, venueId, season, fixture,
          });
        const {startingLineups, sourceFormations} =
          await require("./fieldStartingFormation").build({
            season, fixture, squads, squadFingerprints,
          });
        transaction.set(approvalRef, {
          venueId, seasonId, fixtureId, matchDayId: day.id,
          actorUid: user.uid, gameFormat: season.gameFormat,
          clubAId: fixture.clubAId, clubBId: fixture.clubBId,
          bookingVersions, squadVersions, squads, used: false,
          startingLineups, sourceFormations,
          matchDayHistory: season.matchDayHistory || [],
          matchDays: season.matchDays || [],
          expiresAt: Timestamp.fromMillis(Date.now() + 60000),
        });
      });
      return res.json({approvalId});
    } catch (error) {
      console.error("[Field match approval]", error.message);
      return res.status(400).json({
        error: error.message || "Match approval failed.",
      });
    }
};
exports.approveFieldMatchStart = onRequest(
  {region: "us-central1", invoker: "public", cors: true},
  (req, res) => exports.approvalHandler(req, res)
);

exports.getFieldFixtureRoster = onRequest(
  {region: "us-central1", invoker: "public", cors: true},
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({error: "Use POST."});
    try {
      const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
      if (!bearer) return res.status(401).json({error: "Sign in first."});
      await admin.auth().verifyIdToken(bearer[1], true);
      const {venueId, seasonId, fixtureId} = req.body || {};
      if ([venueId, seasonId, fixtureId].some(value =>
        typeof value !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(value))) {
        throw new Error("Invalid fixture reference.");
      }
      const db = getFirestore();
      const squads = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(db.doc(`leagueVenues/${venueId}`));
        const season = snapshot.data()?.league?.activeSeason;
        const fixture = season?.fixtures?.find(item => item.id === fixtureId);
        if (season?.id !== seasonId || season.status !== "active" ||
            !fixture?.matchDayId) throw new Error("This fixture is unavailable.");
        const {loadFieldMatchRoster} = require("./fieldMatchRoster.js");
        const result = await loadFieldMatchRoster({
          transaction, db, venueId, season, fixture, requireMinimum: false,
        });
        return result.squads;
      });
      // Only lineup identities are returned; contributions and receipts stay private.
      return res.json({squads});
    } catch (error) {
      return res.status(400).json({error: error.message || "Could not load the lineup."});
    }
  }
);
