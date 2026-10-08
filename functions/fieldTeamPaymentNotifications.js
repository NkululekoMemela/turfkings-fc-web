const {randomUUID} = require("node:crypto");

async function notifyManager({db, sendBatch, venueId, requestId}) {
  const venueRef = db.doc(`leagueVenues/${venueId}`);
  const requestRef = db.doc(
    `leagueVenues/${venueId}/bankingRequests/${requestId}`
  );
  const claimId = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const [venueSnap, requestSnap] = await tx.getAll(venueRef, requestRef);
    const venue = venueSnap.data();
    const request = requestSnap.data();
    if (!venue || !request || request.status !== "pending" ||
        venue.ownerUid !== request.managerUid ||
        ["sent", "no_devices"].includes(request.managerPush?.status)) {
      return null;
    }
    if (request.managerPush?.leaseUntilMs > Date.now()) {
      throw new Error("Notification delivery is already in progress.");
    }
    tx.update(requestRef, {
      managerPush: {
        status: "sending", claimId, leaseUntilMs: Date.now() + 300000,
      },
    });
    return {venue, request};
  });
  if (!claimed) return {status: "skipped"};

  async function finish(status) {
    await db.runTransaction(async tx => {
      const snap = await tx.get(requestRef);
      if (snap.data()?.managerPush?.claimId === claimId) {
        tx.update(requestRef, {
          managerPush: {
            status, claimId, leaseUntilMs: 0, completedAtMs: Date.now(),
          },
        });
      }
    });
    return {status};
  }

  try {
    const devices = await db.collectionGroup("notificationDevices")
      .where("firebaseUid", "==", claimed.venue.ownerUid).get();
    const seen = new Set();
    const tokenRecords = devices.docs.filter(device => {
      const data = device.data();
      if (data.enabled !== true ||
          data.firebaseUid !== claimed.venue.ownerUid ||
          typeof data.token !== "string" || !data.token ||
          seen.has(data.token)) return false;
      seen.add(data.token);
      return true;
    }).map(device => ({token: device.data().token, ref: device.ref}));

    const eligible = await db.runTransaction(async tx => {
      const [venueSnap, requestSnap] = await tx.getAll(venueRef, requestRef);
      const current = requestSnap.data();
      return current?.managerPush?.claimId === claimId &&
        current.status === "pending" &&
        current.submittedAtMs === claimed.request.submittedAtMs &&
        venueSnap.data()?.ownerUid === claimed.venue.ownerUid;
    });
    if (!eligible) return await finish("skipped");
    if (!tokenRecords.length) return await finish("no_devices");

    const result = await sendBatch({
      tokenRecords,
      title: "Authorize Field banking activation",
      body: `${claimed.request.submittedByName} has requested banking payment activation via 5 Asides Near Me for ${claimed.venue.name || "your Field"}. Authorize.`,
      imageUrl: String(
        claimed.venue.branding?.logoUrl || claimed.venue.logoUrl || ""
      ),
      data: {
        type: "field_manager_approval", route: "field",
        venueId, requestId, approvalKind: "banking_activation",
        fieldName: String(claimed.venue.name || "Your Field"),
      },
    });
    if (!result.successCount) {
      throw new Error("Manager notification could not be delivered.");
    }
    return await finish("sent");
  } catch (error) {
    await finish("failed");
    throw error;
  }
}

module.exports = {notifyManager};
