const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const {submit,project,sendWindow}=require('../functions/fieldMatchDaySquad');
const {loadFieldMatchRoster}=require('../functions/fieldMatchRoster');
const scope={venueId:'field',seasonId:'season',clubId:'club'},user={uid:'captain'};
const day={id:'day',dateLocal:'2030-10-10',status:'scheduled',fixtureIds:['fixture']};
const game={id:'fixture',matchDayId:'day',clubAId:'club',clubBId:'opponent',scheduledLocal:'2030-10-10T18:00',status:'scheduled'};
const season={id:'season',status:'active',gameFormat:'5_V_5',scheduleVersion:1,schedulePublishedAtMs:1,clubIds:['club','opponent'],matchDays:[day],fixtures:[game]};
const now=Date.parse('2030-10-09T09:00:00+02:00');
const body={...scope,matchDayId:'day',memberIds:Array.from({length:5},(_,i)=>'member'+i),kitConfirmed:true};
function setup(){
 const records={'leagueVenues/field':{ownerUid:'staff',league:{activeSeason:season}}};
 for(const club of season.clubIds){
  records['clubs/'+club]={ownerUid:'captain',name:club};records['clubFieldMemberships/'+club]={status:'active',venueId:'field'};const squad='leagueSeasonSquads/field~season~'+club;const entries={};
  for(let i=0;i<6;i++){
   const memberId='member'+i,sourcePlayerId='player'+i;
   records[`clubs/${club}/members/${memberId}`]={uid:'user'+i,playerId:sourcePlayerId,status:'active'};
   records[`clubs/${club}/players/${sourcePlayerId}`]={status:'active',fullName:'Player '+i,ownsNumberedBib:true,bibColor:'Blue',jerseyNumber:i};
   entries[memberId]={memberId,sourcePlayerId,fullName:'Player '+i,invitationStatus:'accepted',paymentStatus:'paid',currency:'ZAR',contributionCents:10000,paidCents:10000,paymentConfirmedByUid:'captain'};
   records[`${squad}/paymentConfirmations/${memberId}`]={venueId:'field',seasonId:'season',clubId:club,memberId,sourcePlayerId,currency:'ZAR',amountCents:10000,confirmedByUid:'captain'};
  }
  records[squad]={venueId:'field',seasonId:'season',clubId:club,version:1,status:'active',updatedAt:1,entries};
 }
 const f=fixture(records);const original=f.db.runTransaction;
 f.db.runTransaction=async fn=>{const result=await original(fn);for(const data of f.records.values())for(const key of Object.keys(data))if(key.includes('.')){const fields=key.split('.');let dest=data;for(const field of fields.slice(0,-1))dest=dest[field]??={};dest[fields.at(-1)]=data[key];delete data[key];}return result;};
 f.send=(patch={},time=now)=>submit({db:f.db,user,body:{...body,...patch},now:time});return f;
}
test('server atomically submits owned bibs and numbered manifest with captain confirmation',async()=>{
 const f=setup();await f.send();const manifest=f.records.get('leagueVenues/field/seasons/season/fieldMatchDayManifests/day/clubs/club');assert.equal(manifest.players[0].jerseyNumber,0);assert.equal(manifest.players.every(p=>p.ownsNumberedBib),true);assert.equal(manifest.kitConfirmedByUid,'captain');assert.equal(manifest.kitRequirementVersion,1);
});
test('server refuses spoofed ownership, missing captain confirmation, physical number mismatch and late submissions',async()=>{
 for(const mode of ['noBib','noConfirmation','numberMismatch','late']){
  const f=setup();if(mode==='noBib')f.records.get('clubs/club/players/player0').ownsNumberedBib=false;
  const patch=mode==='noConfirmation'?{kitConfirmed:false}:mode==='numberMismatch'?{kitNumbers:{player0:12}}:{};
  await assert.rejects(f.send(patch,mode==='late'?Date.parse('2030-10-09T18:00:00+02:00')+1:now));assert.equal(f.records.has('leagueVenues/field/seasons/season/fieldMatchDayManifests/day/clubs/club'),false);
 }
});
test('match-start roster refuses a missing bib even after both captains submitted',async()=>{
 const f=setup();await f.send();await f.send({clubId:'opponent'});await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));
 f.records.get('clubs/club/players/player0').ownsNumberedBib=false;
 await assert.rejects(f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game})),/confirmed/);
});
test('submission may be prepared early and neither staging nor testMode bypasses the 24-hour deadline',()=>{
 const deadline=Date.parse('2030-10-09T18:00:00+02:00');assert.equal(sendWindow({day,fixture:game,now:now-86400000}).sendAllowed,true);assert.equal(sendWindow({day,fixture:game,now:deadline}).sendAllowed,true);assert.equal(sendWindow({day,fixture:game,now:deadline+1,testMode:true,projectId:'five-asides-near-me-staging'}).sendAllowed,false);
});
test('legacy numberless submissions are not silently treated as kit-confirmed',()=>{
 const candidates=Array.from({length:5},(_,i)=>({memberId:'m'+i,sourcePlayerId:'p'+i,fullName:'Player '+i}));const first=project({scope,day,fixture:game,candidates});assert.equal(project({scope,day,fixture:game,candidates,saved:{fingerprint:first.fingerprint,memberIds:candidates.map(p=>p.memberId),submittedAtMs:now}}).confirmed,false);
});
