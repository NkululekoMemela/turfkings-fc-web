// src/core/practiceDataPolicy.js
//
// Practice v2 data-boundary policy.
//
// This module describes WHICH data belongs to the disposable Practice
// simulation and which data must remain Official/read-only.
//
// It does not activate Practice v2 by itself.

export const PRACTICE_DATA_CLASS = Object.freeze({
  PLATFORM_OFFICIAL: "platform-official",
  OFFICIAL_READ_ONLY: "official-read-only",
  SCOPED_FOOTBALL: "scoped-football",
  EXTERNAL_EFFECT: "external-effect",
  LEGACY_PRACTICE: "legacy-practice",
});

export const PRACTICE_DATA_POLICY = Object.freeze({
  // A — global identity/platform truth.
  platformPlayers: PRACTICE_DATA_CLASS.PLATFORM_OFFICIAL,
  authentication: PRACTICE_DATA_CLASS.PLATFORM_OFFICIAL,
  gpiIdentity: PRACTICE_DATA_CLASS.PLATFORM_OFFICIAL,

  // B — real club truth that Practice may consume but must not mutate
  // as part of the simulation.
  clubIdentity: PRACTICE_DATA_CLASS.OFFICIAL_READ_ONLY,
  members: PRACTICE_DATA_CLASS.OFFICIAL_READ_ONLY,
  players: PRACTICE_DATA_CLASS.OFFICIAL_READ_ONLY,
  playerPhotos: PRACTICE_DATA_CLASS.OFFICIAL_READ_ONLY,

  // C — mutable football/session state.
  state: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,
  seasons: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,
  matches: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,
  matchSignups: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,
  pendingSignups: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,
  attendance: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,
  peerRatings: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,
  peerRatingBaselines: PRACTICE_DATA_CLASS.SCOPED_FOOTBALL,

  // D — Practice must never create real external/permanent effects.
  payments: PRACTICE_DATA_CLASS.EXTERNAL_EFFECT,
  notifications: PRACTICE_DATA_CLASS.EXTERNAL_EFFECT,
  newsStories: PRACTICE_DATA_CLASS.EXTERNAL_EFFECT,
  videoHighlights: PRACTICE_DATA_CLASS.EXTERNAL_EFFECT,
  permanentAwards: PRACTICE_DATA_CLASS.EXTERNAL_EFFECT,
  email: PRACTICE_DATA_CLASS.EXTERNAL_EFFECT,
  whatsapp: PRACTICE_DATA_CLASS.EXTERNAL_EFFECT,

  // E — existing Practice v1 machinery scheduled for retirement.
  practiceSyntheticClub: PRACTICE_DATA_CLASS.LEGACY_PRACTICE,
  practiceDummyPlayers: PRACTICE_DATA_CLASS.LEGACY_PRACTICE,
  practiceSeed: PRACTICE_DATA_CLASS.LEGACY_PRACTICE,
});

export function getPracticeDataClass(surface) {
  const key = String(surface || "").trim();

  if (!Object.prototype.hasOwnProperty.call(PRACTICE_DATA_POLICY, key)) {
    throw new Error(
      `[PracticeDataPolicy] Unclassified data surface: ${key || "(empty)"}`
    );
  }

  return PRACTICE_DATA_POLICY[key];
}

export function canPracticeWriteOfficialSurface(surface) {
  const classification = getPracticeDataClass(surface);

  // Practice simulation must never write through to Official truth.
  // Scoped football writes belong in the Practice DataScope instead.
  return false;
}

export function mustPracticeUseDataScope(surface) {
  return (
    getPracticeDataClass(surface) ===
    PRACTICE_DATA_CLASS.SCOPED_FOOTBALL
  );
}

export function mustPracticeSimulateOrBlock(surface) {
  return (
    getPracticeDataClass(surface) ===
    PRACTICE_DATA_CLASS.EXTERNAL_EFFECT
  );
}

export function isLegacyPracticeSurface(surface) {
  return (
    getPracticeDataClass(surface) ===
    PRACTICE_DATA_CLASS.LEGACY_PRACTICE
  );
}
