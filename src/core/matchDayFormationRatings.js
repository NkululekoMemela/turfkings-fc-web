// src/core/matchDayFormationRatings.js

function clamp(min, val, max) {
  return Math.max(min, Math.min(max, val));
}

function round1(v) {
  return Math.round(Number(v || 0) * 10) / 10;
}

function dedupeEvents(events = []) {
  const seen = new Set();
  const out = [];

  (events || []).forEach((e) => {
    if (!e) return;

    const key =
      e.id ??
      [
        e.matchNo ?? "m?",
        e.timeSeconds ?? "t?",
        e.type ?? "type?",
        e.teamId ?? "team?",
        e.scorer ?? e.playerName ?? "p?",
        e.assist ?? "a?",
        e.role ?? "role?",
      ].join("|");

    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  });

  return out;
}

function getTeamResultSummary(teamId, results = []) {
  const safeTeamId = String(teamId || "").trim();
  if (!safeTeamId) return null;

  const relevant = (results || []).filter(
    (r) => r?.teamAId === safeTeamId || r?.teamBId === safeTeamId
  );

  if (!relevant.length) return null;

  let wins = 0;
  let draws = 0;
  let losses = 0;

  relevant.forEach((r) => {
    if (r?.isDraw) draws += 1;
    else if (r?.winnerId === safeTeamId) wins += 1;
    else losses += 1;
  });

  return {
    played: relevant.length,
    wins,
    draws,
    losses,
  };
}

export function buildMatchDayStatsByPlayer(events = [], resolveCanonicalName) {
  const stats = {};

  const ensure = (canonName) => {
    if (!canonName) return null;

    if (!stats[canonName]) {
      stats[canonName] = {
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        gkCleanSheets: 0,
        defCleanSheets: 0,
        points: 0,
      };
    }

    return stats[canonName];
  };

  dedupeEvents(events).forEach((e) => {
    if (!e) return;

    if (e.type === "clean_sheet") {
      const holder = resolveCanonicalName(e.playerName || e.scorer || "");
      const s = ensure(holder);
      if (!s) return;

      s.cleanSheets += 1;
      if (e.role === "gk") s.gkCleanSheets += 1;
      if (e.role === "def") s.defCleanSheets += 1;
      return;
    }

    if (e.type === "goal" && e.scorer) {
      const scorer = resolveCanonicalName(e.scorer || "");
      const s = ensure(scorer);
      if (s) s.goals += 1;
    }

    if (e.assist) {
      const assister = resolveCanonicalName(e.assist || "");
      const a = ensure(assister);
      if (a) a.assists += 1;
    }
  });

  Object.values(stats).forEach((s) => {
    s.points =
      Number(s.goals || 0) +
      Number(s.assists || 0) +
      Number(s.gkCleanSheets || 0) +
      Number(s.defCleanSheets || 0);
  });

  return stats;
}

function computeRawRating(playerStats, teamResultSummary) {
  let raw = 6.2;

  // modest team effect
  if (teamResultSummary) {
    raw += Number(teamResultSummary.wins || 0) * 0.14;
    raw += Number(teamResultSummary.draws || 0) * 0.05;
    raw -= Number(teamResultSummary.losses || 0) * 0.20;
  }

  // personal contribution matters more than team result
  raw += Number(playerStats?.goals || 0) * 0.62;
  raw += Number(playerStats?.assists || 0) * 0.36;
  raw += Number(playerStats?.gkCleanSheets || 0) * 0.42;
  raw += Number(playerStats?.defCleanSheets || 0) * 0.26;

  return clamp(5.8, raw, 9.4);
}

export function buildFormationDecorations({
  teamId,
  players = [],
  events = [],
  results = [],
  resolveCanonicalName,
}) {
  const safeResolve =
    typeof resolveCanonicalName === "function"
      ? resolveCanonicalName
      : (x) => String(x || "").trim();

  const statsByPlayer = buildMatchDayStatsByPlayer(events, safeResolve);
  const teamResultSummary = getTeamResultSummary(teamId, results);

  const out = {};

  (players || []).forEach((rawName) => {
    const canon = safeResolve(rawName);
    if (!canon) return;

    const stats = statsByPlayer[canon] || {
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      gkCleanSheets: 0,
      defCleanSheets: 0,
      points: 0,
    };

    const teamHasPlayed = Number(teamResultSummary?.played || 0) > 0;

    // Everyone on a team that has already played gets a rating.
    // Teams that have not played stay unrated.
    const rating = teamHasPlayed
      ? round1(computeRawRating(stats, teamResultSummary))
      : null;

    out[canon] = {
      rating,
      ratingLabel: rating != null ? rating.toFixed(1) : "",
      icons: {
        goals: Number(stats.goals || 0),
        assists: Number(stats.assists || 0),
        gkCS: Number(stats.gkCleanSheets || 0),
        defCS: Number(stats.defCleanSheets || 0),
      },
      stats,
      teamHasPlayed,
      rank: null,
      isTopPerformer: false,
    };
  });

  const ranked = Object.entries(out)
    .filter(([, value]) => value?.rating != null)
    .sort((a, b) => {
      const ar = Number(a[1].rating || 0);
      const br = Number(b[1].rating || 0);
      if (br !== ar) return br - ar;

      const aGoals = Number(a[1]?.icons?.goals || 0);
      const bGoals = Number(b[1]?.icons?.goals || 0);
      if (bGoals !== aGoals) return bGoals - aGoals;

      const aAssists = Number(a[1]?.icons?.assists || 0);
      const bAssists = Number(b[1]?.icons?.assists || 0);
      if (bAssists !== aAssists) return bAssists - aAssists;

      return String(a[0] || "").localeCompare(String(b[0] || ""));
    });

  ranked.forEach(([, value], index) => {
    const spread = Math.max(0, 0.12 - index * 0.03);
    const adjusted = clamp(5.8, Number(value.rating || 0) + spread, 9.6);

    value.rating = round1(adjusted);
    value.ratingLabel = value.rating.toFixed(1);
    value.rank = index + 1;
    value.isTopPerformer = index === 0;
  });

  return out;
}