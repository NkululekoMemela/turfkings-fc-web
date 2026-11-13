import React, {useEffect, useRef, useState} from "react";
import OrganizationArchiveControls, {confirmOrganizationArchive} from "./OrganizationArchiveControls.jsx";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";
import FieldBibInventory from "./FieldBibInventory.jsx";
import "./FieldBibHire.css";
import "./FanmOperations.css";

const roles = {operations_manager:"Operations manager",referee:"Referee",camera_operator:"Camera operator",support_staff:"Support staff"};

export default function FanmOperations({user,director,onClose,onChallenge,onOrganizationsChanged}) {
  const [tab,setTab] = useState(director?"Challenges":"Clubs & Fields");
  const [data,setData] = useState(null);
  const [stock,setStock] = useState([]);
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
  async function refresh() {const next=await fieldLogoStudioRequest({action:"operationsView"});setData(next);setStock(next.stock);}
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
      <nav className="fanm-operations-tabs" aria-label="Operations sections">
        {(director?["Challenges","Bib stock","Staff","Clubs & Fields"]:["Clubs & Fields"]).map(name=><button key={name} type="button"
          aria-pressed={tab===name} className={tab===name?"is-selected":""} disabled={busy}
          onClick={()=>{setTab(name);setMessage("");if(!data&&["Bib stock","Staff"].includes(name))void run(refresh);}}>{name}</button>)}
      </nav>
      {tab==="Challenges" && <p><button type="button" className="primary-btn" onClick={onChallenge} disabled={!onChallenge}>Create FANM Challenge</button></p>}
      {tab==="Bib stock" && data && <FieldBibInventory inventoryOnly
        data={{manager:true,config:{stock:data.stock,confirmedAtMs:data.confirmedAtMs}}}
        stock={stock} setStock={setStock} busy={busy} onSave={async()=>{
          let saved=false;
          await run(async()=>{
            await fieldLogoStudioRequest({action:"operationsCountBibs",stock,revision:data.revision});
            await refresh();saved=true;setMessage("Stocktake saved.");
          });
          return saved;
        }}/>}
      {tab==="Staff" && <>
        <p><strong>Director:</strong> {user.displayName || user.email}</p>
        <form className="hub-challenge-form-grid" onSubmit={submit("operationsStaff")}>
          <label>Staff account<input name="email" type="email" required/></label>
          <label>Role<select name="role">{Object.entries(roles).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label>Status<select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <button className="primary-btn" disabled={busy}>Save staff member</button>
        </form>
        {data && <ul>{data.staff.map(person=><li key={person.uid}>{person.name} · {roles[person.role]} · {person.status}</li>)}</ul>}
        {data?.staff.some(person=>person.status==="active"&&["referee","camera_operator"].includes(person.role)) &&
          <form className="hub-challenge-form-grid" onSubmit={submit("operationsAssignOfficial",v=>{
            const [role,uid]=v.official.split(":");return {role,uid,fixtureId:v.fixtureId.trim()};
          })}>
            <label>FANM fixture ID<input name="fixtureId" required pattern="[a-f0-9]{64}"/></label>
            <label>Assign official<select name="official" required>{data.staff.filter(person=>person.status==="active"&&["referee","camera_operator"].includes(person.role)).map(person=>
              <option key={person.uid} value={`${person.role}:${person.uid}`}>{person.name} · {roles[person.role]}</option>)}</select></label>
            <button className="primary-btn" disabled={busy}>Assign to fixture</button>
          </form>}

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
        <OrganizationArchiveControls kind="field" user={user} operationsManager={!director} onRestored={onOrganizationsChanged} onDeleted={onOrganizationsChanged}/>
        <OrganizationArchiveControls kind="club" user={user} operationsManager={!director} onRestored={onOrganizationsChanged}/>
      </>}
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">Working…</p>}
    </section>
  </div>;
}
