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
const STATE_COLLECTION = "appState";
const STATE_DOC_ID = "main";

// =======================
// V2 (NEW MODEL)
// =======================
const STATE_COLLECTION_V2 = "appState_v2";
const STATE_DOC_ID_V2 = "main";

/**
 * Save full app state to Firestore (LEGACY).
 */
export async function saveStateToFirebase(state) {
  try {
    const ref = doc(db, STATE_COLLECTION, STATE_DOC_ID);
    await setDoc(
      ref,
      {
        state,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Failed to save state to Firebase:", err);
  }
}

/**
 * Load full app state from Firestore once (LEGACY).
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
 * Subscribe to full app state (LEGACY).
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
   V2: FULL APP STATE
   ======================================================================= */

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
 * IMPORTANT:
 * Accept the full payload and preserve the fields needed by usePeerRatings.
 */
export async function submitPeerRating(payload) {
  const cleanRater = String(payload?.raterName || "").trim();
  const cleanTarget = String(payload?.targetName || "").trim();

  if (!cleanRater || !cleanTarget) {
    throw new Error("Missing rater or target name");
  }

  const toNumOrNull = (v) => {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const docPayload = {
    raterName: cleanRater,
    raterNameNormalized: String(
      payload?.raterNameNormalized || cleanRater
    ).trim().toLowerCase(),

    targetName: cleanTarget,
    targetNameNormalized: String(
      payload?.targetNameNormalized || cleanTarget
    ).trim().toLowerCase(),

    attack: toNumOrNull(payload?.attack),
    defence: toNumOrNull(payload?.defence),
    gk: toNumOrNull(payload?.gk),

    comment: String(payload?.comment || "").trim() || null,

    weekKey: String(payload?.weekKey || "").trim() || null,
    seasonId: String(payload?.seasonId || "").trim() || null,

    createdAtMs: Number.isFinite(Number(payload?.createdAtMs))
      ? Number(payload.createdAtMs)
      : Date.now(),

    source: String(payload?.source || "peer-review-page").trim(),

    createdAt: serverTimestamp(),
  };

  const colRef = collection(db, "peerRatings");
  await addDoc(colRef, docPayload);
}

/* =======================================================================
   KIT ORDERS / POLL
   ======================================================================= */

const KIT_ORDERS_COLLECTION = "kitOrders";

export function subscribeToKitOrders(callback) {
  const colRef = collection(db, KIT_ORDERS_COLLECTION);
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
      callback([]);
    }
  );

  return unsub;
}

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

export async function removeKitOrder(memberId) {
  const cleanId = String(memberId || "").trim();
  if (!cleanId) return;
  await deleteDoc(doc(db, KIT_ORDERS_COLLECTION, cleanId));
}