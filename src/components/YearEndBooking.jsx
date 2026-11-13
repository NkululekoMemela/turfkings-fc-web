import React,{useState} from "react";
import {auth,getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";
import {BOOKING_TERMS_PATH} from "../legal/bookingTerms.js";

export default function YearEndBooking({event,booking,onClose,onConfirmed}) {
  const [guests,setGuests]=useState(booking?.guests||[]);
  const [coolers,setCoolers]=useState(booking?.coolers||0);
  const [bottles,setBottles]=useState(booking?.bottles||0);
  const [review,setReview]=useState(false),[accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const pending=booking?.status==="pending";
  const confirmed=booking?.status==="paid"||booking?.status==="confirmed";
  const amount=pending||confirmed?booking.amount:event.player+guests.length*event.guest+coolers*event.cooler+bottles*event.bottle;
  async function pay(e) {
    e.preventDefault();
    if(!review){setReview(true);return;}
    if(busy||!accepted)return;
    setBusy(true);setMessage("");
    try{
      const user=auth.currentUser;
      if(!user)throw Error("Sign in with your Club account.");
      const res=await fetch(`${getActiveFirebaseFunctionsBaseUrl().replace(/\/$/,"")}/createYocoCheckout`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`},
        body:JSON.stringify({purpose:"year_end",eventId:event.id,eventVersion:event.updatedAtMs,guests,coolers,bottles,accepted,origin:window.location.origin}),
      });
      const result=await res.json();
      if(!res.ok)throw Error(result.error||"Could not open Yoco.");
      if(result.confirmed){await onConfirmed();return;}
      if(!result.redirectUrl)throw Error("No checkout link was returned.");
      window.location.assign(result.redirectUrl);
    }catch(e){setMessage(e.message);}finally{setBusy(false);}
  }
  return <div className="hub-challenge-backdrop"><section className="hub-challenge-modal" role="dialog" aria-modal="true" aria-label="Year-end RSVP">
    <button type="button" className="hub-challenge-modal__close" onClick={onClose} aria-label="Close RSVP">×</button>
    <h2>{review?"Year-End Function payment":"Year-End Function RSVP"}</h2>
    <p>{event.date} · {event.arrival} SAST · {event.venue}</p>
    {confirmed?<p role="status">Your place is confirmed. {guests.length} guest(s).</p>:<form onSubmit={pay}>
      {!review&&!pending&&<>
        {guests.map((guest,index)=><label key={index}>Guest {index+1}
          <input className="text-input" maxLength={80} required value={guest}
            onChange={e=>setGuests(guests.map((x,i)=>i===index?e.target.value:x))}/>
          <button type="button" className="secondary-btn" onClick={()=>setGuests(guests.filter((_,i)=>i!==index))}>Remove</button>
        </label>)}
        {guests.length<event.maxGuests&&<button type="button" className="secondary-btn" onClick={()=>setGuests([...guests,""])}>＋ Add guest</button>}
        <label>Coolerboxes <input className="text-input" type="number" min="0" max="20" required value={coolers} onChange={e=>setCoolers(Number(e.target.value))}/></label>
        <label>Bottles <input className="text-input" type="number" min="0" max="20" required value={bottles} onChange={e=>setBottles(Number(e.target.value))}/></label>
      </>}
      {(review||pending)&&<p>One player{guests.length?` plus ${guests.join(", ")}`:""} · {coolers} coolerbox(es) · {bottles} bottle(s)</p>}
      <p><strong>Total: R{(amount/100).toFixed(2)}</strong></p>
      {pending&&<p>Payment pending. Resume the same checkout to avoid a duplicate booking.</p>}
      {review&&<label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> I accept the <a href={BOOKING_TERMS_PATH} target="_blank" rel="noreferrer">booking and refund terms</a>.</label>}
      {message&&<p role="alert">{message}</p>}
      <div className="actions-row">
        {review&&!pending&&<button type="button" className="secondary-btn" disabled={busy} onClick={()=>{setReview(false);setAccepted(false);}}>Edit RSVP</button>}
        <button className="primary-btn" disabled={busy||review&&!accepted}>{busy?"Opening…":review?(amount?"Pay with Yoco":"Confirm RSVP"):pending?"Review pending payment":"Continue to payment"}</button>
      </div>
    </form>}
  </section></div>;
}
