// src/core/matchDayFormationRatings.js

function clamp(min, val, max) {
  return Math.max(min, Math.min(max, val));
}

function round1(v) {
  return Math.round(Number(v || 0) * 10) / 10;
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function isFriendlyMode(value) {
  const v = safeLower(value);
  return v === "friendly" || v === "friendlies";
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

function getEventMinute(event) {
  const seconds = safeNumber(
    firstDefined(event?.timeSeconds, event?.seconds),
    NaN
  );

  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds / 60;
  }

  const minute = safeNumber(
    firstDefined(event?.minute, event?.timeMinute, event?.matchMinute),
    NaN
  );

  return Number.isFinite(minute) ? minute : 0;
}

function isDefensiveFriendlyRole(roleValue) {
  const role = safeLower(roleValue);

  return (
    role === "gk" ||
    role === "def" ||
    role.includes("goalkeeper") ||
    role.includes("keeper") ||
    role.includes("defender") ||
    role.includes("defence") ||
    role.includes("defense") ||
    role.includes("back") ||
    role.includes("cb") ||
    role.includes("lb") ||
    role.includes("rb")
  );
}

function getFriendlyDefensiveBonusForTeam({
  teamId,
  events = [],
  matchDurationMinutes = 60,
}) {
  const safeTeamId = String(teamId || "").trim();
  if (!safeTeamId) {
    return {
      ratingBonusGoals: 0,
      ratingBonusAssists: 0,
      cleanWindows: [],
    };
  }

  const duration = Math.max(0, safeNumber(matchDurationMinutes, 60));

  const concededMinutes = dedupeEvents(events)
    .filter((e) => e?.type === "goal")
    .filter((e) => {
      const scoringTeamId = String(e?.teamId || "").trim();
      return scoringTeamId && scoringTeamId !== safeTeamId;
    })
    .map(getEventMinute)
    .filter((minute) => Number.isFinite(minute))
    .map((minute) => clamp(0, minute, duration))
    .sort((a, b) => a - b);

  const checkpoints = [0, ...concededMinutes, duration];

  let ratingBonusGoals = 0;
  let ratingBonusAssists = 0;
  const cleanWindows = [];

  for (let i = 0; i < checkpoints.length - 1; i += 1) {
    const startMinute = checkpoints[i];
    const endMinute = checkpoints[i + 1];
    const cleanMinutes = Math.max(0, endMinute - startMinute);

    if (cleanMinutes <= 0) continue;

    const goalEquivalent = Math.floor(cleanMinutes / 10);
    const assistEquivalent = Math.floor(cleanMinutes / 7);

    ratingBonusGoals += goalEquivalent;
    ratingBonusAssists += assistEquivalent;

    cleanWindows.push({
      startMinute,
      endMinute,
      cleanMinutes,
      goalEquivalent,
      assistEquivalent,
    });
  }

  return {
    ratingBonusGoals,
    ratingBonusAssists,
    cleanWindows,
  };
}

export function buildMatchDayStatsByPlayer(events = [], resolveCanonicalName) {
  const stats = {};

  const safeResolve =
    typeof resolveCanonicalName === "function"
      ? resolveCanonicalName
      : (x) => String(x || "").trim();

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
      const holder = safeResolve(e.playerName || e.scorer || "");
      const s = ensure(holder);
      if (!s) return;

      s.cleanSheets += 1;
      if (e.role === "gk") s.gkCleanSheets += 1;
      if (e.role === "def") s.defCleanSheets += 1;
      return;
    }

    if (e.type === "goal" && e.scorer) {
      const scorer = safeResolve(e.scorer || "");
      const s = ensure(scorer);
      if (s) s.goals += 1;
    }

    if (e.assist) {
      const assister = safeResolve(e.assist || "");
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

function computeRawRating(playerStats, teamResultSummary, ratingMode = "LEAGUE") {
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

  // Friendlies-only defensive rating support.
  // These do NOT change the real stats table. They only improve the rating.
  if (isFriendlyMode(ratingMode)) {
    raw += Number(playerStats?.friendlyRatingBonusGoals || 0) * 0.62;
    raw += Number(playerStats?.friendlyRatingBonusAssists || 0) * 0.36;
  }

  return clamp(5.8, raw, 9.4);
}

export function buildFormationDecorations({
  teamId,
  players = [],
  events = [],
  results = [],
  resolveCanonicalName,
  ratingMode = "LEAGUE",
  matchType = "",
  matchDurationMinutes = 60,
}) {
  const safeResolve =
    typeof resolveCanonicalName === "function"
      ? resolveCanonicalName
      : (x) => String(x || "").trim();

  const effectiveRatingMode = isFriendlyMode(matchType)
    ? "FRIENDLY"
    : isFriendlyMode(ratingMode)
      ? "FRIENDLY"
      : "LEAGUE";

  const statsByPlayer = buildMatchDayStatsByPlayer(events, safeResolve);
  const teamResultSummary = getTeamResultSummary(teamId, results);

  const friendlyDefensiveTeamBonus =
    effectiveRatingMode === "FRIENDLY"
      ? getFriendlyDefensiveBonusForTeam({
          teamId,
          events,
          matchDurationMinutes,
        })
      : {
          ratingBonusGoals: 0,
          ratingBonusAssists: 0,
          cleanWindows: [],
        };

  const out = {};

  (players || []).forEach((playerEntry) => {
    const rawName =
      typeof playerEntry === "string"
        ? playerEntry
        : firstDefined(
            playerEntry?.name,
            playerEntry?.playerName,
            playerEntry?.displayName,
            playerEntry?.fullName
          );

    const canon = safeResolve(rawName);
    if (!canon) return;

    const baseStats = statsByPlayer[canon] || {
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      gkCleanSheets: 0,
      defCleanSheets: 0,
      points: 0,
    };

    const role =
      typeof playerEntry === "string"
        ? baseStats?.role
        : firstDefined(
            playerEntry?.role,
            playerEntry?.position,
            playerEntry?.lineupRole,
            playerEntry?.ratingRole,
            playerEntry?.formationRole,
            playerEntry?.positionLabel,
            baseStats?.role
          );

    const receivesFriendlyDefensiveBonus =
      effectiveRatingMode === "FRIENDLY" && isDefensiveFriendlyRole(role);

    const stats = {
      ...baseStats,
      friendlyRatingBonusGoals: receivesFriendlyDefensiveBonus
        ? friendlyDefensiveTeamBonus.ratingBonusGoals
        : 0,
      friendlyRatingBonusAssists: receivesFriendlyDefensiveBonus
        ? friendlyDefensiveTeamBonus.ratingBonusAssists
        : 0,
      friendlyRatingCleanWindows: receivesFriendlyDefensiveBonus
        ? friendlyDefensiveTeamBonus.cleanWindows
        : [],
    };

    stats.points =
      Number(stats.goals || 0) +
      Number(stats.assists || 0) +
      Number(stats.gkCleanSheets || 0) +
      Number(stats.defCleanSheets || 0);

    const hasAnyFriendlyEvent = dedupeEvents(events).some(
      (e) => e?.type === "goal" || e?.type === "shibobo" || e?.type === "rotation"
    );

    const teamHasPlayed =
      effectiveRatingMode === "FRIENDLY"
        ? hasAnyFriendlyEvent ||
          Number(friendlyDefensiveTeamBonus.cleanWindows?.length || 0) > 0
        : Number(teamResultSummary?.played || 0) > 0;

    // Everyone on a team that has already played gets a rating.
    // Teams that have not played stay unrated.
    const rating = teamHasPlayed
      ? round1(computeRawRating(stats, teamResultSummary, effectiveRatingMode))
      : null;

    out[canon] = {
      rating,
      ratingLabel: rating != null ? rating.toFixed(1) : "",
      icons: {
        goals: Number(stats.goals || 0),
        assists: Number(stats.assists || 0),
        gkCS: Number(stats.gkCleanSheets || 0),
        defCS: Number(stats.defCleanSheets || 0),

        // Friendlies-only rating metadata.
        // These are deliberately separate from real goals/assists.
        friendlyRatingBonusGoals: Number(stats.friendlyRatingBonusGoals || 0),
        friendlyRatingBonusAssists: Number(stats.friendlyRatingBonusAssists || 0),
      },
      stats,
      teamHasPlayed,
      rank: null,
      isTopPerformer: false,
      ratingMode: effectiveRatingMode,
    };
  });

  const ranked = Object.entries(out)
    .filter(([, value]) => value?.rating != null)
    .sort((a, b) => {
      const ar = Number(a[1].rating || 0);
      const br = Number(b[1].rating || 0);
      if (br !== ar) return br - ar;

      const aGoals =
        Number(a[1]?.icons?.goals || 0) +
        Number(a[1]?.icons?.friendlyRatingBonusGoals || 0);
      const bGoals =
        Number(b[1]?.icons?.goals || 0) +
        Number(b[1]?.icons?.friendlyRatingBonusGoals || 0);
      if (bGoals !== aGoals) return bGoals - aGoals;

      const aAssists =
        Number(a[1]?.icons?.assists || 0) +
        Number(a[1]?.icons?.friendlyRatingBonusAssists || 0);
      const bAssists =
        Number(b[1]?.icons?.assists || 0) +
        Number(b[1]?.icons?.friendlyRatingBonusAssists || 0);
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