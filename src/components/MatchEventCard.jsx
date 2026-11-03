import React from 'react';
import './MatchEventCard.css';
export default function MatchEventCard({event={},teamLabel='',teamName='',logo='',theme={},playerLabel='',assistLabel='',label='Event',icon='•',clock='',canEdit=false,onEdit,onDelete}){
 return <li className="event-item premium-goal-event match-event-card" data-event-type={event.type} style={{'--goal-team-soft':theme.soft,'--goal-team-border':theme.border,'--goal-team-dot':theme.dot}}>
  <span className="match-event-emblem" aria-hidden="true">{icon}</span>
  <div className="match-event-copy"><div className="match-event-meta"><span className="match-event-team">{logo&&<img src={logo} alt="" onError={e=>{e.currentTarget.style.display='none';}}/>}{teamName||teamLabel}</span><time>{clock}</time></div>
   <strong className="match-event-player">{playerLabel||'Player'}</strong><span className="match-event-description">{label}{event.type==='goal'&&assistLabel?` · Assist: ${assistLabel}`:''}</span>
  </div>
  {canEdit&&<div className="match-event-actions"><button type="button" onClick={onEdit} aria-label={`Edit ${label.toLowerCase()}`}>✎</button><button type="button" onClick={onDelete} aria-label={`Delete ${label.toLowerCase()}`}>×</button></div>}
 </li>;
}
