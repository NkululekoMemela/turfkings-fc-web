const test=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
test('one-device staging testing includes the sender only when explicitly enabled, and still respects team mute',async t=>{
 const runtime=require('../functions/notificationRuntime.cjs'),sent=[];t.mock.method(runtime,'registeredTokens',async(_db,ids)=>ids.map(uid=>({uid,token:uid})));t.mock.method(runtime,'reliableBatch',async args=>{sent.push(args);return {successCount:args.tokenRecords.length,failureCount:0};});
 const f=fixture({'clubs/club':{name:'Club'},'clubs/club/state/main':{state:{seasonId:'season',teams:[{id:'red',label:'Brazil',players:['p1']}]}},'clubs/club/members/m1':{uid:'user',playerId:'p1',fullName:'Alex Player',status:'active'}}),api=require('../functions/clubTeamChat.cjs');
 const message={clubId:'club',teamId:'red',seasonId:'season',teamName:'Brazil',senderUid:'user',senderName:'Alex',text:'Testing'},args={db:f.db,auth:{getUser:async()=>({emailVerified:true})},messaging:{},event:{data:{data:()=>message},params:{messageId:'one'}}};
 await api.notify(args);assert.equal(sent.length,0);await api.notify({...args,includeSenderForTesting:true});assert.deepEqual(sent[0].tokenRecords.map(r=>r.uid),['user']);
 f.records.set(`privateTeamChats/${api.roomKey('club','season','red')}/preferences/user`,{muted:true});await api.notify({...args,includeSenderForTesting:true});assert.equal(sent.length,1);
});
