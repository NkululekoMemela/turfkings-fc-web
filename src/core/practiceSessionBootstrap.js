// src/core/practiceSessionBootstrap.js
//
// Practice v2 disposable session-state bootstrap.
//
// PURPOSE:
// Build the clean initial football state for one authoritative
// 15-minute Practice session.
//
// IMPORTANT BOUNDARIES:
// - Real club players are read-only inputs.
// - Real club/player records are never copied or mutated here.
// - Generated football activity belongs to the Practice DataScope.
// - Every Practice session starts clean.
// - Previous Practice session activity is never inherited.
// - This module performs no Firestore writes itself.

function safeString(value = "") {
  return String(value || "").trim();
}

function requireId(value, label) {
  const normalized = safeString(value);

  if (!normalized) {
    throw new Error(
      `[PracticeSessionBootstrap] ${label} is required.`
    );
  }

  if (normalized.includes("/")) {
    throw new Error(
      `[PracticeSessionBootstrap] ${label} must not contain "/".`
    );
  }

  return normalized;
}

function normalizeRosterPlayer(player = {}) {
  const id = requireId(
    player.id || player.playerId,
    "player.id"
  );

  return Object.freeze({
    ...player,
    id,
    playerId: id,
  });
}

export function createCleanPracticeSessionState({
  clubId,
  sessionId,
  roster = [],
} = {}) {
  const safeClubId = requireId(clubId, "clubId");
  const safeSessionId = requireId(sessionId, "sessionId");

  if (!Array.isArray(roster)) {
    throw new Error(
      "[PracticeSessionBootstrap] roster must be an array."
    );
  }

  const normalizedRoster = roster.map(normalizeRosterPlayer);

  return {
    practiceVersion: 2,
    environment: "practice",

    clubId: safeClubId,
    practiceSessionId: safeSessionId,

    // Read-only source identities for the Practice experience.
    // These are not newly-created football identities.
    roster: normalizedRoster,

    // Everything below represents disposable session-generated
    // football state. A new Practice session always starts empty.
    signups: [],
    teams: [],
    squads: [],
    fixtures: [],
    matches: [],
    events: [],
    results: [],

    liveMatch: null,

    sessionState: {
      started: false,
      completed: false,
    },
  };
}

export function assertCleanPracticeSessionState(state) {
  if (!state || typeof state !== "object") {
    throw new Error(
      "[PracticeSessionBootstrap] state is required."
    );
  }

  const disposableArrays = [
    "signups",
    "teams",
    "squads",
    "fixtures",
    "matches",
    "events",
    "results",
  ];

  for (const key of disposableArrays) {
    if (!Array.isArray(state[key]) || state[key].length !== 0) {
      throw new Error(
        `[PracticeSessionBootstrap] ${key} must start empty.`
      );
    }
  }

  if (state.liveMatch !== null) {
    throw new Error(
      "[PracticeSessionBootstrap] liveMatch must start empty."
    );
  }

  return true;
}
