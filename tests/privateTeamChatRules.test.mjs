import {test,before,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,getDocs,collection} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-fanm-notifications',firestore:{rules:readFileSync('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
test('private team messages and preferences are accessible only through the verified server endpoint',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'privateTeamChats/room/messages/message'),{text:'Private tactics'});});
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('player',{email_verified:true}),env.authenticatedContext('admin',{email_verified:true}),env.authenticatedContext('camera',{email_verified:true,cameraSession:true})]){
  const db=context.firestore();await assertFails(setDoc(doc(db,'privateFieldClubChats/room/messages/new'),{text:'Forged'}));await assertFails(getDoc(doc(db,'privateFieldClubChats/room/messages/message')));await assertFails(getDocs(collection(db,'privateFieldClubChats/room/messages')));await assertFails(setDoc(doc(db,'privateTeamChatAccess/club/rooms/room'),{memberIds:['player']}));await assertFails(getDoc(doc(db,'privateTeamChatAccess/club/rooms/room')));await assertFails(getDoc(doc(db,'privateTeamChats/room/messages/message')));await assertFails(getDocs(collection(db,'privateTeamChats/room/messages')));await assertFails(setDoc(doc(db,'privateTeamChats/room/messages/new'),{text:'Forged'}));await assertFails(setDoc(doc(db,'privateTeamChats/room/preferences/player'),{muted:false}));
 }
});
