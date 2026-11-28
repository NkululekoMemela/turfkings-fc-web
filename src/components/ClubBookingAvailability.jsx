import React,{useEffect,useState} from "react";
import {doc,runTransaction,serverTimestamp} from "firebase/firestore";
import {db} from "../firebaseConfig.js";

function monthOf(date){
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");
}
export default function ClubBookingAvailability({clubId,settings,weeklyDay=3}){
  const [override,setOverride]=useState("");
  const [month,setMonth]=useState(()=>monthOf(new Date()));
  const [blocked,setBlocked]=useState([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{
    const value=settings?.signupMonthOverride || "";
    setOverride(value);
    setMonth(value || monthOf(new Date()));
    setBlocked(Array.isArray(settings?.blockedSignupDates)?settings.blockedSignupDates:[]);
  },[clubId,settings]);
  const validMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const dates=[];
  if(validMonth){
    const [year,number]=month.split("-").map(Number);
    for(let day=1;day<=31;day++){
      const date=new Date(year,number-1,day,12);
      if(date.getMonth()!==number-1)break;
      if(date.getDay()===Number(weeklyDay)){
        dates.push({id:month+"-"+String(day).padStart(2,"0"),
          label:date.toLocaleDateString("en-ZA",{weekday:"long",day:"numeric",month:"long"})});
      }
    }
  }
  async function save(event){
    event.preventDefault();setBusy(true);setMessage("");
    try{
      if(override && !/^\d{4}-(0[1-9]|1[0-2])$/.test(override))
        throw Error("Choose a valid booking month.");
      const ref=doc(db,"clubs",clubId);
      await runTransaction(db,async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists())throw Error("Club could not be found.");
        tx.update(ref,{bookingSettings:{
          ...(snap.data().bookingSettings || {}),
          signupMonthOverride:override,
          blockedSignupDates:[...new Set(blocked)].sort()
        },updatedAt:serverTimestamp()});
      });
      setMessage("Booking month and available weeks saved.");
    }catch(error){setMessage(error.message);}
    finally{setBusy(false);}
  }
  return <form onSubmit={save} className="club-booking-settings__form">
    <div className="club-booking-settings__tile">
      <h3>Booking month and available weeks</h3>
      <p>Open January early, or choose another month. Untick dates when the Club is not playing.</p>
      <label style={{display:"grid",gap:8}}>
        Open bookings for
        <input type="month" value={override} disabled={busy}
          style={{width:"100%",minWidth:0,boxSizing:"border-box"}}
          onChange={event=>{
            setOverride(event.target.value);
            if(event.target.value)setMonth(event.target.value);
          }}/>
      </label>
      <button type="button" className="secondary-btn" disabled={busy}
        onClick={()=>setOverride("")}>Use normal calendar</button>
      <p>{override?"Players will see this month's regular games.":"Normal calendar: next month opens from the 24th."}</p>
      <label style={{display:"grid",gap:8}}>
        Manage available weeks in
        <input type="month" required value={month} disabled={busy}
          style={{width:"100%",minWidth:0,boxSizing:"border-box"}}
          onChange={event=>setMonth(event.target.value)}/>
      </label>
      <div style={{display:"grid",gap:12,marginTop:16}}>
        {dates.map(date=><label key={date.id}
          style={{display:"flex",alignItems:"center",gap:12}}>
          <input type="checkbox" disabled={busy}
            checked={!blocked.includes(date.id)}
            onChange={event=>setBlocked(previous=>event.target.checked
              ?previous.filter(id=>id!==date.id):[...previous,date.id])}/>
          <span>{date.label}</span>
        </label>)}
      </div>
      <p>Ticked dates accept bookings. Existing bookings are retained when a date is closed.
        Special challenge fixtures keep their own schedule.</p>
      <button className="primary-btn" type="submit" disabled={busy}>
        {busy?"Saving…":"Save available weeks"}
      </button>
      {message&&<p role="status">{message}</p>}
    </div>
  </form>;
}
