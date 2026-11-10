import test from "node:test";
import assert from "node:assert/strict";
import {fieldFixtureStartRecovery as classify,recoveredFieldMatchSummary} from "../functions/fieldFixtureStartRecovery.mjs";
const season={id:"s",gameFormat:"5_V_5",results:[],matchDayHistory:[]};
const fixture={id:"f",matchDayId:"d",status:"scheduled",clubAId:"a",clubBId:"b"};
const match=()=>({venueId:"v",seasonId:"s",fixtureId:"f",teamAId:"a",teamBId:"b",
  status:"live",running:false,awaitingKitVerification:true,clockPhase:"first_half",
  goalsA:0,goalsB:0,currentEvents:[],events:[],startedByUid:"ref"});
const approval={venueId:"v",seasonId:"s",fixtureId:"f",used:true,actorUid:"ref",clubAId:"a",clubBId:"b"};
const policy=(live,extra={})=>classify({venueId:"v",season,fixture,match:live,approval,liveDocumentId:"f",...extra});
test("an orphaned, unplayed lineup check can be replaced after fresh approval",()=>{
  assert.equal(policy(match()).kind,"replace-unstarted");
  assert.equal(policy(null).kind,"new");
});
test("a duplicate tap on an indexed match reopens it instead of resetting it",()=>{
  assert.equal(policy(match(),{indexedMatch:{status:"live",liveDocumentId:"f"}}).kind,"resume");
});
test("an actual approved match is recovered without resetting scores, clock or controller",()=>{
  const live={...match(),awaitingKitVerification:false,running:true,goalsA:2,secondsLeft:381,
    currentEvents:[{id:"goal",type:"goal"}],liveMatchController:{uid:"other",deviceId:"other-phone"}};
  assert.equal(policy(live).kind,"resume");
  const summary=recoveredFieldMatchSummary({season,fixture,match:live,approval,liveDocumentId:"f"});
  assert.equal(summary.scoreA,2);assert.equal(summary.startedByUid,"ref");
  assert.equal(live.secondsLeft,381);assert.equal(live.liveMatchController.uid,"other");
});
test("completed and archived results are never reset even for a nil-nil match",()=>{
  assert.throws(()=>policy({...match(),status:"completed"}),/saved result/);
  assert.throws(()=>policy(match(),{season:{...season,results:[{fixtureId:"f",status:"completed",goalsA:0,goalsB:0}]}}),/saved result/);
});
test("unknown documents with play and mismatched fixture references are preserved",()=>{
  assert.throws(()=>policy({...match(),goalsB:1},{approval:null}),/may contain play/);
  assert.throws(()=>policy({...match(),teamAId:"other"}),/different fixture/);
  assert.throws(()=>policy({...match(),venueId:"other"}),/Field reference/);
});
test("a closed match day is not silently reopened",()=>{
  assert.throws(()=>policy(match(),{season:{...season,matchDayHistory:[{scheduledMatchDayId:"d"}]}}),/already closed/);
});
const completed=()=>({...match(),status:"completed",isFinished:true,completedAtMs:1000});
const deletion=()=>({venueId:"v",seasonId:"s",fixtureId:"f",actorUid:"manager",reason:"Wrong result entered",atMs:2000,
  result:{fixtureId:"f"},fixture:{...fixture,status:"completed"}});
test("a manager-reversed exact fixture can be replayed while the other leg stays recorded",()=>{
  assert.equal(policy(completed(),{reversal:deletion(),season:{...season,results:[{fixtureId:"first-leg",status:"completed"}]}}).kind,"replace-reversed");
});
test("another leg's reversal or an older reversal cannot reset a completed result",()=>{
  for(const reversal of [{...deletion(),fixtureId:"first-leg"},{...deletion(),atMs:999},
    {...deletion(),seasonId:"old-season"},{...deletion(),fixture:{...fixture,clubAId:"other"}}])
    assert.throws(()=>policy(completed(),{reversal}),/saved result/);
  assert.throws(()=>policy(completed(),{reversal:deletion(),season:{...season,results:[{fixtureId:"f",status:"completed"}]}}),/saved result/);
});
