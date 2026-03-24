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
  
  export function buildScheduledFixtures(teams = [], pairCounts = {}) {
    const safeTeams = Array.isArray(teams) ? teams.slice(0, 3) : [];
    const teamById = Object.fromEntries(safeTeams.map((t) => [t.id, t]));
    const remaining = Object.fromEntries(
      Object.entries(pairCounts || {}).map(([k, v]) => [k, safeNum(v)])
    );
  
    const fixtures = [];
    let lastPairKey = null;
    const allPairs = Object.keys(remaining);
  
    while (true) {
      const candidates = allPairs
        .filter((key) => remaining[key] > 0)
        .sort((a, b) => {
          const diff = remaining[b] - remaining[a];
          if (diff !== 0) return diff;
          if (a === lastPairKey) return 1;
          if (b === lastPairKey) return -1;
          return a.localeCompare(b);
        });
  
      if (!candidates.length) break;
  
      const chosenKey =
        candidates.find((key) => key !== lastPairKey) || candidates[0];
  
      const [idA, idB] = chosenKey.split("__");
      const teamA = teamById[idA];
      const teamB = teamById[idB];
      if (!teamA || !teamB) break;
  
      fixtures.push(buildFixtureObject(fixtures.length, teamA, teamB));
      remaining[chosenKey] -= 1;
      lastPairKey = chosenKey;
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