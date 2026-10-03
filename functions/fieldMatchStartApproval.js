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

        const bookingVersions = {};
        const squads = {};
        for (const clubId of [fixture.clubAId, fixture.clubBId]) {
          const scope = {venueId, seasonId, matchDayId: day.id, clubId};
          const bookingId = [
            venueId, seasonId, day.id, clubId,
          ].join("~");
          const bookingSnap = await transaction.get(
            db.doc(`leagueClubBookings/${bookingId}`)
          );
          const booking = bookingSnap.data();
          if (!booking ||
              Object.keys(scope).some(key => booking[key] !== scope[key]) ||
              !booking.updatedAt) {
            throw new Error("Configure and confirm each Club's league bookings.");
          }
          const seen = new Set();
          const eligible = [];
          const entries = Object.values(booking.entries || {});
          if (entries.length > 30) throw new Error("Invalid squad capacity.");
          for (const entry of entries) {
            if (entry?.paymentStatus !== "paid" ||
                typeof entry.sourcePlayerId !== "string" ||
                !entry.sourcePlayerId || entry.sourcePlayerId.includes("/") ||
                !entry.playerId || !entry.fullName ||
                seen.has(entry.sourcePlayerId)) continue;
            seen.add(entry.sourcePlayerId);
            const profile = await transaction.get(
              db.doc(`clubs/${clubId}/players/${entry.sourcePlayerId}`)
            );
            if (profile.exists &&
                String(profile.data().status || "active")
                  .toLowerCase() === "active") {
              eligible.push({
                playerId: entry.playerId,
                sourcePlayerId: entry.sourcePlayerId,
                fullName: entry.fullName,
                clubId,
              });
            }
          }
          if (eligible.length < minimum) {
            throw new Error(
              `${clubId} needs ${minimum} active paid players; ` +
              `${eligible.length} are eligible.`
            );
          }
          bookingVersions[clubId] = booking.updatedAt;
          squads[clubId] = eligible;
        }
        transaction.set(approvalRef, {
          venueId, seasonId, fixtureId, matchDayId: day.id,
          actorUid: user.uid, gameFormat: season.gameFormat,
          clubAId: fixture.clubAId, clubBId: fixture.clubBId,
          bookingVersions, squads, used: false,
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
