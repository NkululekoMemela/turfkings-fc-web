import {doc,getDoc,onSnapshot,setDoc,serverTimestamp} from 'firebase/firestore';
import {auth,db} from '../firebaseConfig.js';
export function chatPreferenceRef(uid,scope,groupId){
 if(!/^[A-Za-z0-9_-]{1,150}$/.test(uid||'')||!['club','field'].includes(scope)||!/^[A-Za-z0-9_-]{1,150}$/.test(groupId||''))throw Error('Choose a valid chat.');
 return doc(db,'notificationPreferences',uid,'chats',`${scope}__${groupId}`);
}
export const watchChatPreference=(uid,scope,id,onData,onError)=>onSnapshot(chatPreferenceRef(uid,scope,id),snap=>onData(snap.data()?.muted===true),onError);
export async function saveChatPreference(uid,scope,groupId,muted){
 if(auth.currentUser?.uid!==uid)throw Error('Sign in again before changing notifications.');
 await setDoc(chatPreferenceRef(uid,scope,groupId),{scope,groupId,muted:!!muted,updatedAt:serverTimestamp()});
}
export async function shouldPresentChatNotification(data){
 const scope=data?.type==='club_chat'?'club':data?.type==='field_chat'?'field':null;
 if(!scope)return true;
 const uid=auth.currentUser?.uid;if(!uid)return false;
 const snap=await getDoc(chatPreferenceRef(uid,scope,scope==='club'?data.clubId:data.venueId));
 return auth.currentUser?.uid===uid&&snap.data()?.muted!==true;
}
