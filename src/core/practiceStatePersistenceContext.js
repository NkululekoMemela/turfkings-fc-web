// src/core/practiceStatePersistenceContext.js
//
// Pure Practice v2 persistence-path resolver.
//
// No Firebase imports.
// No Firestore operations.
// Its only job is to prove that Practice state resolves beneath the
// correct disposable session sandbox.

import {
  assertDataScopePath,
  createPracticeDataScope,
  dataScopeStatePath,
} from "./dataScope.js";

function safeString(value = "") {
  return String(value || "").trim();
}

function requireId(value, label) {
  const normalized = safeString(value);

  if (!normalized) {
    throw new Error(
      `[PracticeStatePersistenceContext] ${label} is required.`
    );
  }

  if (normalized.includes("/")) {
    throw new Error(
      `[PracticeStatePersistenceContext] ${label} must not contain "/".`
    );
  }

  return normalized;
}

export function createPracticeStatePersistenceContext({
  clubId,
  sessionId,
} = {}) {
  const safeClubId = requireId(clubId, "clubId");
  const safeSessionId = requireId(sessionId, "sessionId");

  const dataScope = createPracticeDataScope({
    clubId: safeClubId,
    practiceSessionId: safeSessionId,
  });

  const statePath = dataScopeStatePath(dataScope);

  assertDataScopePath(
    dataScope,
    statePath
  );

  const expectedPath =
    `sandboxes/practice/clubs/${safeClubId}` +
    `/sessions/${safeSessionId}/state/main`;

  if (statePath !== expectedPath) {
    throw new Error(
      "[PracticeStatePersistenceContext] Practice state escaped expected sandbox state path."
    );
  }

  return Object.freeze({
    environment: "practice",
    clubId: safeClubId,
    practiceSessionId: safeSessionId,
    dataScope,
    statePath,
  });
}
