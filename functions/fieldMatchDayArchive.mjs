export function buildDatedMatchDayArchive({
  season, matchDayId = "", actorUid, now = Date.now(),
}) {
  if (season?.scheduleVersion !== 1 || !actorUid) {
    throw new Error("A dated league schedule and authorized official are required.");
  }
  const history = season.matchDayHistory || [];
  const archived = new Set(history.map(day =>
    day.scheduledMatchDayId || day.id));
  const results = season.results || [];
  const day = matchDayId
    ? (season.matchDays || []).find(item => item.id === matchDayId)
    : (season.matchDays || []).find(item =>
        !archived.has(item.id) &&
        (season.fixtures || []).some(fixture =>
          fixture.matchDayId === item.id &&
          results.some(result => result.fixtureId === fixture.id)));
  if (!day || archived.has(day.id)) {
    throw new Error("Choose an unarchived scheduled match day.");
  }
  const fixtures = (season.fixtures || [])
    .filter(fixture => fixture.matchDayId === day.id);
  const ids = new Set(fixtures.map(fixture => fixture.id));
  if (!fixtures.length || ids.size !== fixtures.length ||
      !Array.isArray(day.fixtureIds) ||
      day.fixtureIds.length !== fixtures.length ||
      day.fixtureIds.some(id => !ids.has(id))) {
    throw new Error("The match-day fixture list is incomplete.");
  }
  const dayResults = [];
  for (const fixture of fixtures) {
    const recorded = results.filter(result =>
      result.fixtureId === fixture.id && result.status === "completed");
    if (fixture.status !== "completed" || recorded.length !== 1 ||
        season.liveMatches?.[fixture.id]?.status === "live") {
      throw new Error("Finish every scheduled fixture before ending this match day.");
    }
    dayResults.push(recorded[0]);
  }
  const matchNumbers = new Set(dayResults.map(result => Number(result.matchNo)));
  return {
    id: day.id, scheduledMatchDayId: day.id,
    dateLocal: day.dateLocal || "", roundNo: day.roundNo ?? null,
    createdAt: new Date(now).toISOString(),
    endedAtMs: now, endedByUid: actorUid,
    matchType: "LEAGUE", gameFormat: season.gameFormat || "5_V_5",
    results: dayResults,
    allEvents: (season.allEvents || []).filter(event =>
      event.fixtureId ? ids.has(event.fixtureId)
        : matchNumbers.has(Number(event.matchNo))),
    clubIds: [...new Set(fixtures.flatMap(f => [f.clubAId, f.clubBId]))],
  };
}
