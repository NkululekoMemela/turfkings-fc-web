// src/core/playerPositioning.js
//
// Pure positional-intelligence helpers.
//
// IMPORTANT:
// This module recommends positional tendency only.
// It does NOT mutate formations, live lineups, Firestore or player profiles.
//
// Behaviour inputs:
//   mentality: 1 defensive -> 5 attacking
//   shooting:  1 rarely shoots -> 5 shoots very often
//
// Mentality remains the stronger signal, but shooting is deliberately
// substantial enough to pull an adventurous / shoot-first defender forward.

export const DEFAULT_BEHAVIOUR_SCORE = 3;

const MENTALITY_WEIGHT = 0.65;
const SHOOTING_WEIGHT = 0.35;

export function normalizeBehaviourScore(value) {
  const numeric = Number(value);

  return Number.isInteger(numeric) &&
    numeric >= 1 &&
    numeric <= 5
    ? numeric
    : DEFAULT_BEHAVIOUR_SCORE;
}

export function buildPlayerPositionProfile(player = {}) {
  const mentality = normalizeBehaviourScore(player?.mentality);
  const shooting = normalizeBehaviourScore(player?.shooting);

  const attackingScore =
    mentality * MENTALITY_WEIGHT +
    shooting * SHOOTING_WEIGHT;

  const defensiveScore = 6 - attackingScore;

  /*
   * Five simple football tendencies.
   *
   * Box-to-Box deliberately occupies the centre:
   * a player may defend naturally but still move forward often
   * enough that treating them as a stay-back defender would be wrong.
   */
  let tendency = "box_to_box";

  if (attackingScore >= 4.15) {
    tendency = "very_attacking";
  } else if (attackingScore >= 3.25) {
    tendency = "attacking";
  } else if (attackingScore <= 1.85) {
    tendency = "very_defensive";
  } else if (attackingScore <= 2.75) {
    tendency = "defensive";
  }

  return {
    playerId:
      String(
        player?.id ||
        player?.playerId ||
        ""
      ).trim(),

    name:
      String(
        player?.fullName ||
        player?.shortName ||
        player?.name ||
        ""
      ).trim(),

    mentality,
    shooting,

    attackingScore: Number(attackingScore.toFixed(3)),
    defensiveScore: Number(defensiveScore.toFixed(3)),
    tendency,
  };
}

export function getPositionTendencyLabel(tendency = "") {
  switch (String(tendency || "").trim()) {
    case "very_defensive":
      return "Very Defensive";
    case "defensive":
      return "Defensive";
    case "box_to_box":
      return "Box-to-Box";
    case "attacking":
      return "Attacking";
    case "very_attacking":
      return "Very Attacking";
    default:
      return "Box-to-Box";
  }
}

function stablePlayerKey(profile = {}) {
  return String(
    profile?.playerId ||
    profile?.name ||
    ""
  ).toLowerCase();
}

export function rankPlayersForAttack(players = []) {
  return (Array.isArray(players) ? players : [])
    .map(buildPlayerPositionProfile)
    .sort((a, b) => {
      if (b.attackingScore !== a.attackingScore) {
        return b.attackingScore - a.attackingScore;
      }

      if (b.shooting !== a.shooting) {
        return b.shooting - a.shooting;
      }

      if (b.mentality !== a.mentality) {
        return b.mentality - a.mentality;
      }

      return stablePlayerKey(a).localeCompare(
        stablePlayerKey(b)
      );
    });
}

export function rankPlayersForDefence(players = []) {
  return (Array.isArray(players) ? players : [])
    .map(buildPlayerPositionProfile)
    .sort((a, b) => {
      if (b.defensiveScore !== a.defensiveScore) {
        return b.defensiveScore - a.defensiveScore;
      }

      if (a.shooting !== b.shooting) {
        return a.shooting - b.shooting;
      }

      if (a.mentality !== b.mentality) {
        return a.mentality - b.mentality;
      }

      return stablePlayerKey(a).localeCompare(
        stablePlayerKey(b)
      );
    });
}

// ---------------------------------------------------------
// FORMATION SLOT INTELLIGENCE
// ---------------------------------------------------------
//
// Converts the formation's existing football labels into broad
// positional families.
//
// This deliberately knows nothing about a particular formation.
// Therefore the same logic works across 5v5, 6v6, 7v7 and 11v11
// as long as the formation uses the recognised position labels.

const GOALKEEPER_SLOT_LABELS = new Set(["GK"]);

const DEFENSIVE_SLOT_LABELS = new Set([
  "DEF",
  "LB",
  "RB",
  "CB",
]);

const MIDFIELD_SLOT_LABELS = new Set([
  "MID",
  "LM",
  "RM",
  "CM",
  "CAM",
]);

const ATTACKING_SLOT_LABELS = new Set([
  "LW",
  "RW",
  "LF",
  "RF",
  "ST",
]);

export function getFormationSlotFamily(position = {}) {
  const label = String(
    typeof position === "string"
      ? position
      : position?.label || ""
  )
    .trim()
    .toUpperCase();

  if (GOALKEEPER_SLOT_LABELS.has(label)) {
    return "goalkeeper";
  }

  if (DEFENSIVE_SLOT_LABELS.has(label)) {
    return "defence";
  }

  if (MIDFIELD_SLOT_LABELS.has(label)) {
    return "midfield";
  }

  if (ATTACKING_SLOT_LABELS.has(label)) {
    return "attack";
  }

  return "unknown";
}

/*
 * Lower score = better behavioural fit for that slot.
 *
 * This is recommendation intelligence only.
 *
 * GK is intentionally excluded from mentality/shooting selection.
 * Goalkeeper choice must eventually come from goalkeeper-specific
 * information rather than pretending an attacking/defensive score
 * tells us who can actually keep goal.
 */
export function getPlayerSlotFitScore(player = {}, position = {}) {
  const family = getFormationSlotFamily(position);
  const profile = buildPlayerPositionProfile(player);

  if (family === "goalkeeper") {
    return null;
  }

  if (family === "defence") {
    return profile.attackingScore;
  }

  if (family === "attack") {
    return 6 - profile.attackingScore;
  }

  if (family === "midfield") {
    /*
     * Midfield prefers the centre of the behavioural scale.
     * A genuine Box-to-Box player therefore beats an extreme
     * attacker or extreme defender for a neutral midfield slot.
     */
    return Math.abs(profile.attackingScore - 3);
  }

  return Number.POSITIVE_INFINITY;
}

export function rankPlayersForFormationSlot(
  players = [],
  position = {}
) {
  const family = getFormationSlotFamily(position);

  if (family === "goalkeeper") {
    return [];
  }

  return (Array.isArray(players) ? players : [])
    .map((player, originalIndex) => ({
      player,
      originalIndex,
      fitScore: getPlayerSlotFitScore(player, position),
      profile: buildPlayerPositionProfile(player),
    }))
    .sort((a, b) => {
      const scoreDifference = a.fitScore - b.fitScore;

      if (Math.abs(scoreDifference) > 0.000001) {
        return scoreDifference;
      }

      /*
       * Deterministic tie-break:
       * preserve the incoming player order rather than randomly
       * changing recommendations between renders.
       */
      return a.originalIndex - b.originalIndex;
    });
}

// ---------------------------------------------------------
// WHOLE-LINEUP ASSIGNMENT
// ---------------------------------------------------------
//
// Finds the best combined assignment of UNIQUE players across
// all currently supported outfield formation slots.
//
// This is deliberately recommendation-only:
// - does not mutate a lineup
// - does not write Firestore
// - does not choose a goalkeeper
//
// Lower totalFitScore = better whole-team behavioural fit.
//
// We solve the formation globally rather than greedily.
// That matters because the best player for one individual slot
// may be even more valuable in another slot.

export function buildBestOutfieldAssignment(
  players = [],
  positions = []
) {
  const safePlayers = Array.isArray(players) ? players : [];
  const safePositions = Array.isArray(positions) ? positions : [];

  const outfieldPositions = safePositions.filter((position) => {
    const family = getFormationSlotFamily(position);

    return (
      family !== "goalkeeper" &&
      family !== "unknown"
    );
  });

  const unresolvedPositions = safePositions.filter((position) => {
    const family = getFormationSlotFamily(position);

    return (
      family === "goalkeeper" ||
      family === "unknown"
    );
  });

  if (!outfieldPositions.length) {
    return {
      assignments: [],
      unresolvedPositions,
      totalFitScore: 0,
      complete: true,
    };
  }

  if (safePlayers.length < outfieldPositions.length) {
    return {
      assignments: [],
      unresolvedPositions,
      totalFitScore: Number.POSITIVE_INFINITY,
      complete: false,
    };
  }

  let best = null;

  function search(
    positionIndex,
    usedPlayerIndexes,
    assignments,
    totalFitScore
  ) {
    if (positionIndex >= outfieldPositions.length) {
      if (
        !best ||
        totalFitScore < best.totalFitScore - 0.000001
      ) {
        best = {
          assignments: [...assignments],
          totalFitScore,
        };
      }

      return;
    }

    /*
     * Once the partial lineup is already worse than the best
     * complete lineup found, there is no reason to continue it.
     */
    if (
      best &&
      totalFitScore > best.totalFitScore + 0.000001
    ) {
      return;
    }

    const position = outfieldPositions[positionIndex];

    safePlayers.forEach((player, playerIndex) => {
      if (usedPlayerIndexes.has(playerIndex)) return;

      const fitScore = getPlayerSlotFitScore(
        player,
        position
      );

      if (!Number.isFinite(fitScore)) return;

      usedPlayerIndexes.add(playerIndex);

      assignments.push({
        position,
        player,
        fitScore,
        profile: buildPlayerPositionProfile(player),
      });

      search(
        positionIndex + 1,
        usedPlayerIndexes,
        assignments,
        totalFitScore + fitScore
      );

      assignments.pop();
      usedPlayerIndexes.delete(playerIndex);
    });
  }

  search(
    0,
    new Set(),
    [],
    0
  );

  return {
    assignments: best?.assignments || [],
    unresolvedPositions,
    totalFitScore:
      best?.totalFitScore ??
      Number.POSITIVE_INFINITY,
    complete: Boolean(best),
  };
}
