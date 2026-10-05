const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onTaskDispatched} = require("firebase-functions/v2/tasks");
const {getFunctions} = require("firebase-admin/functions");
const {createHash} = require("node:crypto");
const {FieldValue} = require("firebase-admin/firestore");

function buildHandlers({db, region, sendBatch, testOnly = false, enqueueTask = null}) {
  async function processDay(venueId, seasonId, matchDayId, now = Date.now()) {
    const {evaluateMatchDayReview} = await import("./fieldMatchDayLifecycle.mjs");
    const venueRef = db.collection("leagueVenues").doc(venueId);
    const seasonRef = venueRef.collection("seasons").doc(seasonId);
    const reviewRef = seasonRef.collection("matchDayReviews").doc(matchDayId);
    const liveRef = seasonRef.collection("matches").doc("current");
    return db.runTransaction(async transaction => {
      const venueSnap = await transaction.get(venueRef);
      const reviewSnap = await transaction.get(reviewRef);
      const liveSnap = await transaction.get(liveRef);
      const season = venueSnap.data()?.league?.activeSeason;
      if (season?.id !== seasonId || season.status !== "active") return null;
      const review = reviewSnap.data();
      const decision = evaluateMatchDayReview({
        season, matchDayId, review, now,
      });
      if (!decision.ready) {
        if (review?.status === "ready") {
          const archived = (season.matchDayHistory || []).some(day =>
            (day.scheduledMatchDayId || day.id) === matchDayId);
          transaction.update(reviewRef, {
            status: archived ? "closed" : "blocked",
          });
        }
        return null;
      }

      const data = {
        venueId, seasonId, matchDayId,
        readyAtMs: decision.readyAtMs,
        reminderAtMs: decision.reminderAtMs,
        autoCloseAtMs: decision.autoCloseAtMs,
        status: "ready",
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (decision.close) {
        if (liveSnap.data()?.status === "live" ||
            Object.values(season.liveMatches || {})
              .some(match => match?.status === "live")) {
          transaction.set(reviewRef, data, {merge: true});
          return null;
        }
        const archive = {
          ...decision.archive,
          automatic: true,
          closureReason: "Automatic completion at the nightly cutoff",
        };
        transaction.update(venueRef, {
          "league.activeSeason.matchDayHistory": [
            ...(season.matchDayHistory || []), archive,
          ],
          "league.activeSeason.updatedAtMs": now,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (liveSnap.exists &&
            decision.archive.results.some(result =>
              result.fixtureId === liveSnap.data().fixtureId)) {
          transaction.delete(liveRef);
        }
        transaction.set(reviewRef, {
          ...data, status: "closed", closedAtMs: now, automatic: true,
        }, {merge: true});
        transaction.set(venueRef.collection("actionLog").doc(), {
          venueId, seasonId, fixtureId: "",
          action: "match_day_saved", label: "Match Day saved automatically",
          details: `${matchDayId}: all scheduled fixtures completed`,
          actorUid: "system", actorEmail: "", actorName: "Automatic completion",
          at: FieldValue.serverTimestamp(),
        });
        return {closed: true};
      }
      transaction.set(reviewRef, data, {merge: true});
      return {
        ready: true, notify: decision.notify, remind: decision.remind,
        readyAtMs: decision.readyAtMs,
        reminderAtMs: decision.reminderAtMs,
        autoCloseAtMs: decision.autoCloseAtMs,
      };
    });
  }

  async function notifyReview(venueId, seasonId, matchDayId, kind) {
    const venueRef = db.collection("leagueVenues").doc(venueId);
    const reviewRef = venueRef.collection("seasons").doc(seasonId)
      .collection("matchDayReviews").doc(matchDayId);
    const sentKey = kind === "initial" ? "initialSentAtMs" : "reminderSentAtMs";
    const leaseKey = `${kind}LeaseUntilMs`;
    const now = Date.now();
    const claimed = await db.runTransaction(async transaction => {
      const venueSnap = await transaction.get(venueRef);
      const reviewSnap = await transaction.get(reviewRef);
      const review = reviewSnap.data();
      const season = venueSnap.data()?.league?.activeSeason;
      const {evaluateMatchDayReview} = await import("./fieldMatchDayLifecycle.mjs");
      const decision = evaluateMatchDayReview({
        season, matchDayId, review, now,
      });
      if (season?.id !== seasonId || !decision.ready || decision.close ||
          review?.status !== "ready" || review[sentKey] ||
          (review[leaseKey] || 0) > now ||
          !(kind === "initial" ? decision.notify : decision.remind)) return false;
      transaction.update(reviewRef, {[leaseKey]: now + 300000});
      return true;
    });
    if (!claimed) return;

    try {
      const venueSnap = await venueRef.get();
      const venue = venueSnap.data();
      const [staffSnap, powersSnap] = await Promise.all([
        venueRef.collection("staff").get(),
        venueRef.collection("staffPermissions").get(),
      ]);
      const powers = new Map(powersSnap.docs.map(doc => [doc.id, doc.data()]));
      const recipients = new Set([venue.ownerUid].filter(Boolean));
      for (const staff of staffSnap.docs) {
        if (staff.data().status === "active" &&
            powers.get(staff.id)?.endMatchDay === true) {
          recipients.add(staff.id);
        }
      }
      const ids = [...recipients];
      const seen = new Set();
      const tokenRecords = [];
      for (let offset = 0; offset < ids.length; offset += 30) {
        const devices = await db.collectionGroup("notificationDevices")
          .where("firebaseUid", "in", ids.slice(offset, offset + 30)).get();
        for (const device of devices.docs) {
          const data = device.data();
          if (!data.enabled || !data.token || seen.has(data.token)) continue;
          seen.add(data.token);
          tokenRecords.push({token: data.token, ref: device.ref});
        }
      }
      if (tokenRecords.length) {
        const result = await sendBatch({
          tokenRecords,
          title: kind === "initial"
            ? "Match day ready for review" : "Reminder: end your match day",
          body: kind === "initial"
            ? "All scheduled games are complete. Review the stats and end the match day."
            : "Your completed match day is still open. It will close automatically at 23:59 SAST.",
          imageUrl: String(venue.branding?.logoUrl || venue.logoUrl || ""),
          data: {
            type: "field_match_day_review", route: "field",
            fieldLogoUrl: String(venue.branding?.logoUrl || venue.logoUrl || ""),
            fieldName: String(venue.name || "Your Field"),
            venueId, seasonId, matchDayId, reminder: String(kind === "reminder"),
          },
        });
        if (!result.successCount && result.failureCount) {
          throw new Error("No review notifications were delivered.");
        }
      }
      await reviewRef.update({
        [sentKey]: Date.now(), [leaseKey]: 0,
        [`${kind}DeviceCount`]: tokenRecords.length,
        lastDeliveryError: "",
      });
    } catch (error) {
      await reviewRef.update({
        [leaseKey]: 0,
        lastDeliveryError: String(error.message || error).slice(0, 300),
      });
      throw error;
    }
  }

  async function scheduleReviewTasks(venueId, seasonId, matchDayId, decision) {
    const reviewRef = db.collection("leagueVenues").doc(venueId)
      .collection("seasons").doc(seasonId)
      .collection("matchDayReviews").doc(matchDayId);
    const queue = enqueueTask ? {enqueue: enqueueTask}
      : getFunctions().taskQueue("fieldMatchDayReviewTask");
    for (const [kind, time] of [
      ["reminder", decision.reminderAtMs],
      ["closure", decision.autoCloseAtMs],
    ]) {
      if (kind === "reminder" && time >= decision.autoCloseAtMs) continue;
      const marker = `${kind}QueuedForReadyAtMs`;
      const review = (await reviewRef.get()).data();
      if (review?.[marker] === decision.readyAtMs) continue;
      const id = createHash("sha256").update(JSON.stringify([
        venueId, seasonId, matchDayId, kind, decision.readyAtMs,
      ])).digest("hex");
      try {
        await queue.enqueue({venueId, seasonId, matchDayId, kind}, {
          id,
          scheduleTime: new Date(Math.max(time, Date.now() + 1000)),
          dispatchDeadlineSeconds: 180,
        });
      } catch (error) {
        if (error.code !== "functions/task-already-exists") throw error;
      }
      await reviewRef.update({[marker]: decision.readyAtMs});
    }
  }

  async function runReview(venueId, seasonId, matchDayId) {
    const decision = await processDay(venueId, seasonId, matchDayId);
    if (!decision?.ready) return decision;
    await scheduleReviewTasks(venueId, seasonId, matchDayId, decision);
    if (decision.notify) {
      await notifyReview(venueId, seasonId, matchDayId, "initial");
    } else if (decision.remind) {
      await notifyReview(venueId, seasonId, matchDayId, "reminder");
    }
    return decision;
  }

  async function processVenue(venueId) {
    const snapshot = await db.collection("leagueVenues").doc(venueId).get();
    const season = snapshot.data()?.league?.activeSeason;
    if (season?.scheduleVersion !== 1 || season.status !== "active") return;
    const archived = new Set((season.matchDayHistory || [])
      .map(day => day.scheduledMatchDayId || day.id));
    for (const day of season.matchDays || []) {
      if (!archived.has(day.id)) {
        await runReview(venueId, season.id, day.id);
      }
    }
  }

  if (testOnly) return {processDay, processVenue, notifyReview, runReview};
  return {
    fieldMatchDayReviewUpdated: onDocumentUpdated({
      document: "leagueVenues/{venueId}", region, retry: true,
    }, async event => {
      await processVenue(event.params.venueId);
    }),
    fieldMatchDayReviewTask: onTaskDispatched({
      region,
      retryConfig: {
        maxAttempts: 24, minBackoffSeconds: 30, maxBackoffSeconds: 300,
      },
      rateLimits: {maxConcurrentDispatches: 5},
      timeoutSeconds: 180,
    }, async request => {
      const {venueId, seasonId, matchDayId, kind} = request.data || {};
      if ([venueId, seasonId, matchDayId].some(value =>
        typeof value !== "string" ||
        !/^[A-Za-z0-9_-]{1,150}$/.test(value)) ||
        !["reminder", "closure"].includes(kind)) {
        throw new Error("Invalid match-day task.");
      }
      await runReview(venueId, seasonId, matchDayId);
      if (kind === "closure") {
        const review = await db.collection("leagueVenues").doc(venueId)
          .collection("seasons").doc(seasonId)
          .collection("matchDayReviews").doc(matchDayId).get();
        if (review.data()?.status === "ready" &&
            Date.now() >= review.data().autoCloseAtMs) {
          throw new Error("Closure is temporarily blocked by a live match.");
        }
      }
    }),
  };
}

module.exports = {buildHandlers};
