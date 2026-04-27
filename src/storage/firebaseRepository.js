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

/* -----------------------------------------
   FIRESTORE SAFE SERIALIZER
------------------------------------------*/
function stripUndefinedDeep(value) {
  if (value === undefined) return null;

  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }

  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)])
    );
  }

  return value;
}

/**
 * Save full app state to Firestore (LEGACY).
 */
export async function saveStateToFirebase(state) {
  try {
    const ref = doc(db, STATE_COLLECTION, STATE_DOC_ID);

    await setDoc(
      ref,
      {
        state: stripUndefinedDeep(state),
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

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(snap.data()?.state ?? null);
    },
    (err) => {
      console.error("State subscription error:", err);
    }
  );
}

/* =======================================================================
   V2: FULL APP STATE
======================================================================= */

export async function saveStateToFirebaseV2(state) {
  try {
    const ref = doc(db, STATE_COLLECTION_V2, STATE_DOC_ID_V2);

    // Critical fix for Friendly matches:
    // strips undefined values before Firestore write.
    const cleanedState = stripUndefinedDeep(state);

    await setDoc(
      ref,
      {
        state: cleanedState,
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

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }

      callback(snap.data()?.state ?? null);
    },
    (err) => {
      console.error("State subscription error (V2):", err);
    }
  );
}

/**
 * Submit a single peer rating to Firestore.
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

  await addDoc(collection(db, "peerRatings"), docPayload);
}

/* =======================================================================
KIT ORDERS / POLL
======================================================================= */

const KIT_ORDERS_COLLECTION = "kitOrders";

export function subscribeToKitOrders(callback) {
  const q = query(
    collection(db, KIT_ORDERS_COLLECTION),
    orderBy("nameLower", "asc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = [];

      snap.forEach((d) => {
        list.push({
          memberId: d.id,
          ...(d.data() || {}),
        });
      });

      callback(list);
    },
    (err) => {
      console.error("Kit orders subscription error:", err);
      callback([]);
    }
  );
}

export async function upsertKitOrder({ memberId, name }) {
  const cleanId = String(memberId || "").trim();
  const cleanName = String(name || "").trim();

  if (!cleanId || !cleanName) {
    throw new Error("Missing memberId or name");
  }

  await setDoc(
    doc(db, KIT_ORDERS_COLLECTION, cleanId),
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

  await deleteDoc(
    doc(db, KIT_ORDERS_COLLECTION, cleanId)
  );
}