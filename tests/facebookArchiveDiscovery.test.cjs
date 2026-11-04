const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const {discover}=require('../functions/facebookArchiveDiscovery.cjs');
const {handle,queueId}=require('../functions/facebookReview.cjs');
const good={archiveCategory:'goal',archiveRank:1,voteCount:8,status:'archived',playerName:'Taku',venueName:'Pitch',videoUrl:'https://storage.googleapis.com/example/clip.mp4'};
const source='clubs/turf-kings/video_highlights/old-match/archived/taku';
function data(initial){
 const f=fixture(initial);
 const transaction=f.db.runTransaction;
 f.db.runTransaction=fn=>transaction(tx=>{
  tx.create=(ref,row)=>{assert(!f.records.has(ref.path));tx.set(ref,row);};
  return fn(tx);
 });
 f.db.collectionGroup=()=>{
  let cursor='',size=40;
  const q={orderBy:()=>q,limit:n=>{size=n;return q;},startAfter:r=>{cursor=r.path;return q;},get:async()=>({docs:[...f.records.keys()].filter(path=>path.split('/').at(-2)==='archived'&&path>cursor).sort().slice(0,size).map(path=>({ref:f.ref(path),data:()=>f.records.get(path)}))})};
  return q;
 };
 return f;
}
test('old verified winners are discovered automatically and never published',async()=>{
 const f=data({[source]:good,'clubs/turf-kings':{name:'Turf Kings'}});
 await discover({db:f.db});
 const draft=f.records.get('facebookHighlightQueue/'+queueId(source));
 assert.equal(draft.playerName,'Taku');assert.equal(draft.status,'pending');assert.match(draft.caption,/Throwback/);assert.doesNotMatch(draft.caption,/goal of the night/i);
});
test('catch-up paginates and preserves edited drafts on repeated scans',async()=>{
 const f=data({[source]:good,[source+'-2']:{...good,playerName:'Other'},'clubs/turf-kings':{name:'Turf Kings'}});
 assert.equal((await discover({db:f.db,pageSize:1})).more,true);
 const key='facebookHighlightQueue/'+queueId(source);f.records.get(key).caption='Owner edit';
 await discover({db:f.db,pageSize:1});await discover({db:f.db,pageSize:1});
 assert.equal((await discover({db:f.db})).complete,true);
 assert.equal(f.records.get(key).caption,'Owner edit');
 assert.equal([...f.records.values()].filter(v=>v.status==='pending').length,2);
});
test('Practice clips, non-winners and unsupported paths never queue',async()=>{
 const f=data({[source]:{...good,isPracticeMode:true},[source+'-raw']:{...good,status:'raw'},[source+'-second']:{...good,archiveRank:2},'practice/a/x/b/archived/c':good});
 await discover({db:f.db});assert.equal([...f.records.values()].filter(v=>v.status==='pending').length,0);
});
test('another active discovery lease is respected',async()=>{
 const f=data({'facebookHighlightQueue/_archiveDiscovery':{leaseUntil:1000}});
 assert.equal((await discover({db:f.db,now:1})).more,true);assert.equal(f.records.size,1);
});
test('unverified users cannot trigger historical discovery',async()=>{
 await assert.rejects(handle({db:{},user:{email:'other@test.com',email_verified:true},body:{action:'list'}}),/Only the verified/);
});
