import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let instance=0;
async function setup() {
  const storage=new Map();
  globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  const events=new EventTarget();globalThis.window=events;window.localStorage=localStorage;
  Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
  globalThis.__boothAuth={currentUser:{uid:'referee',isAnonymous:false,getIdToken:async()=> 'verified-token'}};
  const result=await build({entryPoints:['src/storage/fieldBoothJournal.js'],bundle:true,format:'esm',write:false,logLevel:'silent',plugins:[{
    name:'firebase-test-boundary',setup(b){b.onResolve({filter:/firebaseConfig\.js$/},()=>({path:'firebase',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const auth=globalThis.__boothAuth;export const activeFirebaseProjectId="test-project";export const getActiveFirebaseFunctionsBaseUrl=()=>"https://functions.invalid";'}));}
  }]});
  const journal=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text+`\n// instance ${++instance}`).toString('base64')}`);
  const scope={kind:'venueLeague',environment:'official',venueId:'field',seasonId:'season'};
  const deviceId=localStorage.getItem('fanmVenueRefereeDeviceId')||'phone';localStorage.setItem('fanmVenueRefereeDeviceId',deviceId);
  const state={status:'live',fixtureId:'fixture',boothVersion:1,boothEpoch:'epoch',boothLastSeq:0,currentEvents:[],running:true,timeUp:false,secondsLeft:100,clockObservedAtMs:Date.now(),liveMatchController:{uid:'referee',deviceId}};
  journal.rememberBoothContext(scope,{live:state,venue:{id:'field'},season:{id:'season'},teams:[]});
  return {journal,scope,state,storage};
}
test('offline actions are durable immediately and bounded by coalescing unsent snapshots',async()=>{
  const {journal,scope,storage}=await setup();
  for(let i=0;i<100;i++)await journal.queueBoothPatch(scope,{currentEvents:Array.from({length:i+1},(_,id)=>({id,type:'goal'}))});
  const saved=journal.readBooth(scope);
  assert.equal(saved.pending.length,1);assert.equal(saved.state.currentEvents.length,100);assert.equal(saved.pending[0].seq,1);
  assert.equal(journal.savedBooth().scope.venueId,'field');
  const durable=JSON.parse(storage.get('fanm-field-booth:test-project:referee:field:season'));
  assert.equal(durable.state.currentEvents.length,100);
});
test('reconnect uploads saved actions once and acknowledges without discarding newer local work',async()=>{
  const {journal,scope}=await setup();await journal.queueBoothPatch(scope,{currentEvents:[{id:'one'}]});
  let release;const started=new Promise(resolve=>{release=resolve;});let ack;
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);ack=body.seq;release();await new Promise(resolve=>setTimeout(resolve,5));return {ok:true,json:async()=>({ack:body.seq})};};
  navigator.onLine=true;const upload=journal.flushBooth(scope);await started;
  await journal.queueBoothPatch(scope,{currentEvents:[{id:'one'},{id:'two'}]});
  await upload;
  assert.equal(ack,2);assert.equal(journal.readBooth(scope).pending.length,0);assert.equal(journal.readBooth(scope).state.currentEvents.length,2);
});
test('refused uploads retain the full record and prevent further recording over a replacement',async()=>{
  const {journal,scope}=await setup();await journal.queueBoothPatch(scope,{currentEvents:[{id:'local-goal'}]});
  globalThis.fetch=async()=>({ok:false,status:403,json:async()=>({error:'Another referee has control.'})});
  navigator.onLine=true;await assert.rejects(journal.flushBooth(scope),/Another referee/);
  const saved=journal.readBooth(scope);assert(saved.conflict);assert.equal(saved.pending[0].patch.currentEvents[0].id,'local-goal');
  await assert.rejects(journal.queueBoothPatch(scope,{currentEvents:[]}),/Reopen/);
});
test('a storage failure is surfaced instead of reporting that an action was saved',async()=>{
  const {journal,scope}=await setup();localStorage.setItem=()=>{throw Error('Quota exceeded');};
  await assert.rejects(journal.queueBoothPatch(scope,{currentEvents:[{id:'goal'}]}),/Quota/);
});
test('offline final whistle remains pending until upload and does not claim standings are updated',async()=>{
  const {journal,scope}=await setup();const summary={teamAId:'a',teamBId:'b',goalsA:1,goalsB:0};
  assert.deepEqual(await journal.finishBooth(scope,summary),{pending:true});
  assert.deepEqual(journal.readBooth(scope).finishSummary,summary);assert.equal(journal.readBooth(scope).state.running,false);
});
test('saved matches are isolated by signed-in account',async()=>{
  const {journal,scope}=await setup();globalThis.__boothAuth.currentUser.uid='different';
  assert.equal(journal.readBooth(scope),null);assert.equal(journal.savedBooth(),null);
});
test('completed handover retires the old resume shortcut without discarding unsent evidence',async()=>{
  const {journal,scope,state}=await setup();
  const replacement={...state,boothEpoch:'replacement',liveMatchController:{uid:'replacement',deviceId:'other-phone'}};
  journal.rememberBoothContext(scope,{live:replacement,venue:{id:'field'},season:{id:'season'},teams:[]});
  assert.equal(journal.savedBooth().state.status,'handed_over');
});
test('handover during an outage preserves unsent events as a conflict for review',async()=>{
  const {journal,scope,state}=await setup();await journal.queueBoothPatch(scope,{currentEvents:[{id:'unsent'}]});
  journal.rememberBoothContext(scope,{live:{...state,boothEpoch:'replacement',liveMatchController:{uid:'replacement',deviceId:'other-phone'}},venue:{id:'field'},season:{id:'season'},teams:[]});
  const saved=journal.savedBooth();assert.equal(saved.conflict,true);assert.equal(saved.pending[0].patch.currentEvents[0].id,'unsent');
});
test('a timed-out request cannot lose a later goal by reusing its uncertain sequence',async()=>{
  const {journal,scope}=await setup();await journal.queueBoothPatch(scope,{currentEvents:[{id:'first'}]});
  globalThis.fetch=async()=>{throw Error('Connection dropped after server commit');};
  navigator.onLine=true;await assert.rejects(journal.flushBooth(scope));navigator.onLine=false;
  await journal.queueBoothPatch(scope,{currentEvents:[{id:'first'},{id:'second'}]});
  const local=journal.readBooth(scope);assert.equal(local.pending.length,2);
  assert.equal(local.pending[0].patch.currentEvents.length,1);assert.equal(local.pending[1].seq,2);
  const sent=[];globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);sent.push(body);return{ok:true,json:async()=>({ack:body.seq})};};
  navigator.onLine=true;await journal.flushBooth(scope);
  assert.deepEqual(sent.map(item=>item.seq),[1,2]);assert.equal(sent[1].patch.currentEvents.length,2);
  assert.equal(journal.readBooth(scope).pending.length,0);
});
