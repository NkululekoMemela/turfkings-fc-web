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

function clubResultDay(value) {
  const embedded = typeof value === "string" && value.match(/(?:^|__)(\d{4}-\d{2}-\d{2})(?:T|$)/);
  if (embedded) return embedded[1];
  const formatted = highlightFixtureDate(value);
  if (!formatted) return "";
  const [day, month, year] = formatted.split(" ");
  const index = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    .indexOf(month?.slice(0, 3).toLowerCase());
  return index < 0 ? "" : `${year}-${String(index + 1).padStart(2, "0")}-${day}`;
}

export function clubHighlightResults(seasons = []) {
  const entries = [];
  for (const season of seasons) {
    for (const [day, friendly] of [[season, false],
      ...(season.matchDayHistory || []).map(day => [day, false]),
      ...(season.friendlyMatchDayHistory || []).map(day => [day, true])]) {
      for (const result of day.results || []) {
        const {teamAId, teamBId, goalsA, goalsB} = result;
        if (!teamAId || !teamBId || ![goalsA, goalsB].every(
          score => score != null && score !== "" && Number.isInteger(Number(score)) && Number(score) >= 0
        )) continue;
        const date = clubResultDay(result.videoHighlightsMatchDate || result.completedAtISO ||
          (day !== season && (day.createdAt || day.id)));
        const format = String(result.gameFormat || day.gameFormat || season.gameFormat || "5_V_5")
          .toLowerCase().replace(/_/g, "");
        const isFriendly = friendly || String(result.matchType || day.matchType || "").toUpperCase() === "FRIENDLY";
        const clean = id => String(id).trim().replace(/[^a-zA-Z0-9_-]/g, "");
        const id = result.videoHighlightsMatchId || (isFriendly
          ? (date && `friendly__${format}__${date}`)
          : (season.seasonId && result.matchNo &&
            `league__${season.seasonId}__match_${result.matchNo}__${clean(teamAId)}_vs_${clean(teamBId)}`));
        if (!id) continue;
        const nameA = result.teamALabel || result.teamASnapshot?.label;
        const nameB = result.teamBLabel || result.teamBSnapshot?.label;
        entries.push({id, date, teamAId, teamBId, goalsA: Number(goalsA), goalsB: Number(goalsB),
          label: nameA && nameB ? `${nameA} vs ${nameB}` : "",
          teamALogoUrl: result.teamASnapshot?.logoUrl || result.teamASnapshot?.branding?.logoUrl,
          teamBLogoUrl: result.teamBSnapshot?.logoUrl || result.teamBSnapshot?.branding?.logoUrl});
      }
    }
  }
  return entries;
}

export function clubHighlightFixtureOptions(clips, fixtures, labelOf, fallback, results = []) {
  const options = highlightFixtureOptions(clips, fixtures, labelOf, fallback);
  const byId = new Map();
  const matches = new Map();
  for (const result of results) {
    if (!byId.has(result.id)) byId.set(result.id, []);
    byId.get(result.id).push(result);
  }
  for (const clip of clips) {
    const id = highlightFixtureId(clip, fallback);
    const candidates = byId.get(highlightFixtureId(clip)) || [];
    const date = clubResultDay(clip.matchDayId || clip.matchContext?.matchDayId) ||
      clubResultDay(clip.matchDate || clip.createdAtISO || clip.createdAt);
    const a = clip.teamAId || clip.matchContext?.teamAId;
    const b = clip.teamBId || clip.matchContext?.teamBId;
    const eligible = candidates.filter(r => (!a || a === r.teamAId) && (!b || b === r.teamBId) &&
      (!date || !r.date || date === r.date || id.startsWith("friendly__")));
    const exact = date ? eligible.filter(r => r.date === date) : [];
    const possible = exact.length ? exact : eligible;
    if (!matches.has(id)) matches.set(id, new Set());
    matches.get(id).add(possible.length === 1 ? possible[0] : null);
  }
  return options.map(option => {
    const group = matches.get(option.matchId);
    const result = group?.size === 1 && [...group][0];
    const {goalsA, goalsB, ...unscored} = option;
    if (!result) return unscored;
    return {...unscored, label: result.label || option.label,
      teamALogoUrl: result.teamALogoUrl || option.teamALogoUrl,
      teamBLogoUrl: result.teamBLogoUrl || option.teamBLogoUrl,
      goalsA: result.goalsA, goalsB: result.goalsB};
  });
}
