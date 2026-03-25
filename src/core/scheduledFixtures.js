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
  
  function buildPairToTeamsMap(remaining = {}) {
    const out = {};
    Object.keys(remaining).forEach((key) => {
      const [a, b] = key.split("__");
      out[key] = [a, b];
    });
    return out;
  }
  
  function computeRemainingAppearances(remaining = {}, teamIds = []) {
    const counts = Object.fromEntries((teamIds || []).map((id) => [id, 0]));
  
    Object.entries(remaining).forEach(([key, value]) => {
      const n = safeNum(value);
      if (n <= 0) return;
      const [a, b] = key.split("__");
      if (counts[a] != null) counts[a] += n;
      if (counts[b] != null) counts[b] += n;
    });
  
    return counts;
  }
  
  function nextAppearanceStreaks(currentStreaks = {}, teamIds = [], teamAId, teamBId) {
    const next = {};
  
    (teamIds || []).forEach((id) => {
      const current = safeNum(currentStreaks[id]);
      if (id === teamAId || id === teamBId) {
        next[id] = current + 1;
      } else {
        next[id] = 0;
      }
    });
  
    return next;
  }
  
  function maxStreak(streaks = {}) {
    return Math.max(0, ...Object.values(streaks).map((v) => safeNum(v)));
  }
  
  function sumSelectedRemainingAppearances(remainingAppearances = {}, a, b) {
    return safeNum(remainingAppearances[a]) + safeNum(remainingAppearances[b]);
  }
  
  function pickBestCandidate(candidates = [], lastPairKey, currentStreaks, remaining, teamIds) {
    if (!candidates.length) return null;
  
    const remainingAppearances = computeRemainingAppearances(remaining, teamIds);
  
    const withMeta = candidates.map((key) => {
      const [a, b] = key.split("__");
      const nextStreaks = nextAppearanceStreaks(currentStreaks, teamIds, a, b);
      const nextMaxStreak = maxStreak(nextStreaks);
  
      return {
        key,
        a,
        b,
        sameAsLast: key === lastPairKey,
        pairRemaining: safeNum(remaining[key]),
        selectedRemainingAppearances: sumSelectedRemainingAppearances(
          remainingAppearances,
          a,
          b
        ),
        nextStreaks,
        nextMaxStreak,
        currentAStreak: safeNum(currentStreaks[a]),
        currentBStreak: safeNum(currentStreaks[b]),
      };
    });
  
    const nonRepeat = withMeta.filter((x) => !x.sameAsLast);
    const noRepeatPool = nonRepeat.length ? nonRepeat : withMeta;
  
    const max2Pool = noRepeatPool.filter((x) => x.nextMaxStreak <= 2);
    const max3Pool = noRepeatPool.filter((x) => x.nextMaxStreak <= 3);
  
    const finalPool =
      max2Pool.length > 0 ? max2Pool : max3Pool.length > 0 ? max3Pool : noRepeatPool;
  
    finalPool.sort((x, y) => {
      if (y.pairRemaining !== x.pairRemaining) {
        return y.pairRemaining - x.pairRemaining;
      }
  
      if (y.selectedRemainingAppearances !== x.selectedRemainingAppearances) {
        return y.selectedRemainingAppearances - x.selectedRemainingAppearances;
      }
  
      const xCurrentStreakSum = x.currentAStreak + x.currentBStreak;
      const yCurrentStreakSum = y.currentAStreak + y.currentBStreak;
      if (xCurrentStreakSum !== yCurrentStreakSum) {
        return xCurrentStreakSum - yCurrentStreakSum;
      }
  
      return x.key.localeCompare(y.key);
    });
  
    return finalPool[0] || null;
  }
  
  export function buildScheduledFixtures(teams = [], pairCounts = {}) {
    const safeTeams = Array.isArray(teams) ? teams.slice(0, 3) : [];
    const teamById = Object.fromEntries(safeTeams.map((t) => [t.id, t]));
    const remaining = Object.fromEntries(
      Object.entries(pairCounts || {}).map(([k, v]) => [k, safeNum(v)])
    );
  
    const teamIds = buildTeamIds(safeTeams);
    const fixtures = [];
    let lastPairKey = null;
    let appearanceStreaks = Object.fromEntries(teamIds.map((id) => [id, 0]));
  
    while (true) {
      const candidates = Object.keys(remaining).filter((key) => remaining[key] > 0);
      if (!candidates.length) break;
  
      const picked = pickBestCandidate(
        candidates,
        lastPairKey,
        appearanceStreaks,
        remaining,
        teamIds
      );
  
      if (!picked) break;
  
      const teamA = teamById[picked.a];
      const teamB = teamById[picked.b];
      if (!teamA || !teamB) break;
  
      fixtures.push(buildFixtureObject(fixtures.length, teamA, teamB));
      remaining[picked.key] -= 1;
      lastPairKey = picked.key;
      appearanceStreaks = picked.nextStreaks;
    }
  
    return fixtures.map((fixture, idx) => ({
      ...fixture,
      order: idx + 1,
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