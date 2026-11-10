export function tickFieldMatchClock(state, now = Date.now(), step = 1) {
  if (state?.clockVersion === 1 && state.clockPhase === "halftime") {
    return state.running ? {...state, running: false} : state;
  }
  if (!state?.running || state.timeUp || state.status !== "live") return state;
  const secondsLeft = Math.max(0, Number(state.secondsLeft) - step);
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


// Each Practice half runs normally for 30 ticks, then skips a minute every 10 ticks.
export function tickPracticeFieldMatchClock(state, now = Date.now()) {
  if (state?.environment !== "practice" || !state.running || state.timeUp ||
      state.status !== "live" || !["first_half", "second_half"].includes(state.clockPhase)) return state;
  const ticks = Math.max(0, Number(state.practiceHalfTicks) || 0) + 1;
  const jump = ticks >= 30 && (ticks - 30) % 10 === 0 ? 60 : 0;
  return {...tickFieldMatchClock(state, now, 1 + jump), practiceHalfTicks:ticks, clockObservedAtMs:now};
}

export function practiceClockCanResume(state) {
  return state?.environment === "practice" && state.status === "live" &&
    !state.running && !state.timeUp && !state.awaitingKitVerification &&
    Number(state.secondsLeft) > 0 && ["first_half", "second_half"].includes(state.clockPhase) &&
    [state.teamAId || state.currentMatch?.teamAId, state.teamBId || state.currentMatch?.teamBId]
      .every(id => id && state.confirmedLineupSnapshot?.[id]?.kitVerification);
}

export function mergePracticeFieldClock(local, incoming) {
  if (!local || !incoming || incoming.environment !== "practice" ||
      local.practiceSessionId !== incoming.practiceSessionId || local.fixtureId !== incoming.fixtureId ||
      !local.running || !incoming.running || local.clockPhase !== incoming.clockPhase ||
      Number(local.clockObservedAtMs || 0) <= Number(incoming.clockObservedAtMs || 0)) return incoming;
  const {secondsLeft, practiceHalfTicks, clockObservedAtMs} = local;
  return {...incoming, secondsLeft, practiceHalfTicks, clockObservedAtMs};
}
