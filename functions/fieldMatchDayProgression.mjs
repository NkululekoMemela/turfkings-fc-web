export function assertFieldMatchDayProgression({season, matchDayId}) {
  const days = season?.matchDays || [];
  const index = days.findIndex(day => day.id === matchDayId);
  if (season?.scheduleVersion !== 1 || index < 0) {
    throw new Error("Choose a published league match day.");
  }
  const archived = new Set((season.matchDayHistory || []).map(day =>
    day.scheduledMatchDayId || day.id));
  if (archived.has(matchDayId)) {
    throw new Error("This match day has already ended.");
  }
  const previous = days.slice(0, index).find(day => !archived.has(day.id));
  if (previous) {
    throw new Error(
      `End match day ${previous.roundNo || days.indexOf(previous) + 1} ` +
      "before starting the next match day."
    );
  }
}
