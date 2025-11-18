// src/storage/gameRepository.js

import { TEAMS } from "../core/teams.js";
import { createInitialStreaks } from "../core/rotation.js";
import { loadRawState, saveRawState } from "./localStorageClient.js";
import { saveStateToFirebase } from "./firebaseRepository.js"; // 🔥 Mirror to cloud

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

  // 🔄 MIGRATION: always ensure we use the latest TEAMS (labels, captains, players)
  // Merge by id: keep any extra fields from saved state, but override core data from TEAMS.
  const mergedTeams = TEAMS.map((base) => {
    const existing = raw.teams?.find((t) => t.id === base.id) || {};
    return {
      ...existing,
      ...base, // base.label = Liverpool/Madrid/Barcelona etc.
    };
  });

  raw.teams = mergedTeams;

  // Ensure streaks exist
  if (!raw.streaks) {
    raw.streaks = createInitialStreaks(raw.teams);
  }

  // If currentMatch is missing, reset it to default pairing
  if (!raw.currentMatch) {
    const teamEnoch = raw.teams.find((t) => t.id === "team-enoch");
    const teamMdu = raw.teams.find((t) => t.id === "team-mdu");
    const teamNK = raw.teams.find((t) => t.id === "team-nk");
    raw.currentMatch = {
      teamAId: teamEnoch?.id || "team-enoch",
      teamBId: teamMdu?.id || "team-mdu",
      standbyId: teamNK?.id || "team-nk",
    };
  }

  raw.currentMatchNo = raw.currentMatchNo || 1;
  raw.currentEvents = raw.currentEvents || [];
  raw.allEvents = raw.allEvents || [];
  raw.results = raw.results || [];

  return raw;
}

export function saveState(state) {
  // 1️⃣ Keep existing behaviour: localStorage
  saveRawState(state);

  // 2️⃣ Mirror to Firebase (non-blocking)
  saveStateToFirebase(state);
}
