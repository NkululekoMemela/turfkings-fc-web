const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {FieldValue} = require("firebase-admin/firestore");
const {randomUUID} = require("node:crypto");

const labels = {
  reschedule_day: "Change a match-day date and kickoff times",
  delay_remaining: "Delay remaining games",
  cancel_season: "Cancel the season",
  delete_day_results: "Delete match-day results",
};

function buildHandlers({db, region, sendBatch, testOnly = false}) {
  async function notifyManager(venueId, requestId) {
    const venueRef = db.collection("leagueVenues").doc(venueId);
    const requestRef = venueRef.collection("decisionRequests").doc(requestId);
    const claimId = randomUUID();
    const now = Date.now();

    const claimed = await db.runTransaction(async tx => {
      const venueSnap = await tx.get(venueRef);
      const requestSnap = await tx.get(requestRef);
      const venue = venueSnap.data();
      const request = requestSnap.data();
      if (!venue || !request ||
          request.status !== "pending" ||
          request.expiresAtMs <= now ||
          venue.ownerUid !== request.managerUid ||
          venue.league?.activeSeason?.id !== request.seasonId ||
          venue.league?.activeSeason?.status !== "active" ||
          request.managerPush?.status === "sent" ||
          request.managerPush?.status === "no_devices") return null;

      if ((request.managerPush?.leaseUntilMs || 0) > now) {
        throw new Error("Manager notification delivery is already in progress.");
      }
      tx.update(requestRef, {
        managerPush: {
          status: "sending", claimId, leaseUntilMs: now + 300000,
          attemptedAtMs: now,
        },
      });
      return {venue, request};
    });
    if (!claimed) return {status: "skipped"};

    try {
      const devices = await db.collectionGroup("notificationDevices")
        .where("firebaseUid", "==", claimed.venue.ownerUid).get();
      const seen = new Set();
      const tokenRecords = [];
      for (const device of devices.docs) {
        const data = device.data();
        if (data.enabled !== true || !data.token ||
            data.firebaseUid !== claimed.venue.ownerUid ||
            seen.has(data.token)) continue;
        seen.add(data.token);
        tokenRecords.push({token: data.token, ref: device.ref});
      }

      // Recheck after token lookup: a reviewed or stale request needs no push.
      const eligible = await db.runTransaction(async tx => {
        const venueSnap = await tx.get(venueRef);
        const requestSnap = await tx.get(requestRef);
        const venue = venueSnap.data();
        const request = requestSnap.data();
        const valid = request?.managerPush?.claimId === claimId &&
          request.status === "pending" &&
          request.expiresAtMs > Date.now() &&
          venue?.ownerUid === claimed.venue.ownerUid &&
          venue.league?.activeSeason?.id === request.seasonId &&
          venue.league?.activeSeason?.status === "active";
        if (!valid && request?.managerPush?.claimId === claimId) {
          tx.update(requestRef, {
            "managerPush.status": "skipped",
            "managerPush.leaseUntilMs": 0,
          });
        }
        return valid;
      });
      if (!eligible) return {status: "skipped"};

      let successCount = 0;
      let failureCount = 0;
      if (tokenRecords.length) {
        const request = claimed.request;
        const logo = String(
          claimed.venue.branding?.logoUrl || claimed.venue.logoUrl || ""
        );
        const result = await sendBatch({
          tokenRecords,
          title: "Manager approval required",
          body: `${claimed.venue.name || "Your Field"}: ` +
            `${labels[request.decision?.action] || "Review a Field decision"}. ` +
            String(request.decision?.reason || "").slice(0, 160),
          imageUrl: logo,
          data: {
            type: "field_manager_approval", route: "field",
            venueId, requestId, seasonId: String(request.seasonId),
            fieldName: String(claimed.venue.name || "Your Field"),
            fieldLogoUrl: logo,
          },
        });
        successCount = result.successCount;
        failureCount = result.failureCount;
        if (!successCount) {
          throw new Error("No manager notifications were delivered.");
        }
      }

      const status = tokenRecords.length ? "sent" : "no_devices";
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(requestRef);
        if (snapshot.data()?.managerPush?.claimId !== claimId) return;
        tx.update(requestRef, {
          managerPush: {
            status, claimId, leaseUntilMs: 0,
            completedAt: FieldValue.serverTimestamp(),
            deviceCount: tokenRecords.length, successCount, failureCount,
          },
        });
      });
      return {status, deviceCount: tokenRecords.length};
    } catch (error) {
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(requestRef);
        if (snapshot.data()?.managerPush?.claimId !== claimId) return;
        tx.update(requestRef, {
          "managerPush.status": "failed",
          "managerPush.leaseUntilMs": 0,
          "managerPush.error": String(error.message || error).slice(0, 300),
        });
      });
      throw error;
    }
  }

  if (testOnly) return {notifyManager};
  return {
    fieldDecisionRequestCreated: onDocumentCreated({
      document: "leagueVenues/{venueId}/decisionRequests/{requestId}",
      region, retry: true,
    }, event => notifyManager(event.params.venueId, event.params.requestId)),
  };
}
exports.buildHandlers = buildHandlers;
