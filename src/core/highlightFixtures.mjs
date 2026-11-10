export const highlightFixtureId=(clip,fallback='')=>String(clip?.matchId||clip?.matchContext?.matchId||clip?.fixtureId||fallback||'');
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
  const names=[clip.teamAName||clip.matchContext?.teamAName||clip.matchContext?.teamA?.name,clip.teamBName||clip.matchContext?.teamBName||clip.matchContext?.teamB?.name].filter(Boolean);
  const rawLabel=(id===UNASSIGNED_HIGHLIGHT_FIXTURE?"Clips without a fixture":prior.label)||(names.length===2?names.join(' vs '):labelOf(clip))||'Match highlights';
  const label=String(rawLabel).replace(/\s*[·•]\s*Timestamp\(.*$/i,'').trim();
  const scoreA=prior.goalsA??result.goalsA??clip.finalSummary?.goalsA??clip.matchContext?.goalsA;
  const scoreB=prior.goalsB??result.goalsB??clip.finalSummary?.goalsB??clip.matchContext?.goalsB;
  options.set(id,{...prior,matchId:id,label,teamALogoUrl:prior.teamALogoUrl||clip.teamALogoUrl||clip.matchContext?.teamALogoUrl||highlightTeamCrest(clip.matchContext?.teamA),teamBLogoUrl:prior.teamBLogoUrl||clip.teamBLogoUrl||clip.matchContext?.teamBLogoUrl||highlightTeamCrest(clip.matchContext?.teamB),date:id===UNASSIGNED_HIGHLIGHT_FIXTURE?"":prior.date||highlightFixtureDate(highlightPlayedDay(clip)),goalsA:scoreA,goalsB:scoreB,clipCount:(prior.clipCount||0)+1,seenClipIds:[...(prior.seenClipIds||[]),clipKey],previews:[...(prior.previews||[]),{id:clipKey,src:clip.mediaUrl||clip.videoUrl||clip.downloadUrl||clip.fileUrl||clip.uri||'',poster:clip.thumbnailUrl||clip.posterUrl||clip.previewImageUrl||clip.thumbnail||'',label:clip.scorer||clip.playerName||clip.title||'Highlight',type:clip.normalizedType||clip.type||'highlight'}].slice(0,3)});
 }
 return [...options.values()].sort((a,b)=>Date.parse(b.date || 0) - Date.parse(a.date || 0) || String(b.matchId).localeCompare(String(a.matchId)));
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
        entries.push({id, date, teamAId, teamBId, matchNo: result.matchNo,
          matchType: isFriendly ? "FRIENDLY" : "LEAGUE", gameFormat: result.gameFormat || day.gameFormat || season.gameFormat,
          seasonId: isFriendly ? null : season.seasonId, goalsA: Number(goalsA), goalsB: Number(goalsB),
          label: nameA && nameB ? `${nameA} vs ${nameB}` : "",
          teamALogoUrl: result.teamALogoUrl || highlightTeamCrest(result.teamASnapshot) || highlightTeamCrest((day.teams || season.teams || []).find(team => team.id === teamAId)),
          teamBLogoUrl: result.teamBLogoUrl || highlightTeamCrest(result.teamBSnapshot) || highlightTeamCrest((day.teams || season.teams || []).find(team => team.id === teamBId))});
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
    const date = highlightPlayedDay(clip);
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
    if (!result) return option;
    return {...option, date: highlightFixtureDate(result.date) || option.date, label: result.label || option.label,
      teamALogoUrl: result.teamALogoUrl || option.teamALogoUrl,
      teamBLogoUrl: result.teamBLogoUrl || option.teamBLogoUrl,
      goalsA: result.goalsA, goalsB: result.goalsB};
  });
}

export const highlightTeamCrest = team => team?.logoUrl || team?.branding?.logoUrl ||
  team?.teamIdentity?.logo32 || team?.logo32 || team?.logo || team?.crestUrl || "";

export const UNASSIGNED_HIGHLIGHT_FIXTURE = "legacy-unassigned";

function asDate(value) {
  if (typeof value?.toDate === "function") return value.toDate();
  const seconds = value?.seconds ?? value?._seconds;
  if (typeof seconds === "number") return new Date(seconds * 1000);
  return new Date(value ?? NaN);
}

export function highlightMatchDay(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : "";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return highlightMatchDay(value.slice(0, 10));
  const date = asDate(value);
  return Number.isFinite(+date)
    ? new Date(+date + 2 * 3600000).toISOString().slice(0, 10)
    : "";
}

export function highlightPlayedDay(clip, fixtures = new Map(), results = new Map()) {
  const context = clip.matchContext || {};
  const id = highlightFixtureId(clip);
  const fixture = fixtures.get(id);
  const result = results.get(id);
  const [, embedded, kickoff] = id.match(/^friendly__[^_]+__(\d{4}-\d{2}-\d{2})(?:__(\d{13})__\d+)?$/) || [];
  return [clip.matchDateISO, clip.matchDate, clip.startedAtISO,
    context.matchDateISO, context.matchDate, context.startedAtISO, kickoff ? Number(kickoff) : null,
    clip.matchDayId, clip.matchdayId, context.matchDayId, embedded,
    fixture?.playedAt, result, fixture?.date].map(highlightMatchDay).find(Boolean) || "";
}

export const highlightClipKey = clip =>
  JSON.stringify([highlightFixtureId(clip), clip.clipId || clip.id || clip.storagePath || clip.mediaUrl]);

export const isHighlightWinner = clip => Boolean(
  clip.weeklyWinner || clip.seasonWinner || clip.weeklyWinnerRank || clip.archiveRank ||
  clip.winnerCategory || clip.archiveCategory ||
  ["weekly", "season"].includes(clip.winnerLevel) ||
  ["weekly_winner", "season_winner"].includes(clip.retentionStatus)
);

export function partitionMatchHighlights(raw, archives, { now, fixtures = [], results = [], mode } = {}) {
  const current = [], throwbacks = [];
  const today = highlightMatchDay(now ?? Date.now()) || highlightMatchDay(Date.now());
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const weekStart = monday.toISOString().slice(0, 10);
  const fixtureMap = new Map(fixtures.map(fixture => [fixture.matchId, fixture]));
  const resultDays = new Map();
  for (const result of results) {
    const id = result.id || result.videoHighlightsMatchId || result.matchId;
    const day = highlightMatchDay(result.date || result.videoHighlightsMatchDate || result.completedAtISO);
    if (!id || !day) continue;
    resultDays.set(id, !resultDays.has(id) || resultDays.get(id) === day ? day : "");
  }

  const winners = new Set([...raw, ...archives].filter(isHighlightWinner).map(highlightClipKey));
  // The archive collection was the winner record before explicit winner flags existed.
  for (const clip of archives) {
    if (!clip.isThrowback && clip.highlightEra !== "throwback" &&
        (clip.archivedClubFeed || clip.archived === true || clip.status === "archived")) {
      winners.add(highlightClipKey(clip));
    }
  }
  const seen = new Set();
  for (const clip of [...raw, ...archives]) {
    const key = highlightClipKey(clip);
    if (seen.has(key) || winners.has(key) || clip.deleted || clip.deletedAt ||
        clip.status === "deleted" || !(clip.mediaUrl || clip.storagePath)) continue;
    seen.add(key);
    const day = highlightPlayedDay(clip, fixtureMap, resultDays);
    if (highlightFixtureId(clip) && day && day >= weekStart && day <= today &&
        !clip.isThrowback && clip.highlightEra !== "throwback" && !clip.archivedClubFeed) {
      if (!mode || highlightMatchesMode(clip, mode)) current.push(clip);
    } else {
      throwbacks.push({ ...clip, isThrowback: true, votingLocked: true });
    }
  }
  return { current, throwbacks };
}
