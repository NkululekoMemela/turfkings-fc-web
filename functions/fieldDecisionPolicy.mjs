const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);
const validTime = value => typeof value === "string" &&
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function normalizeFieldDecision({action, reason, parameters = {}}) {
  if (typeof reason !== "string" ||
      reason.trim().length < 10 || reason.trim().length > 500) {
    throw new Error("Explain the reason using 10 to 500 characters.");
  }
  if (!parameters || typeof parameters !== "object" ||
      Array.isArray(parameters)) {
    throw new Error("Invalid decision details.");
  }
  let expected;
  if (action === "reschedule_day") {
    expected = ["matchDayId", "dateLocal", "startTime"];
  } else if (action === "delay_remaining") {
    expected = ["matchDayId", "startTime"];
  } else if (action === "cancel_season") {
    expected = [];
  } else if (action === "delete_day_results") {
    expected = ["matchDayId"];
  } else {
    throw new Error("Choose a supported Field decision.");
  }
  if (Object.keys(parameters).length !== expected.length ||
      expected.some(key => !Object.hasOwn(parameters, key))) {
    throw new Error("The request contains incomplete or unexpected details.");
  }
  if (expected.includes("matchDayId") && !validId(parameters.matchDayId)) {
    throw new Error("Choose a valid match day.");
  }
  if (expected.includes("startTime") && !validTime(parameters.startTime)) {
    throw new Error("Choose a valid kickoff time.");
  }
  if (expected.includes("dateLocal")) {
    const value = parameters.dateLocal;
    const date = new Date(`${value}T12:00:00Z`);
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value) {
      throw new Error("Choose a valid match date.");
    }
  }
  return {
    action, reason: reason.trim(),
    parameters: Object.fromEntries(expected.map(key => [key, parameters[key]])),
  };
}

export function assertFieldDecisionRequester({venue, staff, actorUid, seasonId}) {
  if (!actorUid || (venue?.ownerUid !== actorUid && staff?.status !== "active")) {
    throw new Error("Only the creator or active Field staff can request a decision.");
  }
  if (venue.league?.activeSeason?.id !== seasonId ||
      venue.league.activeSeason.status !== "active") {
    throw new Error("The active season has changed.");
  }
}

export function assertFieldDecisionReview({
  venue, actorUid, request, seasonId, currentBasis, now = Date.now(),
}) {
  if (!actorUid || venue?.ownerUid !== actorUid) {
    throw new Error("Only the Field creator can approve or reject this request.");
  }
  if (!request || request.status !== "pending") {
    throw new Error("This request is no longer pending.");
  }
  if (request.seasonId !== seasonId ||
      venue.league?.activeSeason?.id !== seasonId ||
      venue.league.activeSeason.status !== "active") {
    throw new Error("The request belongs to a different or inactive season.");
  }
  if (!Number.isFinite(request.expiresAtMs) || now >= request.expiresAtMs) {
    throw new Error("This request has expired. Submit a new request.");
  }
  if (!currentBasis || request.basis !== currentBasis) {
    throw new Error("The relevant season records changed. Submit a new request.");
  }
}
