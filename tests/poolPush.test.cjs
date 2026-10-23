const test=require('node:test'),assert=require('node:assert/strict');
const {deliver,audience,validSubscription}=require('../functions/poolPush.cjs');
function fixture(initial){
 const records=new Map(Object.entries(initial));let queue=Promise.resolve();
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>({exists:records.has(path),data:()=>structuredClone(records.get(path))}),set:async(data,options)=>records.set(path,{...(options?.merge?records.get(path):{}),...structuredClone(data)})});
 const db={doc:ref,collection:path=>({where:(_field,_op,value)=>({get:async()=>({docs:[...records].filter(([key,data])=>key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1&&data.uid===value).map(([key,data])=>({id:key.split('/').at(-1),ref:ref(key),data:()=>structuredClone(data)}))})})}),runTransaction:fn=>{const result=queue.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,data)=>writes.push([r.path,structuredClone(data)])});for(const [p,d]of writes)records.set(p,d);return result;});queue=result.catch(()=>{});return result;}};return {db,records};
}
const code='12345ABCDE',night={ownerUid:'host',title:'Friday pool',members:{host:{name:'Host',status:'approved'},player:{name:'Alex',status:'pending'},next:{name:'Sam',status:'approved'}},pool:{matches:[{id:'match',verification:'pending'}]}};
const device=(uid,token)=>({kind:'native',uid,token,enabled:true});
test('resolved joins, verified scores and former admins do not receive obsolete pushes',()=>{
 assert.deepEqual(audience(night,{kind:'join',subjectUid:'player'}),['host']);assert.deepEqual(audience(night,{kind:'score',matchId:'match'}),['host']);
 const transferred={...night,ownerUid:'next'};assert.deepEqual(audience(transferred,{kind:'join',subjectUid:'player'}),['next']);assert.deepEqual(audience(transferred,{kind:'admin',subjectUid:'host'}),[]);
 assert.deepEqual(audience({...night,members:{...night.members,player:{status:'approved'}}},{kind:'join',subjectUid:'player'}),[]);
 assert.deepEqual(audience({...night,pool:{matches:[{id:'match',verification:'verified'}]}},{kind:'score',matchId:'match'}),[]);
});
test('successful device sends are not repeated after a partial failure and retry',async()=>{
 const f=fixture({[`poolNights/${code}`]:night,'poolNights/_pushDevices/devices/a':device('host','a'),'poolNights/_pushDevices/devices/b':device('host','b')});const sent=[];let fail=true;
 const sendNative=async token=>{sent.push(token);if(token==='b'&&fail)throw Error('temporary');};
 const args={db:f.db,code,alertId:'event',alert:{kind:'join',subjectUid:'player'},sendNative};
 await assert.rejects(deliver(args),/retry/);fail=false;await deliver(args);await deliver(args);assert.deepEqual(sent,['a','b','b']);
});
test('handover routes to new admin, never a player who merely shares a display name',async()=>{
 const f=fixture({[`poolNights/${code}`]:{...night,ownerUid:'next'},'poolNights/_pushDevices/devices/a':device('host','old'),'poolNights/_pushDevices/devices/b':device('next','new'),'poolNights/_pushDevices/devices/c':device('player','outsider')});const sent=[];
 await deliver({db:f.db,code,alertId:'event',alert:{kind:'join',subjectUid:'player'},sendNative:async(token,payload)=>sent.push([token,payload.recipientUid])});assert.deepEqual(sent,[['new','next']]);
});
test('dead device tokens are disabled without blocking other devices',async()=>{
 const f=fixture({[`poolNights/${code}`]:night,'poolNights/_pushDevices/devices/a':device('host','expired'),'poolNights/_pushDevices/devices/b':device('host','valid')});const sent=[];
 await deliver({db:f.db,code,alertId:'event',alert:{kind:'join',subjectUid:'player'},sendNative:async token=>{if(token==='expired')throw Object.assign(Error('expired'),{code:'messaging/registration-token-not-registered'});sent.push(token);}});assert.deepEqual(sent,['valid']);assert.equal(f.records.get('poolNights/_pushDevices/devices/a').enabled,false);
});
test('browser push subscriptions reject internal, credentialed, non-TLS and unsupported destinations',()=>{
 const keys={p256dh:'A'.repeat(87),auth:'B'.repeat(22)};
 for(const endpoint of ['http://fcm.googleapis.com/push','https://127.0.0.1/push','https://fcm.googleapis.com.evil.test/push','https://user:pass@fcm.googleapis.com/push','https://fcm.googleapis.com:8443/push'])assert.throws(()=>validSubscription({endpoint,keys}));
 assert.equal(validSubscription({endpoint:'https://fcm.googleapis.com/push/abc',keys}).endpoint,'https://fcm.googleapis.com/push/abc');
});
test('browser sends use private VAPID keys server-side and a same-origin route',async()=>{
 const f=fixture({[`poolNights/${code}`]:night,'poolNights/_pushKeys':{publicKey:'pub',privateKey:'secret'},'poolNights/_pushDevices/devices/a':{kind:'web',enabled:true,uid:'host',origin:'https://five-asides-near-me-development.web.app',subscription:{endpoint:'https://fcm.googleapis.com/push'}}});const sent=[];
 await deliver({db:f.db,code,alertId:'event',alert:{kind:'join',subjectUid:'player'},sendWeb:async(subscription,payload,keys)=>sent.push({subscription,payload,keys})});assert.equal(sent[0].keys.privateKey,'secret');assert.equal(sent[0].payload.privateKey,undefined);assert.equal(sent[0].payload.url,`https://five-asides-near-me-development.web.app/?poolNight=${code}&poolTab=players`);
});
