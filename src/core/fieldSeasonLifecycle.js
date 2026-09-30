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

export function fieldSeasonRegistrationOpen(season, now = Date.now()) {
  if (!season?.id || !season.announcedAtMs ||
      season.status !== "active" || season.registrationOpen !== true ||
      season.firstPlayAtMs ||
      (season.results || []).length ||
      (season.matchDayHistory || []).length) return false;
  const deadline = season.signupDeadlineAtMs;
  return deadline == null || (
    Number.isFinite(deadline) && now <= deadline
  );
}

export function fieldSeasonSignupDeadline(signupClosesOn, startsOn) {
  const date = String(signupClosesOn || "");
  const at = Date.parse(`${date}T23:59:59.999+02:00`);
  const check = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(at) || !Number.isFinite(check.getTime()) ||
      check.toISOString().slice(0, 10) !== date ||
      date > startsOn || at <= Date.now()) {
    throw new Error("Choose a future signup deadline on or before the season start date.");
  }
  return at;
}

export function fieldSeasonMinimumClubs(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 3 || count > 200) {
    throw new Error("Set the minimum to between 3 and 200 Clubs.");
  }
  return count;
}

export function fieldSeasonProjectedPrizes(season, count) {
  const extra = Math.max(0, count - (Number(season.minimumClubs) || 3));
  return Object.fromEntries(["first", "second", "third"].map(place => [
    place,
    Math.round((
      Number(season.prizes?.[place] || 0) +
      extra * Number(season.prizeIncreasePerClub?.[place] || 0)
    ) * 100) / 100,
  ]));
}
