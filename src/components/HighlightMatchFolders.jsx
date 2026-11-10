import React from 'react';
import './HighlightMatchFolders.css';
import VideoFramePreview from './VideoFramePreview.jsx';
import MatchVotingCountdown from './MatchVotingCountdown.jsx';
import { FANM_NATIONAL_TEAMS } from '../data/fanm/fanmTeamLibrary.js';
function FixtureScore({fixture}) {
 const names=fixture.label.split(/\s+vs\s+/i);
 const scored=fixture.goalsA!=null&&fixture.goalsB!=null;
 const crest=(url,name)=>{
  if(url)return <img src={url} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>;
  if(names.length<2)return null;
  const flag=FANM_NATIONAL_TEAMS.find(team=>team.name.toLowerCase()===name.trim().toLowerCase())?.flag;
  const initials=name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  return <span className="highlight-crest-fallback" aria-hidden="true">{flag||initials}</span>;
 };
 const nameB=names.slice(1).join(' vs ');
 return <span className="highlight-folder-match">
  <strong>{crest(fixture.teamALogoUrl,names[0])}{names[0]}</strong>
  {names.length>1&&<>{scored?<b>{fixture.goalsA} – {fixture.goalsB}</b>:<span>vs</span>}
  <strong>{crest(fixture.teamBLogoUrl,nameB)}{nameB}</strong></>}
 </span>;
}
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
   <div className="highlight-open-identity"><small>{match?.date||'Match highlights'}</small>{match&&<FixtureScore fixture={match}/>}{match&&voting&&ownerId&&<MatchVotingCountdown kind={kind} ownerId={ownerId} matchId={value}/>}</div>
  </section>;
 }
 return <section className="highlight-folders" aria-label="Matches with highlights">
  <div className="highlight-folders-heading"><h3>Match highlights</h3>{value&&<button type="button" onClick={()=>onChange('')}>All matches</button>}</div>
  {!fixtures.some(match=>match.clipCount>0)&&<p className="muted small">Match highlights will appear here.</p>}
  <div className="highlight-folders-grid">{fixtures.filter(f=>f.clipCount>0||f.matchId===value).map((f, folderIndex)=>{
   return <button type="button" key={f.matchId} className={`highlight-match-folder${value===f.matchId?' is-selected':''}`} aria-pressed={value===f.matchId} onClick={()=>onChange(value===f.matchId?'':f.matchId)}>
    <span className="highlight-folder-date">{f.date||'Recorded match'}</span>
    <FixtureScore fixture={f}/>
    <span className="highlight-folder-previews">{(f.previews||[]).map((clip,index)=><span className="highlight-folder-preview" key={clip.id||index}>{clip.poster?<img src={clip.poster} alt="" loading={folderIndex < 2 ? "eager" : "lazy"} decoding="async"/>:clip.src?<VideoFramePreview src={clip.src} muted tabIndex={-1} aria-hidden="true"/>:<span className="highlight-preview-placeholder" aria-hidden="true">▶</span>}<span>{clip.type==='goal'?'⚽ ':''}{clip.label}</span></span>)}</span>
    {voting&&ownerId&&<MatchVotingCountdown kind={kind} ownerId={ownerId} matchId={f.matchId}/>}
    <span className="highlight-folder-count">{f.clipCount} {f.clipCount===1?'clip':'clips'} <span>{value===f.matchId?'Viewing this match':'View highlights →'}</span></span>
   </button>;
  })}</div>
 </section>;
}
