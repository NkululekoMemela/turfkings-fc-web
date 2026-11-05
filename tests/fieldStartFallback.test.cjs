const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture:store}=require('./helpers/playerWorkflowFirestore.cjs');
const {loadFieldMatchRoster}=require('../functions/fieldMatchRoster.js');
function setup(count=8){
 const fixture={id:'f',matchDayId:'day',clubAId:'a',clubBId:'b',status:'scheduled',scheduledLocal:'2026-11-05T18:00'};
 const season={id:'s',status:'active',scheduleVersion:1,schedulePublishedAtMs:1,gameFormat:'5_V_5',clubIds:['a','b'],fixtures:[fixture],matchDays:[{id:'day',status:'scheduled',dateLocal:'2026-11-05',fixtureIds:['f']}]};
 const data={'leagueVenues/v':{league:{activeSeason:season}}};
 for(const clubId of ['a','b']){
  data[`clubs/${clubId}`]={name:clubId};data[`clubFieldMemberships/${clubId}`]={status:'active',venueId:'v'};
  const entries={};
  for(let i=0;i<count;i++){
   const memberId='m'+i,sourcePlayerId='p'+i;
   entries[memberId]={memberId,sourcePlayerId,invitationStatus:'accepted',paymentStatus:'unpaid'};
   data[`clubs/${clubId}/members/${memberId}`]={status:'active',playerId:sourcePlayerId};
   data[`clubs/${clubId}/players/${sourcePlayerId}`]={status:'active',fullName:`Player ${i}`};
  }
  data[`leagueSeasonSquads/v~s~${clubId}`]={venueId:'v',seasonId:'s',clubId,version:1,status:'active',updatedAt:1,entries};
 }
 const f=store(data);return {...f,season,fixture,load:()=>f.db.runTransaction(transaction=>loadFieldMatchRoster({transaction,db:f.db,venueId:'v',season,fixture}))};
}
test('unsubmitted eight-player registered rosters start with six and automatic kit; finances stay unchanged',async()=>{
 const f=setup(),before=structuredClone([...f.records]);const result=await f.load();
 for(const club of ['a','b']){assert.equal(result.squads[club].length,6);assert.equal(new Set(result.squads[club].map(p=>p.jerseyNumber)).size,6);}
 assert.deepEqual([...f.records],before);
});
test('explicit unavailability and pending invitations are excluded, without requiring captain submission',async()=>{
 const f=setup();for(const c of ['a','b']){const s=f.records.get(`leagueSeasonSquads/v~s~${c}`);s.matchDayAvailability={day:{m0:{status:'unavailable'}}};s.entries.m1.invitationStatus='pending';}
 const result=await f.load();assert.equal(result.squads.a.length,6);assert(!result.squads.a.some(p=>['p0','p1'].includes(p.sourcePlayerId)));
});
test('too few actual registered available players still produces an honest roster warning',async()=>{await assert.rejects(setup(4).load(),/five or six|needs 5/);});
test('clashing Club colours receive distinct Field match bib colours',async()=>{
 const f=setup();for(const c of ['a','b'])Object.assign(f.records.get(`clubs/${c}`),{homeColor:'Blue',awayColor:'Blue'});
 const result=await f.load();assert.notEqual(result.squads.a[0].bibColor,result.squads.b[0].bibColor);
});
