const {test} = require('node:test');
const assert = require('node:assert/strict');
const {operate} = require('../functions/fieldBooth.cjs');
const {checkedPatch,validGrant} = require('../functions/fieldBoothPolicy.cjs');
const now=1800000000000, venueId='field-one',seasonId='season-one',fixtureId='fixture-one';
const livePath=`leagueVenues/${venueId}/seasons/${seasonId}/matches/current`;
function database() {
  const docs=new Map();let counter=0;
  const ref=path=>({path,id:path.split('/').at(-1),collection:name=>({doc:id=>ref(`${path}/${name}/${id||`generated-${++counter}`}`)}),get:async()=>snapshot(path)});
  const snapshot=path=>({exists:docs.has(path),data:()=>structuredClone(docs.get(path))});
  const db={docs,doc:ref,runTransaction:async fn=>{
    const original=new Map(docs);let written=false;
    const tx={get:async r=>{assert.equal(written,false,'all transaction reads precede writes');return snapshot(r.path);},
      set:(r,v)=>{written=true;docs.set(r.path,structuredClone(v));},
      create:(r,v)=>{written=true;assert(!docs.has(r.path));docs.set(r.path,structuredClone(v));},
      update:(r,patch)=>{written=true;assert(docs.has(r.path));const next=structuredClone(docs.get(r.path));for(const [path,value]of Object.entries(patch)){const keys=path.split('.');let object=next;for(const key of keys.slice(0,-1))object=object[key]||(object[key]={});object[keys.at(-1)]=structuredClone(value);}docs.set(r.path,next);},
      delete:r=>{written=true;docs.delete(r.path);}};
    try{return await fn(tx);}catch(error){docs.clear();for(const [k,v]of original)docs.set(k,v);throw error;}
  }};
  const fixture={id:fixtureId,clubAId:'a',clubBId:'b',clubAName:'Alpha',clubBName:'Bravo',status:'scheduled'};
  docs.set(`leagueVenues/${venueId}`,{id:venueId,name:'Test Field',ownerUid:'manager',league:{activeSeason:{id:seasonId,fixtures:[fixture],clubIds:['a','b','c'],results:[],allEvents:[],currentMatchNo:1,streaks:{},liveMatches:{[fixtureId]:{...fixture,status:'live',standbyId:'c'}}}}});
  for(const uid of ['referee','other'])docs.set(`leagueVenues/${venueId}/staff/${uid}`,{status:'active',role:'referee'});
  docs.set(livePath,{venueId,seasonId,fixtureId,status:'live',boothVersion:1,boothEpoch:'epoch-one',boothLastSeq:0,
    liveMatchController:{uid:'referee',deviceId:'phone-one',name:'Original referee'},
    currentEvents:[],teamAId:'a',teamBId:'b',teamALabel:'Alpha',teamBLabel:'Bravo',matchSeconds:1200,secondsLeft:300,currentMatchNo:1,teams:[]});
  return db;
}
const call=(db,op,fields={},uid='referee',deviceId='phone-one',time=now)=>operate({db,user:{uid,name:uid,email:`${uid}@example.com`,email_verified:true},now:time,body:{op,venueId,seasonId,fixtureId,deviceId,epoch:'epoch-one',...fields}});

test('temporary access is disabled, including codes created before this update',async()=>{
 const db=database();for(const op of ['join','createInvite','approveInvite'])await assert.rejects(call(db,op,{code:'abcdefghijkl'}),/Temporary referee access is disabled/);
});
test('previously delegated players cannot control, finish or cancel a match',async()=>{
 const db=database(),live=db.docs.get(livePath);
 live.liveMatchController={uid:'guest',deviceId:'guest-phone'};live.boothGuest={uid:'guest',fixtureId,epoch:'epoch-one',expiresAtMs:now+100000};
 for(const op of ['context','sync','finish','cancel','requestTakeover'])await assert.rejects(call(db,op,{seq:1,patch:{}},'guest','guest-phone'));
});
test('a registered referee can recover from a retired guest automatically after 15 seconds',async()=>{
 const db=database();db.docs.get(livePath).liveMatchController={uid:'guest',deviceId:'guest-phone'};
 await call(db,'requestTakeover');await assert.rejects(call(db,'takeover',{},'referee','phone-one',now+14999),/not ready/);
 await call(db,'takeover',{},'referee','phone-one',now+15000);
 const live=db.docs.get(livePath);assert.equal(live.liveMatchController.uid,'referee');assert.equal(live.boothGuest,null);assert.notEqual(live.boothEpoch,'epoch-one');
});
test('rejection blocks automatic recovery and staff membership is rechecked before transfer',async()=>{
 const db=database();await call(db,'requestTakeover',{},'other','phone-two');await call(db,'rejectTakeover');
 await assert.rejects(call(db,'takeover',{},'other','phone-two',now+16000),/Request recovery again/);
 await call(db,'requestTakeover',{},'other','phone-two');db.docs.set(`leagueVenues/${venueId}/staff/other`,{status:'inactive',role:'referee'});
 await assert.rejects(call(db,'acceptTakeover'),/no longer a Field official/);
});
test('offline uploads stay ordered and a previous session cannot overwrite a recovered match',async()=>{
 const db=database();await call(db,'sync',{seq:1,patch:{secondsLeft:299}});await call(db,'sync',{seq:1,patch:{secondsLeft:700}});assert.equal(db.docs.get(livePath).secondsLeft,299);
 await assert.rejects(call(db,'sync',{seq:3,patch:{}}),/missing/);
 await call(db,'requestTakeover',{},'other','phone-two');await call(db,'takeover',{},'other','phone-two',now+15000);
 await assert.rejects(call(db,'sync',{seq:2,patch:{secondsLeft:999}}),/no longer controls/);
 for(const name of ['boothGuest','liveMatchController','boothEpoch','fixtureId','status'])assert.throws(()=>checkedPatch({[name]:'forged'}),/not allowed/);
});
test('an official finish updates standings once and still preserves kit verification',async()=>{
 const db=database(),summary={teamAId:'a',teamBId:'b',goalsA:2,goalsB:1};await call(db,'finish',{summary});await call(db,'finish',{summary});
 const season=db.docs.get(`leagueVenues/${venueId}`).league.activeSeason;assert.equal(season.results.length,1);assert.equal(season.currentMatchNo,2);assert.equal(db.docs.get(livePath).status,'completed');
 const next=database(),snapshots=Object.fromEntries(['a','b'].map(id=>[id,{kitVerification:{revision:1},kitNumbers:[{key:'one',name:'One',number:1},{key:'two',name:'Two',number:1}]}]));
 await assert.rejects(call(next,'sync',{seq:1,patch:{confirmedLineupSnapshot:snapshots}}),/number|Number|duplicate|Duplicate|share/i);
});

test('recorded event corrections are scoped to active administrators and the finishing referee',async()=>{
 const db=database(), venuePath=`leagueVenues/${venueId}`;
 const live=db.docs.get(livePath);
 live.currentEvents=[{id:'card-one',type:'yellow_card',teamId:'a',playerName:'Old name',timeSeconds:60}];
 const summary={teamAId:'a',teamBId:'b',goalsA:2,goalsB:1};
 await call(db,'finish',{summary});
 const before=db.docs.get(venuePath).league.activeSeason;
 before.matchDayHistory=[{results:before.results,allEvents:before.allEvents}];
 const edit={action:'edit',eventId:'card-one',event:{playerName:'New name',timeSeconds:75}};
 await assert.rejects(call(db,'correctResultEvent',edit,'other'),/Only a Field administrator/);
 await assert.rejects(call(db,'correctResultEvent',edit,'guest'),/Only a Field administrator/);
 await call(db,'correctResultEvent',edit);
 let season=db.docs.get(venuePath).league.activeSeason;
 assert.equal(season.results[0].goalsA,2);
 assert.equal(season.results[0].goalsB,1);
 for(const events of [season.results[0].events,season.allEvents,season.matchDayHistory[0].allEvents,db.docs.get(livePath).currentEvents]){
   assert.equal(events.find(e=>e.id==='card-one').playerName,'New name');
 }
 db.docs.set(`${venuePath}/staff/admin-two`,{status:'active',isAdministrator:true});
 await call(db,'correctResultEvent',{action:'add',event:{type:'goal',teamId:'b',playerName:'Striker',assist:'Helper'}},'admin-two');
 season=db.docs.get(venuePath).league.activeSeason;
 assert.equal(season.results[0].goalsA,2);
 assert.equal(season.results[0].goalsB,2);
 assert.equal(season.results[0].isDraw,true);
 assert.equal(season.fixtures[0].goalsB,2);
 db.docs.get(`${venuePath}/staff/referee`).status='inactive';
 await assert.rejects(call(db,'correctResultEvent',edit),/Only a Field administrator/);
});
