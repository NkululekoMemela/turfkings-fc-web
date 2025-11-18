// src/storage/gameRepository.js

import { TEAMS } from "../core/teams.js";
import { createInitialStreaks } from "../core/rotation.js";
import { loadRawState, saveRawState } from "./localStorageClient.js";
import { saveStateToFirebase } from "./firebaseRepository.js"; // 🔥 cloud mirror

export function createDefaultState() {
  const teams = TEAMS;

  const teamEnoch = teams.find((t) => t.id === "team-enoch");
  const teamMdu = teams.find((t) => t.id === "team-mdu");
  const teamNK = teams.find((t) => t.id === "team-nk");

  return {
    teams,
    currentMatchNo: 1,
    currentMatch: {
      teamAId: teamEnoch.id,
      teamBId: teamMdu.id,
      standbyId: teamNK.id,
    },
    streaks: createInitialStreaks(teams),
    currentEvents: [],
    allEvents: [],
    results: [],
  };
}

export function loadState() {
  const raw = loadRawState();
  if (!raw) return createDefaultState();

  // migration if old state doesn’t have teams
  if (!raw.teams) {
    raw.teams = TEAMS;
    raw.streaks = raw.streaks || createInitialStreaks(TEAMS);
  }

  return raw;
}

export function saveState(state) {
  // 1️⃣ Keep existing behaviour: localStorage
  saveRawState(state);

  // 2️⃣ Mirror to Firebase (non-blocking)
  saveStateToFirebase(state);
}
