export const FIELD_BOOTH_RETURN_MS = 20000;
export function recoverFieldClock(state, now = Date.now()) {
  if (!state?.running || state.status !== 'live') return state;
  const saved = Number(state.clockObservedAtMs || state.updatedAtMs || now);
  if(saved>now)return {...state,clockObservedAtMs:now};
  const elapsed = Math.max(0, Math.floor((now - saved) / 1000));
  const boundary = state.clockVersion === 1 && state.clockPhase === 'first_half'
    ? Math.floor(Number(state.matchSeconds) / 2) : 0;
  const secondsLeft = Math.max(boundary, Number(state.secondsLeft) - elapsed);
  if (secondsLeft <= boundary) return {...state, secondsLeft, running: false,
    timeUp: boundary === 0, clockObservedAtMs: now,
    ...(state.clockVersion === 1 ? {clockPhase: boundary ? 'halftime' : 'full_time',
      ...(boundary ? {halftimeEndsAtMs: saved + Math.max(0, Number(state.secondsLeft) - boundary) * 1000 + Number(state.halftimeSeconds || 0) * 1000} : {})} : {})};
  return {...state, secondsLeft, clockObservedAtMs: saved + elapsed * 1000};
}
export function sameBooth(a, b) {
  return !!a && !!b && a.fixtureId === b.fixtureId && a.boothEpoch === b.boothEpoch &&
    a.liveMatchController?.uid === b.liveMatchController?.uid &&
    a.liveMatchController?.deviceId === b.liveMatchController?.deviceId;
}
export function applyPendingBooth(server, local) {
  if (!sameBooth(server, local?.state)) return server;
  const patches = (local.pending || []).filter(p => p.seq > Number(server.boothLastSeq || 0));
  return patches.reduce((state, entry) => ({...state, ...entry.patch}), server);
}
