import {test,before,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,deleteDoc} from 'firebase/firestore';
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-fanm-notifications',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await setDoc(doc(db,'clubs/auto-chat'),{ownerUid:'owner',createdByUid:'owner',adminUids:['owner']});
  await setDoc(doc(db,'clubs/auto-chat/members/captain'),{uid:'captain',status:'active',role:'captain'});
  await setDoc(doc(db,'clubs/auto-chat/members/player'),{uid:'player',status:'active',role:'player'});
  await setDoc(doc(db,'clubStateOperators/auto-chat/users/captain'),{uid:'captain',memberId:'captain'});
  await setDoc(doc(db,'clubStateOperators/auto-chat/users/player'),{uid:'player',memberId:'player'});
 });
});
after(async()=>{await env?.cleanup();});
test('only existing real captains/admins can change the roster that controls private team chats',async()=>{
 const state={state:{seasonId:'s',teams:[{id:'red',players:['player']}]}};
 for(const uid of ['owner','captain'])await assertSucceeds(setDoc(doc(env.authenticatedContext(uid,{email_verified:true}).firestore(),'clubs/auto-chat/state/main'),state));
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('player',{email_verified:true}),env.authenticatedContext('outsider',{email_verified:true}),env.authenticatedContext('captain',{email_verified:false}),env.authenticatedContext('captain',{email_verified:true,cameraSession:true,dataScope:'official'})]){
  const db=context.firestore();await assertFails(setDoc(doc(db,'clubs/auto-chat/state/main'),state));await assertFails(deleteDoc(doc(db,'clubs/auto-chat/state/main')));await assertFails(setDoc(doc(db,'clubStateOperators/auto-chat/users/player'),{uid:'player',memberId:'captain'}));
 }
});
test('revoking a captain defeats an existing operator pointer immediately',async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'clubs/auto-chat/members/captain'),{uid:'captain',status:'removed',role:'captain'}));
 await assertFails(setDoc(doc(env.authenticatedContext('captain',{email_verified:true}).firestore(),'clubs/auto-chat/state/main'),{state:{teams:[]}}));
});
