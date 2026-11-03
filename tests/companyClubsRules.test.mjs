import {before,after,beforeEach,test} from 'node:test';import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';import {doc,setDoc,updateDoc,getDoc} from 'firebase/firestore';
let env;before(async()=>{env=await initializeTestEnvironment({projectId:'demo-fanm-company',firestore:{rules:readFileSync('firestore.rules','utf8')}});});after(async()=>env?.cleanup());beforeEach(async()=>env.clearFirestore());
test('neither a player nor a Club admin can self-upgrade ownership or company billing',async()=>{
 const db=env.authenticatedContext('captain',{email:'captain@test.com',email_verified:true}).firestore();
 await assertSucceeds(setDoc(doc(db,'clubs/community'),{name:'Community',ownerUid:'captain',createdByUid:'captain',adminUids:['captain']}));
 await assertFails(updateDoc(doc(db,'clubs/community'),{clubType:'company',companyId:'fake',companyStatus:'active'}));
 await assertFails(setDoc(doc(db,'clubs/fake-company'),{name:'Fake Company',ownerUid:'captain',createdByUid:'captain',adminUids:['captain'],clubType:'company',companyId:'fake'}));
 await assertSucceeds(updateDoc(doc(db,'clubs/community'),{name:'Community Updated'}));
});
test('company agreements, applications and funding evidence are never accessible through generic client rules',async()=>{
 const db=env.authenticatedContext('contact',{email:'contact@company.test',email_verified:true}).firestore();
 for(const name of ['companyApplications','companyOrganizations','companyUserAccounts','companyFundingAccounts','companySponsorships','companyFundingAudit']){
  await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),name,'record'),{participantUids:['contact'],secret:'private'}));
  await assertFails(getDoc(doc(db,name,'record')));await assertFails(setDoc(doc(db,name,'record'),{status:'active'}));
 }
});
test('company public branding remains readable while ownership and payer markers stay protected',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'clubs/company'),{name:'Company',ownerUid:'co_1',createdByUid:'co_1',adminUids:['contact'],clubType:'company',companyId:'co_1',companyStatus:'active',billingModel:'company'}));
 await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),'clubs/company')));
 const db=env.authenticatedContext('contact',{email_verified:true}).firestore();await assertFails(updateDoc(doc(db,'clubs/company'),{companyId:'other'}));await assertFails(updateDoc(doc(db,'clubs/company'),{billingModel:'individual'}));await assertFails(updateDoc(doc(db,'clubs/company'),{ownerUid:'contact'}));
});
