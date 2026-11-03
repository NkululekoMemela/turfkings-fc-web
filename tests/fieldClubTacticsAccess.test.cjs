const test=require('node:test'),assert=require('node:assert/strict');
const {tacticsMembers}=require('../functions/fieldClubTacticsAccess.cjs');
const members=Array.from({length:8},(_,i)=>({id:`m${i}`,uid:`u${i}`,playerId:`p${i}`,status:'active',fullName:`Player ${i}`,role:i===7?'admin':i===0?'captain':'player'}));
const squad={status:'active',entries:Object.fromEntries(members.slice(0,6).map(m=>[m.id,{invitationStatus:'accepted',sourcePlayerId:m.playerId}]))};
const run=(season={},options={})=>tacticsMembers({season,clubId:'club',squad,members,...options}).map(m=>m.id);
test('only the selected league players enter; admin and ownership provide no bypass',()=>assert.deepEqual(run(),members.slice(0,6).map(m=>m.id)));
const result={status:'completed',clubAId:'club',clubBId:'other',confirmedLineupSnapshot:{club:{positions:{p1:'Player 6'},benchSnapshot:['Player 7'],kitNumbers:[{key:'p6',name:'Player 6'}]}}};
test('a recorded on-pitch season appearance admits former/replacement players, not unused bench',()=>{
 assert.deepEqual(run({results:[result]}),members.slice(0,7).map(m=>m.id));
 assert.deepEqual(run({matchDayHistory:[{results:[result]}]}),members.slice(0,7).map(m=>m.id));
});
test('substitutes who later took the pitch qualify from the lineup timeline',()=>{
 assert.ok(run({results:[{...result,confirmedLineupSnapshot:{},lineupTimeline:[{snapshots:result.confirmedLineupSnapshot}]}]}).includes('m6'));
});
test('unfinished games, opponents, ambiguous names and inactive membership cannot grant access',()=>{
 assert.equal(run({results:[{...result,status:'live'}]}).includes('m6'),false);
 assert.equal(run({results:[{...result,clubAId:'another'}]}).includes('m6'),false);
 assert.equal(run({results:[result]},{members:members.map(m=>m.id==='m6'?{...m,status:'removed'}:m)}).includes('m6'),false);
 assert.equal(run().includes('m6'),false);
});
test('an oversized accepted pool needs a selected five or six rather than admitting every club member',()=>{
 const all={...squad,entries:{...squad.entries,m6:{invitationStatus:'accepted',sourcePlayerId:'p6'}}};
 assert.deepEqual(run({}, {squad:all}),[]);
 const season={matchDays:[{id:'day',status:'scheduled'}],fixtures:[{matchDayId:'day',clubAId:'club',clubBId:'other'}]};
 assert.deepEqual(run(season,{squad:{...all,matchDaySubmissions:{day:{memberIds:['m0','m1','m2','m3','m4']}}}}),['m0','m1','m2','m3','m4']);
});
test('an accepted current-day replacement is part of the selected league team before their first appearance',()=>{
 const season={matchDays:[{id:'day',status:'scheduled'}],fixtures:[{matchDayId:'day',clubAId:'club',clubBId:'other'}]};
 const modified={...squad,matchDayAvailability:{day:{m0:{status:'unavailable'}}},matchDayReplacements:{day:{m0:{invitationStatus:'accepted',originalMemberId:'m0',memberId:'m6',sourcePlayerId:'p6'}}}};
 const ids=run(season,{squad:modified});assert.equal(ids.includes('m6'),true);assert.equal(ids.includes('m0'),false);
});
