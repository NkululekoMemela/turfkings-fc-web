import CompanyWeeklyInvoices from "./CompanyWeeklyInvoices.jsx";
import CompanyClubSetupForm from "./CompanyClubSetupForm.jsx";
import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,signInWithGoogle} from '../firebaseConfig.js';
import {companyClubsRequest} from '../storage/companyClubsGateway.js';
const money=value=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value/100);
export default function CompanyClubWorkspace({onClose,onClubCreated}){
 const [user,setUser]=useState(auth.currentUser),[view,setView]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),request=useRef(crypto.randomUUID());
 useEffect(()=>onAuthStateChanged(auth,setUser),[]);
 useEffect(()=>{const id=++generation.current;setView(null);setError('');setBusy(false);request.current=crypto.randomUUID();if(user?.emailVerified)companyClubsRequest({action:'view'}).then(v=>{if(id===generation.current)setView(v);}).catch(e=>{if(id===generation.current)setError(e.message);});return()=>{generation.current++;};},[user?.uid]);
 const run=async task=>{if(busy)return;const id=generation.current;setBusy(true);setError('');setMessage('');try{await task();const next=await companyClubsRequest({action:'view'});if(id===generation.current)setView(next);}catch(e){if(id===generation.current)setError(e.message);}finally{if(id===generation.current)setBusy(false);}};
 return <div className="company-workspace-backdrop"><section className="company-workspace card" role="dialog" aria-modal="true" aria-labelledby="company-workspace-title"><header><div><small>COMPANY CLUBS</small><h2 id="company-workspace-title">Football, funded by your company.</h2></div><button className="secondary-btn" aria-label="Close Company Clubs" disabled={busy} onClick={onClose}>×</button></header>
 <p>Create your Company Club with full venue and playing details. Funding is agreed separately with your company contact.</p>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {!user?.emailVerified?<button className="primary-btn" onClick={()=>signInWithGoogle().catch(e=>setError(e.message))}>Sign in with Google</button>:!view?<p role="status">Loading your company account…</p>:<>
 {view.companies.map(company=><CompanyAccount key={company.id} company={company} operator={view.isOperator} busy={busy} run={run}/>)}
 {view.isOperator&&view.applications.length>0&&<details open><summary>Requests awaiting FANM approval ({view.applications.length})</summary>{view.applications.map(app=><CompanyApplication key={app.id} app={app} busy={busy} run={run} onApproved={onClubCreated}/>)}</details>}
 {!view.isOperator&&view.applications.map(app=><p key={app.id}><strong>{app.companyName}</strong> · {app.status==='active'?'Company setup approved':app.status==='rejected'?`FANM review: ${app.reason}`:'Awaiting FANM review'}</p>)}
 <details open={!view.companies.length&&!view.applications.length}><summary>Create a Company Club</summary><CompanyClubSetupForm key={user.uid} user={user} busy={busy} onSubmit={payload=>run(async()=>{const response=await companyClubsRequest({action:'apply',requestId:request.current,...payload});request.current=crypto.randomUUID();if(view.isOperator){const result=await companyClubsRequest({action:'activate',applicationId:response.application.id});await onClubCreated?.(result.clubId);setMessage('Company Club created with its own empty football workspace.');}else setMessage('Club setup received. FANM will verify the company; funding is agreed separately.');})}/></details>
 </>}
 </section></div>;
}
function CompanyAccount({company,operator,busy,run}){
 const [limit,setLimit]=useState(String(company.funding.limitMinor/100)),[terms,setTerms]=useState(company.funding.termsReference||''),[season,setSeason]=useState(null),[notice,setNotice]=useState(''),[withdrawReason,setWithdrawReason]=useState('');
 useEffect(()=>{setLimit(String(company.funding.limitMinor/100));setTerms(company.funding.termsReference||'');},[company.funding.revision]);
 const clubId=company.clubIds[0];
 return <article><h3>{company.name}</h3><p>{company.funding.status==='active'?'Funding terms agreed':'Funding terms awaiting agreement'} · Committed {money(company.funding.reservedMinor)} of {money(company.funding.limitMinor)}</p>
 {operator&&<details><summary>FANM funding authorisation</summary><form onSubmit={e=>{e.preventDefault();run(async()=>{if(!/^\d+(\.\d{1,2})?$/.test(limit))throw Error('Use a rand amount with at most two decimal places.');await companyClubsRequest({action:'setFunding',companyId:company.id,expectedRevision:company.funding.revision,limitMinor:Math.round(Number(limit)*100),termsReference:terms});});}}><fieldset disabled={busy}><label>Agreed season funding allowance · Rand<input required inputMode="decimal" value={limit} onChange={e=>setLimit(e.target.value)}/></label><label>Agreement reference<input required value={terms} maxLength={160} onChange={e=>setTerms(e.target.value)}/></label><button className="primary-btn">Save agreed funding</button></fieldset></form></details>}
 <button className="secondary-btn" disabled={busy} onClick={()=>run(async()=>{setNotice('');try{setSeason(await companyClubsRequest({action:'seasonView',clubId}));}catch(e){setNotice(e.message);}})}>Check Field season funding</button>{notice&&<p role="status">{notice}</p>}
 {season&&<p>{season.fieldName} · {season.seasonName} · {season.accepted} accepted · {season.authorised} funding authorised</p>}
 {operator&&season&&<button className="primary-btn" disabled={busy||!season.invited} onClick={()=>run(async()=>{await companyClubsRequest({action:'authoriseSeason',clubId});setSeason(await companyClubsRequest({action:'seasonView',clubId}));})}>Authorise season squad</button>}
 {operator&&company.funding.commitments?.length>0&&<details><summary>Review committed funding</summary><p>Withdrawing funding removes sponsored eligibility and releases the allowance. A live match must finish first.</p><label>Reason<input maxLength={400} value={withdrawReason} onChange={e=>setWithdrawReason(e.target.value)}/></label>{company.funding.commitments.map(grant=><p key={grant.id}>{grant.label} · {money(grant.amountMinor)} <button className="secondary-btn" disabled={busy||!withdrawReason.trim()} onClick={()=>run(()=>companyClubsRequest({action:'revokeSeason',companyId:company.id,grantId:grant.id,reason:withdrawReason}))}>Withdraw authorisation</button></p>)}</details>}
 <small style={{display:'block'}}>Funding authorisation reserves the agreed company allowance. It is not an invoice or payment receipt.</small>
 {clubId&&<CompanyWeeklyInvoices clubId={clubId} operator={operator}/>}
 </article>;
}

function CompanyApplication({app,busy,run,onApproved}){
 const [reason,setReason]=useState('');
 return <article><h3>{app.companyName}</h3><p>{app.contactName} · {app.contactEmail} · {app.phone} · {app.city}</p>{app.setup&&<p>{app.setup.venueName} · {app.setup.address}<br/>{app.setup.playDay} · {app.setup.playTime}–{app.setup.playEndTime} ({app.setup.timezone})</p>}<img src={app.logoUrl} alt="Company logo" width="72" height="72" style={{objectFit:'contain'}}/><button className="primary-btn" disabled={busy} onClick={()=>run(async()=>{const result=await companyClubsRequest({action:'activate',applicationId:app.id});await onApproved?.(result.clubId);})}>Approve company setup</button><details><summary>Decline request</summary><label>Reason<input maxLength={400} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="secondary-btn" disabled={busy||!reason.trim()} onClick={()=>run(()=>companyClubsRequest({action:'reject',applicationId:app.id,reason}))}>Confirm decision</button></details></article>;
}
