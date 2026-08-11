// ============================================================
// GPI Platform Player Coordinator
//
// Owns the runtime Platform Player lifecycle:
//
// snapshot -> existing identity -> plan -> optional persistence
//
// EntryPage should not need to know how Platform Players are
// read, merged, or persisted.
//
// IMPORTANT:
// Existing club/member/player collections are never touched here.
// ============================================================

import {
  buildPlatformPlayerSnapshot,
  evaluatePlatformPlayerState,
} from "./platformPlayerService.js";

import {
  planPlatformPlayerWrite,
} from "./platformPlayerManager.js";

import {
  readPlatformPlayer,
  upsertPlatformPlayer,
} from "./platformPlayerFirestoreRepository.js";

export async function coordinatePlatformPlayer({
  authenticatedUser = null,
  reusableProfile = null,
  currentMember = null,
  destinationClubId = "",
  persistenceAllowed = false,
} = {}) {
  const snapshot =
    buildPlatformPlayerSnapshot({
      authenticatedUser,
      reusableProfile,
      currentMember,
    });

  const state =
    evaluatePlatformPlayerState(snapshot);

  let existingPlatformPlayer = null;

  if (persistenceAllowed && authenticatedUser?.uid) {
    try {
      existingPlatformPlayer =
        await readPlatformPlayer(
          authenticatedUser.uid
        );
    } catch (error) {
      console.warn(
        "[GPI Platform Player] Existing identity read failed:",
        error
      );
    }
  }

  const plan =
    planPlatformPlayerWrite({
      existingPlatformPlayer,
      authenticatedUser,
      reusableProfile,
      currentMember,
    });

  let firestoreExecuted = false;

  if (
    persistenceAllowed &&
    plan.safeToWrite &&
    (
      plan.action === "CREATE" ||
      plan.action === "MERGE"
    )
  ) {
    try {
      await upsertPlatformPlayer(plan.payload);
      firestoreExecuted = true;
    } catch (error) {
      console.error(
        "[GPI Platform Player] Persistence failed:",
        error
      );
    }
  }

  const result = {
    snapshot,
    state,
    plan,
    persistenceAllowed: Boolean(persistenceAllowed),
    firestoreExecuted,
    sourceClubId:
      reusableProfile?.clubId || "",
    destinationClubId,
  };

  console.log(
    "[GPI Platform Player Coordinator]",
    {
      action: plan.action,
      documentId: plan.documentId || "",
      safeToWrite: plan.safeToWrite,
      reason: plan.reason,
      hasPhoto: Boolean(snapshot.photoUrl),
      hasPhone: Boolean(snapshot.whatsappNumber),
      sourceClubId:
        result.sourceClubId,
      destinationClubId:
        result.destinationClubId,
      persistenceAllowed:
        result.persistenceAllowed,
      firestoreExecuted:
        result.firestoreExecuted,
    }
  );

  return result;
}
