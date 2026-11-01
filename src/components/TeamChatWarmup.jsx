import {useEffect} from 'react';
import {preloadTeamChat} from '../core/teamChatPreload.mjs';
import {memberWorkspaceRequest} from '../storage/memberWorkspaceGateway.js';
export default function TeamChatWarmup({uid,clubId,venueId=''}){
 useEffect(()=>{if(!uid||!clubId)return;let stopped=false,timer;
 const load=async()=>{if(!document.hidden)try{await preloadTeamChat({uid,clubId,venueId,request:body=>memberWorkspaceRequest(venueId?'fieldClubChat':'clubTeamChat',body)});}catch{}if(!stopped)timer=setTimeout(load,10000);};
 const visible=()=>{if(!document.hidden){clearTimeout(timer);load();}};load();document.addEventListener('visibilitychange',visible);
 return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[uid,clubId,venueId]);return null;
}
