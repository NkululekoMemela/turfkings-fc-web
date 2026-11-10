const playedResult = (season, fixtureId) =>
  [...(season.results || []), ...(season.matchDayHistory || []).flatMap(day => day.results || [])]
    .some(result => (result.fixtureId || result.id) === fixtureId &&
      !["cancelled", "scheduled", "live"].includes(result.status));

export function fieldFixtureStartRecovery({venueId, season, fixture, match, approval, indexedMatch, liveDocumentId, reversal}) {
  if (!match) return {kind: "new"};
  if (!match.venueId || (venueId && match.venueId !== venueId)) {
    throw new Error("The saved match is missing its Field reference. Ask Field management to review it.");
  }
  if (match.seasonId !== season.id || match.fixtureId !== fixture.id ||
      match.teamAId !== fixture.clubAId || match.teamBId !== fixture.clubBId) {
    throw new Error("The saved match belongs to a different fixture. Its record has been kept.");
  }
  const reversed = fixture.status === "scheduled" && !playedResult(season, fixture.id) &&
    reversal?.venueId === venueId && reversal.seasonId === season.id &&
    reversal.fixtureId === fixture.id && reversal.actorUid && reversal.reason?.trim().length >= 5 &&
    (reversal.result?.fixtureId || reversal.result?.id) === fixture.id &&
    reversal.fixture?.id === fixture.id && reversal.fixture.clubAId === fixture.clubAId &&
    reversal.fixture.clubBId === fixture.clubBId &&
    Number(reversal.at?.toMillis?.() || reversal.atMs) >=
      Number(match.completedAtMs || match.completedAt?.toMillis?.() || match.startedAt?.toMillis?.() || Infinity);
  if (fixture.status === "completed" || playedResult(season, fixture.id) ||
      (!reversed && (match.status === "completed" || match.isFinished || match.finalSummary))) {
    throw new Error("This fixture has a saved result. Open Results to review it instead of starting it again.");
  }
  if ((season.matchDayHistory || []).some(day => (day.scheduledMatchDayId || day.id) === fixture.matchDayId)) {
    throw new Error("This match day is already closed. Arrange the outstanding fixture through Field scheduling.");
  }
  if (reversed) return {kind: "replace-reversed"};
  const genuine = approval && approval.venueId === match.venueId &&
    approval.seasonId === season.id && approval.fixtureId === fixture.id && approval.used === true &&
    approval.clubAId === fixture.clubAId && approval.clubBId === fixture.clubBId &&
    approval.actorUid === match.startedByUid;
  if (match.status === "live" && genuine && indexedMatch?.status === "live" &&
      (indexedMatch.liveDocumentId || "current") === liveDocumentId) return {kind:"resume"};
  const scores = [match.goalsA, match.goalsB, match.scoreA, match.scoreB];
  const events = [match.currentEvents, match.events, match.allEvents];
  const hasPlay = scores.some(value => Number(value) > 0) ||
    events.some(value => Array.isArray(value) && value.length > 0);
  const unstarted = ["live", "draft", "pending", "cancelled"].includes(match.status) &&
    match.awaitingKitVerification === true && match.running !== true &&
    !match.timeUp && !hasPlay && (!match.clockPhase || match.clockPhase === "first_half");
  if (unstarted) return {kind: "replace-unstarted"};
  if (match.status === "live" && genuine) return {kind: "resume"};
  throw new Error("This saved fixture may contain play. Its record has been kept; Field management must review it before a fresh kickoff.");
}

export function recoveredFieldMatchSummary({season, fixture, match, approval, liveDocumentId}) {
  return {
    fixtureId: fixture.id, liveDocumentId, gameFormat: match.gameFormat || season.gameFormat,
    matchNo: Number(match.currentMatchNo || match.matchNumber) || 1,
    clubAId: fixture.clubAId, clubBId: fixture.clubBId,
    clubAName: match.teamALabel || fixture.clubAName || fixture.clubAId,
    clubBName: match.teamBLabel || fixture.clubBName || fixture.clubBId,
    standbyId: match.standbyId || "",
    scoreA: Number(match.goalsA ?? match.scoreA) || 0,
    scoreB: Number(match.goalsB ?? match.scoreB) || 0,
    status: "live", startedByUid: match.startedByUid || approval.actorUid,
    ...(match.startedAt ? {startedAt: match.startedAt} : {}),
    ...(match.startRequestId ? {startRequestId: match.startRequestId} : {}),
  };
}
