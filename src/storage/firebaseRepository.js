// src/storage/firebaseRepository.js

import { db } from "../firebaseConfig.js";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";

// Single document for now: full TurfKings app state
const STATE_COLLECTION = "appState";
const STATE_DOC_ID = "main";

/**
 * Save full app state to Firestore.
 * Called from saveState() in gameRepository.
 */
export async function saveStateToFirebase(state) {
  try {
    const ref = doc(db, STATE_COLLECTION, STATE_DOC_ID);
    await setDoc(
      ref,
      {
        state,
        updatedAt: new Date().toISOString(), // simple ISO timestamp
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Failed to save state to Firebase:", err);
  }
}

/**
 * Load full app state from Firestore once.
 * Returns `null` if nothing stored yet or on error.
 */
export async function loadStateFromFirebase() {
  try {
    const ref = doc(db, STATE_COLLECTION, STATE_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();
    return data?.state ?? null;
  } catch (err) {
    console.error("Failed to load state from Firebase:", err);
    return null;
  }
}

/**
 * Subscribe in realtime to the full app state document.
 * callback receives either:
 *   - `null` if no cloud state
 *   - the full state object if present
 *
 * Returns an unsubscribe function.
 */
export function subscribeToState(callback) {
  const ref = doc(db, STATE_COLLECTION, STATE_DOC_ID);
  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const data = snap.data();
      callback(data?.state ?? null);
    },
    (err) => {
      console.error("State subscription error:", err);
    }
  );
  return unsubscribe;
}
