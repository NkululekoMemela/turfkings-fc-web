import {buildPlayerEventStats} from "./playerEventStats.js";
const list = value => Array.isArray(value) ? value : [];
const norm = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const slug = value => norm(value).replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const ordinal = rank => rank === 1 ? "Top" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;
export function buildProfileMemberResolver(members) {
  const ids = new Map(), aliases = new Map();
  for (const member of members) {
    const key = String(member.id || member.memberId || "");
    if (!key) continue;
    for (const id of [key, member.playerId, member.uid]) if (id) {
      const normalized = norm(id); ids.set(normalized, ids.has(normalized) && ids.get(normalized) !== key ? null : key);
    }
    for (const name of [member.fullName, member.shortName, ...list(member.profileNameAliases)]) {
      for (const alias of [norm(name), slug(name)]) {
        if (!alias) continue;
        aliases.set(alias, aliases.has(alias) && aliases.get(alias) !== key ? null : key);
      }
    }
  }
  return (name, id = "") => {
    if (id && ids.has(norm(id))) return ids.get(norm(id)) || "";
    if (id && aliases.has(norm(id))) return aliases.get(norm(id)) || "";
    return aliases.get(norm(name)) || aliases.get(slug(name)) || "";
  };
}
export function collectProfileSeasonRecords(season = {}, mode = "LEAGUE") {
  const days = mode === "FRIENDLY" ? list(season.friendlyMatchDayHistory) : list(season.matchDayHistory);
  const events = [], seen = new Set();
  const addEvents = (items, context) => {
    for (const event of items) {
      if (!event || event.matchType && String(event.matchType).toUpperCase() !== mode) continue;
      if (context === "current" && !event.matchType && season.matchType && String(season.matchType).toUpperCase() !== mode) continue;
      const key = `${context}|${event.matchKey || event.fixtureId || event.matchNo || ""}|${event.id || JSON.stringify([event.type,event.timeSeconds,event.teamId,event.scorer,event.playerName,event.assist,event.role,event.blockCount])}`;
      if (!seen.has(key)) { seen.add(key); events.push({...event, profileMatchKey: `${context}|${event.matchKey || event.fixtureId || event.matchNo || ""}`}); }
    }
  };
  const uniqueDays = [], dayIds = new Set();
  for (const day of days) {
    const context = String(day.id || day.matchDayId || day.createdAt || "");
    if (dayIds.has(context)) continue;
    dayIds.add(context); uniqueDays.push(day);
    addEvents(list(day.allEvents).length ? day.allEvents : list(day.results).flatMap(result => list(result.events)), context);
  }
  // Current-day events are committed only after a match ends. Never count currentEvents.
  addEvents(list(season.allEvents), "current");
  if (!list(season.allEvents).length) addEvents(list(season.results).flatMap(result => list(result.events)), "current");
  return {events, days: uniqueDays};
}
function timestamp(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const ms = new Date(value || "").getTime();
  return Number.isFinite(ms) ? ms : null;
}
export function buildPlayerProfileInsights({season = {}, members = [], memberId, mode = "LEAGUE", awards = [], leaders = {}}) {
  const resolve = buildProfileMemberResolver(members);
  const {events, days} = collectProfileSeasonRecords(season, mode);
  const rows = new Map(members.filter(member => member.id).map(member => [member.id, {
    id: member.id, member, goals:0, assists:0, gkCleanSheets:0, defensiveBlocks:0,
    yellowCards:0, redCards:0, injuryIncidents:0, gamesPlayed:0, matchDaysPresent:0,
    eligibleDays:0, attendanceRate:null, attendanceRecorded:false,
  }]));
  const normalized = events.map(event => ({...event,
    scorer: resolve(event.scorer, event.scorerMemberId || event.scorerId),
    assist: resolve(event.assist, event.assistMemberId || event.assistId),
    playerName: resolve(event.playerName, event.playerMemberId || event.memberId || event.playerId),
  }));
  for (const stats of buildPlayerEventStats({events:normalized})) {
    const row = rows.get(stats.name);
    if (row) for (const key of ["goals","assists","gkCleanSheets","defensiveBlocks"]) row[key] = stats[key];
  }
  const injured = new Set();
  for (const event of normalized) {
    const row = rows.get(event.playerName || event.scorer);
    if (!row || event.playerType === "guest") continue;
    if (event.type === "yellow_card") row.yellowCards++;
    if (event.type === "red_card") row.redCards++;
    const injuryKey = `${row.id}|${event.profileMatchKey}`;
    if (event.type === "injury_recovered") injured.delete(injuryKey);
    else if (["injury_knock","injury_sitting_out"].includes(event.type) && !injured.has(injuryKey)) {
      row.injuryIncidents++; injured.add(injuryKey);
    }
  }
  const attendanceDays = new Map();
  for (const day of days) {
    // Only confirmed appearances are evidence. A squad list or payment is not attendance.
    if (!Array.isArray(day.playerAppearances)) continue;
    const ms = timestamp(day.createdAt || day.date || day.matchDayId);
    const dayKey = ms ? new Date(ms).toISOString().slice(0,10) : String(day.matchDayId || day.id);
    let saved = attendanceDays.get(dayKey);
    if (!saved) { saved={ms, present:new Set(), seen:new Set()}; attendanceDays.set(dayKey,saved); }
    for (const entry of day.playerAppearances) {
      const id = resolve(entry.playerName || entry.shortName, entry.memberId || entry.sourceMemberId || entry.playerId);
      const row = rows.get(id);
      if (!row) continue;
      const key = `${day.id || day.matchDayId}|${id}|${entry.teamId || ""}`;
      if (saved.seen.has(key)) continue;
      saved.seen.add(key);
      const played = Math.max(0, Number(entry.matchesPlayed) || 0);
      row.gamesPlayed += played; row.attendanceRecorded = true;
      if (played > 0) saved.present.add(id);
    }
  }
  for (const row of rows.values()) {
    const joined = timestamp(row.member.joinedAt || row.member.createdAt);
    for (const day of attendanceDays.values()) {
      if (day.present.has(row.id)) row.matchDaysPresent++;
      if (joined !== null && day.ms !== null && day.ms >= joined) row.eligibleDays++;
    }
    // A join timestamp is required before classifying absences or comparing attendance rates.
    if (row.eligibleDays > 0) row.attendanceRate = Math.min(1, row.matchDaysPresent / row.eligibleDays);
  }
  const player = rows.get(memberId);
  if (!player) return {statements:[], player:null, rows:[], recordedDays:attendanceDays.size, warnings:[]};
  const statements = [];
  const pool = [...rows.values()].filter(row => row.member.status !== "withdrawn" || row.gamesPlayed > 0);
  for (const [key,label] of [["goals","goal scorer"],["assists","assister"],["gkCleanSheets","goalkeeper by clean sheets"],["defensiveBlocks","defensive blocks"],["yellowCards","yellow cards"],["redCards","red cards"],["injuryIncidents","recorded injury incidents"]]) {
    if (player[key] <= 0) continue;
    const rank = 1 + pool.filter(row => row[key] > player[key]).length;
    const tied = pool.filter(row => row[key] === player[key]).length > 1;
    if (rank <= 3) statements.push({key,rank,tone:["yellowCards","redCards","injuryIncidents"].includes(key)?"record":"achievement",
      text:`${tied?"Joint ":""}${ordinal(rank)} ${label}`,detail:`${player[key]} recorded · ${mode === "LEAGUE" ? "League" : "Friendly"}`});
  }
  if (player.matchDaysPresent > 0 && !player.eligibleDays) {
    const rank = 1 + pool.filter(row => row.matchDaysPresent > player.matchDaysPresent).length;
    const tied = pool.filter(row => row.matchDaysPresent === player.matchDaysPresent).length > 1;
    if (rank <= 3) statements.push({key:"recorded-attendance",tone:"achievement",text:`${tied?"Joint ":""}${ordinal(rank)} match days attended`,detail:`${player.matchDaysPresent} confirmed recorded days · no absence assumption`});
  }
  const attendancePool = pool.filter(row => row.eligibleDays >= 3 && row.attendanceRate !== null);
  if (player.eligibleDays >= 3 && attendancePool.length > 1) {
    const rank = 1 + attendancePool.filter(row => row.attendanceRate > player.attendanceRate).length;
    const tied = attendancePool.filter(row => row.attendanceRate === player.attendanceRate).length > 1;
    if (rank <= 3 && player.matchDaysPresent > 0) statements.push({key:"attendance",rank,tone:"achievement",text:`${tied?"Joint ":""}${rank===1?"Best":ordinal(rank)+" best"} attendance`,detail:`${player.matchDaysPresent} / ${player.eligibleDays} eligible recorded match days`});
    const minimum = Math.min(...attendancePool.map(row => row.attendanceRate));
    const maximum = Math.max(...attendancePool.map(row => row.attendanceRate));
    if (player.attendanceRate === minimum && minimum < maximum && minimum < 1) statements.push({key:"low-attendance",tone:"record",text:"Lowest recorded attendance",detail:`${Math.round(player.attendanceRate*100)}% · minimum three eligible recorded days`});
  }
  const awardType = clip => norm(clip.normalizedType || clip.tag || clip.type || clip.awardKey);
  const awardName = clip => /skill/.test(awardType(clip)) ? "Skill of the Season" : /save/.test(awardType(clip)) ? "Save of the Season" : "Puskas Award";
  const belongs = clip => resolve([clip.goalScorer,clip.goalScorerName,clip.scorer,clip.playerName,clip.player,clip.keeperName,clip.skillPlayer].find(value=>value && !/^(pending|unknown)/i.test(String(value))), clip.memberId || clip.playerMemberId || clip.playerId) === memberId;
  const inSeason = clip => String(clip.seasonId || clip.activeSeasonId || clip.matchContext?.seasonId || "") === String(season.seasonId || season.id || "");
  const inMode = clip => String(clip.matchType || clip.matchContext?.matchType || "").toUpperCase() === mode;
  const awarded = new Set();
  for (const clip of awards) {
    if (!inSeason(clip) || !inMode(clip) || !belongs(clip)) continue;
    if (!(clip.seasonWinner === true || norm(clip.winnerLevel)==="season" || norm(clip.retentionStatus)==="season_winner")) continue;
    const title = awardName(clip); if (awarded.has(title)) continue; awarded.add(title);
    statements.unshift({key:`award-${title}`,tone:"achievement",text:`${title} winner`,detail:"Recorded season winner"});
  }
  for (const clip of Object.values(leaders).filter(clip => clip && !Array.isArray(clip))) {
    if (!inSeason(clip) || !inMode(clip) || !belongs(clip) || !clip.currentAwardLeader || Number(clip.likeCount || clip.voteCount || 0) <= 0) continue;
    const title = awardName(clip); if (awarded.has(title)) continue; awarded.add(title);
    statements.push({key:`leader-${title}`,tone:"provisional",text:`${title} contender`,detail:"Live video leader · not a confirmed award"});
  }
  return {player,statements,rows:[...rows.values()],recordedDays:attendanceDays.size,
    seasonId:season.seasonId || season.id || "", mode,
    warnings:[...(!attendanceDays.size?["Attendance appears after match-day participation is confirmed and saved."]:[]),
      ...(!player.eligibleDays && attendanceDays.size?["Attendance percentages and absence rankings need a recorded joining date."]:[])]};
}
