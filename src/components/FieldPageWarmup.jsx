import {useEffect} from 'react';
import {auth} from '../firebaseConfig.js';
import {subscribeFieldManifest} from '../storage/fieldManifestSubscription.js';
import {fieldTeamPaymentRequest} from '../storage/fieldTeamPaymentRepository.js';
import {fieldPageKey,saveFieldPage} from '../storage/fieldPageMemory.js';
export default function FieldPageWarmup({venue,season,clubId='',canManageBanking=false}){
 useEffect(()=>{
  if(!auth.currentUser?.uid||!venue?.id)return;
  let active=true;const uid=auth.currentUser.uid;
  const keep=(key,result)=>{if(active&&auth.currentUser?.uid===uid)saveFieldPage(key,result);};
  fieldTeamPaymentRequest(venue.id,'signupView',{clubId}).then(r=>keep(fieldPageKey('signup',venue.id,clubId,canManageBanking),r)).catch(()=>{});
  if(season?.id)fieldTeamPaymentRequest(venue.id,'leagueEntryView',{seasonId:season.id}).then(r=>keep(fieldPageKey('league-entry-receipts',venue.id,season.id),r)).catch(()=>{});
  const day=(season?.matchDays||[]).filter(d=>d.status==='scheduled').sort((a,b)=>a.dateLocal.localeCompare(b.dateLocal))[0];
  const stop=day?subscribeFieldManifest({venueId:venue.id,season,matchDayId:day.id,onData:r=>keep(fieldPageKey('squads',venue.id,season.id,day.id,'official',''),r),onError:()=>{}}):()=>{};
  return()=>{active=false;stop();};
 },[venue?.id,season?.id,season?.schedulePublishedAtMs,clubId,canManageBanking]);
 return null;
}
