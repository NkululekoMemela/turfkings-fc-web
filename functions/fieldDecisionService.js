const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {createHash, randomUUID} = require("node:crypto");

const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, sorted(value[key])]));
  }
  return value;
}
function decisionBasis(season, live) {
  const relevant = {
    id: season.id, status: season.status, gameFormat: season.gameFormat || "",
    scheduleSettings: season.scheduleSettings || {},
    matchDays: season.matchDays || [], fixtures: season.fixtures || [],
    liveMatches: season.liveMatches || {},
    results: season.results || [], matchDayHistory: season.matchDayHistory || [],
    live: live ? {fixtureId: live.fixtureId || "", status: live.status || ""} : null,
  };
  return createHash("sha256").update(JSON.stringify(sorted(relevant))).digest("hex");
}
async function submitDecision({db, actorUid, body, now = Date.now()}) {
  const {venueId, seasonId} = body || {};
  if (!validId(venueId) || !validId(seasonId)) {
    throw new Error("Invalid Field or season reference.");
  }
  const {normalizeFieldDecision, assertFieldDecisionRequester} =
    await import("./fieldDecisionPolicy.mjs");
  const {applyFieldScheduleDecision} = await import("./fieldDecisionSchedule.mjs");
  const decision = normalizeFieldDecision(body);
  if (!["reschedule_day", "delay_remaining"].includes(decision.action)) {
    throw new Error("This decision type is not connected yet.");
  }
  const requestId = body.requestId || randomUUID();
  if (!validId(requestId)) throw new Error("Invalid request reference.");
  const venueRef = db.doc(`leagueVenues/${venueId}`);
  const requestRef = venueRef.collection("decisionRequests").doc(requestId);
  return db.runTransaction(async transaction => {
    const venueSnap = await transaction.get(venueRef);
    const staffSnap = await transaction.get(venueRef.collection("staff").doc(actorUid));
    const liveSnap = await transaction.get(venueRef.collection("seasons")
      .doc(seasonId).collection("matches").doc("current"));
    const existing = await transaction.get(requestRef);
    const venue = venueSnap.data();
    assertFieldDecisionRequester({
      venue, staff: staffSnap.data(), actorUid, seasonId,
    });
    if (existing.exists) {
      const prior = existing.data();
      if (prior.requestedByUid !== actorUid || prior.seasonId !== seasonId ||
          JSON.stringify(sorted(prior.decision)) !== JSON.stringify(sorted(decision))) {
        throw new Error("This request reference has already been used.");
      }
      return {requestId, status: prior.status};
    }
    const season = venue.league.activeSeason;
    const proposed = applyFieldScheduleDecision({
      season, decision, actorUid: venue.ownerUid, liveMatch: liveSnap.data(), now,
    });
    const dayId = decision.parameters.matchDayId;
    const summary = {
      before: (season.fixtures || []).filter(item => item.matchDayId === dayId)
        .map(item => ({id: item.id, scheduledLocal: item.scheduledLocal || ""})),
      after: proposed.fixtures.filter(item => item.matchDayId === dayId)
        .map(item => ({id: item.id, scheduledLocal: item.scheduledLocal || ""})),
    };
    transaction.set(requestRef, {
      venueId, seasonId, requestedByUid: actorUid, managerUid: venue.ownerUid,
      decision, summary, basis: decisionBasis(season, liveSnap.data()),
      status: "pending", requestedAtMs: now, expiresAtMs: now + 86400000,
      createdAt: FieldValue.serverTimestamp(),
    });
    return {requestId, status: "pending"};
  });
}

async function reviewDecision({db, actorUid, body, now = Date.now()}) {
  const {venueId, requestId, response} = body || {};
  if (!validId(venueId) || !validId(requestId) ||
      !["approve", "reject"].includes(response)) {
    throw new Error("Choose a valid approval response.");
  }
  const {assertFieldDecisionReview, assertFieldDecisionRequester} =
    await import("./fieldDecisionPolicy.mjs");
  const {applyFieldScheduleDecision} = await import("./fieldDecisionSchedule.mjs");
  const venueRef = db.doc(`leagueVenues/${venueId}`);
  const requestRef = venueRef.collection("decisionRequests").doc(requestId);
  return db.runTransaction(async transaction => {
    const venueSnap = await transaction.get(venueRef);
    const requestSnap = await transaction.get(requestRef);
    const venue = venueSnap.data();
    const request = requestSnap.data();
    if (!actorUid || venue?.ownerUid !== actorUid) {
      throw new Error("Only the Field creator can approve or reject this request.");
    }
    if (!request || request.venueId !== venueId || !validId(request.seasonId)) {
      throw new Error("This request is unavailable.");
    }
    const status = response === "approve" ? "approved" : "rejected";
    if (request.status === status && request.reviewedByUid === actorUid) {
      return {requestId, status};
    }
    if (request.status !== "pending") {
      throw new Error("This request is no longer pending.");
    }
    if (response === "approve") {
      const liveSnap = await transaction.get(venueRef.collection("seasons")
        .doc(request.seasonId).collection("matches").doc("current"));
      const staffSnap = await transaction.get(
        venueRef.collection("staff").doc(request.requestedByUid)
      );
      assertFieldDecisionRequester({
        venue, staff: staffSnap.data(), actorUid: request.requestedByUid,
        seasonId: request.seasonId,
      });
      const season = venue.league.activeSeason;
      assertFieldDecisionReview({
        venue, actorUid, request, seasonId: request.seasonId,
        currentBasis: decisionBasis(season, liveSnap.data()), now,
      });
      const change = applyFieldScheduleDecision({
        season, decision: request.decision, actorUid,
        liveMatch: liveSnap.data(), now,
      });
      transaction.update(venueRef, {
        "league.activeSeason.fixtures": change.fixtures,
        "league.activeSeason.matchDays": change.matchDays,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(requestRef, {
      status, reviewedByUid: actorUid, reviewedAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(venueRef.collection("actionLog").doc(), {
      seasonId: request.seasonId, action: `field_decision_${status}`,
      label: response === "approve" ? "Field decision approved" : "Field decision rejected",
      details: `${request.decision.action}: ${request.decision.reason}`,
      actorUid, requestId, at: FieldValue.serverTimestamp(),
    });
    return {requestId, status};
  });
}

function endpoint(service) {
  return onRequest(
    {region: "us-central1", invoker: "public", cors: true},
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({error: "Use POST."});
      const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
      if (!bearer) return res.status(401).json({error: "Sign in first."});
      let user;
      try {
        user = await admin.auth().verifyIdToken(bearer[1], true);
      } catch {
        return res.status(401).json({error: "Sign in again."});
      }
      try {
        return res.status(200).json(await service({
          db: getFirestore(), actorUid: user.uid, body: req.body,
        }));
      } catch (error) {
        return res.status(400).json({error: error.message});
      }
    }
  );
}
exports.submitDecision = submitDecision;
exports.reviewDecision = reviewDecision;
exports.decisionBasis = decisionBasis;
exports.submitFieldDecision = endpoint(submitDecision);
exports.reviewFieldDecision = endpoint(reviewDecision);
