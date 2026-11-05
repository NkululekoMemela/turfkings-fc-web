const {FieldValue} = require("firebase-admin/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getAuth} = require("firebase-admin/auth");

async function processSquad({db, ref, now = Date.now()}) {
  const policy = await import("./fieldSeasonSquadPolicy.mjs");
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const squad = snap.data();
    if (squad?.version !== 1 || squad.status !== "active") return;
    const [clubSnap, venueSnap] = await tx.getAll(
      db.doc(`clubs/${squad.clubId}`), db.doc(`leagueVenues/${squad.venueId}`)
    );
    const club = clubSnap.data();
    const season = venueSnap.data()?.league?.activeSeason;
    if (!club || club.status === "deleted" || club.deleted ||
        club.clubType === "company" || season?.id !== squad.seasonId ||
        season.status !== "active" || !season.clubIds?.includes(squad.clubId)) return;
    const entries = {...squad.entries};
    let changed = false;
    for (const [memberId, entry] of Object.entries(entries)) {
      if (entry.invitationStatus !== "accepted" || entry.paymentStatus === "paid" ||
          entry.fundingType === "company") continue;
      let next = {...entry};
      // Start a fresh window for legacy acceptances. Never backdate an expiry.
      if (!Number.isFinite(next.paymentDueAtMs)) {
        next = {...next, paymentWindowStartedAtMs: now,
          paymentReminderAtMs: now + policy.PAYMENT_REMINDER_MS,
          paymentDueAtMs: now + policy.PAYMENT_WINDOW_MS};
      }
      let kind = null;
      if (policy.seasonPaymentExpired(next, now)) {
        next.invitationStatus = "expired";
        next.placeReleasedAtMs = now;
        kind = "expired";
      } else if (now >= next.paymentReminderAtMs && !next.paymentReminderQueuedAtMs) {
        next.paymentReminderQueuedAtMs = now;
        kind = "reminder";
      } else if (!entry.paymentDueAtMs) {
        kind = "accepted";
      }
      if (JSON.stringify(next) !== JSON.stringify(entry)) {
        entries[memberId] = next;
        changed = true;
      }
      if (kind) tx.set(ref.collection("paymentDeadlineNotices").doc(
        `${memberId}-${next.paymentDueAtMs}-${kind}`
      ), {
        kind, memberId, clubId: squad.clubId, venueId: squad.venueId,
        seasonId: squad.seasonId, dueAtMs: next.paymentDueAtMs,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (changed) tx.update(ref, {entries, updatedAt: FieldValue.serverTimestamp()});
  });
}

function buildHandlers({db, region, sendBatch, authService = getAuth(), testOnly = false}) {
  async function notify(ref) {
    const snap = await ref.get();
    const notice = snap.data();
    if (!notice || notice.sentAt) return;
    const squadRef = ref.parent.parent;
    const squad = (await squadRef.get()).data();
    if (!squad || squad.status !== "active") return;
    const entry = squad.entries?.[notice.memberId];
    if (notice.kind !== "late_payment" && (!entry ||
        entry.paymentDueAtMs !== notice.dueAtMs || entry.paymentStatus === "paid" ||
        (notice.kind !== "expired" && entry.invitationStatus !== "accepted"))) return;
    const club = (await db.doc(`clubs/${notice.clubId}`).get()).data() || {};
    const member = (await db.doc(`clubs/${notice.clubId}/members/${notice.memberId}`).get()).data() || {};
    const uids = new Set();
    async function add(uid, email) {
      try {
        const user = uid ? await authService.getUser(uid) :
          email ? await authService.getUserByEmail(String(email).trim().toLowerCase()) : null;
        if (user && (uid || user.emailVerified)) uids.add(user.uid);
      } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
    }
    await add(member.uid, member.email);
    if (["expired", "late_payment"].includes(notice.kind)) {
      for (const uid of [club.ownerUid, club.createdByUid, ...(club.adminUids || [])]) await add(uid);
      for (const email of [club.captainEmail, club.captain?.email,
        ...(club.captainEmails || []), ...(club.adminEmails || [])]) await add(null, email);
    }
    const due = Number.isFinite(notice.dueAtMs) ? new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
    }).format(notice.dueAtMs) : "";
    const body = notice.kind === "expired"
      ? `${entry?.fullName || "Player"}: unpaid place released. Contact your captain before paying.`
      : notice.kind === "late_payment"
        ? "Late payment received. Captain: review the place and arrange a refund if unavailable."
        : `Pay by ${due} SAST to keep your place. Unpaid places are released after 48 hours.`;
    for (const uid of uids) {
      if (notice.deliveredUids?.includes(uid)) continue;
      const devices = await db.collectionGroup("notificationDevices").where("firebaseUid", "==", uid).get();
      const seen = new Set();
      const tokenRecords = devices.docs.flatMap(doc => {
        const d = doc.data();
        if (!d.enabled || !d.token || seen.has(d.token)) return [];
        seen.add(d.token);
        return [{token: d.token, ref: doc.ref}];
      });
      // Retain the outbox for later retries when no device is registered.
      if (!tokenRecords.length) continue;
      const result = await sendBatch({tokenRecords, title: notice.kind === "expired" ? "Season place released" : notice.kind === "late_payment" ? "Payment needs review" : "Season payment reminder", body,
        data: {type: "field_season_payment_deadline", route: "club-league",
          clubId: String(notice.clubId), venueId: String(notice.venueId),
          seasonId: String(notice.seasonId), memberId: String(notice.memberId),
          notificationId: ref.id},
      });
      if (!result.successCount) throw new Error("Payment reminder delivery failed.");
      await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        tx.update(ref, {deliveredUids: [...new Set([...(current.deliveredUids || []), uid])]});
      });
    }
    const current = (await ref.get()).data();
    if (uids.size && [...uids].every(uid => current.deliveredUids?.includes(uid))) {
      await db.runTransaction(async tx => {
        await tx.get(ref);
        tx.update(ref, {sentAt: FieldValue.serverTimestamp()});
      });
    }
  }
  async function sweep() {
    // Page the active squads; avoid loading a growing season history into memory.
    let cursor;
    while (true) {
      let query = db.collection("leagueSeasonSquads").where("status", "==", "active").orderBy("__name__").limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const doc of page.docs) {
        await processSquad({db, ref: doc.ref});
        const notices = await doc.ref.collection("paymentDeadlineNotices").get();
        for (const notice of notices.docs) if (!notice.data().sentAt) {
          try { await notify(notice.ref); }
          catch (error) { console.error("Season payment notice will retry", notice.ref.path, error.message); }
        }
      }
      if (page.size < 100) break;
      cursor = page.docs.at(-1);
    }
  }
  if (testOnly) return {sweep, notify};
  return {processFieldSeasonPaymentDeadlines: onSchedule({region,
    schedule: "every 5 minutes", timeoutSeconds: 540, maxInstances: 1,
  }, sweep)};
}
exports.processSquad = processSquad;
exports.buildHandlers = buildHandlers;
