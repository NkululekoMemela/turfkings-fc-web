const test=require('node:test'),assert=require('node:assert/strict');
const {shortName,displayName}=require('../functions/notificationSender.cjs');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
test('notification names prefer registered short names and nicknames, otherwise only first name',()=>{
 assert.equal(shortName({shortName:'Gambu',fullName:'Nkuleleko Charles Memela'}),'Gambu');assert.equal(shortName({nickname:'Big Mike',fullName:'Michael Smith'}),'Big Mike');assert.equal(shortName({fullName:'Nkuleleko Charles Memela'}),'Nkuleleko');assert.equal(shortName({},'Nkuleleko Memela'),'Nkuleleko');assert.equal(shortName({},''),'Player');
});
test('Club and Field identities resolve independently and lookups fall back to first name',async()=>{
 const f=fixture({'clubs/club/members/m':{uid:'user',shortName:'Gambu'},'leagueVenues/field/staff/user':{fullName:'Nkuleleko Charles Memela',shortName:'Nick'}});
 assert.equal(await displayName(f.db,{uid:'user',clubId:'club',fallback:'Wrong Name'}),'Gambu');assert.equal(await displayName(f.db,{uid:'user',venueId:'field',fallback:'Wrong Name'}),'Nick');assert.equal(await displayName(f.db,{uid:'stranger',fallback:'Bea Two'}),'Bea');
});
