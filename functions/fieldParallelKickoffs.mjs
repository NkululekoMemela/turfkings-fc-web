export function parallelFixtureKey(fixture) {
  return fixture?.matchDayId && fixture.parallelKickoff === fixture.scheduledLocal &&
    typeof fixture.parallelKickoff === "string" && fixture.parallelKickoff &&
    Number.isInteger(fixture.pitchNumber) && fixture.pitchNumber > 0
    ? `${fixture.matchDayId}:${fixture.parallelKickoff}` : "";
}

export function canStartBesideLiveFixtures(season, fixture) {
  const live = Object.values(season?.liveMatches || {}).filter(match => match?.status === "live");
  if (!live.length) return true;
  const key = parallelFixtureKey(fixture);
  return Boolean(key) && live.every(match => {
    const other = season.fixtures?.find(item => item.id === match.fixtureId);
    return parallelFixtureKey(other) === key && other.pitchNumber !== fixture.pitchNumber;
  });
}

export function withoutParallelKickoff(fixture) {
  const {parallelKickoff, pitchNumber, ...serial} = fixture;
  return serial;
}

export function scheduleParallelKickoff({season, matchDayId, startTime, fixtureIds, actorUid, now}) {
  const day = (season.matchDays || []).find(item => item.id === matchDayId);
  if (day?.status !== "scheduled" || (season.matchDayHistory || []).some(
    item => (item.scheduledMatchDayId || item.id) === matchDayId)) {
    throw new Error("Choose an open match day.");
  }
  const fixtures = season.fixtures || [];
  const selected = fixtureIds.map(id => fixtures.find(f => f.id === id));
  if (selected.some(f => !f || f.matchDayId !== day.id || !day.fixtureIds?.includes(f.id)
      || f.status !== "scheduled" || season.liveMatches?.[f.id] || parallelFixtureKey(f))) {
    throw new Error("Choose unplayed fixtures that are not already in a parallel group.");
  }
  const clubs = selected.flatMap(f => [f.clubAId, f.clubBId]);
  if (clubs.some(id => !id) || new Set(clubs).size !== clubs.length) {
    throw new Error("A club cannot play on two pitches at the same time.");
  }
  const kickoff = `${day.dateLocal}T${startTime}`;
  const localMs = value => Date.parse(`${value}:00+02:00`);
  const start = localMs(kickoff);
  const play = Number(season.scheduleSettings?.matchMinutes ?? 40);
  const half = Number(season.scheduleSettings?.halftimeMinutes ?? 5);
  const gap = Number(season.scheduleSettings?.turnaroundMinutes ?? 5);
  const duration = (play + half + gap) * 60000;
  if (![play,half,gap].every(Number.isInteger) || play < 2 || half < 0 || gap < 0 ||
      !Number.isFinite(start) || start < now ||
      start + (play + half) * 60000 >= localMs(`${day.dateLocal}T23:59`) + 60000) {
    throw new Error("Choose a future kickoff that fits before midnight.");
  }
  for (const other of fixtures.filter(f => f.matchDayId === day.id && !fixtureIds.includes(f.id))) {
    const otherStart = localMs(other.scheduledLocal);
    if (!Number.isFinite(otherStart) || (start < otherStart + duration && otherStart < start + duration)) {
      throw new Error("The selected time overlaps another fixture. Include that fixture or choose another time.");
    }
  }
  return {
    fixtures: fixtures.map(f => fixtureIds.includes(f.id) ? {
      ...f, scheduledLocal:kickoff, parallelKickoff:kickoff, pitchNumber:fixtureIds.indexOf(f.id)+1,
      rescheduledByUid:actorUid, rescheduledAtMs:now,
    } : f),
    matchDays: season.matchDays.map(d => d.id === day.id ? {...d,rescheduledByUid:actorUid,rescheduledAtMs:now} : d),
  };
}
