// src/core/playerEventStats.js

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function defaultResolveName(value) {
  return String(value || "").trim();
}

/**
 * Shared player-stat aggregation for recorded match events.
 *
 * Used by StatsPage and, after the next wiring step, PlayerCardPage.
 *
 * Supported event types:
 *   goal
 *   clean_sheet
 *   defensive_block
 *
 * Assists are read from any event containing a valid `assist` value,
 * which preserves the current Friendly goal-assist behaviour.
 */
export function buildPlayerEventStats({
  events = [],
  resolveCanonicalName = defaultResolveName,
  resolveDisplayName = null,
  resolveTeamName = null,
} = {}) {
  const stats = {};

  const safeResolve =
    typeof resolveCanonicalName === "function"
      ? resolveCanonicalName
      : defaultResolveName;

  const getOrCreate = (rawName) => {
    const name = safeResolve(rawName);
    if (!name) return null;

    if (!stats[name]) {
      stats[name] = {
        name,
        displayName:
          typeof resolveDisplayName === "function"
            ? resolveDisplayName(name)
            : name,
        teamName:
          typeof resolveTeamName === "function"
            ? resolveTeamName(name)
            : "—",

        goals: 0,
        assists: 0,

        cleanSheets: 0,
        gkCleanSheets: 0,
        defCleanSheets: 0,

        defensiveBlocks: 0,
        gkDefensiveBlocks: 0,
        defDefensiveBlocks: 0,

        total: 0,
      };
    }

    return stats[name];
  };

  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event) return;

    if (event.type === "goal" && event.scorer) {
      const scorer = getOrCreate(event.scorer);
      if (scorer) scorer.goals += 1;
    }

    /*
     * Friendly assists are stored on the goal event itself.
     * This deliberately applies to both League and Friendly events.
     */
    if (event.assist) {
      const assister = getOrCreate(event.assist);
      if (assister) assister.assists += 1;
    }

    if (event.type === "clean_sheet") {
      const holder = getOrCreate(
        event.playerName || event.scorer || ""
      );

      if (holder) {
        holder.cleanSheets += 1;

        if (event.role === "gk") {
          holder.gkCleanSheets += 1;
        }

        if (event.role === "def") {
          holder.defCleanSheets += 1;
        }
      }
    }

    if (event.type === "defensive_block") {
      const holder = getOrCreate(
        event.playerName || event.scorer || ""
      );

      if (holder) {
        const blockCount = Math.max(
          1,
          safeNumber(event.blockCount, 1)
        );

        holder.defensiveBlocks += blockCount;

        if (event.role === "gk") {
          holder.gkDefensiveBlocks += blockCount;
        }

        if (event.role === "def") {
          holder.defDefensiveBlocks += blockCount;
        }
      }
    }
  });

  Object.values(stats).forEach((player) => {
    /*
     * One shared contribution total:
     *
     * League:
     *   goals + assists + clean sheets
     *
     * Friendly:
     *   goals + assists + five-minute Defensive Blocks
     *
     * The event filters used by each view determine which defensive
     * award type is present.
     */
    player.total =
      safeNumber(player.goals) +
      safeNumber(player.assists) +
      safeNumber(player.cleanSheets) +
      safeNumber(player.defensiveBlocks);
  });

  return Object.values(stats);
}

export default buildPlayerEventStats;
