import {test,before,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc} from 'firebase/firestore';
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-fanm-isolation',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const id of ['alpha','beta']){
   await setDoc(doc(db,`clubs/${id}`),{ownerUid:`${id}-owner`,createdByUid:`${id}-owner`,adminUids:[`${id}-owner`]});
   await setDoc(doc(db,`clubs/${id}/members/player`),{uid:`${id}-player`,status:'active',role:'player',email:`${id}@test.com`});
   await setDoc(doc(db,`clubDataAccess/${id}/users/${id}-player`),{uid:`${id}-player`,memberId:'player'});
  }
 });
});
after(async()=>env?.cleanup());
test('a Club owner or verified participant cannot write another Club workspace',async()=>{
 for(const uid of ['alpha-owner','alpha-player']){
  const db=env.authenticatedContext(uid,{email_verified:true,email:uid==='alpha-player'?'alpha@test.com':'owner@test.com'}).firestore();
  await assertSucceeds(setDoc(doc(db,'clubs/alpha/matchNotes/test'),{text:'own Club'}));
  await assertFails(setDoc(doc(db,'clubs/beta/matchNotes/test'),{text:'foreign Club'}));
  await assertFails(getDoc(doc(db,'clubs/beta/members/player')));
  await assertFails(setDoc(doc(db,`clubDataAccess/beta/users/${uid}`),{memberId:'player',uid}));
 }
});
test('revocation defeats an existing membership pointer immediately',async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'clubs/alpha/members/player'),{uid:'alpha-player',status:'removed',role:'player',email:'alpha@test.com'}));
 await assertFails(setDoc(doc(env.authenticatedContext('alpha-player',{email_verified:true,email:'alpha@test.com'}).firestore(),'clubs/alpha/matchNotes/test'),{text:'revoked'}));
});
