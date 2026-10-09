import React from "react";
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export default function FieldScheduleInputs({draft,onChange}) {
  const hours=draft.operatingHours || {};
  const update=(day,value)=>onChange({...draft,operatingHours:{...hours,[day]:value}});
  return <fieldset style={{border:"1px solid rgba(148,163,184,.25)",borderRadius:16,padding:16,margin:"16px 0"}}>
    <legend>Field operating hours</legend>
    <p className="muted small">Set when the Field is open, rather than a match start time. Closing before opening means the following day.</p>
    {DAYS.map(day=>{const value=hours[day] || {};return <div key={day} style={{padding:"10px 0",borderBottom:"1px solid rgba(148,163,184,.15)"}}>
      <label className="hub-field"><span>{day}</span><select className="hub-select" value={value.status || ""} onChange={e=>update(day,{...value,status:e.target.value})}>
        <option value="">Not set</option><option value="open">Opening–closing hours</option><option value="closed">Closed</option><option value="24h">Open 24 hours</option>
      </select></label>
      {value.status === "open" && <div className="hub-form-grid">
        <label className="hub-field"><span>Opens</span><input type="time" required value={value.opens || ""} onChange={e=>update(day,{...value,opens:e.target.value})}/></label>
        <label className="hub-field"><span>Closes</span><input type="time" required value={value.closes || ""} onChange={e=>update(day,{...value,closes:e.target.value})}/></label>
      </div>}
    </div>;})}
    {hours.Monday?.status && <button type="button" className="hub-secondary-btn" onClick={()=>onChange({...draft,operatingHours:Object.fromEntries(DAYS.map(day=>[day,{...hours.Monday}]))})}>Apply Monday’s hours to every day</button>}
    <label className="hub-field"><span>Timezone</span><input value={draft.timezone || "Africa/Johannesburg"} onChange={e=>onChange({...draft,timezone:e.target.value})}/></label>
  </fieldset>;
}
