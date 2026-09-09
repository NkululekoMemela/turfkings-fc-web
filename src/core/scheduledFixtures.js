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
    catchUpTeamId = null,
    useCatchUpCadence = false,
    matchDayWindowSize = 12,
  }) {
    const initialCounts = pairKeys.map(
      (key) => safeNum(pairCounts[key])
    );

    const initialStreaks = Object.fromEntries(
      teamIds.map((teamId) => [teamId, 0])
    );

    const failedStates = new Set();

    const totalFixtureCount = initialCounts.reduce(
      (sum, value) => sum + safeNum(value),
      0
    );

    const search = (
      remainingCounts,
      lastPairIndex,
      currentStreaks,
      catchUpCadenceActive = null
    ) => {
      const totalRemaining = remainingCounts.reduce(
        (sum, value) => sum + safeNum(value),
        0
      );

      if (totalRemaining === 0) return [];

      const scheduledCount =
        totalFixtureCount - totalRemaining;

      const positionInWindow =
        scheduledCount % matchDayWindowSize;

      const fixturesLeftInWindow =
        matchDayWindowSize - positionInWindow;

      const completeWindowAvailable =
        totalRemaining >= fixturesLeftInWindow &&
        fixturesLeftInWindow === matchDayWindowSize;

      const remainingWorkloads =
        buildRemainingAppearanceCounts(
          pairKeys,
          remainingCounts,
          teamIds
        );

      const otherLargestWorkload = Math.max(
        0,
        ...teamIds
          .filter((teamId) => teamId !== catchUpTeamId)
          .map((teamId) =>
            safeNum(remainingWorkloads[teamId])
          )
      );

      const currentCatchUpLead =
        catchUpTeamId
          ? safeNum(
              remainingWorkloads[catchUpTeamId]
            ) - otherLargestWorkload
          : 0;

      /*
       * Apply the exceptional cadence to the first upcoming
       * 12-fixture match-day window only. Later windows return to
       * the established balancing search so an impossible rigid
       * pattern later cannot discard the successful first window.
       */
      const resolvedCatchUpCadenceActive =
        catchUpCadenceActive == null
          ? Boolean(
              useCatchUpCadence &&
              catchUpTeamId &&
              scheduledCount === 0 &&
              completeWindowAvailable &&
              currentCatchUpLead >= 1
            )
          : catchUpCadenceActive;

      const stateKey = [
        remainingCounts.join(","),
        lastPairIndex,
        teamIds
          .map((teamId) =>
            safeNum(currentStreaks[teamId])
          )
          .join(","),
        resolvedCatchUpCadenceActive ? 1 : 0,
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

          const playsCatchUpTeam =
            Boolean(catchUpTeamId) &&
            (
              teamAId === catchUpTeamId ||
              teamBId === catchUpTeamId
            );

          /*
           * Material-backlog cadence for each complete
           * 12-fixture match-day window:
           *
           *   play, play, play, rest,
           *   play, play, rest,
           *   play, play, play, rest,
           *   then normal rotation.
           *
           * This gives the catch-up team two controlled
           * three-match runs separated by recovery.
           */
          const catchUpCadence = [
            true,
            true,
            true,
            false,
            true,
            true,
            false,
            true,
            true,
            true,
            false,
            null,
          ];

          const requiredCatchUpAppearance =
            resolvedCatchUpCadenceActive
              ? catchUpCadence[positionInWindow]
              : null;

          if (
            requiredCatchUpAppearance === true &&
            !playsCatchUpTeam
          ) {
            return null;
          }

          if (
            requiredCatchUpAppearance === false &&
            playsCatchUpTeam
          ) {
            return null;
          }

          const closesMatchDayWindow =
            fixturesLeftInWindow === 1;

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
            closesMatchDayWindow,
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
        /*
         * A 12-fixture boundary approximates the end of a match
         * day. Players recover before the next window, so appearance
         * fatigue and the planned burst counter restart.
         */
        const nextWindowStreaks =
          candidate.closesMatchDayWindow
            ? Object.fromEntries(
                teamIds.map((teamId) => [
                  teamId,
                  0,
                ])
              )
            : candidate.nextStreaks;

        const suffix = search(
          candidate.nextCounts,
          candidate.pairIndex,
          nextWindowStreaks,
          candidate.closesMatchDayWindow
            ? null
            : resolvedCatchUpCadenceActive
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

    return search(
      initialCounts,
      -1,
      initialStreaks,
      null
    );
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

    const remainingAppearances =
      buildRemainingAppearanceCounts(
        pairKeys,
        pairKeys.map(
          (key) => safeNum(pairCounts[key])
        ),
        teamIds
      );

    const sortedWorkloads = teamIds
      .map((teamId) => ({
        teamId,
        appearances: safeNum(
          remainingAppearances[teamId]
        ),
      }))
      .sort(
        (left, right) =>
          right.appearances - left.appearances
      );

    /*
     * Match-day-window catch-up handling is exceptional.
     *
     * Preserve the established general rotation when every team
     * has the same remaining workload. When one team has even one
     * additional appearance to complete, give it the controlled
     * catch-up cadence in the first upcoming 12-fixture window.
     */
    const catchUpAppearanceLead =
      sortedWorkloads.length > 1
        ? sortedWorkloads[0].appearances -
          sortedWorkloads[1].appearances
        : 0;

    const minimumCatchUpLead = 1;

    const catchUpTeamId =
      catchUpAppearanceLead >= minimumCatchUpLead
        ? sortedWorkloads[0].teamId
        : null;

    /*
     * Give a backlogged team the controlled catch-up cadence in
     * the first upcoming 12-fixture window. The three-match ceiling
     * remains absolute throughout the generated schedule.
     */
    if (
      catchUpTeamId &&
      totalFixtures >= 12
    ) {
      const windowAwareOrder =
        findGloballyBalancedPairOrder({
          pairKeys,
          pairCounts,
          teamIds,
          maxTeamStreak: 3,
          avoidImmediatePairRepeat: true,
          catchUpTeamId,
          useCatchUpCadence: true,
          matchDayWindowSize: 12,
        });

      if (windowAwareOrder) {
        return windowAwareOrder;
      }
    }

    /*
     * Preserve strict rotation where the workload does not require
     * a planned catch-up burst, or if the exact remaining totals
     * make the window preference mathematically impossible.
     */
    for (
      let maxTeamStreak = 2;
      maxTeamStreak <= 3;
      maxTeamStreak += 1
    ) {
      const strictOrder =
        findGloballyBalancedPairOrder({
          pairKeys,
          pairCounts,
          teamIds,
          maxTeamStreak,
          avoidImmediatePairRepeat: true,
          catchUpTeamId,
          useCatchUpCadence: false,
          matchDayWindowSize: 12,
        });

      if (strictOrder) return strictOrder;
    }

    /*
     * This is only reached when pair repetition is mathematically
     * unavoidable.
     */
    for (
      let maxTeamStreak = 2;
      maxTeamStreak <= 3;
      maxTeamStreak += 1
    ) {
      const relaxedOrder =
        findGloballyBalancedPairOrder({
          pairKeys,
          pairCounts,
          teamIds,
          maxTeamStreak,
          avoidImmediatePairRepeat: false,
          catchUpTeamId,
          useCatchUpCadence: false,
          matchDayWindowSize: 12,
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
  
    const fixtures = buildScheduledFixtures(
      teams,
      solved.pairCounts
    );

    const expectedFixtureCount = Object.values(
      solved.pairCounts || {}
    ).reduce(
      (sum, value) => sum + safeNum(value),
      0
    );

    if (fixtures.length !== expectedFixtureCount) {
      return {
        ...solved,
        ok: false,
        reason:
          "A safe fixture order could not be generated without making one team play four consecutive matches.",
        fixtures: [],
        totalRemainingMatches: expectedFixtureCount,
      };
    }
  
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