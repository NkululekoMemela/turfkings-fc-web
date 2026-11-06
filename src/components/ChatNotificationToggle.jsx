import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {saveChatPreference,watchChatPreference} from '../core/chatNotificationPreferences.js';
import './ChatNotificationToggle.css';
export default function ChatNotificationToggle({scope,groupId}){
 const [uid,setUid]=useState(auth.currentUser?.uid||''),[status,setStatus]=useState({key:'',muted:false,ready:false,error:''}),[busy,setBusy]=useState(false);
 const version=useRef(0),key=`${uid}:${scope}:${groupId}`;
 useEffect(()=>onAuthStateChanged(auth,user=>{version.current++;setUid(user?.uid||'');setBusy(false);}),[]);
 useEffect(()=>{version.current++;setBusy(false);if(!uid||!groupId)return;let active=true;const unsubscribe=watchChatPreference(uid,scope,groupId,(muted,policy={canChange:true})=>{if(active)setStatus({key,muted,canChange:policy.canChange,ready:true,error:''});},()=>{if(active)setStatus({key,muted:false,ready:false,error:'Could not load chat notification settings.'});});return()=>{active=false;version.current++;unsubscribe();};},[key]);
 if(!uid||!groupId)return null;
 const ready=status.key===key&&status.ready,muted=ready&&status.muted;
 async function toggle(){if(!ready||busy||status.canChange===false)return;const request=++version.current;setBusy(true);try{await saveChatPreference(uid,scope,groupId,!muted);}catch(error){if(request===version.current)setStatus(current=>({...current,error:error.message||'Could not update chat notifications.'}));}finally{if(request===version.current)setBusy(false);}}
 return <div className="fanm-chat-notification-control"><button type="button" disabled={!ready||busy||status.canChange===false} aria-pressed={muted} onClick={toggle}>{busy?'Saving…':!ready?'Loading alerts…':status.canChange===false?'Chat alerts unavailable':muted?'Chat muted · Turn on':'Mute this chat'}</button>{status.key===key&&status.error&&<span role="alert">{status.error}</span>}</div>;
}
