import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig.js';
import {memberWorkspaceRequest} from '../storage/memberWorkspaceGateway.js';
import './MemberWorkspace.css';
export default function FieldTeamManagement({venueId,onClose}){
 const [staff,setStaff]=useState([]),[error,setError]=useState(''),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[uid,setUid]=useState(auth.currentUser?.uid||'');
 const account=useRef(uid);
 const request=body=>memberWorkspaceRequest('manageFieldStaff',{venueId,...body});
 useEffect(()=>onAuthStateChanged(auth,user=>{const next=user?.uid||'';if(account.current===next)return;account.current=next;setUid(next);setStaff([]);setConfirm(null);setError('');}),[]);
 useEffect(()=>{let active=true;setReady(false);request({action:'list'}).then(r=>{if(active){setStaff(r.staff);setReady(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[venueId,uid]);
 return <div className="member-workspace-backdrop"><section className="member-workspace" role="dialog" aria-modal="true" aria-label="Field team management"><header><div><h2>Field team</h2><small>Manage staff access</small></div><button type="button" onClick={onClose} aria-label="Close Field management">×</button></header>
 {!ready&&!error&&<p>Loading your Field team…</p>}
 {staff.map(person=><article className="member-workspace-person" key={person.id}><div><strong>{person.name}</strong><small>{String(person.role||'Staff').replaceAll('_',' ')} · {person.status}</small></div>{!person.protected&&['active','inactive'].includes(person.status)&&<button type="button" disabled={busy} onClick={()=>setConfirm(person)}>{person.status==='active'?'Remove access':'Restore access'}</button>}</article>)}
 {confirm&&<div className="member-workspace-confirm"><p>{confirm.status==='active'?`Remove ${confirm.name}’s Field access? Their historical work will remain.`:`Restore ${confirm.name}’s Field access?`}</p><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await request({action:'status',staffId:confirm.id,status:confirm.status==='active'?'inactive':'active'});const r=await request({action:'list'});setStaff(r.staff);setConfirm(null);}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'Saving…':'Confirm'}</button><button type="button" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button></div>}
 {error&&<p role="alert">{error}</p>}
 </section></div>;
}
