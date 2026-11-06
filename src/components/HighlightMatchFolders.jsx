import React from 'react';
import './HighlightMatchFolders.css';
import VideoFramePreview from './VideoFramePreview.jsx';
import MatchVotingCountdown from './MatchVotingCountdown.jsx';
export default function HighlightMatchFolders({fixtures=[],value='',onChange,kind='field',ownerId='',voting=true}){
 if(value){
  const available=fixtures.filter(f=>f.clipCount>0);
  const index=available.findIndex(f=>f.matchId===value);
  const match=available[index];
  return <section className="highlight-match-open">
   <nav className="highlight-match-navigation" aria-label="Match navigation">
    <button type="button" className="highlight-match-library" onClick={()=>onChange('')}><span aria-hidden="true">▦</span><span>Match collection<small>Choose another match</small></span><b aria-hidden="true">↗</b></button>
    <div className="highlight-match-steppers"><button type="button" aria-label="Previous match" disabled={index<=0} onClick={()=>onChange(available[index-1].matchId)}>‹</button><span>{index>=0?index+1:'–'} / {available.length}</span><button type="button" aria-label="Next match" disabled={index<0||index>=available.length-1} onClick={()=>onChange(available[index+1].matchId)}>›</button></div>
   </nav>
   <div className="highlight-open-identity"><small>{match?.date||'Match highlights'}</small><h3>{match?.label||'Match highlights'}{match?.goalsA!=null&&match?.goalsB!=null?` · ${match.goalsA} – ${match.goalsB}`:''}</h3>{voting&&ownerId&&<MatchVotingCountdown kind={kind} ownerId={ownerId} matchId={value}/>}</div>
  </section>;
 }
 return <section className="highlight-folders" aria-label="Matches with highlights">
  <div className="highlight-folders-heading"><h3>Match highlights</h3>{value&&<button type="button" onClick={()=>onChange('')}>All matches</button>}</div>
  {!fixtures.some(match=>match.clipCount>0)&&<p className="muted small">Match highlights will appear here.</p>}
  <div className="highlight-folders-grid">{fixtures.filter(f=>f.clipCount>0||f.matchId===value).map(f=>{
   const scored=f.goalsA!=null&&f.goalsB!=null;
   const names=f.label.split(/\s+vs\s+/i);
   return <button type="button" key={f.matchId} className={`highlight-match-folder${value===f.matchId?' is-selected':''}`} aria-pressed={value===f.matchId} onClick={()=>onChange(value===f.matchId?'':f.matchId)}>
    <span className="highlight-folder-date">{f.date||'Recorded match'}</span>
    <span className="highlight-folder-match"><strong>{f.teamALogoUrl&&<img src={f.teamALogoUrl} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>}{names[0]}</strong>{scored?<b>{f.goalsA} – {f.goalsB}</b>:<span>vs</span>}{names[1]&&<strong>{f.teamBLogoUrl&&<img src={f.teamBLogoUrl} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>}{names.slice(1).join(' vs ')}</strong>}</span>
    <span className="highlight-folder-previews">{(f.previews||[]).map((clip,index)=><span className="highlight-folder-preview" key={clip.id||index}>{clip.poster?<img src={clip.poster} alt="" loading="lazy"/>:clip.src?<VideoFramePreview src={clip.src} muted tabIndex={-1} aria-hidden="true"/>:<span className="highlight-preview-placeholder" aria-hidden="true">▶</span>}<span>{clip.type==='goal'?'⚽ ':''}{clip.label}</span></span>)}</span>
    {voting&&ownerId&&<MatchVotingCountdown kind={kind} ownerId={ownerId} matchId={f.matchId}/>}
    <span className="highlight-folder-count">{f.clipCount} {f.clipCount===1?'clip':'clips'} <span>{value===f.matchId?'Viewing this match':'View highlights →'}</span></span>
   </button>;
  })}</div>
 </section>;
}
