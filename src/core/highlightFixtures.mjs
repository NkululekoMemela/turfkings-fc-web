export const highlightFixtureId=(clip,fallback='')=>String(clip?.matchId||clip?.matchContext?.matchId||fallback||'');
export function groupHighlightFixtures(clips=[],selected='',fallback=''){
 const groups=new Map();for(const clip of clips){const id=highlightFixtureId(clip,fallback);if(selected&&id!==selected)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(clip);}return [...groups.values()].flat();
}
export function highlightFixtureDate(value){
 if(!value)return '';
 try{
  const date=typeof value?.toDate==='function'?value.toDate():typeof value?.seconds==='number'?new Date(value.seconds*1000):typeof value?._seconds==='number'?new Date(value._seconds*1000):new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-ZA',{day:'2-digit',month:'short',year:'numeric',timeZone:'Africa/Johannesburg'}).format(date):'';
 }catch{return '';}
}
export function highlightFixtureOptions(clips=[],fixtures=[],labelOf=()=>'',fallback='',results=[]){
 const options=new Map(fixtures.filter(f=>f.matchId).map(f=>[f.matchId,{...f,date:highlightFixtureDate(f.date),clipCount:0,previews:[],seenClipIds:[]}]));
 for(const clip of clips){
  const id=highlightFixtureId(clip,fallback);if(!id)continue;
  const result=results.find(r=>(r.videoHighlightsMatchId||r.matchId)===id)||{};
  const prior=options.get(id)||{};
  const clipKey=String(clip.clipId||clip.id||clip.mediaUrl||clip.videoUrl||clip.downloadUrl||clip.fileUrl||clip.uri||'');
  if(clipKey&&prior.seenClipIds?.includes(clipKey))continue;
  const names=[clip.teamAName||clip.matchContext?.teamAName,clip.teamBName||clip.matchContext?.teamBName].filter(Boolean);
  const rawLabel=prior.label||(names.length===2?names.join(' vs '):labelOf(clip))||'Match highlights';
  const label=String(rawLabel).replace(/\s*[·•]\s*Timestamp\(.*$/i,'').trim();
  const scoreA=prior.goalsA??result.goalsA??clip.finalSummary?.goalsA??clip.matchContext?.goalsA;
  const scoreB=prior.goalsB??result.goalsB??clip.finalSummary?.goalsB??clip.matchContext?.goalsB;
  options.set(id,{...prior,matchId:id,label,teamALogoUrl:prior.teamALogoUrl||clip.teamALogoUrl||clip.matchContext?.teamALogoUrl||'',teamBLogoUrl:prior.teamBLogoUrl||clip.teamBLogoUrl||clip.matchContext?.teamBLogoUrl||'',date:prior.date||highlightFixtureDate(clip.matchDate||clip.createdAtISO||clip.createdAt),goalsA:scoreA,goalsB:scoreB,clipCount:(prior.clipCount||0)+1,seenClipIds:[...(prior.seenClipIds||[]),clipKey],previews:[...(prior.previews||[]),{id:clipKey,src:clip.mediaUrl||clip.videoUrl||clip.downloadUrl||clip.fileUrl||clip.uri||'',poster:clip.thumbnailUrl||clip.posterUrl||clip.previewImageUrl||clip.thumbnail||'',label:clip.scorer||clip.playerName||clip.title||'Highlight',type:clip.normalizedType||clip.type||'highlight'}].slice(0,3)});
 }
 return [...options.values()].sort((a,b)=>String(b.matchId).localeCompare(String(a.matchId)));
}
export function highlightMatchesMode(clip,mode){const raw=String(clip.matchType||clip.matchContext?.matchType||clip.metadata?.matchType||'').toUpperCase(),id=highlightFixtureId(clip);const type=raw.includes('LEAGUE')||/^league[_-]|^venue__/i.test(id)?'LEAGUE':raw.includes('FRIENDLY')||/^friendly[_-]/i.test(id)?'FRIENDLY':'';return !type||type===String(mode).toUpperCase();}
export function filterHighlightClips(clips=[],{type='all',player='all',viewed='all',watchedIds=new Set()}={}){
 const norm=value=>String(value||'').trim().toLowerCase();
 return clips.filter(clip=>(type==='all'||clip.normalizedType===type)&&(player==='all'||norm(clip.playerName||clip.scorer)===norm(player))&&(viewed==='all'||watchedIds.has(String(clip.clipId||clip.id||'').trim())===(viewed==='watched')));
}
