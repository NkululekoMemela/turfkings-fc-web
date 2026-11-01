import React,{useEffect,useRef,useState} from "react";
import {fieldRecentResults} from "../core/fieldResultsStrip.mjs";
import {buildClubIdentity,DEFAULT_PLATFORM_LOGO} from "../core/clubIdentity.js";
import "./FieldResultsStrip.css";

function ResultBadge({team,name}){
 const logo=team?.transparentLogoUrl||team?.logoUrl||team?.logo||"";
 const [failed,setFailed]=useState("");
 return <span className="field-results-strip__badge" aria-hidden="true">
  {logo&&failed!==logo?<img src={logo} alt="" loading="lazy" width="38" height="38" onError={()=>setFailed(logo)}/>:<span>{name.split(/\s+/).filter(Boolean).map(word=>word[0]).join("").slice(0,3).toUpperCase()}</span>}
 </span>;
}
const short=(team,name)=>String(team?.shortName||name).length<=6?String(team?.shortName||name).toUpperCase():name.split(/\s+/).filter(Boolean).map(word=>word[0]).join("").slice(0,4).toUpperCase();
const dateLabel=value=>{
 const date=new Date(`${value}T12:00:00Z`);
 return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat("en-ZA",{day:"numeric",month:"short",timeZone:"UTC"}).format(date):"Final result";
};
export default function FieldResultsStrip({season,teams=[]}){
 const results=fieldRecentResults(season),track=useRef(null);
 const [edges,setEdges]=useState({previous:false,next:false});
 const measure=()=>{const el=track.current;if(el)setEdges({previous:el.scrollLeft>2,next:el.scrollLeft+el.clientWidth<el.scrollWidth-2});};
 useEffect(()=>{
  measure();const el=track.current;if(!el)return;
  const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(measure):null;
  observer?.observe(el);window.addEventListener("resize",measure);
  return()=>{observer?.disconnect();window.removeEventListener("resize",measure);};
 },[results.length,season?.id]);
 const move=direction=>track.current?.scrollBy({left:direction*228,behavior:"auto"});
 const club=(id,name)=>{
  const team=teams.find(item=>item.id===id);
  const identity=buildClubIdentity({...team,id,name:team?.name||team?.label||name});
  if(identity.logo===DEFAULT_PLATFORM_LOGO){identity.logo="";identity.logoUrl="";identity.transparentLogoUrl="";}
  return identity;
 };
 if(!results.length)return null;
 return <section className="field-results-strip" aria-label="Past Field match results">
  <div className="field-results-strip__heading"><h3>Recent results</h3><div className="field-results-strip__arrows">
   <button type="button" aria-label="Scroll results left" disabled={!edges.previous} onClick={()=>move(-1)}>‹</button>
   <button type="button" aria-label="Scroll results right" disabled={!edges.next} onClick={()=>move(1)}>›</button>
  </div></div>
  <div className="field-results-strip__track" ref={track} role="list" tabIndex={0} aria-label="Results, newest first. Swipe to see earlier games." onScroll={measure} onKeyDown={event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();move(event.key==="ArrowLeft"?-1:1);}}}>
   {results.map(result=>{
    const a=club(result.teamAId,result.teamAName),b=club(result.teamBId,result.teamBName);
    return <article key={result.id} className="field-results-strip__card" role="listitem" aria-label={`${a.name} ${result.goalsA}, ${b.name} ${result.goalsB}. Full time. ${dateLabel(result.dateLocal)}`}>
     <div className="field-results-strip__card-top"><span title={`${a.name} vs ${b.name}`}>{short(a,a.name)} <small>vs</small> {short(b,b.name)}</span><span className="field-results-strip__ft">FT</span></div>
     <div className="field-results-strip__score"><ResultBadge team={a} name={a.name}/><strong>{result.goalsA}<span>–</span>{result.goalsB}</strong><ResultBadge team={b} name={b.name}/></div>
     <time dateTime={result.dateLocal||undefined}>{dateLabel(result.dateLocal)}</time>
    </article>;
   })}
  </div>
 </section>;
}
