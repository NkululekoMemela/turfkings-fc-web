import React from "react";

const badge = {width:32,height:32,objectFit:"contain",borderRadius:8,flexShrink:0};
export default function FormationTeamSelector({teams, selectedId, onSelect, renderLabel}) {
  return <div className="team-pill-row" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,width:"100%"}}>
    {teams.map(team => {
      const selected = team.id === selectedId;
      const name = team.label || team.name || "Club";
      return <button key={team.id} type="button" className={`team-pill-btn ${selected ? "active" : ""}`}
        aria-pressed={selected} onClick={() => onSelect(team.id)}
        style={{display:"flex",alignItems:"center",gap:10,minHeight:60,height:"100%",width:"100%",minWidth:0,
          boxSizing:"border-box",textAlign:"left",padding:"9px 14px",borderRadius:16,
          border:selected?"1px solid #e7b974":"1px solid rgba(255,255,255,.14)",
          background:selected?"linear-gradient(135deg,#293549,#152239)":"#101b2d",color:"#f8fafc",fontWeight:700}}>
        {team.logoUrl ? <img src={team.logoUrl} alt="" style={badge}/> : !renderLabel &&
          <span aria-hidden="true" style={{...badge,display:"grid",placeItems:"center",background:"rgba(231,185,116,.12)",color:"#e7b974"}}>{name[0]}</span>}
        <span style={{minWidth:0,overflowWrap:"anywhere"}}>{team.logoUrl || !renderLabel ? name : renderLabel(team)}</span>
      </button>;
    })}
  </div>;
}
