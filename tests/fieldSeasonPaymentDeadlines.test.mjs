import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {respondSeasonSquadInvitation,confirmSeasonSquadPayment,seasonPaymentExpired,PAYMENT_WINDOW_MS as W,PAYMENT_REMINDER_MS as R} from '../functions/fieldSeasonSquadPolicy.mjs';
const require=createRequire(import.meta.url);
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const {processSquad}=require('../functions/fieldSeasonPaymentDeadlines.cjs');
const {settle}=require('../functions/fieldSeasonCheckout.js');
const pending={memberId:'m',sourcePlayerId:'p',fullName:'Player',invitationStatus:'pending',paymentStatus:'pending',contributionCents:50000,currency:'ZAR'};
const accepted=()=>respondSeasonSquadInvitation({invitation:pending,response:'accepted',actorMemberId:'m',now:1000});
function setup(entry=accepted()){
 const id='leagueSeasonSquads/v~s~c';
 const f=fixture({[id]:{version:1,status:'active',clubId:'c',venueId:'v',seasonId:'s',entries:{m:entry}},'clubs/c':{},'leagueVenues/v':{league:{activeSeason:{id:'s',status:'active',clubIds:['c']}}}});
 return {...f,id,ref:f.db.doc(id)};
}
test('acceptance starts 48 hours; repeat acceptance cannot extend it',()=>{
 const e=accepted(); assert.equal(e.paymentDueAtMs,1000+W);assert.equal(e.paymentReminderAtMs,1000+R);
 assert.strictEqual(respondSeasonSquadInvitation({invitation:e,response:'accepted',actorMemberId:'m',now:9000}),e);
});
test('payment boundary is enforced without waiting for scheduler',()=>{
 const e=accepted();assert.equal(seasonPaymentExpired(e,e.paymentDueAtMs-1),false);
 assert.equal(confirmSeasonSquadPayment({invitation:e,confirmedByUid:'captain',now:e.paymentDueAtMs-1}).paymentStatus,'paid');
 assert.throws(()=>confirmSeasonSquadPayment({invitation:e,confirmedByUid:'captain',now:e.paymentDueAtMs}),/expired/);
});
test('24-hour notice and 48-hour release are idempotent',async()=>{
 const f=setup();const e=accepted();
 await processSquad({...f,now:e.paymentReminderAtMs-1});assert.equal(f.records.size,3);
 await processSquad({...f,now:e.paymentReminderAtMs});await processSquad({...f,now:e.paymentReminderAtMs});assert.equal(f.records.size,4);
 await processSquad({...f,now:e.paymentDueAtMs});await processSquad({...f,now:e.paymentDueAtMs});
 assert.equal(f.records.get(f.id).entries.m.invitationStatus,'expired');assert.equal(f.records.size,5);
});
test('paid and company-funded players never expire',async()=>{
 for(const extra of [{paymentStatus:'paid'},{fundingType:'company'}]){
 const f=setup({...accepted(),...extra});await processSquad({...f,now:1000+W*2});assert.equal(f.records.get(f.id).entries.m.invitationStatus,'accepted');assert.equal(f.records.size,3);
 }
});
test('legacy accepted players get a fresh full window',async()=>{
 const f=setup({...pending,invitationStatus:'accepted',respondedAtMs:1});
 await processSquad({...f,now:1000000000});assert.equal(f.records.get(f.id).entries.m.paymentDueAtMs,1000000000+W);
 await processSquad({...f,now:1000000010});assert.equal(f.records.get(f.id).entries.m.paymentDueAtMs,1000000000+W);
});
test('late verified money is recorded for review and cannot restore a place',async()=>{
 const f=setup({...accepted(),invitationStatus:'expired',seasonCheckoutPaymentId:'pay'});
 f.records.set('payments/pay',{purpose:'field_season',status:'checkout_created',venueId:'v',seasonId:'s',clubId:'c',memberId:'m',sourcePlayerId:'p',totalCents:57900,contributionCents:50000,platformFeeCents:7900});
 const args={db:f.db,paymentRef:f.db.doc('payments/pay'),receivedCents:57900,FieldValue:{serverTimestamp:()=>1}};
 await settle(args);await settle(args);
 assert.equal(f.records.get('payments/pay').status,'paid_requires_review');assert.equal(f.records.get(f.id).entries.m.invitationStatus,'expired');assert.equal(f.records.has(f.id+'/paymentConfirmations/m'),false);
});
