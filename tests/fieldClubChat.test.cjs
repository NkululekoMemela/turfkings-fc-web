const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs'),{handle,roomKey}=require('../functions/fieldClubChat.cjs');
function setup(){const f=fixture({'leagueVenues/field':{ownerUid:'staff',league:{activeSeason:{id:'season',status:'active',clubIds:['club'],invitations:{club:{status:'accepted'}}}}},'clubs/club':{name:'My Club'},'clubFieldMemberships/club':{venueId:'field',status:'active'},'clubs/club/members/captain':{uid:'captain',status:'active',fullName:'Captain',role:'captain'},'clubs/club/members/player':{uid:'player',playerId:'p-player',status:'active',fullName:'Player',role:'player'},'leagueSeasonSquads/field~season~club':{status:'active',entries:{player:{invitationStatus:'accepted',sourcePlayerId:'p-player'}}}});const collection=f.db.collection;f.db.collection=path=>{const q=collection(path);q.orderBy=()=>q;return q;};return f;}
const body={venueId:'field',clubId:'club'},user={uid:'captain',email_verified:true};
test('only a verified member of an accepted official Club gets its season room; Field staff have no bypass',async()=>{
 const f=setup(),rooms=await handle({db:f.db,user,body:{...body,action:'rooms'}});assert.equal(rooms.rooms[0].id,'club');assert.equal(rooms.rooms[0].captains[0],'Captain');
 for(const uid of ['staff','outsider']){assert.equal((await handle({db:f.db,user:{uid,email_verified:true},body:{...body,action:'rooms'}})).rooms.length,0);await assert.rejects(handle({db:f.db,user:{uid,email_verified:true},body:{...body,action:'messages'}}),/Only members/);}
});
test('captain labels are server assigned; ended seasons and removed memberships lose access',async()=>{
 const f=setup();await handle({db:f.db,user,body:{...body,action:'send',text:'Tactics',requestId:'one'}});assert.equal([...f.records.values()].find(v=>v.text==='Tactics').senderIsCaptain,true);
 await handle({db:f.db,user:{uid:'player',email_verified:true},body:{...body,action:'send',text:'Hello',requestId:'two',senderIsCaptain:true}});assert.equal([...f.records.values()].find(v=>v.text==='Hello').senderIsCaptain,false);
 f.records.get('leagueVenues/field').league.activeSeason.status='completed';await assert.rejects(handle({db:f.db,user,body:{...body,action:'messages'}}),/Only members/);
 f.records.get('leagueVenues/field').league.activeSeason.status='active';f.records.get('clubs/club/members/captain').status='inactive';await assert.rejects(handle({db:f.db,user,body:{...body,action:'messages'}}),/Only members/);
 assert.notEqual(roomKey('field','season','club'),roomKey('field','next','club'));
});
test('unaccepted Clubs, wrong Field links, camera accounts and stale season links are rejected',async()=>{
 for(const mutate of [f=>f.records.get('clubFieldMemberships/club').venueId='other',f=>f.records.get('leagueVenues/field').league.activeSeason.invitations.club.status='pending']){const f=setup();mutate(f);assert.equal((await handle({db:f.db,user,body:{...body,action:'rooms'}})).rooms.length,0);}
 await assert.rejects(handle({db:setup().db,user:{...user,cameraSession:true},body:{...body,action:'rooms'}}),/verified/);
 await assert.rejects(handle({db:setup().db,user,body:{...body,action:'messages',seasonId:'old'}}),/season has changed/);
});

test('Club players outside the accepted season squad cannot read its tactics room',async()=>{
 const f=setup();f.records.set('clubs/club/members/bench',{uid:'bench',playerId:'p-bench',status:'active',role:'player'});
 assert.equal((await handle({db:f.db,user:{uid:'bench',email_verified:true},body:{...body,action:'rooms'}})).rooms.length,0);
 f.records.get('leagueSeasonSquads/field~season~club').entries.player.invitationStatus='declined';
 await assert.rejects(handle({db:f.db,user:{uid:'player',email_verified:true},body:{...body,action:'messages'}}),/Only members/);
});
