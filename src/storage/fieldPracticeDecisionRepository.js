import {doc, runTransaction, serverTimestamp} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import {venueLeagueRootPath} from "../core/venueLeaguePaths.js";
import {normalizeFieldDecision, assertFieldDecisionReview}
  from "../../functions/fieldDecisionPolicy.mjs";
import {applyFieldScheduleDecision} from "../../functions/fieldDecisionSchedule.mjs";

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
function basis(season, live) {
  return JSON.stringify(sorted({
    id: season.id, status: season.status, gameFormat: season.gameFormat || "",
    scheduleSettings: season.scheduleSettings || {},
    matchDays: season.matchDays || [], fixtures: season.fixtures || [],
    liveMatches: season.liveMatches || {}, results: season.results || [],
    matchDayHistory: season.matchDayHistory || [],
    live: live ? {fixtureId: live.fixtureId || "", status: live.status || ""} : null,
  }));
}
function rootOf(scope, venueId) {
  if (scope?.environment !== "practice" || scope.venueId !== venueId ||
      !scope.seasonId) throw new Error("Matching Field Practice scope required.");
  return venueLeagueRootPath(scope);
}
async function authorize(tx, scope) {
  const uid = auth.currentUser?.uid;
  const snap = await tx.get(doc(db, "practiceSessions", scope.practiceSessionId));
  const session = snap.data();
  if (!uid || session?.kind !== "venueLeague" ||
      session.environment !== "practice" || session.userId !== uid ||
      session.venueId !== scope.venueId ||
      session.sessionId !== scope.practiceSessionId ||
      session.status !== "active" ||
      typeof session.expiresAt?.toMillis !== "function" ||
      session.expiresAt.toMillis() <= Date.now()) {
    throw new Error("This Field Practice session is unavailable or expired.");
  }
  return uid;
}
export async function submitPracticeDecision({
  scope, venueId, seasonId, action, reason, parameters, requestId,
}) {
  const root = rootOf(scope, venueId);
  if (scope.seasonId !== seasonId ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(requestId)) throw new Error("Decision scope mismatch.");
  const decision = normalizeFieldDecision({action, reason, parameters});
  if (!["reschedule_day", "delay_remaining"].includes(decision.action)) {
    throw new Error("Choose a schedule decision.");
  }
  const rootRef = doc(db, root);
  const requestRef = doc(db, `${root}/decisionRequests/${requestId}`);
  return runTransaction(db, async tx => {
    const uid = await authorize(tx, scope);
    const rootSnap = await tx.get(rootRef);
    const liveSnap = await tx.get(doc(db, `${root}/seasons/${seasonId}/matches/current`));
    const priorSnap = await tx.get(requestRef);
    const workspace = rootSnap.data();
    const season = workspace?.league?.activeSeason;
    if (workspace?.environment !== "practice" ||
        workspace.practiceSessionId !== scope.practiceSessionId ||
        season?.id !== seasonId || season.status !== "active") {
      throw new Error("The active Practice season changed.");
    }
    if (priorSnap.exists()) {
      const prior = priorSnap.data();
      if (prior.requestedByUid !== uid || prior.seasonId !== seasonId ||
          JSON.stringify(sorted(prior.decision)) !== JSON.stringify(sorted(decision))) {
        throw new Error("This request reference has already been used.");
      }
      return {requestId, status: prior.status};
    }
    const now = Date.now();
    const proposed = applyFieldScheduleDecision({
      season, decision, actorUid: uid, liveMatch: liveSnap.data(), now,
    });
    const summarize = fixtures => fixtures
      .filter(f => f.matchDayId === decision.parameters.matchDayId)
      .map(f => ({id: f.id, scheduledLocal: f.scheduledLocal || ""}));
    tx.set(requestRef, {
      environment: "practice", practiceSessionId: scope.practiceSessionId,
      venueId, seasonId, requestedByUid: uid, managerUid: uid, decision,
      summary: {before: summarize(season.fixtures || []), after: summarize(proposed.fixtures)},
      basis: basis(season, liveSnap.data()), status: "pending",
      requestedAtMs: now, expiresAtMs: now + 86400000,
      createdAt: serverTimestamp(),
    });
    return {requestId, status: "pending"};
  });
}
export async function reviewPracticeDecision({scope, venueId, requestId, response}) {
  const root = rootOf(scope, venueId);
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(requestId) ||
      !["approve", "reject"].includes(response)) throw new Error("Invalid approval response.");
  const rootRef = doc(db, root);
  const requestRef = doc(db, `${root}/decisionRequests/${requestId}`);
  return runTransaction(db, async tx => {
    const uid = await authorize(tx, scope);
    const rootSnap = await tx.get(rootRef);
    const requestSnap = await tx.get(requestRef);
    const workspace = rootSnap.data();
    const request = requestSnap.data();
    const season = workspace?.league?.activeSeason;
    if (workspace?.environment !== "practice" ||
        workspace.practiceSessionId !== scope.practiceSessionId ||
        !request || request.environment !== "practice" ||
        request.practiceSessionId !== scope.practiceSessionId ||
        request.venueId !== venueId || request.managerUid !== uid ||
        request.seasonId !== scope.seasonId) {
      throw new Error("This Practice request is unavailable.");
    }
    const status = response === "approve" ? "approved" : "rejected";
    if (request.status === status && request.reviewedByUid === uid) return {requestId, status};
    if (request.status !== "pending") throw new Error("This request is no longer pending.");
    const now = Date.now();
    let change;
    const manifests = [];
    if (response === "approve") {
      const live = await tx.get(doc(db, `${root}/seasons/${request.seasonId}/matches/current`));
      assertFieldDecisionReview({
        venue: {...workspace, ownerUid: uid}, actorUid: uid, request,
        seasonId: scope.seasonId, currentBasis: basis(season, live.data()), now,
      });
      change = applyFieldScheduleDecision({
        season, decision: request.decision, actorUid: uid, liveMatch: live.data(), now,
      });
      for (const fixture of change.fixtures) {
        const previous = season.fixtures.find(f => f.id === fixture.id);
        if (previous?.scheduledLocal === fixture.scheduledLocal) continue;
        for (const clubId of [fixture.clubAId, fixture.clubBId]) {
          const ref = doc(db,
            `${root}/seasons/${request.seasonId}/fieldMatchDayManifests/${fixture.matchDayId}/clubs/${clubId}`);
          const snap = await tx.get(ref);
          if (snap.exists()) manifests.push({ref, fixture});
        }
      }
    }
    if (change) {
      tx.update(rootRef, {
        "league.activeSeason.fixtures": change.fixtures,
        "league.activeSeason.matchDays": change.matchDays, updatedAt: serverTimestamp(),
      });
      for (const {ref, fixture} of manifests) tx.update(ref, {
        scheduledLocal: fixture.scheduledLocal,
        dateLocal: fixture.scheduledLocal.slice(0, 10),
      });
    }
    tx.update(requestRef, {
      status, reviewedByUid: uid, reviewedAtMs: now, updatedAt: serverTimestamp(),
    });
    tx.set(doc(db, `${root}/actionLog/${crypto.randomUUID()}`), {
      environment: "practice", practiceSessionId: scope.practiceSessionId,
      seasonId: request.seasonId, action: `field_decision_${status}`,
      label: response === "approve" ? "Field decision approved" : "Field decision rejected",
      details: `${request.decision.action}: ${request.decision.reason}`,
      actorUid: uid, requestId, at: serverTimestamp(),
    });
    return {requestId, status};
  });
}
