export function selectDatedFieldPairing({season, clubAId, clubBId}) {
  if (season?.scheduleVersion !== 1 || !clubAId || !clubBId ||
      clubAId === clubBId) {
    throw new Error("Choose two different Clubs from a published schedule.");
  }
  const archived = new Set((season.matchDayHistory || [])
    .map(day => day.scheduledMatchDayId || day.id));
  const day = (season.matchDays || []).find(item => !archived.has(item.id));
  if (!day) throw new Error("There are no remaining match days.");
  const fixtures = (season.fixtures || [])
    .filter(item => item.matchDayId === day.id);
  const appearances = new Map();
  for (const fixture of fixtures) {
    for (const id of [fixture.clubAId, fixture.clubBId]) {
      appearances.set(id, (appearances.get(id) || 0) + 1);
    }
  }
  if ([...appearances.values()].some(count => count !== 1)) {
    throw new Error("Correct the schedule: a Club appears more than once in this match day.");
  }
  const fixture = fixtures.find(item =>
    item.status === "scheduled" && !season.liveMatches?.[item.id] &&
    ((item.clubAId === clubAId && item.clubBId === clubBId) ||
      (item.clubAId === clubBId && item.clubBId === clubAId)));
  if (!fixture) {
    throw new Error(
      "Choose a published pairing from the current match day. " +
      "Finish and end this day before selecting the next one."
    );
  }
  if (!day.fixtureIds?.includes(fixture.id)) {
    throw new Error("This fixture is missing from its match day.");
  }
  return {
    fixture,
    fixtureIndex: season.fixtures.findIndex(item => item.id === fixture.id),
    matchDayIndex: season.matchDays.findIndex(item => item.id === day.id),
  };
}
