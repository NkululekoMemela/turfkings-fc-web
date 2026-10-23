import React,{useState} from "react";
import {NO_NUMBER_REASONS,validateKitTeams,jerseyNumber} from "../core/playerKit.js";
import "./PlayerKitEditor.css";
export function KitRows({teams,onChange,disabled=false,referee=false,checked={},onChecked,requireNumbered=false}) {
  const update=(teamId,key,patch)=>onChange(teams.map(team=>team.id!==teamId?team:{...team,players:team.players.map(row=>row.key!==key?row:{...row,...patch})}));
  return <div className="kit-teams">{teams.map(team=><section className="kit-team" key={team.id}>
    <h3>{team.label}</h3><label className="field-row"><span>Match kit assigned / agreed</span><select className="text-input" disabled={disabled} value={team.kitChoice||""} onChange={event=>onChange(teams.map(item=>item.id!==team.id?item:{...item,kitChoice:event.target.value,kitColor:event.target.value==="home"?item.homeColor||"":event.target.value==="away"?item.awayColor||"":item.kitColor||"#64748b"}))}><option value="">Select match kit</option><option value="home">Home colours</option><option value="away">Away colours</option><option value="other">Other / bibs</option></select></label>{team.kitChoice&&<label className="field-row"><span>Actual match colour {team.kitChoice!=="other"&&!team.kitColor?"(club colour not set)":""}</span><input type="color" value={team.kitColor||"#64748b"} disabled={disabled} onChange={event=>onChange(teams.map(item=>item.id!==team.id?item:{...item,kitColor:event.target.value}))}/></label>}{team.players.map(row=><div className="kit-player" key={row.key}>
      <div className="kit-player-name"><strong>{row.name}</strong>{!referee&&<small className="muted">{row.source==="profile"?"From player profile":row.source==="captain"?"Captain's match number":"Number needed"}</small>}</div>
      <label className="kit-number-input"><span className="muted">Number</span><input className="text-input" aria-label={`${team.label}: ${row.name} number`} inputMode="numeric" maxLength={3} value={row.number ?? ""} placeholder="—" disabled={disabled} onChange={event=>update(team.id,row.key,{number:event.target.value,source:referee?"referee":"captain",noNumberReason:""})}/></label>
      {referee&&!requireNumbered&&(row.number===null || row.number==="")&&<label className="kit-exception"><span className="muted">Unnumbered kit</span><select className="text-input" aria-label={`${team.label}: ${row.name} unnumbered reason`} value={row.noNumberReason || ""} disabled={disabled} onChange={event=>update(team.id,row.key,{noNumberReason:event.target.value})}><option value="">Choose kit exception</option>{Object.entries(NO_NUMBER_REASONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
      {referee&&<label className="kit-checked"><input type="checkbox" checked={Boolean(checked[`${team.id}:${row.key}`])} disabled={disabled} onChange={event=>onChecked(`${team.id}:${row.key}`,event.target.checked)}/>Kit checked</label>}
    </div>)}
  </section>)}</div>;
}
export function CaptainKitEditor({teams,profiles,canEdit,onChange}) {
  let error="";
  try{if(teams.length)validateKitTeams(teams);}catch(reason){error=reason.message;}
  if(!teams.length)return null;
  return <section className="card captain-kit-editor"><h2>Match shirt numbers</h2><p className="muted">Profile numbers are the starting point. Adjust them for this game, then save your squads. Each visible number must be unique within its team.</p>
    {canEdit?<KitRows teams={teams} onChange={onChange}/>:teams.map(team=><p key={team.id}><strong>{team.label}: </strong>{team.players.map(row=>`${row.number===null?"—":`#${row.number}`} ${row.name}`).join(" · ")}</p>)}
    {error&&<p className="error-text" role="alert">{error}</p>}
  </section>;
}
export function RefereeKitDialog({initialTeams,scope,onCancel,onSave,error:externalError=""}) {
  const [teams,setTeams]=useState(initialTeams),[checked,setChecked]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const requireNumbered=scope.environment!=="practice"&&Boolean(scope.venueId);
  const change=next=>{
    // A changed number or exception must be checked again.
    const changed=new Set();
    next.forEach(team=>team.players.forEach(row=>{const before=teams.find(item=>item.id===team.id)?.players.find(item=>item.key===row.key);if(JSON.stringify(before)!==JSON.stringify(row)||JSON.stringify([team.kitChoice,team.kitColor])!==JSON.stringify([teams.find(item=>item.id===team.id)?.kitChoice,teams.find(item=>item.id===team.id)?.kitColor]))changed.add(`${team.id}:${row.key}`);}));
    setChecked(old=>Object.fromEntries(Object.entries(old).filter(([key])=>!changed.has(key))));setTeams(next);setError("");
  };
  const submit=async event=>{
    event.preventDefault();if(busy)return;setError("");
    try{
      const validated=validateKitTeams(teams,{referee:true,requireNumbered});
      if(validated.some(team=>team.players.some(row=>!checked[`${team.id}:${row.key}`])))throw new Error("Check every player's actual kit before confirming.");
      setBusy(true);await onSave(validated);
    }catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  return <div className="modal-backdrop kit-modal-backdrop"><section className="modal kit-modal" role="dialog" aria-modal="true" aria-labelledby="kit-verification-title"><form onSubmit={submit}>
    <h2 id="kit-verification-title">Verify the shirts on the pitch</h2><p className="muted">Check both teams, including substitutes. {requireNumbered?"Official league players must wear their numbered bibs. Unnumbered and inside-out bibs cannot be approved.":"Correct last-minute changes here. With no spare kit, approve an inside-out bib or another unnumbered option."} A real #0 is a numbered bib.</p>
    {scope.environment==="practice"&&<p className="muted">Practice only — official player records are unchanged.</p>}
    <KitRows teams={teams} onChange={change} referee requireNumbered={requireNumbered} disabled={busy} checked={checked} onChecked={(key,value)=>setChecked(old=>({...old,[key]:value}))}/>
    {(error || externalError)&&<p className="error-text" role="alert">{error || externalError}</p>}
    <div className="actions-row"><button className="secondary-btn" type="button" disabled={busy} onClick={onCancel}>Back to lineups</button><button className="primary-btn" type="submit" disabled={busy}>{busy?"Saving verification…":"Confirm checked kit"}</button></div>
  </form></section></div>;
}
