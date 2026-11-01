import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {memberWorkspaceRequest} from '../storage/memberWorkspaceGateway.js';
import ClubTeamChat from './ClubTeamChat.jsx';
export default function TeamChatLauncher({clubId,venueId='',initialRequest=null}){
 const [uid,setUid]=useState(auth.currentUser?.uid||''),[value,setValue]=useState(null),[open,setOpen]=useState(false),[refresh,setRefresh]=useState(0);
 const key=`${uid}:${clubId}:${venueId}`,current=useRef(key);current.current=key;
 useEffect(()=>onAuthStateChanged(auth,user=>setUid(user?.uid||'')),[]);
 useEffect(()=>{setValue(null);setOpen(false);},[key]);
 useEffect(()=>{
  if(!uid||!clubId)return;let stopped=false,timer;
  async function load(){try{const result=await memberWorkspaceRequest(venueId?'fieldClubChat':'clubTeamChat',{action:'rooms',clubId,venueId});if(!stopped&&current.current===key){setValue({key,...result});if(!result.rooms?.length&&!(result.canManage&&result.hasTeams))setOpen(false);}}catch{if(!stopped&&current.current===key){setValue(null);setOpen(false);}}finally{if(!stopped)timer=setTimeout(load,30000);}}
  load();return()=>{stopped=true;clearTimeout(timer);};
 },[key,refresh]);
 useEffect(()=>{if(initialRequest&&(initialRequest.teamId||initialRequest.clubId))setOpen(true);},[initialRequest]);
 const rooms=value?.key===key?value.rooms:[],canSetup=value?.key===key&&value.canManage&&value.hasTeams;
 const show=rooms?.length>0||canSetup;
 const label=rooms?.length===1?`${rooms[0].name} chat`:venueId?'My Club chat':'Team chats';
 return <>{show&&<button type="button" onClick={()=>setOpen(true)}>{label}</button>}{open&&clubId&&uid&&<ClubTeamChat clubId={clubId} venueId={venueId} initialTeamId={initialRequest?.teamId||initialRequest?.clubId||rooms?.[0]?.id||''} onClose={()=>{setOpen(false);setRefresh(r=>r+1);}}/>}</>;
}
