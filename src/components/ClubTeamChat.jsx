import {teamChatCacheKey,getTeamChatCache,putTeamChatCache} from "../core/teamChatCache.mjs";
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {memberWorkspaceRequest} from '../storage/memberWorkspaceGateway.js';
import {ClubChatWidget} from './ClubChat/ClubChatWidget.jsx';
import './MemberWorkspace.css';
export default function ClubTeamChat({clubId,onClose,initialTeamId='',venueId='',initialRoom=null,sessionUid='',onRead=()=>{}}){
 const [uid,setUid]=useState(auth.currentUser?.uid||''),[rooms,setRooms]=useState(initialRoom?[initialRoom]:[]),[data,setData]=useState(()=>getTeamChatCache(teamChatCacheKey(auth.currentUser?.uid,clubId,venueId,initialRoom))||{messages:[],members:[]}),[ready,setReady]=useState(!!initialRoom),[showMembers,setShowMembers]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const latestLoad=useRef(0),generation=useRef(0),reading=useRef(true),onReadRef=useRef(onRead),pending=useRef(null),inFlight=useRef(false),onCloseRef=useRef(onClose);onReadRef.current=onRead;onCloseRef.current=onClose;
 const room=rooms.find(r=>r.id===initialTeamId),seasonId=room?.seasonId||'';
 const request=useCallback(body=>memberWorkspaceRequest(venueId?'fieldClubChat':'clubTeamChat',{clubId,venueId,teamId:initialTeamId,seasonId,...body}),[clubId,venueId,initialTeamId,seasonId]);
 useEffect(()=>onAuthStateChanged(auth,user=>setUid(user?.uid||'')),[]);
 useEffect(()=>{
  let active=true;setError('');generation.current++;pending.current=null;
  if(initialRoom&&uid===sessionUid){setRooms([initialRoom]);setReady(true);setData(getTeamChatCache(teamChatCacheKey(uid,clubId,venueId,initialRoom))||{messages:[],members:[]});return()=>{active=false;generation.current++;};}
  setRooms([]);setReady(false);setData({messages:[],members:[]});
  if(uid)memberWorkspaceRequest(venueId?'fieldClubChat':'clubTeamChat',{action:'rooms',clubId,venueId}).then(result=>{if(active){setRooms(result.rooms||[]);setReady(true);}}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;generation.current++;};
 },[clubId,venueId,uid,initialTeamId]);
 const refresh=useCallback(async()=>{
  const token=generation.current,load=++latestLoad.current,result=await request({action:'messages',markRead:!document.hidden&&reading.current});
  if(token!==generation.current||load!==latestLoad.current)return;
  putTeamChatCache(teamChatCacheKey(uid,clubId,venueId,room),result);setData(result);setError('');if(!document.hidden&&reading.current)onReadRef.current();
 },[request]);
 useEffect(()=>{
  if(!uid||!seasonId)return;let stopped=false,timer;
  async function load(){clearTimeout(timer);try{if(!document.hidden)await refresh();}catch(e){if(!stopped){setData({messages:[],members:[]});setError(e.message);}}finally{if(!stopped)timer=setTimeout(load,4000);}}
  const visible=()=>{if(!document.hidden)load();};load();document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);generation.current++;};
 },[uid,seasonId,refresh]);
 useEffect(()=>{const close=e=>{if(e.key==='Escape')onCloseRef.current();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
 async function mutate(body){
  if(inFlight.current)throw Error('Please wait for your previous action.');
  inFlight.current=true;setBusy(true);const token=generation.current;
  try{await request(body);if(token===generation.current)await refresh();}
  finally{inFlight.current=false;if(token===generation.current)setBusy(false);}
 }
 const adapter={room,loading:!data.members?.length,members:data.members||[],onMembers:()=>setShowMembers(value=>!value),messages:data.messages||[],busy,muted:data.muted===true,canSend:!!room&&!!data.members?.some(m=>m.uid===uid),onClose,onReading:value=>{reading.current=value;},onError:message=>setError(message),
  send:async payload=>{const fingerprint=JSON.stringify(payload);if(!pending.current||pending.current.fingerprint!==fingerprint)pending.current={fingerprint,id:crypto.randomUUID()};await mutate({action:'send',...payload,requestId:pending.current.id});pending.current=null;},
  react:(messageId,emoji)=>mutate({action:'react',messageId,emoji}),remove:messageId=>mutate({action:'delete',messageId}),mute:()=>mutate({action:'mute',muted:!data.muted}),highlights:async()=>{const result=await request({action:'highlights'});return result.highlights||[];}};
 const member=data.members?.find(m=>m.uid===uid);
 return <div className="member-workspace-backdrop team-chat-backdrop"><section className="team-chat-room" role="dialog" aria-modal="true" aria-label={`${room?.name||'Team'} chat`}>
  {!uid||!ready||!room?<div className="team-chat-loading"><button type="button" onClick={onClose} aria-label="Close team chat">×</button><p>{!uid?'Sign in to open your team chat.':!ready?'Opening your team chat…':'This team session has changed. Open your current team from Club chat.'}</p></div>:<ClubChatWidget activeClubId={clubId} activeClubName={room.name} currentUser={auth.currentUser} selectedMember={member} members={data.members||[]} isAdminViewer={data.canModerate===true} variant="page" privateRoom={adapter}/>}
  {showMembers&&<section className="team-chat-members" role="dialog" aria-label="Team members"><header><strong>Team members · {data.members?.length||0}</strong><button type="button" aria-label="Close members" onClick={()=>setShowMembers(false)}>×</button></header><small>These players can read messages in this team chat.</small>{(data.members||[]).map(member=><div key={member.id}>{member.photoUrl?<img src={member.photoUrl} alt=""/>:<span aria-hidden="true">👤</span>}<strong>{member.shortName||member.fullName}</strong><small>{member.role==='captain'?'Captain':member.uid?'Member':'Sign-in needed'}</small></div>)}</section>}
  {error&&<p className="team-chat-error" role="alert">{error}</p>}
 </section></div>;
}
