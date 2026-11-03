const test=require('node:test');
const assert=require('node:assert/strict');
const {deliver}=require('../functions/facebookHighlightNotifications.cjs');
const id='a'.repeat(64),uid='owner-uid';
function fixture({status='pending',devices=[{token:'phone-token',enabled:true,firebaseUid:uid}],shared=[],verified=true,reassigned=false}={}){
 const records=new Map(),sent=[],web=[];
 const row=(d,index)=>({id:String(index),data:()=>d,ref:{get:async()=>({data:()=>reassigned?{...d,firebaseUid:'other',uid:'other'}:d}),set:async patch=>Object.assign(d,patch)}});
 function ref(path){return {get:async()=>({data:()=>records.get(path)}),set:async data=>records.set(path,data),collection:name=>({doc:key=>ref(path+'/'+name+'/'+key)})};}
 records.set('facebookHighlightQueue/'+id,{status});records.set('poolNights/_pushKeys',{publicKey:'public',privateKey:'private'});
 const db={doc:ref,collection:path=>({where:(key,op,value)=>({get:async()=>({docs:(path==='notificationRegistrations'?devices:shared).filter(d=>d[key]===value).map(row)})})}),runTransaction:async work=>work({get:r=>r.get(),set:(r,d)=>r.set(d)})};
 const account={uid,email:'nkululekolerato@gmail.com',emailVerified:verified};
 return {db,auth:{getUserByEmail:async()=>account,getUser:async()=>account},messaging:{send:async payload=>sent.push(payload)},sendWeb:async(...args)=>web.push(args),sent,web,records,id};
}
test('only owner devices receive a review link; redelivery is suppressed',async()=>{const f=fixture({devices:[{token:'phone-token',enabled:true,firebaseUid:uid},{token:'wrong',enabled:true,firebaseUid:'other'}],shared:[{kind:'native',token:'phone-token',enabled:true,uid}]});await deliver(f);await deliver(f);assert.equal(f.sent.length,1);assert.equal(f.sent[0].data.draftId,id);assert.equal(f.sent[0].data.recipientUid,uid);assert.equal(f.sent[0].data.type,'facebook_highlight_ready');});
test('web push deep links to the same specific welcome-page draft',async()=>{const f=fixture({devices:[],shared:[{kind:'web',uid,enabled:true,origin:'https://five-asides-near-me-staging.web.app',subscription:{endpoint:'https://fcm.googleapis.com/example'}}]});await deliver(f);assert.equal(f.web.length,1);assert.equal(f.web[0][1].url,`https://five-asides-near-me-staging.web.app/?facebookReview=${id}`);});
test('non-pending drafts and unverified owners never notify',async()=>{for(const options of [{status:'published'},{verified:false}]){const f=fixture(options);await deliver(f);assert.equal(f.sent.length,0);}});
test('reassigned devices are rechecked before sending',async()=>{const f=fixture({reassigned:true});await deliver(f);assert.equal(f.sent.length,0);});
test('transient delivery failure retries, successful deliveries stay recorded',async()=>{const f=fixture();f.messaging.send=async()=>{throw Error('network');};await assert.rejects(deliver(f));f.messaging.send=async payload=>f.sent.push(payload);await deliver(f);await deliver(f);assert.equal(f.sent.length,1);});
test('push worker accepts Facebook drafts and preserves Pool alerts, rejects other recipients',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),events={},shown=[];
 let code=fs.readFileSync(require.resolve('../public/pool-push-sw.js'),'utf8');
 code=code.slice(0,code.indexOf('function store('))+`async function store(){return '${uid}';}\n`+code.slice(code.indexOf("self.addEventListener('message'"));
 const self={addEventListener:(name,handler)=>events[name]=handler,location:{origin:'https://five-asides-near-me-staging.web.app'},registration:{scope:'/pool-push/test/',showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>[]}};
 vm.runInNewContext(code,{self,URL});
 async function push(data){let done;events.push({data:{json:()=>data},waitUntil:p=>done=p});await done;}
 await push({type:'facebook_highlight_ready',draftId:id,recipientUid:uid,url:`/?facebookReview=${id}`});assert.equal(shown.length,1);assert(shown[0].data.url.endsWith('facebookReview='+id));
 await push({type:'facebook_highlight_ready',draftId:id,recipientUid:'other'});assert.equal(shown.length,1);
 await push({type:'facebook_highlight_ready',draftId:'invalid',recipientUid:uid});assert.equal(shown.length,1);
 await push({type:'pool_alert',code:'ABCDEF1234',recipientUid:uid});assert.equal(shown.length,2);
});
