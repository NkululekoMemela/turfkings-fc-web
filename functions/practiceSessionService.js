/* eslint-env node */
/* global module */

const crypto = require("crypto");
const {Timestamp} = require("firebase-admin/firestore");

const PRACTICE_DURATION_SECONDS = 15 * 60;
const PRACTICE_WEEKLY_CREDITS = 3;
const PRACTICE_TIME_ZONE = "Africa/Johannesburg";

function safeString(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeString(value).toLowerCase();
}

function requireId(value, label) {
  const normalized = safeString(value);

  if (!normalized) {
    throw new Error(`[PracticeSession] ${label} is required.`);
  }

  if (normalized.includes("/")) {
    throw new Error(
      `[PracticeSession] ${label} cannot contain a Firestore path separator.`
    );
  }

  return normalized;
}

/*
 * Practice business weeks reset Monday 00:00 SAST.
 *
 * South Africa uses UTC+02:00 year-round, so calculating from the
 * SAST-shifted clock gives us a deterministic Monday boundary without
 * trusting the browser.
 */
function getPracticeWeekKeyFromServerDate(input = new Date()) {
  const source =
    input instanceof Date ? new Date(input.getTime()) : new Date(input);

  if (Number.isNaN(source.getTime())) {
    throw new Error("[PracticeSession] Invalid server date.");
  }

  const sast = new Date(source.getTime() + 2 * 60 * 60 * 1000);

  const day = sast.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  sast.setUTCDate(sast.getUTCDate() - daysSinceMonday);
  sast.setUTCHours(0, 0, 0, 0);

  return sast.toISOString().slice(0, 10);
}

function resolvePracticeRole({club = {}, email = ""}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return "";

  const adminEmails = Array.isArray(club.adminEmails)
    ? club.adminEmails.map(normalizeEmail)
    : [];

  const captainEmails = Array.isArray(club.captainEmails)
    ? club.captainEmails.map(normalizeEmail)
    : [];

  const primaryCaptainEmail = normalizeEmail(club?.captain?.email || "");

  if (adminEmails.includes(normalizedEmail)) {
    return "admin";
  }

  if (
    captainEmails.includes(normalizedEmail) ||
    primaryCaptainEmail === normalizedEmail
  ) {
    return "captain";
  }

  return "";
}

function buildPracticeControlRefs({
  db,
  clubId,
  weekKey,
  userId,
  sessionId,
}) {
  const safeClubId = requireId(clubId, "clubId");
  const safeWeekKey = requireId(weekKey, "weekKey");
  const safeUserId = requireId(userId, "userId");
  const safeSessionId = requireId(sessionId, "sessionId");

  const clubControlRef = db
    .collection("practiceControl")
    .doc(safeClubId);

  const weekRef = clubControlRef
    .collection("weeks")
    .doc(safeWeekKey);

  const entitlementRef = weekRef
    .collection("entitlements")
    .doc(safeUserId);

  const sessionRef = db
    .collection("practiceSessions")
    .doc(safeSessionId);

  return {
    clubControlRef,
    weekRef,
    entitlementRef,
    sessionRef,
  };
}

async function startPracticeSession({
  db,
  authenticatedUser,
  clubId,
  now = new Date(),
}) {
  if (!db) {
    throw new Error("[PracticeSession] Firestore db is required.");
  }

  const uid = requireId(authenticatedUser?.uid, "authenticated user UID");
  const email = normalizeEmail(authenticatedUser?.email || "");

  if (!email) {
    const error = new Error(
      "[PracticeSession] Authenticated account has no email address."
    );
    error.code = "practice/email-required";
    throw error;
  }

  const safeClubId = requireId(clubId, "clubId");

  const clubRef = db.collection("clubs").doc(safeClubId);
  const clubSnap = await clubRef.get();

  if (!clubSnap.exists) {
    const error = new Error("[PracticeSession] Club not found.");
    error.code = "practice/club-not-found";
    throw error;
  }

  const club = clubSnap.data() || {};
  const role = resolvePracticeRole({
    club,
    email,
  });

  if (!role) {
    const error = new Error(
      "[PracticeSession] Only this club's admins and captains may start Practice."
    );
    error.code = "practice/not-authorized";
    throw error;
  }

  const serverNow =
    now instanceof Date ? new Date(now.getTime()) : new Date(now);

  if (Number.isNaN(serverNow.getTime())) {
    throw new Error("[PracticeSession] Invalid server time.");
  }

  const weekKey = getPracticeWeekKeyFromServerDate(serverNow);
  const sessionId = crypto.randomUUID();

  const startedAt = Timestamp.fromDate(serverNow);
  const expiresAt = Timestamp.fromMillis(
    serverNow.getTime() + PRACTICE_DURATION_SECONDS * 1000
  );

  const refs = buildPracticeControlRefs({
    db,
    clubId: safeClubId,
    weekKey,
    userId: uid,
    sessionId,
  });

  let creditsRemaining = 0;

  await db.runTransaction(async (transaction) => {
    const entitlementSnap = await transaction.get(refs.entitlementRef);

    const current = entitlementSnap.exists
      ? entitlementSnap.data() || {}
      : {};

    const consumed = Math.max(
      0,
      Number(current.creditsConsumed || 0)
    );

    const transferredIn = Math.max(
      0,
      Number(current.creditsTransferredIn || 0)
    );

    const transferredOut = Math.max(
      0,
      Number(current.creditsTransferredOut || 0)
    );

    const totalAvailable =
      PRACTICE_WEEKLY_CREDITS +
      transferredIn -
      transferredOut;

    const availableBeforeStart = totalAvailable - consumed;

    if (availableBeforeStart <= 0) {
      const error = new Error(
        "[PracticeSession] No Practice sessions remain for this week."
      );
      error.code = "practice/no-credits";
      throw error;
    }

    const nextConsumed = consumed + 1;
    creditsRemaining = totalAvailable - nextConsumed;

    transaction.set(
      refs.entitlementRef,
      {
        clubId: safeClubId,
        userId: uid,
        userEmail: email,
        weekKey,
        role,
        weeklyBaseCredits: PRACTICE_WEEKLY_CREDITS,
        creditsConsumed: nextConsumed,
        creditsTransferredIn: transferredIn,
        creditsTransferredOut: transferredOut,
        creditsRemaining,
        updatedAt: startedAt,
      },
      {merge: true}
    );

    transaction.set(
      refs.sessionRef,
      {
        sessionId,
        clubId: safeClubId,
        userId: uid,
        userEmail: email,
        createdByRole: role,
        weekKey,
        status: "active",
        durationSeconds: PRACTICE_DURATION_SECONDS,
        startedAt,
        expiresAt,
        creditConsumed: true,
        controlPlaneVersion: 1,
      }
    );
  });

  return {
    sessionId,
    clubId: safeClubId,
    userId: uid,
    role,
    weekKey,
    status: "active",
    durationSeconds: PRACTICE_DURATION_SECONDS,
    startedAt,
    expiresAt,
    creditsRemaining,
  };
}

module.exports = {
  PRACTICE_DURATION_SECONDS,
  PRACTICE_WEEKLY_CREDITS,
  PRACTICE_TIME_ZONE,
  getPracticeWeekKeyFromServerDate,
  resolvePracticeRole,
  buildPracticeControlRefs,
  startPracticeSession,
};
