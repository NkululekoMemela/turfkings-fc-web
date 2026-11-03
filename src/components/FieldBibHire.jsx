import HireStockEditor from "./HireStockEditor.jsx";
import "./FieldBibHire.css";
import React,{useEffect,useRef,useState} from 'react';
import {onIdTokenChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {kitShopRequest} from '../storage/kitShopGateway.js';
const money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n/100);
export default function FieldBibHire({venueId='',clubId='',manage=false,isPracticeMode=false,onOrderPlaced}){
 const [account,setAccount]=useState(auth.currentUser?.uid||'');
 useEffect(()=>onIdTokenChanged(auth,u=>setAccount(u?.uid||'')),[]);
 const [orders,setOrders]=useState(null),[data,setData]=useState(null),[newColor,setNewColor]=useState('Blue'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stock,setStock]=useState([]),[address,setAddress]=useState(''),[day,setDay]=useState(''),[customer,setCustomer]=useState({name:auth.currentUser?.displayName||'',phone:''});
 const generation=useRef(0),request=useRef('');
 const scope={...(venueId?{venueId}:{}),...(clubId?{clubId}:{})};
 const load=async()=>{const value=await kitShopRequest({action:'hireView',...scope,stockOnly:manage});return value;};
 const apply=value=>{setData(value);setStock(value.config.stock||[]);setAddress(value.config.collectionAddress||'');setDay(d=>value.days.some(x=>x.id===d)?d:value.days[0]?.id||'');};
 useEffect(()=>{const id=++generation.current;setData(null);setOrders(null);setBusy(false);setError('');request.current='';if(isPracticeMode||!account)return;load().then(v=>{if(id===generation.current)apply(v);}).catch(e=>{if(id===generation.current)setError(e.message);});return()=>{generation.current++;};},[venueId,clubId,isPracticeMode,account]);
 const run=async task=>{if(busy)return;const id=generation.current;setBusy(true);setError('');try{await task(id);}catch(e){if(id===generation.current)setError(e.message);}finally{if(id===generation.current)setBusy(false);}};
 if(!account)return <section className="card"><p>Sign in to check Field bib hire.</p></section>;
 if(isPracticeMode)return <section className="card"><h3>Field bib hire</h3><p>Practice does not reserve real stock or take payments.</p></section>;
 return <section className="card field-bib-hire"><div className="hire-stock-toolbar"><h3>{manage?'Field hire stock':'Hire your squad’s bibs'}</h3><button type="button" className="secondary-btn" disabled={busy} onClick={()=>run(async id=>{const next=await load();if(id===generation.current)apply(next);})}>Refresh</button></div>
  {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Checking Field stock…</p>}
  {data&&manage&&!data.manager&&<p>Field management confirms hire inventory.</p>}
  {data&&manage&&data.manager&&<><p>Confirm only bibs physically held at your Field. Need more? Contact FANM for stock.</p><HireStockEditor stock={stock} setStock={setStock} newColor={newColor} setNewColor={setNewColor} address={address} setAddress={setAddress} busy={busy} onSave={()=>run(async id=>{await kitShopRequest({action:'saveHireStock',...scope,stock,collectionAddress:address,expectedRevision:data.config.revision});const next=await load();if(id===generation.current)apply(next);})}/>

   {<section className="field-hire-reservations"><button type="button" className="secondary-btn" disabled={busy} onClick={()=>run(async id=>{const next=await kitShopRequest({action:'hireView',...scope});if(id===generation.current)setOrders(next.orders);})}>Check reserved hires</button>{orders&&<><h4>Reserved hires ({orders.length})</h4>{orders.map(order=><article key={order.id}><p>{order.customer.name} · {order.clubId} · {money(order.totalMinor)} · {order.paymentStatus==='confirmed'?'Paid':'Awaiting payment'}</p>{order.hirePlayers.map((p,i)=><small key={i} style={{display:'block'}}>({p.number}) {p.name} · {p.color}</small>)}{order.paymentStatus==='confirmed'&&<button className="secondary-btn" disabled={busy} onClick={()=>run(async id=>{await kitShopRequest({action:'returnHire',...scope,orderId:order.id});const next=await load();if(id===generation.current){apply(next);setOrders(null);}})}>Confirm all bibs returned</button>}</article>)}</>}</section>}
  </>}
  {data&&!manage&&<><p>{data.fieldName} · R5 per bib per match. Colours and numbers follow your official squad. Collect before kickoff and return after play.</p>
   {!data.config.stock.some(r=>r.quantity>0)?<p role="status">Your Field has not confirmed hire stock yet. Ask Field management to confirm stock or arrange more through FANM.</p>:!data.captain?<p>Your captain reserves and pays for the squad’s hire.</p>:!data.days.length?<p>No upcoming match day is available for hire.</p>:<form onSubmit={e=>{e.preventDefault();run(async id=>{if(!request.current)request.current=crypto.randomUUID();const result=await kitShopRequest({action:'placeHire',...scope,matchDayId:day,seasonId:data.seasonId,requestId:request.current,customer});if(id===generation.current){request.current='';onOrderPlaced?.(result.order);}});}}><fieldset disabled={busy}><label>Match day<select value={day} onChange={e=>{setDay(e.target.value);request.current='';}}>{data.days.map(d=><option key={d.id} value={d.id}>{d.dateLocal}</option>)}</select></label><details><summary>Captain’s contact details</summary><label>Name<input required value={customer.name} maxLength={100} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label><label>Phone<input required type="tel" value={customer.phone} maxLength={40} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label></details><p>Collection: {data.config.collectionAddress}</p><button className="primary-btn">{busy?'Reserving…':'Reserve bibs & review bill'}</button></fieldset></form>}
  </>}
 </section>;
}
