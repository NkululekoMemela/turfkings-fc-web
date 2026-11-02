import {collection,onSnapshot} from 'firebase/firestore';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,db,getActiveFirebaseFunctionsBaseUrl} from '../firebaseConfig.js';
import {getFieldMatchDaySquads} from './fieldSeasonSquadRepository.js';

const recent=new Map();
export function subscribeCarriedFieldRoster({venueId,season,matchDayId,onData,onError}){
 let stopped=false,inFlight=false,queued=false,owner=auth.currentUser?.uid||'',revision=0;
 const key=()=>JSON.stringify([getActiveFirebaseFunctionsBaseUrl(),owner,venueId,season.id,matchDayId]);
 const showCached=()=>{const cached=recent.get(key());if(owner&&cached&&Date.now()-cached.at<120000)onData(cached.value);};
 async function refresh(){
  if(stopped||document.hidden)return;
  if(inFlight){queued=true;return;}
  if(!owner){onData({matchDayId,clubs:[]});onError?.(new Error('Sign in to view the Field season squad.'));return;}
  inFlight=true;const token=revision,uid=owner;
  try{
   const result=await getFieldMatchDaySquads({venueId,seasonId:season.id,matchDayId});
   if(stopped||token!==revision||uid!==auth.currentUser?.uid)return;
   recent.set(key(),{at:Date.now(),value:result});
   if(recent.size>20)recent.delete(recent.keys().next().value);
   onData(result);
  }catch(error){if(!stopped&&token===revision&&uid===auth.currentUser?.uid)onError?.(error);}
  finally{inFlight=false;if(queued&&!stopped){queued=false;refresh();}}
 }
 showCached();
 const unsubscribeAuth=onAuthStateChanged(auth,user=>{
  const next=user?.uid||'';
  if(next!==owner){owner=next;revision++;recent.clear();onData({matchDayId,clubs:[]});showCached();}
  refresh();
 });
 // Weekly manifests are update signals, not the source of the season roster.
 let initial=true;
 const unsubscribeChanges=onSnapshot(collection(db,`leagueVenues/${venueId}/seasons/${season.id}/fieldMatchDayManifests/${matchDayId}/clubs`),()=>{
  if(initial){initial=false;return;}refresh();
 },error=>{if(!stopped)onError?.(error);});
 const timer=setInterval(refresh,30000);
 window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
 return()=>{stopped=true;revision++;unsubscribeAuth();unsubscribeChanges();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
}
