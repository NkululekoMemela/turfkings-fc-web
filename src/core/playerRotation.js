// src/core/playerRotation.js
//
// Shared player-rotation foundations for FANM.
//
// IMPORTANT:
// - Pure football logic only.
// - No React.
// - No Firestore.
// - No Official/Practice branching.
// - No automatic UI mutation.
//
// Official and Practice therefore consume exactly the same rules.
//
// This module is deliberately separate from core/rotation.js.
// core/rotation.js controls THREE-TEAM MATCH rotation
// (winner stays / standby team enters).
//
// This file controls PLAYER participation and availability.

// ---------------------------------------------------------
// PLAYER AVAILABILITY
// ---------------------------------------------------------

export const PLAYER_AVAILABILITY = Object.freeze({
  ELIGIBLE: "eligible",
  LATE: "late",
  TEMPORARILY_SUSPENDED: "temporarily_suspended",
  PERMANENTLY_DISMISSED: "permanently_dismissed",
  INJURED: "injured",
  LEFT_EARLY: "left_early",
});

export function normalizePlayerAvailability(value = "") {
  const safe = String(value || "")
    .trim()
    .toLowerCase();

  return Object.values(PLAYER_AVAILABILITY).includes(safe)
    ? safe
    : PLAYER_AVAILABILITY.ELIGIBLE;
}

export function isPlayerEligibleForRotation(player = {}) {
  return (
    normalizePlayerAvailability(player?.availability) ===
    PLAYER_AVAILABILITY.ELIGIBLE
  );
}

export function filterEligibleRotationPlayers(players = []) {
  return (Array.isArray(players) ? players : []).filter(
    isPlayerEligibleForRotation
  );
}

// ---------------------------------------------------------
// LINEUP HELPERS
// ---------------------------------------------------------

function safeName(value = "") {
  return String(value || "").trim();
}

function playerKey(value = "") {
  return safeName(
    typeof value === "string"
      ? value
      : value?.name ||
        value?.fullName ||
        value?.shortName ||
        value?.playerName ||
        value?.id
  ).toLowerCase();
}

export function getLineupOnFieldPlayers(snapshot = {}) {
  return Object.values(snapshot?.positions || {})
    .map(safeName)
    .filter(Boolean);
}

export function getLineupBenchPlayers(snapshot = {}) {
  const onFieldKeys = new Set(
    getLineupOnFieldPlayers(snapshot).map(playerKey)
  );

  const seen = new Set();

  return (Array.isArray(snapshot?.benchSnapshot)
    ? snapshot.benchSnapshot
    : []
  )
    .map(safeName)
    .filter(Boolean)
    .filter((name) => {
      const key = playerKey(name);

      if (!key || onFieldKeys.has(key) || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function wasPlayerOnBench(snapshot = {}, player = "") {
  const target = playerKey(player);

  if (!target) return false;

  return getLineupBenchPlayers(snapshot).some(
    (name) => playerKey(name) === target
  );
}

export function wasPlayerOnField(snapshot = {}, player = "") {
  const target = playerKey(player);

  if (!target) return false;

  return getLineupOnFieldPlayers(snapshot).some(
    (name) => playerKey(name) === target
  );
}

// ---------------------------------------------------------
// THREE-TEAM LEAGUE:
// PREVIOUS TEAM APPEARANCE
// ---------------------------------------------------------
//
// A team's previous appearance is NOT necessarily the previous
// match in the tournament.
//
// Example:
//
// Match 1: A v B
// Match 2: B v C
// Match 3: A v C
//
// For Team A in Match 3, its previous appearance is Match 1.
//
// This function deliberately works from match history rather
// than assuming consecutive fixtures.

export function getPreviousTeamAppearance(
  matchHistory = [],
  teamId = "",
  beforeMatchNo = Number.POSITIVE_INFINITY
) {
  const safeTeamId = String(teamId || "").trim();

  if (!safeTeamId) return null;

  const candidates = (Array.isArray(matchHistory)
    ? matchHistory
    : []
  )
    .filter((entry) => {
      const matchNo = Number(entry?.matchNo || 0);

      return (
        Number.isFinite(matchNo) &&
        matchNo > 0 &&
        matchNo < Number(beforeMatchNo) &&
        (
          String(entry?.teamAId || "") === safeTeamId ||
          String(entry?.teamBId || "") === safeTeamId
        )
      );
    })
    .sort(
      (a, b) =>
        Number(b?.matchNo || 0) -
        Number(a?.matchNo || 0)
    );

  return candidates[0] || null;
}

export function getTeamLineupFromMatchRecord(
  matchRecord = {},
  teamId = ""
) {
  const safeTeamId = String(teamId || "").trim();

  if (!safeTeamId) return null;

  const snapshots =
    matchRecord?.confirmedLineupSnapshot ||
    matchRecord?.verifiedLineups ||
    matchRecord?.lineups ||
    null;

  return snapshots?.[safeTeamId] || null;
}

// ---------------------------------------------------------
// NEXT-STARTER CANDIDATE
// ---------------------------------------------------------
//
// For ThreeTeamLeague:
//
// If the team had a substitute in its previous appearance,
// that substitute gets first right to start the team's next
// appearance.
//
// The first bench player is intentional because benchSnapshot
// is already an ordered rotation queue.
//
// Eligibility is applied BEFORE selecting the candidate.
//
// Later:
// - second-yellow suspension
// - permanent red
// - injury
// - left early
//
// will simply mark that player unavailable and this function
// will skip them.

export function getNextStarterFromPreviousBench({
  previousLineup = null,
  playerStates = [],
} = {}) {
  if (!previousLineup) return null;

  const availabilityByKey = new Map(
    (Array.isArray(playerStates) ? playerStates : []).map(
      (player) => [
        playerKey(player),
        normalizePlayerAvailability(player?.availability),
      ]
    )
  );

  const bench = getLineupBenchPlayers(previousLineup);

  for (const name of bench) {
    const key = playerKey(name);

    const availability =
      availabilityByKey.get(key) ||
      PLAYER_AVAILABILITY.ELIGIBLE;

    if (
      availability === PLAYER_AVAILABILITY.ELIGIBLE
    ) {
      return name;
    }
  }

  return null;
}

// ---------------------------------------------------------
// THREE-TEAM NEXT-APPEARANCE ROTATION CONTEXT
// ---------------------------------------------------------

export function buildNextTeamAppearanceRotationContext({
  teamId = "",
  nextMatchNo,
  matchHistory = [],
  playerStates = [],
} = {}) {
  const previousAppearance =
    getPreviousTeamAppearance(
      matchHistory,
      teamId,
      nextMatchNo
    );

  const previousLineup =
    getTeamLineupFromMatchRecord(
      previousAppearance,
      teamId
    );

  const incomingStarter =
    getNextStarterFromPreviousBench({
      previousLineup,
      playerStates,
    });

  return {
    teamId: String(teamId || "").trim() || null,
    nextMatchNo: Number(nextMatchNo || 0) || null,

    previousAppearanceMatchNo:
      Number(previousAppearance?.matchNo || 0) || null,

    previousAppearance,
    previousLineup,

    previousOnField:
      getLineupOnFieldPlayers(previousLineup || {}),

    previousBench:
      getLineupBenchPlayers(previousLineup || {}),

    incomingStarter,

    /*
     * Our agreed football rule:
     * a returning previous substitute starts the next
     * team appearance as goalkeeper by default.
     *
     * The actual GK slot mutation comes in Stage 5C.
     */
    incomingStarterShouldBeGoalkeeper:
      Boolean(incomingStarter),
  };
}

// ---------------------------------------------------------
// STAGE 5B — NEXT TEAM APPEARANCE PARTICIPATION ROTATION
// ---------------------------------------------------------
//
// ThreeTeamLeague short-match rule:
//
// If a team has more registered players than available formation
// slots, somebody who sat on the bench during that team's previous
// appearance gets first right to START the team's next appearance.
//
// IMPORTANT:
//
// This stage decides participation only.
//
// It does NOT yet:
// - put the incoming starter at GK
// - move the previous GK into an outfield position
// - use mentality/shooting to choose the former GK's best slot
//
// Those are Stage 5C/5D responsibilities.
//
// This separation keeps the rules testable:
// 5B = WHO must start / WHO must sit
// 5C = incoming starter begins at GK
// 5D = remaining outfield players are intelligently positioned.

export function buildNextAppearanceParticipationRotation({
  previousLineup = null,
  registeredPlayers = [],
  playerStates = [],
} = {}) {
  if (!previousLineup) {
    return {
      rotationRequired: false,
      reason: "no_previous_lineup",
      incomingStarter: null,
      outgoingStarter: null,
      nextStartingPlayers: [],
      nextBenchPlayers: [],
    };
  }

  const previousOnField =
    getLineupOnFieldPlayers(previousLineup);

  const previousBench =
    getLineupBenchPlayers(previousLineup);

  const registered = Array.isArray(registeredPlayers)
    ? registeredPlayers
    : [];

  const availabilityByKey = new Map(
    (Array.isArray(playerStates) ? playerStates : []).map(
      (player) => [
        playerKey(player),
        normalizePlayerAvailability(player?.availability),
      ]
    )
  );

  const registeredNameByKey = new Map();

  registered.forEach((player) => {
    const name = safeName(
      typeof player === "string"
        ? player
        : player?.name ||
          player?.fullName ||
          player?.shortName ||
          player?.playerName ||
          player?.id
    );

    const key = playerKey(player);

    if (key && name && !registeredNameByKey.has(key)) {
      registeredNameByKey.set(key, name);
    }
  });

  const isEligibleName = (name) => {
    const key = playerKey(name);

    if (!key) return false;

    return (
      (
        availabilityByKey.get(key) ||
        PLAYER_AVAILABILITY.ELIGIBLE
      ) === PLAYER_AVAILABILITY.ELIGIBLE
    );
  };

  /*
   * Keep only currently registered + eligible players.
   *
   * If registeredPlayers is empty, preserve backwards compatibility
   * with the previous lineup snapshot rather than pretending nobody
   * exists.
   */
  const registeredKeys = new Set(
    registeredNameByKey.keys()
  );

  const isRegistered = (name) => {
    if (registeredKeys.size === 0) return true;
    return registeredKeys.has(playerKey(name));
  };

  const eligiblePreviousStarters =
    previousOnField.filter(
      (name) =>
        isRegistered(name) &&
        isEligibleName(name)
    );

  const eligiblePreviousBench =
    previousBench.filter(
      (name) =>
        isRegistered(name) &&
        isEligibleName(name)
    );

  /*
   * Ordered benchSnapshot is the rotation queue.
   * The first eligible previous substitute gets first right
   * to enter the next starting lineup.
   */
  const incomingStarter =
    eligiblePreviousBench[0] || null;

  const requiredStartingCount =
    previousOnField.length;

  if (!incomingStarter) {
    return {
      rotationRequired: false,
      reason:
        previousBench.length > 0
          ? "no_eligible_previous_substitute"
          : "no_previous_substitute",
      incomingStarter: null,
      outgoingStarter: null,
      nextStartingPlayers:
        eligiblePreviousStarters.slice(
          0,
          requiredStartingCount
        ),
      nextBenchPlayers:
        eligiblePreviousBench.slice(),
    };
  }

  /*
   * Stage 5B deliberately rotates participation fairly.
   *
   * The outgoing starter is the LAST eligible player from the
   * previous starting order.
   *
   * We are NOT claiming that this is the final football-position
   * decision. Stage 5C/5D will rebuild the actual pitch assignment
   * using GK rotation + positional intelligence.
   *
   * Keeping this deterministic is important: the same previous
   * snapshot must always produce the same participation result.
   */
  const outgoingStarter =
    eligiblePreviousStarters.length >=
    requiredStartingCount
      ? eligiblePreviousStarters[
          eligiblePreviousStarters.length - 1
        ]
      : null;

  let nextStartingPlayers =
    eligiblePreviousStarters.slice();

  if (outgoingStarter) {
    const outgoingKey =
      playerKey(outgoingStarter);

    nextStartingPlayers =
      nextStartingPlayers.filter(
        (name) =>
          playerKey(name) !== outgoingKey
      );
  }

  if (
    !nextStartingPlayers.some(
      (name) =>
        playerKey(name) ===
        playerKey(incomingStarter)
    )
  ) {
    nextStartingPlayers.push(incomingStarter);
  }

  /*
   * Never exceed the previous formation's number of pitch slots.
   */
  nextStartingPlayers =
    nextStartingPlayers.slice(
      0,
      requiredStartingCount
    );

  const startingKeys = new Set(
    nextStartingPlayers.map(playerKey)
  );

  const nextBenchPlayers = [];

  const addBench = (name) => {
    const clean = safeName(name);
    const key = playerKey(clean);

    if (
      !clean ||
      !key ||
      startingKeys.has(key) ||
      !isRegistered(clean) ||
      !isEligibleName(clean) ||
      nextBenchPlayers.some(
        (existing) =>
          playerKey(existing) === key
      )
    ) {
      return;
    }

    nextBenchPlayers.push(clean);
  };

  /*
   * The player who just came off gets the back of the queue.
   * Remaining previous substitutes retain their order ahead
   * of that player.
   */
  eligiblePreviousBench
    .slice(1)
    .forEach(addBench);

  addBench(outgoingStarter);

  /*
   * Include any newly registered eligible player who was not
   * represented in the previous snapshot.
   */
  registeredNameByKey.forEach((name) => {
    addBench(name);
  });

  return {
    rotationRequired: true,
    reason: "previous_substitute_enters",
    incomingStarter,
    outgoingStarter,
    nextStartingPlayers,
    nextBenchPlayers,
  };
}

// ---------------------------------------------------------
// STAGE 5C — INCOMING ROTATION PLAYER STARTS AS GOALKEEPER
// ---------------------------------------------------------
//
// Converts the Stage 5B participation decision into the first
// positional constraint for the team's next appearance.
//
// Rule:
// The eligible player entering from the previous bench MUST begin
// the team's next appearance in the formation's goalkeeper slot.
//
// IMPORTANT:
// - Formation catalogue is authoritative.
// - We discover GK by label, never by hardcoded slot ID.
// - Outfield assignment deliberately remains unresolved here.
// - Stage 5D will intelligently assign the remaining starters.
// - Pure logic: no React, Firestore or Official/Practice branching.

export function buildNextAppearanceGoalkeeperConstraint({
  participationRotation = null,
  formation = null,
} = {}) {
  const positions = Array.isArray(formation?.positions)
    ? formation.positions
    : [];

  const goalkeeperPosition =
    positions.find(
      (position) =>
        String(position?.label || "")
          .trim()
          .toUpperCase() === "GK"
    ) || null;

  if (!goalkeeperPosition) {
    return {
      resolved: false,
      reason: "goalkeeper_slot_not_found",
      goalkeeperPositionId: null,
      goalkeeperPlayer: null,
      positions: {},
      outfieldPlayers: [],
    };
  }

  const startingPlayers = Array.isArray(
    participationRotation?.nextStartingPlayers
  )
    ? participationRotation.nextStartingPlayers
    : [];

  const incomingStarter =
    safeName(
      participationRotation?.incomingStarter
    ) || null;

  /*
   * No participation rotation means there is no special
   * "incoming substitute must start at GK" constraint.
   *
   * We intentionally do NOT invent a goalkeeper here.
   */
  if (
    !participationRotation?.rotationRequired ||
    !incomingStarter
  ) {
    return {
      resolved: false,
      reason: "no_incoming_rotation_player",
      goalkeeperPositionId: goalkeeperPosition.id,
      goalkeeperPlayer: null,
      positions: {},
      outfieldPlayers: startingPlayers.slice(),
    };
  }

  const incomingKey = playerKey(incomingStarter);

  const incomingIsStarter =
    startingPlayers.some(
      (name) =>
        playerKey(name) === incomingKey
    );

  if (!incomingIsStarter) {
    return {
      resolved: false,
      reason: "incoming_player_not_in_starting_group",
      goalkeeperPositionId: goalkeeperPosition.id,
      goalkeeperPlayer: null,
      positions: {},
      outfieldPlayers: startingPlayers.slice(),
    };
  }

  const outfieldPlayers =
    startingPlayers.filter(
      (name) =>
        playerKey(name) !== incomingKey
    );

  return {
    resolved: true,
    reason: "incoming_rotation_player_starts_as_goalkeeper",
    goalkeeperPositionId: goalkeeperPosition.id,
    goalkeeperPlayer: incomingStarter,

    /*
     * Only GK is assigned at Stage 5C.
     * Stage 5D owns every outfield position.
     */
    positions: {
      [goalkeeperPosition.id]: incomingStarter,
    },

    outfieldPlayers,
  };
}

// ---------------------------------------------------------
// STAGE 5D — INTELLIGENT OUTFIELD REBUILD
// ---------------------------------------------------------
//
// Completes the next-appearance lineup after:
//
// 5B = participation rotation
// 5C = incoming substitute starts at goalkeeper
//
// Stage 5D does NOT choose who participates.
// It positions only the players already selected by Stage 5B.
//
// The positional engine receives the players' real profile objects so
// mentality + shooting remain available to the assignment algorithm.
//
// Pure logic:
// - no React
// - no Firestore
// - no Official/Practice branching

export function buildNextAppearanceOutfieldAssignment({
  participationRotation = null,
  goalkeeperConstraint = null,
  formation = null,
  registeredPlayers = [],
  buildBestOutfieldAssignment = null,
} = {}) {
  if (
    !goalkeeperConstraint?.resolved ||
    !goalkeeperConstraint?.goalkeeperPlayer
  ) {
    return {
      resolved: false,
      reason: "goalkeeper_constraint_not_resolved",
      formationId: formation?.id || null,
      positions: {},
      benchPlayers:
        participationRotation?.nextBenchPlayers?.slice?.() || [],
      assignments: [],
      totalFitScore: Number.POSITIVE_INFINITY,
    };
  }

  if (typeof buildBestOutfieldAssignment !== "function") {
    return {
      resolved: false,
      reason: "positioning_engine_not_provided",
      formationId: formation?.id || null,
      positions: {
        ...(goalkeeperConstraint.positions || {}),
      },
      benchPlayers:
        participationRotation?.nextBenchPlayers?.slice?.() || [],
      assignments: [],
      totalFitScore: Number.POSITIVE_INFINITY,
    };
  }

  const safeRegisteredPlayers =
    Array.isArray(registeredPlayers)
      ? registeredPlayers
      : [];

  /*
   * Resolve the Stage 5C starter names back to their full player
   * profile objects.
   *
   * This is essential because mentality and shooting live on those
   * objects and must reach playerPositioning.js.
   */
  const registeredByKey = new Map();

  safeRegisteredPlayers.forEach((player) => {
    const key = playerKey(player);

    if (key && !registeredByKey.has(key)) {
      registeredByKey.set(key, player);
    }
  });

  const outfieldStarterNames =
    Array.isArray(goalkeeperConstraint?.outfieldPlayers)
      ? goalkeeperConstraint.outfieldPlayers
      : [];

  const outfieldPlayers =
    outfieldStarterNames.map((name) => {
      const existing =
        registeredByKey.get(playerKey(name));

      if (existing) return existing;

      /*
       * Backwards-compatible fallback.
       * The positional engine will apply its normal neutral defaults
       * if this older player has no mentality/shooting data.
       */
      return {
        name: safeName(name),
      };
    });

  const formationPositions =
    Array.isArray(formation?.positions)
      ? formation.positions
      : [];

  const assignment =
    buildBestOutfieldAssignment(
      outfieldPlayers,
      formationPositions
    );

  if (!assignment?.complete) {
    return {
      resolved: false,
      reason: "outfield_assignment_incomplete",
      formationId: formation?.id || null,
      positions: {
        ...(goalkeeperConstraint.positions || {}),
      },
      benchPlayers:
        participationRotation?.nextBenchPlayers?.slice?.() || [],
      assignments: assignment?.assignments || [],
      totalFitScore:
        assignment?.totalFitScore ??
        Number.POSITIVE_INFINITY,
    };
  }

  const positions = {
    ...(goalkeeperConstraint.positions || {}),
  };

  assignment.assignments.forEach((entry) => {
    const positionId =
      String(entry?.position?.id || "").trim();

    const playerName =
      safeName(
        entry?.player?.fullName ||
        entry?.player?.shortName ||
        entry?.player?.name ||
        entry?.profile?.name
      );

    if (positionId && playerName) {
      positions[positionId] = playerName;
    }
  });

  return {
    resolved: true,
    reason: "next_appearance_lineup_resolved",
    formationId: formation?.id || null,

    goalkeeperPlayer:
      goalkeeperConstraint.goalkeeperPlayer,

    positions,

    /*
     * Stage 5B remains authoritative for who sits out.
     */
    benchPlayers:
      participationRotation?.nextBenchPlayers?.slice?.() || [],

    assignments: assignment.assignments || [],
    totalFitScore: assignment.totalFitScore,
  };
}

// ---------------------------------------------------------
// STAGE 5E — PREVIOUS TEAM APPEARANCE FROM CONFIRMED HISTORY
// ---------------------------------------------------------
//
// ThreeTeamLeague rotation follows the TEAM'S previous appearance,
// not simply the immediately preceding tournament match.
//
// Example:
// Match 1: A v B
// Match 2: B v C
// Match 3: A v C
//
// Team A's rotation input for Match 3 is its confirmed Match 1
// lineup. Match 2 is irrelevant to Team A.
//
// confirmedLineupsByMatchNo has the shape:
//
// {
//   1: { teamAId: snapshot, teamBId: snapshot },
//   2: { teamBId: snapshot, teamCId: snapshot },
//   ...
// }
//
// Pure logic:
// - no React
// - no Firestore
// - no Official/Practice branching

export function findPreviousConfirmedTeamAppearance({
  teamId = null,
  currentMatchNo = null,
  confirmedLineupsByMatchNo = {},
} = {}) {
  const safeTeamId = String(teamId || "").trim();
  const safeCurrentMatchNo = Number(currentMatchNo);

  if (!safeTeamId || !Number.isFinite(safeCurrentMatchNo)) {
    return {
      found: false,
      reason: "invalid_current_match_or_team",
      matchNo: null,
      snapshot: null,
    };
  }

  const previousMatchNumbers = Object.keys(
    confirmedLineupsByMatchNo || {}
  )
    .map(Number)
    .filter(
      (matchNo) =>
        Number.isFinite(matchNo) &&
        matchNo < safeCurrentMatchNo
    )
    .sort((a, b) => b - a);

  for (const matchNo of previousMatchNumbers) {
    const bundle =
      confirmedLineupsByMatchNo?.[matchNo] ||
      confirmedLineupsByMatchNo?.[String(matchNo)] ||
      null;

    const snapshot = bundle?.[safeTeamId] || null;

    if (snapshot) {
      return {
        found: true,
        reason: "previous_team_appearance_found",
        matchNo,
        snapshot,
      };
    }
  }

  return {
    found: false,
    reason: "no_previous_team_appearance",
    matchNo: null,
    snapshot: null,
  };
}

// ---------------------------------------------------------
// STAGE 5G — FRIENDLY IN-MATCH PLAYER ROTATION
// ---------------------------------------------------------
//
// Longer Friendly matches rotate DURING the match.
//
// Referee interaction:
//
//   1. select a bench player
//   2. tap the outfield player who is coming off
//
// Football rule:
//
//   incoming substitute -> GK
//   existing GK         -> returns to outfield
//   tapped outfield     -> bench
//   remaining outfield  -> rebuilt using mentality + shooting
//
// The referee therefore decides WHO leaves the pitch.
// The app decides the resulting positions.
//
// The existing goalkeeper cannot be selected as the outgoing player
// for this automatic operation because the rule explicitly rotates
// that goalkeeper back into the outfield.
//
// Pure logic:
// - no React
// - no Firestore
// - no Official/Practice branching

export function buildFriendlyInMatchRotation({
  currentLineup = null,
  incomingPlayer = "",
  outgoingPlayer = "",
  formation = null,
  registeredPlayers = [],
  buildBestOutfieldAssignment = null,
  protectedVacancies = {},
} = {}) {
  const formationPositions =
    Array.isArray(formation?.positions)
      ? formation.positions
      : [];

  const goalkeeperPosition =
    formationPositions.find(
      (position) =>
        String(position?.label || "")
          .trim()
          .toUpperCase() === "GK"
    ) || null;

  if (!goalkeeperPosition) {
    return {
      resolved: false,
      reason: "goalkeeper_slot_not_found",
    };
  }

  if (typeof buildBestOutfieldAssignment !== "function") {
    return {
      resolved: false,
      reason: "positioning_engine_not_provided",
    };
  }

  const incomingName = safeName(incomingPlayer);
  const outgoingName = safeName(outgoingPlayer);

  if (!incomingName || !outgoingName) {
    return {
      resolved: false,
      reason: "incoming_or_outgoing_player_missing",
    };
  }

  const currentPositions = {
    ...(currentLineup?.positions || {}),
  };

  const currentGoalkeeper = safeName(
    currentPositions?.[goalkeeperPosition.id]
  );

  if (!currentGoalkeeper) {
    return {
      resolved: false,
      reason: "current_goalkeeper_missing",
    };
  }

  const currentOnField =
    getLineupOnFieldPlayers(currentLineup);

  const currentBench =
    getLineupBenchPlayers(currentLineup);

  const incomingKey = playerKey(incomingName);
  const outgoingKey = playerKey(outgoingName);
  const currentGoalkeeperKey =
    playerKey(currentGoalkeeper);

  const incomingIsOnBench =
    currentBench.some(
      (name) =>
        playerKey(name) === incomingKey
    );

  if (!incomingIsOnBench) {
    return {
      resolved: false,
      reason: "incoming_player_not_on_bench",
    };
  }

  const outgoingIsOnField =
    currentOnField.some(
      (name) =>
        playerKey(name) === outgoingKey
    );

  if (!outgoingIsOnField) {
    return {
      resolved: false,
      reason: "outgoing_player_not_on_field",
    };
  }

  /*
   * The existing GK must rotate into the outfield.
   * Therefore the referee selects an OUTFIELD player to leave.
   */
  if (outgoingKey === currentGoalkeeperKey) {
    return {
      resolved: false,
      reason: "current_goalkeeper_must_rotate_outfield",
      currentGoalkeeper,
    };
  }

  /*
   * The incoming substitute is now fixed at GK.
   *
   * Everyone who was already on the field remains available for
   * outfield assignment EXCEPT the player deliberately substituted.
   *
   * This guarantees the previous goalkeeper remains on the field.
   */
  const nextOutfieldNames =
    currentOnField.filter(
      (name) =>
        playerKey(name) !== outgoingKey
    );

  const registeredByKey = new Map();

  (Array.isArray(registeredPlayers)
    ? registeredPlayers
    : []
  ).forEach((player) => {
    const key = playerKey(player);

    if (key && !registeredByKey.has(key)) {
      registeredByKey.set(key, player);
    }
  });

  const richOutfieldPlayers =
    nextOutfieldNames.map((name) => {
      const rich =
        registeredByKey.get(playerKey(name));

      if (rich) {
        return {
          ...rich,
          name:
            rich?.fullName ||
            rich?.shortName ||
            rich?.name ||
            name,
        };
      }

      /*
       * Guest/legacy fallback.
       * playerPositioning.js will apply neutral defaults.
       */
      return {
        name,
      };
    });

  /*
   * A live lineup can legitimately contain fewer players than the
   * formation has slots.
   *
   * Examples:
   * - an ordinary vacancy inherited from an earlier lineup problem;
   * - a disciplinary vacancy caused by a red card.
   *
   * Stage 5G must not fail merely because such a vacancy exists.
   * We therefore ask the positioning engine to assign only as many
   * outfield slots as we actually have outfield players.
   *
   * Locked disciplinary positions are excluded completely so the
   * automatic rotation can never silently fill a red-card vacancy.
   *
   * Ordinary empty positions remain eligible. If there are fewer
   * players than available slots, the unused slot simply remains
   * empty.
   */
  const availableOutfieldPositions =
    formationPositions.filter((position) => {
      const label = String(position?.label || "")
        .trim()
        .toUpperCase();

      if (label === "GK") return false;

      /*
       * Any disciplinary vacancy is outside automatic rotation.
       *
       * locked=true:
       *   team must remain short.
       *
       * replacementAllowed=true:
       *   referee chooses who fills the vacancy.
       *
       * In neither case should positional intelligence fill it
       * automatically.
       */
      return !protectedVacancies?.[position?.id];
    });

  const assignmentPositions =
    availableOutfieldPositions.slice(
      0,
      richOutfieldPlayers.length
    );

  const assignment =
    buildBestOutfieldAssignment(
      richOutfieldPlayers,
      assignmentPositions
    );

  if (!assignment?.complete) {
    return {
      resolved: false,
      reason: "outfield_assignment_incomplete",
      assignment,
    };
  }

  const positions = {
    [goalkeeperPosition.id]: incomingName,
  };

  assignment.assignments.forEach((entry) => {
    const positionId =
      String(entry?.position?.id || "").trim();

    const name = safeName(
      entry?.player?.fullName ||
      entry?.player?.shortName ||
      entry?.player?.name ||
      entry?.profile?.name
    );

    if (positionId && name) {
      positions[positionId] = name;
    }
  });

  /*
   * Rotation queue:
   *
   * incoming player leaves the bench;
   * any other existing substitutes keep their order;
   * the player who just came off goes to the BACK.
   *
   * This prevents the same player from immediately becoming the next
   * automatic substitute when several players are rotating.
   */
  const nextBenchPlayers = currentBench
    .filter(
      (name) =>
        playerKey(name) !== incomingKey
    );

  if (
    !nextBenchPlayers.some(
      (name) =>
        playerKey(name) === outgoingKey
    )
  ) {
    nextBenchPlayers.push(outgoingName);
  }

  return {
    resolved: true,
    reason: "friendly_in_match_rotation_resolved",

    formationId:
      formation?.id ||
      currentLineup?.formationId ||
      null,

    incomingGoalkeeper: incomingName,
    previousGoalkeeper: currentGoalkeeper,
    outgoingPlayer: outgoingName,

    positions,
    benchPlayers: nextBenchPlayers,

    assignments:
      assignment.assignments || [],

    totalFitScore:
      assignment.totalFitScore,
  };
}


// ---------------------------------------------------------
// STAGE 7G2 — FRIENDLY GOALKEEPER FAIRNESS
// ---------------------------------------------------------
//
// Friendly rule:
//
// - With a bench, the incoming substitute remains the default GK.
// - Without a bench, if the referee manually enables a rotation rule,
//   that trigger rotates GOALKEEPER duty only.
// - The next goalkeeper is the on-field player who has gone the
//   longest without serving as GK.
// - A player who has never been GK gets priority.
// - Ties are deterministic and follow current formation order.
// - Referee-confirmed manual GK changes automatically become part
//   of the authoritative lineup history and therefore count as
//   goalkeeper duty.
//
// Pure football logic:
// - no React
// - no Firestore
// - works for 5v5, 6v6 and 7v7

function getFriendlyGoalkeeperPosition(formation = null) {
  const positions = Array.isArray(formation?.positions)
    ? formation.positions
    : [];

  return (
    positions.find(
      (position) =>
        String(position?.label || "")
          .trim()
          .toUpperCase() === "GK"
    ) || null
  );
}

function getFriendlyGoalkeeperName(snapshot = null, formation = null) {
  const goalkeeperPosition =
    getFriendlyGoalkeeperPosition(formation);

  if (!goalkeeperPosition) return "";

  return safeName(
    snapshot?.positions?.[goalkeeperPosition.id]
  );
}

export function chooseNextFriendlyGoalkeeper({
  teamId = null,
  currentLineup = null,
  formation = null,
  lineupTimeline = [],
} = {}) {
  const goalkeeperPosition =
    getFriendlyGoalkeeperPosition(formation);

  if (!goalkeeperPosition) {
    return {
      resolved: false,
      reason: "goalkeeper_slot_not_found",
      currentGoalkeeper: null,
      nextGoalkeeper: null,
    };
  }

  const currentPositions = {
    ...(currentLineup?.positions || {}),
  };

  const currentGoalkeeper = safeName(
    currentPositions[goalkeeperPosition.id]
  );

  const onFieldCandidates = (
    Array.isArray(formation?.positions)
      ? formation.positions
      : []
  )
    .map((position, formationIndex) => ({
      formationIndex,
      positionId: position.id,
      playerName: safeName(
        currentPositions[position.id]
      ),
    }))
    .filter(
      (candidate) =>
        candidate.playerName &&
        playerKey(candidate.playerName) !==
          playerKey(currentGoalkeeper)
    );

  if (!onFieldCandidates.length) {
    return {
      resolved: false,
      reason: "no_outfield_goalkeeper_candidate",
      currentGoalkeeper: currentGoalkeeper || null,
      nextGoalkeeper: null,
    };
  }

  /*
   * Record the most recent authoritative moment each player
   * served as goalkeeper.
   *
   * Never-GK players deliberately remain undefined, which gives
   * them first priority.
   */
  const lastGoalkeeperDutyByKey = new Map();

  const safeTimeline = Array.isArray(lineupTimeline)
    ? lineupTimeline
    : [];

  safeTimeline.forEach((entry, timelineIndex) => {
    const snapshot =
      entry?.snapshots?.[teamId] || null;

    if (!snapshot) return;

    const goalkeeper =
      getFriendlyGoalkeeperName(
        snapshot,
        formation
      );

    const key = playerKey(goalkeeper);
    if (!key) return;

    const safeSeconds = Number(
      entry?.timeSeconds
    );

    /*
     * timelineIndex is a deterministic fallback for legacy or
     * malformed entries with no usable timeSeconds.
     */
    const dutyOrder = Number.isFinite(safeSeconds)
      ? safeSeconds
      : timelineIndex;

    lastGoalkeeperDutyByKey.set(
      key,
      dutyOrder
    );
  });

  /*
   * The current confirmed lineup is also authoritative evidence.
   * This matters at kickoff when the timeline may contain only
   * the initial confirmation.
   */
  if (currentGoalkeeper) {
    const currentKey =
      playerKey(currentGoalkeeper);

    if (
      currentKey &&
      !lastGoalkeeperDutyByKey.has(currentKey)
    ) {
      lastGoalkeeperDutyByKey.set(
        currentKey,
        Number.POSITIVE_INFINITY
      );
    }
  }

  const ranked = onFieldCandidates
    .map((candidate) => {
      const key =
        playerKey(candidate.playerName);

      const hasPreviousDuty =
        lastGoalkeeperDutyByKey.has(key);

      return {
        ...candidate,
        hasPreviousDuty,
        lastDutyOrder:
          hasPreviousDuty
            ? lastGoalkeeperDutyByKey.get(key)
            : Number.NEGATIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      /*
       * Never-GK first.
       */
      if (
        a.hasPreviousDuty !==
        b.hasPreviousDuty
      ) {
        return a.hasPreviousDuty ? 1 : -1;
      }

      /*
       * Otherwise oldest GK duty first.
       */
      if (
        a.lastDutyOrder !==
        b.lastDutyOrder
      ) {
        return (
          a.lastDutyOrder -
          b.lastDutyOrder
        );
      }

      /*
       * Stable tie-break from the current formation.
       */
      return (
        a.formationIndex -
        b.formationIndex
      );
    });

  const chosen = ranked[0] || null;

  if (!chosen?.playerName) {
    return {
      resolved: false,
      reason: "next_goalkeeper_not_resolved",
      currentGoalkeeper: currentGoalkeeper || null,
      nextGoalkeeper: null,
    };
  }

  return {
    resolved: true,
    reason: "longest_since_goalkeeper_duty",
    goalkeeperPositionId:
      goalkeeperPosition.id,
    currentGoalkeeper:
      currentGoalkeeper || null,
    nextGoalkeeper:
      chosen.playerName,
    nextGoalkeeperPositionId:
      chosen.positionId,
  };
}


// ---------------------------------------------------------
// STAGE 7G2 — APPLY NO-BENCH GK ROTATION
// ---------------------------------------------------------
//
// Minimum-prescription rule:
//
// The next goalkeeper swaps places with the current goalkeeper.
//
// This deliberately avoids unnecessarily reshuffling the whole
// outfield during a no-sub Friendly. The referee may immediately
// change any positions afterwards and that confirmed state remains
// authoritative.
//
// With substitutes, buildFriendlyInMatchRotation remains responsible
// for the richer incoming-sub -> GK rotation.

export function buildFriendlyGoalkeeperOnlyRotation({
  currentLineup = null,
  formation = null,
  nextGoalkeeper = "",
} = {}) {
  const goalkeeperPosition =
    getFriendlyGoalkeeperPosition(formation);

  if (!goalkeeperPosition) {
    return {
      resolved: false,
      reason: "goalkeeper_slot_not_found",
      positions: {
        ...(currentLineup?.positions || {}),
      },
    };
  }

  const currentPositions = {
    ...(currentLineup?.positions || {}),
  };

  const currentGoalkeeper =
    safeName(
      currentPositions[
        goalkeeperPosition.id
      ]
    );

  const nextGoalkeeperName =
    safeName(nextGoalkeeper);

  if (
    !currentGoalkeeper ||
    !nextGoalkeeperName
  ) {
    return {
      resolved: false,
      reason: "goalkeeper_player_missing",
      positions: currentPositions,
    };
  }

  const nextGoalkeeperKey =
    playerKey(nextGoalkeeperName);

  const nextGoalkeeperPosition =
    (Array.isArray(formation?.positions)
      ? formation.positions
      : []
    ).find(
      (position) =>
        playerKey(
          currentPositions[position.id]
        ) === nextGoalkeeperKey
    ) || null;

  if (!nextGoalkeeperPosition) {
    return {
      resolved: false,
      reason: "next_goalkeeper_not_on_pitch",
      positions: currentPositions,
    };
  }

  if (
    nextGoalkeeperPosition.id ===
    goalkeeperPosition.id
  ) {
    return {
      resolved: false,
      reason: "player_already_goalkeeper",
      positions: currentPositions,
    };
  }

  const nextPositions = {
    ...currentPositions,

    /*
     * New GK takes the GK slot.
     */
    [goalkeeperPosition.id]:
      nextGoalkeeperName,

    /*
     * Previous GK takes the new GK's former outfield slot.
     *
     * This is the least-prescriptive automatic change.
     */
    [nextGoalkeeperPosition.id]:
      currentGoalkeeper,
  };

  return {
    resolved: true,
    reason: "friendly_goalkeeper_only_rotation",
    formationId:
      formation?.id ||
      currentLineup?.formationId ||
      null,
    goalkeeperPositionId:
      goalkeeperPosition.id,
    previousGoalkeeper:
      currentGoalkeeper,
    nextGoalkeeper:
      nextGoalkeeperName,
    previousOutfieldPositionId:
      nextGoalkeeperPosition.id,
    positions: nextPositions,
    benchPlayers:
      Array.isArray(
        currentLineup?.benchSnapshot
      )
        ? [...currentLineup.benchSnapshot]
        : [],
  };
}
