const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs'),{audience}=require('../functions/fieldChatAudience.cjs'),{filterChatRecipients}=require('../functions/chatNotificationPolicy.cjs');
const venue={ownerUid:'field-owner',league:{activeSeason:{id:'season',status:'active',clubIds:['club'],invitations:{club:{status:'accepted'}}}}};
const initial=()=>({'clubs/club':{ownerUid:'club-owner'},'clubFieldMemberships/club':{venueId:'field',status:'active'},'clubs/club/members/player':{uid:'player',playerId:'p',email:'player@x.test',status:'active'},'clubs/club/members/reserve':{uid:'reserve',playerId:'r',email:'reserve@x.test',status:'active'},'clubs/club/members/admin':{uid:'admin',role:'admin',email:'admin@x.test',status:'active'},'clubs/stranger/members/outsider':{uid:'outsider',status:'active'},'clubFieldMemberships/stranger':{venueId:'field',status:'active'},'leagueVenues/field/staff/staff':{uid:'staff',status:'active'},'leagueSeasonSquads/field~season~club':{status:'active',entries:{player:{sourcePlayerId:'p',invitationStatus:'accepted'}}}});
const auth={getUser:async uid=>({uid,email:uid+'@x.test',emailVerified:true})};
test('accepted squad and participating admins default on; other participating members default off; unrelated clubs excluded',async()=>{
 const f=fixture(initial()),p=await audience(f.db,'field',venue,auth);
 assert.deepEqual([...p.defaults].sort(),['admin','club-owner','field-owner','player','staff']);assert(p.eligible.has('reserve'));assert(!p.defaults.has('reserve'));assert(!p.eligible.has('outsider'));
 const records=[...p.eligible].map(uid=>({uid,token:uid}));
 let result=await filterChatRecipients(f.db,records,'field','field',{defaultEnabled:p.defaults});assert(!result.some(r=>r.uid==='reserve'));
 f.records.set('notificationPreferences/reserve/chats/field__field',{scope:'field',groupId:'field',muted:false});
 f.records.set('notificationPreferences/player/chats/field__field',{scope:'field',groupId:'field',muted:true});
 result=await filterChatRecipients(f.db,records,'field','field',{defaultEnabled:p.defaults});assert(result.some(r=>r.uid==='reserve'));assert(!result.some(r=>r.uid==='player'));
});
test('stale season, deleted club, revoked membership and wrong-account binding never receive chat',async()=>{
 for(const change of ['season','club','link','binding']){
  const data=initial(),v=structuredClone(venue);if(change==='season')v.league.activeSeason.status='ended';if(change==='club')data['clubs/club'].deleted=true;if(change==='link')data['clubFieldMemberships/club'].status='inactive';if(change==='binding')data['clubs/club/members/player'].email='wrong@x.test';
  const p=await audience(fixture(data).db,'field',v,auth);assert(!p.eligible.has('player'),change);
 }
});
