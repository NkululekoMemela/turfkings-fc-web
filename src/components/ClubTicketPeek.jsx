import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {onAuthStateChanged} from 'firebase/auth';
import {doc,getDoc,onSnapshot,query,where} from 'firebase/firestore';
import {auth,db} from '../firebaseConfig.js';
import {getMatchCreditsCollection} from '../core/clubFirestorePaths.js';

export default function ClubTicketPeek({buttonRef,clubId,memberId,enabled,navHidden}){
 const [uid,setUid]=useState(auth.currentUser?.uid||'');
 const [visible,setVisible]=useState(false),[position,setPosition]=useState(null),[peek,setPeek]=useState(false),[count,setCount]=useState(0),[loadedKey,setLoadedKey]=useState("");
 const played=useRef(false),timer=useRef(null);
 useEffect(()=>onAuthStateChanged(auth,user=>setUid(user?.uid||'')),[]);
 const key=JSON.stringify([uid,clubId,memberId]);
 useEffect(()=>{setPeek(false);setCount(0);played.current=false;clearTimeout(timer.current);},[key]);
 useEffect(()=>{
  const button=buttonRef.current,scroller=button?.closest('.tk-bottom-nav-scroll');
  if(!button||!scroller||!enabled||navHidden||!uid||!memberId){setVisible(false);setPeek(false);return;}
  const measure=()=>{
   const b=button.getBoundingClientRect(),s=scroller.getBoundingClientRect();
   const shown=b.width>0&&b.left>=Math.max(0,s.left)-1&&b.right<=Math.min(innerWidth,s.right)+1&&b.top>=0&&b.bottom<=innerHeight+1&&!document.hidden;
   setVisible(shown);setPosition(shown?{left:b.left+b.width/2,top:b.top-4}:null);
   if(!shown){played.current=false;setPeek(false);clearTimeout(timer.current);}
  };
  const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(measure,{root:scroller,threshold:[0,0.99,1]}):null;
  observer?.observe(button);measure();
  scroller.addEventListener('scroll',measure,{passive:true});window.addEventListener('resize',measure);document.addEventListener('visibilitychange',measure);
  return()=>{observer?.disconnect();scroller.removeEventListener('scroll',measure);window.removeEventListener('resize',measure);document.removeEventListener('visibilitychange',measure);clearTimeout(timer.current);};
 },[enabled,navHidden,uid,memberId,clubId,buttonRef]);
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
   },()=>{if(!stopped){setCount(0);setPeek(false);setLoadedKey('');}});
  })().catch(()=>{if(!stopped){setCount(0);setPeek(false);setLoadedKey('');}});
  return()=>{stopped=true;unsubscribe();};
 },[enabled,key]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useEffect(()=>{
  if(!visible||navHidden||!enabled||count<=0||loadedKey!==key||played.current)return;
  played.current=true;setPeek(true);timer.current=setTimeout(()=>setPeek(false),2200);
 },[visible,navHidden,enabled,count,loadedKey,key]);
 if(count<=0||!peek||!visible||navHidden||!position||!enabled||loadedKey!==key||auth.currentUser?.uid!==uid)return null;
 return createPortal(<><span role="status" className="club-ticket-peek" style={{left:position.left,top:position.top}}>🎟️ <b>{count}</b><span className="club-ticket-peek__sr"> available match tickets</span></span><style>{`
 .club-ticket-peek{position:fixed;z-index:11000;transform:translate(-50%,-100%);padding:6px 10px;border-radius:12px;background:#e9b94b;color:#17212c;box-shadow:0 4px 14px #0006;font-size:18px;pointer-events:none;white-space:nowrap;animation:club-ticket-rise 2.2s both}
 .club-ticket-peek__sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
 @keyframes club-ticket-rise{0%{opacity:0;transform:translate(-50%,8px)}18%,78%{opacity:1;transform:translate(-50%,-100%)}100%{opacity:0;transform:translate(-50%,8px)}}
 @media(prefers-reduced-motion:reduce){.club-ticket-peek{animation:none}}
 `}</style></>,document.body);
}
