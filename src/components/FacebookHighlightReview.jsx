import React,{useState,useEffect,useRef} from 'react';
import FacebookReviewPanel,{FacebookReviewEntry} from './FacebookReviewPanel.jsx';
import {enablePoolAlerts} from '../core/poolNotifications.js';
import {createPortal} from 'react-dom';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,getActiveFirebaseFunctionsBaseUrl} from '../firebaseConfig.js';
import './FacebookHighlightReview.css';
async function request(body){const u=auth.currentUser;if(!u)throw Error('Sign in first.');const response=await fetch(`${getActiveFirebaseFunctionsBaseUrl().replace(/\/$/,'')}/facebookReview`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await u.getIdToken()}`},body:JSON.stringify(body),signal:AbortSignal.timeout(350000)});const data=await response.json();if(auth.currentUser?.uid!==u.uid)throw Error('Account changed. Reopen review.');if(!response.ok||data.error)throw Error(data.error||'Review failed.');return data;}
export default function FacebookHighlightReview(){
 const [user,setUser]=useState(auth.currentUser),[open,setOpen]=useState(false),[view,setView]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[pending,setPending]=useState(null),[alertsEnabled,setAlertsEnabled]=useState(false);
 const previousUser=useRef(auth.currentUser?.uid);
 const isOwner=user?.emailVerified&&user.email?.toLowerCase()==='nkululekolerato@gmail.com';
 useEffect(()=>{let active=true;setPending(null);if(!isOwner)return;async function refresh(){try{const data=await request({action:'count'});if(active)setPending(data.pending);}catch{if(active)setPending(null);}}refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};},[isOwner,user?.uid]);
 useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);if(previousUser.current!==u?.uid){setOpen(false);setView(null);}previousUser.current=u?.uid;}),[]);
 async function run(body){setBusy(true);setError('');try{const result=await request(body);if(body.action==='connection')setNotice(`Connected to ${result.name}`);setView(await request({action:'list',draftId:new URLSearchParams(window.location.search).get('facebookReview')}));try{const count=await request({action:'count'});setPending(count.pending);}catch{setPending(null);}}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{
  if(!isOwner)return;
  function openRequested(){const id=new URLSearchParams(window.location.search).get('facebookReview');if(!/^[a-f0-9]{64}$/.test(id||''))return;setOpen(true);run({action:'list'});}
  openRequested();window.addEventListener('facebook-review-open',openRequested);
  return()=>window.removeEventListener('facebook-review-open',openRequested);
 },[isOwner,user?.uid]);
 useEffect(()=>{if(!open||!view)return;const id=new URLSearchParams(window.location.search).get('facebookReview');if(!/^[a-f0-9]{64}$/.test(id||''))return;const card=document.getElementById(`facebook-draft-${id}`);if(card){card.scrollIntoView({block:'center',behavior:'smooth'});card.focus({preventScroll:true});}},[open,view]);
 async function enableAlerts(){setBusy(true);setError('');try{await enablePoolAlerts();setAlertsEnabled(true);setNotice('Phone alerts enabled on this device. New highlights will notify you here.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{
  if(!isOwner||!open||busy||!view?.discovery?.more)return;
  const timer=setTimeout(()=>run({action:'list'}),1500);
  return()=>clearTimeout(timer);
 },[isOwner,open,busy,view]);
 if(!isOwner)return null;
 return <><FacebookReviewEntry pending={pending} onOpen={()=>{setOpen(true);run({action:'list'});}}/>{open&&createPortal(<div className="fb-review-backdrop"><FacebookReviewPanel view={view} busy={busy} error={error} notice={notice} alertsEnabled={alertsEnabled} onClose={()=>setOpen(false)} onRefresh={()=>run({action:'list'})} onConnect={()=>run({action:'connection'})} onAlerts={enableAlerts}>{view?.items.map(item=><Draft key={`${item.id}-${item.revision}`} item={item} busy={busy} live={view.liveEnabled} run={run}/>)}</FacebookReviewPanel></div>,document.body)}</>;

}
function Draft({item,busy,live,run}){
 const [draft,setDraft]=useState(item),[confirm,setConfirm]=useState(false);const editable=['pending','rejected'].includes(item.status),dirty=['playerName','clubName','fieldName','caption'].some(k=>draft[k]!==item[k]);
 return <article className="fb-draft" id={`facebook-draft-${item.id}`} tabIndex={-1}><div className="fb-draft-meta"><strong>{item.scope==='field'?'Field league':'Club league'} · Goal of the night</strong><span>{item.status.replaceAll('_',' ')}</span></div>{/^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(item.videoUrl)&&<video controls preload="none" src={item.videoUrl}/>}
 <fieldset disabled={busy||!editable}>{[['playerName','Scorer'],['clubName','Club'],['fieldName','Field']].map(([key,label])=><label key={key}>{label}<input value={draft[key]||''} maxLength={160} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}<label>Caption<textarea rows={5} maxLength={4000} value={draft.caption||''} onChange={e=>setDraft({...draft,caption:e.target.value})}/></label></fieldset>
 {item.lastError&&<p role="alert">{item.lastError} Check Facebook before attempting any manual publication. This item will not retry automatically.</p>}
 <div className="fb-draft-actions">{editable&&<><button disabled={busy} onClick={()=>run({action:'save',...draft})}>Save draft</button><button disabled={busy} onClick={()=>run({action:'reject',id:item.id,revision:item.revision})}>Reject</button>{item.status==='pending'&&<button className="fb-approve" disabled={busy||!live||dirty} onClick={()=>setConfirm(true)}>Approve & publish</button>}{dirty&&<small>Save your edits before approving.</small>}</>}{['processing','publishing','needs_attention'].includes(item.status)&&<button disabled={busy} onClick={()=>run({action:'status',id:item.id})}>Check Facebook status</button>}{item.permalink&&<a href={item.permalink} target="_blank" rel="noreferrer">View published Reel</a>}</div>
 {confirm&&<div className="fb-confirm"><p>Publish this saved video and caption publicly to <strong>5 asides near me</strong> now?</p><button disabled={busy} onClick={()=>{setConfirm(false);run({action:'approve',id:item.id,revision:item.revision});}}>Yes, publish this highlight</button><button disabled={busy} onClick={()=>setConfirm(false)}>Keep as draft</button></div>}</article>;
}
