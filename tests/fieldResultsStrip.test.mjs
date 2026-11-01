import test from "node:test";
import assert from "node:assert/strict";
import {fieldRecentResults} from "../src/core/fieldResultsStrip.mjs";
const result=(id,a=2,b=1)=>({fixtureId:id,status:"completed",teamAId:"a",teamBId:"b",goalsA:a,goalsB:b});
test("past weeks remain visible once, with corrected current scores taking precedence",()=>{
 const season={fixtures:[{id:"old",matchDayId:"day",scheduledLocal:"2026-10-01T18:00"},{id:"new",scheduledLocal:"2026-10-08T18:00"}],matchDayHistory:[{id:"day",dateLocal:"2026-10-01",results:[result("old",1,1)]}],results:[result("old",3,1),result("new",0,0)]};
 const rows=fieldRecentResults(season);assert.deepEqual(rows.map(row=>row.id),["new","old"]);assert.equal(rows[1].goalsA,3);assert.equal(rows[0].goalsA,0);assert.equal(season.matchDayHistory[0].results[0].goalsA,1);
});
test("missing scores, cancelled games and live games never appear as final 0–0",()=>{
 assert.deepEqual(fieldRecentResults({fixtures:[{id:"unplayed",status:"completed"}],liveMatches:{live:{status:"live"}},results:[result("live"),result("blank","",1),result("missing",null,1),result("invalid",-1,2),{...result("cancelled"),status:"cancelled"}]}),[]);
});
test("archive-only games keep names and dates and withdrawn current results hide stale archived copies",()=>{
 const season={matchDayHistory:[{dateLocal:"2026-10-01",results:[{...result("old"),teamAName:"Alpha",teamBName:"Beta"}]}]};
 assert.equal(fieldRecentResults(season)[0].dateLocal,"2026-10-01");assert.equal(fieldRecentResults(season)[0].teamAName,"Alpha");season.results=[{...result("old"),status:"cancelled"}];assert.deepEqual(fieldRecentResults(season),[]);
});
test("empty seasons remain empty and score strings are normalised",()=>{assert.deepEqual(fieldRecentResults(null),[]);assert.equal(fieldRecentResults({results:[result("one","7","0") ]})[0].goalsA,7);});
