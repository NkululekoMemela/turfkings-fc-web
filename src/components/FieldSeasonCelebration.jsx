import React, {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import "./FieldSeasonCelebration.css";

export default function FieldSeasonCelebration({celebration, venueId, userId, enabled}) {
  const dialog=useRef(null);
  const [dismissed,setDismissed]=useState("");
  const key=celebration?.seasonId ? `fanm:field-celebration:${venueId}:${userId||"viewer"}:${celebration.seasonId}` : "";
  useEffect(()=>{
    if(!key||!enabled||!userId||!Number.isFinite(celebration.endedAtMs)||Date.now()-celebration.endedAtMs>7*86400000)return;
    let seen=false;try{seen=localStorage.getItem(key)==="seen";}catch{}
    if (!seen && dismissed !== key && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      try { localStorage.setItem(key, "seen"); } catch {}
    }
  },[key,enabled,userId,dismissed,celebration?.endedAtMs]);
  if(!celebration)return null;
  const close=()=>{try{localStorage.setItem(key,"seen");}catch{}setDismissed(key);dialog.current?.close();};
  const winner=celebration.winner;
  return createPortal(<dialog ref={dialog} className="field-season-celebration" aria-labelledby="field-champions-title"
    onCancel={event=>{event.preventDefault();close();}}>
    <div className="field-finale-art" aria-hidden="true">
      {Array.from({length:24},(_,index)=><i key={index} style={{"--i":index}}/>)}
      <span className="field-finale-balloon is-left"/><span className="field-finale-balloon is-right"/>
      <span className="field-finale-cup">🏆</span>
    </div>
    <p className="field-finale-eyebrow">{celebration.venueName} · {celebration.seasonName}</p>
    <h2 id="field-champions-title">{winner ? "Meet your champions!" : "A season to remember"}</h2>
    {winner ? <><h3>{winner.name}</h3><p>{winner.points} points · League champions</p></> :
      <p>{celebration.premature ? "The tournament has ended early. These are the final recorded standings." :
        celebration.tied?.length>1 ? "The leading Clubs finished level. A champion has not been decided by the recorded tiebreakers." : "Thank you to every Club, player and official."}</p>}
    <div className="field-finale-podium">{(celebration.podium||[]).map((club,index)=><article key={club.id}>
      <span aria-hidden="true">{["🥇","🥈","🥉"][index]}</span><strong>{club.name}</strong><small>{club.points} pts · {club.played} played</small>
    </article>)}</div>
    <p className="field-finale-footnote">{celebration.completed} of {celebration.total} fixtures played. Results remain in the season archive.</p>
    <button type="button" onClick={close}>Celebrate the season 🎉</button>
  </dialog>,document.body);
}
