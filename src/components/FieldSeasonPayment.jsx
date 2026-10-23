import React,{useRef,useState} from "react";
import {auth} from "../firebaseConfig.js";
import {createSeasonCheckout,getSeasonSquadView,respondSeasonInvitation,setSeasonAvailability} from "../storage/fieldSeasonSquadRepository.js";
import {seasonBalance,joinSeason} from "../core/seasonJoining.mjs";
const money=cents=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(cents/100);
export default function FieldSeasonPayment({scope,invitation,paymentPage=false,onOpenPayment,onBack,games=[],onCommitted}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[paid,setPaid]=useState(false),[committed,setCommitted]=useState(false),[consent,setConsent]=useState(false),[absences,setAbsences]=useState([]);
 const working=useRef(false);
 if(!invitation)return null;
 const booked=paid||invitation.paymentStatus==="paid",online=scope.clubId==="turf-kings";
 const balance=seasonBalance(invitation),eligible=["pending","accepted"].includes(invitation.invitationStatus);
 async function proceed(){
  if(working.current||!consent||!eligible||booked)return;
  const uid=auth.currentUser?.uid;if(!uid){setError("Sign in to join your season.");return;}
  working.current=true;setBusy(true);setError("");
  try{
   const result=await joinSeason({scope,invitation,expectedTotal:balance.total,absences,online,getView:getSeasonSquadView,respond:respondSeasonInvitation,saveAvailability:setSeasonAvailability,checkout:createSeasonCheckout,assertSession:()=>{if(auth.currentUser?.uid!==uid)throw new Error("Your account changed. Reopen your league.");}});
   if(result.paid){setPaid(true);return;}
   if(result.committed){setCommitted(true);onCommitted?.();return;}
   window.location.assign(result.redirectUrl);
  }catch(e){setError(e.message||"Could not continue. Your place is not booked until payment is confirmed.");}
  finally{working.current=false;setBusy(false);}
 }
 if(!paymentPage){
  if(booked)return <p role="status">✓ Season booked</p>;
  if(!eligible)return null;
  return <button type="button" className="primary-btn" onClick={onOpenPayment}>{invitation.invitationStatus==="accepted"?"Continue season booking":"Join season"} · {money(online?balance.total:balance.contribution)}</button>;
 }
 return <main className="page club-league-season-page league-join-review">
  <div className="landing-header-sticky"><header className="header"><div className="league-studio-header"><div className="header-title"><h1>Your season place</h1><div className="league-studio-context">Review &amp; confirm</div></div><button type="button" className="secondary-btn" disabled={busy} onClick={onBack}>← Back</button></div></header></div>
  <section className="card league-commit-card"><h2>{invitation.fullName}</h2>{booked?<p role="status">✓ Season booked · Your club contribution is confirmed.</p>:committed?<p role="status">Commitment saved. Arrange payment with your captain; your place awaits payment confirmation.</p>:<>
   <dl className="league-join-price"><dt>Club season contribution</dt><dd>{money(balance.contribution)}</dd><dt>Platform fee · whole season</dt><dd>{money(balance.fee)}</dd><dt><strong>{online?"Total payable":"Season total"}</strong></dt><dd><strong>{money(balance.total)}</strong></dd></dl>
   {!online&&<p className="muted small">Online payment is not enabled for this club. Pay your captain as instructed; the platform fee is handled separately.</p>}
   <details className="league-review-dates"><summary>Season dates &amp; known absences{games.length?` (${games.length} match day${games.length===1?"":"s"})`:""}</summary><p className="muted small">You are available by default. Tick only games you already know you will miss. Existing absences remain saved.</p>{!games.length&&<p>Fixtures have not been published yet.</p>}{games.map(({day,fixture,editable})=><label key={day.id}><input type="checkbox" disabled={busy||!editable} checked={absences.includes(day.id)} onChange={e=>setAbsences(old=>e.target.checked?[...old,day.id]:old.filter(id=>id!==day.id))}/><span>Unavailable · {(fixture.scheduledLocal||day.dateLocal||day.label||day.id).replace("T"," · ")}</span></label>)}</details>
   <label className="league-join-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>I commit to this season and its published dates, except my recorded absences. Match selection is decided by the captain.</span></label>
   <button type="button" className="primary-btn league-join-submit" disabled={busy||!consent||!eligible} onClick={proceed}>{busy?"Saving & preparing…":online?`Confirm & pay ${money(balance.total)}`:"Confirm season commitment"}</button><p className="muted small">{online?"Your season place is booked after payment confirmation. You can resume if checkout is interrupted.":"Your season place is booked after the captain confirms payment."}</p>
  </>}{error&&<p className="error-text" role="alert">{error}</p>}</section>
 </main>;
}
