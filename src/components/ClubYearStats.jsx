import React,{useEffect,useState} from "react";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";
import "./ClubYearStats.css";
export default function ClubYearStats({clubId,userId}){
  const currentYear=Number(new Intl.DateTimeFormat("en-ZA",{
    timeZone:"Africa/Johannesburg",year:"numeric"
  }).format(new Date()));
  const [open,setOpen]=useState(false),[year,setYear]=useState(currentYear);
  const [loaded,setLoaded]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const key=JSON.stringify([clubId,userId,year]);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();let active=true;
    setBusy(true);setError("");setLoaded(null);
    fieldLogoStudioRequest({action:"clubYearStats",clubId,year,environment:"official"},controller.signal)
      .then(report=>{if(active)setLoaded({key,report});})
      .catch(reason=>{if(active&&reason.name!=="AbortError")setError(reason.message);})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;controller.abort();};
  },[open,key]);
  const report=loaded?.key===key?loaded.report:null;
  const years=[...new Set([currentYear,currentYear-1,currentYear-2,year,...(report?.years||[])])].sort((a,b)=>b-a);
  const leaders=(title,rows)=><section className="club-year-leaders">
    <h3>{title}</h3>{rows.length?<ol>{rows.map(row=><li key={row.id}>
      <span>{row.name}</span><strong>{row.total}</strong>
    </li>)}</ol>:<p className="muted">No recorded totals for this year.</p>}
  </section>;
  return <details className="card club-year-stats" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><span>Club year in numbers<small>Captain and administrator report</small></span></summary>
    {open&&<div className="club-year-content">
      <label>Calendar year <select value={year} onChange={event=>setYear(Number(event.target.value))}>
        {years.map(value=><option key={value} value={value}>{value}</option>)}
      </select></label>
      <p className="muted">Official Mini-league and Friendly matches combined.</p>
      {busy&&<p role="status">Loading Club totals…</p>}
      {error&&<p role="alert">{error}</p>}
      {report&&<>
        <div className="club-year-grid">
          {leaders("Top 5 goalscorers",report.goals)}
          {leaders("Top 5 assisters",report.assists)}
          {leaders("Top 5 clean sheets",report.cleanSheets)}
        </div>
        <h3>Player attendance</h3>
        <p className="muted">Recorded playing dates attended, with games played. A date counts once across both formats. Percentages use the Club's recorded dates.</p>
        <div className="club-year-table"><table>
          <thead><tr><th>Player</th><th>Dates</th><th>Games</th><th>Attendance</th></tr></thead>
          <tbody>{report.attendance.map(row=><tr key={row.id}>
            <th scope="row">{row.name}</th><td>{row.attended} / {row.totalDays}</td>
            <td>{row.gamesPlayed}</td><td>{row.percent===null?"—":row.percent+"%"}</td>
          </tr>)}</tbody>
        </table></div>
        {!report.recordedDays&&<p className="muted">No dated attendance records for this year.</p>}
        {report.undated>0&&<p className="muted">Some historical records have no usable date and are excluded from yearly totals.</p>}
      </>}
    </div>}
  </details>;
}
