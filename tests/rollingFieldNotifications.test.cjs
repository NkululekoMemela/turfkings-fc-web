const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs'),{buildHandlers}=require('../functions/fieldSquadReadyNotifications.js');
function setup(){const season={id:'season',status:'active',gameFormat:'5_V_5',schedulePublishedAtMs:1,clubIds:['club'],matchDays:[{id:'next',status:'scheduled',dateLocal:'2099-01-01'}],fixtures:[{id:'next-fixture',matchDayId:'next',status:'scheduled',clubAId:'club',clubBId:'other'}]};
 const f=fixture({'leagueVenues/field':{league:{activeSeason:season}},'clubs/club':{name:'Club'},'clubFieldMemberships/club':{status:'active',venueId:'field'},'clubs/club/members/captain':{status:'active',role:'captain',uid:'cap'},'clubs/club/members/captain/notificationDevices/device':{firebaseUid:'cap',enabled:true,token:'token'}});
 const doc=f.db.doc;f.db.doc=path=>({...doc(path),set:async(value,options)=>f.records.set(path,{...(options?.merge?f.records.get(path):{}),...value}),update:async value=>f.records.set(path,{...f.records.get(path),...value})});
 const sent=[];const handlers=buildHandlers({db:f.db,region:'us-central1',auth:{getUser:async uid=>({uid,emailVerified:true})},sendBatch:async value=>{sent.push(value);return {successCount:1};}});return {...f,season,handlers,sent};
}
test('squad changes publish a lightweight update signal so Field views refresh immediately',async()=>{
 const f=setup(),after={status:'active',venueId:'field',seasonId:'season',clubId:'club',entries:{one:{sourcePlayerId:'p'}}};
 await f.handlers.fieldSquadRosterChanged.run({data:{before:{data:()=>({...after,entries:{}})},after:{data:()=>after}}});
 const signal=f.records.get('leagueVenues/field/seasons/season/fieldMatchDayManifests/next/clubs/club');assert.equal(signal.clubId,'club');assert.equal(typeof signal.sourceRevision,'string');assert.equal(signal.entries,undefined);
});
test('captain review includes the carried player list and links to the correct squad; repeated triggers do not spam',async t=>{
 const f=setup();t.mock.method(require('../functions/fieldMatchDaySquad.js'),'loadDay',async()=>({submission:{players:[{fullName:'Player One'},{fullName:'Player Two'}]}}));
 const event={params:{venueId:'field'},data:{before:{data:()=>({league:{activeSeason:{...f.season,schedulePublishedAtMs:0}}})},after:{data:()=>({league:{activeSeason:f.season}})}}};
 await f.handlers.fieldSquadNextFixtureReview.run(event);await f.handlers.fieldSquadNextFixtureReview.run(event);
 assert.equal(f.sent.length,1);assert.match(f.sent[0].body,/Player One, Player Two/);assert.match(f.sent[0].body,/No action keeps this squad/);assert.equal(f.sent[0].data.matchDayId,'next');assert.equal(f.sent[0].data.route,'club-league');assert.equal(f.sent[0].tokenRecords[0].token,'token');
});
