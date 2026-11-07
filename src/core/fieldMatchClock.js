export function tickFieldMatchClock(state, now = Date.now()) {
  if (state?.clockVersion === 1 && state.clockPhase === "halftime") {
    return state.running ? {...state, running: false} : state;
  }
  if (!state?.running || state.timeUp || state.status !== "live") return state;
  const secondsLeft = Math.max(0, Number(state.secondsLeft) - 1);
  const halftimeBoundary = Math.floor(Number(state.matchSeconds) / 2);
  if (state.clockVersion === 1 &&
      state.clockPhase === "first_half" && secondsLeft <= halftimeBoundary) {
    return {
      ...state, secondsLeft: halftimeBoundary, running: false, timeUp: false,
      clockPhase: "halftime",
      halftimeEndsAtMs: now + Math.max(0, Number(state.halftimeSeconds) || 0) * 1000,
    };
  }
  return {
    ...state, secondsLeft,
    running: secondsLeft > 0, timeUp: secondsLeft <= 0,
    ...(state.clockVersion === 1 && secondsLeft <= 0
      ? {clockPhase: "full_time"} : {}),
  };
}

export function startFieldSecondHalf(state) {
  if (state?.clockVersion !== 1 || state.clockPhase !== "halftime") {
    throw new Error("This match is not at halftime.");
  }
  return {
    clockPhase: "second_half", running: true, timeUp: false,
    secondsLeft: Math.floor(Number(state.matchSeconds) / 2),
    halftimeEndsAtMs: state.halftimeEndsAtMs,
  };
}

export function fieldHalfSecondsLeft(state) {
  if (state?.clockPhase === "halftime") return 0;
  const remaining = Math.max(0, Number(state?.secondsLeft) || 0);
  return state?.clockPhase === "first_half"
    ? Math.max(0, remaining - Math.floor(Number(state.matchSeconds) / 2))
    : remaining;
}

export function fieldMatchProgress({matchSeconds, secondsLeft, additionalSeconds = 0,
  additionalSecondsLeft = 0, timeUp = false}) {
  const regulation = Math.max(0, Number(matchSeconds) || 0);
  const extra = Math.max(0, Number(additionalSeconds) || 0);
  const total = regulation + extra;
  const remaining = Math.max(0, Number(secondsLeft) || 0)
    + Math.max(0, Number(additionalSecondsLeft) || 0);
  if (!total) return timeUp ? 100 : 0;
  return Math.max(0, Math.min(100, (1 - remaining / total) * 100));
}
