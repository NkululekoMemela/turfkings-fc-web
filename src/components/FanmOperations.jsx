import React, {useEffect, useRef, useState} from "react";
import OrganizationArchiveControls, {confirmOrganizationArchive} from "./OrganizationArchiveControls.jsx";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";
import {fieldPrompt} from "./FieldDialog.jsx";

const roles = {operations_manager:"Operations manager",referee:"Referee",camera_operator:"Camera operator",support_staff:"Support staff"};

export default function FanmOperations({user,onClose,onChallenge,onOrganizationsChanged}) {
  const [tab,setTab] = useState("Challenges");
  const [data,setData] = useState(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [kind,setKind] = useState("field");
  const dialog = useRef(null);
  useEffect(()=>{dialog.current?.focus();},[]);
  async function run(operation) {
    if (busy) return;
    setBusy(true);setMessage("");
    try {await operation();} catch(error) {setMessage(error.message);} finally {setBusy(false);}
  }
  async function refresh() {setData(await fieldLogoStudioRequest({action:"operationsView"}));}
  function submit(action, transform = value=>value) {
    return event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = transform(Object.fromEntries(new FormData(form)));
      void run(async()=>{
        await fieldLogoStudioRequest({action,...values});
        form.reset();
        await refresh();
        setMessage("Saved.");
      });
    };
  }
  return <div className="hub-challenge-backdrop">
    <section ref={dialog} tabIndex={-1} className="hub-challenge-modal fanm-operations" role="dialog" aria-modal="true" aria-label="FANM Operations">
      <button type="button" className="hub-challenge-modal__close" aria-label="Close Operations" onClick={onClose}>×</button>
      <span className="hub-challenge-modal__kicker">Platform management</span>
      <h2>FANM Operations</h2>
      <nav className="hub-challenge-format-grid" aria-label="Operations sections">
        {["Challenges","Bib stock","Staff","Clubs & Fields","Videos"].map(name=><button key={name} type="button"
          aria-pressed={tab===name} className={tab===name?"is-selected":""} disabled={busy}
          onClick={()=>{setTab(name);setMessage("");if(!data&&["Bib stock","Staff"].includes(name))void run(refresh);}}>{name}</button>)}
      </nav>
      {tab==="Challenges" && <p><button type="button" className="primary-btn" onClick={onChallenge} disabled={!onChallenge}>Create FANM Challenge</button></p>}
      {tab==="Bib stock" && <>
        <h3>Numbered bib stocktake</h3>
        <form className="hub-challenge-form-grid" onSubmit={submit("operationsCountBibs",v=>({...v,number:Number(v.number),quantity:Number(v.quantity)}))}>
          <label>Colour<input name="colour" required maxLength={24}/></label>
          <label>Bib number<input name="number" type="number" min="1" max="99" required/></label>
          <label>Count on hand<input name="quantity" type="number" min="0" max="999" required/></label>
          <button className="primary-btn" disabled={busy}>Record count</button>
        </form>
        {data && <ul>{[...data.stock].sort((a,b)=>a.colour.localeCompare(b.colour)||a.number-b.number).map(row=>
          <li key={`${row.colour}-${row.number}`}>{row.colour} #{row.number}: <strong>{row.quantity}</strong></li>)}</ul>}
      </>}
      {tab==="Staff" && <>
        <p><strong>Director:</strong> {user.displayName || user.email}</p>
        <form className="hub-challenge-form-grid" onSubmit={submit("operationsStaff")}>
          <label>Staff account<input name="email" type="email" required/></label>
          <label>Role<select name="role">{Object.entries(roles).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label>Status<select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <button className="primary-btn" disabled={busy}>Save staff member</button>
        </form>
        {data && <ul>{data.staff.map(person=><li key={person.uid}>{person.name} · {roles[person.role]} · {person.status}</li>)}</ul>}
      </>}
      {tab==="Clubs & Fields" && <>
        <form className="hub-challenge-form-grid" onSubmit={event=>{
          event.preventDefault();const {id}=Object.fromEntries(new FormData(event.currentTarget));
          void run(async()=>{const result=await confirmOrganizationArchive({kind,id:id.trim()});
            if(result?.archived){onOrganizationsChanged();setMessage("Archived.");}});
        }}>
          <label>Organisation<select value={kind} onChange={event=>setKind(event.target.value)}><option value="field">Field</option><option value="club">Club</option></select></label>
          <label>Organisation ID<input name="id" required pattern="[A-Za-z0-9_\\-]+" maxLength={150}/></label>
          <button className="secondary-btn" disabled={busy}>Archive organisation</button>
        </form>
        <OrganizationArchiveControls kind="field" user={user} onRestored={onOrganizationsChanged} onDeleted={onOrganizationsChanged}/>
        <OrganizationArchiveControls kind="club" user={user} onRestored={onOrganizationsChanged}/>
      </>}
      {tab==="Videos" && <form className="hub-challenge-form-grid" onSubmit={event=>{
        event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
        void run(async()=>{
          const confirmation=await fieldPrompt(`Permanently delete this video? Type DELETE ${values.clipId} to confirm.`, "", {title:"Delete video",action:"Delete video"});
          if(confirmation==null)return;
          const result=await fieldLogoStudioRequest({action:"operationsDeleteVideo",...values,confirmation:confirmation.trim()});
          if(result.deleted)setMessage("Video and its library records deleted.");
        });
      }}>
        <label>Library<select name="kind"><option value="field">Field</option><option value="club">Club</option></select></label>
        <label>Field or Club ID<input name="ownerId" required/></label>
        <label>Match ID<input name="matchId" required/></label>
        <label>Clip ID<input name="clipId" required/></label>
        <label className="hub-challenge-form-grid__wide">Audit reason<input name="reason" required minLength={10} maxLength={500}/></label>
        <button className="secondary-btn" disabled={busy}>Confirm permanent deletion</button>
      </form>}
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">Working…</p>}
    </section>
  </div>;
}
