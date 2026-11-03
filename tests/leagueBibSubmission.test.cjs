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
   records[`clubs/${club}/players/${sourcePlayerId}`]={status:'active',fullName:'Player '+i,ownsNumberedBib:true,bibColor:club==='club'?'Blue':'Green',jerseyNumber:i};
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
 for(const mode of ['noConfirmation','numberMismatch','late']){
  const f=setup();if(mode==='noBib')f.records.get('clubs/club/players/player0').ownsNumberedBib=false;
  const patch=mode==='noConfirmation'?{kitConfirmed:false}:mode==='numberMismatch'?{kitNumbers:{player0:12}}:{};
  await assert.rejects(f.send(patch,mode==='late'?Date.parse('2030-10-10T18:00:00+02:00')+1:now));assert.equal(f.records.has('leagueVenues/field/seasons/season/fieldMatchDayManifests/day/clubs/club'),false);
 }
});
test('missing owned bib is replaced by an automatic match allocation',async()=>{
 const f=setup();await f.send();await f.send({clubId:'opponent'});await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));
 f.records.get('clubs/club/players/player0').ownsNumberedBib=false;
 const result=await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));assert.equal(result.squads.club.find(p=>p.sourcePlayerId==='player0').matchBib.allocationSource,'field');
});
test('submission may be prepared early and neither staging nor testMode bypasses kickoff',()=>{
 const deadline=Date.parse('2030-10-10T18:00:00+02:00');assert.equal(sendWindow({day,fixture:game,now:now-86400000}).sendAllowed,true);assert.equal(sendWindow({day,fixture:game,now:deadline-1}).sendAllowed,true);assert.equal(sendWindow({day,fixture:game,now:deadline+1,testMode:true,projectId:'five-asides-near-me-staging'}).sendAllowed,false);
});
test('legacy numberless submissions are not silently treated as kit-confirmed',()=>{
 const candidates=Array.from({length:5},(_,i)=>({memberId:'m'+i,sourcePlayerId:'p'+i,fullName:'Player '+i}));const first=project({scope,day,fixture:game,candidates});assert.equal(project({scope,day,fixture:game,candidates,saved:{fingerprint:first.fingerprint,memberIds:candidates.map(p=>p.memberId),submittedAtMs:now}}).confirmed,false);
});

test('paid eligible season roster starts without rebuilding or submitting weekly squads',async()=>{
 const f=setup();const result=await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));assert.equal(result.squads.club.length,6);assert.equal(result.squads.opponent.length,6);assert.equal(result.squads.club[0].clubId,'club');
});
test('weekly unavailability excludes a player and a five-player roster still starts',async()=>{
 const f=setup();f.records.get('leagueSeasonSquads/field~season~club').matchDayAvailability={day:{member0:{status:'unavailable'}}};const result=await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));assert.equal(result.squads.club.length,5);assert.equal(result.squads.club.some(p=>p.memberId==='member0'),false);
});
test('too few paid players and oversized rosters remain blocked',async()=>{
 for(const mode of ['unpaid','oversized']){const f=setup();if(mode==='unpaid')for(let i=0;i<2;i++)f.records.get('leagueSeasonSquads/field~season~club').entries['member'+i].paymentStatus='unpaid';if(mode==='kit')f.records.get('clubs/club/players/player0').ownsNumberedBib=false;if(mode==='oversized'){const candidates=Array.from({length:7},(_,i)=>({memberId:'m'+i,sourcePlayerId:'p'+i,fullName:'Player '+i,jerseyNumber:i,ownsNumberedBib:true,bibColor:'Blue'}));assert.equal(project({scope,day,fixture:game,candidates}).ready,false);continue;}await assert.rejects(f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game})));}
});
test('Field teamsheet shows the same inherited roster as kickoff without exposing payments',async()=>{
 const f=setup();const {getFieldDay}=require('../functions/fieldMatchDaySquad');const view=await getFieldDay({db:f.db,user:{uid:'staff'},body:{...scope,matchDayId:'day'}});assert.equal(view.clubs.length,2);assert.equal(view.clubs[0].status,'season_roster');assert.equal(view.clubs[0].confirmed,false);assert.equal(view.clubs[0].ready,true);assert.equal(view.clubs[0].players.length,6);assert.equal(Object.hasOwn(view.clubs[0].players[0],'paidCents'),false);
});

test('captain assigns a hired numbered bib without creating profile ownership or a paid rental',async()=>{
 const f=setup(),profile=f.records.get('clubs/club/players/player0');profile.ownsNumberedBib=false;profile.jerseyNumber=null;profile.bibColor='';
 await f.send({kitAssignments:{player0:{source:'hired',number:6,color:'Blue'}},kitNumbers:{player0:6}});
 const result=await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));const player=result.squads.club.find(p=>p.sourcePlayerId==='player0');assert.equal(player.jerseyNumber,6);assert.equal(player.matchBib.source,'hired');assert.equal(player.ownsNumberedBib,false);assert.equal(profile.ownsNumberedBib,false);assert.equal(profile.jerseyNumber,null);assert.equal(Object.hasOwn(player.matchBib,'paymentStatus'),false);
});
test('club bibs qualify; duplicate numbers, unknown sources and unrelated allocations do not',async()=>{
 for(const source of ['club','hired']){const f=setup();f.records.get('clubs/club/players/player0').ownsNumberedBib=false;await f.send({kitAssignments:{player0:{source,number:6,color:'Blue'}},kitNumbers:{player0:6}});}
 for(const allocations of [{player0:{source:'hired',number:1,color:'Blue'}},{player0:{source:'paid',number:99,color:'Blue'}},{other:{source:'hired',number:99,color:'Blue'}},{player0:{source:'hired',number:99,color:''}}]){const f=setup();await assert.rejects(f.send({kitAssignments:allocations}));}
});
test('same-colour owned bibs automatically receive distinct fixture colours',async()=>{const f=setup();for(let i=0;i<6;i++)f.records.get(`clubs/opponent/players/player${i}`).bibColor='Blue';const result=await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));assert.equal(result.squads.club.every(p=>p.bibColor==='Blue'),true);assert.equal(result.squads.opponent.every(p=>p.bibColor==='Orange'),true);});
test('captain sees opponent colours before choosing a match bib',async()=>{const f=setup();const {getClubDay}=require('../functions/fieldMatchDaySquad');const result=await getClubDay({db:f.db,user,body});assert.deepEqual(result.opponentColours,['orange']);});

test('Field assigns numbers and colours without any captain submission or owned bibs',async()=>{const f=setup();for(const club of season.clubIds)for(let i=0;i<6;i++){const p=f.records.get(`clubs/${club}/players/player${i}`);p.ownsNumberedBib=false;p.jerseyNumber=null;p.bibColor='';}const {getFieldDay}=require('../functions/fieldMatchDaySquad');const view=await getFieldDay({db:f.db,user:{uid:'staff'},body:{...scope,matchDayId:'day'}});for(const club of view.clubs){assert.equal(club.ready,true);assert.deepEqual(club.players.map(p=>p.jerseyNumber).sort((a,b)=>a-b),[1,2,3,4,5,6]);assert.equal(club.players.every(p=>p.matchBib.reservationStatus==='not_reserved'),true);}assert.notEqual(view.clubs[0].matchColour,view.clubs[1].matchColour);assert.equal(f.records.get('clubs/club/players/player0').jerseyNumber,null);});
test('stored Home/Away colours and owned number 22 are used without captain setup',async()=>{const f=setup();Object.assign(f.records.get('clubs/club'),{homeColor:'#2563eb',awayColor:'#ffffff'});Object.assign(f.records.get('clubs/opponent'),{homeColor:'#2563eb',awayColor:'#f97316'});Object.assign(f.records.get('clubs/club/players/player0'),{ownsNumberedBib:true,jerseyNumber:22,bibColor:'Blue'});const result=await f.db.runTransaction(tx=>loadFieldMatchRoster({transaction:tx,db:f.db,venueId:'field',season,fixture:game}));assert.equal(result.squads.club.find(p=>p.sourcePlayerId==='player0').jerseyNumber,22);assert.equal(result.squads.club.every(p=>p.bibColor==='#2563eb'),true);assert.equal(result.squads.opponent.every(p=>p.bibColor==='#f97316'),true);});
test('manual bib choices cannot bypass the fixture team colour',async()=>{const f=setup();await assert.rejects(f.send({kitAssignments:{player0:{source:'hired',number:6,color:'Red'}},kitNumbers:{player0:6}}),/fixture team colour/);});
