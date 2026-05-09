// src/core/matchConfig.js
// Central source of truth for club match modes and game formats.

export const MATCH_MODE = Object.freeze({
  FRIENDLY: "FRIENDLY",
  LEAGUE: "LEAGUE",
});

export const GAME_FORMAT = Object.freeze({
  FIVE_V_FIVE: "5_V_5",
  SIX_V_SIX: "6_V_6",
  SEVEN_V_SEVEN: "7_V_7",
});

export const GAME_FORMAT_CONFIG = Object.freeze({
  [GAME_FORMAT.FIVE_V_FIVE]: {
    value: GAME_FORMAT.FIVE_V_FIVE,
    label: "5 v 5",
    shortLabel: "5v5",
    playersPerSide: 5,
  },
  [GAME_FORMAT.SIX_V_SIX]: {
    value: GAME_FORMAT.SIX_V_SIX,
    label: "6 v 6",
    shortLabel: "6v6",
    playersPerSide: 6,
  },
  [GAME_FORMAT.SEVEN_V_SEVEN]: {
    value: GAME_FORMAT.SEVEN_V_SEVEN,
    label: "7 v 7",
    shortLabel: "7v7",
    playersPerSide: 7,
  },
});

export const MATCH_MODE_OPTIONS = Object.freeze([
  { value: MATCH_MODE.FRIENDLY, label: "Friendly" },
  { value: MATCH_MODE.LEAGUE, label: "League" },
]);

export const GAME_FORMAT_OPTIONS = Object.freeze([
  GAME_FORMAT_CONFIG[GAME_FORMAT.FIVE_V_FIVE],
  GAME_FORMAT_CONFIG[GAME_FORMAT.SIX_V_SIX],
  GAME_FORMAT_CONFIG[GAME_FORMAT.SEVEN_V_SEVEN],
]);

export function normalizeMatchMode(rawMode, fallback = MATCH_MODE.FRIENDLY) {
  const value = String(rawMode || "").trim().toUpperCase();

  if (value === MATCH_MODE.LEAGUE || value === "3_TEAM_LEAGUE") {
    return MATCH_MODE.LEAGUE;
  }

  if (
    value === MATCH_MODE.FRIENDLY ||
    value === GAME_FORMAT.FIVE_V_FIVE ||
    value === GAME_FORMAT.SIX_V_SIX ||
    value === GAME_FORMAT.SEVEN_V_SEVEN ||
    value === "5V5" ||
    value === "6V6" ||
    value === "7V7"
  ) {
    return MATCH_MODE.FRIENDLY;
  }

  return fallback;
}

export function normalizeGameFormat(rawFormat, fallback = GAME_FORMAT.FIVE_V_FIVE) {
  const value = String(rawFormat || "").trim().toUpperCase();

  if (value === GAME_FORMAT.SEVEN_V_SEVEN || value === "7V7" || value === "7_ASIDE") {
    return GAME_FORMAT.SEVEN_V_SEVEN;
  }

  if (value === GAME_FORMAT.SIX_V_SIX || value === "6V6" || value === "6_ASIDE") {
    return GAME_FORMAT.SIX_V_SIX;
  }

  if (value === GAME_FORMAT.FIVE_V_FIVE || value === "5V5" || value === "5_ASIDE") {
    return GAME_FORMAT.FIVE_V_FIVE;
  }

  // Legacy 3-team league had no separate gameFormat. Keep it 5v5 by default.
  if (value === "3_TEAM_LEAGUE" || value === MATCH_MODE.LEAGUE) {
    return GAME_FORMAT.FIVE_V_FIVE;
  }

  return fallback;
}

export function getGameFormatConfig(rawFormat) {
  const gameFormat = normalizeGameFormat(rawFormat);
  return GAME_FORMAT_CONFIG[gameFormat] || GAME_FORMAT_CONFIG[GAME_FORMAT.FIVE_V_FIVE];
}

export function getPlayersPerSide(rawFormat) {
  return getGameFormatConfig(rawFormat).playersPerSide;
}

export function isLeagueMode(rawMode) {
  return normalizeMatchMode(rawMode) === MATCH_MODE.LEAGUE;
}

export function isFriendlyMode(rawMode) {
  return normalizeMatchMode(rawMode) === MATCH_MODE.FRIENDLY;
}

export function isKnownGameFormat(rawFormat) {
  const value = normalizeGameFormat(rawFormat, "");
  return Boolean(GAME_FORMAT_CONFIG[value]);
}

export function legacyGameFormatToMatchMode(rawGameFormat) {
  return normalizeMatchMode(rawGameFormat);
}

export function buildMatchClassification({
  matchMode,
  gameFormat,
  legacyGameFormat,
} = {}) {
  const resolvedMode = normalizeMatchMode(matchMode || legacyGameFormat);
  const resolvedFormat = normalizeGameFormat(gameFormat || legacyGameFormat);

  return {
    matchMode: resolvedMode,
    gameFormat: resolvedFormat,
    playersPerSide: getPlayersPerSide(resolvedFormat),
    isFriendly: resolvedMode === MATCH_MODE.FRIENDLY,
    isLeague: resolvedMode === MATCH_MODE.LEAGUE,
  };
}