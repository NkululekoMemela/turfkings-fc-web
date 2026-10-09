import React,{useMemo,useState} from 'react';
import {POOL_STORAGE_KEY,emptyPool,poolStandings,poolResult,nextPoolPair,poolMatchBadges} from '../core/poolTable.mjs';
import './PoolTablePage.css';
const MASCOTS=Array.from({length:8},(_,i)=>`warrior-${String(i+1).padStart(2,'0')}`);
const SHIRTS=['#24a46d','#2563eb','#dc3545','#f3f4f6','#171717','#f5bf26','#9333ea','#f97316'];
const HAIR=['#211b18','#65402a','#c89645','#d2d4d8','#a74128'];
function normalizeMascots(pool){return {...pool,players:pool.players.map((p,i)=>({...p,mascot:MASCOTS.includes(p.mascot)?p.mascot:MASCOTS[i%8],shirt:SHIRTS.includes(p.shirt)?p.shirt:SHIRTS[i%SHIRTS.length],hairColor:HAIR.includes(p.hairColor)?p.hairColor:HAIR[i%HAIR.length],hairStyle:p.hairStyle==='bald'?'bald':'hair'}))};}

function loadPool(){try{const v=JSON.parse(localStorage.getItem(POOL_STORAGE_KEY));if(v?.version===1&&Array.isArray(v.players)&&Array.isArray(v.matches))return normalizeMascots(v);}catch{}return emptyPool();}
export default function PoolTablePage({onBack}){
 const [pool,setPool]=useState(loadPool),[name,setName]=useState(''),[a,setA]=useState(''),[b,setB]=useState('');
 const [scoreA,setScoreA]=useState(''),[scoreB,setScoreB]=useState(''),[winner,setWinner]=useState(''),[black,setBlack]=useState(false),[foul,setFoul]=useState(false),[error,setError]=useState(''),[mascotPlayer,setMascotPlayer]=useState('');
 const standings=useMemo(()=>poolStandings(pool.players,pool.matches),[pool]);
 const mode=pool.mode || 'rotation';
 const nextPair=useMemo(()=>nextPoolPair(pool.players,pool.matches,mode),[pool.players,pool.matches,mode]);
 const matchBadges=useMemo(()=>poolMatchBadges(pool.players,pool.matches),[pool.players,pool.matches]);
 const player=id=>pool.players.find(p=>p.id===id)?.name||'Player';
 const mascot=id=>pool.players.find(p=>p.id===id)?.mascot || 'warrior-01';
 const PlayerName=({id})=><span className="pool-player-identity"><span className="pool-avatar" aria-hidden="true"><WarriorAvatar code={mascot(id)} appearance={pool.players.find(p=>p.id===id)}/></span><span>{player(id)}</span></span>;

 function save(next){try{localStorage.setItem(POOL_STORAGE_KEY,JSON.stringify(next));setPool(next);setError('');return true;}catch{setError('This device could not save the session. Free storage or allow local storage and try again.');return false;}}
 function updateAppearance(key,value){save({...pool,players:pool.players.map(p=>p.id===mascotPlayer?{...p,[key]:value}:p)});}
 function add(e){e.preventDefault();const clean=name.trim().replace(/\s+/g,' ').slice(0,40);if(!clean)return;if(pool.players.some(p=>p.name.toLowerCase()===clean.toLowerCase())){setError('That player is already at the table.');return;}if(save({...pool,players:[...pool.players,{id:crypto.randomUUID(),name:clean,mascot:MASCOTS[pool.players.length%8],shirt:SHIRTS[pool.players.length%SHIRTS.length],hairColor:HAIR[pool.players.length%HAIR.length],hairStyle:'hair'} ]}))setName('');}
 function renamePlayer(id){const previous=player(id),answer=window.prompt('Correct player name:',previous);if(answer===null)return;const clean=answer.trim().replace(/\s+/g,' ').slice(0,40);if(!clean){setError('Enter a player name.');return;}if(pool.players.some(p=>p.id!==id&&p.name.toLowerCase()===clean.toLowerCase())){setError('That player is already at the table.');return;}save({...pool,players:pool.players.map(p=>p.id===id?{...p,name:clean}:p)});}
 function deletePlayer(id){const count=pool.matches.filter(m=>m.a===id||m.b===id).length;const active=pool.challenge&&(pool.challenge.a===id||pool.challenge.b===id);if(!window.confirm(`Delete ${player(id)}?${count?` Their ${count} recorded game(s) will also be removed and everyone's standings recalculated.`:''}${active?' Their active challenge will be cancelled.':''} Rename instead if only the name is wrong.`))return;if(save({...pool,players:pool.players.filter(p=>p.id!==id),matches:pool.matches.filter(m=>m.a!==id&&m.b!==id),challenge:active?null:pool.challenge})){if(a===id)setA('');if(b===id)setB('');if(mascotPlayer===id)setMascotPlayer('');}}
 function start(e){e.preventDefault();const a=nextPair?.a,b=nextPair?.b;if(!a||!b||a===b){setError('Choose two different players.');return;}if(save({...pool,challenge:{id:crypto.randomUUID(),a,b,createdAt:Date.now()}})){setScoreA('');setScoreB('');setWinner('');setBlack(false);setFoul(false);}}
 function switchMode(next){if(next===mode)return;if(window.confirm(`Switch to ${next==='winner'?'Winner stays':'Fair fixtures'}? ${pool.challenge?'The current game will finish with the same players. The new system applies to the next game.':'The next pairing will be recalculated.'}`))save({...pool,mode:next});}
 function record(e){e.preventDefault();try{const result=poolResult(pool.challenge,scoreA,scoreB,winner,black,foul);save({...pool,matches:[...pool.matches,{...result,finishedAt:Date.now()}],challenge:null});}catch(e){setError(e.message);}}
 return <main className="pool-page"><div className="pool-shell">
 <header className="pool-header"><button className="pool-back" onClick={onBack} aria-label="Back to Welcome">↶</button><span className="pool-ball" aria-hidden="true"><i>8</i></span><div><small>THE SIDE TABLE</small><h1>Pool Table</h1></div><span className="pool-session">LOCAL SESSION</span></header>
 <section className="pool-intro"><span className="pool-eyebrow">A LITTLE FRIENDLY COMPETITION</span><h2>Call your challenger.<br/><em>Own the table.</em></h2><p>Quick games. Familiar faces. Every win remembered.</p></section>
 <p className="pool-storage-note">Saved on this device and browser. Players share this scorekeeper; challenges do not send online invitations.</p>
 {error&&<p className="pool-error" role="alert">{error}</p>}
 <div className="pool-grid"><section className="pool-card"><div className="pool-card-title"><h2>At the table</h2><span>{pool.players.length} players</span></div><form onSubmit={add} className="pool-add"><label className="pool-sr" htmlFor="pool-name">Player name</label><input id="pool-name" placeholder="Add a player’s name" value={name} maxLength={40} onChange={e=>setName(e.target.value)} required/><button>Add player</button></form><div className="pool-roster">{pool.players.map(p=><div className="pool-player-chip" key={p.id}><button type="button" className="pool-avatar pool-avatar-button" aria-label={`Change mascot for ${p.name}`} title="Change mascot" onClick={()=>setMascotPlayer(p.id)}><WarriorAvatar code={p.mascot} appearance={p}/></button><span>{p.name}</span><button type="button" className="pool-player-action" aria-label={`Rename ${p.name}`} onClick={()=>renamePlayer(p.id)}>✎</button><button type="button" className="pool-player-action" aria-label={`Delete ${p.name}`} onClick={()=>deletePlayer(p.id)}>×</button></div>)}</div>{mascotPlayer&&pool.players.some(p=>p.id===mascotPlayer)&&<div className="pool-mascot-edit"><label>Warrior for {player(mascotPlayer)}<PoolSelect label="Choose your warrior" value={mascot(mascotPlayer)} onChange={e=>updateAppearance('mascot',e.target.value)}>{MASCOTS.map(m=><option key={m} value={m} data-label={`Warrior ${Number(m.split('-')[1])}`}><span className="pool-warrior-choice"><WarriorAvatar code={m} appearance={pool.players.find(p=>p.id===mascotPlayer)}/><span>Warrior {Number(m.split('-')[1])}</span></span></option>)}</PoolSelect></label><fieldset className="pool-colour-options"><legend>T-shirt colour</legend>{SHIRTS.map((c,i)=><button type="button" key={c} style={{background:c}} aria-label={['Green','Blue','Red','White','Black','Yellow','Purple','Orange'][i]} aria-pressed={pool.players.find(p=>p.id===mascotPlayer)?.shirt===c} onClick={()=>updateAppearance('shirt',c)}/>)}</fieldset><label>Hair<PoolSelect label="Hair or bald" value={pool.players.find(p=>p.id===mascotPlayer)?.hairStyle||'hair'} onChange={e=>updateAppearance('hairStyle',e.target.value)}><option value="hair">Hair</option><option value="bald">Bald</option></PoolSelect></label>{pool.players.find(p=>p.id===mascotPlayer)?.hairStyle!=='bald'&&<fieldset className="pool-colour-options"><legend>Hair colour</legend>{HAIR.map((c,i)=><button type="button" key={c} style={{background:c}} aria-label={['Black','Brown','Blond','Grey','Auburn'][i]} aria-pressed={pool.players.find(p=>p.id===mascotPlayer)?.hairColor===c} onClick={()=>updateAppearance('hairColor',c)}/>)}</fieldset>}<button type="button" className="pool-secondary" onClick={()=>setMascotPlayer('')}>Done</button></div>}{!pool.players.length&&<p>Add yourself and a friend to start.</p>}</section>
 <section className="pool-card"><div className="pool-mode-toggle" role="group" aria-label="Pool rotation system"><button type="button" aria-pressed={mode==='rotation'} onClick={()=>switchMode('rotation')}>Fair fixtures</button><button type="button" aria-pressed={mode==='winner'} onClick={()=>switchMode('winner')}>Winner stays</button></div><p className="pool-rule">{mode==='winner'?'The winner keeps the table. Waiting challengers take turns.':pool.players.length===4?'Both previous players rest. With four players this alternates the same two pairs.':pool.players.length===3?'The waiting player plays next. With three players, one player must play consecutive games.':'The next pair is picked automatically, giving waiting players their turn and resting the previous pair when possible.'}</p><h2>{pool.challenge?'Match on the table':'Next challenger'}</h2>
 {pool.challenge?<form onSubmit={record}><div className="pool-versus"><strong><PlayerName id={pool.challenge.a}/></strong><span>VS</span><strong><PlayerName id={pool.challenge.b}/></strong></div>{!foul && !black && <div className="pool-score-grid"><label><PlayerName id={pool.challenge.a}/> · balls potted<input disabled={foul} type="number" min="0" max="7" step="1" value={scoreA} onChange={e=>setScoreA(e.target.value)} required={!foul && !black}/></label><label><PlayerName id={pool.challenge.b}/> · balls potted<input disabled={foul} type="number" min="0" max="7" step="1" value={scoreB} onChange={e=>setScoreB(e.target.value)} required={!foul && !black}/></label></div>}<label>{foul ? "Winner (opponent of the player who fouled)" : "Winner"}<PoolSelect label="Winner" required value={winner} onChange={e=>setWinner(e.target.value)}><option value="">Choose the winner</option>{[pool.challenge.a,pool.challenge.b].map(id=><option key={id} value={id} data-label={player(id)}>{<span className="pool-warrior-choice"><WarriorAvatar code={mascot(id)} appearance={pool.players.find(p=>p.id===id)}/><span>{player(id)}</span></span>}</option>)}</PoolSelect></label><label>How did the game end?<PoolSelect label="Game finish" value={foul?'foul':black?'black':'score'} onChange={e=>{setFoul(e.target.value==='foul');setBlack(e.target.value==='black');}}><option value="foul" data-detail="The opponent wins 7–0. Earlier ball scores are replaced; the difference counts.">Black-ball foul · opponent wins 7–0</option><option value="score" data-detail="Record the winner and count the coloured-ball score difference.">Full normal match</option><option value="black" data-detail="Both players reached the black ball. Scores are filled as 0–0; only the win counts.">Both players played black</option></PoolSelect></label><p className="pool-rule">{foul?'The player who fouled loses 0–7. Earlier ball scores are replaced, and the ±7 difference counts.':black?'A win and a 0–0 score are recorded automatically. This match adds zero ball difference.':'A win and the coloured-ball difference are recorded.'} Count only coloured balls, not the black ball. Select the match winner.</p><div className="pool-buttons"><button>Record result</button><button type="button" className="pool-secondary" onClick={()=>{if(window.confirm('Cancel this challenge without recording a result?'))save({...pool,challenge:null});}}>Cancel challenge</button></div></form>:<form onSubmit={start}>{nextPair?<div className="pool-versus"><strong><PlayerName id={nextPair.a}/></strong><span>VS</span><strong><PlayerName id={nextPair.b}/></strong></div>:<p>Add at least two players to generate the next game.</p>}<button disabled={!nextPair}>Start next game ↗</button></form>}
 </section></div>
 <section className="pool-card pool-leaderboard"><div className="pool-card-title"><h2>The standings</h2><span>{pool.matches.length} games recorded</span></div><p className="pool-rule">Ranked by wins, then ball difference. When both players played black, the winner gets a win with zero ball difference. Fouls count as 7–0.</p><div className="pool-table-scroll"><table><thead><tr><th>#</th><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th><th>Balls</th><th>Difference</th></tr></thead><tbody>{standings.map((p,i)=><tr key={p.id}><td>{i+1}</td><th scope="row"><PlayerName id={p.id}/>{p.badges && <span className="pool-streak-badges pool-streak-badges--below" title={`Current streak: ${p.streak}. Best streak: ${p.bestStreak}.`} aria-label={`Current win streak ${p.streak}; best streak ${p.bestStreak}`}>{p.badges}</span>}</th><td>{p.played}</td><td className="pool-wins">{p.wins}</td><td>{p.losses}</td><td>{p.ballsFor} / {p.ballsAgainst}</td><td>{p.difference>0?'+':''}{p.difference}</td></tr>)}</tbody></table></div>{!standings.length&&<p>Your first players will appear here.</p>}</section>
 <details className="pool-card pool-recent-games"><summary><h2>Recent games</h2><span>{pool.matches.length} games <span className="pool-recent-chevron" aria-hidden="true">⌄</span></span></summary><div className="pool-recent-content">{pool.matches.slice().reverse().map(m=><div className="pool-result" key={m.id}><div><strong><PlayerName id={m.winner}/> won{matchBadges[m.id] && <span className="pool-streak-badges pool-streak-badges--below" aria-label="Streak awards">{matchBadges[m.id]}</span>}</strong><p><PlayerName id={m.a}/> {m.scoreA}–{m.scoreB} <PlayerName id={m.b}/> · {m.blackFoul?'Black-ball foul · 7–0 awarded':m.blackBall?'Both played black · zero difference':'Ball difference counted'}</p></div><button className="pool-secondary" onClick={()=>{if(window.confirm('Remove this result and recalculate the standings?'))save({...pool,matches:pool.matches.filter(x=>x.id!==m.id)});}}>Undo</button></div>)}{!pool.matches.length&&<p>Record a game to begin your series.</p>}</div></details>
 <section className="pool-card pool-rack-card"><span className="pool-eyebrow">READY FOR THE NEXT GAME</span><h2>Rack them up.</h2><PoolRack/><p className="pool-rule">Ready to break. The cue ball sits at the other end.</p></section>
 </div></main>;
}

function PoolRack(){
 const balls=[
 {n:1,c:'#f1c429'},
 {n:3,c:'#d53737'},{n:9,c:'#f1c429'},
 {n:2,c:'#f1c429'},{n:8,c:'#111820'},{n:10,c:'#d53737'},
 {n:4,c:'#d53737'},{n:11,c:'#f1c429'},{n:5,c:'#d53737'},{n:12,c:'#f1c429'},
 {n:6,c:'#f1c429'},{n:13,c:'#d53737'},{n:7,c:'#d53737'},{n:14,c:'#f1c429'},{n:15,c:'#d53737'}
 ];
 let index=0;const placed=[];
 for(let row=0;row<5;row++)for(let col=0;col<=row;col++)placed.push({...balls[index++],x:250+(col-row/2)*27,y:120+row*24});
 return <svg viewBox="0 0 500 320" role="img" aria-label="Green pool table with fifteen numbered balls in a triangle, black eight in the centre and a cue ball at the other end" className="pool-rack-visual">
 <defs><linearGradient id="fanm-pool-wood" x2="0" y2="1"><stop stopColor="#513627"/><stop offset="1" stopColor="#251b18"/></linearGradient><radialGradient id="fanm-pool-felt"><stop stopColor="#287b58"/><stop offset="1" stopColor="#105033"/></radialGradient></defs>
 <rect x="16" y="12" width="468" height="296" rx="28" fill="url(#fanm-pool-wood)" stroke="#8b7150" strokeWidth="3"/>
 <rect x="40" y="34" width="420" height="252" rx="15" fill="url(#fanm-pool-felt)" stroke="#123c2c" strokeWidth="8"/>
 {[ [42,36],[250,32],[458,36],[42,284],[250,288],[458,284] ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="12" fill="#06100d" stroke="#826847" strokeWidth="2"/>)}
 <path d="M52 230H448" stroke="#8fc0a0" strokeOpacity=".4" strokeDasharray="4 6"/>
 <circle cx="250" cy="255" r="11" fill="#f7f5eb" stroke="#d7d5cb"/><ellipse cx="246" cy="251" rx="4" ry="3" fill="#fff"/>
 <path d="M250 101L327 235H173Z" fill="none" stroke="#bea170" strokeWidth="5" strokeLinejoin="round"/>
 {placed.map(ball=><g key={ball.n}><circle cx={ball.x+1} cy={ball.y+2} r="13" fill="#071c13" opacity=".5"/><circle cx={ball.x} cy={ball.y} r="12" fill={ball.c==='#d53737'?'#f5f3e9':ball.c}/>{ball.c==='#d53737'&&<path d={`M${ball.x-11} ${ball.y-5} Q${ball.x} ${ball.y-10} ${ball.x+11} ${ball.y-5} L${ball.x+11} ${ball.y+5} Q${ball.x} ${ball.y+10} ${ball.x-11} ${ball.y+5}Z`} fill={ball.c}/>}<circle cx={ball.x} cy={ball.y} r="6.5" fill="#fff"/><text x={ball.x} y={ball.y+3} textAnchor="middle" fill="#111" fontSize="8" fontWeight="800">{ball.n}</text><ellipse cx={ball.x-5} cy={ball.y-6} rx="3" ry="2" fill="#fff" opacity=".5"/></g>)}
 </svg>;
}

function PoolSelect({value,onChange,children,label,required}) {
 const options=React.Children.toArray(children).map(child=>({value:child.props.value,label:child.props.children,text:child.props['data-label'] || child.props.children,detail:child.props['data-detail'],disabled:child.props.disabled || required && child.props.value===''}));
 const selected=options.find(option=>option.value===value);
 const [open,setOpen]=useState(false);
 const trigger=React.useRef(null),dialog=React.useRef(null),id=React.useId();
 React.useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement;
  const root=dialog.current;
  const choice=root?.querySelector('[data-selected="true"]') || root?.querySelector('button:not([disabled])');choice?.focus();
  const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  function keydown(event){
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);return;}
   const buttons=Array.from(root.querySelectorAll('button:not([disabled])'));
   const index=buttons.indexOf(document.activeElement);
   if(['Tab','ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();let next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index+(event.key==='ArrowUp'||event.shiftKey?-1:1);
    buttons[(next+buttons.length)%buttons.length]?.focus();
   }
  }
  document.addEventListener('keydown',keydown,true);
  return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',keydown,true);if(previous?.isConnected)previous.focus();else trigger.current?.focus();};
 },[open]);
 return <><button ref={trigger} type="button" className="pool-select-trigger" aria-label={`${label}: ${selected?.text || 'Choose'}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(true)}><span>{selected?.label || 'Choose'}</span><span aria-hidden="true">⌄</span></button>
 {open&&<div className="pool-picker-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}><div ref={dialog} id={id} className="pool-picker" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}><div className="pool-picker-heading"><div><small>POOL TABLE</small><h2 id={`${id}-title`}>{label}</h2></div><button type="button" className="pool-picker-close" aria-label="Close choices" onClick={()=>setOpen(false)}>×</button></div><div className="pool-picker-options">{options.filter(option=>!option.disabled).map(option=><button key={option.value} type="button" className="pool-picker-option" data-selected={option.value===value} onClick={()=>{onChange({target:{value:option.value}});setOpen(false);}}><span><strong>{option.label}</strong>{option.detail&&<small>{option.detail}</small>}</span><span className="pool-picker-radio" aria-hidden="true">{option.value===value?'✓':''}</span></button>)}</div></div></div>}</>;
}

function WarriorAvatar({code,appearance={}}){
 const n=Math.max(0,(Number(String(code).split('-')[1])||1)-1),helmet=n%6,beard=n%4;
 const shirt=appearance.shirt||SHIRTS[n%8],hair=appearance.hairColor||HAIR[n%5],bald=appearance.hairStyle==='bald';
 return <svg viewBox="0 0 80 80" className="pool-warrior-svg" aria-hidden="true" focusable="false">
 <rect width="80" height="80" rx="18" fill="#102920"/>
 <path d="M9 80Q11 61 27 59H53Q69 61 71 80" fill={shirt} stroke="#83958b" strokeWidth="2"/>
 <path d="M25 65L40 76L55 65M20 72L25 80M60 72L55 80" fill="none" stroke="#9fb2a8" strokeWidth="2"/>
 <path d="M33 51H47V65L40 70L33 65Z" fill="#b98561"/>
 <ellipse cx="23" cy="38" rx="5" ry="7" fill="#cda17c"/><ellipse cx="57" cy="38" rx="5" ry="7" fill="#cda17c"/>
 <path d="M24 25Q40 12 56 25V42Q54 58 40 61Q26 58 24 42Z" fill="#d7ab83" stroke="#93684e" strokeWidth="1.2"/>
 <path d={n%2?'M29 34L36 33M44 33L51 34':'M29 33L36 35M44 35L51 33'} stroke="#40382e" strokeWidth="2.6" strokeLinecap="round"/>
 <path d="M30 38H35M45 38H50" stroke="#202d28" strokeWidth="2.4" strokeLinecap="round"/>
 <path d="M40 37L37 46H42" fill="none" stroke="#a16f50" strokeWidth="1.6"/>
 <path d="M35 51Q40 53 45 51" fill="none" stroke="#815239" strokeWidth="1.8" strokeLinecap="round"/>
 {!bald&&<path d="M24 30L27 27V36L24 39ZM56 30L53 27V36L56 39Z" fill={hair}/>}
 {beard===1&&<path d="M27 45Q29 57 40 59Q51 57 53 45L48 49L44 55H36L32 49Z" fill={hair}/>}
 {beard===2&&<><path d="M32 49L39 47L40 49L41 47L48 49L45 52L40 50L35 52Z" fill={hair}/><path d="M35 55L40 65L45 55Z" fill={hair}/></>}
 {beard===3&&<path d="M28 49Q29 59 40 64Q51 59 52 49L46 53H34Z" fill={hair}/>}
 {!bald&&helmet===0&&<><path d="M21 30Q20 10 40 8Q60 10 59 30L52 25H28Z" fill="#647a74" stroke="#afc1b4" strokeWidth="2"/><path d="M40 8V28M25 19H55" stroke="#c8c5a6" strokeWidth="3"/></>}
 {!bald&&helmet===1&&<><path d="M21 30V22Q23 9 40 8Q57 9 59 22V30L51 24H29Z" fill="#697a77" stroke="#b8c4b9" strokeWidth="2"/><path d="M37 8L38 3H43L44 8M22 27L20 46L27 49L29 27M58 27L60 46L53 49L51 27" fill="#405c54" stroke="#a9b7aa" strokeWidth="1.5"/></>}
 {!bald&&helmet===2&&<><path d="M23 29Q21 10 39 10Q58 10 57 29L49 23L30 24Z" fill={hair}/><path d="M24 25H56V31H24Z" fill="#9da58d"/><path d="M40 10L35 3H45L42 10" fill="#859e87"/><path d="M40 25L44 28L40 31L36 28Z" fill="#d5ccb0"/></>}
 {!bald&&helmet===3&&<><path d="M20 31Q20 7 40 6Q60 7 60 31L51 23H29Z" fill="#526d64" stroke="#b9c6b6" strokeWidth="2"/><path d="M19 26L10 20L14 10L24 17M61 26L70 20L66 10L56 17" fill="#c6c3a4" stroke="#7f8a74" strokeWidth="2"/><path d="M40 7V29" stroke="#c6c3a4" strokeWidth="4"/></>}
 {!bald&&helmet===4&&<><path d="M22 30Q22 10 40 9Q58 10 58 30L51 24H29Z" fill={hair}/><path d="M20 24Q40 15 60 24V31Q40 24 20 31Z" fill="#617d65" stroke="#aaba9a" strokeWidth="2"/><path d="M37 20L40 14L43 20L40 26Z" fill="#d1c6a1"/></>}
 {!bald&&helmet===5&&<><path d="M22 30Q20 12 40 9Q59 12 58 30L50 24L44 28L39 21L28 27Z" fill={hair}/><path d="M23 20L27 13L35 11M47 12L54 17" stroke="#777967" strokeWidth="2"/><path d="M24 28H56" stroke="#b5b396" strokeWidth="3"/></>}
 {n%3===0&&<path d="M48 39L52 46" stroke="#a2694b" strokeWidth="1.5"/>}
 </svg>;
}
