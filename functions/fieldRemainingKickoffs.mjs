export function rescheduleRemainingKickoffs({
  season, matchDayId, startTime, actorUid, liveMatch = null,
  now = Date.now(),
}) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(startTime || ""))) {
    throw new Error("Choose a valid next kickoff time.");
  }
  const day = (season.matchDays || []).find(item => item.id === matchDayId);
  if (!day || day.status !== "scheduled" ||
      (season.matchDayHistory || []).some(item =>
        (item.scheduledMatchDayId || item.id) === matchDayId)) {
    throw new Error("This match day is no longer available.");
  }
  const fixtures = season.fixtures || [];
  const remaining = fixtures.filter(item =>
    item.matchDayId === matchDayId && item.status === "scheduled" &&
    !season.liveMatches?.[item.id]
  ).sort((a, b) => String(a.scheduledLocal).localeCompare(String(b.scheduledLocal)));
  if (!remaining.length) throw new Error("There are no remaining games to move.");
  const settings = season.scheduleSettings || {};
  const play = Number(settings.matchMinutes ?? 40);
  const half = Number(settings.halftimeMinutes ?? 5);
  const gap = Number(settings.turnaroundMinutes ?? 5);
  if (![play, half, gap].every(Number.isInteger) ||
      play < 2 || play > 180 || half < 0 || half > 30 || gap < 0 || gap > 30) {
    throw new Error("Correct the match duration settings first.");
  }
  const first = Date.parse(`${day.dateLocal}T${startTime}:00+02:00`);
  if (!Number.isFinite(first) || first < now) {
    throw new Error("The next kickoff must be in the future.");
  }
  let earliest = now;
  for (const fixture of fixtures.filter(item => item.matchDayId === matchDayId)) {
    if (remaining.some(item => item.id === fixture.id)) continue;
    let finishedAt = Date.parse(`${fixture.scheduledLocal}:00+02:00`) +
      (play + half) * 60000;
    const result = (season.results || []).find(item => item.fixtureId === fixture.id);
    const recordedEnd = Number(result?.completedAtMs || result?.endedAtMs);
    if (Number.isFinite(recordedEnd) && recordedEnd > 0) finishedAt = recordedEnd;
    if (season.liveMatches?.[fixture.id]?.status === "live") {
      if (liveMatch?.fixtureId !== fixture.id || liveMatch.status !== "live") {
        throw new Error("Reload the live match before changing kickoff times.");
      }
      finishedAt = now + (Math.max(0, Number(liveMatch.secondsLeft) || 0) +
        half * 60) * 1000;
    }
    if (Number.isFinite(finishedAt)) earliest = Math.max(earliest, finishedAt + gap * 60000);
  }
  if (first < earliest) {
    throw new Error("Allow the current or previous game to finish, plus the turnaround break.");
  }
  const midnight = Date.parse(`${day.dateLocal}T23:59:00+02:00`) + 60000;
  const replacements = new Map();
  remaining.forEach((fixture, index) => {
    const kickoff = first + index * (play + half + gap) * 60000;
    if (kickoff + (play + half) * 60000 >= midnight) {
      throw new Error("The remaining games will not fit before midnight.");
    }
    replacements.set(fixture.id, {
      ...fixture,
      scheduledLocal: new Date(kickoff + 7200000).toISOString().slice(0, 16),
      rescheduledByUid: actorUid, rescheduledAtMs: now,
    });
  });
  return {
    fixtures: fixtures.map(item => replacements.get(item.id) || item),
    matchDays: season.matchDays.map(item => item.id === matchDayId ? {
      ...item, remainingStartTime: startTime,
      rescheduledByUid: actorUid, rescheduledAtMs: now,
    } : item),
  };
}
