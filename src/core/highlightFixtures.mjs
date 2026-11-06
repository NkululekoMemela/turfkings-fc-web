export const highlightFixtureId=(clip,fallback='')=>String(clip?.matchId||clip?.matchContext?.matchId||fallback||'');
export function groupHighlightFixtures(clips=[],selected='',fallback=''){
 const groups=new Map();for(const clip of clips){const id=highlightFixtureId(clip,fallback);if(selected&&id!==selected)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(clip);}return [...groups.values()].flat();
}
export function highlightFixtureOptions(clips=[],fixtures=[],labelOf=()=>'',fallback=''){
 const options=new Map(fixtures.filter(f=>f.matchId).map(f=>[f.matchId,{...f}]));
 for(const clip of clips){const id=highlightFixtureId(clip,fallback);if(!id||options.has(id))continue;const date=String(clip.matchDate||clip.createdAtISO||clip.createdAt||'').slice(0,10);const names=[clip.teamAName||clip.matchContext?.teamAName,clip.teamBName||clip.matchContext?.teamBName].filter(Boolean);const label=names.length===2?names.join(' vs '):labelOf(clip)||'Match highlights';options.set(id,{matchId:id,label,date});}
 return [...options.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
export function highlightMatchesMode(clip,mode){const raw=String(clip.matchType||clip.matchContext?.matchType||clip.metadata?.matchType||'').toUpperCase(),id=highlightFixtureId(clip);const type=raw.includes('LEAGUE')||/^league[_-]|^venue__/i.test(id)?'LEAGUE':raw.includes('FRIENDLY')||/^friendly[_-]/i.test(id)?'FRIENDLY':'';return !type||type===String(mode).toUpperCase();}
