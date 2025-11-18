// src/core/rotation.js

export function createInitialStreaks(teams) {
    const streaks = {};
    teams.forEach((t) => {
      streaks[t.id] = 0;
    });
    return streaks;
  }
  
  export function getChampionId(streaks) {
    let championId = null;
    let max = 0;
    for (const [teamId, streak] of Object.entries(streaks)) {
      if (streak > max) {
        max = streak;
        championId = teamId;
      }
    }
    return max > 0 ? championId : null;
  }
  
  /**
   * resultSummary:
   *  { teamAId, teamBId, standbyId, goalsA, goalsB }
   */
  export function computeNextFromResult(streaks, resultSummary) {
    const { teamAId, teamBId, standbyId, goalsA, goalsB } = resultSummary;
  
    let winnerId = null;
    let loserId = null;
    let isDraw = false;
  
    if (goalsA > goalsB) {
      winnerId = teamAId;
      loserId = teamBId;
    } else if (goalsB > goalsA) {
      winnerId = teamBId;
      loserId = teamAId;
    } else {
      isDraw = true;
    }
  
    const newStreaks = { ...streaks };
  
    if (!isDraw) {
      // Winner stays, loser out, standby in
      const nextTeamAId = winnerId;
      const nextTeamBId = standbyId;
      const nextStandbyId = loserId;
  
      newStreaks[winnerId] = (newStreaks[winnerId] || 0) + 1;
      newStreaks[loserId] = 0;
      newStreaks[standbyId] = newStreaks[standbyId] || 0;
  
      return {
        nextTeamAId,
        nextTeamBId,
        nextStandbyId,
        updatedStreaks: newStreaks,
        winnerId,
        isDraw: false,
      };
    }
  
    // Draw: champion (streak team, or teamA by default) goes out,
    // challenger stays, standby comes in
    let championId = getChampionId(streaks);
    if (!championId) {
      championId = teamAId;
    }
  
    const challengerId = championId === teamAId ? teamBId : teamAId;
  
    const nextTeamAId = challengerId;
    const nextTeamBId = standbyId;
    const nextStandbyId = championId;
  
    newStreaks[championId] = 0;
    newStreaks[challengerId] = newStreaks[challengerId] || 0;
    newStreaks[standbyId] = newStreaks[standbyId] || 0;
  
    return {
      nextTeamAId,
      nextTeamBId,
      nextStandbyId,
      updatedStreaks: newStreaks,
      winnerId: null,
      isDraw: true,
    };
  }
  