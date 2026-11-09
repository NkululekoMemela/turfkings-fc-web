import {buildProfileMemberResolver} from "./playerProfileInsights.mjs";

const list = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? "").trim();
const bool = value => /^(true|1|yes)$/i.test(text(value));
const played = entry => {
  const count = Number(entry.matchesPlayed ?? entry.gamesPlayed);
  return Number.isFinite(count) && count > 0 ? count
    : Number(bool(entry.played ?? entry.didPlay ?? entry.wasInGame));
};

export function savedClubAttendanceDays(state) {
  return list(state?.seasons).flatMap(season => list(season.matchDayHistory).flatMap(day => {
    const id = text(day.id || day.matchDayId);
    return id ? [{key:`${season.seasonId || season.id || ""}:${id}`, entries:list(day.playerAppearances)}] : [];
  }));
}

export function buildPlayerAttendanceSummary({days, fallbackRows, teams, member, members}) {
  const memberId = text(member?.id);
  const directory = [...list(members).filter(item => item.id !== memberId), member];
  const resolve = buildProfileMemberResolver(directory.filter(Boolean));
  const belongs = entry => {
    const id = typeof entry === "string" ? entry : entry.memberId || entry.playerId || entry.id || entry.uid;
    const name = typeof entry === "string" ? entry : entry.playerName || entry.fullName || entry.shortName || entry.displayName || entry.name;
    return Boolean(memberId) && resolve(name, id) === memberId;
  };
  const matchedTeams = list(teams).filter(team => list(team.players).some(entry => entry && belongs(entry)));
  const team = matchedTeams.length === 1 ? matchedTeams[0] : null;
  const byDay = new Map();
  for (const day of list(days)) {
    if (!byDay.has(day.key)) byDay.set(day.key, []);
    byDay.get(day.key).push(...day.entries);
  }
  if (!byDay.size) for (const row of list(fallbackRows)) {
    const dayId = text(row.matchDayId);
    if (!dayId) continue;
    const key = `${text(row.seasonId)}:${dayId}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(row);
  }
  let attended = 0, gamesPlayed = 0;
  for (const entries of byDay.values()) {
    const perTeam = new Map();
    let present = false;
    for (const entry of entries) {
      if (!entry || !belongs(entry)) continue;
      const count = played(entry);
      const key = text(entry.teamId || entry.teamName);
      perTeam.set(key, Math.max(count, perTeam.get(key) || 0));
      const recorded = entry.attended ?? entry.isPresent ?? entry.present;
      if (recorded == null ? count > 0 : bool(recorded)) present = true;
    }
    if (present) attended++;
    gamesPlayed += [...perTeam.values()].reduce((sum,count) => sum + count, 0);
  }
  const total = byDay.size;
  return {attended,total,gamesPlayed,percent:total ? Math.round(attended * 100 / total) : null,
    teamName:text(team?.name || team?.teamName || team?.label)};
}
