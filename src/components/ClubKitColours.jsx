import React,{useState} from "react";
import {KitColourPicker} from "./ProfileKitEditor.jsx";
import {numberRequest} from "./ProfileNumberStudio.jsx";
export function ClubKitColours({draft,onChange,disabled=false}){
 return <section className="club-traditional-colours hub-field--wide"><h3>Traditional club colours</h3><p className="muted">Set Home and Away once for the club. Every player’s jersey uses these saved colours.</p>{["Home","Away"].map(kind=><KitColourPicker key={kind} label={`${kind} club colour`} value={draft[`${kind.toLowerCase()}Color`]||""} disabled={disabled} onChange={value=>onChange({...draft,[`${kind.toLowerCase()}Color`]:value})}/>)}</section>;
}
export function CaptainClubColoursEditor({club,onSaved,onClose}){
 const [draft,setDraft]=useState({homeColor:club.homeColor||club.raw?.homeColor||"",awayColor:club.awayColor||club.raw?.awayColor||""}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Edit traditional club colours"><h2>Club colours</h2><ClubKitColours draft={draft} onChange={setDraft} disabled={busy}/>{error&&<p className="error-text" role="alert">{error}</p>}<div className="actions-row"><button type="button" className="secondary-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-btn" disabled={busy||!draft.homeColor||!draft.awayColor} onClick={async()=>{setBusy(true);setError("");try{await numberRequest({action:"settings",clubId:club.id||club.clubId,...draft});onSaved?.({...club,...draft});onClose?.();}catch(error){setError(error.message);}finally{setBusy(false);}}}>{busy?"Saving…":"Save club colours"}</button></div></section></div>;
}
