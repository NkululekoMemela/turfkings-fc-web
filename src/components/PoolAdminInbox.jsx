import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {activeFirebaseProjectId} from '../firebaseConfig.js';
function readSeen(key){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
export default function PoolAdminInbox({night,uid,busy,send,onReview}){
 const key=`pool-inbox:${activeFirebaseProjectId}:${night.code}:${uid}`,owner=night.ownerUid===uid;
 const [seen,setSeen]=useState(()=>readSeen(key)),[open,setOpen]=useState(false),[promoted,setPromoted]=useState(false);
 const priorOwner=useRef(night.ownerUid),dialog=useRef(null),lastFocus=useRef(null);
 const requests=owner?Object.entries(night.members).filter(([,m])=>m.status==='pending'):[];
 const scores=owner?night.pool.matches.filter(m=>m.verification==='pending'):[];
 const identifiers=[...requests.map(([id,m])=>`join:${id}:${m.joinedAt}`),...scores.map(m=>`score:${m.id}:${m.submittedAt}`)];
 const unseen=identifiers.some(id=>!seen.includes(id));
 useEffect(()=>{if(owner&&priorOwner.current!==uid)setPromoted(true);priorOwner.current=night.ownerUid;},[night.ownerUid,uid,owner]);
 useEffect(()=>{if(owner&&(unseen||promoted))setOpen(true);if(!owner)setOpen(false);},[owner,unseen,promoted]);
 useEffect(()=>{setSeen(readSeen(key));},[key]);
 function dismiss(){const next=[...new Set([...seen,...identifiers])].slice(-1200);setSeen(next);setOpen(false);setPromoted(false);try{localStorage.setItem(key,JSON.stringify(next));}catch{}}
 useEffect(()=>{
  if(!open||!owner)return;
  lastFocus.current=document.activeElement;dialog.current?.querySelector('button')?.focus();
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();dialog.current?.querySelector('[data-dismiss]')?.click();}if(event.key==='Tab'){const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')];const index=buttons.indexOf(document.activeElement);event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}};
  document.addEventListener('keydown',keydown);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',keydown);if(lastFocus.current?.isConnected)lastFocus.current.focus();};
 },[open,owner]);
 if(!owner)return null;
 return <>{(requests.length>0||scores.length>0)&&<button className="pool-inbox-bar" onClick={()=>setOpen(true)}>{requests.length} join requests · {scores.length} scores to verify <span>Review →</span></button>}{open&&createPortal(<div className="pool-inbox-backdrop" onClick={event=>{if(event.target===event.currentTarget)dismiss();}}><section ref={dialog} className="pool-inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="pool-inbox-title"><header><span className="pool-ball" aria-hidden="true"><i>8</i></span><div><small>POOL NIGHT</small><h2 id="pool-inbox-title">{promoted?'You’re now the admin':'Your night needs you'}</h2></div><button aria-label="Close pool alerts" data-dismiss onClick={dismiss}>×</button></header>{promoted&&<p>You can approve players, verify scores and pass admin duties to another player.</p>}{requests.length>0&&<><h3>Players waiting to join</h3>{requests.map(([id,member])=><div className="pool-inbox-request" key={id}><strong>{member.name}</strong><div><button disabled={busy} onClick={()=>send('approveMember',{uid:id})}>Approve {member.name}</button><button className="pool-inbox-decline" disabled={busy} onClick={()=>send('rejectMember',{uid:id})}>Decline</button></div></div>)}</>}{scores.length>0&&<><h3>{scores.length} scores need verification</h3><p>The results are saved. Review them before they count in standings.</p><button onClick={()=>{dismiss();onReview('results');}}>Review scores</button></>}{!requests.length&&!scores.length&&!promoted&&<p>You’re all caught up.</p>}<button className="pool-inbox-decline" data-dismiss onClick={dismiss}>Done</button><small className="pool-inbox-footnote">Pending requests stay in Players and Games even if you close this popup.</small></section></div>,document.body)}</>;
}
