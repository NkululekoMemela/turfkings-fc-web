// src/core/scheduledFixtures.js

function safeNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  
  function pairKeyUnordered(a, b) {
    return [String(a || ""), String(b || "")].sort().join("__");
  }
  
  export function countMatchesByTeam(teams = [], results = []) {
    const counts = Object.fromEntries((teams || []).map((team) => [team.id, 0]));
  
    (results || []).forEach((result) => {
      const a = result?.teamAId;
      const b = result?.teamBId;
      if (a && counts[a] != null) counts[a] += 1;
      if (b && counts[b] != null) counts[b] += 1;
    });
  
    return counts;
  }
  
  export function solveThreeTeamTarget(teams = [], results = [], target) {
    const safeTeams = Array.isArray(teams) ? teams.slice(0, 3) : [];
    const safeTarget = safeNum(target);
  
    if (safeTeams.length !== 3) {
      return {
        ok: false,
        reason: "Fixtured mode currently supports exactly 3 teams.",
      };
    }
  
    const counts = countMatchesByTeam(safeTeams, results);
    const ids = safeTeams.map((t) => t.id);
    const deficits = ids.map((id) => safeTarget - safeNum(counts[id]));
  
    if (deficits.some((d) => d < 0)) {
      return {
        ok: false,
        reason: "At least one team has already played more than that target.",
        counts,
        deficits,
      };
    }
  
    const [d1, d2, d3] = deficits;
    const [t1, t2, t3] = safeTeams;
  
    const x12 = (d1 + d2 - d3) / 2;
    const x13 = (d1 + d3 - d2) / 2;
    const x23 = (d2 + d3 - d1) / 2;
  
    const valid =
      [x12, x13, x23].every((v) => Number.isInteger(v)) &&
      [x12, x13, x23].every((v) => v >= 0);
  
    if (!valid) {
      return {
        ok: false,
        reason:
          "This target cannot make all 3 teams finish equally from the current standings.",
        counts,
        deficits,
      };
    }
  
    const pairCounts = {
      [pairKeyUnordered(t1.id, t2.id)]: x12,
      [pairKeyUnordered(t1.id, t3.id)]: x13,
      [pairKeyUnordered(t2.id, t3.id)]: x23,
    };
  
    return {
      ok: true,
      target: safeTarget,
      counts,
      deficits,
      pairCounts,
    };
  }
  
  function buildFixtureObject(index, teamA, teamB) {
    return {
      id: `scheduled-${index + 1}-${pairKeyUnordered(teamA.id, teamB.id)}`,
      order: index + 1,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamALabel: teamA.label,
      teamBLabel: teamB.label,
      pairKey: pairKeyUnordered(teamA.id, teamB.id),
      completed: false,
      completedMatchNo: null,
      goalsA: null,
      goalsB: null,
    };
  }
  
  function buildTeamIds(teams = []) {
    return (teams || []).map((t) => t.id).filter(Boolean);
  }
  
  function buildRemainingAppearanceCounts(
    pairKeys = [],
    remainingCounts = [],
    teamIds = []
  ) {
    const appearances = Object.fromEntries(
      teamIds.map((teamId) => [teamId, 0])
    );

    pairKeys.forEach((pairKey, index) => {
      const count = safeNum(remainingCounts[index]);
      if (count <= 0) return;

      const [teamAId, teamBId] = pairKey.split("__");
      appearances[teamAId] += count;
      appearances[teamBId] += count;
    });

    return appearances;
  }

  function buildNextAppearanceStreaks(
    currentStreaks,
    teamIds,
    teamAId,
    teamBId
  ) {
    return Object.fromEntries(
      teamIds.map((teamId) => [
        teamId,
        teamId === teamAId || teamId === teamBId
          ? safeNum(currentStreaks[teamId]) + 1
          : 0,
      ])
    );
  }

  function remainingStateIsFeasible({
    pairKeys,
    remainingCounts,
    teamIds,
    currentStreaks,
    lastPairIndex,
    maxTeamStreak,
    avoidImmediatePairRepeat,
  }) {
    const totalRemaining = remainingCounts.reduce(
      (sum, value) => sum + safeNum(value),
      0
    );

    const appearances = buildRemainingAppearanceCounts(
      pairKeys,
      remainingCounts,
      teamIds
    );

    /*
     * Every omission breaks that team's appearance streak. Check
     * that enough omissions remain to distribute all appearances
     * without exceeding the active streak limit.
     */
    for (const teamId of teamIds) {
      const remainingAppearances = safeNum(
        appearances[teamId]
      );

      const remainingOmissions =
        totalRemaining - remainingAppearances;

      const openingCapacity = Math.max(
        0,
        maxTeamStreak -
          safeNum(currentStreaks[teamId])
      );

      const totalCapacity =
        openingCapacity +
        remainingOmissions * maxTeamStreak;

      if (remainingAppearances > totalCapacity) {
        return false;
      }
    }

    if (avoidImmediatePairRepeat) {
      for (
        let pairIndex = 0;
        pairIndex < remainingCounts.length;
        pairIndex += 1
      ) {
        const pairRemaining = safeNum(
          remainingCounts[pairIndex]
        );

        const otherRemaining =
          totalRemaining - pairRemaining;

        const openingSlot =
          lastPairIndex === pairIndex ? 0 : 1;

        if (
          pairRemaining >
          otherRemaining + openingSlot
        ) {
          return false;
        }
      }
    }

    return true;
  }

  function findGloballyBalancedPairOrder({
    pairKeys,
    pairCounts,
    teamIds,
    maxTeamStreak,
    avoidImmediatePairRepeat,
  }) {
    const initialCounts = pairKeys.map(
      (key) => safeNum(pairCounts[key])
    );

    const initialStreaks = Object.fromEntries(
      teamIds.map((teamId) => [teamId, 0])
    );

    const failedStates = new Set();

    const search = (
      remainingCounts,
      lastPairIndex,
      currentStreaks
    ) => {
      const totalRemaining = remainingCounts.reduce(
        (sum, value) => sum + safeNum(value),
        0
      );

      if (totalRemaining === 0) return [];

      const stateKey = [
        remainingCounts.join(","),
        lastPairIndex,
        teamIds
          .map((teamId) =>
            safeNum(currentStreaks[teamId])
          )
          .join(","),
      ].join("|");

      if (failedStates.has(stateKey)) return null;

      const candidates = pairKeys
        .map((pairKey, pairIndex) => {
          const count = safeNum(
            remainingCounts[pairIndex]
          );

          if (count <= 0) return null;

          if (
            avoidImmediatePairRepeat &&
            pairIndex === lastPairIndex
          ) {
            return null;
          }

          const [teamAId, teamBId] =
            pairKey.split("__");

          const nextStreaks =
            buildNextAppearanceStreaks(
              currentStreaks,
              teamIds,
              teamAId,
              teamBId
            );

          const nextMaxStreak = Math.max(
            ...teamIds.map((teamId) =>
              safeNum(nextStreaks[teamId])
            )
          );

          if (nextMaxStreak > maxTeamStreak) {
            return null;
          }

          const nextCounts = remainingCounts.slice();
          nextCounts[pairIndex] -= 1;

          if (
            !remainingStateIsFeasible({
              pairKeys,
              remainingCounts: nextCounts,
              teamIds,
              currentStreaks: nextStreaks,
              lastPairIndex: pairIndex,
              maxTeamStreak,
              avoidImmediatePairRepeat,
            })
          ) {
            return null;
          }

          const remainingAppearances =
            buildRemainingAppearanceCounts(
              pairKeys,
              nextCounts,
              teamIds
            );

          const smallestTeamSlack = Math.min(
            ...[teamAId, teamBId].map(
              (teamId) =>
                safeNum(
                  remainingAppearances[teamId]
                )
            )
          );

          return {
            pairKey,
            pairIndex,
            count,
            nextCounts,
            nextStreaks,
            nextMaxStreak,
            smallestTeamSlack,
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          /*
           * Deal with the most constrained pairing early enough to
           * prevent it collecting at the end, while preferring the
           * choice that creates the lower immediate streak.
           */
          if (
            left.nextMaxStreak !==
            right.nextMaxStreak
          ) {
            return (
              left.nextMaxStreak -
              right.nextMaxStreak
            );
          }

          if (right.count !== left.count) {
            return right.count - left.count;
          }

          if (
            right.smallestTeamSlack !==
            left.smallestTeamSlack
          ) {
            return (
              right.smallestTeamSlack -
              left.smallestTeamSlack
            );
          }

          return left.pairKey.localeCompare(
            right.pairKey
          );
        });

      for (const candidate of candidates) {
        const suffix = search(
          candidate.nextCounts,
          candidate.pairIndex,
          candidate.nextStreaks
        );

        if (suffix) {
          return [
            candidate.pairKey,
            ...suffix,
          ];
        }
      }

      failedStates.add(stateKey);
      return null;
    };

    if (
      !remainingStateIsFeasible({
        pairKeys,
        remainingCounts: initialCounts,
        teamIds,
        currentStreaks: initialStreaks,
        lastPairIndex: -1,
        maxTeamStreak,
        avoidImmediatePairRepeat,
      })
    ) {
      return null;
    }

    return search(initialCounts, -1, initialStreaks);
  }

  function buildBalancedPairOrder(
    pairCounts = {},
    teamIds = []
  ) {
    const pairKeys = Object.keys(pairCounts)
      .filter((key) => safeNum(pairCounts[key]) > 0)
      .sort();

    const totalFixtures = pairKeys.reduce(
      (sum, key) => sum + safeNum(pairCounts[key]),
      0
    );

    /*
     * Preserve strict rotation where mathematically possible.
     * Relax only the team-streak ceiling required to complete the
     * equal-target season.
     */
    for (
      let maxTeamStreak = 2;
      maxTeamStreak <= Math.max(2, totalFixtures);
      maxTeamStreak += 1
    ) {
      const strictOrder =
        findGloballyBalancedPairOrder({
          pairKeys,
          pairCounts,
          teamIds,
          maxTeamStreak,
          avoidImmediatePairRepeat: true,
        });

      if (strictOrder) return strictOrder;
    }

    /*
     * This is only reached when pair repetition is mathematically
     * unavoidable.
     */
    for (
      let maxTeamStreak = 2;
      maxTeamStreak <= Math.max(2, totalFixtures);
      maxTeamStreak += 1
    ) {
      const relaxedOrder =
        findGloballyBalancedPairOrder({
          pairKeys,
          pairCounts,
          teamIds,
          maxTeamStreak,
          avoidImmediatePairRepeat: false,
        });

      if (relaxedOrder) return relaxedOrder;
    }

    return [];
  }

  export function buildScheduledFixtures(
    teams = [],
    pairCounts = {}
  ) {
    const safeTeams = Array.isArray(teams)
      ? teams.slice(0, 3)
      : [];

    const teamById = Object.fromEntries(
      safeTeams.map((team) => [team.id, team])
    );

    const teamIds = buildTeamIds(safeTeams);

    const pairOrder = buildBalancedPairOrder(
      pairCounts,
      teamIds
    );

    return pairOrder
      .map((pairKey, index) => {
        const [teamAId, teamBId] =
          pairKey.split("__");

        const teamA = teamById[teamAId];
        const teamB = teamById[teamBId];

        if (!teamA || !teamB) return null;

        return buildFixtureObject(
          index,
          teamA,
          teamB
        );
      })
      .filter(Boolean)
      .map((fixture, index) => ({
        ...fixture,
        order: index + 1,
      }));
  }

  export function computeScheduledPlan({ teams = [], results = [], target }) {
    const solved = solveThreeTeamTarget(teams, results, target);
    if (!solved.ok) return solved;
  
    const fixtures = buildScheduledFixtures(teams, solved.pairCounts);
  
    return {
      ok: true,
      target: solved.target,
      counts: solved.counts,
      deficits: solved.deficits,
      pairCounts: solved.pairCounts,
      fixtures,
      totalRemainingMatches: fixtures.length,
    };
  }
  
  export function findNearestValidTarget({
    teams = [],
    results = [],
    minTarget,
    maxLookAhead = 20,
  }) {
    const start = safeNum(minTarget);
  
    for (let target = start; target <= start + maxLookAhead; target += 1) {
      const plan = computeScheduledPlan({ teams, results, target });
      if (plan?.ok) {
        return {
          target,
          plan,
        };
      }
    }
  
    return {
      target: null,
      plan: null,
    };
  }
  
  export function getFirstPendingFixture(fixtures = []) {
    return (fixtures || []).find((fixture) => !fixture.completed) || null;
  }
  
  export function buildCurrentMatchFromFixture(fixture, teams = []) {
    if (!fixture) return null;
  
    const standby =
      (teams || []).find(
        (team) => team.id !== fixture.teamAId && team.id !== fixture.teamBId
      ) || null;
  
    return {
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      standbyId: standby?.id || null,
    };
  }
  
  export function markScheduledFixtureCompleted({
    fixtures = [],
    teamAId,
    teamBId,
    matchNo,
    goalsA,
    goalsB,
  }) {
    const targetKey = pairKeyUnordered(teamAId, teamBId);
    let used = false;
  
    return (fixtures || []).map((fixture) => {
      if (used) return fixture;
      if (fixture.completed) return fixture;
      if (fixture.pairKey !== targetKey) return fixture;
  
      used = true;
      return {
        ...fixture,
        completed: true,
        completedMatchNo: Number(matchNo || 0) || null,
        goalsA:
          goalsA !== null && goalsA !== undefined && Number.isFinite(Number(goalsA))
            ? Number(goalsA)
            : null,
        goalsB:
          goalsB !== null && goalsB !== undefined && Number.isFinite(Number(goalsB))
            ? Number(goalsB)
            : null,
      };
    });
  }