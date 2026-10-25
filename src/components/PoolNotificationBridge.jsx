import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {poolNightRequest} from '../storage/poolNightGateway.js';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,activeFirebaseProjectId} from '../firebaseConfig.js';
import {attachPoolNativeEvents,enablePoolAlerts,poolNotificationRoute} from '../core/poolNotifications.js';
import PoolTablePage from '../pages/PoolTablePage.jsx';
export default function PoolNotificationBridge(){
 const [route,setRoute]=useState(null),[signedInUid,setSignedInUid]=useState(auth.currentUser?.uid||'');
 const previousUid=useRef(auth.currentUser?.uid||'');
 const [attention,setAttention]=useState(null),seenAlerts=useRef(new Map());
 useEffect(()=>{
  setAttention(null);if(!signedInUid)return;let stopped=false,fetching=false;
  const refresh=async()=>{if(document.hidden||fetching)return;fetching=true;try{const result=await poolNightRequest({action:'list'});if(stopped)return;const next=result.nights.find(n=>n.attention?.length&&!document.querySelector(`.pool-page[data-pool-code="${n.code}"]`)&&Date.now()-(seenAlerts.current.get(n.code+':'+n.attention.map(a=>a.id+':'+a.submittedAt).join(','))||0)>120000);if(next){setAttention(next);try{navigator.vibrate?.([100,60,100]);}catch{}}else setAttention(null);}catch{}finally{fetching=false;}};
  refresh();const timer=setInterval(refresh,15000);document.addEventListener('visibilitychange',refresh);window.addEventListener('pool-push-received',refresh);
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('pool-push-received',refresh);};
 },[signedInUid,route?.code]);
 function dismissAttention(){if(attention)seenAlerts.current.set(attention.code+':'+attention.attention.map(a=>a.id+':'+a.submittedAt).join(','),Date.now());setAttention(null);}
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
 return <>{route&&!(signedInUid&&route.recipientUid&&route.recipientUid!==signedInUid)&&createPortal(<PoolTablePage notificationRoute={route} onBack={()=>setRoute(null)}/>,document.body)}{attention&&createPortal(<aside className="pool-global-score-alert" role="alert" aria-label="Pool results need attention"><span className="pool-ball" aria-hidden="true"><i>8</i></span><div><strong>{attention.title}</strong><p>{attention.attention.find(a=>a.kind==='contribution')?`${attention.attention.find(a=>a.kind==='contribution').requesterName} kindly asks if you can cover our R15 session contribution. It’s entirely your choice.`:`${attention.attention.length} finished games need scores or verification`}</p><button onClick={()=>{setRoute({code:attention.code,tab:attention.attention.some(a=>a.kind==='contribution')?'tables':'results',recipientUid:signedInUid});dismissAttention();}}>{attention.attention.some(a=>a.kind==='contribution')?'View invitation →':'Review scores →'}</button><button className="pool-text-button" onClick={dismissAttention}>Later</button></div></aside>,document.body)}</>;
}
