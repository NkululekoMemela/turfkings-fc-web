// src/core/practiceSessionContext.js
//
// Practice v2 runtime context builder.
//
// Combines:
// - the real club's read-only roster
// - the disposable Practice DataScope
//
// This module does not write anything and does not activate
// the existing Practice UI by itself.

import {
  createPracticeDataScope,
} from "./dataScope.js";

import {
  loadPracticeRoster,
} from "../storage/practiceRosterRepository.js";

function requireId(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(
      `[PracticeSessionContext] ${label} is required.`
    );
  }

  if (normalized.includes("/")) {
    throw new Error(
      `[PracticeSessionContext] ${label} must be a document ID.`
    );
  }

  return normalized;
}

export async function buildPracticeSessionContext({
  clubId,
  practiceSessionId,
} = {}) {
  const safeClubId = requireId(clubId, "clubId");

  const safeSessionId = requireId(
    practiceSessionId,
    "practiceSessionId"
  );

  const dataScope = createPracticeDataScope({
    clubId: safeClubId,
    practiceSessionId: safeSessionId,
  });

  const roster = await loadPracticeRoster(
    safeClubId
  );

  return Object.freeze({
    environment: "practice",
    clubId: safeClubId,
    practiceSessionId: safeSessionId,
    dataScope,
    roster,
  });
}
