const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const {handle,roomKey}=require('../functions/clubTeamChat.cjs');
function setup(){
 const f=fixture({'clubs/club':{ownerUid:'owner'},'clubs/club/state/main':{state:{seasonId:'season',teams:[{id:'red',label:'Reds',players:['p1','p2'],captainId:'p1',logoUrl:'https://example.com/red.png'},{id:'blue',players:['p3']}]}},'clubs/club/members/m1':{uid:'u1',playerId:'p1',fullName:'Alex',status:'active',role:'captain'},'clubs/club/members/m2':{uid:'u2',playerId:'p2',fullName:'Bea',status:'active',role:'player'},'clubs/club/members/m3':{uid:'u3',playerId:'p3',fullName:'Cal',status:'active',role:'player'}});
 const raw=f.db.collection;f.db.collection=path=>{const q=raw(path);q.orderBy=()=>q;q.where=(field,op,value)=>({get:async()=>({docs:(await raw(path).get()).docs.filter(d=>op==='>'?d.data()[field]>value:d.data()[field]===value)})});return q;};
 return f;
}
const user={uid:'u1',email_verified:true},body={clubId:'club',teamId:'red'};
test('own logo and unread count appear automatically; reading preserves mute and excludes own messages',async()=>{
 const f=setup(),path=`privateTeamChats/${roomKey('club','season','red')}`;
 f.records.set(path+'/messages/one',{senderUid:'u2',senderName:'Bea',text:'Defend',createdAtMs:100});f.records.set(path+'/messages/two',{senderUid:'u1',senderName:'Alex',text:'Okay',createdAtMs:101});f.records.set(path+'/preferences/u1',{muted:true});
 let rooms=(await handle({db:f.db,user,body:{action:'rooms',clubId:'club'}})).rooms;assert.equal(rooms.length,1);assert.equal(rooms[0].logoUrl,'https://example.com/red.png');assert.equal(rooms[0].unreadCount,1);
 await handle({db:f.db,user,body:{...body,action:'messages'}});assert.equal(f.records.get(path+'/preferences/u1').lastReadAtMs,undefined);
 await handle({db:f.db,user,body:{...body,action:'messages',markRead:true}});assert.deepEqual(f.records.get(path+'/preferences/u1'),{muted:true,lastReadAtMs:101});
 rooms=(await handle({db:f.db,user,body:{action:'rooms',clubId:'club'}})).rooms;assert.equal(rooms[0].unreadCount,0);
 await assert.rejects(handle({db:f.db,user,body:{...body,teamId:'blue',action:'messages',markRead:true}}),/current team members/);
});
test('operator preparation is automatic for real captains, never accepts a chosen role or another UID',async()=>{
 const f=setup();assert.deepEqual(await handle({db:f.db,user,body:{action:'prepareOperator',clubId:'club'}}),{ready:true});assert.equal(f.records.get('clubStateOperators/club/users/u1').memberId,'m1');
 await assert.rejects(handle({db:f.db,user:{uid:'u2',email_verified:true},body:{action:'prepareOperator',clubId:'club',role:'admin',memberId:'m1'}}),/captain or admin/);
 f.records.get('clubs/club/members/m1').status='removed';await assert.rejects(handle({db:f.db,user,body:{action:'prepareOperator',clubId:'club'}}),/captain or admin/);
 assert.deepEqual(await handle({db:f.db,user:{uid:'owner',email_verified:true},body:{action:'prepareOperator',clubId:'club'}}),{ready:true});
});
test('read markers never move backwards and mute does not erase them',async()=>{
 const f=setup(),path=`privateTeamChats/${roomKey('club','season','red')}`;
 f.records.set(path+'/preferences/u1',{muted:true,lastReadAtMs:500});f.records.set(path+'/messages/one',{senderUid:'u2',createdAtMs:100});
 await handle({db:f.db,user,body:{...body,action:'messages',markRead:true}});assert.equal(f.records.get(path+'/preferences/u1').lastReadAtMs,500);
 const raw=f.db.doc;f.db.doc=p=>({...raw(p),set:async(data,options)=>f.records.set(p,{...(options?.merge?f.records.get(p):{}),...data})});
 await handle({db:f.db,user,body:{...body,action:'mute',muted:false}});assert.deepEqual(f.records.get(path+'/preferences/u1'),{muted:false,lastReadAtMs:500});
});
