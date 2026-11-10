export function fieldMatchDayClosureSummary({season, matchDayId = "", now = Date.now()}) {
  const history = season?.matchDayHistory || [];
  const archived = new Set(history.map(day => day.scheduledMatchDayId || day.id));
  const dates = season?.matchDays || [];
  const allFixtures = season?.fixtures || [];
  const results = season?.results || [];
  const localToday = new Date(now + 7200000).toISOString().slice(0, 10);
  const day = matchDayId ? dates.find(item => item.id === matchDayId) : dates.find(item =>
    !archived.has(item.id) && (item.dateLocal && item.dateLocal <= localToday ||
      allFixtures.some(fixture => fixture.matchDayId === item.id &&
        (season.liveMatches?.[fixture.id]?.status === "live" ||
          results.some(result => result.fixtureId === fixture.id)))));
  if (!day || archived.has(day.id)) return null;
  const fixtures = allFixtures.filter(fixture => fixture.matchDayId === day.id).map(fixture => {
    const recorded = results.filter(result => result.fixtureId === fixture.id && result.status === "completed");
    const live = season.liveMatches?.[fixture.id]?.status === "live" || fixture.status === "live";
    const result = fixture.status === "completed" && recorded.length === 1 ? recorded[0] : null;
    const invalidResult = (fixture.status === "completed" || recorded.length > 0) && !result;
    return {...fixture, live, result, invalidResult};
  });
  return {day, fixtures, outstanding: fixtures.filter(fixture => !fixture.result && !fixture.live && !fixture.invalidResult)};
}

export function buildDatedMatchDayArchive({
  season, matchDayId = "", actorUid, now = Date.now(), allowOutstanding = false,
}) {
  if (season?.scheduleVersion !== 1 || !actorUid) {
    throw new Error("A dated league schedule and authorized official are required.");
  }
  const summary = fieldMatchDayClosureSummary({season, matchDayId, now});
  if (!summary) throw new Error("Choose an unarchived scheduled match day.");
  const {day, fixtures, outstanding} = summary;
  const ids = new Set(fixtures.map(fixture => fixture.id));
  if (!fixtures.length || ids.size !== fixtures.length ||
      !Array.isArray(day.fixtureIds) ||
      day.fixtureIds.length !== fixtures.length ||
      day.fixtureIds.some(id => !ids.has(id))) {
    throw new Error("The match-day fixture list is incomplete.");
  }
  if (fixtures.some(fixture => fixture.live || fixture.invalidResult) ||
      (!allowOutstanding && outstanding.length)) {
    throw new Error("Finish every scheduled fixture before ending this match day.");
  }
  const dayResults = fixtures.flatMap(fixture => fixture.result ? [fixture.result] : []);
  const completedIds = new Set(dayResults.map(result => result.fixtureId));
  const matchNumbers = new Set(dayResults.map(result => Number(result.matchNo)));
  return {
    id: day.id, scheduledMatchDayId: day.id,
    dateLocal: day.dateLocal || "", roundNo: day.roundNo ?? null,
    createdAt: new Date(now).toISOString(),
    endedAtMs: now, endedByUid: actorUid,
    matchType: "LEAGUE", gameFormat: season.gameFormat || "5_V_5",
    results: dayResults,
    ...(outstanding.length ? {outstandingFixtureIds: outstanding.map(fixture => fixture.id)} : {}),
    allEvents: (season.allEvents || []).filter(event =>
      event.fixtureId ? completedIds.has(event.fixtureId)
        : matchNumbers.has(Number(event.matchNo))),
    clubIds: [...new Set(fixtures.flatMap(f => [f.clubAId, f.clubBId]))],
  };
}
