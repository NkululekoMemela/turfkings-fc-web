// src/tools/migrateLegacyToV2Season1.js
import { db } from "../firebaseConfig";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * One-time migration:
 *   Reads  -> legacy: appState/main
 *   Writes -> v2:     appState_v2/main as seasons[0] (Season-1)
 *
 * It DOES NOT delete or modify legacy.
 */
export async function migrateLegacyToV2Season1({
  targetSeasonId = "2026-S1",
  targetSeasonNo = 1,
  overwriteV2 = true,
} = {}) {
  const LEGACY_REF = doc(db, "appState", "main");
  const V2_REF = doc(db, "appState_v2", "main");

  // ---- Read legacy ----
  const legacySnap = await getDoc(LEGACY_REF);
  if (!legacySnap.exists()) {
    throw new Error("Legacy doc not found: appState/main");
  }

  const legacyData = legacySnap.data() || {};
  const legacyState = legacyData.state || null;

  if (!legacyState || typeof legacyState !== "object") {
    throw new Error("Legacy doc has no valid 'state' field (appState/main.state missing).");
  }

  // ---- Build Season-1 ----
  const season1 = {
    seasonId: String(targetSeasonId || "").trim() || "2026-S1",
    seasonNo: Number(targetSeasonNo) || 1,

    teams: Array.isArray(legacyState.teams) ? legacyState.teams : [],
    results: Array.isArray(legacyState.results) ? legacyState.results : [],
    allEvents: Array.isArray(legacyState.allEvents) ? legacyState.allEvents : [],
    currentEvents: Array.isArray(legacyState.currentEvents) ? legacyState.currentEvents : [],
    currentMatch: legacyState.currentMatch || null,
    currentMatchNo: typeof legacyState.currentMatchNo === "number" ? legacyState.currentMatchNo : 1,
    matchDayHistory: Array.isArray(legacyState.matchDayHistory) ? legacyState.matchDayHistory : [],

    streaks: legacyState.streaks && typeof legacyState.streaks === "object" ? legacyState.streaks : {},

    createdAt: legacyState.createdAt || null,
    updatedAt: legacyState.updatedAt || null,
  };

  const v2Payload = {
    schemaVersion: 3,
    state: {
      activeSeasonId: season1.seasonId,
      seasons: [season1],

      // optional carry-over (safe defaults)
      playerPhotosByName:
        legacyState.playerPhotosByName && typeof legacyState.playerPhotosByName === "object"
          ? legacyState.playerPhotosByName
          : {},
      yearEndAttendance: Array.isArray(legacyState.yearEndAttendance)
        ? legacyState.yearEndAttendance
        : [],
    },
    updatedAt: serverTimestamp(),
  };

  // ---- Write V2 ----
  if (overwriteV2) {
    await setDoc(V2_REF, v2Payload, { merge: false }); // clean overwrite
  } else {
    await setDoc(V2_REF, v2Payload, { merge: true });
  }

  return {
    ok: true,
    legacyReadFrom: "appState/main",
    v2WrittenTo: "appState_v2/main",
    targetSeasonId: season1.seasonId,
    seasonTeams: season1.teams.length,
    seasonResults: season1.results.length,
    seasonMatchDays: season1.matchDayHistory.length,
    seasonAllEvents: season1.allEvents.length,
  };
}