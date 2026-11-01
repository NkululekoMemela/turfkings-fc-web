import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {memberWorkspaceRequest} from '../storage/memberWorkspaceGateway.js';
import './MemberWorkspace.css';
export default function ClubTeamChat({clubId,onClose,initialTeamId='',venueId=''}){
 const [uid,setUid]=useState(auth.currentUser?.uid||''),[rooms,setRooms]=useState([]),[team,setTeam]=useState(initialTeamId),[messages,setMessages]=useState([]),[draft,setDraft]=useState(''),[muted,setMuted]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[canManage,setCanManage]=useState(false),[setup,setSetup]=useState(null);
 const generation=useRef(0),pending=useRef(null),bottom=useRef(null),account=useRef(uid);
 const request=body=>memberWorkspaceRequest(venueId?'fieldClubChat':'clubTeamChat',{clubId,venueId,seasonId:rooms.find(r=>r.id===team)?.seasonId||'',...body});
 useEffect(()=>onAuthStateChanged(auth,user=>{const next=user?.uid||'';if(account.current===next)return;account.current=next;generation.current++;setUid(next);setRooms([]);setTeam('');setMessages([]);setDraft('');setError('');setCanManage(false);setSetup(null);setReady(false);pending.current=null;}),[]);
 useEffect(()=>{let active=true;setError('');if(!uid)return;request({action:'rooms'}).then(result=>{if(active){setCanManage(result.canManage===true);setRooms(result.rooms);setTeam(old=>result.rooms.some(r=>r.id===old)?old:result.rooms.some(r=>r.id===initialTeamId)?initialTeamId:result.rooms[0]?.id||'');setReady(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[clubId,venueId,uid]);
 useEffect(()=>{
  const current=++generation.current;setMessages([]);setError('');pending.current=null;
  if(!team||!uid)return;let stopped=false,timer;
  async function load(){try{const result=await request({action:'messages',teamId:team});if(!stopped&&current===generation.current){setMessages(result.messages);setMuted(result.muted);setError('');}}catch(e){if(!stopped&&current===generation.current){setError(e.message);setMessages([]);}}finally{if(!stopped)timer=setTimeout(load,6000);}}
  load();return()=>{stopped=true;clearTimeout(timer);};
 },[clubId,venueId,team,uid]);
 useEffect(()=>{const el=bottom.current;if(el&&el.scrollHeight-el.scrollTop-el.clientHeight<120)el.scrollTop=el.scrollHeight;},[messages]);
 async function send(event){event.preventDefault();if(busy||!draft.trim()||!team)return;setBusy(true);setError('');const current=generation.current;
  const text=draft.trim();if(!pending.current||pending.current.text!==text)pending.current={text,id:crypto.randomUUID()};
  try{await request({action:'send',teamId:team,text,requestId:pending.current.id});if(current!==generation.current)return;pending.current=null;setDraft('');const result=await request({action:'messages',teamId:team});if(current===generation.current){setMessages(result.messages);setTimeout(()=>{if(bottom.current)bottom.current.scrollTop=bottom.current.scrollHeight;},0);}}
  catch(e){if(current===generation.current)setError(e.message);}finally{setBusy(false);}
 }
 return <div className="member-workspace-backdrop"><section className="member-workspace" role="dialog" aria-modal="true" aria-label="Private team chats">
  <header><div><h2>{rooms.find(r=>r.id===team)?.name?`${rooms.find(r=>r.id===team).name} chat`:venueId?"My Club chat":"Team chats"}</h2><small>{venueId?"Private to your season squad":"Private to your confirmed teammates"}</small></div><button type="button" onClick={onClose} aria-label="Close team chat">×</button></header>
  {!uid?<p>Sign in to open your team chats.</p>:!ready&&!error?<p>Finding your teams…</p>:null}
  {ready&&!rooms.length&&<p>{venueId?"Your Club chat is available to the accepted season squad.":"Your team chat appears after your Club admin confirms team access."}</p>}
  {canManage&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{setSetup(await request({action:'setupPreview'}));}catch(e){setError(e.message);}finally{setBusy(false);}}}>Review team access</button>}
  {setup&&<div className="member-workspace-confirm"><strong>Confirm these private team rooms</strong><small>Review access again after changing squads.</small>{setup.teams.map((r,i)=><p key={i}><b>{r.name}</b>: {r.members.join(', ')||'No assigned players'}</p>)}<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await request({action:'setupSave',fingerprint:setup.fingerprint});setSetup(null);const result=await request({action:'rooms'});setRooms(result.rooms);setTeam(result.rooms[0]?.id||'');}catch(e){setError(e.message);}finally{setBusy(false);}}}>Confirm team access</button><button type="button" disabled={busy} onClick={()=>setSetup(null)}>Cancel</button></div>}
  {!!rooms.length&&<><div className="member-workspace-toolbar">{rooms.length>1?<select aria-label="Your team" value={team} disabled={busy} onChange={e=>{setTeam(e.target.value);setDraft('');}}>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>:<div><strong>{rooms[0]?.name}</strong>{!!rooms[0]?.captains?.length&&<small>Captain: {rooms[0].captains.join(", ")}</small>}</div>}<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await request({action:'mute',teamId:team,muted:!muted});setMuted(!muted);}catch(e){setError(e.message);}finally{setBusy(false);}}}>{muted?'Unmute team':'Mute team'}</button></div>
   <div className="member-workspace-messages" ref={bottom} role="log" aria-live="polite">{messages.map(m=><article key={m.id} className={m.senderUid===uid?'is-own':''}><strong>{m.senderName}{m.senderIsCaptain&&<span className="member-workspace-captain">Captain</span>}</strong><p>{m.text}</p><time>{new Date(m.createdAtMs).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})}</time></article>)}{!messages.length&&!error&&<p className="muted">Your team’s tactics start here.</p>}</div>
   <form onSubmit={send}><textarea aria-label="Message your team" placeholder="Message your team…" value={draft} maxLength={2000} disabled={busy} onChange={e=>setDraft(e.target.value)} rows={2}/><button type="submit" disabled={busy||!draft.trim()}>{busy?'Sending…':'Send'}</button></form></>}
  {error&&<p role="alert">{error}</p>}
 </section></div>;
}
