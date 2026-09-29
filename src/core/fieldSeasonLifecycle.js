export const FIELD_GAME_FORMATS = [
  ["5_V_5", "5-a-side"],
  ["6_V_6", "6-a-side"],
  ["7_V_7", "7-a-side"],
  ["11_V_11", "11-a-side"],
];

export function fieldSeasonHasPlayRecords(season) {
  return ["results", "matchDayHistory", "allEvents", "currentEvents"]
    .some(key => (season?.[key] || []).length > 0)
    || Object.keys(season?.liveMatches || {}).length > 0
    || (season?.fixtures || []).some(
      fixture => ["live", "completed"].includes(fixture.status)
    );
}

export function fieldSeasonCancellationReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < 10 || reason.length > 500) {
    throw new Error("Explain the cancellation in 10 to 500 characters.");
  }
  return reason;
}

export function fieldSeasonPrizeAmounts(prizes) {
  const result = {};
  for (const place of ["first", "second", "third"]) {
    const value = prizes?.[place];
    const amount = Number(value);
    if (value === "" || value == null || !Number.isFinite(amount)
        || amount < 0 || amount > 100000000) {
      throw new Error("Enter a valid prize amount for each place, including 0 if none.");
    }
    result[place] = Math.round(amount * 100) / 100;
  }
  return result;
}
