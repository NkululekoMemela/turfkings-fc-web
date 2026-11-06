import {auth, activeFirebaseProjectId, getActiveFirebaseFunctionsBaseUrl} from '../firebaseConfig.js';
import {getVenueRefereeDeviceId} from '../core/venueRefereeController.js';
import {applyPendingBooth, sameBooth, recoverFieldClock} from '../core/fieldBoothRecovery.mjs';
const locks = new Map(), flights = new Map(), listeners = new Map();
const key = scope => `fanm-field-booth:${activeFirebaseProjectId}:${auth.currentUser?.uid}:${scope.venueId}:${scope.seasonId}`;
const lastKey = () => `fanm-field-booth-last:${activeFirebaseProjectId}:${auth.currentUser?.uid}`;
export function readBooth(scope) {
  try { return JSON.parse(localStorage.getItem(key(scope)) || 'null'); } catch { return null; }
}
export function savedBooth() {
  try { const scope = JSON.parse(localStorage.getItem(lastKey()) || 'null'); return scope ? readBooth(scope) : null; } catch { return null; }
}
function write(scope, value) {
  // A storage error must stop an action being reported as saved.
  localStorage.setItem(key(scope), JSON.stringify(value));
  for (const cb of listeners.get(key(scope)) || []) cb(value);
  window.dispatchEvent(new Event('fanm:booth-save'));
}
export function watchBooth(scope, callback) {
  const id = key(scope), set = listeners.get(id) || new Set(); set.add(callback); listeners.set(id, set);
  callback(readBooth(scope));
  return () => { set.delete(callback); if (!set.size) listeners.delete(id); };
}
export async function boothRequest(scope, op, fields = {}) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw Error('Sign in with your own account.');
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const saved = scope ? readBooth(scope) : null;
    const response = await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/fieldRefereeBooth`, {
      method: 'POST', signal: controller.signal,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`},
      body: JSON.stringify({...scope, op, deviceId: getVenueRefereeDeviceId(),
        epoch: saved?.state?.boothEpoch, fixtureId: op==='context' ? undefined : saved?.state?.fixtureId, ...fields}),
    });
    const result = await response.json();
    if (!response.ok) { const error = Error(result.error || 'Could not connect to the Field.'); error.status = response.status; throw error; }
    return result;
  } finally { clearTimeout(timeout); }
}
export function rememberBoothContext(scope, context) {
  let old = readBooth(scope);
  const live = context.live;
  // Never replace unsent work from a previous referee session.
  if (old?.pending?.length && !sameBooth(live, old.state)) {
    if (live.liveMatchController?.uid === auth.currentUser?.uid && live.liveMatchController?.deviceId === getVenueRefereeDeviceId()) {
      localStorage.setItem(`${key(scope)}:review:${old.state.fixtureId}:${old.state.boothEpoch}`,JSON.stringify({...old,conflict:true}));
      old = null;
    } else {
      write(scope, {...old, conflict: true, error: 'Another referee has control. Your local record is kept for review.'});
      return live;
    }
  }
  const state = applyPendingBooth(live, old);
  const controls = state.status === 'live' && state.liveMatchController?.uid === auth.currentUser?.uid &&
    state.liveMatchController?.deviceId === getVenueRefereeDeviceId();
  if (controls) {
    write(scope, {...old, scope, context: {...context, live: undefined}, state,
      pending: (old?.pending || []).filter(p => p.seq > Number(live.boothLastSeq || 0)), conflict: false});
    localStorage.setItem(lastKey(), JSON.stringify(scope));
  } else if (old && !old.pending?.length) {
    write(scope,{...old,state:{...old.state,status:live.status==='live'?'handed_over':live.status,running:false}});
  }
  return state;
}
export function rememberBoothState(scope, state) {
  const old = readBooth(scope);
  if (!old || old.conflict || !sameBooth(state, old.state)) return;
  write(scope, {...old, state});
}
export async function queueBoothPatch(scope, patch) {
  const old = readBooth(scope);
  if (!old?.state?.boothEpoch || old.conflict || old.state.status !== 'live') throw Error('Reopen this referee booth before recording.');
  const pending = [...(old.pending || [])];
  const last = pending.at(-1);
  const updatedPatch = {secondsLeft:old.state.secondsLeft,running:old.state.running,
    timeUp:old.state.timeUp, ...patch, clockObservedAtMs: patch.clockObservedAtMs ||
    ((patch.running === true && !old.state.running) || 'secondsLeft' in patch ? Date.now() : old.state.clockObservedAtMs) || Date.now()};
  if (last && !last.sent && flights.get(key(scope)) !== last.seq) pending[pending.length - 1] = {...last, patch: {...last.patch, ...updatedPatch}};
  else pending.push({seq: Number(last?.seq || old.state.boothLastSeq || 0) + 1, patch: updatedPatch});
  write(scope, {...old, state: {...old.state, ...updatedPatch}, pending, error: ''});
  // Local durability is the acknowledgement. Network work continues separately.
  if (navigator.onLine) void flushBooth(scope).catch(() => {});
}
export function flushBooth(scope) {
  const id = key(scope);
  if (locks.has(id)) return locks.get(id);
  const task = (async () => {
    while (navigator.onLine) {
      const local = readBooth(scope);
      if (!local || local.conflict || !local.pending?.length) return;
      const entry = local.pending[0]; flights.set(id, entry.seq);
      try {
        // A timeout does not prove that the server rejected this action.
        // Once sent, its sequence and payload must remain immutable until acknowledged.
        if(!entry.sent)write(scope,{...local,pending:local.pending.map(p=>p.seq===entry.seq?{...p,sent:true}:p)});
        const result = await boothRequest(scope, 'sync', {seq: entry.seq, patch: entry.patch});
        const fresh = readBooth(scope);
        if (!fresh || !sameBooth(local.state, fresh.state)) return;
        write(scope, {...fresh, state: {...fresh.state, boothLastSeq: result.ack},
          pending: fresh.pending.filter(p => p.seq > result.ack), error: ''});
      } catch (error) {
        const fresh = readBooth(scope);
        if (fresh) write(scope, {...fresh, conflict: error.status === 403,
          error: error.status ? error.message : 'Waiting for connection · saved on this phone'});
        throw error;
      } finally { flights.delete(id); }
    }
  })().finally(() => locks.delete(id));
  locks.set(id, task); return task;
}
export async function finishBooth(scope, summary) {
  const local = readBooth(scope);
  if (!local || local.conflict) throw Error('This phone no longer controls the match.');
  await queueBoothPatch(scope, {running: false, secondsLeft: local.state.secondsLeft, clockObservedAtMs: Date.now()});
  const fresh = readBooth(scope);
  write(scope, {...fresh, finishSummary: summary});
  if (!navigator.onLine) return {pending: true};
  await flushBooth(scope);
  return publishBoothFinish(scope);
}
export async function publishBoothFinish(scope) {
  const local = readBooth(scope);
  if (!local?.finishSummary || local.conflict || local.pending?.length) return {pending: true};
  const result = await boothRequest(scope, 'finish', {summary: local.finishSummary});
  write(scope, {...readBooth(scope), finishSummary: null, state: {...local.state, status: 'completed', running: false}});
  return result;
}
export function recoverSavedBooth(scope) {
  const local = readBooth(scope);
  return local?.state ? recoverFieldClock(local.state) : null;
}
export function markBoothCancelled(scope) {
  const local=readBooth(scope);
  if(local)write(scope,{...local,pending:[],state:{...local.state,status:'cancelled',running:false}});
}
