import React,{useEffect,useState} from "react";
import ClubPageRibbon from "./ClubPageRibbon.jsx";
import {companyClubsRequest} from "../storage/companyClubsGateway.js";

export default function CompanyWeeklySignup({clubId,onBack,leagueSeasonEntry,isPracticeMode=false}){
 const [view,setView]=useState(null),[staffNumber,setStaffNumber]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(isPracticeMode)return;let active=true;companyClubsRequest({action:"weeklyView",clubId}).then(result=>{if(active){setView(result);setStaffNumber(result.staffNumber);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[clubId,isPracticeMode]);
 async function toggle(week,booked){
  if(busy)return;
  if(!staffNumber.trim()){setError("Enter your staff number before choosing a week.");return;}
  setBusy(true);setError("");
  try{const result=await companyClubsRequest({action:"weeklyBooking",clubId,week,booked,staffNumber});setView(v=>({...v,...result}));setStaffNumber(result.staffNumber);}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <main className="page">
  <ClubPageRibbon title="Company football bookings" onHome={onBack}/>
  {leagueSeasonEntry}
  <section className="card"><h2>Choose the weeks you’ll play</h2>
   <p>Your company covers the cost. Select a week to book it immediately.</p>
   {error&&<p role="alert">{error}</p>}
   {isPracticeMode&&<p>Switch to Official to book your company sessions.</p>}
   {!isPracticeMode&&!view&&!error&&<p role="status">Loading scheduled weeks…</p>}
   {view&&<>
    <label>Company staff number <input className="text-input" value={staffNumber} maxLength={40} readOnly={Boolean(view.staffNumber)} onChange={e=>setStaffNumber(e.target.value)} placeholder="As shown on your staff record"/></label>
    <p className="muted">FANM uses this number to reconcile your attendance with your company.</p>
    <p>{[view.playTime,view.venue].filter(Boolean).join(" · ")}</p>
    {!view.weeks.length&&<p>No weekly playing day is configured yet.</p>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,145px),1fr))",gap:".6rem"}}>
    {view.weeks.map(week=>{const booked=view.selectedWeeks.includes(week);return <button key={week} type="button" className={booked?"primary-btn":"secondary-btn"} aria-pressed={booked} disabled={busy} onClick={()=>toggle(week,!booked)}>
     {new Intl.DateTimeFormat("en-ZA",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(week+"T12:00:00Z"))}<br/><small>{booked?"Booked · Company covered":"Book this week"}</small>
    </button>;})}
    </div>
   </>}
  </section>
 </main>;
}
