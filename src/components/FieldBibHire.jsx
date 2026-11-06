import FieldBibInventory from "./FieldBibInventory.jsx";
import {fieldOpenMatchDays} from "../core/fieldRouteSafety.mjs";
import {getFieldMatchDaySquads} from "../storage/fieldSeasonSquadRepository.js";
import PremiumSelect from "./PremiumSelect.jsx";
import "./FieldBibHire.css";
import React,{useEffect,useRef,useState} from 'react';
import {onIdTokenChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {kitShopRequest} from '../storage/kitShopGateway.js';
const stockViews=new Map();
export async function preloadFieldBibStock(venueId){const uid=auth.currentUser?.uid;if(!uid||!venueId)return;const key=JSON.stringify([uid,venueId,'',true]);const old=stockViews.get(key);if(old&&Date.now()-old.at<120000)return;const value=await kitShopRequest({action:'hireView',venueId,stockOnly:true});if(auth.currentUser?.uid===uid)stockViews.set(key,{value,at:Date.now()});}

const money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n/100);
export default function FieldBibHire({venueId='',clubId='',manage=false,isPracticeMode=false,onOrderPlaced,season=null}){
 const [account,setAccount]=useState(auth.currentUser?.uid||'');
 useEffect(()=>onIdTokenChanged(auth,u=>setAccount(u?.uid||'')),[]);
 const [orders,setOrders]=useState(null),[data,setData]=useState(null),[newColor,setNewColor]=useState('Blue'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stock,setStock]=useState([]),[address,setAddress]=useState(''),[day,setDay]=useState(''),[customer,setCustomer]=useState({name:auth.currentUser?.displayName||'',phone:''});
 const generation=useRef(0),request=useRef('');
 const [upcoming,setUpcoming]=useState(null);
 const upcomingDay=fieldOpenMatchDays(season)[0];
 useEffect(()=>{let active=true;setUpcoming(null);if(!manage||!account||!season?.id||!upcomingDay?.id||isPracticeMode)return;getFieldMatchDaySquads({venueId,seasonId:season.id,matchDayId:upcomingDay.id}).then(value=>{if(active)setUpcoming(value);}).catch(()=>{});return()=>{active=false;};},[venueId,season?.id,upcomingDay?.id,manage,account,isPracticeMode]);

 const scope={...(venueId?{venueId}:{}),...(clubId?{clubId}:{})};
 const cacheKey=JSON.stringify([account,venueId,clubId,manage]);
 const load=async()=>{const value=await kitShopRequest({action:'hireView',...scope,stockOnly:manage});return value;};
 const apply=value=>{stockViews.set(cacheKey,{value,at:Date.now()});if(stockViews.size>12)stockViews.delete(stockViews.keys().next().value);setData(value);setStock(value.config.stock||[]);setAddress(value.config.collectionAddress||'');setDay(d=>value.days.some(x=>x.id===d)?d:value.days[0]?.id||'');};
 useEffect(()=>{const id=++generation.current;setData(null);setOrders(null);setBusy(false);setError('');request.current='';if(isPracticeMode||!account)return;const saved=stockViews.get(cacheKey);if(saved&&Date.now()-saved.at<120000)apply(saved.value);load().then(v=>{if(id===generation.current)apply(v);}).catch(e=>{if(id===generation.current)setError(e.message);});return()=>{generation.current++;};},[venueId,clubId,isPracticeMode,account]);
 const run=async task=>{if(busy)return false;const id=generation.current;setBusy(true);setError('');try{await task(id);return true;}catch(e){if(id===generation.current)setError(e.message);return false;}finally{if(id===generation.current)setBusy(false);}};
 if(!account)return <section className="card"><p>Sign in to check Field bib hire.</p></section>;
 if(isPracticeMode)return <section className="card"><h3>Field bib hire</h3><p>Practice does not reserve real stock or take payments.</p></section>;
 return <section className="card field-bib-hire"><div className="hire-stock-toolbar"><h3>{manage?'Bib stock':'Hire your squad’s bibs'}</h3><div className="bib-stock-tools">{manage&&data?.manager&&<button type="button" className="secondary-btn" disabled={busy} onClick={()=>run(async id=>{const next=await kitShopRequest({action:'hireView',...scope});if(id===generation.current)setOrders(next.orders||[]);})}>Returns</button>}<button type="button" className="secondary-btn" disabled={busy} onClick={()=>run(async id=>{const next=await load();if(id===generation.current)apply(next);})}>Refresh</button></div></div>
  {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Checking Field stock…</p>}
  {manage&&data?.manager&&orders!==null&&<div className="bib-returns-overlay" role="dialog" aria-modal="true" aria-label="Bibs to return"><section><header><strong>Bibs to return</strong><button type="button" aria-label="Close returns" onClick={()=>setOrders(null)}>×</button></header>{error&&<p role="alert">{error}</p>}{!orders.length?<p>No bibs are out.</p>:orders.map(order=><article key={order.id}><strong>{upcoming?.clubs?.find(c=>c.clubId===order.clubId)?.name||order.clubId}</strong><p>{[...new Set((order.hirePlayers||[]).map(p=>`${p.color} (${p.number})`))].join(' · ')}</p>{order.paymentStatus==='confirmed'?<button type="button" className="primary-btn" disabled={busy} onClick={()=>run(async id=>{await kitShopRequest({action:'returnHire',...scope,orderId:order.id});const next=await load();if(id===generation.current){apply(next);setOrders(null);}})}>Confirm bibs returned</button>:<small>Awaiting payment</small>}</article>)}</section></div>}
  {data&&manage&&<FieldBibInventory data={data} stock={stock} setStock={setStock} upcoming={upcoming} day={upcomingDay} busy={busy} onSave={()=>run(async id=>{await kitShopRequest({action:'saveHireStock',...scope,stock,collectionAddress:address,inventoryOnly:true,expectedRevision:data.config.revision});const next=await load();if(id===generation.current)apply(next);})}/>}
  {data&&!manage&&<><p>{data.fieldName} · R5 per bib per match. Colours and numbers follow your official squad. Collect before kickoff and return after play.</p>
   {!data.config.stock.some(r=>r.quantity>0)?<p role="status">Your Field has not confirmed hire stock yet. Ask Field management to confirm stock or arrange more through FANM.</p>:!data.captain?<p>Your captain reserves and pays for the squad’s hire.</p>:!data.days.length?<p>No upcoming match day is available for hire.</p>:<form onSubmit={e=>{e.preventDefault();run(async id=>{if(!request.current)request.current=crypto.randomUUID();const result=await kitShopRequest({action:'placeHire',...scope,matchDayId:day,seasonId:data.seasonId,requestId:request.current,customer});if(id===generation.current){request.current='';onOrderPlaced?.(result.order);}});}}><fieldset disabled={busy}><label>Match day<PremiumSelect value={day} onChange={e=>{setDay(e.target.value);request.current='';}}>{data.days.map(d=><option key={d.id} value={d.id}>{d.dateLocal}</option>)}</PremiumSelect></label><details><summary>Captain’s contact details</summary><label>Name<input required value={customer.name} maxLength={100} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label><label>Phone<input required type="tel" value={customer.phone} maxLength={40} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label></details><p>Collection: {data.config.collectionAddress}</p><button className="primary-btn">{busy?'Reserving…':'Reserve bibs & review bill'}</button></fieldset></form>}
  </>}
 </section>;
}
