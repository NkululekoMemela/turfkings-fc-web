import {fieldConfirm} from "./FieldDialog.jsx";
import React from 'react';
import {createRoot} from 'react-dom/client';
export function chooseFieldOfficialStart(scheduledLocal) {
 return new Promise(resolve=>{
  const host=document.createElement('div');document.body.appendChild(host);
  const root=createRoot(host),previous=document.activeElement;
  let finished=false;
  const done=choice=>{if(finished)return;finished=true;document.removeEventListener('keydown',onKey);root.unmount();host.remove();previous?.focus?.();resolve(choice);};
  const onKey=event=>{if(event.key==='Escape')done('cancel');if(event.key==='Tab'){const buttons=host.querySelectorAll('button');if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons[2].focus();}else if(!event.shiftKey&&document.activeElement===buttons[2]){event.preventDefault();buttons[0].focus();}}};
  document.addEventListener('keydown',onKey);
  root.render(<div className="tk-referee-lock-backdrop" onClick={()=>done('cancel')}>
   <div className="tk-referee-lock-modal" role="dialog" aria-modal="true" aria-labelledby="field-start-title" onClick={e=>e.stopPropagation()}>
    <div className="tk-referee-lock-kicker"><span className="tk-live-dot"/> Official record protection</div>
    <h2 id="field-start-title">Outside official match time</h2>
    <p>This does not look like your Field fixture’s scheduled match window. Starting an Official Session now may affect real standings, player stats, attendance and match history.</p>
    <p>Scheduled fixture: <strong>{scheduledLocal.replace('T',' · ')}</strong></p>
    <div style={{display:'grid',gap:'0.55rem'}}>
     <button autoFocus type="button" className="primary-btn" onClick={()=>done('practice')}>Go to Practice Session</button>
     <button type="button" className="secondary-btn" onClick={async()=>{if(await fieldConfirm('Official record. For a changed match date only. For testing, choose Practice.'))done('official');}}>Continue Officially for now</button>
     <button type="button" className="secondary-btn" onClick={()=>done('cancel')}>Cancel</button>
    </div>
   </div>
  </div>);
 });
}
