const test=require('node:test'),assert=require('node:assert/strict');
const {carriedMemberIds,liveDayRoster}=require('../functions/rollingFieldSquad.cjs');
const candidates=Array.from({length:7},(_,i)=>({memberId:'m'+i,sourcePlayerId:'p'+i,fullName:'Player '+i,jerseyNumber:i+1}));
const season={id:'season',matchDays:[{id:'old',dateLocal:'2026-11-01'},{id:'next',dateLocal:'2026-11-08'}],fixtures:[{id:'f1',matchDayId:'old',clubAId:'club',clubBId:'other'},{id:'f2',matchDayId:'next',clubAId:'club',clubBId:'other'}]};
const day=season.matchDays[1],ids=['m0','m1','m2','m3','m4','m5'];
const run=options=>carriedMemberIds({season,day,clubId:'club',candidates,squad:{},...options});
test('the last weekly selection is ready before the next match date even with a larger season pool',()=>assert.deepEqual(run({squad:{matchDaySubmissions:{old:{memberIds:ids}}}}),ids));
test('accepted cover replaces an absent player in the carried team without manual reselection',()=>assert.deepEqual(run({squad:{matchDaySubmissions:{old:{memberIds:ids}}},candidates:[...candidates.slice(1,6),{memberId:'cover',sourcePlayerId:'cover-p',originalMemberId:'m0'}]}),['cover',...ids.slice(1)]));
test('with no weekly submission, the completed match roster is carried using stable player IDs',()=>{
 const completed={...season,results:[{fixtureId:'f1',status:'completed',confirmedLineupSnapshot:{club:{kitNumbers:candidates.slice(0,6).map(p=>({key:p.sourcePlayerId}))}}}]};assert.deepEqual(run({season:completed}),ids);
});
test('first-week six-player roster needs no captain confirmation; oversized unselected pools remain unresolved',()=>{assert.deepEqual(run({candidates:candidates.slice(0,6)}),ids);assert.deepEqual(run({}),[]);});
test('an early live fixture exposes its approved roster without calling a pre-kickoff edit path',()=>{
 const live={status:'live',seasonId:'season',fixtureId:'f2',paidSquads:{club:candidates.slice(0,6)}};
 const result=liveDayRoster({live,season,matchDayId:'next',clubId:'club'});assert.equal(result.players.length,6);assert.equal(result.canManageFormation,false);assert.equal(result.kitNumbers.p5,6);
 assert.equal(liveDayRoster({live,season,matchDayId:'old',clubId:'club'}),null);assert.equal(liveDayRoster({live,season,matchDayId:'next',clubId:'stranger'}),null);
});
test('the Field roster API returns an early-live approved squad without requiring captain submission',async()=>{
 const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
 const active={...season,status:'active',clubIds:['club','other'],schedulePublishedAtMs:1,matchDays:season.matchDays.map(d=>({...d,status:'scheduled'}))};
 const f=fixture({'leagueVenues/field':{ownerUid:'staff',league:{activeSeason:active}},'clubs/club':{name:'Club'},'clubs/other':{name:'Other'},'leagueVenues/field/seasons/season/matches/current':{status:'live',seasonId:'season',fixtureId:'f2',paidSquads:{club:candidates.slice(0,6),other:candidates.slice(0,6)}}});
 const result=await require('../functions/fieldMatchDaySquad.js').getFieldDay({db:f.db,user:{uid:'staff'},body:{venueId:'field',seasonId:'season',matchDayId:'next'}});
 assert.equal(result.clubs.length,2);assert.equal(result.clubs[0].players.length,6);assert.equal(result.clubs[0].rosterSource,'live_match');
});
test('completed fixtures in the same match day do not blank remaining teams or reopen edits',()=>{
 const fixture={...season.fixtures[1],status:'completed'};
 const result=require('../functions/rollingFieldSquad.cjs').completedDayRoster({season:{...season,results:[{fixtureId:'f2',status:'completed',confirmedLineupSnapshot:{club:{kitNumbers:[{key:'p0',name:'Player 0',number:22}]}}}]},fixture,clubId:'club'});
 assert.equal(result.players[0].jerseyNumber,22);assert.equal(result.canManageFormation,false);assert.equal(result.status,'completed');
});
