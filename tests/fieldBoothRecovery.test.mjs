import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverFieldClock,applyPendingBooth,FIELD_BOOTH_RETURN_MS} from '../src/core/fieldBoothRecovery.mjs';
test('reopening after power loss recovers elapsed time but never skips the halftime pause',()=>{
  const state={status:'live',running:true,matchSeconds:1200,secondsLeft:700,clockVersion:1,clockPhase:'first_half',halftimeSeconds:120,clockObservedAtMs:100000};
  assert.equal(recoverFieldClock(state,130000).secondsLeft,670);
  const half=recoverFieldClock(state,400000);assert.equal(half.secondsLeft,600);assert.equal(half.running,false);assert.equal(half.clockPhase,'halftime');assert.equal(half.halftimeEndsAtMs,320000);
  assert.equal(recoverFieldClock(half,500000).clockPhase,'halftime');
});
test('paused clock, full time, clock skew and fractional ticks recover predictably',()=>{
  const state={status:'live',running:true,matchSeconds:1200,secondsLeft:10,clockObservedAtMs:100000};
  assert.equal(recoverFieldClock(state,120000).timeUp,true);
  assert.equal(recoverFieldClock(state,99999).secondsLeft,10);
  assert.equal(recoverFieldClock(state,101500).clockObservedAtMs,101000);
  const paused={...state,running:false};assert.equal(recoverFieldClock(paused,900000),paused);
  assert.equal(FIELD_BOOTH_RETURN_MS,20000);
});
test('pending data is overlaid only for the same fixture, account, device and referee session',()=>{
  const state={fixtureId:'f',boothEpoch:'e',boothLastSeq:1,liveMatchController:{uid:'u',deviceId:'d'},secondsLeft:20};
  const local={state,pending:[{seq:1,patch:{secondsLeft:100}},{seq:2,patch:{secondsLeft:18}}]};
  assert.equal(applyPendingBooth(state,local).secondsLeft,18);
  for(const changed of [{...state,fixtureId:'other'},{...state,boothEpoch:'new'},{...state,liveMatchController:{uid:'other',deviceId:'d'}}])assert.equal(applyPendingBooth(changed,local),changed);
});
