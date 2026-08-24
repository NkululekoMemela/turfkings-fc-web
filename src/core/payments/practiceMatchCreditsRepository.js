// src/core/payments/practiceMatchCreditsRepository.js
//
// Disposable Practice Match Ticket simulation.
//
// IMPORTANT:
// - Every reference is resolved through an explicit Practice DataScope.
// - No Official payment or Match Credit collection is touched.
// - These records disappear with the Practice session.

import {
  deleteDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../../firebaseConfig.js";

import {
  getScopedMatchCreditsCollection,
  getScopedMatchCreditDoc,
  getScopedPendingSignupDoc,
  getScopedMatchSignupDoc,
} from "../clubFirestorePaths.js";

import {
  isPracticeDataScope,
  normalizeDataScope,
} from "../dataScope.js";

import {
  MATCH_CREDIT_SOURCE,
  MATCH_CREDIT_STATUS,
  buildMatchCreditId,
} from "./matchCreditsRepository.js";


function requirePracticeScope(dataScope) {
  const scope = normalizeDataScope(dataScope);

  if (!isPracticeDataScope(scope)) {
    throw new Error(
      "[PracticeMatchTickets] Practice DataScope required."
    );
  }

  return scope;
}


function normalizeWeekIds(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}


function addWeek(value, weekId) {
  return normalizeWeekIds([
    ...normalizeWeekIds(value),
    String(weekId || "").trim(),
  ]);
}


function removeWeek(value, weekId) {
  const target = String(weekId || "").trim();

  return normalizeWeekIds(value).filter(
    (item) => item !== target
  );
}


export async function listPracticeMatchCredits({
  dataScope,
  playerId = "",
} = {}) {
  const scope = requirePracticeScope(dataScope);
  const safePlayerId = String(playerId || "").trim();

  const snap = await getDocs(
    getScopedMatchCreditsCollection(db, scope)
  );

  return snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() || {}),
    }))
    .filter((credit) => {
      if (!safePlayerId) return true;

      return (
        String(credit?.playerId || "").trim() ===
        safePlayerId
      );
    })
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


export async function listAvailablePracticeMatchCredits(args = {}) {
  const credits = await listPracticeMatchCredits(args);

  return credits.filter(
    (credit) =>
      credit?.status === MATCH_CREDIT_STATUS.AVAILABLE
  );
}


export async function cancelPracticePaidMatchAndIssueCredit({
  dataScope,
  playerId,
  playerName = "",
  signupDocId,
  weekId,
  issuedBy = "",
} = {}) {
  const scope = requirePracticeScope(dataScope);

  const safePlayerId = String(playerId || "").trim();
  const safeSignupDocId = String(signupDocId || "").trim();
  const safeWeekId = String(weekId || "").trim();

  if (!safePlayerId || !safeSignupDocId || !safeWeekId) {
    throw new Error(
      "[PracticeMatchTickets] playerId, signupDocId and weekId are required."
    );
  }

  const creditId = buildMatchCreditId({
    playerId: safePlayerId,
    sourceSignupDocId: safeSignupDocId,
    sourceWeekId: safeWeekId,
  });

  const creditRef =
    getScopedMatchCreditDoc(db, creditId, scope);

  const pendingRef =
    getScopedPendingSignupDoc(
      db,
      safeSignupDocId,
      scope
    );

  const matchSignupRef =
    getScopedMatchSignupDoc(
      db,
      safeSignupDocId,
      scope
    );

  await runTransaction(db, async (tx) => {
    const [creditSnap, pendingSnap, matchSnap] =
      await Promise.all([
        tx.get(creditRef),
        tx.get(pendingRef),
        tx.get(matchSignupRef),
      ]);

    const pending = pendingSnap.exists()
      ? pendingSnap.data() || {}
      : {};

    const matchSignup = matchSnap.exists()
      ? matchSnap.data() || {}
      : {};

    const currentSelectedWeeks =
      normalizeWeekIds(
        pending.selectedWeeks ||
        matchSignup.selectedWeeks
      );

    const currentPaidWeeks =
      normalizeWeekIds(
        pending.paidWeeks ||
        matchSignup.paidWeeks
      );

    const nextSelectedWeeks =
      removeWeek(currentSelectedWeeks, safeWeekId);

    const nextPaidWeeks =
      removeWeek(currentPaidWeeks, safeWeekId);

    const signupPatch = {
      selectedWeeks: nextSelectedWeeks,
      paidWeeks: nextPaidWeeks,
      updatedAt: serverTimestamp(),
    };

    if (pendingSnap.exists()) {
      tx.set(pendingRef, signupPatch, { merge: true });
    }

    if (matchSnap.exists()) {
      tx.set(matchSignupRef, signupPatch, { merge: true });
    }

    if (!creditSnap.exists()) {
      tx.set(creditRef, {
        playerId: safePlayerId,
        playerName: String(playerName || "").trim(),

        status: MATCH_CREDIT_STATUS.AVAILABLE,
        sourceType:
          MATCH_CREDIT_SOURCE.PLAYER_EARLY_CANCELLATION,

        sourceSignupDocId: safeSignupDocId,
        sourceWeekId: safeWeekId,

        practiceSimulation: true,
        dataScope: "practice",

        issuedBy: String(issuedBy || "").trim(),
        issuedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        redeemedWeekId: null,
        redeemedSignupDocId: null,
        redeemedAt: null,
      });
    } else {
      tx.set(
        creditRef,
        {
          status: MATCH_CREDIT_STATUS.AVAILABLE,
          practiceSimulation: true,
          dataScope: "practice",

          redeemedWeekId: null,
          redeemedSignupDocId: null,
          redeemedAt: null,

          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  return { creditId };
}


export async function redeemPracticeMatchCreditForMatch({
  dataScope,
  creditId,
  playerId,
  playerName = "",
  signupDocId,
  weekId,
  signupIdentity = {},
  redeemedBy = "",
} = {}) {
  const scope = requirePracticeScope(dataScope);

  const safeCreditId = String(creditId || "").trim();
  const safePlayerId = String(playerId || "").trim();
  const safeSignupDocId = String(signupDocId || "").trim();
  const safeWeekId = String(weekId || "").trim();

  if (
    !safeCreditId ||
    !safePlayerId ||
    !safeSignupDocId ||
    !safeWeekId
  ) {
    throw new Error(
      "[PracticeMatchTickets] creditId, playerId, signupDocId and weekId are required."
    );
  }

  const creditRef =
    getScopedMatchCreditDoc(
      db,
      safeCreditId,
      scope
    );

  const pendingRef =
    getScopedPendingSignupDoc(
      db,
      safeSignupDocId,
      scope
    );

  const matchSignupRef =
    getScopedMatchSignupDoc(
      db,
      safeSignupDocId,
      scope
    );

  let result = null;

  await runTransaction(db, async (tx) => {
    const [creditSnap, pendingSnap, matchSnap] =
      await Promise.all([
        tx.get(creditRef),
        tx.get(pendingRef),
        tx.get(matchSignupRef),
      ]);

    if (!creditSnap.exists()) {
      throw new Error("Practice Match Ticket not found.");
    }

    const credit = creditSnap.data() || {};

    if (
      credit.status !== MATCH_CREDIT_STATUS.AVAILABLE
    ) {
      throw new Error(
        "This Practice Match Ticket is no longer available."
      );
    }

    if (
      String(credit.playerId || "").trim() !==
      safePlayerId
    ) {
      throw new Error(
        "This Practice Match Ticket belongs to another player."
      );
    }

    const pending = pendingSnap.exists()
      ? pendingSnap.data() || {}
      : {};

    const matchSignup = matchSnap.exists()
      ? matchSnap.data() || {}
      : {};

    const selectedWeeks = addWeek(
      pending.selectedWeeks ||
        matchSignup.selectedWeeks,
      safeWeekId
    );

    const paidWeeks = addWeek(
      pending.paidWeeks ||
        matchSignup.paidWeeks,
      safeWeekId
    );

    const identity =
      signupIdentity &&
      typeof signupIdentity === "object"
        ? signupIdentity
        : {};

    const signupPatch = {
      ...identity,

      playerId: safePlayerId,
      playerName:
        String(playerName || "").trim() ||
        String(identity.playerName || "").trim(),

      selectedWeeks,
      paidWeeks,

      paymentStatus: "paid",
      paid: true,
      paymentMethod: "practice_match_ticket",
      paymentProvider: "practice_simulation",
      practiceSimulation: true,

      updatedAt: serverTimestamp(),
    };

    tx.set(
      pendingRef,
      signupPatch,
      { merge: true }
    );

    tx.set(
      matchSignupRef,
      signupPatch,
      { merge: true }
    );

    tx.set(
      creditRef,
      {
        status: MATCH_CREDIT_STATUS.REDEEMED,

        redeemedWeekId: safeWeekId,
        redeemedSignupDocId: safeSignupDocId,
        redeemedBy: String(redeemedBy || "").trim(),
        redeemedAt: serverTimestamp(),

        practiceSimulation: true,
        dataScope: "practice",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    result = {
      selectedWeeks,
      paidWeeks,
    };
  });

  return result;
}


export async function returnPracticeRedeemedMatchTicketToWallet({
  dataScope,
  creditId,
  playerId,
  signupDocId,
  weekId,
  returnedBy = "",
} = {}) {
  const scope = requirePracticeScope(dataScope);

  const safeCreditId = String(creditId || "").trim();
  const safePlayerId = String(playerId || "").trim();
  const safeSignupDocId = String(signupDocId || "").trim();
  const safeWeekId = String(weekId || "").trim();

  const creditRef =
    getScopedMatchCreditDoc(
      db,
      safeCreditId,
      scope
    );

  const pendingRef =
    getScopedPendingSignupDoc(
      db,
      safeSignupDocId,
      scope
    );

  const matchSignupRef =
    getScopedMatchSignupDoc(
      db,
      safeSignupDocId,
      scope
    );

  await runTransaction(db, async (tx) => {
    const [creditSnap, pendingSnap, matchSnap] =
      await Promise.all([
        tx.get(creditRef),
        tx.get(pendingRef),
        tx.get(matchSignupRef),
      ]);

    if (!creditSnap.exists()) {
      throw new Error("Practice Match Ticket not found.");
    }

    const credit = creditSnap.data() || {};

    if (
      credit.status !== MATCH_CREDIT_STATUS.REDEEMED ||
      String(credit.playerId || "").trim() !== safePlayerId ||
      String(credit.redeemedWeekId || "").trim() !== safeWeekId
    ) {
      throw new Error(
        "This Practice Match Ticket is not redeemed for that match."
      );
    }

    const pending = pendingSnap.exists()
      ? pendingSnap.data() || {}
      : {};

    const matchSignup = matchSnap.exists()
      ? matchSnap.data() || {}
      : {};

    const selectedWeeks = removeWeek(
      pending.selectedWeeks ||
        matchSignup.selectedWeeks,
      safeWeekId
    );

    const paidWeeks = removeWeek(
      pending.paidWeeks ||
        matchSignup.paidWeeks,
      safeWeekId
    );

    const signupPatch = {
      selectedWeeks,
      paidWeeks,
      updatedAt: serverTimestamp(),
    };

    if (pendingSnap.exists()) {
      tx.set(pendingRef, signupPatch, { merge: true });
    }

    if (matchSnap.exists()) {
      tx.set(matchSignupRef, signupPatch, { merge: true });
    }

    tx.set(
      creditRef,
      {
        status: MATCH_CREDIT_STATUS.AVAILABLE,

        redeemedWeekId: null,
        redeemedSignupDocId: null,
        redeemedAt: null,

        returnedBy: String(returnedBy || "").trim(),
        returnedAt: serverTimestamp(),

        practiceSimulation: true,
        dataScope: "practice",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  return {
    selectedWeeks: null,
    paidWeeks: null,
  };
}
