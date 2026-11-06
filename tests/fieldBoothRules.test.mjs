import test,{before,after,beforeEach} from 'node:test';
import fs from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,getDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
let env;
const venueId='booth-field',seasonId='booth-season',path=`leagueVenues/${venueId}/seasons/${seasonId}/matches/current`;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-fanm-booth',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'leagueVenues',venueId),{id:venueId,ownerUid:'manager',adminUids:['manager'],league:{activeSeason:{id:seasonId,results:[],clubIds:['a','b','c'],fixtures:[],liveMatches:{}}}});
    await setDoc(doc(db,`leagueVenues/${venueId}/staff/referee`),{status:'active',role:'referee'});
    await setDoc(doc(db,path),{venueId,seasonId,fixtureId:'fixture',status:'live',boothVersion:1,boothEpoch:'epoch',secondsLeft:100,
      liveMatchController:{uid:'guest',deviceId:'replacement'},boothGuest:{uid:'guest',fixtureId:'fixture',epoch:'epoch',expiresAtMs:Date.now()+60000}});
    await setDoc(doc(db,'fieldRefereeInvites','codehash'),{venueId,seasonId,used:false});
  });
});
test('match guests cannot become staff, change settings or edit an unrelated match',async()=>{
  const db=env.authenticatedContext('guest',{email:'guest@example.com',email_verified:true}).firestore();
  await assertFails(setDoc(doc(db,`leagueVenues/${venueId}/staff/guest`),{status:'active',role:'field_manager'}));
  await assertFails(updateDoc(doc(db,'leagueVenues',venueId),{name:'forged'}));
  await assertFails(updateDoc(doc(db,path),{secondsLeft:900}));
  await assertFails(setDoc(doc(db,`leagueVenues/${venueId}/seasons/other/matches/current`),{status:'live'}));
  await assertSucceeds(getDoc(doc(db,path)));
});
test('old referee and manager phones cannot directly overwrite or delete a guarded live match',async()=>{
  for(const uid of ['referee','manager']) {
    const db=env.authenticatedContext(uid,{email:`${uid}@example.com`,email_verified:true}).firestore();
    await assertFails(updateDoc(doc(db,path),{secondsLeft:999}));
    await assertFails(updateDoc(doc(db,path),{boothEpoch:'forged',liveMatchController:{uid,deviceId:'old'}}));
    await assertFails(deleteDoc(doc(db,path)));
  }
});
test('invite documents are server-only despite the general authenticated fallback rule',async()=>{
  for(const uid of ['guest','referee','manager']) {
    const db=env.authenticatedContext(uid,{email_verified:true}).firestore();
    await assertFails(getDoc(doc(db,'fieldRefereeInvites','codehash')));
    await assertFails(setDoc(doc(db,'fieldRefereeInvites','forged'),{venueId}));
    await assertFails(updateDoc(doc(db,'fieldRefereeInvites','codehash'),{used:false}));
  }
});
test('an old phone cannot publish a result through the Field document after handover',async()=>{
  const db=env.authenticatedContext('manager',{email_verified:true}).firestore();
  await assertFails(updateDoc(doc(db,'leagueVenues',venueId),{'league.activeSeason.results':[{id:'fixture',goalsA:50}]}));
});
test('live score capability is account-bound and older notification registrations remain supported',async()=>{
 const db=env.authenticatedContext('player',{email_verified:true}).firestore();
 const value={token:'a'.repeat(64),enabled:true,firebaseUid:'player',deviceId:'phone',platform:'android',rendererVersion:'2',updatedAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(db,'notificationRegistrations','phone'),value));
 await assertSucceeds(setDoc(doc(db,'notificationRegistrations','phone'),{...value,liveScoreVersion:'1'}));
 await assertFails(setDoc(doc(db,'notificationRegistrations','phone'),{...value,firebaseUid:'someone-else',liveScoreVersion:'1'}));
 await assertFails(setDoc(doc(db,'notificationRegistrations','phone'),{...value,liveScoreVersion:'forged'}));
});
