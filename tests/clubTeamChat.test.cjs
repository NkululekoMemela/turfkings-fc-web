const test=require('node:test'),assert=require('node:assert/strict');
const {teamContext,handle,roomKey}=require('../functions/clubTeamChat.cjs');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const user={uid:'u1',email_verified:true};
const members=[{id:'m1',uid:'u1',playerId:'p1',fullName:'Alex One',status:'active'},{id:'m2',uid:'u2',playerId:'p2',fullName:'Bea Two',status:'active'},{id:'admin',uid:'admin',playerId:'p3',role:'admin',status:'active'}];
const state={activeSeasonId:'s1',seasons:[{seasonId:'s1',teams:[{id:'red',label:'Reds',players:['p1']},{id:'blue',players:['p2']}]}]};
function f(){const f=fixture({'clubs/club':{ownerUid:'admin'},'clubs/club/state/main':{state},...Object.fromEntries(members.map(m=>['clubs/club/members/'+m.id,m]))});for(const team of state.seasons[0].teams)f.records.set(`privateTeamChatAccess/club/rooms/${roomKey('club','s1',team.id)}`,{team,seasonId:'s1',memberIds:team.id==='red'?['m1']:['m2'],active:true});const collection=f.db.collection;f.db.collection=path=>{const q=collection(path);q.orderBy=()=>q;return q;};return f;}
test('only verified UID-bound active team members see a room; Club admin has no automatic access',()=>{
 assert.deepEqual(teamContext(state,members,user).rooms.map(r=>r.team.id),['red']);assert.deepEqual(teamContext(state,members,{uid:'admin',email_verified:true}).rooms,[]);
 for(const u of [null,{uid:'u1'},{...user,cameraSession:true},{uid:'stranger',email_verified:true}])assert.throws(()=>teamContext(state,members,u));
});
test('cross-team sends and forged team IDs cannot read or write',async()=>{
 const data=f();for(const action of ['messages','send'])await assert.rejects(handle({db:data.db,user,body:{action,clubId:'club',teamId:'blue',text:'private',requestId:'one'}}),/current team members/);
 assert.equal([...data.records.keys()].some(p=>p.startsWith('privateTeamChats/')),false);
});
test('sending is idempotent and revalidates current roster before the next read or send',async()=>{
 const data=f(),body={action:'send',clubId:'club',teamId:'red',text:'Tactics',requestId:'same'};
 await handle({db:data.db,user,body,now:1000});await handle({db:data.db,user,body,now:1001});assert.equal([...data.records.keys()].filter(p=>p.includes('/messages/')).length,1);
 const changed=JSON.parse(JSON.stringify(state));changed.seasons[0].teams[0].players=[];data.records.set('clubs/club/state/main',{state:changed});data.records.get(`privateTeamChatAccess/club/rooms/${roomKey('club','s1','red')}`).memberIds=[];
 await assert.rejects(handle({db:data.db,user,body:{...body,requestId:'next'}}),/current team members/);
 await assert.rejects(handle({db:data.db,user,body:{...body,action:'messages'}}),/current team members/);
});
test('ambiguous legacy names never grant access, while unique legacy names and captains resolve',()=>{
 const s={teams:[{id:'red',players:['Alex One']}]};assert.equal(teamContext(s,members,user).rooms.length,1);
 assert.equal(teamContext(s,[...members,{id:'another',uid:'another',fullName:'Alex One',status:'active'}],user).rooms.length,0);
 assert.equal(teamContext({teams:[{id:'red',players:[],captainId:'p1'}]},members,user).rooms.length,1);
 assert.notEqual(roomKey('club','s1','red'),roomKey('club','s2','red'));
});
test('private team namespace is excluded from the broad legacy rule',()=>{
 const rules=require('node:fs').readFileSync(require('node:path').join(__dirname,'../firestore.rules'),'utf8');assert.ok(rules.includes('match /privateTeamChats/{document=**} { allow read, write: if false; }'));assert.ok(rules.includes('["privateFieldClubChats","privateTeamChatAccess","privateTeamChats","notificationRegistrations"'));
});
test('private push targets current teammates only, respects team mute and carries the team badge',async t=>{
 const runtime=require('../functions/notificationRuntime.cjs'),media=require('../functions/notificationMedia.cjs');
 const sent=[];t.mock.method(runtime,'registeredTokens',async(_db,ids)=>ids.map(uid=>({uid,token:uid})));t.mock.method(runtime,'reliableBatch',async args=>{sent.push(args);});t.mock.method(media,'senderPortrait',async()=> 'https://example.com/player.jpg');
 const data=f(),s=JSON.parse(JSON.stringify(state));s.seasons[0].teams[0].players.push('p4');s.seasons[0].teams[0].logoUrl='https://example.com/red.png';data.records.set('clubs/club/state/main',{state:s});data.records.set('clubs/club/members/m4',{uid:'u4',playerId:'p4',status:'active'});data.records.get(`privateTeamChatAccess/club/rooms/${roomKey('club','s1','red')}`).memberIds.push('m4');data.records.get(`privateTeamChatAccess/club/rooms/${roomKey('club','s1','red')}`).team=s.seasons[0].teams[0];
 const message={clubId:'club',teamId:'red',seasonId:'s1',teamName:'Reds',senderUid:'u1',senderName:'Alex',text:'Private tactics'},event={data:{data:()=>message},params:{messageId:'msg'}};
 const args={db:data.db,auth:{getUser:async()=>({emailVerified:true})},messaging:{},event};await require('../functions/clubTeamChat.cjs').notify(args);
 assert.deepEqual(sent[0].tokenRecords.map(r=>r.uid),['u4']);assert.equal(sent[0].data.groupLogoUrl,'https://example.com/red.png');assert.equal(sent[0].data.type,'club_team_chat');
 data.records.set(`privateTeamChats/${roomKey('club','s1','red')}/preferences/u4`,{muted:true});await require('../functions/clubTeamChat.cjs').notify(args);assert.equal(sent.length,1);
});

test('assigned teammates get immediate access with no approval document or setup action',async()=>{
 const data=f();for(const key of [...data.records.keys()])if(key.startsWith('privateTeamChatAccess/'))data.records.delete(key);
 const result=await handle({db:data.db,user,body:{action:'rooms',clubId:'club'}});assert.deepEqual(result.rooms.map(r=>r.id),['red']);assert.equal(result.canManage,false);
 await handle({db:data.db,user,body:{action:'send',clubId:'club',teamId:'red',text:'Ready',requestId:'instant'}});
 for(const action of ['setupPreview','setupSave'])await assert.rejects(handle({db:data.db,user,body:{action,clubId:'club'}}));
});
test('league room history survives later weeks; rooms are limited to the active mode and season',async()=>{
 const data=f(),s=JSON.parse(JSON.stringify(state));s.seasons[0].matchDayHistory=[{id:'week1'},{id:'week2'}];data.records.set('clubs/club/state/main',{state:s});
 assert.equal((await handle({db:data.db,user,body:{action:'rooms',clubId:'club'}})).rooms[0].id,'red');
 s.seasons[0].matchType='FRIENDLY';s.seasons[0].fiveVFiveTeams=[{id:'dark',players:['p1'],captainId:'p1'}];s.seasons[0].friendlyMatchDayHistory=[];
 data.records.set('clubs/club/state/main',{state:s});
 const rooms=await handle({db:data.db,user,body:{action:'rooms',clubId:'club'}});assert.equal(rooms.rooms[0].id,'dark');assert.ok(rooms.rooms[0].captains.includes('Alex One'));
 await handle({db:data.db,user,body:{action:'send',clubId:'club',teamId:'dark',text:'Defend together',requestId:'captain'}});
 assert.equal([...data.records.values()].find(r=>r.text==='Defend together').senderIsCaptain,true);
 s.seasons[0].friendlyMatchDayHistory.push({id:'ended'});data.records.set('clubs/club/state/main',{state:s});
 assert.equal((await handle({db:data.db,user,body:{action:'rooms',clubId:'club'}})).rooms[0].seasonId,'s1:friendly:1');
 await assert.rejects(handle({db:data.db,user,body:{action:'send',clubId:'club',teamId:'dark',seasonId:'s1:friendly:0',text:'Old room',requestId:'ended'}}),/session has changed/);
});
test('no assigned squads means no team launcher; friendly expiry is enforced',async()=>{
 const data=f();data.records.set('clubs/club/state/main',{state:{activeSeasonId:'s1',seasons:[{seasonId:'s1',teams:[{id:'red',players:[]}]}]}});
 const result=await handle({db:data.db,user,body:{action:'rooms',clubId:'club'}});assert.equal(result.hasTeams,false);assert.equal(result.rooms.length,0);
});
test('ending a friendly permanently closes its room and cannot close a newer approved session',async()=>{
 const records=[{active:true,mode:'friendly',baseSeasonId:'s1',updatedAt:{toMillis:()=>1000}},{active:true,mode:'friendly',baseSeasonId:'s1',updatedAt:{toMillis:()=>3000}},{active:true,mode:'league',baseSeasonId:'s1'}];
 const db={collection:()=>({get:async()=>({docs:records.map(record=>({data:()=>record,ref:{set:async patch=>Object.assign(record,patch)}}))})})};
 const before={state:{activeSeasonId:'s1',seasons:[{seasonId:'s1',matchType:'FRIENDLY',friendlyMatchDayHistory:[]}]}};
 const after={state:{activeSeasonId:'s1',seasons:[{seasonId:'s1',matchType:'FRIENDLY',friendlyMatchDayHistory:[{id:'ended'}]}]}};
 const event={params:{clubId:'club'},data:{before:{data:()=>before},after:{exists:true,data:()=>after,updateTime:{toMillis:()=>2000}}}};
 await require('../functions/clubTeamChat.cjs').closeFriendly({db,event});assert.equal(records[0].active,false);assert.equal(records[1].active,true);assert.equal(records[2].active,true);
});
test('obsolete approvals cannot grant a removed player access',async()=>{
 const data=f(),s=JSON.parse(JSON.stringify(state));s.seasons[0].teams[0].players=[];data.records.set('clubs/club/state/main',{state:s});assert.equal((await handle({db:data.db,user,body:{action:'rooms',clubId:'club'}})).rooms.length,0);
});
