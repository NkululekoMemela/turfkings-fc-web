// ============================================================
// GPI Stage 2.4A
// Platform Player Firestore Repository
//
// ADDITIVE DATABASE CONTRACT
// --------------------------
// This repository may ONLY access:
//
//     platformPlayers/{firebaseUid}
//
// It must NEVER:
// - modify clubs
// - modify members
// - modify players
// - modify matches
// - modify stats
// - delete existing production data
//
// Nothing calls this repository yet.
// ============================================================

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../firebaseConfig";

import {
  buildPlatformPlayer,
  mergePlatformPlayer,
} from "./platformPlayerRepository.js";

const PLATFORM_PLAYERS_COLLECTION = "platformPlayers";

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function requireUid(uid) {
  const normalized = clean(uid);

  if (!normalized) {
    throw new Error(
      "Platform Player write rejected: authenticated Firebase UID is required."
    );
  }

  return normalized;
}

export function getPlatformPlayerDocumentId(uid = "") {
  return requireUid(uid);
}

export function getPlatformPlayerDocumentRef(uid = "") {
  return doc(
    db,
    PLATFORM_PLAYERS_COLLECTION,
    getPlatformPlayerDocumentId(uid)
  );
}

export async function readPlatformPlayer(uid = "") {
  const ref = getPlatformPlayerDocumentRef(uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  return {
    id: snap.id,
    ...snap.data(),
  };
}

export async function upsertPlatformPlayer({
  uid = "",
  email = "",
  fullName = "",
  photoUrl = "",
  whatsappNumber = "",
} = {}) {
  const safeUid = requireUid(uid);
  const safeEmail = normalizeEmail(email);

  if (!safeEmail) {
    throw new Error(
      "Platform Player write rejected: verified email is required."
    );
  }

  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error(
      "Platform Player write rejected: authenticated Firebase user is required."
    );
  }

  if (clean(currentUser.uid) !== safeUid) {
    throw new Error(
      "Platform Player write rejected: user may only write their own Platform Player document."
    );
  }

  const authenticatedEmail =
    normalizeEmail(currentUser.email);

  if (
    !authenticatedEmail ||
    authenticatedEmail !== safeEmail
  ) {
    throw new Error(
      "Platform Player write rejected: authenticated email does not match Platform Player email."
    );
  }

  const existing =
    (await readPlatformPlayer(safeUid)) || {};

  const incoming = buildPlatformPlayer({
    uid: safeUid,
    email: safeEmail,
    fullName,
    photoUrl,
    whatsappNumber,
  });

  const merged = mergePlatformPlayer(
    existing,
    incoming
  );

  const payload = {
    ...merged,

    // Explicit versioning from day one.
    schemaVersion: 1,

    updatedAt: serverTimestamp(),
  };

  if (!existing.id) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(
    getPlatformPlayerDocumentRef(safeUid),
    payload,
    { merge: true }
  );

  return {
    ...merged,
    schemaVersion: 1,
  };
}
