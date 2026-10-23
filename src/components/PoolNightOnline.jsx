import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,signInWithGoogle,activeFirebaseEnvironment} from '../firebaseConfig.js';
import {poolNightRequest} from '../storage/poolNightGateway.js';
import {coinsLeft,poolStandings,suggestedPoolPairs,normalPoolWinner} from '../core/poolTable.mjs';
const CODE_KEY=`fanm-pool-online-code:${activeFirebaseEnvironment}`;
const storedCode=()=>{try{return sessionStorage.getItem(CODE_KEY)||'';}catch{return '';}};
export function EightBall(){return <span className="pool-ball" role="img" aria-label="Black number eight pool ball"><i>8</i></span>;}
export default function PoolNightOnline({onBack,onLocal}){
 const [user,setUser]=useState(auth.currentUser),[night,setNight]=useState(null),[code,setCode]=useState(storedCode),[name,setName]=useState(auth.currentUser?.displayName||''),[title,setTitle]=useState('Pool night'),[tables,setTables]=useState('1'),[coins,setCoins]=useState('20'),[tab,setTab]=useState('tables'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[connected,setConnected]=useState(false),[creating,setCreating]=useState(false);
 const state=useRef(null),request=useRef(0),alive=useRef(true),writing=useRef(false),identity=useRef(user?.uid);
 useEffect(()=>{alive.current=true;const unsubscribe=onAuthStateChanged(auth,current=>{identity.current=current?.uid;request.current++;state.current=null;setNight(null);setUser(current);if(current?.displayName)setName(current.displayName);setConnected(false);});return()=>{alive.current=false;unsubscribe();};},[]);
 function accept(data){state.current=data;setNight(data);setConnected(true);}
 useEffect(()=>{
  if(!user||user.isAnonymous||!/^[A-F0-9]{10}$/.test(code))return;
  let stopped=false;
  async function refresh(){
   if(document.hidden||writing.current)return;
   const id=++request.current,uid=user.uid;
   try{const data=await poolNightRequest({action:'load',code,revision:state.current?.revision});if(stopped||id!==request.current||uid!==identity.current)return;if(!data.unchanged)accept(data);setConnected(true);}
   catch(e){if(!stopped&&id===request.current){setConnected(false);setError(e.message);}}
  }
  refresh();const timer=setInterval(refresh,5000);document.addEventListener('visibilitychange',refresh);
  return()=>{stopped=true;request.current++;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[user?.uid,code]);
 async function act(action,fields={}){
  if(writing.current)return;writing.current=true;setBusy(true);setError('');setNotice('');request.current++;
  const uid=identity.current;
  try{
   const data=await poolNightRequest({action,code,revision:state.current?.revision,...fields});
   if(!alive.current||uid!==identity.current)return;
   accept(data);setCode(data.code);try{sessionStorage.setItem(CODE_KEY,data.code);}catch{}
   if(action==='settings')setTab('tables');
   if(action==='submit')setNotice('Score sent for admin verification. The table is ready for the next game.');
  }catch(e){if(alive.current&&uid===identity.current){setError(e.message);if(code)try{const data=await poolNightRequest({action:'load',code});if(alive.current&&uid===identity.current)accept(data);}catch{setConnected(false);}}}
  finally{writing.current=false;if(alive.current)setBusy(false);}
 }
 function leave(){request.current++;setCode('');state.current=null;setNight(null);setError('');setConnected(false);try{sessionStorage.removeItem(CODE_KEY);}catch{}}
 const ready=night?.pool,owner=night?.ownerUid===user?.uid,pending=night?.pool?.matches.filter(m=>m.verification==='pending')||[];
 const players=night?.pool?.players||[],person=id=>players.find(p=>p.id===id)?.name||'Player';
 const standings=ready?poolStandings(players,night.pool.matches.filter(m=>m.verification==='verified')):[];
 const send=(action,fields)=>act(action,fields);
 return <main className="pool-page pool-premium"><div className="pool-shell"><header className="pool-header"><button className="pool-icon-back" type="button" onClick={onBack} aria-label="Back">‹</button><EightBall/><div><span className="pool-eyebrow">THE POOL ROOM</span><h1>{night?.title||'Pool night'}</h1></div></header>
 <div className="pool-online-status"><span className={connected?'pool-live-dot':''}/>{ready?(connected?'Shared night · updates every 5 seconds':'Connection interrupted'):'Play together, from your own phones'}<small>{activeFirebaseEnvironment==='staging'?'STAGING':'LIVE'}</small></div>
 {error&&<p className="pool-error" role="alert">{error}</p>}{notice&&<p className="pool-success" role="status">{notice}</p>}
 {!user||user.isAnonymous?<section className="pool-welcome"><span className="pool-eyebrow">YOUR TABLE. YOUR GAME.</span><h2>Less organising.<br/>More playing.</h2><p>Join your friends, find your table and send the score from your phone.</p><button disabled={busy} onClick={async()=>{setError('');setBusy(true);try{await signInWithGoogle();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Sign in with Google</button><button className="pool-secondary" onClick={onLocal}>Use this device only</button></section>:!ready?<section className="pool-entry-card">
 <div className="pool-signed-in">Signed in as <strong>{user.displayName||user.email}</strong></div>
 {night?.membership==='pending'?<><h2>You’re on the guest list.</h2><p>The host needs to approve you once. This page updates automatically.</p><strong className="pool-room-code">{code}</strong><button className="pool-secondary" onClick={leave}>Choose another night</button></>:night?.membership==='rejected'?<><h2>Join request declined</h2><p>Speak to the host before joining another night.</p><button onClick={leave}>Choose another night</button></>:<>
 <div className="pool-entry-tabs"><button aria-pressed={!creating} onClick={()=>setCreating(false)}>Join a night</button><button aria-pressed={creating} onClick={()=>setCreating(true)}>Host a night</button></div>
 <form onSubmit={e=>{e.preventDefault();act(creating?'create':'join',creating?{name,title,tables:Number(tables),coins:Number(coins)}:{name,code:code.trim().toUpperCase()});}}>
 <label>Your player name<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} required autoComplete="nickname"/></label>
 {creating?<><label>Night name<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={60} required/></label><div className="pool-score-grid"><label>Tables<input type="number" min="1" max="20" required value={tables} onChange={e=>setTables(e.target.value)}/></label><label>Unused coins<input type="number" min="0" max="10000" required value={coins} onChange={e=>setCoins(e.target.value)}/></label></div><p className="pool-rule">You’ll approve players and verify results. Everyone can help log the scores.</p></>:<label>Night code<input value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,10))} minLength={10} maxLength={10} required placeholder="Enter the host’s code" autoCapitalize="characters" spellCheck={false}/></label>}
 <button className="pool-primary-wide" disabled={busy}>{busy?'Connecting…':creating?'Open the night':'Ask to join'}</button></form><button className="pool-text-button" onClick={onLocal}>Continue on this device only</button></>}
 </section>:<>
 <div className="pool-night-strip"><div><span className="pool-eyebrow">NIGHT CODE</span><strong>{code}</strong></div><button className="pool-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(code);setNotice('Night code copied. Send it to your players.');}catch{setNotice(`Share this code: ${code}`);}}}>Copy code</button><span>{owner?'You’re the admin':`${person(user.uid)} · Player`}</span></div>
 <nav className="pool-jump-nav" aria-label="Shared pool sections">{[['tables','Tables'],['players','Players'],['standings','Standings'],['results',owner&&pending.length?`Verify (${pending.length})`:'Games'],...(owner?[['settings','Setup']]:[])].map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 <div className="pool-night-metrics"><span><b>{night.pool.active.length}</b> playing</span><span><b>{players.filter(p=>p.present!==false).length}</b> players</span><span><b>{coinsLeft(night.pool)}</b> coins left</span></div>
 {tab==='tables'&&<section><div className="pool-view-title"><h2>On the tables</h2><span>{night.pool.tables} tables</span></div><div className="pool-grid">{Array.from({length:night.pool.tables},(_,i)=><OnlineTable key={i+1} table={i+1} pool={night.pool} owner={owner} uid={user.uid} person={person} busy={busy} send={send}/>)}</div><p className="pool-rule">Scores await admin verification. You can keep playing while the admin checks them.</p></section>}
 {tab==='players'&&<section><div className="pool-view-title"><h2>Who’s here</h2><span>{players.length} players</span></div>{owner&&Object.entries(night.members).filter(([,m])=>m.status==='pending').map(([uid,m])=><div className="pool-person-row" key={uid}><strong>{m.name}<small>Wants to join</small></strong><button disabled={busy} onClick={()=>act('approveMember',{uid})}>Approve</button><button className="pool-secondary" disabled={busy} onClick={()=>act('rejectMember',{uid})}>Decline</button></div>)}{players.map(p=><div className="pool-person-row" key={p.id}><span className="pool-initial">{p.name.slice(0,1)}</span><strong>{p.name}<small>{night.pool.active.some(m=>[m.a,m.b].includes(p.id))?'Playing':p.present?'Ready':'Away'}</small></strong>{owner&&<button className="pool-secondary" disabled={busy||night.pool.active.some(m=>[m.a,m.b].includes(p.id))} onClick={()=>act('presence',{uid:p.id,present:!p.present})}>{p.present?'Mark away':'Mark here'}</button>}</div>)}</section>}
 {tab==='standings'&&<section><div className="pool-view-title"><h2>The leaderboard</h2><span>Verified results</span></div><div className="pool-table-scroll"><table><thead><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>Diff</th></tr></thead><tbody>{standings.map((p,i)=><tr key={p.id}><td>{i+1}</td><th>{p.name}</th><td>{p.wins}</td><td>{p.losses}</td><td>{p.difference>0?'+':''}{p.difference}</td></tr>)}</tbody></table></div>{pending.length>0&&<p className="pool-rule">{pending.length} scores still awaiting verification.</p>}</section>}
 {tab==='results'&&<section><div className="pool-view-title"><h2>{owner?'Scores to verify':'Recent games'}</h2><span>{pending.length} pending</span></div>{night.pool.matches.length===0&&<p>No games recorded yet.</p>}{[...night.pool.matches].reverse().sort((a,b)=>Number(b.verification==='pending')-Number(a.verification==='pending')).map(m=><OnlineResult key={m.id} match={m} revision={night.revision} person={person} owner={owner} busy={busy} send={send}/>)}</section>}
 {tab==='settings'&&owner&&<OnlineSettings key={night.code} revision={night.revision} pool={night.pool} busy={busy} send={send}/>}
 <footer className="pool-online-footer"><button className="pool-text-button" onClick={leave}>Leave this view</button><span>Scores are saved online.</span></footer>
 </>}
 </div></main>;
}
function OnlineTable({table,pool,owner,uid,person,busy,send}){
 const match=pool.active.find(m=>m.table===table),pair=suggestedPoolPairs(pool)[table];
 const [manual,setManual]=useState(false),[a,setA]=useState(''),[b,setB]=useState(''),[recording,setRecording]=useState(false);
 useEffect(()=>setRecording(false),[match?.id]);
 const available=pool.players.filter(p=>p.present&&!pool.active.some(m=>[m.a,m.b].includes(p.id))),startPair=manual?{a,b}:pair;
 const canStart=owner||[startPair?.a,startPair?.b].includes(uid);
 return <article className="pool-card pool-shared-table" data-table-tone={['emerald','blue','violet','amber'][(table-1)%4]}><div className="pool-table-heading"><h2>Table {table}</h2><span className="pool-table-status">{match?'● Playing':'Available'}</span></div><div className="pool-shared-felt">{(match||startPair)?.a&&(match||startPair)?.b?<><strong>{person((match||startPair).a)}</strong><span>vs</span><strong>{person((match||startPair).b)}</strong></>:<><span className="pool-felt-eight">8</span><p>Ready for the next game</p></>}</div>
 {match?<>{!recording?<button className="pool-primary-wide" disabled={busy} onClick={()=>setRecording(true)}>Log score</button>:<PoolScoreForm key={match.id} match={match} person={person} busy={busy} label="Send score" onSubmit={result=>send('submit',{matchId:match.id,...result})} onCancel={()=>setRecording(false)}/ >}{owner&&<button className="pool-text-button" disabled={busy} onClick={()=>{if(confirm('Cancel this game? Check the unused coins if one was already spent.'))send('cancel',{matchId:match.id});}}>Cancel game</button>}</>:<><button className="pool-text-button" onClick={()=>setManual(v=>!v)}>{manual?'Use suggested fixture':'Choose players'}</button>{manual&&<div className="pool-score-grid">{[['First player',a,setA],['Second player',b,setB]].map(([label,value,set])=><label key={label}>{label}<select value={value} onChange={e=>set(e.target.value)}><option value="">Choose</option>{available.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}</div>}<button className="pool-primary-wide" disabled={busy||!canStart||!startPair?.a||!startPair?.b||startPair.a===startPair.b||coinsLeft(pool)<1} onClick={()=>send('start',{table,...(manual?{a,b}:{})})}>Start game</button>{!canStart&&pair&&<p className="pool-rule">These players or the admin can start this game.</p>}</>}
 </article>;
}
function PoolScoreForm({match,person,busy,onSubmit,onCancel,label='Save correction',revision}){
 const [originalRevision]=useState(revision);
 const [finish,setFinish]=useState(match.blackFoul?'foul':match.blackBall?'black':'score'),[a,setA]=useState(match.scoreA??''),[b,setB]=useState(match.scoreB??''),[winner,setWinner]=useState(match.winner||'');
 const automatic=normalPoolWinner(match,a,b);
 return <form className="pool-online-score" onSubmit={e=>{e.preventDefault();onSubmit({finish,scoreA:a,scoreB:b,winner:finish==='score'?automatic:winner,...(originalRevision===undefined?{}:{revision:originalRevision})});}}><label>Finish<select value={finish} onChange={e=>setFinish(e.target.value)}><option value="score">Normal game</option><option value="foul">Black-ball foul · 7–0</option><option value="black">Both on black · 0–0</option></select></label>{finish==='score'?<div className="pool-score-grid">{[[match.a,a,setA],[match.b,b,setB]].map(([id,value,set])=><label key={id}>{person(id)}<input type="number" inputMode="numeric" min="0" max="7" required value={value} onChange={e=>set(e.target.value)}/></label>)}</div>:<label>Winner<select value={winner} onChange={e=>setWinner(e.target.value)} required><option value="">Choose winner</option>{[match.a,match.b].map(id=><option key={id} value={id}>{person(id)}</option>)}</select></label>}{automatic&&finish==='score'&&<p className="pool-rule">Winner: {person(automatic)}</p>}<div className="pool-buttons"><button disabled={busy||(finish==='score'?!automatic:!winner)}>{busy?'Saving…':label}</button><button type="button" className="pool-secondary" onClick={onCancel}>Cancel</button></div></form>;
}
function OnlineResult({match,revision,person,owner,busy,send}){
 const [editing,setEditing]=useState(false);
 return <article className="pool-shared-result"><div className="pool-result-top"><span>Table {match.table}</span><span className={match.verification==='verified'?'pool-verified':'pool-pending'}>{match.verification==='verified'?'✓ Verified':'Awaiting verification'}</span></div><div className="pool-score-line"><strong>{person(match.a)}</strong><b>{match.scoreA} : {match.scoreB}</b><strong>{person(match.b)}</strong></div><p className="pool-rule">{person(match.winner)} wins{match.blackFoul?' · Black-ball foul':match.blackBall?' · Both on black':''}</p>{owner&&!editing&&<div className="pool-buttons">{match.verification==='pending'&&<button disabled={busy} onClick={()=>send('verify',{matchId:match.id})}>Verify score</button>}<button className="pool-secondary" disabled={busy} onClick={()=>setEditing(true)}>Correct</button></div>}{editing&&<PoolScoreForm match={match} revision={revision} person={person} busy={busy} onCancel={()=>setEditing(false)} onSubmit={result=>{send('correct',{matchId:match.id,...result});setEditing(false);}}/>}</article>;
}
function OnlineSettings({pool,revision,busy,send}){
 const [originalRevision]=useState(revision);
 const [tables,setTables]=useState(pool.tables),[coins,setCoins]=useState(coinsLeft(pool)),[mode,setMode]=useState(pool.mode);
 return <section className="pool-entry-card"><h2>Night setup</h2><form onSubmit={e=>{e.preventDefault();send('settings',{tables:Number(tables),coins:Number(coins),mode,revision:originalRevision});}}><div className="pool-score-grid"><label>Tables<input type="number" min="1" max="20" value={tables} onChange={e=>setTables(e.target.value)} required/></label><label>Unused coins<input type="number" min="0" max="10000" value={coins} onChange={e=>setCoins(e.target.value)} required/></label></div><label>Game format<select value={mode} onChange={e=>setMode(e.target.value)}><option value="rotation">Fair fixtures</option><option value="winner">Winner stays</option></select></label><button disabled={busy}>Save setup</button></form><p className="pool-rule">One coin per game. Cancelled games return their reserved coin; adjust unused coins if it was already spent.</p></section>;
}
