import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,query,orderBy,limit} from 'firebase/firestore';
import {db,auth} from '../firebaseConfig.js';
export default function FieldActivityNotice({venueId,onOpen}){
 const [entry,setEntry]=useState(null);
 useEffect(()=>{setEntry(null);if(!venueId||!auth.currentUser?.uid)return;const key=`field-activity-seen:${auth.currentUser.uid}:${venueId}`;return onSnapshot(query(collection(db,'leagueVenues',venueId,'actionLog'),orderBy('at','desc'),limit(1)),snap=>{const d=snap.docs[0];if(!d)return;let seen='';try{seen=localStorage.getItem(key)||'';}catch{}if(d.id!==seen&&d.data().actorUid!==auth.currentUser?.uid)setEntry({id:d.id,...d.data(),key});},()=>{});},[venueId]);
 if(!entry)return null;
 const dismiss=()=>{try{localStorage.setItem(entry.key,entry.id);}catch{}setEntry(null);};
 return <aside className="card" style={{margin:'8px 0',padding:10,fontSize:12}}><strong>{entry.actorName||'Field official'} · {entry.label}</strong><div style={{display:'flex',gap:8,marginTop:6}}><button className="secondary-btn" onClick={()=>{dismiss();onOpen();}}>View activity</button><button className="secondary-btn" onClick={dismiss}>Dismiss</button></div></aside>;
}
