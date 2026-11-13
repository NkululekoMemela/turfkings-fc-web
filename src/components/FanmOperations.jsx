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
  const [city,setCity]=useState("");
  const [cityInput,setCityInput]=useState("");
  const [reservationFixture,setReservationFixture]=useState("");
  const [reserveCounts,setReserveCounts]=useState({});
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
  async function refresh(selectedCity=city) {const next=await fieldLogoStudioRequest({action:"operationsView",city:selectedCity});setData(next);setStock(next.stock);}
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
  const owned=data?.stock.reduce((sum,row)=>sum+row.quantity,0)||0;
  const committed=data?.committed.reduce((sum,row)=>sum+row.committed,0)||0;
  return <main ref={dialog} tabIndex={-1} className="fanm-operations" aria-label="FANM Operations">
    <header className="fanm-operations-header">
      <button type="button" className="secondary-btn" onClick={onClose}>‹ Club Hub</button>
      <span className="hub-challenge-modal__kicker">Platform management</span>
      <h1>FANM Operations</h1>
    </header>
      <nav className="fanm-operations-tabs" aria-label="Operations sections">
        {(director?["Challenges","Bib stock","Staff","Clubs & Fields"]:["Clubs & Fields"]).map(name=><button key={name} type="button"
          aria-pressed={tab===name} className={tab===name?"is-selected":""} disabled={busy}
          onClick={()=>{setTab(name);setMessage("");if(!data&&["Bib stock","Staff"].includes(name))void run(refresh);}}>{name}</button>)}
      </nav>
      {tab==="Challenges" && <p><button type="button" className="primary-btn" onClick={onChallenge} disabled={!onChallenge}>Create FANM Challenge</button></p>}
      {tab==="Bib stock" && data && <section className="fanm-operations-panel">
        <form className="fanm-stock-city" onSubmit={event=>{
          event.preventDefault();
          const next=cityInput.trim();if(!next)return;
          void run(async()=>{await refresh(next);setCity(next);setReservationFixture("");setReserveCounts({});});
        }}>
          <label>Stock city<input className="text-input" required list="fanm-stock-cities" value={cityInput}
            onChange={event=>setCityInput(event.target.value)} placeholder="e.g. Cape Town" maxLength={60}/></label>
          <datalist id="fanm-stock-cities">{data.cities.map(name=><option key={name} value={name}/>)}</datalist>
          <button className="primary-btn" disabled={busy}>Open city stock</button>
        </form>
        {city&&<>
          <h2>{city}</h2>
          <div className="fanm-stock-summary">
            <div><span>Owned</span><strong>{owned}</strong></div>
            <div><span>Committed</span><strong>{committed}</strong></div>
            <div><span>Available</span><strong>{owned-committed}</strong></div>
          </div>
          {!data.unassignedMoved&&!data.stock.length&&data.unassignedStock.length>0&&
            <button className="secondary-btn" disabled={busy} onClick={()=>void run(async()=>{
              await fieldLogoStudioRequest({action:"operationsCountBibs",city,stock:data.unassignedStock,revision:data.revision,moveUnassigned:true});
              await refresh();setMessage("Unassigned stock moved to "+city+".");
            })}>Move unassigned stock to {city}</button>}
          <FieldBibInventory key={city} inventoryOnly
            data={{manager:true,config:{stock:data.stock,confirmedAtMs:data.confirmedAtMs}}}
            stock={stock} setStock={setStock} busy={busy} onSave={async()=>{
              let saved=false;
              await run(async()=>{
                await fieldLogoStudioRequest({action:"operationsCountBibs",city,stock,revision:data.revision});
                await refresh();saved=true;setMessage("Stocktake saved.");
              });
              return saved;
            }}/>
          <h3>Fixture commitments</h3>
          {data.reservations.length===0&&<p>No bibs committed in this city.</p>}
          {data.reservations.map(item=><div className="fanm-commitment" key={item.fixtureId}>
            <strong>{item.label}</strong><span>{item.rows.map(row=>`${row.color} #${row.number} × ${row.quantity}`).join(" · ")}</span>
            <button className="secondary-btn" disabled={busy} onClick={()=>void run(async()=>{
              await fieldLogoStudioRequest({action:"operationsReleaseBibs",city,fixtureId:item.fixtureId,revision:data.revision});
              await refresh();setMessage("Bibs released.");
            })}>Release bibs</button>
          </div>)}
          {data.stock.length>0&&<form onSubmit={event=>{
            event.preventDefault();
            void run(async()=>{
              const rows=data.stock.map(row=>({...row,quantity:Number(reserveCounts[`${row.color}:${row.number}`]||0)})).filter(row=>row.quantity>0);
              await fieldLogoStudioRequest({action:"operationsReserveBibs",city,fixtureId:reservationFixture,revision:data.revision,rows});
              await refresh();setReserveCounts({});setReservationFixture("");setMessage("Bibs committed.");
            });
          }}>
            <label>Commit bibs to a FANM fixture<select className="text-input" required value={reservationFixture} onChange={event=>{
              const id=event.target.value;setReservationFixture(id);
              setReserveCounts(Object.fromEntries((data.reservations.find(item=>item.fixtureId===id)?.rows||[]).map(row=>[`${row.color}:${row.number}`,row.quantity])));
            }}>
              <option value="">Choose fixture</option>{data.fixtures.filter(item=>!item.city||item.city===city.toLowerCase()).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <div className="bib-inventory-scroll"><table className="bib-inventory-table"><thead><tr>
              <th>Bib</th><th>Owned</th><th>Committed</th><th>Available</th>{reservationFixture&&<th>For this fixture</th>}
            </tr></thead><tbody>{data.committed.map(row=>{
              const key=`${row.color}:${row.number}`;
              const held=data.reservations.find(item=>item.fixtureId===reservationFixture)?.rows.find(item=>item.color===row.color&&item.number===row.number)?.quantity||0;
              return <tr key={key}><th>{row.color} #{row.number}</th><td>{row.quantity}</td><td>{row.committed}</td>
                <td>{row.quantity-row.committed}</td>{reservationFixture&&<td><input type="number" min="0" max={row.quantity-row.committed+held}
                  aria-label={key} value={reserveCounts[key]||""} onChange={event=>setReserveCounts({...reserveCounts,[key]:event.target.value})}/></td>}</tr>;
            })}</tbody></table></div>
            {reservationFixture&&<button className="primary-btn" disabled={busy}>Save fixture commitment</button>}
          </form>}
        </>}
      </section>}
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
  </main>;
}
