// src/storage/practiceStateRepository.js
//
// Thin Practice v2 adapter over the existing V2 state repository.
//
// IMPORTANT:
// - Official and Practice use the same central state persistence code.
// - Practice always supplies an explicit Practice DataScope.
// - No synthetic Practice club IDs.
// - No direct Firestore paths are constructed here.

import {
  loadStateFromFirebaseV2,
  saveStateToFirebaseV2,
  subscribeToStateV2,
} from "./firebaseRepository.js";

import {
  createPracticeStatePersistenceContext,
} from "../core/practiceStatePersistenceContext.js";

export {
  createPracticeStatePersistenceContext,
} from "../core/practiceStatePersistenceContext.js";

export async function savePracticeState({
  clubId,
  sessionId,
  state,
} = {}) {
  const context =
    createPracticeStatePersistenceContext({
      clubId,
      sessionId,
    });

  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state)
  ) {
    throw new Error(
      "[PracticeStateRepository] state must be an object."
    );
  }

  await saveStateToFirebaseV2(
    state,
    context.clubId,
    context.dataScope
  );

  return context;
}

export async function loadPracticeState({
  clubId,
  sessionId,
} = {}) {
  const context =
    createPracticeStatePersistenceContext({
      clubId,
      sessionId,
    });

  const state = await loadStateFromFirebaseV2(
    context.clubId,
    context.dataScope
  );

  return {
    context,
    state,
  };
}

export function subscribePracticeState({
  clubId,
  sessionId,
  onState,
} = {}) {
  const context =
    createPracticeStatePersistenceContext({
      clubId,
      sessionId,
    });

  if (typeof onState !== "function") {
    throw new Error(
      "[PracticeStateRepository] onState callback is required."
    );
  }

  return subscribeToStateV2(
    onState,
    context.clubId,
    context.dataScope
  );
}
