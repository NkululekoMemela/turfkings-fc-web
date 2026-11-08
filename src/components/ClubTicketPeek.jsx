import React,{useEffect,useState} from 'react';
import ClubNavPeek from './ClubNavPeek.jsx';
import {onAuthStateChanged} from 'firebase/auth';
import {doc,getDoc,onSnapshot,query,where} from 'firebase/firestore';
import {auth,db} from '../firebaseConfig.js';
import {getMatchCreditsCollection} from '../core/clubFirestorePaths.js';

export default function ClubTicketPeek({buttonRef,clubId,memberId,enabled,navHidden}){
 const [uid,setUid]=useState(auth.currentUser?.uid||'');
 const [count,setCount]=useState(0),[loadedKey,setLoadedKey]=useState("");
 useEffect(()=>onAuthStateChanged(auth,user=>setUid(user?.uid||'')),[]);
 const key=JSON.stringify([uid,clubId,memberId]);
 useEffect(()=>{
  if(!enabled||!uid||!clubId||!memberId)return;
  let stopped=false,unsubscribe=()=>{};
  (async()=>{
   const user=auth.currentUser;if(user?.uid!==uid||user.isAnonymous)return;
   const member=(await getDoc(doc(db,'clubs',clubId,'members',memberId))).data();
   const mine=member&&(member.status||'active')==='active'&&(member.uid===uid||(user.emailVerified&&member.email&&String(member.email).trim().toLowerCase()===String(user.email||'').trim().toLowerCase()));
   if(stopped||!mine||!member.playerId)return;
   unsubscribe=onSnapshot(query(getMatchCreditsCollection(db,clubId),where('playerId','==',member.playerId)),snapshot=>{
    if(!stopped&&auth.currentUser?.uid===uid){setCount(snapshot.docs.filter(d=>d.data().status==='available').length);setLoadedKey(key);}
   },()=>{if(!stopped){setCount(0);setLoadedKey('');}});
  })().catch(()=>{if(!stopped){setCount(0);setLoadedKey('');}});
  return()=>{stopped=true;unsubscribe();};
 },[enabled,key]);
 return <ClubNavPeek key={key} buttonRef={buttonRef} kind="ticket"
  enabled={enabled&&!navHidden&&count>0&&loadedKey===key&&auth.currentUser?.uid===uid}>
  🎟️ <b>{count}</b><span className="club-nav-peek__sr"> available match tickets</span>
 </ClubNavPeek>;
}
