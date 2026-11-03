import React,{useEffect,useMemo,useState} from 'react';
import {getVenueLiveMatchDoc} from '../storage/venueLiveMatchRepository.js';
import {onSnapshot} from 'firebase/firestore';
import {db} from '../firebaseConfig.js';
import {subscribeToMatchHighlights} from '../storage/venueVideoHighlightsRepository.js';
import {fieldSpectatorView,fieldSpectatorScore} from '../core/fieldSpectatorView.mjs';
import {fieldHalfSecondsLeft} from '../core/fieldMatchClock.js';
const clock=n=>`${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
export default function VenueLeagueSpectatorPage({venue,season={},teams=[],dataScope,currentLive=null,onBack,onBackToLanding,activeClubId}){
 const venueId=venue?.id||dataScope?.venueId||activeClubId||'';
 const scope=useMemo(()=>dataScope||{kind:'venueLeague',environment:'official',venueId,seasonId:season?.id||''},[dataScope?.environment,dataScope?.practiceSessionId,venueId,season?.id]);
 const [live,setLive]=useState(currentLive),[error,setError]=useState(''),[now,setNow]=useState(Date.now),[clips,setClips]=useState([]),[clipLimit,setClipLimit]=useState(12);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  setLive(currentLive);if(!scope.venueId||!scope.seasonId)return;
  let stop;try{stop=onSnapshot(getVenueLiveMatchDoc(db,scope),snap=>{const value=snap.data();setLive(value?{...value,_receivedAt:Date.now()}:null);setError('');},()=>setError('Live updates interrupted. Reconnecting…'));}catch{setError('Match updates are unavailable.');}
  return()=>stop?.();
 },[scope.venueId,scope.seasonId,scope.environment,scope.practiceSessionId]);
 const view=fieldSpectatorView({season,live,now}),match=view.match||{};
 const score=fieldSpectatorScore(match),byId=id=>(Array.isArray(teams)?teams:[]).find(t=>String(t.id)===id)||{};
 const a={...byId(score.a),...(match.teamASnapshot||{}),label:match.teamASnapshot?.label||byId(score.a).label||byId(score.a).name||match.teamALabel||score.a},b={...byId(score.b),...(match.teamBSnapshot||{}),label:match.teamBSnapshot?.label||byId(score.b).label||byId(score.b).name||match.teamBLabel||score.b};
 const matchId=String(match.videoHighlightsMatchId||match.currentVideoHighlightsMatchId||(match.fixtureId&&scope.seasonId?`venue__${venueId}__${scope.seasonId}__${match.fixtureId}`:'')||match.id||'');
 useEffect(()=>{setClips([]);setClipLimit(12);if(!matchId||!venueId||scope.environment==='practice')return;return subscribeToMatchHighlights({matchId,clubId:venueId,onChange:setClips,onError:()=>setClips([])});},[matchId,venueId,scope.environment]);
 const elapsed=live?.running&&!live?.timeUp&&live?.clockPhase!=='halftime'?Math.max(0,Math.floor((now-(live._receivedAt||now))/1000)):0;
 const remaining=Math.max(0,(Number(live?.secondsLeft)||0)-elapsed);
 const label=team=>String(team.label||team.name||'Team');
 const badge=team=>{const src=team.transparentLogoUrl||team.logoUrl||team.branding?.logoUrl||team.image;return src?<img src={src} alt="" width="64" height="64" style={{objectFit:'contain'}}/>:<span aria-hidden="true" style={{fontSize:32}}>⚽</span>;};
 return <main className="page live-page field-spectator-page">
  <section className="card"><small>{view.kind==='live'?'LIVE MATCH':view.kind==='result'?'FULL TIME':view.kind==='upcoming'?'UPCOMING MATCH':'MATCH CENTRE'}</small>
   {view.kind==='empty'?<p>No fixture announced yet.</p>:<>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto minmax(0,1fr)',alignItems:'center',gap:16,padding:'24px 0',textAlign:'center'}}>
     <div>{badge(a)}<h3>{label(a)}</h3></div>
     <strong style={{fontSize:32,whiteSpace:'nowrap'}}>{view.kind==='upcoming'?'VS':`${score.goalsA} – ${score.goalsB}`}</strong>
     <div>{badge(b)}<h3>{label(b)}</h3></div>
    </div>
    {view.kind==='live'&&<p role="timer" style={{textAlign:'center',fontSize:30,fontWeight:850}}>{clock(live?.clockVersion===1?fieldHalfSecondsLeft({...live,secondsLeft:remaining}):remaining)}{live?.clockPhase==='halftime'?' · Halftime':live?.running?'':' · Paused'}</p>}
    {view.kind==='upcoming'&&<p style={{textAlign:'center'}}>{new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Johannesburg'}).format(new Date(match.atMs))}</p>}
    {score.events.length>0&&<div><h3>Match events</h3>{score.events.map((e,i)=><p key={e.id||i}><small>{clock(Number(e.timeSeconds)||0)}</small> {e.type==='goal'?'⚽':e.type==='red_card'?'🟥':e.type==='yellow_card'?'🟨':'•'} {String(e.scorer||e.playerName||e.player||'')}{e.assist?` · Assist: ${String(e.assist)}`:''}</p>)}</div>}
   </>}
   {error&&<p role="status">{error}</p>}
   {(onBack||onBackToLanding)&&<button className="secondary-btn" onClick={onBack||onBackToLanding}>Back to Field</button>}
  </section>
  {clips.length>0&&<section className="card"><h3>Match highlights</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>{clips.slice(0,clipLimit).map(c=><video key={c.id} controls playsInline preload="none" poster={c.thumbnailUrl||c.posterUrl||''} src={c.playableUrl||c.videoUrl||c.downloadUrl||c.mediaUrl} style={{width:'100%',maxHeight:340,borderRadius:14}}/>)}</div>{clips.length>clipLimit&&<button className="secondary-btn" onClick={()=>setClipLimit(n=>n+12)}>More highlights</button>}</section>}
 </main>;
}
