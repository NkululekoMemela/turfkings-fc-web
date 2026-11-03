import test from 'node:test';import fs from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';import {ref,uploadBytes} from 'firebase/storage';
let env;
test.before(async()=>{env=await initializeTestEnvironment({projectId:'demo-fanm-lost-found',firestore:{rules:fs.readFileSync('firestore.rules','utf8')},storage:{rules:fs.readFileSync('storage.rules','utf8')}});});
test.after(async()=>{await env?.cleanup();});
test('new owners can upload their Club logo after creation, strangers and camera tokens cannot',async()=>{
 await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'clubs','new-club'),{ownerUid:'owner',createdByUid:'owner',adminUids:['admin']}));
 const upload=(uid,extra={},type='image/png')=>uploadBytes(ref(env.authenticatedContext(uid,extra).storage(),'clubs/new-club/branding/'+uid+'.png'),new Uint8Array([1,2]),{contentType:type});
 await assertSucceeds(upload('owner'));await assertSucceeds(upload('admin',{},'image/webp'));
 await assertFails(upload('other'));await assertFails(upload('owner',{cameraSession:true}));await assertFails(upload('owner',{cameraSession:true,dataScope:'official'}));await assertFails(upload('owner',{},'text/html'));
 await assertFails(uploadBytes(ref(env.authenticatedContext('owner').storage(),'clubs/not-created/branding/logo.png'),new Uint8Array([1]),{contentType:'image/png'}));
});
