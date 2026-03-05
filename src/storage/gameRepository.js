// src/storage/gameRepository.js

import { TEAMS } from "../core/teams.js";
import { createInitialStreaks } from "../core/rotation.js";
import { loadRawState, saveRawState } from "./localStorageClient.js";
import {
  saveStateToFirebase,
  saveStateToFirebaseV2, // ✅ V2 mirror (writes to appState_v2/main)
} from "./firebaseRepository.js"; // 🔥 Mirror to cloud

// =======================
// LEGACY (unchanged)
// =======================

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

  // 2️⃣ Mirror to Firebase (non-blocking) — LEGACY
  saveStateToFirebase(state);
}

// =======================
// V2 (NEW MODEL) — appState_v2/main ONLY
// NOTE: This file adds V2-safe helpers without breaking legacy.
// App.jsx will decide whether to call legacy saveState/loadState or these V2 ones.
// =======================

const V2_LOCAL_KEY = "turfkings_state_v2";
const DEFAULT_SEASON_ID = "2026-S1";

/**
 * IMPORTANT FIX:
 * Your current localStorageClient.js does NOT support custom keys.
 * So checking function arity (loadRawState.length) will NOT work reliably.
 *
 * We will implement V2 local storage read/write *directly* here using window.localStorage,
 * with a dedicated V2 key, so V1 and V2 never collide.
 */
function loadRawStateV2() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(V2_LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load V2 state from localStorage", err);
    return null;
  }
}

function saveRawStateV2(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(V2_LOCAL_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save V2 state to localStorage", err);
  }
}

/**
 * Create the new V2 state shape:
 * { activeSeasonId, seasons: [ { seasonId, seasonNo, ...seasonState } ] }
 *
 * We keep the exact same "inner" season fields you already use,
 * so the UI can keep working with minimal mapping in App.jsx.
 */
export function createDefaultStateV2() {
  const base = createDefaultState();

  const seasonId = DEFAULT_SEASON_ID;
  const seasonNo = 1;

  return {
    activeSeasonId: seasonId,
    seasons: [
      {
        seasonId,
        seasonNo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        // season state (your existing shape)
        teams: base.teams,
        currentMatchNo: base.currentMatchNo,
        currentMatch: base.currentMatch,
        streaks: base.streaks,
        currentEvents: base.currentEvents,
        allEvents: base.allEvents,
        results: base.results,

        // history belongs to the season
        matchDayHistory: [],
      },
    ],

    // root extras (keep safe defaults)
    playerPhotosByName: {},
    yearEndAttendance: [],
    updatedAt: new Date().toISOString(),
  };
}

function migrateTeamsLatest(incomingTeams) {
  const list = Array.isArray(incomingTeams) ? incomingTeams : [];
  return TEAMS.map((base) => {
    const existing = list.find((t) => t.id === base.id) || {};
    return {
      ...existing,
      ...base,
    };
  });
}

function ensureSeasonFields(season, idx) {
  const s = { ...(season || {}) };

  // Ensure identifiers
  s.seasonId = s.seasonId || `season-${idx + 1}`;
  s.seasonNo = s.seasonNo || idx + 1;

  // Teams: enforce latest TEAMS
  s.teams = migrateTeamsLatest(s.teams);

  // Streaks
  if (!s.streaks) {
    s.streaks = createInitialStreaks(s.teams);
  }

  // Current match
  if (!s.currentMatch) {
    const teamEnoch = s.teams.find((t) => t.id === "team-enoch");
    const teamMdu = s.teams.find((t) => t.id === "team-mdu");
    const teamNK = s.teams.find((t) => t.id === "team-nk");
    s.currentMatch = {
      teamAId: teamEnoch?.id || "team-enoch",
      teamBId: teamMdu?.id || "team-mdu",
      standbyId: teamNK?.id || "team-nk",
    };
  }

  s.currentMatchNo = s.currentMatchNo || 1;
  s.currentEvents = s.currentEvents || [];
  s.allEvents = s.allEvents || [];
  s.results = s.results || [];
  s.matchDayHistory = s.matchDayHistory || [];

  // timestamps (keep if already present)
  s.createdAt = s.createdAt || new Date().toISOString();
  s.updatedAt = s.updatedAt || new Date().toISOString();

  return s;
}

/**
 * V2 state load (from V2 local storage only).
 * Firestore V2 subscription happens in App.jsx.
 */
export function loadStateV2() {
  const raw = loadRawStateV2();
  if (!raw) return createDefaultStateV2();

  // Ensure root shape + keep optional root extras
  const state = {
    activeSeasonId: raw.activeSeasonId || raw.seasons?.[0]?.seasonId || DEFAULT_SEASON_ID,
    seasons: Array.isArray(raw.seasons) ? raw.seasons : [],
    playerPhotosByName: raw.playerPhotosByName || {},
    yearEndAttendance: raw.yearEndAttendance || [],
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };

  if (!state.seasons.length) {
    return createDefaultStateV2();
  }

  // Normalize seasons
  state.seasons = state.seasons.map((s, idx) => ensureSeasonFields(s, idx));

  // Ensure activeSeasonId matches an existing season
  const found = state.seasons.find((s) => s.seasonId === state.activeSeasonId);
  if (!found) {
    state.activeSeasonId = state.seasons[0]?.seasonId || DEFAULT_SEASON_ID;
  }

  return state;
}

/**
 * V2 save: local + Firestore V2 mirror
 * This NEVER writes to legacy appState/main.
 */
export function saveStateV2(state) {
  // 1️⃣ Local storage (dedicated V2 key)
  saveRawStateV2(state);

  // 2️⃣ Mirror to Firebase V2 only
  saveStateToFirebaseV2(state);
}