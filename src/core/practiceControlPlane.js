// src/core/practiceControlPlane.js
//
// Practice v2 control-plane domain rules.
//
// PURE LOGIC ONLY.
// No Firestore reads/writes.
// No UI.
// No Practice session bootstrap.
//
// Persistent storage is added only after these rules are proven.

export const PRACTICE_SESSION_DURATION_SECONDS = 15 * 60;
export const PRACTICE_WEEKLY_CREDIT_ALLOCATION = 3;

export const PRACTICE_ELIGIBLE_ROLES = Object.freeze([
  "admin",
  "captain",
]);

function requireNonEmpty(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`[PracticeControlPlane] ${label} is required.`);
  }

  return normalized;
}

export function isPracticeEligibleRole(role) {
  return PRACTICE_ELIGIBLE_ROLES.includes(
    String(role || "").trim().toLowerCase()
  );
}

/*
 * FANM Practice weeks follow South African business time:
 *
 * Monday 00:00 SAST (Africa/Johannesburg).
 *
 * South Africa uses UTC+02:00 year-round with no daylight-saving
 * transition. We therefore shift into SAST before determining the
 * Monday business-date key.
 *
 * The returned key is the South African calendar date of the Monday
 * that owns the entitlement week, e.g. "2026-08-10".
 */
export function getPracticeWeekKey(input = new Date()) {
  const instant =
    input instanceof Date
      ? new Date(input.getTime())
      : new Date(input);

  if (Number.isNaN(instant.getTime())) {
    throw new Error(
      "[PracticeControlPlane] Valid date is required."
    );
  }

  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

  const sastCalendar = new Date(
    instant.getTime() + SAST_OFFSET_MS
  );

  const sastDay = sastCalendar.getUTCDay();
  const daysSinceMonday = (sastDay + 6) % 7;

  sastCalendar.setUTCDate(
    sastCalendar.getUTCDate() - daysSinceMonday
  );

  return sastCalendar.toISOString().slice(0, 10);
}

export function createPracticeWeeklyEntitlement({
  clubId,
  userId,
  role,
  at = new Date(),
} = {}) {
  const normalizedClubId = requireNonEmpty(clubId, "clubId");
  const normalizedUserId = requireNonEmpty(userId, "userId");
  const normalizedRole = requireNonEmpty(role, "role").toLowerCase();

  if (!isPracticeEligibleRole(normalizedRole)) {
    throw new Error(
      "[PracticeControlPlane] Practice is limited to admins and captains."
    );
  }

  return {
    clubId: normalizedClubId,
    userId: normalizedUserId,
    role: normalizedRole,
    weekKey: getPracticeWeekKey(at),
    allocatedCredits: PRACTICE_WEEKLY_CREDIT_ALLOCATION,
    consumedCredits: 0,
    transferredIn: 0,
    transferredOut: 0,
  };
}

export function getPracticeCreditsAvailable(entitlement) {
  if (!entitlement) return 0;

  const allocated = Number(entitlement.allocatedCredits || 0);
  const consumed = Number(entitlement.consumedCredits || 0);
  const transferredIn = Number(entitlement.transferredIn || 0);
  const transferredOut = Number(entitlement.transferredOut || 0);

  return Math.max(
    0,
    allocated + transferredIn - transferredOut - consumed
  );
}

export function consumePracticeCredit(entitlement) {
  if (!entitlement) {
    throw new Error(
      "[PracticeControlPlane] Entitlement is required."
    );
  }

  if (getPracticeCreditsAvailable(entitlement) < 1) {
    throw new Error(
      "[PracticeControlPlane] No Practice credits available."
    );
  }

  return {
    ...entitlement,
    consumedCredits:
      Number(entitlement.consumedCredits || 0) + 1,
  };
}

export function transferPracticeCredit({
  sender,
  recipient,
} = {}) {
  if (!sender || !recipient) {
    throw new Error(
      "[PracticeControlPlane] Sender and recipient are required."
    );
  }

  if (
    requireNonEmpty(sender.clubId, "sender.clubId") !==
    requireNonEmpty(recipient.clubId, "recipient.clubId")
  ) {
    throw new Error(
      "[PracticeControlPlane] Practice credits cannot cross clubs."
    );
  }

  if (sender.weekKey !== recipient.weekKey) {
    throw new Error(
      "[PracticeControlPlane] Practice credits cannot cross weeks."
    );
  }

  if (!isPracticeEligibleRole(sender.role)) {
    throw new Error(
      "[PracticeControlPlane] Sender is not Practice eligible."
    );
  }

  if (!isPracticeEligibleRole(recipient.role)) {
    throw new Error(
      "[PracticeControlPlane] Recipient is not Practice eligible."
    );
  }

  if (sender.userId === recipient.userId) {
    throw new Error(
      "[PracticeControlPlane] Cannot transfer Practice credit to yourself."
    );
  }

  if (getPracticeCreditsAvailable(sender) < 1) {
    throw new Error(
      "[PracticeControlPlane] Sender has no Practice credits available."
    );
  }

  return {
    sender: {
      ...sender,
      transferredOut:
        Number(sender.transferredOut || 0) + 1,
    },
    recipient: {
      ...recipient,
      transferredIn:
        Number(recipient.transferredIn || 0) + 1,
    },
  };
}

export function createPracticeSessionWindow({
  startedAt = new Date(),
} = {}) {
  const start =
    startedAt instanceof Date
      ? new Date(startedAt.getTime())
      : new Date(startedAt);

  if (Number.isNaN(start.getTime())) {
    throw new Error(
      "[PracticeControlPlane] Valid startedAt is required."
    );
  }

  const expires = new Date(
    start.getTime() +
      PRACTICE_SESSION_DURATION_SECONDS * 1000
  );

  return {
    startedAt: start.toISOString(),
    expiresAt: expires.toISOString(),
    durationSeconds: PRACTICE_SESSION_DURATION_SECONDS,
  };
}

export function isPracticeSessionExpired(
  session,
  at = new Date()
) {
  if (!session?.expiresAt) return true;

  const now = at instanceof Date ? at : new Date(at);
  const expires = new Date(session.expiresAt);

  if (
    Number.isNaN(now.getTime()) ||
    Number.isNaN(expires.getTime())
  ) {
    return true;
  }

  return now.getTime() >= expires.getTime();
}
