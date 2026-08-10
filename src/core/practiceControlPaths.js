// src/core/practiceControlPaths.js
//
// Persistent Practice control-plane paths.
//
// These records enforce Practice entitlement/accounting and therefore
// MUST NOT live inside the disposable sandboxes/practice namespace.

function requireId(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(
      `[PracticeControlPaths] ${label} is required.`
    );
  }

  if (normalized.includes("/")) {
    throw new Error(
      `[PracticeControlPaths] ${label} must be a document ID, not a path.`
    );
  }

  return normalized;
}

export function practiceControlClubPath(clubId) {
  return `practiceControl/${requireId(clubId, "clubId")}`;
}

export function practiceControlWeekPath(
  clubId,
  weekKey
) {
  return (
    `${practiceControlClubPath(clubId)}` +
    `/weeks/${requireId(weekKey, "weekKey")}`
  );
}

export function practiceEntitlementsCollectionPath(
  clubId,
  weekKey
) {
  return `${practiceControlWeekPath(clubId, weekKey)}/entitlements`;
}

export function practiceEntitlementDocPath(
  clubId,
  weekKey,
  userId
) {
  return (
    `${practiceEntitlementsCollectionPath(clubId, weekKey)}` +
    `/${requireId(userId, "userId")}`
  );
}

export function practiceTransfersCollectionPath(
  clubId,
  weekKey
) {
  return `${practiceControlWeekPath(clubId, weekKey)}/transfers`;
}

export function practiceTransferDocPath(
  clubId,
  weekKey,
  transferId
) {
  return (
    `${practiceTransfersCollectionPath(clubId, weekKey)}` +
    `/${requireId(transferId, "transferId")}`
  );
}
