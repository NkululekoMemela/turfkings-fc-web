// src/core/dataScope.js
//
// Canonical FANM football-data scope.
//
// Official Session and Practice Session must share football code while
// resolving persistence into structurally separate Firestore namespaces.
//
// IMPORTANT:
// - Official football belongs under clubs/{clubId}/...
// - Practice football belongs under
//   sandboxes/practice/clubs/{clubId}/sessions/{practiceSessionId}/...
// - This module does not activate Practice v2 by itself.

import { DEFAULT_CLUB_ID } from "./clubPaths.js";

export const DATA_ENVIRONMENT = Object.freeze({
  OFFICIAL: "official",
  PRACTICE: "practice",
});

const OFFICIAL_ROOT_PREFIX = "clubs/";
const PRACTICE_ROOT_PREFIX = "sandboxes/practice/clubs/";

function normalizeRequiredId(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`[DataScope] ${label} is required.`);
  }

  if (normalized.includes("/")) {
    throw new Error(
      `[DataScope] ${label} must be a Firestore document ID, not a path.`
    );
  }

  return normalized;
}

export function createOfficialDataScope(
  clubId = DEFAULT_CLUB_ID
) {
  return Object.freeze({
    environment: DATA_ENVIRONMENT.OFFICIAL,
    clubId: normalizeRequiredId(clubId, "clubId"),
    practiceSessionId: null,
  });
}

export function createPracticeDataScope({
  clubId = DEFAULT_CLUB_ID,
  practiceSessionId,
} = {}) {
  return Object.freeze({
    environment: DATA_ENVIRONMENT.PRACTICE,
    clubId: normalizeRequiredId(clubId, "clubId"),
    practiceSessionId: normalizeRequiredId(
      practiceSessionId,
      "practiceSessionId"
    ),
  });
}

export function normalizeDataScope(scope) {
  if (!scope) {
    return createOfficialDataScope();
  }

  if (typeof scope === "string") {
    return createOfficialDataScope(scope);
  }

  if (scope.environment === DATA_ENVIRONMENT.PRACTICE) {
    return createPracticeDataScope(scope);
  }

  if (
    !scope.environment ||
    scope.environment === DATA_ENVIRONMENT.OFFICIAL
  ) {
    return createOfficialDataScope(
      scope.clubId || DEFAULT_CLUB_ID
    );
  }

  throw new Error(
    `[DataScope] Unsupported environment: ${String(
      scope.environment
    )}`
  );
}

export function isOfficialDataScope(scope) {
  return (
    normalizeDataScope(scope).environment ===
    DATA_ENVIRONMENT.OFFICIAL
  );
}

export function isPracticeDataScope(scope) {
  return (
    normalizeDataScope(scope).environment ===
    DATA_ENVIRONMENT.PRACTICE
  );
}

export function dataScopeRoot(scope) {
  const normalized = normalizeDataScope(scope);

  if (
    normalized.environment === DATA_ENVIRONMENT.OFFICIAL
  ) {
    const path = `clubs/${normalized.clubId}`;
    assertDataScopePath(normalized, path);
    return path;
  }

  const path =
    `sandboxes/practice/clubs/${normalized.clubId}` +
    `/sessions/${normalized.practiceSessionId}`;

  assertDataScopePath(normalized, path);
  return path;
}

export function dataScopeStatePath(scope) {
  return `${dataScopeRoot(scope)}/state/main`;
}

export function dataScopeCollectionPath(
  collectionName,
  scope
) {
  const safeCollectionName = normalizeRequiredId(
    collectionName,
    "collectionName"
  );

  return `${dataScopeRoot(scope)}/${safeCollectionName}`;
}

export function dataScopeDocPath(
  collectionName,
  docId,
  scope
) {
  const safeDocId = normalizeRequiredId(docId, "docId");

  return (
    `${dataScopeCollectionPath(collectionName, scope)}` +
    `/${safeDocId}`
  );
}

export function assertDataScopePath(scope, path) {
  const normalized = normalizeDataScope(scope);
  const safePath = String(path || "").trim();

  if (!safePath) {
    throw new Error("[DataScope] Resolved path is empty.");
  }

  if (
    normalized.environment === DATA_ENVIRONMENT.PRACTICE
  ) {
    if (safePath.startsWith(OFFICIAL_ROOT_PREFIX)) {
      throw new Error(
        "[DataScope] SAFETY VIOLATION: Practice scope resolved " +
          "into the official clubs namespace."
      );
    }

    if (!safePath.startsWith(PRACTICE_ROOT_PREFIX)) {
      throw new Error(
        "[DataScope] SAFETY VIOLATION: Practice scope resolved " +
          "outside the Practice sandbox namespace."
      );
    }

    return true;
  }

  if (!safePath.startsWith(OFFICIAL_ROOT_PREFIX)) {
    throw new Error(
      "[DataScope] SAFETY VIOLATION: Official scope resolved " +
        "outside the official clubs namespace."
    );
  }

  if (safePath.startsWith(PRACTICE_ROOT_PREFIX)) {
    throw new Error(
      "[DataScope] SAFETY VIOLATION: Official scope resolved " +
        "into the Practice sandbox namespace."
    );
  }

  return true;
}
