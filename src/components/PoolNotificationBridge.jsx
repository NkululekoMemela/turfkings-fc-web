import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Capacitor} from '@capacitor/core';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,activeFirebaseProjectId} from '../firebaseConfig.js';
import {attachPoolNativeEvents,enablePoolAlerts,poolNotificationRoute} from '../core/poolNotifications.js';
import PoolTablePage from '../pages/PoolTablePage.jsx';
export default function PoolNotificationBridge(){
 const [route,setRoute]=useState(null),[signedInUid,setSignedInUid]=useState(auth.currentUser?.uid||'');
 const previousUid=useRef(auth.currentUser?.uid||'');
 useEffect(()=>{
  let disposed=false,remove=()=>{};
  const open=value=>{if(disposed)return;if(document.querySelector(`.pool-page[data-pool-code="${value.code}"]`)){window.dispatchEvent(new CustomEvent('pool-open-alert',{detail:value}));return;}setRoute(value);};
  const requested=event=>{const route=poolNotificationRoute(event.detail);if(route)open(route);};
  window.addEventListener('pool-native-open',requested);
  attachPoolNativeEvents(open).then(fn=>{if(disposed)fn();else remove=fn;}).catch(()=>{});
  const unsubscribe=onAuthStateChanged(auth,user=>{
   if(previousUid.current&&!user)setRoute(null);
   else if(user)setRoute(current=>current?.recipientUid&&current.recipientUid!==user.uid?null:current);
   previousUid.current=user?.uid||'';setSignedInUid(user?.uid||'');
   if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(registrations=>{for(const reg of registrations)if(reg.scope.includes('/pool-push/'))reg.active?.postMessage({type:'pool-account',uid:reg.scope.endsWith(`/pool-push/${activeFirebaseProjectId}/`)?user?.uid||'':''});}).catch(()=>{});
   try{if(user?.uid&&localStorage.getItem(`pool-alerts:${activeFirebaseProjectId}`))enablePoolAlerts({quiet:true}).catch(()=>{});}catch{}
  });
  return()=>{disposed=true;remove();unsubscribe();window.removeEventListener('pool-native-open',requested);};
 },[]);
 if(!Capacitor.isNativePlatform()||!route||(signedInUid&&route.recipientUid&&route.recipientUid!==signedInUid))return null;
 return createPortal(<PoolTablePage notificationRoute={route} onBack={()=>setRoute(null)}/>,document.body);
}
