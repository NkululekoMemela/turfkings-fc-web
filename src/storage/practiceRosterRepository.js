// src/storage/practiceRosterRepository.js
//
// Practice v2 one-way Official roster bridge.
//
// SECURITY / DATA BOUNDARY:
// - Reads real players from the requested Official club.
// - Never writes Official club data.
// - Never writes Practice sandbox data.
// - Never uses the global top-level players collection as a club roster.
// - platformPlayers remain global identity data, not Practice football state.

import { getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import { getPlayersCollection } from "../core/clubFirestorePaths.js";

function safeString(value = "") {
  return String(value || "").trim();
}

function requireClubId(value) {
  const clubId = safeString(value);

  if (!clubId) {
    throw new Error("[PracticeRoster] clubId is required.");
  }

  if (clubId.includes("/")) {
    throw new Error("[PracticeRoster] clubId cannot contain '/'.");
  }

  return clubId;
}

function firstNameOf(value = "") {
  const full = safeString(value);
  return full ? full.split(/\s+/)[0] : "";
}

function normalizePracticePlayer(docSnap) {
  const data = docSnap.data() || {};

  const fullName = safeString(
    data.fullName ||
    data.displayName ||
    data.name ||
    data.playerName
  );

  const shortName = safeString(
    data.shortName ||
    data.name ||
    data.displayName ||
    firstNameOf(fullName) ||
    fullName
  );

  return {
    id: docSnap.id,
    playerId: safeString(data.playerId || docSnap.id),
    memberId: safeString(data.memberId),
    uid: safeString(
      data.uid ||
      data.platformIdentityUid
    ),
    platformIdentityUid: safeString(data.platformIdentityUid),
    fullName,
    shortName,
    aliases: Array.isArray(data.aliases)
      ? data.aliases.map(safeString).filter(Boolean)
      : [],
    position: safeString(
      data.position ||
      data.preferredPosition ||
      data.primaryPosition
    ),
    status: safeString(data.status || "active") || "active",
  };
}

export async function loadPracticeRoster(clubId) {
  const safeClubId = requireClubId(clubId);

  const snapshot = await getDocs(
    getPlayersCollection(db, safeClubId)
  );

  return snapshot.docs
    .map(normalizePracticePlayer)
    .filter(
      (player) =>
        String(player.status || "active").toLowerCase() === "active"
    )
    .sort((a, b) =>
      String(a.fullName || a.shortName).localeCompare(
        String(b.fullName || b.shortName)
      )
    );
}
