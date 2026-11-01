const test=require('node:test'),assert=require('node:assert/strict');
const {teamContext}=require('../functions/clubTeamChat.cjs');
const user={uid:'u1',email_verified:true};
const members=[{id:'m1',uid:'u1',sourcePlayerId:'p1',fullName:'Alex One',status:'active'},{id:'m2',uid:'u2',fullName:'Bea Two',status:'active'}];
test('captain player objects and source IDs resolve to the current member',()=>{
 for(const captain of [{sourcePlayerId:'p1'},{name:'Alex One'},{displayName:'Alex One'}]){
 const ctx=teamContext({teams:[{id:'red',players:['p1'],captain}]},members,user);
 assert.deepEqual([...ctx.rooms[0].captainMemberIds],['m1']);
 }
});
test('ambiguous captain names never identify or admit another player',()=>{
 const ctx=teamContext({teams:[{id:'red',players:['p1'],captain:{name:'Alex One'}}]},[...members,{id:'m3',uid:'u3',fullName:'Alex One',status:'active'}],user);
 assert.equal(ctx.rooms[0].captainMemberIds.size,0);assert.equal(ctx.rooms[0].memberIds.has('m3'),false);
});
