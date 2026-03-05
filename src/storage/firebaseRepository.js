// src/storage/firebaseRepository.js

import { db } from "../firebaseConfig.js";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  serverTimestamp,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";

// =======================
// LEGACY (DO NOT CHANGE)
// =======================

// Single document for now: full TurfKings app state
const STATE_COLLECTION = "appState";
const STATE_DOC_ID = "main";

// =======================
// V2 (NEW MODEL) — NEVER TOUCH LEGACY WHEN USING THESE
// =======================
const STATE_COLLECTION_V2 = "appState_v2";
const STATE_DOC_ID_V2 = "main";

/**
 * Save full app state to Firestore (LEGACY).
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
 * Load full app state from Firestore once (LEGACY).
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
 * Subscribe in realtime to the full app state document (LEGACY).
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

/* =======================================================================
   V2: FULL APP STATE (NEW MODEL) — appState_v2/main
   IMPORTANT: These functions ONLY read/write appState_v2/main and NEVER touch legacy.
   ======================================================================= */

/**
 * Save full app state to Firestore (V2).
 * This writes to: appState_v2/main
 */
export async function saveStateToFirebaseV2(state) {
  try {
    const ref = doc(db, STATE_COLLECTION_V2, STATE_DOC_ID_V2);
    await setDoc(
      ref,
      {
        state,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Failed to save state to Firebase (V2):", err);
  }
}

/**
 * Load full app state from Firestore once (V2).
 * Returns `null` if nothing stored yet or on error.
 */
export async function loadStateFromFirebaseV2() {
  try {
    const ref = doc(db, STATE_COLLECTION_V2, STATE_DOC_ID_V2);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();
    return data?.state ?? null;
  } catch (err) {
    console.error("Failed to load state from Firebase (V2):", err);
    return null;
  }
}

/**
 * Subscribe in realtime to the full app state document (V2).
 * callback receives either:
 *   - `null` if no cloud state
 *   - the full state object if present
 *
 * Returns an unsubscribe function.
 */
export function subscribeToStateV2(callback) {
  const ref = doc(db, STATE_COLLECTION_V2, STATE_DOC_ID_V2);
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
      console.error("State subscription error (V2):", err);
    }
  );
  return unsubscribe;
}

/**
 * Submit a single peer rating to Firestore.
 * Called from PeerReviewPage.
 *
 * The document is stored in the "peerRatings" collection.
 */
export async function submitPeerRating({
  raterName,
  targetName,
  attack,
  defence,
  gk,
  comment,
}) {
  const cleanRater = (raterName || "").trim();
  const cleanTarget = (targetName || "").trim();

  if (!cleanRater || !cleanTarget) {
    throw new Error("Missing rater or target name");
  }

  const payload = {
    raterName: cleanRater,
    targetName: cleanTarget,
    attack: typeof attack === "number" && !Number.isNaN(attack) ? attack : null,
    defence:
      typeof defence === "number" && !Number.isNaN(defence) ? defence : null,
    gk: typeof gk === "number" && !Number.isNaN(gk) ? gk : null,
    comment: (comment || "").trim() || null,
    createdAt: serverTimestamp(),
  };

  const colRef = collection(db, "peerRatings");
  await addDoc(colRef, payload);
}

/* =======================================================================
   NEW: KIT ORDERS / POLL
   Collection: kitOrders/{memberId}
   Each doc stores: { memberId, name, nameLower, updatedAt }
   ======================================================================= */

const KIT_ORDERS_COLLECTION = "kitOrders";

/**
 * Live subscription to kit orders.
 * callback(list) where list = [{ memberId, name, nameLower, updatedAt }, ...]
 */
export function subscribeToKitOrders(callback) {
  const colRef = collection(db, KIT_ORDERS_COLLECTION);

  // Order by nameLower if present (makes UI stable and queryable)
  const q = query(colRef, orderBy("nameLower", "asc"));

  const unsub = onSnapshot(
    q,
    (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        list.push({
          memberId: d.id,
          ...data,
        });
      });
      callback(list);
    },
    (err) => {
      console.error("Kit orders subscription error:", err);
      callback([]); // fail soft
    }
  );

  return unsub;
}

/**
 * Add/update a kit order for a member.
 * Uses doc id = memberId to avoid duplicates.
 */
export async function upsertKitOrder({ memberId, name }) {
  const cleanId = String(memberId || "").trim();
  const cleanName = String(name || "").trim();

  if (!cleanId || !cleanName) {
    throw new Error("Missing memberId or name");
  }

  const ref = doc(db, KIT_ORDERS_COLLECTION, cleanId);
  await setDoc(
    ref,
    {
      memberId: cleanId,
      name: cleanName,
      nameLower: cleanName.toLowerCase(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Remove a kit order for a member.
 */
export async function removeKitOrder(memberId) {
  const cleanId = String(memberId || "").trim();
  if (!cleanId) return;
  await deleteDoc(doc(db, KIT_ORDERS_COLLECTION, cleanId));
}