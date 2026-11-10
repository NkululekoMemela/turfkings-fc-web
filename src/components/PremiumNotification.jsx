import {shouldPresentChatNotification} from "../core/chatNotificationPreferences.js";
import React,{useEffect,useState} from "react";
import {createPortal} from "react-dom";
import "./PremiumNotification.css";
const safeImage=value=>/^https:\/\//i.test(value||'')?value:'';
function Badge({src,label,portrait=false}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img className={`fanm-notice-picture ${portrait?"is-portrait":""}`} src={src} alt="" onError={()=>setFailed(true)}/>:<span className="fanm-notice-picture fanm-notice-fallback" aria-label={label}>{String(label||'⚽').slice(0,2).toUpperCase()}</span>;}
function NoticeArtwork({item}){
 const data=item.data||{},[switched,setSwitched]=useState(null);
 const portrait=safeImage(data.senderPhotoUrl),logo=safeImage(data.groupLogoUrl);
 useEffect(()=>{if(!portrait||!logo)return;const timer=setTimeout(()=>setSwitched(item),3000);return()=>clearTimeout(timer);},[item,portrait,logo]);
 if(data.type==="club_exhibition_invitation")return <span className="fanm-notice-source fanm-notice-club-pair" style={{display:"inline-flex",alignItems:"center",gap:4}}>
   <Badge src={safeImage(data.homeCrestUrl)} label={data.homeClubName}/><span aria-hidden="true">vs</span><Badge src={safeImage(data.awayCrestUrl)} label={data.awayClubName}/>
 </span>;
 const showPortrait=!!portrait&&switched!==item;
 return <span className="fanm-notice-source"><Badge portrait={showPortrait} src={showPortrait?portrait:logo||safeImage(data.fieldLogoUrl||data.imageUrl)||portrait} label={data.senderName||data.sourceName||data.clubName||"⚽"}/></span>;
}
export function PremiumNotificationToast(){
 const [queue,setQueue]=useState([]);
 useEffect(()=>{let active=true;const receive=event=>{shouldPresentChatNotification(event.detail?.data).then(show=>{if(active&&show)setQueue(old=>[...old.slice(-3),event.detail]);}).catch(()=>{});};window.addEventListener('fanm-notification',receive);return()=>{active=false;window.removeEventListener('fanm-notification',receive);};},[]);
 useEffect(()=>{if(!queue.length)return;const timer=setTimeout(()=>setQueue(old=>old.slice(1)),4000);return()=>clearTimeout(timer);},[queue[0]]);
 const item=queue[0];if(!item)return null;const data=item.data||{};
 const open=()=>{window.dispatchEvent(new CustomEvent("fanm-notification-open",{detail:item}));setQueue(old=>old.slice(1));};
 return createPortal(<aside className="fanm-premium-notice" role="status" aria-live="polite">
 <button className="fanm-notice-open" type="button" onClick={open} aria-label={`Open ${item.title||"notification"}`}>
 <NoticeArtwork item={item}/>
 <span className="fanm-notice-copy"><small>{data.sourceName||data.clubName||data.fieldName||"FANM"}</small><strong>{item.title||"FANM update"}</strong><span className="fanm-notice-body">{item.body}</span></span>
 {safeImage(data.contentImageUrl)&&<img className="fanm-notice-content" src={safeImage(data.contentImageUrl)} alt="" onError={event=>{event.currentTarget.style.display="none";}}/>}
 <img className="fanm-notice-brand-logo" src="/pwa/fanm-app-icon.png" alt="FANM"/>
 </button><button type="button" aria-label="Dismiss notification" onClick={()=>setQueue(old=>old.slice(1))}>×</button></aside>,document.body);
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
