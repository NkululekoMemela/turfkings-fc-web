import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {getDocs} from 'firebase/firestore';
import {db,auth} from '../firebaseConfig.js';
import {toPng} from 'html-to-image';
import {getPlayerPhotosCollection} from '../core/clubFirestorePaths.js';
import {indexPlayerPortraits,resolvePlayerPortrait} from '../core/playerPortrait.mjs';
import {buildFieldMatchReport} from '../core/fieldMatchReport.mjs';
import CompactPlayerNumber from './CompactPlayerNumber.jsx';
import './FieldMatchReport.css';
function Player({player,photos={}}){
 const [failed,setFailed]=useState('');
 const image=player.photoData||resolvePlayerPortrait(player.playerId||player.name,[{id:player.playerId,fullName:player.name}],photos);
 const icons=player.decor?.icons||{},rating=player.decor?.rating;
 const [firstName,...surname]=String(player.name||'').trim().split(/\s+/);
 const badges=[
  icons.goals?{key:'goals',label:'Goals',text:`⚽ ${icons.goals}`}:null,
  icons.assists?{key:'assists',label:'Assists',text:`👟 ${icons.assists}`}:null,
  icons.yellowCards?{key:'yellow',label:'Yellow cards',text:icons.yellowCards>1?`🟨 ${icons.yellowCards}`:"🟨"}:null,
  icons.redCards?{key:'red',label:'Red cards',text:icons.redCards>1?`🟥 ${icons.redCards}`:"🟥"}:null,
  icons.injuryStatus?{key:'injury',label:icons.injuryStatus==='injury_sitting_out'?'Injured, sitting out':'Injury',text:icons.injuryStatus==='injury_sitting_out'?'🤕':'🩹'}:null,
 ].filter(Boolean);

 return <div className="field-match-report__player-content">
  <span className="field-match-report__portrait">{image&&image!==failed?<img src={image} alt="" onError={()=>setFailed(image)}/>:<span aria-hidden="true">{player.name.split(/\s+/).map(n=>n[0]).slice(0,2).join('')}</span>}
   {rating!=null&&<b className={`field-match-report__rating ${rating>9?'is-excellent':rating<5?'is-low':rating>=7?'is-good':''}`}>{Number(rating).toFixed(1)}</b>}
  </span>
  {!!badges.length&&<span className="field-match-report__badges" aria-label={badges.map(b=>`${b.label}: ${b.text}`).join(', ')}>{badges.filter(b=>!['yellow','red'].includes(b.key)).map(b=><span key={b.key} title={b.label} className={`field-match-report__event is-${b.key}`}>{b.text}</span>)}{badges.some(b=>['yellow','red'].includes(b.key))&&<span className="field-match-report__event is-cards">{badges.filter(b=>['yellow','red'].includes(b.key)).map(b=><span key={b.key} title={b.label}>{b.text}</span>)}</span>}</span>}
  <span className="field-match-report__name" title={player.name}><span><CompactPlayerNumber number={player.number} disabled name={player.name}/>{firstName}</span>{surname.length>0&&<span>{surname.join(' ')}</span>}</span>
 </div>;
}
export default function FieldMatchReport({season,resultId,teams=[],venueId,onShareReport,onStandings,onHighlights,onClose}){
 const model=useMemo(()=>buildFieldMatchReport({season,resultId}),[season,resultId]);
 const [photos,setPhotos]=useState({}),[photoError,setPhotoError]=useState(false);
 const close=useRef(null),dialog=useRef(null),capture=useRef(null);
 const [sharing,setSharing]=useState(false),[shareError,setShareError]=useState('');
 async function attachToChat(){
  if(sharing||!model||!venueId||!onShareReport)return;
  const user=auth.currentUser;
  if(!user?.emailVerified){setShareError('Sign in with your verified account to attach.');return;}
  setSharing(true);setShareError('');
  try{
   await document.fonts?.ready;
   const clone=capture.current.cloneNode(true);
   clone.style.cssText+=';position:fixed;left:-10000px;top:0;width:'+capture.current.offsetWidth+'px;height:'+ (capture.current.offsetHeight+52)+'px';
   clone.querySelector('.field-match-report__capture-score').style.display='block';
   const topBand=clone.querySelector('.field-match-report__team');if(topBand)topBand.style.top='55px';
   const host=document.createElement('div');host.className='field-match-report';host.style.cssText='position:fixed;left:-10000px;top:0';host.appendChild(clone);document.body.appendChild(host);
   let imageData;try{imageData=await toPng(clone,{cacheBust:false,pixelRatio:1,backgroundColor:'#020617',skipFonts:true});}finally{host.remove();}
   if(auth.currentUser?.uid!==user.uid)throw Error('Your account changed. Reopen this match.');
   if(imageData.length>1300000)throw Error('Image too large. Please try again.');
   onShareReport({kind:'formation',clipId:crypto.randomUUID(),venueId,environment:'official',ownerUid:user.uid,matchId:`formation__${season.id}__${resultId}`,title:`${model.sides[0].name} ${model.result.goalsA}–${model.result.goalsB} ${model.sides[1].name} · Match ratings`,imageData});
   onClose();
  }catch(error){setShareError(error.message||'Could not attach this match.');}
  finally{setSharing(false);}
 }
 useEffect(()=>{const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus();
  const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button,[href],input,select,textarea,[tabindex="0"]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus?.();};
 },[onClose]);
 const ids=model?.sides.map(s=>s.clubId).join('|')||'';
 useEffect(()=>{let stopped=false;setPhotos({});setPhotoError(false);
  Promise.all(ids.split('|').filter(Boolean).map(async id=>{try{const snap=await getDocs(getPlayerPhotosCollection(db,id));return [id,indexPlayerPortraits(snap.docs.map(d=>({id:d.id,data:d.data()})))];}catch{if(!stopped)setPhotoError(true);return [id,{}];}})).then(entries=>{if(!stopped)setPhotos(Object.fromEntries(entries));});return()=>{stopped=true;};
 },[ids]);
 const identity=side=>teams.find(t=>t.id===side.clubId)||{};
 const band=side=>{const team=identity(side),logo=team.transparentLogoUrl||team.branding?.logoUrl||team.logoUrl||team.logo;return <div className="field-match-report__team"><strong>{typeof logo==="string"&&logo&&<img src={logo} alt="" onError={e=>{e.currentTarget.style.display="none";}}/>}{side.name}</strong><span>{side.formationId||'Recorded lineup'}</span></div>;};
 const scoreline=model?(<div className="field-match-report__score">{[0,1].map((index)=><React.Fragment key={index}>{index===1&&<strong>{model.result.goalsA} – {model.result.goalsB}<small>FULL TIME</small></strong>}<span className="field-match-report__score-side"><span>{model.sides[index].name}</span>{(()=>{const t=identity(model.sides[index]);const logo=t.transparentLogoUrl||t.branding?.logoUrl||t.logoUrl||t.logo;return typeof logo==='string'&&logo?<img src={logo} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>:null;})()}</span></React.Fragment>)}</div>):null;
 return createPortal(<div className="field-match-report__overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} className="field-match-report" role="dialog" aria-modal="true" aria-labelledby="field-match-report-title">
  <div className="field-match-report__sticky"><header><h2 id="field-match-report-title">Match lineups</h2><div className="field-match-report__tools">{onStandings&&<button type="button" className="field-match-report__standings" onClick={()=>{onClose();onStandings();}}>Standings</button>}{onHighlights&&model&&<button type="button" className="field-match-report__highlights" onClick={()=>{onClose();onHighlights(model.result.fixtureId||resultId);}}>Highlights</button>}{onShareReport&&venueId&&<button type="button" aria-label="Attach match recap to chat" title="Attach match recap to chat" disabled={sharing} onClick={attachToChat}>{sharing?'…':'💬'}</button>}<button ref={close} type="button" onClick={onClose} aria-label="Close match lineups">×</button></div></header>{scoreline}</div>
  {shareError&&<p role="alert" className="field-match-report__share-error">{shareError}</p>}
  {!model?<p>This match result is no longer available.</p>:<>
   <div className="field-match-report__capture" ref={capture}>
   <div className="field-match-report__capture-score" aria-hidden="true">{scoreline}</div>
   {band(model.sides[0])}
   <div className="field-match-report__pitch" aria-label="Full pitch with both recorded team lineups">
    <div className="field-match-report__half-line"/><div className="field-match-report__centre"/><div className="field-match-report__box is-top"/><div className="field-match-report__box is-bottom"/>
    {model.sides.map((side,index)=><React.Fragment key={side.clubId}>{side.hasSnapshot?side.players.map(p=><div key={p.slotId} className="field-match-report__player" style={{left:`${p.x}%`,top:`${p.y}%`}}><Player player={p} photos={photos[side.clubId]}/></div>):<p className="field-match-report__missing" style={{top:index===0?'22%':'72%'}}>No lineup was recorded for {side.name}.</p>}</React.Fragment>)}
   </div>
   {band(model.sides[1])}
   </div>
   <div className="field-match-report__details"><div className="field-match-report__benches">{model.sides.map(side=><section key={side.clubId}><h3>{side.name} · Substitutes</h3>{side.bench.length?side.bench.map(p=><Player key={p.playerId||p.name} player={p} photos={photos[side.clubId]}/>):<p>No substitutes recorded.</p>}</section>)}</div>
   <p className="field-match-report__note">Recorded match lineups · Final player ratings and match statistics.{photoError?' Some player photos are unavailable.':''}</p></div>
  </>}
 </section></div>,document.body);
}
