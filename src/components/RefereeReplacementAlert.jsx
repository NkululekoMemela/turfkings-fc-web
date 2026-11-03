import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {readyRefereeReplacements} from '../core/refereeActions.mjs';
import './RefereeReplacementAlert.css';
export default function RefereeReplacementAlert({enabled,teams,onOpenLineups}){
 const [acknowledged,setAcknowledged]=useState(new Set());
 const sounded=useRef(new Set()),audio=useRef(null);
 useEffect(()=>{
  function unlock(){try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;audio.current ||= new Context();if(audio.current.state==='suspended')audio.current.resume().catch(()=>{});}catch{}}
  window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);audio.current?.close().catch(()=>{});};
 },[]);
 const ready=enabled?readyRefereeReplacements(teams):[];
 const signature=ready.map(item=>item.key).join('|');
 useEffect(()=>{
  if(!enabled)return;
  const fresh=ready.filter(item=>{if(sounded.current.has(item.key))return false;try{if(sessionStorage.getItem('referee-replacement-ring:'+item.key)){sounded.current.add(item.key);return false;}}catch{}return true;});
  if(!fresh.length)return;
  // Match playing time determines readiness; no background timer or automatic player restoration.
  try{const ctx=audio.current;if(ctx?.state==='running')for(const offset of [0,.22]){const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+offset;oscillator.type='sine';oscillator.frequency.value=880;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.15,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.16);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start);oscillator.stop(start+.18);}}catch{}
  try{navigator.vibrate?.([160,90,160]);}catch{}
  for(const item of fresh){sounded.current.add(item.key);try{sessionStorage.setItem('referee-replacement-ring:'+item.key,'1');}catch{}}
 },[signature,enabled]);
 const visible=ready.filter(item=>!acknowledged.has(item.key));
 if(!visible.length)return null;
 return createPortal(<aside className="referee-replacement-alert" role="alert" aria-live="assertive"><strong>🔔 Replacement allowed</strong>{visible.map(item=><p key={item.key}><b>{item.label}</b>: the team’s penalty has ended. Select an eligible substitute. {item.playerName} stays dismissed.</p>)}<div><button type="button" onClick={()=>{setAcknowledged(old=>new Set([...old,...visible.map(item=>item.key)]));onOpenLineups?.();}}>Choose substitute</button><button type="button" onClick={()=>setAcknowledged(old=>new Set([...old,...visible.map(item=>item.key)]))}>Acknowledge</button></div></aside>,document.body);
}
