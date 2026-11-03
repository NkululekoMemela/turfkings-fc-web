import React,{useState} from 'react';

export default function BibPlayerPicker({members,picked,requests,side,disabled,onToggle}){
 const [query,setQuery]=useState('');
 const selected=members.filter(m=>picked[m.id]?.selected).length;
 const matches=members.filter(m=>String(m.name||'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <details className="bib-player-picker">
  <summary>Select players <span>{selected} selected</span></summary>
  <div className="bib-picker-panel">
   <label>Find player<input type="search" placeholder="Search names" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="bib-picker-list" role="group" aria-label="Pack players">
    {matches.map(m=>{
     const pending=requests.some(r=>r.memberId===m.id&&r.side===side&&!['requested','cancelled','collected','delivered'].includes(r.status));
     const request=requests.find(r=>r.memberId===m.id&&r.side===side&&r.status==='requested');
     return <label className="bib-picker-option" key={m.id}>
      <input type="checkbox" checked={!!picked[m.id]?.selected} disabled={disabled||pending} onChange={()=>onToggle(m)}/>
      <span>{m.name}<small>{pending?'Bib pending':request?.paymentStatus==='paid'?'Paid':request?'Requested':''}</small></span>
     </label>;
    })}
    {!matches.length&&<p>No players found.</p>}
   </div>
  </div>
 </details>;
}
