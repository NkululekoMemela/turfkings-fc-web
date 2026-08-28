import {
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "../../firebaseConfig";
import {
  getMatchCreditDoc,
  getMatchCreditsCollection,
} from "../clubFirestorePaths";
import { CLUB_COLLECTIONS } from "../clubPaths";

export const MATCH_CREDIT_STATUS = Object.freeze({
  AVAILABLE: "available",
  REDEEMED: "redeemed",
  VOIDED: "voided",
});

export const MATCH_CREDIT_SOURCE = Object.freeze({
  PLAYER_EARLY_CANCELLATION: "player_early_cancellation",
  MATCH_CANCELLED: "match_cancelled",
  ADMIN_EXCEPTION: "admin_exception",
  LEGACY_ADJUSTMENT: "legacy_adjustment",
});

function safePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

/*
 * A credit created from a real Match Signup entitlement gets a deterministic
 * document ID based on that entitlement.
 *
 * IMPORTANT:
 * sourceType is deliberately NOT part of the ID.
 *
 * The same paid place must never mint one credit as an early cancellation
 * and then another credit as an admin/weather cancellation if an operation
 * is retried or two flows race.
 */
export function buildMatchCreditId({
  playerId,
  sourceSignupDocId,
  sourceWeekId,
  legacyAdjustmentKey = "",
} = {}) {
  const safePlayer = safePart(playerId);
  const safeSignup = safePart(sourceSignupDocId);
  const safeWeek = safePart(sourceWeekId);

  if (safePlayer && safeSignup && safeWeek) {
    return `credit__${safePlayer}__${safeSignup}__${safeWeek}`;
  }

  /*
   * Legacy adjustment exists only for controlled one-off migration cases.
   * It must still receive its own deterministic key.
   */
  const safeLegacy = safePart(legacyAdjustmentKey);

  if (safePlayer && safeLegacy) {
    return `credit__legacy__${safePlayer}__${safeLegacy}`;
  }

  throw new Error(
    "Cannot build Match Credit ID without playerId and entitlement identity."
  );
}

export async function listClubMatchCredits({
  clubId,
} = {}) {
  const safeClubId = String(clubId || "").trim();

  if (!safeClubId) return [];

  const snap = await getDocs(
    getMatchCreditsCollection(db, safeClubId)
  );

  return snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() || {}),
    }))
    .sort((a, b) => {
      const aMs =
        a?.issuedAt?.toMillis?.() ||
        a?.createdAt?.toMillis?.() ||
        0;

      const bMs =
        b?.issuedAt?.toMillis?.() ||
        b?.createdAt?.toMillis?.() ||
        0;

      return bMs - aMs;
    });
}

export async function listPlayerMatchCredits({
  clubId,
  playerId,
} = {}) {
  const safeClubId = String(clubId || "").trim();
  const safePlayerId = String(playerId || "").trim();

  if (!safeClubId || !safePlayerId) return [];

  const ref = getMatchCreditsCollection(db, safeClubId);

  /*
   * Query only by playerId so the first version does not depend on a new
   * composite Firestore index. Status filtering happens locally.
   */
  const snap = await getDocs(
    query(ref, where("playerId", "==", safePlayerId))
  );

  return snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() || {}),
    }))
    .sort((a, b) => {
      const aMs =
        a?.issuedAt?.toMillis?.() ||
        a?.createdAt?.toMillis?.() ||
        0;
      const bMs =
        b?.issuedAt?.toMillis?.() ||
        b?.createdAt?.toMillis?.() ||
        0;

      return bMs - aMs;
    });
}

export async function listAvailablePlayerMatchCredits(args = {}) {
  const credits = await listPlayerMatchCredits(args);

  return credits.filter(
    (credit) => credit?.status === MATCH_CREDIT_STATUS.AVAILABLE
  );
}

/*
 * Mint exactly one Golden Match Credit for one original paid entitlement.
 *
 * Idempotency:
 * - deterministic document ID
 * - transaction checks for an existing document before creating one
 *
 * Calling this function twice for the same entitlement returns the existing
 * credit instead of creating another.
 */
export async function issueMatchCredit({
  clubId,
  playerId,
  playerName = "",
  sourceSignupDocId = "",
  sourceWeekId = "",
  sourceType,
  issuedBy = "",
  legacyAdjustmentKey = "",
} = {}) {
  const safeClubId = String(clubId || "").trim();
  const safePlayerId = String(playerId || "").trim();
  const safeSignupDocId = String(sourceSignupDocId || "").trim();
  const safeWeekId = String(sourceWeekId || "").trim();
  const safeSourceType = String(sourceType || "").trim();

  if (!safeClubId) {
    throw new Error("Missing clubId for Match Credit.");
  }

  if (!safePlayerId) {
    throw new Error("Missing playerId for Match Credit.");
  }

  if (!Object.values(MATCH_CREDIT_SOURCE).includes(safeSourceType)) {
    throw new Error(`Unsupported Match Credit source: ${safeSourceType}`);
  }

  const creditId = buildMatchCreditId({
    playerId: safePlayerId,
    sourceSignupDocId: safeSignupDocId,
    sourceWeekId: safeWeekId,
    legacyAdjustmentKey,
  });

  const creditRef = getMatchCreditDoc(
    db,
    creditId,
    safeClubId
  );

  return runTransaction(db, async (transaction) => {
    const existingSnap = await transaction.get(creditRef);

    if (existingSnap.exists()) {
      return {
        id: existingSnap.id,
        ...(existingSnap.data() || {}),
        alreadyExisted: true,
      };
    }

    const payload = {
      clubId: safeClubId,
      playerId: safePlayerId,
      playerName: String(playerName || "").trim(),

      status: MATCH_CREDIT_STATUS.AVAILABLE,
      quantity: 1,

      sourceType: safeSourceType,
      sourceSignupDocId: safeSignupDocId || null,
      sourceWeekId: safeWeekId || null,

      issuedBy: String(issuedBy || "").trim() || "system",
      issuedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      redeemedWeekId: null,
      redeemedAt: null,
      voidedAt: null,
    };

    transaction.set(creditRef, payload);

    return {
      id: creditId,
      ...payload,
      alreadyExisted: false,
    };
  });
}


function uniqueWeekIds(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function statusFromWeekState(selectedWeeks = [], paidWeeks = []) {
  const selected = uniqueWeekIds(selectedWeeks);
  const paid = uniqueWeekIds(paidWeeks);

  if (!selected.length) return "not_selected";

  const unpaid = selected.filter((weekId) => !paid.includes(weekId));
  return unpaid.length ? "pending" : "paid";
}

function resolveWeekCost(data = {}, weekId = "") {
  const safeWeekId = String(weekId || "").trim();

  const eventPrices =
    data?.eventPrices && typeof data.eventPrices === "object"
      ? data.eventPrices
      : {};

  const eventPrice = Number(eventPrices?.[safeWeekId]);

  if (Number.isFinite(eventPrice) && eventPrice >= 0) {
    return eventPrice;
  }

  const details = Array.isArray(data?.selectedEventDetails)
    ? data.selectedEventDetails
    : [];

  const detail = details.find(
    (item) => String(item?.id || "").trim() === safeWeekId
  );

  const detailPrice = Number(
    detail?.costPerGame ??
    detail?.price ??
    detail?.amount
  );

  if (Number.isFinite(detailPrice) && detailPrice >= 0) {
    return detailPrice;
  }

  const fallback = Number(data?.costPerGame);

  return Number.isFinite(fallback) && fallback >= 0
    ? fallback
    : 0;
}

function sumWeekCostsFromSignup(data = {}, weekIds = []) {
  return uniqueWeekIds(weekIds).reduce(
    (sum, weekId) => sum + resolveWeekCost(data, weekId),
    0
  );
}

/*
 * Cancel one already-paid Official Match Signup entitlement and return it
 * as exactly one Golden Match Credit.
 *
 * This function deliberately does NOT decide whether the cancellation is
 * 48-hour eligible. The caller supplies the already-resolved sourceType.
 *
 * The transaction itself still enforces the important financial facts:
 * - Match Credits must be enabled for the club.
 * - the source week must currently be paid;
 * - the same entitlement cannot create two credits;
 * - both signup mirrors lose the booking;
 * - the Golden Ticket is created in the same atomic commit.
 */
export async function cancelPaidMatchAndIssueCredit({
  clubId,
  playerId,
  playerName = "",
  signupDocId,
  weekId,
  sourceType = MATCH_CREDIT_SOURCE.PLAYER_EARLY_CANCELLATION,
  issuedBy = "",
} = {}) {
  const safeClubId = String(clubId || "").trim();
  const safePlayerId = String(playerId || "").trim();
  const safeSignupDocId = String(signupDocId || "").trim();
  const safeWeekId = String(weekId || "").trim();
  const safeSourceType = String(sourceType || "").trim();

  if (!safeClubId) throw new Error("Missing clubId.");
  if (!safePlayerId) throw new Error("Missing playerId.");
  if (!safeSignupDocId) throw new Error("Missing signupDocId.");
  if (!safeWeekId) throw new Error("Missing match week.");

  if (!Object.values(MATCH_CREDIT_SOURCE).includes(safeSourceType)) {
    throw new Error(`Unsupported Match Credit source: ${safeSourceType}`);
  }

  const creditId = buildMatchCreditId({
    playerId: safePlayerId,
    sourceSignupDocId: safeSignupDocId,
    sourceWeekId: safeWeekId,
  });

  const clubRef = doc(db, "clubs", safeClubId);

  const pendingRef = doc(
    db,
    "clubs",
    safeClubId,
    CLUB_COLLECTIONS.pendingSignups,
    safeSignupDocId
  );

  const matchSignupRef = doc(
    db,
    "clubs",
    safeClubId,
    CLUB_COLLECTIONS.matchSignups,
    safeSignupDocId
  );

  const creditRef = getMatchCreditDoc(
    db,
    creditId,
    safeClubId
  );

  return runTransaction(db, async (transaction) => {
    const [
      clubSnap,
      pendingSnap,
      matchSignupSnap,
      existingCreditSnap,
    ] = await Promise.all([
      transaction.get(clubRef),
      transaction.get(pendingRef),
      transaction.get(matchSignupRef),
      transaction.get(creditRef),
    ]);

    if (!clubSnap.exists()) {
      throw new Error("Club not found.");
    }

    const clubData = clubSnap.data() || {};

    if (
      clubData?.paymentSettings?.allowedActions?.canUseMatchCredits !== true
    ) {
      throw new Error("Match Credits are not enabled for this club.");
    }

    if (existingCreditSnap.exists()) {
      return {
        creditId,
        alreadyCompleted: true,
        credit: existingCreditSnap.data() || {},
      };
    }

    const pendingData = pendingSnap.exists()
      ? pendingSnap.data() || {}
      : {};

    const matchData = matchSignupSnap.exists()
      ? matchSignupSnap.data() || {}
      : {};

    const selectedWeeks = uniqueWeekIds([
      ...(pendingData.selectedWeeks || []),
      ...(matchData.selectedWeeks || []),
    ]);

    const paidWeeks = uniqueWeekIds([
      ...(pendingData.paidWeeks || []),
      ...(matchData.paidWeeks || []),
      ...(matchData.primaryPaidWeeks || []),
    ]);

    if (!paidWeeks.includes(safeWeekId)) {
      throw new Error(
        "This match is not currently recorded as paid."
      );
    }

    const nextSelectedWeeks = selectedWeeks.filter(
      (id) => id !== safeWeekId
    );

    const nextPaidWeeks = paidWeeks.filter(
      (id) => id !== safeWeekId
    );

    const nextUnpaidWeeks = nextSelectedWeeks.filter(
      (id) => !nextPaidWeeks.includes(id)
    );

    const sourceData =
      Object.keys(matchData).length > 0
        ? { ...pendingData, ...matchData }
        : pendingData;

    const nextPaymentStatus = statusFromWeekState(
      nextSelectedWeeks,
      nextPaidWeeks
    );

    const commonPatch = {
      selectedWeeks: nextSelectedWeeks,
      paidWeeks: nextPaidWeeks,
      primaryPaidWeeks: nextPaidWeeks,

      unpaidWeeks: nextUnpaidWeeks,
      unpaidPrimaryWeeks: nextUnpaidWeeks,
      weeksToPayNow: nextUnpaidWeeks,

      totalAmount: sumWeekCostsFromSignup(
        sourceData,
        nextUnpaidWeeks
      ),
      amountDueNow: sumWeekCostsFromSignup(
        sourceData,
        nextUnpaidWeeks
      ),
      amountPaidTotal: sumWeekCostsFromSignup(
        sourceData,
        nextPaidWeeks
      ),

      paymentStatus: nextPaymentStatus,
      isUnpaid: nextUnpaidWeeks.length > 0,

      lastMatchCreditCancellationWeekId: safeWeekId,
      lastMatchCreditCancellationAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (pendingSnap.exists()) {
      transaction.set(
        pendingRef,
        commonPatch,
        { merge: true }
      );
    }

    if (matchSignupSnap.exists()) {
      transaction.set(
        matchSignupRef,
        commonPatch,
        { merge: true }
      );
    }

    if (!pendingSnap.exists() && !matchSignupSnap.exists()) {
      throw new Error("Match Signup record not found.");
    }

    const creditPayload = {
      clubId: safeClubId,
      playerId: safePlayerId,
      playerName: String(playerName || "").trim(),

      status: MATCH_CREDIT_STATUS.AVAILABLE,
      quantity: 1,

      sourceType: safeSourceType,
      sourceSignupDocId: safeSignupDocId,
      sourceWeekId: safeWeekId,

      issuedBy: String(issuedBy || "").trim() || "system",
      issuedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      redeemedWeekId: null,
      redeemedAt: null,
      voidedAt: null,
    };

    transaction.set(creditRef, creditPayload);

    return {
      creditId,
      alreadyCompleted: false,
      credit: creditPayload,
      nextSelectedWeeks,
      nextPaidWeeks,
      nextUnpaidWeeks,
    };
  });
}


/*
 * Redeem one available Match Ticket against one Official future match.
 *
 * Atomic guarantee:
 * - the ticket becomes REDEEMED
 * - the destination match becomes selected + paid
 * - both signup mirrors are updated together
 *
 * A Match Ticket therefore behaves exactly like one paid match entitlement.
 */
export async function redeemMatchCreditForMatch({
  clubId,
  creditId,
  playerId,
  playerName = "",
  signupDocId,
  weekId,
  signupIdentity = {},
  redeemedBy = "",
} = {}) {
  const safeClubId = String(clubId || "").trim();
  const safeCreditId = String(creditId || "").trim();
  const safePlayerId = String(playerId || "").trim();
  const safeSignupDocId = String(signupDocId || "").trim();
  const safeWeekId = String(weekId || "").trim();

  if (!safeClubId) throw new Error("Missing clubId.");
  if (!safeCreditId) throw new Error("Missing Match Ticket.");
  if (!safePlayerId) throw new Error("Missing playerId.");
  if (!safeSignupDocId) throw new Error("Missing signupDocId.");
  if (!safeWeekId) throw new Error("Missing target match.");

  const clubRef = doc(db, "clubs", safeClubId);

  const creditRef = getMatchCreditDoc(
    db,
    safeCreditId,
    safeClubId
  );

  const pendingRef = doc(
    db,
    "clubs",
    safeClubId,
    CLUB_COLLECTIONS.pendingSignups,
    safeSignupDocId
  );

  const matchSignupRef = doc(
    db,
    "clubs",
    safeClubId,
    CLUB_COLLECTIONS.matchSignups,
    safeSignupDocId
  );

  return runTransaction(db, async (transaction) => {
    const [
      clubSnap,
      creditSnap,
      pendingSnap,
      matchSignupSnap,
    ] = await Promise.all([
      transaction.get(clubRef),
      transaction.get(creditRef),
      transaction.get(pendingRef),
      transaction.get(matchSignupRef),
    ]);

    if (!clubSnap.exists()) {
      throw new Error("Club not found.");
    }

    const clubData = clubSnap.data() || {};

    if (
      clubData?.paymentSettings?.allowedActions?.canUseMatchCredits !== true
    ) {
      throw new Error("Match Tickets are not enabled for this club.");
    }

    if (!creditSnap.exists()) {
      throw new Error("Match Ticket not found.");
    }

    const creditData = creditSnap.data() || {};

    if (creditData?.status !== MATCH_CREDIT_STATUS.AVAILABLE) {
      throw new Error("This Match Ticket has already been used.");
    }

    if (
      String(creditData?.playerId || "").trim() !== safePlayerId
    ) {
      throw new Error("This Match Ticket belongs to another player.");
    }

    const pendingData = pendingSnap.exists()
      ? pendingSnap.data() || {}
      : {};

    const matchData = matchSignupSnap.exists()
      ? matchSignupSnap.data() || {}
      : {};

    const selectedWeeks = uniqueWeekIds([
      ...(pendingData.selectedWeeks || []),
      ...(matchData.selectedWeeks || []),
      safeWeekId,
    ]);

    const paidWeeks = uniqueWeekIds([
      ...(pendingData.paidWeeks || []),
      ...(pendingData.primaryPaidWeeks || []),
      ...(matchData.paidWeeks || []),
      ...(matchData.primaryPaidWeeks || []),
      safeWeekId,
    ]);

    const unpaidWeeks = selectedWeeks.filter(
      (id) => !paidWeeks.includes(id)
    );

    const sourceData = {
      ...signupIdentity,
      ...pendingData,
      ...matchData,
    };

    const commonPatch = {
      ...signupIdentity,

      playerId: safePlayerId,
      playerName: String(playerName || "").trim(),

      selectedWeeks,
      paidWeeks,
      primaryPaidWeeks: paidWeeks,

      unpaidWeeks,
      unpaidPrimaryWeeks: unpaidWeeks,
      weeksToPayNow: unpaidWeeks,

      totalAmount: sumWeekCostsFromSignup(
        sourceData,
        unpaidWeeks
      ),
      amountDueNow: sumWeekCostsFromSignup(
        sourceData,
        unpaidWeeks
      ),
      amountPaidTotal: sumWeekCostsFromSignup(
        sourceData,
        paidWeeks
      ),

      paymentStatus: statusFromWeekState(
        selectedWeeks,
        paidWeeks
      ),
      isUnpaid: unpaidWeeks.length > 0,

      paymentMethod: "match_ticket",
      lastMatchTicketId: safeCreditId,
      lastMatchTicketWeekId: safeWeekId,
      updatedAt: serverTimestamp(),
    };

    transaction.set(
      pendingRef,
      commonPatch,
      { merge: true }
    );

    transaction.set(
      matchSignupRef,
      {
        ...commonPatch,
        amountDue: sumWeekCostsFromSignup(
          sourceData,
          unpaidWeeks
        ),
        amountPaid: sumWeekCostsFromSignup(
          sourceData,
          paidWeeks
        ),
        paymentIntentAmount: 0,
        paymentVerifiedAt: serverTimestamp(),
      },
      { merge: true }
    );

    transaction.update(creditRef, {
      status: MATCH_CREDIT_STATUS.REDEEMED,
      redeemedWeekId: safeWeekId,
      redeemedAt: serverTimestamp(),
      redeemedBy:
        String(redeemedBy || "").trim() ||
        safePlayerId,
      updatedAt: serverTimestamp(),
    });

    return {
      creditId: safeCreditId,
      redeemedWeekId: safeWeekId,
      selectedWeeks,
      paidWeeks,
      unpaidWeeks,
    };
  });
}

/*
 * Cancel a match that was booked with a Match Ticket and return
 * THE SAME ticket to the player's wallet.
 *
 * This is deliberately different from issuing a new credit.
 *
 * Atomic:
 * - remove destination week from selected/paid signup state
 * - change the redeemed ticket back to AVAILABLE
 * - remember that the destination week was also withdrawn from
 */
export async function returnRedeemedMatchTicketToWallet({
  clubId,
  creditId,
  playerId,
  signupDocId,
  weekId,
  returnedBy = "",
} = {}) {
  const safeClubId = String(clubId || "").trim();
  const safeCreditId = String(creditId || "").trim();
  const safePlayerId = String(playerId || "").trim();
  const safeSignupDocId = String(signupDocId || "").trim();
  const safeWeekId = String(weekId || "").trim();

  if (!safeClubId) throw new Error("Missing clubId.");
  if (!safeCreditId) throw new Error("Missing Match Ticket.");
  if (!safePlayerId) throw new Error("Missing playerId.");
  if (!safeSignupDocId) throw new Error("Missing signupDocId.");
  if (!safeWeekId) throw new Error("Missing match.");

  const clubRef = doc(db, "clubs", safeClubId);

  const creditRef = getMatchCreditDoc(
    db,
    safeCreditId,
    safeClubId
  );

  const pendingRef = doc(
    db,
    "clubs",
    safeClubId,
    CLUB_COLLECTIONS.pendingSignups,
    safeSignupDocId
  );

  const matchSignupRef = doc(
    db,
    "clubs",
    safeClubId,
    CLUB_COLLECTIONS.matchSignups,
    safeSignupDocId
  );

  return runTransaction(db, async (transaction) => {
    const [
      clubSnap,
      creditSnap,
      pendingSnap,
      matchSignupSnap,
    ] = await Promise.all([
      transaction.get(clubRef),
      transaction.get(creditRef),
      transaction.get(pendingRef),
      transaction.get(matchSignupRef),
    ]);

    if (!clubSnap.exists()) {
      throw new Error("Club not found.");
    }

    const clubData = clubSnap.data() || {};

    if (
      clubData?.paymentSettings?.allowedActions?.canUseMatchCredits !== true
    ) {
      throw new Error("Match Tickets are not enabled for this club.");
    }

    if (!creditSnap.exists()) {
      throw new Error("Match Ticket not found.");
    }

    const creditData = creditSnap.data() || {};

    if (creditData?.status !== MATCH_CREDIT_STATUS.REDEEMED) {
      throw new Error(
        "This Match Ticket is not currently being used for a match."
      );
    }

    if (
      String(creditData?.playerId || "").trim() !== safePlayerId
    ) {
      throw new Error("This Match Ticket belongs to another player.");
    }

    if (
      String(creditData?.redeemedWeekId || "").trim() !== safeWeekId
    ) {
      throw new Error(
        "This Match Ticket was not used for the selected match."
      );
    }

    const pendingData = pendingSnap.exists()
      ? pendingSnap.data() || {}
      : {};

    const matchData = matchSignupSnap.exists()
      ? matchSignupSnap.data() || {}
      : {};

    if (!pendingSnap.exists() && !matchSignupSnap.exists()) {
      throw new Error("Match Signup record not found.");
    }

    const selectedWeeks = uniqueWeekIds([
      ...(pendingData.selectedWeeks || []),
      ...(matchData.selectedWeeks || []),
    ]).filter((id) => id !== safeWeekId);

    const paidWeeks = uniqueWeekIds([
      ...(pendingData.paidWeeks || []),
      ...(pendingData.primaryPaidWeeks || []),
      ...(matchData.paidWeeks || []),
      ...(matchData.primaryPaidWeeks || []),
    ]).filter((id) => id !== safeWeekId);

    const unpaidWeeks = selectedWeeks.filter(
      (id) => !paidWeeks.includes(id)
    );

    const sourceData = {
      ...pendingData,
      ...matchData,
    };

    const paymentStatus = statusFromWeekState(
      selectedWeeks,
      paidWeeks
    );

    const commonPatch = {
      selectedWeeks,
      paidWeeks,
      primaryPaidWeeks: paidWeeks,

      unpaidWeeks,
      unpaidPrimaryWeeks: unpaidWeeks,
      weeksToPayNow: unpaidWeeks,

      totalAmount: sumWeekCostsFromSignup(
        sourceData,
        unpaidWeeks
      ),
      amountDueNow: sumWeekCostsFromSignup(
        sourceData,
        unpaidWeeks
      ),
      amountPaidTotal: sumWeekCostsFromSignup(
        sourceData,
        paidWeeks
      ),

      paymentStatus,
      isUnpaid: unpaidWeeks.length > 0,

      lastMatchTicketReturnWeekId: safeWeekId,
      lastMatchTicketReturnedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (pendingSnap.exists()) {
      transaction.set(
        pendingRef,
        commonPatch,
        { merge: true }
      );
    }

    if (matchSignupSnap.exists()) {
      transaction.set(
        matchSignupRef,
        {
          ...commonPatch,
          amountDue: sumWeekCostsFromSignup(
            sourceData,
            unpaidWeeks
          ),
          amountPaid: sumWeekCostsFromSignup(
            sourceData,
            paidWeeks
          ),
          paymentIntentAmount: 0,
        },
        { merge: true }
      );
    }

    const withdrawalWeekIds = uniqueWeekIds([
      creditData?.sourceWeekId,
      ...(Array.isArray(creditData?.withdrawalWeekIds)
        ? creditData.withdrawalWeekIds
        : []),
      safeWeekId,
    ]);

    transaction.update(creditRef, {
      status: MATCH_CREDIT_STATUS.AVAILABLE,

      withdrawalWeekIds,

      lastReturnedWeekId: safeWeekId,
      returnedAt: serverTimestamp(),
      returnedBy:
        String(returnedBy || "").trim() ||
        safePlayerId,

      redeemedWeekId: null,
      redeemedAt: null,
      redeemedBy: null,

      updatedAt: serverTimestamp(),
    });

    return {
      creditId: safeCreditId,
      selectedWeeks,
      paidWeeks,
      unpaidWeeks,
    };
  });
}
