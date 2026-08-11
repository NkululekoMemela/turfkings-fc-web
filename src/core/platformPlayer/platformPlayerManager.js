// ============================================================
// GPI Stage 2.4B
// Platform Player Manager / Write Planner
//
// PURE ORCHESTRATION ONLY.
// ------------------------------------------------------------
// This module decides WHAT should happen.
//
// It does NOT:
// - import Firebase
// - read Firestore
// - write Firestore
// - modify members
// - modify players
// - modify clubs
//
// The result is only an in-memory plan.
// ============================================================

import {
  buildPlatformPlayerSnapshot,
  evaluatePlatformPlayerState,
  mergePlatformIdentity,
  shouldCreatePlatformPlayer,
} from "./platformPlayerService.js";

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function comparablePlayer(player = {}) {
  return {
    uid: clean(player.uid),
    email: normalizeEmail(player.email),
    fullName: clean(player.fullName),
    photoUrl: clean(player.photoUrl),
    whatsappNumber: clean(player.whatsappNumber),
  };
}

function samePlatformPlayer(a = {}, b = {}) {
  const left = comparablePlayer(a);
  const right = comparablePlayer(b);

  return (
    left.uid === right.uid &&
    left.email === right.email &&
    left.fullName === right.fullName &&
    left.photoUrl === right.photoUrl &&
    left.whatsappNumber === right.whatsappNumber
  );
}

/**
 * Build the candidate Platform Player entirely in memory.
 */
export function buildPlatformPlayerCandidate({
  authenticatedUser = null,
  reusableProfile = null,
  currentMember = null,
} = {}) {
  return buildPlatformPlayerSnapshot({
    authenticatedUser,
    reusableProfile,
    currentMember,
  });
}

/**
 * Produce an in-memory future write plan.
 *
 * Possible actions:
 *
 * CREATE
 * MERGE
 * NONE
 * BLOCKED
 */
export function planPlatformPlayerWrite({
  existingPlatformPlayer = null,
  authenticatedUser = null,
  reusableProfile = null,
  currentMember = null,
} = {}) {
  const candidate = buildPlatformPlayerCandidate({
    authenticatedUser,
    reusableProfile,
    currentMember,
  });

  const candidateState =
    evaluatePlatformPlayerState(candidate);

  if (!shouldCreatePlatformPlayer(candidate)) {
    return {
      action: "BLOCKED",
      safeToWrite: false,
      reason:
        "Platform Player requires authenticated UID and verified email.",
      documentId: "",
      payload: null,
      candidate,
      candidateState,
    };
  }

  const documentId = clean(candidate.uid);

  if (!existingPlatformPlayer) {
    return {
      action: "CREATE",
      safeToWrite: true,
      reason:
        "Authenticated player has no Platform Player document yet.",
      documentId,
      payload: candidate,
      candidate,
      candidateState,
    };
  }

  const existingEmail =
    normalizeEmail(existingPlatformPlayer.email);

  const candidateEmail =
    normalizeEmail(candidate.email);

  /*
   * Very important identity guard.
   *
   * A Platform Player document can never silently merge
   * two different verified emails.
   */
  if (
    existingEmail &&
    candidateEmail &&
    existingEmail !== candidateEmail
  ) {
    return {
      action: "BLOCKED",
      safeToWrite: false,
      reason:
        "Existing Platform Player email conflicts with authenticated email.",
      documentId,
      payload: null,
      candidate,
      candidateState,
    };
  }

  const merged = mergePlatformIdentity({
    existingPlatformPlayer,
    incomingSnapshot: candidate,
  });

  if (
    samePlatformPlayer(
      existingPlatformPlayer,
      merged
    )
  ) {
    return {
      action: "NONE",
      safeToWrite: true,
      reason:
        "Existing Platform Player already contains the available identity data.",
      documentId,
      payload: null,
      candidate,
      candidateState,
    };
  }

  return {
    action: "MERGE",
    safeToWrite: true,
    reason:
      "New verified identity information can enrich the existing Platform Player.",
    documentId,
    payload: merged,
    candidate,
    candidateState,
  };
}
