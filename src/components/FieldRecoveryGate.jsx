import React,{useEffect,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {savedBooth,recoverSavedBooth,flushBooth,publishBoothFinish,readBooth} from '../storage/fieldBoothJournal.js';
import {FIELD_BOOTH_RETURN_MS} from '../core/fieldBoothRecovery.mjs';
import VenueLiveMatchRuntime from './VenueLiveMatchRuntime.jsx';
import VenueLeagueStatsPage from '../pages/VenueLeagueStatsPage.jsx';
// Recovery works without a Field search when an authorised official's own phone
// reopens offline. No temporary accounts or persistent recovery buttons are exposed.
export default function FieldRecoveryGate({children}) {
 const [user,setUser]=useState(auth.currentUser),[recovery,setRecovery]=useState(null),[stats,setStats]=useState(false);
 const [controls,setControls]=useState(false);
 useEffect(()=>onAuthStateChanged(auth,next=>{setUser(next);if(!next)setRecovery(null);}),[]);
 useEffect(()=>{
  if(!user)return;
  const check=()=>{
   const local=savedBooth();
   if(!local||local.conflict||local.context?.guest!==false)return;
   if(navigator.onLine){
    flushBooth(local.scope).then(()=>publishBoothFinish(local.scope)).catch(()=>{});
   }else if(local.state?.status==='live'&&local.state.liveMatchController?.uid===user.uid){
    setRecovery(previous=>previous||{...local,live:recoverSavedBooth(local.scope)});
   }
  };
  check();const timer=setInterval(check,5000);window.addEventListener('online',check);window.addEventListener('offline',check);
  return()=>{clearInterval(timer);window.removeEventListener('online',check);window.removeEventListener('offline',check);};
 },[user?.uid]);
 useEffect(()=>{if(!stats||!controls)return;const timer=setTimeout(()=>setStats(false),FIELD_BOOTH_RETURN_MS);return()=>clearTimeout(timer);},[stats,controls]);
 if(!recovery)return children;
 const {scope,context}=recovery;
 return <div className="app-root app-root--field"><div className="field-live-runtime">
  {stats?<><button className="secondary-btn" onClick={()=>setStats(false)}>Return to match</button><VenueLeagueStatsPage venue={context.venue} season={context.season} clubs={context.teams} canCorrectResults={false} onBack={()=>setStats(false)}/></>:
   <VenueLiveMatchRuntime dataScope={scope} venue={context.venue} season={context.season} teams={context.teams}
    identity={{uid:user?.uid,name:user?.displayName||'Field official',role:'referee'}} activeRole="referee" canOperateMatch
    onControlState={setControls} onGoToStats={()=>setStats(true)} onBack={()=>{
      if(readBooth(scope)?.state?.status==='live'&&controls)setStats(true);else setRecovery(null);
    }}/>}
 </div></div>;
}
