import {buildFriendlyDefensiveBlockEvents,buildCleanSheetEventsForMatch,FORMATIONS_5,FORMATIONS_6,FORMATIONS_7,FORMATIONS_11} from './lineups.js';
const list=value=>Array.isArray(value)?value:[];
export function fieldMatchStatEvents(result, suppliedEvents=result?.events){
 const events=list(suppliedEvents),fixtureId=result.fixtureId||result.id;
 const base=events.filter(e=>!['defensive_block','clean_sheet'].includes(e.type));
 const map=({'6_V_6':FORMATIONS_6,'7_V_7':FORMATIONS_7,'11_V_11':FORMATIONS_11})[result.gameFormat]||FORMATIONS_5;
 const seconds=typeof result.playedSeconds === "number" ? result.playedSeconds : NaN;
 const scoresMatch=[result.teamAId,result.teamBId].every((id,i)=>base.filter(e=>e.type==='goal'&&e.teamId===id).length===Number(i===0?result.goalsA:result.goalsB));
 // No invented playing time for historical matches. Preserve recorded DB only.
 const blocks=Number.isFinite(seconds)&&seconds>=0&&scoresMatch
  ? buildFriendlyDefensiveBlockEvents({matchNo:result.matchNo,matchKey:fixtureId,teamAId:result.teamAId,teamBId:result.teamBId,events:base,elapsedMatchSeconds:seconds,verifiedLineups:result.confirmedLineupSnapshot,lineupTimeline:list(result.lineupTimeline),formationMap:map})
  : events.filter(e=>e.type==='defensive_block');
 const clean=buildCleanSheetEventsForMatch({matchNo:result.matchNo,teamAId:result.teamAId,teamBId:result.teamBId,goalsA:Number(result.goalsA),goalsB:Number(result.goalsB),verifiedLineups:result.confirmedLineupSnapshot,formationMap:map});
 const seen=new Set();
 for(const event of clean)event.id=`field-cs-${fixtureId}-${event.teamId}-${event.role}-${encodeURIComponent(String(event.playerName).toLowerCase())}`;
 return [...base,...blocks,...clean].map(e=>({...e,fixtureId,matchType:'LEAGUE',gameFormat:result.gameFormat})).filter(e=>{const key=e.id||JSON.stringify(e);if(seen.has(key))return false;seen.add(key);return true;});
}
