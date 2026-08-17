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

  const serverNow =
    now instanceof Date ? new Date(now.getTime()) : new Date(now);

  if (Number.isNaN(serverNow.getTime())) {
    throw new Error("[PracticeSession] Invalid server time.");
  }

  const clubRef = db.collection("clubs").doc(safeClubId);
  const clubSnap = await clubRef.get();

  if (!clubSnap.exists) {
    const error = new Error("[PracticeSession] Club not found.");
    error.code = "practice/club-not-found";
    throw error;
  }

  const club = clubSnap.data() || {};

  // Temporary server-owned platform Practice Tester entitlement.
  // This is deliberately separate from per-club weekly credits.
  const platformTesterRef = db
    .collection("practiceControl")
    .doc("platformTesters")
    .collection("users")
    .doc(uid);

  const platformTesterSnap = await platformTesterRef.get();
  const platformTester = platformTesterSnap.exists
    ? platformTesterSnap.data() || {}
    : {};

  const platformTesterExpiresAt = platformTester.expiresAt;
  const platformTesterExpiresAtMs =
    platformTesterExpiresAt &&
    typeof platformTesterExpiresAt.toMillis === "function"
      ? platformTesterExpiresAt.toMillis()
      : 0;

  const isPlatformTester =
    platformTester.enabled === true &&
    platformTester.bypassWeeklyStartLimit === true &&
    platformTesterExpiresAtMs > serverNow.getTime();

  const clubRole = resolvePracticeRole({
    club,
    email,
  });

  const role =
    clubRole ||
    (
      isPlatformTester &&
      platformTester.bypassClubRoleRequirement === true
        ? "admin"
        : ""
    );

  if (!role) {
    const error = new Error(
      "[PracticeSession] Only this club's admins and captains may start Practice."
    );
    error.code = "practice/not-authorized";
    throw error;
  }

  const weekKey = getPracticeWeekKeyFromServerDate(serverNow);
  const sessionId = crypto.randomUUID();

  // Practice duration is authoritative and identical for normal users
  // and platform testers. Tester privileges bypass development access
  // restrictions only; they do not alter the production session length.
  const sessionDurationSeconds = PRACTICE_DURATION_SECONDS;

  const startedAt = Timestamp.fromDate(serverNow);
  const expiresAt = Timestamp.fromMillis(
    serverNow.getTime() + sessionDurationSeconds * 1000
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

    if (!isPlatformTester && availableBeforeStart <= 0) {
      const error = new Error(
        "[PracticeSession] No Practice sessions remain for this week."
      );
      error.code = "practice/no-credits";
      throw error;
    }

    // Platform testing must not consume or manufacture ordinary user credits.
    const nextConsumed =
      isPlatformTester ? consumed : consumed + 1;

    creditsRemaining = Math.max(
      0,
      totalAvailable - nextConsumed
    );

    const testerStartsThisWeek =
      Math.max(
        0,
        Number(current.testerStartsThisWeek || 0)
      ) + (isPlatformTester ? 1 : 0);

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
        activeSessionId: sessionId,
        ...(isPlatformTester
          ? {
              testerStartsThisWeek,
              testerOverrideLastUsedAt: startedAt,
            }
          : {}),
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
        durationSeconds: sessionDurationSeconds,
        startedAt,
        expiresAt,
        creditConsumed: !isPlatformTester,
        testerOverrideUsed: isPlatformTester,
        ...(isPlatformTester && platformTesterExpiresAt
          ? {
              testerOverrideExpiresAt: platformTesterExpiresAt,
            }
          : {}),
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
    durationSeconds: sessionDurationSeconds,
    startedAt,
    expiresAt,
    creditsRemaining,
    testerOverrideUsed: isPlatformTester,
  };
}



async function transferPracticeCredit({
  db,
  authenticatedUser,
  clubId,
  recipientUserId,
  transferId,
  now = new Date(),
}) {
  if (!db) {
    throw new Error("[PracticeSession] Firestore db is required.");
  }

  const uid = requireId(
    authenticatedUser?.uid,
    "authenticated user UID"
  );

  const senderEmail = normalizeEmail(
    authenticatedUser?.email || ""
  );

  if (!senderEmail) {
    const error = new Error(
      "[PracticeSession] Authenticated account has no email address."
    );
    error.code = "practice/email-required";
    throw error;
  }

  const safeClubId = requireId(clubId, "clubId");
  const safeRecipientUserId = requireId(
    recipientUserId,
    "recipientUserId"
  );
  const safeTransferId = requireId(transferId, "transferId");

  if (uid === safeRecipientUserId) {
    const error = new Error(
      "[PracticeSession] Practice credit cannot be transferred to yourself."
    );
    error.code = "practice/self-transfer";
    throw error;
  }

  const serverNow =
    now instanceof Date ? new Date(now.getTime()) : new Date(now);

  if (Number.isNaN(serverNow.getTime())) {
    throw new Error("[PracticeSession] Invalid server time.");
  }

  const weekKey = getPracticeWeekKeyFromServerDate(serverNow);
  const transferredAt = Timestamp.fromDate(serverNow);

  const clubRef = db.collection("clubs").doc(safeClubId);
  const clubSnap = await clubRef.get();

  if (!clubSnap.exists) {
    const error = new Error("[PracticeSession] Club not found.");
    error.code = "practice/club-not-found";
    throw error;
  }

  const club = clubSnap.data() || {};

  const senderRole = resolvePracticeRole({
    club,
    email: senderEmail,
  });

  if (!senderRole) {
    const error = new Error(
      "[PracticeSession] Only this club's admins and captains may transfer Practice credits."
    );
    error.code = "practice/not-authorized";
    throw error;
  }

  const membersSnap = await clubRef.collection("members").get();

  let recipientMember = null;

  membersSnap.forEach((memberSnap) => {
    if (recipientMember) return;

    const member = memberSnap.data() || {};

    const identityCandidates = [
      member.uid,
      member.platformIdentityUid,
      member.authUid,
    ]
      .map((value) => safeString(value))
      .filter(Boolean);

    if (
      memberSnap.id === safeRecipientUserId ||
      identityCandidates.includes(safeRecipientUserId)
    ) {
      recipientMember = {
        id: memberSnap.id,
        ...member,
      };
    }
  });

  if (!recipientMember) {
    const error = new Error(
      "[PracticeSession] Practice credit recipient is not a member of this club."
    );
    error.code = "practice/recipient-not-found";
    throw error;
  }

  const recipientEmail = normalizeEmail(
    recipientMember.email || ""
  );

  if (!recipientEmail) {
    const error = new Error(
      "[PracticeSession] Practice credit recipient has no usable club email."
    );
    error.code = "practice/recipient-email-required";
    throw error;
  }

  const recipientRole =
    resolvePracticeRole({
      club,
      email: recipientEmail,
    }) ||
    (
      ["admin", "captain"].includes(
        safeString(recipientMember.role).toLowerCase()
      )
        ? safeString(recipientMember.role).toLowerCase()
        : ""
    );

  if (!recipientRole) {
    const error = new Error(
      "[PracticeSession] Practice credits may only be transferred to another admin or captain of this club."
    );
    error.code = "practice/recipient-not-authorized";
    throw error;
  }

  const senderRef = db
    .collection("practiceControl")
    .doc(safeClubId)
    .collection("weeks")
    .doc(weekKey)
    .collection("entitlements")
    .doc(uid);

  const recipientRef = db
    .collection("practiceControl")
    .doc(safeClubId)
    .collection("weeks")
    .doc(weekKey)
    .collection("entitlements")
    .doc(safeRecipientUserId);

  const transferRef = db
    .collection("practiceControl")
    .doc(safeClubId)
    .collection("weeks")
    .doc(weekKey)
    .collection("transfers")
    .doc(safeTransferId);

  let senderCreditsRemaining = 0;
  let recipientCreditsRemaining = 0;

  await db.runTransaction(async (transaction) => {
    const [
      senderSnap,
      recipientSnap,
      transferSnap,
    ] = await Promise.all([
      transaction.get(senderRef),
      transaction.get(recipientRef),
      transaction.get(transferRef),
    ]);

    if (transferSnap.exists) {
      const error = new Error(
        "[PracticeSession] Practice transfer already exists."
      );
      error.code = "practice/transfer-exists";
      throw error;
    }

    const sender = senderSnap.exists
      ? senderSnap.data() || {}
      : {};

    const recipient = recipientSnap.exists
      ? recipientSnap.data() || {}
      : {};

    const senderConsumed = Math.max(
      0,
      Number(sender.creditsConsumed || 0)
    );
    const senderTransferredIn = Math.max(
      0,
      Number(sender.creditsTransferredIn || 0)
    );
    const senderTransferredOut = Math.max(
      0,
      Number(sender.creditsTransferredOut || 0)
    );

    const senderTotalAvailable =
      PRACTICE_WEEKLY_CREDITS +
      senderTransferredIn -
      senderTransferredOut;

    const senderAvailableBeforeTransfer =
      senderTotalAvailable - senderConsumed;

    if (senderAvailableBeforeTransfer <= 0) {
      const error = new Error(
        "[PracticeSession] No Practice credit is available to transfer."
      );
      error.code = "practice/no-transfer-credit";
      throw error;
    }

    const recipientConsumed = Math.max(
      0,
      Number(recipient.creditsConsumed || 0)
    );
    const recipientTransferredIn = Math.max(
      0,
      Number(recipient.creditsTransferredIn || 0)
    );
    const recipientTransferredOut = Math.max(
      0,
      Number(recipient.creditsTransferredOut || 0)
    );

    const nextSenderTransferredOut =
      senderTransferredOut + 1;

    const nextRecipientTransferredIn =
      recipientTransferredIn + 1;

    senderCreditsRemaining = Math.max(
      0,
      PRACTICE_WEEKLY_CREDITS +
        senderTransferredIn -
        nextSenderTransferredOut -
        senderConsumed
    );

    recipientCreditsRemaining = Math.max(
      0,
      PRACTICE_WEEKLY_CREDITS +
        nextRecipientTransferredIn -
        recipientTransferredOut -
        recipientConsumed
    );

    transaction.set(
      senderRef,
      {
        clubId: safeClubId,
        userId: uid,
        userEmail: senderEmail,
        weekKey,
        role: senderRole,
        weeklyBaseCredits: PRACTICE_WEEKLY_CREDITS,
        creditsConsumed: senderConsumed,
        creditsTransferredIn: senderTransferredIn,
        creditsTransferredOut: nextSenderTransferredOut,
        creditsRemaining: senderCreditsRemaining,
        updatedAt: transferredAt,
      },
      {merge: true}
    );

    transaction.set(
      recipientRef,
      {
        clubId: safeClubId,
        userId: safeRecipientUserId,
        userEmail: recipientEmail,
        weekKey,
        role: recipientRole,
        weeklyBaseCredits: PRACTICE_WEEKLY_CREDITS,
        creditsConsumed: recipientConsumed,
        creditsTransferredIn: nextRecipientTransferredIn,
        creditsTransferredOut: recipientTransferredOut,
        creditsRemaining: recipientCreditsRemaining,
        updatedAt: transferredAt,
      },
      {merge: true}
    );

    transaction.set(transferRef, {
      transferId: safeTransferId,
      clubId: safeClubId,
      weekKey,
      senderUserId: uid,
      senderEmail,
      recipientUserId: safeRecipientUserId,
      recipientEmail,
      amount: 1,
      transferredAt,
      controlPlaneVersion: 1,
    });
  });

  return {
    transferId: safeTransferId,
    clubId: safeClubId,
    weekKey,
    senderUserId: uid,
    recipientUserId: safeRecipientUserId,
    amount: 1,
    senderCreditsRemaining,
    recipientCreditsRemaining,
  };
}

async function endPracticeSession({
  db,
  authenticatedUser,
  clubId,
  reason = "change-profile",
  now = new Date(),
}) {
  if (!db) {
    throw new Error("[PracticeSession] Firestore db is required.");
  }

  const uid = requireId(
    authenticatedUser?.uid,
    "authenticated user UID"
  );

  const safeClubId = requireId(clubId, "clubId");

  const safeReason =
    reason === "time-expired"
      ? "time-expired"
      : "change-profile";

  const finalStatus =
    safeReason === "time-expired"
      ? "expired"
      : "ended";

  const serverNow =
    now instanceof Date ? new Date(now.getTime()) : new Date(now);

  if (Number.isNaN(serverNow.getTime())) {
    throw new Error("[PracticeSession] Invalid server time.");
  }

  const weekKey = getPracticeWeekKeyFromServerDate(serverNow);

  const entitlementRef = db
    .collection("practiceControl")
    .doc(safeClubId)
    .collection("weeks")
    .doc(weekKey)
    .collection("entitlements")
    .doc(uid);

  let endedSessionId = null;

  await db.runTransaction(async (transaction) => {
    const entitlementSnap = await transaction.get(entitlementRef);

    if (!entitlementSnap.exists) {
      return;
    }

    const entitlement = entitlementSnap.data() || {};
    const activeSessionId = safeString(entitlement.activeSessionId);

    if (!activeSessionId) {
      return;
    }

    const sessionRef = db
      .collection("practiceSessions")
      .doc(requireId(activeSessionId, "activeSessionId"));

    const sessionSnap = await transaction.get(sessionRef);

    if (
      sessionSnap.exists &&
      safeString(sessionSnap.data()?.clubId) === safeClubId &&
      safeString(sessionSnap.data()?.userId) === uid
    ) {
      transaction.update(sessionRef, {
        status: finalStatus,
        endedAt: serverNow,
        endedReason: safeReason,
      });

      endedSessionId = activeSessionId;
    }

    transaction.update(entitlementRef, {
      activeSessionId: null,
      updatedAt: serverNow,
    });
  });

  return {
    clubId: safeClubId,
    userId: uid,
    weekKey,
    sessionId: endedSessionId,
    status: finalStatus,
    endedReason: safeReason,
  };
}

async function getActivePracticeSession({
  db,
  authenticatedUser,
  clubId,
  now = new Date(),
}) {
  if (!db) {
    throw new Error("[PracticeSession] Firestore db is required.");
  }

  const uid = requireId(
    authenticatedUser?.uid,
    "authenticated user UID"
  );

  const safeClubId = requireId(clubId, "clubId");

  const serverNow =
    now instanceof Date ? new Date(now.getTime()) : new Date(now);

  if (Number.isNaN(serverNow.getTime())) {
    throw new Error("[PracticeSession] Invalid server time.");
  }

  const weekKey =
    getPracticeWeekKeyFromServerDate(serverNow);

  const entitlementRef = db
    .collection("practiceControl")
    .doc(safeClubId)
    .collection("weeks")
    .doc(weekKey)
    .collection("entitlements")
    .doc(uid);

  const entitlementSnap = await entitlementRef.get();

  if (!entitlementSnap.exists) {
    return null;
  }

  const entitlement = entitlementSnap.data() || {};
  const activeSessionId = safeString(
    entitlement.activeSessionId
  );

  if (!activeSessionId) {
    return null;
  }

  const sessionRef = db
    .collection("practiceSessions")
    .doc(requireId(activeSessionId, "activeSessionId"));

  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    return null;
  }

  const session = sessionSnap.data() || {};

  if (
    safeString(session.clubId) !== safeClubId ||
    safeString(session.userId) !== uid ||
    safeString(session.weekKey) !== weekKey ||
    safeString(session.status) !== "active"
  ) {
    return null;
  }

  const expiresAt = session.expiresAt;

  if (
    !expiresAt ||
    typeof expiresAt.toMillis !== "function" ||
    serverNow.getTime() >= expiresAt.toMillis()
  ) {
    return null;
  }

  return {
    sessionId: activeSessionId,
    clubId: safeClubId,
    userId: uid,
    role: safeString(session.createdByRole),
    weekKey,
    status: "active",
    durationSeconds: Number(
      session.durationSeconds ||
      PRACTICE_DURATION_SECONDS
    ),
    startedAt: session.startedAt,
    expiresAt,
    creditsRemaining: Math.max(
      0,
      Number(entitlement.creditsRemaining || 0)
    ),
  };
}

module.exports = {
  PRACTICE_DURATION_SECONDS,
  PRACTICE_WEEKLY_CREDITS,
  PRACTICE_TIME_ZONE,
  getPracticeWeekKeyFromServerDate,
  resolvePracticeRole,
  buildPracticeControlRefs,
  transferPracticeCredit,
  startPracticeSession,
  getActivePracticeSession,
  endPracticeSession,
};
