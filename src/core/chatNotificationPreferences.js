import {memberWorkspaceRequest} from '../storage/memberWorkspaceGateway.js';
import {doc,getDoc,onSnapshot,setDoc,serverTimestamp} from 'firebase/firestore';
import {auth,db} from '../firebaseConfig.js';
export function chatPreferenceRef(uid,scope,groupId){
 if(!/^[A-Za-z0-9_-]{1,150}$/.test(uid||'')||!['club','field'].includes(scope)||!/^[A-Za-z0-9_-]{1,150}$/.test(groupId||''))throw Error('Choose a valid chat.');
 return doc(db,'notificationPreferences',uid,'chats',`${scope}__${groupId}`);
}
export function watchChatPreference(uid,scope,id,onData,onError){
 let active=true,version=0;
 const policyRequest=scope==='field'?memberWorkspaceRequest('fieldChatPreferences',{venueId:id}):Promise.resolve({eligible:true,defaultMuted:false});
 policyRequest.catch(()=>{});
 const unsubscribe=onSnapshot(chatPreferenceRef(uid,scope,id),async snap=>{
  const request=++version;
  try{
   const policy=await policyRequest;
   const muted=!policy.eligible||(typeof snap.data()?.muted==='boolean'?snap.data().muted:policy.defaultMuted);
   if(active&&version===request&&auth.currentUser?.uid===uid)onData(muted,{canChange:policy.eligible});
  }catch(error){if(active&&version===request)onError?.(error);}
 },onError);
 return()=>{active=false;unsubscribe();};
}
export async function saveChatPreference(uid,scope,groupId,muted){
 if(auth.currentUser?.uid!==uid)throw Error('Sign in again before changing notifications.');
 const write=setDoc(chatPreferenceRef(uid,scope,groupId),{scope,groupId,muted:!!muted,updatedAt:serverTimestamp()});
 let timer;try{await Promise.race([write,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Waiting for connection to update chat alerts.')),8000);})]);}finally{clearTimeout(timer);}
}
export async function shouldPresentChatNotification(data){
 const scope=data?.type==='club_chat'?'club':data?.type==='field_chat'?'field':null;
 if(!scope)return true;
 const uid=auth.currentUser?.uid;if(!uid)return false;
 const snap=await getDoc(chatPreferenceRef(uid,scope,scope==='club'?data.clubId:data.venueId));
 const policy=scope==='field'?await memberWorkspaceRequest('fieldChatPreferences',{venueId:data.venueId}):{eligible:true,defaultMuted:false};
 return auth.currentUser?.uid===uid&&policy.eligible&&(typeof snap.data()?.muted==='boolean'?!snap.data().muted:!policy.defaultMuted);
}
