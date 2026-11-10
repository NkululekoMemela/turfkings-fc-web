import test from "node:test";
import assert from "node:assert/strict";
import {fieldSeasonClosureSummary,fieldSeasonCelebration} from "../functions/fieldSeasonClosure.mjs";
import {buildHandler} from "../functions/fieldSeasonCelebration.cjs";

const season=()=>({id:"season-one",name:"Winter League",status:"completed",endedByUid:"manager",endedAtMs:100,
  clubIds:["a","b","c"],fixtures:[
    {id:"one",clubAId:"a",clubBId:"b",clubAName:"Alpha FC",clubBName:"Bravo FC",status:"completed"},
    {id:"two",clubAId:"a",clubBId:"c",clubAName:"Alpha FC",clubBName:"City FC",status:"completed"},
    {id:"three",clubAId:"b",clubBId:"c",clubAName:"Bravo FC",clubBName:"City FC",status:"completed"}],
  results:[{fixtureId:"one",status:"completed",goalsA:2,goalsB:0},
    {fixtureId:"two",status:"completed",goalsA:3,goalsB:0},
    {fixtureId:"three",status:"completed",goalsA:1,goalsB:0}]});
test("the tournament review deduplicates archived results and names a real champion",()=>{
  const value=season();value.matchDayHistory=[{results:value.results}];
  const summary=fieldSeasonClosureSummary(value);
  assert.equal(summary.completed,3);assert.equal(summary.winner.id,"a");assert.equal(summary.winner.points,6);
  assert.equal(summary.standings[0].played,2);
});
test("unplayed fixtures remain listed and a premature leader is not crowned",()=>{
  const value=season();value.fixtures[1].status="scheduled";value.fixtures[1].scheduledLocal="2026-11-18T19:00";
  const summary=fieldSeasonClosureSummary(value);
  assert.equal(summary.premature,true);assert.deepEqual(summary.outstanding.map(f=>f.id),["two"]);assert.equal(summary.winner,null);
  const party=fieldSeasonCelebration({season:value,venueName:"Wynberg",endedAtMs:100});
  assert.equal(party.winner,null);assert.equal(party.total,3);assert.equal(party.completed,2);
});
test("an unresolved standings tie does not choose a champion alphabetically",()=>{
  const value=season();value.results.forEach(row=>{row.goalsA=0;row.goalsB=0;});
  const summary=fieldSeasonClosureSummary(value);
  assert.equal(summary.winner,null);assert.equal(summary.tied.length,3);
});
test("season finale broadcast reaches Field and participating Club audiences",async()=>{
  let payload;const audience=[];
  const runtime={allFieldAudience:async()=>["staff","fan"],clubAudience:async(_db,id)=>{audience.push(id);return ["captain-"+id];},
    registeredTokens:async(_db,uids)=>uids.map(uid=>({uid,token:uid})),groupImage:async()=>"",
    reliableBatch:async input=>{payload=input;}};
  const handler=buildHandler({db:{doc:()=>({get:async()=>({data:()=>({name:"Wynberg"})})})},
    region:"test",testOnly:true,runtime});
  await handler({data:{data:season},params:{venueId:"wynberg",seasonId:"season-one"}});
  assert.deepEqual(audience,["a","b","c"]);assert.match(payload.title,/Alpha FC.*champions/);
  assert.equal(payload.tokenRecords.length,5);assert.equal(payload.data.route,"field");
  payload=null;
  await handler({data:{data:()=>({...season(),status:"active"})},params:{venueId:"wynberg",seasonId:"season-one"}});
  assert.equal(payload,null);
});
