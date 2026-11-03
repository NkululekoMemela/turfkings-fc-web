import {test,before,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,getDocs} from 'firebase/firestore';
let env;
before(async()=>{
 if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Run with firebase emulators:exec --only firestore --project demo-fanm-kit-shop "node --test tests/kitShopRules.test.mjs"');
 env=await initializeTestEnvironment({projectId:'demo-fanm-kit-shop',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async context=>{for(const path of ['kitShopProducts/bib','kitShopConfig/store','kitShopOrders/order','kitShopCustomers/buyer/orders/order'])await setDoc(doc(context.firestore(),path),{ownerUid:'buyer',phone:'private',totalMinor:10000});});
});
after(async()=>env?.cleanup());
test('all shop records are server-only, including the broad legacy catch-all',async()=>{
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('buyer',{email:'buyer@example.com',email_verified:true}),env.authenticatedContext('other',{email:'other@example.com',email_verified:true}),env.authenticatedContext('admin',{email:'nkululekolerato@gmail.com',email_verified:true})]){
  const db=context.firestore();for(const path of ['kitShopProducts/bib','kitShopConfig/store','kitShopConfig/operators','kitShopOrders/order','kitShopCustomers/buyer/orders/order']){await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),{ownerUid:'admin',paymentStatus:'confirmed'}));}
  await assertFails(getDocs(collection(db,'kitShopOrders')));await assertFails(getDocs(collection(db,'kitShopCustomers/buyer/orders')));
 }
});
