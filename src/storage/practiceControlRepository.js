// src/storage/practiceControlRepository.js
//
// Firestore persistence for Practice v2 entitlement/accounting.
//
// IMPORTANT:
// - Persistent control-plane data only.
// - No scores, goals, squads, results or Practice football state.
// - Credit consumption and transfers are atomic transactions.
// - This repository is not yet wired into the application runtime.

import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import {
  PRACTICE_WEEKLY_CREDIT_ALLOCATION,
  createPracticeWeeklyEntitlement,
  getPracticeCreditsAvailable,
  getPracticeWeekKey,
  isPracticeEligibleRole,
} from "../core/practiceControlPlane.js";

import {
  practiceEntitlementDocPath,
  practiceTransferDocPath,
} from "../core/practiceControlPaths.js";

function requireId(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(
      `[PracticeControlRepository] ${label} is required.`
    );
  }

  return normalized;
}

function normalizeRole(role) {
  return requireId(role, "role").toLowerCase();
}

function buildStoredEntitlement({
  clubId,
  userId,
  role,
  weekKey,
  existing = null,
}) {
  if (existing) {
    return {
      ...existing,
      clubId,
      userId,
      role,
      weekKey,
      allocatedCredits:
        Number(existing.allocatedCredits) ||
        PRACTICE_WEEKLY_CREDIT_ALLOCATION,
      consumedCredits:
        Number(existing.consumedCredits || 0),
      transferredIn:
        Number(existing.transferredIn || 0),
      transferredOut:
        Number(existing.transferredOut || 0),
    };
  }

  return createPracticeWeeklyEntitlement({
    clubId,
    userId,
    role,
    at: `${weekKey}T12:00:00+02:00`,
  });
}

export async function getPracticeEntitlement(
  db,
  {
    clubId,
    userId,
    at = new Date(),
  } = {}
) {
  const safeClubId = requireId(clubId, "clubId");
  const safeUserId = requireId(userId, "userId");
  const weekKey = getPracticeWeekKey(at);

  const ref = doc(
    db,
    practiceEntitlementDocPath(
      safeClubId,
      weekKey,
      safeUserId
    )
  );

  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...(snap.data() || {}),
  };
}

/*
 * Atomically consume one Practice credit.
 *
 * The caller supplies the current club role for now.
 * Stage 3 Security Rules will independently enforce that the
 * authenticated user really is an eligible admin/captain.
 */
export async function consumePracticeCreditTransaction(
  db,
  {
    clubId,
    userId,
    role,
    at = new Date(),
  } = {}
) {
  const safeClubId = requireId(clubId, "clubId");
  const safeUserId = requireId(userId, "userId");
  const safeRole = normalizeRole(role);

  if (!isPracticeEligibleRole(safeRole)) {
    throw new Error(
      "[PracticeControlRepository] Practice is limited to admins and captains."
    );
  }

  const weekKey = getPracticeWeekKey(at);

  const entitlementRef = doc(
    db,
    practiceEntitlementDocPath(
      safeClubId,
      weekKey,
      safeUserId
    )
  );

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(entitlementRef);

    const current = buildStoredEntitlement({
      clubId: safeClubId,
      userId: safeUserId,
      role: safeRole,
      weekKey,
      existing: snap.exists()
        ? snap.data() || {}
        : null,
    });

    const availableBefore =
      getPracticeCreditsAvailable(current);

    if (availableBefore < 1) {
      throw new Error(
        "[PracticeControlRepository] No Practice credits available."
      );
    }

    const next = {
      ...current,
      consumedCredits:
        Number(current.consumedCredits || 0) + 1,
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      next.createdAt = serverTimestamp();
    }

    transaction.set(
      entitlementRef,
      next,
      { merge: true }
    );

    return {
      entitlement: {
        ...current,
        consumedCredits: next.consumedCredits,
      },
      weekKey,
      availableBefore,
      availableAfter: availableBefore - 1,
    };
  });
}

/*
 * Atomically transfer exactly one unused current-week credit.
 *
 * Total available Practice credits across sender + recipient
 * remain unchanged.
 */
export async function transferPracticeCreditTransaction(
  db,
  {
    clubId,
    senderUserId,
    senderRole,
    recipientUserId,
    recipientRole,
    transferId,
    at = new Date(),
  } = {}
) {
  const safeClubId = requireId(clubId, "clubId");
  const safeSenderId = requireId(
    senderUserId,
    "senderUserId"
  );
  const safeRecipientId = requireId(
    recipientUserId,
    "recipientUserId"
  );
  const safeTransferId = requireId(
    transferId,
    "transferId"
  );

  const safeSenderRole = normalizeRole(senderRole);
  const safeRecipientRole = normalizeRole(recipientRole);

  if (!isPracticeEligibleRole(safeSenderRole)) {
    throw new Error(
      "[PracticeControlRepository] Sender is not Practice eligible."
    );
  }

  if (!isPracticeEligibleRole(safeRecipientRole)) {
    throw new Error(
      "[PracticeControlRepository] Recipient is not Practice eligible."
    );
  }

  if (safeSenderId === safeRecipientId) {
    throw new Error(
      "[PracticeControlRepository] Cannot transfer Practice credit to yourself."
    );
  }

  const weekKey = getPracticeWeekKey(at);

  const senderRef = doc(
    db,
    practiceEntitlementDocPath(
      safeClubId,
      weekKey,
      safeSenderId
    )
  );

  const recipientRef = doc(
    db,
    practiceEntitlementDocPath(
      safeClubId,
      weekKey,
      safeRecipientId
    )
  );

  const transferRef = doc(
    db,
    practiceTransferDocPath(
      safeClubId,
      weekKey,
      safeTransferId
    )
  );

  return runTransaction(db, async (transaction) => {
    const [
      senderSnap,
      recipientSnap,
      transferSnap,
    ] = await Promise.all([
      transaction.get(senderRef),
      transaction.get(recipientRef),
      transaction.get(transferRef),
    ]);

    /*
     * Transfer IDs are immutable/idempotent.
     * Retrying the same transfer request cannot create another credit.
     */
    if (transferSnap.exists()) {
      throw new Error(
        "[PracticeControlRepository] Practice transfer already exists."
      );
    }

    const sender = buildStoredEntitlement({
      clubId: safeClubId,
      userId: safeSenderId,
      role: safeSenderRole,
      weekKey,
      existing: senderSnap.exists()
        ? senderSnap.data() || {}
        : null,
    });

    const recipient = buildStoredEntitlement({
      clubId: safeClubId,
      userId: safeRecipientId,
      role: safeRecipientRole,
      weekKey,
      existing: recipientSnap.exists()
        ? recipientSnap.data() || {}
        : null,
    });

    const senderAvailableBefore =
      getPracticeCreditsAvailable(sender);

    const recipientAvailableBefore =
      getPracticeCreditsAvailable(recipient);

    if (senderAvailableBefore < 1) {
      throw new Error(
        "[PracticeControlRepository] Sender has no Practice credits available."
      );
    }

    transaction.set(
      senderRef,
      {
        ...sender,
        transferredOut:
          Number(sender.transferredOut || 0) + 1,
        updatedAt: serverTimestamp(),
        ...(!senderSnap.exists()
          ? { createdAt: serverTimestamp() }
          : {}),
      },
      { merge: true }
    );

    transaction.set(
      recipientRef,
      {
        ...recipient,
        transferredIn:
          Number(recipient.transferredIn || 0) + 1,
        updatedAt: serverTimestamp(),
        ...(!recipientSnap.exists()
          ? { createdAt: serverTimestamp() }
          : {}),
      },
      { merge: true }
    );

    transaction.set(
      transferRef,
      {
        id: safeTransferId,
        clubId: safeClubId,
        weekKey,
        senderUserId: safeSenderId,
        recipientUserId: safeRecipientId,
        credits: 1,
        createdAt: serverTimestamp(),
      }
    );

    return {
      transferId: safeTransferId,
      weekKey,
      senderAvailableBefore,
      senderAvailableAfter:
        senderAvailableBefore - 1,
      recipientAvailableBefore,
      recipientAvailableAfter:
        recipientAvailableBefore + 1,
    };
  });
}
