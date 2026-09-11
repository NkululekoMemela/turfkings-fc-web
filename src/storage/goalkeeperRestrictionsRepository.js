import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../firebaseConfig.js";

function normalizePlayerNames(playerNames = []) {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(playerNames) ? playerNames : []).forEach(
    (value) => {
      const name = String(value || "").trim();
      const key = name.toLocaleLowerCase();

      if (!name || seen.has(key)) return;

      seen.add(key);
      normalized.push(name);
    }
  );

  return normalized;
}

function requireSafeId(value, label) {
  const safe = String(value || "").trim();

  if (!safe || safe.includes("/")) {
    throw new Error(
      `${label} must be a non-empty Firestore-safe ID.`
    );
  }

  return safe;
}

function getRestrictionsCollection(activeClubId) {
  const clubId = requireSafeId(
    activeClubId,
    "activeClubId"
  );

  return collection(
    db,
    "clubs",
    clubId,
    "goalkeeperRestrictions"
  );
}

function getRestrictionsDoc(activeClubId, teamId) {
  const safeTeamId = requireSafeId(teamId, "teamId");

  return doc(
    getRestrictionsCollection(activeClubId),
    safeTeamId
  );
}

export function subscribeGoalkeeperRestrictions({
  activeClubId,
  onData,
  onError,
}) {
  return onSnapshot(
    getRestrictionsCollection(activeClubId),
    (snapshot) => {
      const byTeamId = {};

      snapshot.docs.forEach((entry) => {
        const data = entry.data() || {};

        byTeamId[entry.id] = normalizePlayerNames(
          data.goalkeeperRestrictedPlayerKeys || []
        );
      });

      onData?.(byTeamId);
    },
    (error) => {
      console.error(
        "[GoalkeeperRestrictions] Subscription failed:",
        error
      );
      onError?.(error);
    }
  );
}

export async function saveTeamGoalkeeperRestrictions({
  activeClubId,
  teamId,
  goalkeeperRestrictedPlayerKeys = [],
  updatedByName = "",
  updatedByRole = "",
}) {
  const safeTeamId = requireSafeId(teamId, "teamId");
  const normalized = normalizePlayerNames(
    goalkeeperRestrictedPlayerKeys
  );

  await setDoc(
    getRestrictionsDoc(activeClubId, safeTeamId),
    {
      teamId: safeTeamId,
      goalkeeperRestrictedPlayerKeys: normalized,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedByName: String(updatedByName || "").trim(),
      updatedByRole: String(updatedByRole || "").trim(),
    },
    { merge: true }
  );

  return normalized;
}

export { normalizePlayerNames };
