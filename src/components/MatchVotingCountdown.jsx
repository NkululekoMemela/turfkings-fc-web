import React,{useEffect,useRef,useState} from 'react';
import {collection,doc,onSnapshot} from 'firebase/firestore';
import {db} from '../firebaseConfig.js';
import {matchVotingDeadline,matchVotingLabel} from '../core/highlightVotingClock.mjs';
export default function MatchVotingCountdown({kind='field',ownerId,matchId}){
 const ref=useRef(null),[view,setView]=useState(null),[now,setNow]=useState(Date.now),[error,setError]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  setView(null);setError(false);if(!ownerId||!matchId)return;
  let stopParent,stopClips,started=false,parent=null,clips=null;
  const update=()=>{if(parent&&clips)setView({deadline:matchVotingDeadline(clips,parent),closed:parent.weeklyVotingClosed===true});};
  const start=()=>{if(started)return;started=true;const root=kind==='club'?'clubs':'leagueVenues';
   try{const match=doc(db,root,ownerId,'video_highlights',matchId);stopParent=onSnapshot(match,snapshot=>{parent=snapshot.data()||{};update();},()=>setError(true));stopClips=onSnapshot(collection(match,'raw'),snapshot=>{clips=snapshot.docs.map(doc=>doc.data());update();},()=>setError(true));}catch{setError(true);}
  };
  let observer;if(typeof IntersectionObserver==='function'&&ref.current){observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){start();observer.disconnect();}},{rootMargin:'100px'});observer.observe(ref.current);}else start();
  return()=>{observer?.disconnect();stopParent?.();stopClips?.();};
 },[kind,ownerId,matchId]);
 const closed=view&&(view.closed||view.deadline<=now);
 return <span ref={ref} className={`match-voting-countdown${closed?' is-closed':''}`} title={view&&Number.isFinite(view.deadline)?`Match voting closes ${new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Johannesburg'}).format(view.deadline)}`:undefined}><span aria-hidden="true">◷</span>{error?'Voting time unavailable':view?matchVotingLabel(view.deadline,now,view.closed):'Checking voting time…'}</span>;
}
