const test=require('node:test'),assert=require('node:assert/strict');
const {loadPublicPracticeClubs,publicClubCopy}=require('../functions/fieldPracticeClubPool.cjs'),{practicePublicFixture}=require('./helpers/practicePublicClubs.cjs');
test('a new Field without memberships can practise using real published clubs and six actual players each',async()=>{
 const f=practicePublicFixture({count:4});const before=JSON.stringify([...f.records]);const copies=await loadPublicPracticeClubs({db:f.db,venueId:'field'});
 assert.equal(copies.length,4);assert.equal(copies.every(c=>c.poolSource==='platform'&&c.players.length===6),true);assert.equal(copies[0].name,'Existing Club 1');assert.equal(JSON.stringify([...f.records]),before);
 for(const c of copies)for(const p of c.players){const real=f.records.get(`clubs/${c.clubId}/publicPlayers/${p.sourcePlayerId}`);assert.equal(p.fullName,real.fullName);for(const key of ['uid','email','phone','paymentStatus'])assert.equal(p[key],undefined);}
});
test('complete Field clubs take priority, incomplete clubs are skipped, and no club is duplicated',async()=>{
 const f=practicePublicFixture({count:6,fieldIds:['club4','club5']});for(let i=3;i<=8;i++)f.records.delete(`clubs/club5/publicPlayers/p${i}`);
 const copies=await loadPublicPracticeClubs({db:f.db,venueId:'field'});assert.equal(copies[0].clubId,'club4');assert.equal(copies[0].poolSource,'field');assert.equal(copies.some(c=>c.clubId==='club5'),false);assert.equal(new Set(copies.map(c=>c.clubId)).size,copies.length);
});
test('too little real public data produces a clear message without inventing players or writing memberships',async()=>{
 const f=practicePublicFixture({count:2});await assert.rejects(loadPublicPracticeClubs({db:f.db,venueId:'field'}),/Found 2.*No real invitations/);assert.equal([...f.records.keys()].some(k=>k.startsWith('practiceSessions/')),false);
});
test('selection is random, clone kit changes do not change a real profile, and inactive players are excluded',()=>{
 const f=practicePublicFixture();const docs=[...f.records].filter(([k])=>k.startsWith('clubs/club1/publicPlayers/')).map(([k,v])=>({id:k.split('/').at(-1),data:()=>v}));docs[0]={id:'removed',data:()=>({fullName:'Removed',status:'removed'})};
 const args={clubId:'club1',club:f.records.get('clubs/club1'),documents:docs,poolSource:'platform'};
 const a=publicClubCopy({...args,pick:()=>0}),b=publicClubCopy({...args,pick:n=>n-1});assert.notDeepEqual(a.players.map(p=>p.sourcePlayerId),b.players.map(p=>p.sourcePlayerId));assert.equal(a.players.some(p=>p.fullName==='Removed'),false);assert.deepEqual(a.players.map(p=>p.jerseyNumber),[1,2,3,4,5,6]);assert.equal(f.records.get('clubs/club1/publicPlayers/p2').jerseyNumber,22);
});
test('Practice invitations accept real-data copies immediately and write only inside the user session',async()=>{
 const {announce}=require('../functions/fieldPracticeInvitations.js'),f=practicePublicFixture({count:3});
 const root='sandboxes/practice/leagueVenues/field/sessions/s';
 f.records.set('practiceSessions/s',{kind:'venueLeague',environment:'practice',venueId:'field',sessionId:'s',userId:'staff',status:'active',expiresAt:{toMillis:()=>10000}});f.records.set(root,{environment:'practice',practiceSessionId:'s',league:{activeSeason:null}});
 const original=new Map([...f.records].filter(([key])=>key.startsWith('clubs/')||key.startsWith('clubFieldMemberships/')).map(([key,value])=>[key,JSON.stringify(value)]));
 const result=await announce({db:f.db,user:{uid:'staff'},venueId:'field',sessionId:'s',settings:{name:'Real club Practice',startsOn:'2099-01-01'},now:1000});
 assert.equal(result.invited,3);assert.equal(result.accepted,3);
 const copies=[...f.records].filter(([key])=>key.startsWith(root+'/clubs/'));assert.equal(copies.length,3);assert.equal(copies.every(([,copy])=>copy.players.length===6&&copy.simulated&&copy.name.startsWith('Existing Club')),true);
 for(const [key,value]of original)assert.equal(JSON.stringify(f.records.get(key)),value);
 for(const key of f.records.keys())assert.ok(original.has(key)||key==='practiceSessions/s'||key===root||key.startsWith(root+'/'));
});
