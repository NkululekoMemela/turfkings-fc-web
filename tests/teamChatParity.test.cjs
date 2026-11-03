const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const {handle,roomKey,notify}=require('../functions/clubTeamChat.cjs');
const user={uid:'u1',email_verified:true},other={uid:'u2',email_verified:true};
const body={clubId:'club',teamId:'red',seasonId:'season'};
function setup(){
 const f=fixture({'clubs/club':{name:'My Club'},'clubs/club/state/main':{state:{seasonId:'season',teams:[{id:'red',label:'Brazil',players:['p1','p2'],captainId:'p1'},{id:'blue',label:'Liverpool',players:['p3']}]}},
  'clubs/club/members/m1':{uid:'u1',playerId:'p1',fullName:'Alex One',shortName:'Ace',status:'active'},'clubs/club/members/m2':{uid:'u2',playerId:'p2',fullName:'Bea Two',status:'active'},'clubs/club/members/m3':{uid:'u3',playerId:'p3',fullName:'Cal Three',status:'active'},'clubs/club/publicPlayerPhotos/p1':{photoUrl:'https://example.com/ace.jpg'},
  'clubs/club/video_highlights/match':{},'clubs/club/video_highlights/match/raw/clip':{clubId:'club',title:'Winning goal',mediaUrl:'https://example.com/goal.mp4',playerName:'Ace',createdAtMs:100},'clubs/other/video_highlights/match/raw/clip':{clubId:'other',mediaUrl:'https://example.com/other.mp4'}});
 const raw=f.db.collection;f.db.collection=path=>{const q=raw(path);q.orderBy=()=>q;return q;};return f;
}
const send=(f,user,fields)=>handle({db:f.db,user,body:{...body,action:'send',requestId:'one',...fields},now:1000});
const messages=f=>handle({db:f.db,user,body:{...body,action:'messages'}});
function firstMessage(f){return [...f.records.entries()].find(([path])=>path.startsWith('privateTeamChats/')&&path.includes('/messages/'));}
test('national team flag, trusted player portrait and captain label reach the shared chat renderer',async()=>{
 const f=setup();const rooms=await handle({db:f.db,user,body:{clubId:'club',action:'rooms'}});assert.equal(rooms.rooms[0].flag,'🇧🇷');assert.deepEqual(rooms.rooms.map(r=>r.id),['red']);
 await send(f,user,{text:'Ready',senderPhotoUrl:'https://attacker.invalid',senderIsCaptain:false});const result=await messages(f);
 assert.equal(result.messages[0].senderPhotoUrl,'https://example.com/ace.jpg');assert.equal(result.messages[0].senderRole,'captain');assert.equal(result.canModerate,true);assert.equal(result.members.find(m=>m.uid==='u1').shortName,'Ace');assert.equal(result.members.some(m=>m.uid==='u3'),false);assert.equal(JSON.stringify(result).includes('email'),false);
});
test('reactions use the authenticated player, can change/remove, and cannot mutate another team',async()=>{
 const f=setup();await send(f,user,{text:'Tactics'});const [path]=firstMessage(f),id=path.split('/').at(-1);
 const react=(who,emoji,extra={})=>handle({db:f.db,user:who,body:{...body,action:'react',messageId:id,emoji,...extra}});
 await react(user,'🔥',{reactorUid:'u2'});await react(other,'👏');let result=await messages(f);assert.deepEqual(result.messages[0].reactionsByUser,{u1:'🔥',u2:'👏'});
 await react(user,'😂');await react(other,'');result=await messages(f);assert.deepEqual(result.messages[0].reactionsByUser,{u1:'😂'});
 await assert.rejects(react({uid:'u3',email_verified:true},'🔥'),/team session/);await assert.rejects(react(user,'BAD'),/reaction/);
});
test('reply and mentions are resolved inside the current team; user-supplied quote/names cannot be forged',async()=>{
 const f=setup();await send(f,user,{text:'Hold the line'});const [path]=firstMessage(f),id=path.split('/').at(-1);
 await send(f,other,{requestId:'reply',text:'@Ace okay',replyToId:id,replyToSenderName:'Forged captain',replyToText:'Wrong quote',mentions:['m1','m3']});const result=await messages(f),reply=result.messages.find(m=>m.text==='@Ace okay');assert.equal(reply.replyToText,'Hold the line');assert.equal(reply.replyToSenderName,'Ace');assert.deepEqual(reply.mentions,[{id:'m1',name:'Ace'}]);
 const alien=`privateTeamChats/${roomKey('club','season','blue')}/messages/hidden`;f.records.set(alien,{text:'Other team secret',senderUid:'u3'});await assert.rejects(send(f,user,{requestId:'alien',text:'No',replyToId:'hidden'}),/no longer available/);
});
test('attachment picker lists own Club clips; send reads canonical metadata and permits attachment-only messages',async()=>{
 const f=setup();const list=await handle({db:f.db,user,body:{...body,action:'highlights'}});assert.equal(list.highlights.length,1);assert.equal(list.highlights[0].id,'clip');
 await send(f,user,{text:'',highlight:{id:'clip',matchId:'match',bucket:'raw',mediaUrl:'https://attacker.invalid',title:'Forged'}});const result=await messages(f);assert.equal(result.messages[0].highlightMediaUrl,'https://example.com/goal.mp4');assert.equal(result.messages[0].highlightTitle,'Winning goal');
 await assert.rejects(send(f,user,{requestId:'wrong',text:'No',highlight:{id:'clip',matchId:'match',bucket:'raw',legacy:true}}),/own Club/);
 await assert.rejects(send(f,user,{requestId:'missing',highlight:{id:'missing',matchId:'match',bucket:'raw'}}),/no longer available/);
 assert.equal(result.messages[0].text,'Shared a highlight');
});
test('only author or assigned team captain can delete; removed members lose every advanced action',async()=>{
 const f=setup();await send(f,user,{text:'Captain message'});const [path]=firstMessage(f),id=path.split('/').at(-1);
 await assert.rejects(handle({db:f.db,user:other,body:{...body,action:'delete',messageId:id,isAdmin:true}}),/sender or team captain/);
 await send(f,other,{requestId:'two',text:'Own message'});const own=(await messages(f)).messages.find(m=>m.text==='Own message');await handle({db:f.db,user:other,body:{...body,action:'delete',messageId:own.id}});assert.equal((await messages(f)).messages.find(m=>m.id===own.id).deleted,true);
 f.records.get('clubs/club/members/m1').status='removed';for(const action of ['react','delete','highlights','messages'])await assert.rejects(handle({db:f.db,user,body:{...body,action,messageId:id,emoji:'🔥'}}));
});
test('team push uses preferred nickname and flag; attachment-only messages still send a real chat notification',async t=>{
 const runtime=require('../functions/notificationRuntime.cjs'),sent=[];t.mock.method(runtime,'registeredTokens',async(_db,ids)=>ids.map(uid=>({uid,token:uid})));t.mock.method(runtime,'reliableBatch',async args=>sent.push(args));
 const f=setup();await send(f,user,{highlight:{id:'clip',matchId:'match',bucket:'raw'}});const [path,message]=firstMessage(f);
 await notify({db:f.db,auth:{getUser:async()=>({emailVerified:true})},messaging:{},event:{data:{data:()=>({...message,senderName:'Alex One'})},params:{messageId:path.split('/').at(-1)}}});assert.equal(sent[0].data.senderName,'Ace');assert.equal(sent[0].data.groupFlag,'🇧🇷');assert.match(sent[0].title,/^Ace · Brazil/);assert.deepEqual(sent[0].tokenRecords.map(r=>r.uid),['u2']);
});
test('Field season-Club room uses the same protected replies, attachments and reactions',async()=>{
 const f=setup(),api=require('../functions/fieldClubChat.cjs');f.records.set('leagueVenues/field',{league:{activeSeason:{id:'official',status:'active',clubIds:['club'],invitations:{club:{status:'accepted'}}}}});f.records.set('clubFieldMemberships/club',{venueId:'field',status:'active'});f.records.set('leagueSeasonSquads/field~official~club',{status:'active',entries:{m1:{invitationStatus:'accepted',sourcePlayerId:'p1'},m2:{invitationStatus:'accepted',sourcePlayerId:'p2'}}});
 const scope={venueId:'field',clubId:'club',seasonId:'official'};
 await api.handle({db:f.db,user,body:{...scope,action:'send',text:'Field tactics',requestId:'field'}});let result=await api.handle({db:f.db,user,body:{...scope,action:'messages'}}),id=result.messages[0].id;assert.equal(result.messages[0].senderPhotoUrl,'https://example.com/ace.jpg');
 await api.handle({db:f.db,user:other,body:{...scope,action:'react',messageId:id,emoji:'👏'}});await api.handle({db:f.db,user:other,body:{...scope,action:'send',text:'',requestId:'field-clip',replyToId:id,highlight:{id:'clip',matchId:'match',bucket:'raw'}}});result=await api.handle({db:f.db,user,body:{...scope,action:'messages'}});assert.equal(result.messages.find(m=>m.id===id).reactionsByUser.u2,'👏');assert.equal(result.messages.find(m=>m.attachmentType==='highlight').replyToText,'Field tactics');
 f.records.get('leagueSeasonSquads/field~official~club').entries.m2.invitationStatus='declined';await assert.rejects(api.handle({db:f.db,user:other,body:{...scope,action:'react',messageId:id,emoji:'🔥'}}),/Only members/);
});
test('Portugal and Porto keep separate national/Club identities despite sharing POR',async()=>{
 const f=setup(),team=f.records.get('clubs/club/state/main').state.teams[0];team.label='Portugal';team.teamIdentity={type:'national',abbr:'POR',name:'Portugal',flag:'🇵🇹'};
 let result=await handle({db:f.db,user,body:{clubId:'club',action:'rooms'}});assert.equal(result.rooms[0].flag,'🇵🇹');assert.equal(result.rooms[0].logoUrl,'');
 team.label='Porto';team.teamIdentity={type:'club',abbr:'POR',name:'Porto',logoUrl:'https://example.com/porto.png'};result=await handle({db:f.db,user,body:{clubId:'club',action:'rooms'}});assert.equal(result.rooms[0].flag,'');assert.equal(result.rooms[0].logoUrl,'https://example.com/porto.png');
});
