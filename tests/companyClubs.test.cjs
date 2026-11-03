const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const {handle,sponsoredMembers,grantId}=require('../functions/companyClubs.cjs');
const admin={uid:'fanm',email:'nkululekolerato@gmail.com',email_verified:true},user={uid:'contact',email:'contact@company.test',email_verified:true};
const logo='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');
const application={setup:{clubName:'Acme',venueName:'Pitch',address:'1 Main Road',suburb:'Wynberg',city:'Cape Town',country:'South Africa',playDay:'Wednesday',playTime:'17:30',playEndTime:'19:00',timezone:'Africa/Johannesburg',latitude:-33.9,longitude:18.4},action:'apply',requestId:'request',companyName:'Acme',contactName:'Contact',city:'Cape Town',phone:'0768304880',logoDataUrl:logo};
async function company(){const f=fixture();const response=await handle({...f,user,body:application,uploadLogo:async()=>({url:'https://example.test/logo.png'})});const c=await handle({...f,user:admin,body:{action:'activate',applicationId:response.application.id}});return {...f,...c};}
async function season(){const f=await company();const scope={clubId:f.clubId,venueId:'field',seasonId:'season'};f.records.set(`clubFieldMemberships/${f.clubId}`,{status:'active',venueId:'field'});f.records.set('leagueVenues/field',{name:'Field',league:{activeSeason:{id:'season',status:'active',clubIds:[f.clubId]}}});
 const entries={p:{memberId:'p',sourcePlayerId:'player',fullName:'Player',invitationStatus:'accepted',contributionCents:10000,currency:'ZAR',paymentStatus:'pending'}};
 f.records.set(`leagueSeasonSquads/${grantId(scope)}`,{...scope,version:1,status:'active',plan:{totalCents:10000},entries,updatedAt:1});f.records.set(`clubs/${f.clubId}/members/p`,{status:'active',playerId:'player'});f.records.set(`clubs/${f.clubId}/players/player`,{status:'active',fullName:'Player'});return {...f,scope};}
test('verified company applications are idempotent and only FANM can activate ownership',async()=>{
 const f=fixture();let uploads=0;const send=()=>handle({...f,user,body:application,uploadLogo:async()=>{uploads++;return {url:'https://example.test/logo.png'};}});const first=await send();await send();assert.equal(uploads,1);
 await assert.rejects(()=>handle({...f,user,body:{action:'activate',applicationId:first.application.id}}),/FANM/);
 const c=await handle({...f,user:admin,body:{action:'activate',applicationId:first.application.id}});const club=f.records.get(`clubs/${c.clubId}`);assert.equal(club.clubType,'company');assert.equal(club.ownerCompanyId,c.companyId);assert.equal(club.ownerType,'company');assert.notEqual(club.ownerUid,user.uid);assert.equal(f.records.get(`companyFundingAccounts/${c.companyId}`).status,'pending_terms');
 await assert.rejects(()=>handle({...f,user:{...user,email_verified:false},body:application}),/verified/);
});
test('another account cannot read or authorise this company funding',async()=>{
 const f=await company();await assert.rejects(()=>handle({...f,user:{uid:'other',email:'other@test',email_verified:true},body:{action:'setFunding',companyId:f.companyId,expectedRevision:1,limitMinor:10000,termsReference:'Contract'}}),/Only FANM/);
 const view=await handle({...f,user:{uid:'other',email:'other@test',email_verified:true},body:{action:'view'}});assert.deepEqual(view.companies,[]);assert.deepEqual(view.applications,[]);
});
test('company sponsorship authorises a real player without fabricating a personal payment receipt',async()=>{
 const f=await season();await handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,expectedRevision:1,limitMinor:10000,termsReference:'Signed terms'}});
 await handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}});await handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}});
 assert.equal(f.records.get(`companyFundingAccounts/${f.companyId}`).reservedMinor,10000);const squad=f.records.get(`leagueSeasonSquads/${grantId(f.scope)}`);assert.equal(squad.entries.p.paymentStatus,'pending');assert.equal(squad.entries.p.paidCents,undefined);assert.equal(f.records.has(`leagueSeasonSquads/${grantId(f.scope)}/paymentConfirmations/p`),false);
 const roster=await f.db.runTransaction(tx=>require('../functions/fieldSeasonStartSquad').loadSeasonStartSquad({transaction:tx,db:f.db,scope:f.scope}));assert.equal(roster.eligible.length,1);assert.equal(roster.eligible[0].fundingType,'company');
});
test('unapproved, over-budget and relinked players never become sponsored',async()=>{
 const f=await season();await assert.rejects(()=>handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}}),/terms/);
 await handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,expectedRevision:1,limitMinor:5000,termsReference:'Terms'}});await assert.rejects(()=>handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}}),/allowance/);
 assert.equal(f.records.has(`companySponsorships/${grantId(f.scope)}`),false);
});
test('a changed player link or season amount invalidates the corresponding funding entitlement',async()=>{
 const f=await season();await handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,expectedRevision:1,limitMinor:10000,termsReference:'Terms'}});await handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}});
 const club=f.records.get(`clubs/${f.clubId}`),squad=f.records.get(`leagueSeasonSquads/${grantId(f.scope)}`);squad.entries.p.sourcePlayerId='replacement';const result=await f.db.runTransaction(tx=>sponsoredMembers({db:f.db,tx,club,scope:f.scope,squad}));assert.equal(result.size,0);
});
test('entry flags alone cannot manufacture company eligibility',async()=>{
 const f=await season(),ref=`leagueSeasonSquads/${grantId(f.scope)}`,squad=f.records.get(ref);squad.entries.p.fundingType='company';squad.entries.p.fundingStatus='authorised';f.records.set(ref,squad);
 const result=await f.db.runTransaction(tx=>require('../functions/fieldSeasonStartSquad').loadSeasonStartSquad({transaction:tx,db:f.db,scope:f.scope}));assert.equal(result.eligible.length,0);
});
test('funding limits cannot be reduced beneath existing commitments',async()=>{
 const f=await season();await handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,expectedRevision:1,limitMinor:10000,termsReference:'Terms'}});await handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}});
 const account=f.records.get(`companyFundingAccounts/${f.companyId}`);await assert.rejects(()=>handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,expectedRevision:account.revision,limitMinor:9999,termsReference:'Changed'}}),/commitments/);assert.equal(f.records.get(`companyFundingAccounts/${f.companyId}`).limitMinor,10000);
});
test('Company approvals and funding refuse Practice requests',async()=>{
 const f=await company();await assert.rejects(()=>handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,isPracticeMode:true}}),/Official/);
});
test('company players and captains cannot be charged through individual season or merchandise paths',async()=>{
 const f=await season();await assert.rejects(()=>require('../functions/fieldSeasonSquadService').confirmSeasonPayment({...f,user,body:{...f.scope,memberId:'p'}}),/Company costs/);
 await assert.rejects(()=>f.db.runTransaction(tx=>require('../functions/kitBulk.cjs').prepare({db:f.db,tx,user,body:{clubId:f.clubId},orderId:'order'})),/company invoicing/);
});
test('declined company requests remain private, leave no public club and release pending application capacity',async()=>{
 const f=fixture(),{application:app}=await handle({...f,user,body:application,uploadLogo:async()=>({url:'https://example.test/logo.png'})});
 await assert.rejects(()=>handle({...f,user,body:{action:'reject',applicationId:app.id,reason:'Not verified'}}),/FANM/);
 await handle({...f,user:admin,body:{action:'reject',applicationId:app.id,reason:'Company contact needs verification'}});assert.deepEqual(f.records.get('companyUserAccounts/contact').pendingApplications,[]);assert.equal([...f.records.keys()].some(k=>k.startsWith('clubs/')),false);
});
test('withdrawing company funding releases its allowance once and never interrupts a live match',async()=>{
 const f=await season();await handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,expectedRevision:1,limitMinor:10000,termsReference:'Terms'}});await handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}});
 const body={action:'revokeSeason',companyId:f.companyId,grantId:grantId(f.scope),reason:'Season cancelled'};
 f.records.set('leagueVenues/field/seasons/season/matches/current',{status:'live'});await assert.rejects(()=>handle({...f,user:admin,body}),/live match/);
 f.records.set('leagueVenues/field/seasons/season/matches/current',{status:'completed'});await handle({...f,user:admin,body});await handle({...f,user:admin,body});assert.equal(f.records.get(`companyFundingAccounts/${f.companyId}`).reservedMinor,0);
 const roster=await f.db.runTransaction(tx=>require('../functions/fieldSeasonStartSquad').loadSeasonStartSquad({transaction:tx,db:f.db,scope:f.scope}));assert.equal(roster.eligible.length,0);
});
test('one season authorisation covers later invitation acceptance without another funding step',async()=>{
 const f=await season(),ref=`leagueSeasonSquads/${grantId(f.scope)}`,squad=f.records.get(ref);squad.entries.p.invitationStatus='pending';f.records.set(ref,squad);
 await handle({...f,user:admin,body:{action:'setFunding',companyId:f.companyId,expectedRevision:1,limitMinor:10000,termsReference:'Terms'}});await handle({...f,user:admin,body:{action:'authoriseSeason',clubId:f.clubId}});
 let roster=await f.db.runTransaction(tx=>require('../functions/fieldSeasonStartSquad').loadSeasonStartSquad({transaction:tx,db:f.db,scope:f.scope}));assert.equal(roster.eligible.length,0);
 const accepted=f.records.get(ref);accepted.entries.p.invitationStatus='accepted';f.records.set(ref,accepted);roster=await f.db.runTransaction(tx=>require('../functions/fieldSeasonStartSquad').loadSeasonStartSquad({transaction:tx,db:f.db,scope:f.scope}));assert.equal(roster.eligible.length,1);assert.equal(f.records.get(`companyFundingAccounts/${f.companyId}`).reservedMinor,10000);
});
