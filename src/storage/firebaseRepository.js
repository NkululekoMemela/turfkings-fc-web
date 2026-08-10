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

import {
  getClubStateDoc,
  getPeerRatingsCollection,
  getScopedStateDoc,
} from "../core/clubFirestorePaths.js";

const DEFAULT_CLUB_ID = "turf-kings";

const STATE_COLLECTION = "appState";
const STATE_DOC_ID = "main";

/*
 * Resolve the V2 football state document.
 *
 * Backwards compatibility is intentional:
 * - Existing callers supplying only clubId remain Official.
 * - Practice must explicitly supply a DataScope.
 *
 * This prevents an omitted scope from ever silently selecting
 * Practice storage.
 */
function resolveV2StateDoc(
  clubId = DEFAULT_CLUB_ID,
  dataScope = null
) {
  if (dataScope) {
    return getScopedStateDoc(db, dataScope);
  }

  return getClubStateDoc(db, clubId);
}

function stripUndefinedDeep(value) {
  if (value === undefined) return null;

  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)])
    );
  }

  return value;
}

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

export async function saveStateToFirebaseV2(
  state,
  clubId = DEFAULT_CLUB_ID,
  dataScope = null
) {
  try {
    const ref = resolveV2StateDoc(clubId, dataScope);
    const cleanedState = stripUndefinedDeep(state);

    console.log("[FIREBASE SAVE V2] attempting", {
      clubId,
      dataEnvironment:
        dataScope?.environment || "official",
      activeSeasonId: cleanedState?.activeSeasonId,
      seasonsCount: cleanedState?.seasons?.length || 0,
    });

    await setDoc(
      ref,
      {
        state: cleanedState,
        updatedAt: new Date().toISOString(),
        clubId,
      },
      { merge: true }
    );

    console.log("[FIREBASE SAVE V2] success");
  } catch (err) {
    console.error("[FIREBASE SAVE V2] FAILED:", err);
    window.alert(`Firebase save failed: ${err?.code || ""} ${err?.message || err}`);
    throw err;
  }
}

export async function loadStateFromFirebaseV2(
  clubId = DEFAULT_CLUB_ID,
  dataScope = null
) {
  try {
    const ref = resolveV2StateDoc(clubId, dataScope);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    const data = snap.data();
    return data?.state ?? null;
  } catch (err) {
    console.error("Failed to load state from Firebase (V2):", err);
    return null;
  }
}

export function subscribeToStateV2(
  callback,
  clubId = DEFAULT_CLUB_ID,
  dataScope = null
) {
  const ref = resolveV2StateDoc(clubId, dataScope);

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

export async function submitPeerRating(payload, clubId = DEFAULT_CLUB_ID) {
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
    raterNameNormalized: String(payload?.raterNameNormalized || cleanRater)
      .trim()
      .toLowerCase(),

    targetName: cleanTarget,
    targetNameNormalized: String(payload?.targetNameNormalized || cleanTarget)
      .trim()
      .toLowerCase(),

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

  await addDoc(getPeerRatingsCollection(db, clubId), docPayload);
}

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

  await deleteDoc(doc(db, KIT_ORDERS_COLLECTION, cleanId));
}