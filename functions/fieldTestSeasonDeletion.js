const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {randomUUID} = require("node:crypto");

const allowedCollections = new Set([
  "matches", "startApprovals", "matchDayReviews", "cameraRequests",
  "chatParticipants", "chatMessages",
]);
const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);

async function checkCollections(seasonRef) {
  const collections = await seasonRef.listCollections();
  if (collections.some(collection => !allowedCollections.has(collection.id))) {
    throw new Error(
      "This season contains additional records. Deletion requires a separate review."
    );
  }
  return collections;
}

async function requestDeletion({db, actorUid, body}) {
  const {venueId, seasonId, confirmation, confirmedTest} = body || {};
  if (!validId(venueId) || !validId(seasonId)) {
    throw new Error("Invalid Field or season reference.");
  }
  const venueRef = db.doc(`leagueVenues/${venueId}`);
  const seasonRef = venueRef.collection("seasons").doc(seasonId);
  const jobRef = venueRef.collection("seasonDeletionJobs").doc(seasonId);
  const nextId = `season-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const {assertTestSeasonDeletion} =
    await import("./fieldTestSeasonDeletionPolicy.mjs");

  // Authorize before inspecting the season's nested collections.
  const preliminary = await venueRef.get();
  if (preliminary.data()?.ownerUid !== actorUid) {
    throw new Error("Only the Field creator can delete a test season.");
  }
  await checkCollections(seasonRef);

  return db.runTransaction(async transaction => {
    const venueSnap = await transaction.get(venueRef);
    const jobSnap = await transaction.get(jobRef);
    if (!venueSnap.exists || venueSnap.data().ownerUid !== actorUid) {
      throw new Error("Only the Field creator can delete a test season.");
    }
    if (jobSnap.exists) {
      if (jobSnap.data().requestedByUid !== actorUid) {
        throw new Error("This deletion belongs to another account.");
      }
      return {
        jobId: seasonId, nextSeasonId: jobSnap.data().nextSeasonId,
        status: jobSnap.data().status,
      };
    }
    const archiveSnap = await transaction.get(seasonRef);
    const liveSnap = await transaction.get(
      seasonRef.collection("matches").doc("current")
    );
    const bookingSnaps = await transaction.get(
      db.collection("leagueClubBookings").where("seasonId", "==", seasonId)
    );
    const bookings = bookingSnaps.docs
      .filter(snapshot => snapshot.data().venueId === venueId);
    const squadSnaps = await transaction.get(
      db.collection("leagueSeasonSquads").where("seasonId", "==", seasonId)
    );
    const seasonSquads = squadSnaps.docs.filter(
      snapshot => snapshot.data().venueId === venueId
    );
    for (const snapshot of seasonSquads) {
      const receipts = await transaction.get(
        snapshot.ref.collection("paymentConfirmations").limit(1)
      );
      if (!receipts.empty || Object.values(snapshot.data().entries || {})
        .some(entry => entry?.paymentStatus === "paid" ||
          Number(entry?.paidCents || 0) > 0)) {
        throw new Error(
          "This season has confirmed squad payments. Preserve these payment records."
        );
      }
    }
    const venue = {...venueSnap.data(), id: venueId};
    const season = assertTestSeasonDeletion({
      venue, actorUid, seasonId, confirmation, confirmedTest,
      liveMatch: liveSnap.data(),
      bookings: bookings.map(snapshot => snapshot.data()),
    });
    if (archiveSnap.exists) {
      throw new Error("This season already has an archive. Use the archive removal flow.");
    }
    const now = Date.now();
    const nextSeason = {
      id: nextId, name: "Field League Season", status: "active",
      createdAtMs: now,
      startsOn: new Date(now + 7200000).toISOString().slice(0, 10),
      scheduleVersion: 1,
      scheduleSettings: {
        startTime: "18:00", matchMinutes: 40,
        halftimeMinutes: 5, turnaroundMinutes: 5, intervalDays: 7,
      },
      matchDays: [], clubIds: [], invitations: {}, fixtures: [],
      liveMatches: {}, results: [], allEvents: [], matchDayHistory: [],
      savedLineups: {}, currentMatchNo: 1,
      gameFormat: season.gameFormat || "5_V_5",
      matchSeconds: 2400, registrationOpen: false, allowEarlyStarts: false,
    };
    transaction.update(venueRef, {
      "league.activeSeason": nextSeason,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(jobRef, {
      venueId, seasonId, nextSeasonId: nextId,
      requestedByUid: actorUid, requestedAtMs: now,
      status: "pending",
      bookingIds: bookings.map(snapshot => snapshot.id),
      seasonSquadIds: seasonSquads.map(snapshot => snapshot.id),
      summary: {
        seasonName: String(season.name || season.id),
        fixtures: (season.fixtures || []).length,
        results: (season.results || []).length,
        matchDays: (season.matchDayHistory || []).length,
        bookingDocuments: bookings.length,
        seasonSquadDocuments: seasonSquads.length,
      },
    });
    transaction.set(venueRef.collection("actionLog").doc(), {
      seasonId, action: "test_season_deletion_requested",
      label: "Test season deletion requested",
      details: `${String(season.name || season.id)}; creator UID: ${actorUid}`,
      actorUid, at: FieldValue.serverTimestamp(),
    });
    return {jobId: seasonId, nextSeasonId: nextId, status: "pending"};
  });
}

async function cleanDeletion({db, venueId, seasonId}) {
  if (!validId(venueId) || !validId(seasonId)) {
    throw new Error("Invalid deletion job reference.");
  }
  const venueRef = db.doc(`leagueVenues/${venueId}`);
  const jobRef = venueRef.collection("seasonDeletionJobs").doc(seasonId);
  const [venueSnap, jobSnap] = await Promise.all([
    venueRef.get(), jobRef.get(),
  ]);
  const job = jobSnap.data();
  if (!job || job.status === "completed") return;
  if (job.venueId !== venueId || job.seasonId !== seasonId ||
      venueSnap.data()?.league?.activeSeason?.id === seasonId) {
    throw new Error("Deletion job does not refer to a retired test season.");
  }
  const seasonRef = venueRef.collection("seasons").doc(seasonId);
  for (const squadId of job.seasonSquadIds || []) {
    if (typeof squadId !== "string" || squadId.includes("/")) {
      throw new Error("Invalid season squad deletion reference.");
    }
    const squadRef = db.collection("leagueSeasonSquads").doc(squadId);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(squadRef);
      const receipts = await transaction.get(
        squadRef.collection("paymentConfirmations").limit(1)
      );
      if (!receipts.empty) {
        throw new Error("Season payment receipts cannot be removed.");
      }
      if (!snapshot.exists) return;
      const squad = snapshot.data();
      if (squad.venueId !== venueId || squad.seasonId !== seasonId ||
          Object.values(squad.entries || {}).some(entry =>
            entry?.paymentStatus === "paid" || Number(entry?.paidCents || 0) > 0)) {
        throw new Error("A season squad cannot be safely removed.");
      }
      transaction.delete(squadRef);
    });
    // The season is retired; squad service operations reject further changes.
    await db.recursiveDelete(squadRef);
  }
  const collections = await checkCollections(seasonRef);
  for (const collection of collections) {
    await db.recursiveDelete(collection);
  }
  for (const bookingId of job.bookingIds || []) {
    if (typeof bookingId !== "string" || bookingId.includes("/")) {
      throw new Error("Invalid booking deletion reference.");
    }
    const ref = db.collection("leagueClubBookings").doc(bookingId);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const booking = snapshot.data();
      if (booking.venueId !== venueId || booking.seasonId !== seasonId ||
          Object.values(booking.entries || {}).some(
            entry => entry?.paymentStatus === "paid"
          )) {
        throw new Error("A booking cannot be safely removed.");
      }
      transaction.delete(ref);
    });
  }
  await seasonRef.delete();
  await jobRef.update({
    status: "completed", completedAtMs: Date.now(),
  });
}

exports.requestDeletion = requestDeletion;
exports.cleanDeletion = cleanDeletion;

exports.deleteFieldTestSeason = onRequest(
  {region: "us-central1", invoker: "public", cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Use POST."});
    }
    const bearer = String(req.headers.authorization || "")
      .match(/^Bearer (.+)$/);
    if (!bearer) return res.status(401).json({error: "Sign in first."});
    let user;
    try {
      user = await admin.auth().verifyIdToken(bearer[1], true);
    } catch {
      return res.status(401).json({error: "Sign in again before deleting."});
    }
    try {
      const result = await requestDeletion({
        db: getFirestore(), actorUid: user.uid, body: req.body,
      });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({error: error.message});
    }
  }
);

exports.fieldTestSeasonDeletionCreated = onDocumentCreated({
  document: "leagueVenues/{venueId}/seasonDeletionJobs/{seasonId}",
  region: "us-central1", retry: true, timeoutSeconds: 540,
}, event => cleanDeletion({
  db: getFirestore(), venueId: event.params.venueId,
  seasonId: event.params.seasonId,
}));
