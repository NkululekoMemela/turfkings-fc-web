import React,{useEffect,useState} from "react";
import {createPortal} from "react-dom";
import "./PremiumNotification.css";
const safeImage=value=>/^https:\/\//i.test(value||'')?value:'';
function Badge({src,label,portrait=false}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img className={`fanm-notice-picture ${portrait?"is-portrait":""}`} src={src} alt="" onError={()=>setFailed(true)}/>:<span className="fanm-notice-picture fanm-notice-fallback" aria-label={label}>{String(label||'⚽').slice(0,2).toUpperCase()}</span>;}
export function PremiumNotificationToast(){
 const [queue,setQueue]=useState([]);
 useEffect(()=>{const receive=event=>setQueue(old=>[...old.slice(-3),event.detail]);window.addEventListener('fanm-notification',receive);return()=>window.removeEventListener('fanm-notification',receive);},[]);
 useEffect(()=>{if(!queue.length)return;const timer=setTimeout(()=>setQueue(old=>old.slice(1)),7000);return()=>clearTimeout(timer);},[queue]);
 const item=queue[0];if(!item)return null;const data=item.data||{};
 return createPortal(<aside className="fanm-premium-notice" role="status" aria-live="polite"><span className="fanm-notice-brand" aria-label="FANM">FANM</span><div className="fanm-notice-copy"><strong>{item.title||'FANM update'}</strong><p>{item.body}</p></div><Badge portrait={Boolean(data.senderPhotoUrl)} src={safeImage(data.senderPhotoUrl||data.fieldLogoUrl||data.imageUrl)} label={data.senderName||data.fieldName||data.clubName||'⚽'}/><button type="button" aria-label="Dismiss notification" onClick={()=>setQueue(old=>old.slice(1))}>×</button></aside>,document.body);
}
export function FieldAcceptedTeams({venueId,season,clubs={},userId,enabled=false}){
 const key=`field-accepted:${userId}:${venueId}:${season?.id}`;
 const [state,setState]=useState({key:'',seen:[]});
 useEffect(()=>{let seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]');}catch{}setState({key,seen:Array.isArray(seen)?seen:[]});},[key]);
 if(!enabled||!userId||!season?.id||season.status!=='active'||state.key!==key)return null;
 const pending=Object.entries(season.invitations||{}).filter(([id,item])=>item?.status==='accepted'&&(season.clubIds||[]).includes(id)&&!state.seen.includes(id));
 if(!pending.length)return null;
 const dismiss=()=>{const seen=[...new Set([...state.seen,...pending.map(([id])=>id)])];try{localStorage.setItem(key,JSON.stringify(seen));}catch{}setState({key,seen});};
 return createPortal(<aside className="fanm-premium-notice fanm-accepted-notice" role="status" aria-live="polite"><div className="fanm-accepted-heading"><span className="fanm-notice-brand">FANM</span><div><strong>{pending.length===1?'A team has accepted':'Teams have accepted'}</strong><small>{season.name||'Your league season'}</small></div><button type="button" onClick={dismiss} aria-label="Dismiss accepted teams">×</button></div><ul>{pending.map(([id,item])=><li key={id}><div><strong>{clubs[id]?.name||item.clubName||id}</strong><small>Season invitation accepted</small></div><Badge src={safeImage(clubs[id]?.logoUrl)} label={clubs[id]?.name||item.clubName||id}/></li>)}</ul></aside>,document.body);
}
