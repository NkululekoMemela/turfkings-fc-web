import {teamChatCacheKey,getTeamChatCache,putTeamChatCache,beginTeamChatWarm,endTeamChatWarm} from "../core/teamChatCache.mjs";
import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {memberWorkspaceRequest} from '../storage/memberWorkspaceGateway.js';
import TeamChatBadge from './TeamChatBadge.jsx';
import ClubTeamChat from './ClubTeamChat.jsx';
import './MemberWorkspace.css';
export default function TeamChatLauncher({clubId,venueId='',initialRequest=null}){
 const [uid,setUid]=useState(auth.currentUser?.uid||''),[value,setValue]=useState(null),[selected,setSelected]=useState(''),[refresh,setRefresh]=useState(0);
 const key=`${uid}:${clubId}:${venueId}`,current=useRef(key),opened=useRef(selected);current.current=key;opened.current=selected;
 useEffect(()=>onAuthStateChanged(auth,user=>setUid(user?.uid||'')),[]);
 useEffect(()=>{setValue(null);setSelected('');},[key]);
 useEffect(()=>{
  if(!uid||!clubId)return;let stopped=false,timer;
  async function load(){clearTimeout(timer);if(document.hidden){timer=setTimeout(load,6000);return;}
   try{const result=await memberWorkspaceRequest(venueId?'fieldClubChat':'clubTeamChat',{action:'rooms',clubId,venueId});if(!stopped&&current.current===key){setValue({key,...result});setSelected(old=>result.rooms?.some(r=>r.id===old)?old:'');
    for(const room of result.rooms||[]){const cacheKey=teamChatCacheKey(uid,clubId,venueId,room);if(!opened.current&&!getTeamChatCache(cacheKey)&&beginTeamChatWarm(cacheKey))memberWorkspaceRequest(venueId?'fieldClubChat':'clubTeamChat',{action:'messages',clubId,venueId,teamId:room.id,seasonId:room.seasonId,markRead:false}).then(data=>{if(!stopped&&current.current===key)putTeamChatCache(cacheKey,data);}).catch(()=>{}).finally(()=>endTeamChatWarm(cacheKey));}}}
   catch{if(!stopped&&current.current===key){setValue(null);setSelected('');}}
   finally{if(!stopped)timer=setTimeout(load,6000);}
  }
  const visible=()=>{if(!document.hidden)load();};load();document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[key,refresh]);
 useEffect(()=>{if(initialRequest&&(initialRequest.teamId||initialRequest.clubId))setSelected(initialRequest.teamId||initialRequest.clubId);},[initialRequest]);
 const rooms=value?.key===key?value.rooms||[]:[];
 return <><div className="team-chat-launchers">{rooms.map(room=><button className="team-chat-launcher" type="button" key={room.id} title={`${room.name} chat`} aria-label={`${room.name} chat${room.unreadCount?`, ${room.unreadCount} unread messages`:''}`} onClick={()=>setSelected(room.id)}>
  <TeamChatBadge room={room}/><span className="team-chat-button-label">Team chat</span><span className="team-chat-button-icon" aria-hidden="true">💬</span>
  {!!room.unreadCount&&<span className="team-chat-unread">{room.unreadCount>99?'99+':room.unreadCount}</span>}
 </button>)}</div>{selected&&clubId&&uid&&<ClubTeamChat key={`${key}:${selected}`} clubId={clubId} venueId={venueId} initialTeamId={selected} initialRoom={rooms.find(r=>r.id===selected)} sessionUid={uid} onRead={()=>setValue(old=>old?.key===key?{...old,rooms:old.rooms.map(r=>r.id===selected?{...r,unreadCount:0}:r)}:old)} onClose={()=>{setSelected('');setRefresh(r=>r+1);}}/>}</>;
}
