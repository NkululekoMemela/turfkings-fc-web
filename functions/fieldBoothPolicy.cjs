const {randomUUID} = require('node:crypto');
const roles = new Set(['field_manager', 'assistant_manager', 'field_assistant', 'other_staff', 'referee']);
const patchKeys = new Set(['currentEvents', 'events', 'secondsLeft', 'running', 'timeUp',
  'clockVersion', 'clockPhase', 'halftimeSeconds', 'halftimeEndsAtMs', 'matchSeconds',
  'confirmedLineupSnapshot', 'confirmedLineupsByMatchNo', 'matchTeamColorOverrides',
  'lineupTimeline', 'goalsA', 'goalsB', 'clockObservedAtMs',
  'awaitingKitVerification', 'startedAtMs', 'startedAtISO']);
function isOperator(venue, staff, uid) {
  return venue?.ownerUid === uid || staff?.status === 'active' && roles.has(staff.role);
}
function holdsBooth(live, uid, deviceId) {
  return live?.status === 'live' && live.liveMatchController?.uid === uid &&
    live.liveMatchController?.deviceId === deviceId;
}
function validGrant(grant, live, uid, now = Date.now()) {
  return live?.status === 'live' && grant?.uid === uid && grant.fixtureId === live.fixtureId &&
    grant.epoch === live.boothEpoch && grant.expiresAtMs > now;
}
function checkedPatch(patch) {
  if (!patch || Array.isArray(patch) || typeof patch !== 'object' ||
      Object.keys(patch).some(key => !patchKeys.has(key))) throw Error('This match update is not allowed.');
  if (JSON.stringify(patch).length > 600000) throw Error('This match update is too large.');
  for (const key of ['secondsLeft', 'matchSeconds', 'halftimeSeconds', 'halftimeEndsAtMs', 'clockObservedAtMs']) {
    if (key in patch && (!Number.isFinite(patch[key]) || patch[key] < 0)) throw Error('Invalid match clock.');
  }
  for (const key of ['running', 'timeUp']) if (key in patch && typeof patch[key] !== 'boolean') throw Error('Invalid match clock.');
  if (patch.currentEvents && (!Array.isArray(patch.currentEvents) || patch.currentEvents.length > 2000)) throw Error('Invalid match events.');
  return {...patch, ...(patch.currentEvents ? {events: patch.currentEvents} : {})};
}
function transfer(live, controller, now = Date.now()) {
  return {...live, boothVersion: 1, boothEpoch: randomUUID(), boothLastSeq: 0,
    liveMatchController: {...controller, acquiredAtISO: new Date(now).toISOString()},
    liveMatchTakeoverRequest: null, boothGuest: null, boothInvite: null, boothInviteId: null, takeoverAtISO: new Date(now).toISOString()};
}
module.exports = {isOperator, holdsBooth, validGrant, checkedPatch, transfer};
