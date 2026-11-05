import {fieldMatchStatEvents} from './fieldDefensiveStats.mjs';
import {FORMATIONS_5,FORMATIONS_6,FORMATIONS_7,FORMATIONS_11} from './lineups.js';
import {buildFormationDecorations} from './matchDayFormationRatings.js';
const list=x=>Array.isArray(x)?x:[];
const norm=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');
export function buildFieldMatchReport({season={},resultId}){
 const histories=list(season.matchDayHistory);
 const rows=[...histories.flatMap(d=>list(d.results)),...list(season.results)];
 const result=rows.filter(r=>String(r.fixtureId||r.id)===String(resultId)&&r.status==='completed').at(-1);
 if(!result)return null;
 const fixture=list(season.fixtures).find(f=>f.id===(result.fixtureId||result.id))||{};
 const matchId=result.fixtureId||result.id;
 const all=[...list(result.events),...list(season.allEvents),...histories.flatMap(d=>list(d.allEvents))];
 const numberMatches=new Set(rows.filter(r=>r.matchNo===result.matchNo).map(r=>r.fixtureId||r.id));
 const seen=new Set();
 const rawEvents=all.filter(e=>{
  const belongs=list(result.events).includes(e)||e.fixtureId===matchId||(!e.fixtureId&&result.matchNo!=null&&e.matchNo===result.matchNo&&numberMatches.size===1);
  if(!belongs)return false;
  const key=e.id||JSON.stringify([e.fixtureId,e.matchNo,e.type,e.teamId,e.timeSeconds,e.scorer,e.playerName,e.assist]);
  if(seen.has(key))return false;seen.add(key);return true;
 });
 const events=fieldMatchStatEvents({...result,gameFormat:result.gameFormat||season.gameFormat},rawEvents);
 const sides=[result.teamAId||fixture.clubAId,result.teamBId||fixture.clubBId].map((clubId,index)=>{
  const snapshot=result.confirmedLineupSnapshot?.[clubId];
  const positions=snapshot?.positions||{};
  const kit=list(snapshot?.kitNumbers);
  const names=[...new Set([...Object.values(positions),...list(snapshot?.benchSnapshot),...kit.map(p=>p.name)].filter(n=>typeof n==='string'&&n.trim()))];
  const byName=new Map(kit.map(p=>[norm(p.name),p]));
  const decorations=buildFormationDecorations({ratingMode:"FIELD",teamId:clubId,players:names,events:events.filter(e=>!e.teamId||e.teamId===clubId),results:[result],resolveCanonicalName:norm});
  const count=Object.values(positions).filter(Boolean).length;
  const formations=count===11?FORMATIONS_11:count===7?FORMATIONS_7:count===6?FORMATIONS_6:FORMATIONS_5;
  const definition=Object.values(formations).find(f=>f.id===snapshot?.formationId)||Object.values(formations)[0];
  const make=(name,slot={})=>({name,number:byName.get(norm(name))?.number??null,playerId:byName.get(norm(name))?.key||'',photoData:byName.get(norm(name))?.photoData||'',decor:decorations[norm(name)]||null,...slot});
  const assigned=new Set(Object.values(positions).map(norm));
  return {clubId,name:(index===0?result.teamAName||fixture.clubAName:result.teamBName||fixture.clubBName)||season.invitations?.[clubId]?.clubName||clubId,formationId:snapshot?.formationId||'',hasSnapshot:Boolean(snapshot&&count),players:(definition?.positions||[]).filter(p=>positions[p.id]).map(p=>make(positions[p.id],{slotId:p.id,x:index===0?100-p.x:p.x,y:p.label === "GK" ? (index===0?7:93) : (index===0?51-p.y*.4:49+p.y*.4)})),bench:names.filter(n=>!assigned.has(norm(n))).map(n=>make(n))};
 });
 return {result,events,sides};
}
