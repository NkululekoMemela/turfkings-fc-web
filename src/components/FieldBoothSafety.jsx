import React, {useEffect, useState} from 'react';
import {auth, activeFirebaseProjectId} from '../firebaseConfig.js';
import {boothRequest, readBooth, watchBooth, flushBooth, publishBoothFinish} from '../storage/fieldBoothJournal.js';
import {fieldConfirm} from './FieldDialog.jsx';
import './FieldBoothSafety.css';
export default function FieldBoothSafety({scope, live, controls, guest = false}) {
  const [saved, setSaved] = useState(() => readBooth(scope));
  const [online, setOnline] = useState(navigator.onLine), [busy,setBusy]=useState(false);
  const [error,setError]=useState(''), [code,setCode]=useState('');
  useEffect(() => watchBooth(scope, setSaved), [scope.venueId,scope.seasonId]);
  useEffect(() => {
    const sync = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) flushBooth(scope).then(()=>publishBoothFinish(scope)).catch(()=>{});
    };
    window.addEventListener('online',sync); window.addEventListener('offline',sync);
    const timer=setInterval(sync,5000); sync();
    return()=>{clearInterval(timer);window.removeEventListener('online',sync);window.removeEventListener('offline',sync);};
  },[scope.venueId,scope.seasonId]);
  async function run(action) {
    if(busy)return;setBusy(true);setError('');
    try {await action();} catch(e){setError(e.message);} finally{setBusy(false);}
  }
  const pending = live?.boothInvite?.requester;
  const waiting = saved?.finishSummary;
  const issue = error || saved?.error;
  const status = saved?.conflict ? 'Handover detected · local record kept' : waiting
    ? 'Match finished on this phone · awaiting upload' : !online ? 'Offline · saved on this phone'
    : saved?.pending?.length ? 'Syncing · saved on this phone' : 'Match saved';
  return <aside className="field-booth-safety" aria-label="Referee recovery">
    {(controls || waiting || saved?.conflict) && <span role="status">{status}</span>}
    {controls && !guest && <button disabled={busy||!online||!!saved?.conflict||!!waiting} onClick={()=>run(async()=>{
      await flushBooth(scope);
      if(readBooth(scope)?.pending?.length)throw Error('Wait for this phone’s saved actions to finish uploading.');
      const result=await boothRequest(scope,'createInvite');setCode(result.code);
    })}>Hand over referee</button>}
    {code && controls && <div className="field-booth-safety__handover">
      <strong>Replacement uses their own account</strong>
      <p>Open the Field entry page, choose “Emergency referee access” and enter this code.</p>
      <code>{code}</code><small>Expires after 5 minutes. You approve the person before control changes.</small>
      <button onClick={()=>run(async()=>{
        await navigator.clipboard.writeText(`https://${activeFirebaseProjectId}.web.app/?fieldReferee=${code}`);
      })}>Copy handover link</button>
      <button onClick={()=>setCode('')}>Hide code</button>
    </div>}
    {controls && pending && live.boothInvite.expiresAtMs>Date.now() && <div>
      <strong>{pending.name} is waiting</strong>
      <button disabled={busy||!online} onClick={()=>run(async()=>{
        if(!await fieldConfirm(`Hand this match to ${pending.name}? Check that this is the person beside you. Their access ends with this match.`))return;
        await flushBooth(scope);
        await boothRequest(scope,'approveInvite',{targetUid:pending.uid,targetDeviceId:pending.deviceId});
      })}>Approve handover</button>
    </div>}
    {issue && <p role="alert">{issue}</p>}
    {saved?.conflict && <button onClick={()=>run(async()=>{
      const blob=new Blob([JSON.stringify({...saved,exportedByUid:auth.currentUser?.uid},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='FANM-match-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    })}>Keep recovery copy</button>}
  </aside>;
}
