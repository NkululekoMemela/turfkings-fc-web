// src/storage/gameRepository.js

import { TEAMS } from "../core/teams.js";
import { createInitialStreaks } from "../core/rotation.js";
import { loadRawState, saveRawState } from "./localStorageClient.js";
import {
  saveStateToFirebase,
  saveStateToFirebaseV2,
} from "./firebaseRepository.js";

const DEFAULT_CLUB_ID = "turf-kings";
const DEFAULT_SEASON_ID = "2026-S1";

function getV2LocalKey(clubId = DEFAULT_CLUB_ID) {
  return `fanm_state_v2_${clubId}`;
}

export function createDefaultState() {
  const teams = TEAMS;

  return {
    teams,
    currentMatchNo: 1,
    currentMatch: {
      teamAId: teams?.[0]?.id || null,
      teamBId: teams?.[1]?.id || null,
      standbyId: teams?.[2]?.id || null,
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

  if (!Array.isArray(raw.teams)) {
    raw.teams = [];
  }

  if (!raw.streaks) {
    raw.streaks = createInitialStreaks(raw.teams);
  }

  if (!raw.currentMatch) {
    raw.currentMatch = {
      teamAId: raw.teams?.[0]?.id || null,
      teamBId: raw.teams?.[1]?.id || null,
      standbyId: raw.teams?.[2]?.id || null,
    };
  }

  raw.currentMatchNo = raw.currentMatchNo || 1;
  raw.currentEvents = raw.currentEvents || [];
  raw.allEvents = raw.allEvents || [];
  raw.results = raw.results || [];

  return raw;
}

export function saveState(state) {
  saveRawState(state);
  saveStateToFirebase(state);
}

function loadRawStateV2(clubId = DEFAULT_CLUB_ID) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getV2LocalKey(clubId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load V2 state from localStorage", err);
    return null;
  }
}

function saveRawStateV2(state, clubId = DEFAULT_CLUB_ID) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getV2LocalKey(clubId), JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save V2 state to localStorage", err);
  }
}

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

        teams: base.teams,
        currentMatchNo: base.currentMatchNo,
        currentMatch: base.currentMatch,
        streaks: base.streaks,
        currentEvents: base.currentEvents,
        allEvents: base.allEvents,
        results: base.results,

        matchDayHistory: [],
      },
    ],

    playerPhotosByName: {},
    yearEndAttendance: [],
    updatedAt: new Date().toISOString(),
  };
}

function migrateTeamsLatest(incomingTeams) {
  return Array.isArray(incomingTeams)
    ? incomingTeams
    : [];
}

function ensureSeasonFields(season, idx) {
  const s = { ...(season || {}) };

  s.seasonId = s.seasonId || `season-${idx + 1}`;
  s.seasonNo = s.seasonNo || idx + 1;

  s.teams = migrateTeamsLatest(s.teams);

  if (!s.streaks) {
    s.streaks = createInitialStreaks(s.teams);
  }

  if (!s.currentMatch) {
    s.currentMatch = {
      teamAId: s.teams?.[0]?.id || null,
      teamBId: s.teams?.[1]?.id || null,
      standbyId: s.teams?.[2]?.id || null,
    };
  }

  s.currentMatchNo = s.currentMatchNo || 1;
  s.currentEvents = s.currentEvents || [];
  s.allEvents = s.allEvents || [];
  s.results = s.results || [];
  s.matchDayHistory = s.matchDayHistory || [];

  s.createdAt = s.createdAt || new Date().toISOString();
  s.updatedAt = s.updatedAt || new Date().toISOString();

  return s;
}

export function loadStateV2(clubId = DEFAULT_CLUB_ID) {
  const raw = loadRawStateV2(clubId);
  if (!raw) return createDefaultStateV2();

  const state = {
    activeSeasonId:
      raw.activeSeasonId ||
      raw.seasons?.[0]?.seasonId ||
      DEFAULT_SEASON_ID,
    seasons: Array.isArray(raw.seasons) ? raw.seasons : [],
    playerPhotosByName: raw.playerPhotosByName || {},
    yearEndAttendance: raw.yearEndAttendance || [],
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };

  if (!state.seasons.length) {
    return createDefaultStateV2();
  }

  state.seasons = state.seasons.map((s, idx) => ensureSeasonFields(s, idx));

  const found = state.seasons.find((s) => s.seasonId === state.activeSeasonId);

  if (!found) {
    state.activeSeasonId = state.seasons[0]?.seasonId || DEFAULT_SEASON_ID;
  }

  return state;
}

export function saveStateV2(state, clubId = DEFAULT_CLUB_ID) {
  saveRawStateV2(state, clubId);
  saveStateToFirebaseV2(state, clubId);
}