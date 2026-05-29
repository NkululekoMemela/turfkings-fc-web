#!/usr/bin/env node

const admin = require("firebase-admin");

const TARGET_PROJECT_ID = process.env.TARGET_PROJECT_ID || "five-asides-near-me";
const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: TARGET_PROJECT_ID,
});

const db = admin.firestore();

function getSeasonId(season, fallbackIndex) {
  return season?.id || season?.seasonId || `index-${fallbackIndex}`;
}

function arrLen(value) {
  return Array.isArray(value) ? value.length : 0;
}

async function main() {
  if (TARGET_PROJECT_ID !== "five-asides-near-me") {
    throw new Error("TARGET_PROJECT_ID must be five-asides-near-me");
  }

  const fanmRef = db.doc("clubs/turf-kings/state/main");
  const prodRef = db.doc("clubs/turf-kings/appState_v2/main");

  const [fanmSnap, prodSnap] = await Promise.all([fanmRef.get(), prodRef.get()]);

  if (!fanmSnap.exists) throw new Error("Missing clubs/turf-kings/state/main");
  if (!prodSnap.exists) throw new Error("Missing clubs/turf-kings/appState_v2/main");

  const fanmDoc = fanmSnap.data();
  const prodDoc = prodSnap.data();

  const fanmState = fanmDoc.state || {};
  const prodState = prodDoc.state || {};

  const fanmSeasons = Array.isArray(fanmState.seasons) ? fanmState.seasons : [];
  const prodSeasons = Array.isArray(prodState.seasons) ? prodState.seasons : [];

  const fanmById = new Map();
  fanmSeasons.forEach((season, index) => {
    fanmById.set(getSeasonId(season, index), { season, index });
  });

  const mergedSeasons = [...fanmSeasons];
  const changes = [];

  prodSeasons.forEach((prodSeason, prodIndex) => {
    const id = getSeasonId(prodSeason, prodIndex);
    const existing = fanmById.get(id);

    if (!existing) {
      mergedSeasons.push(prodSeason);
      changes.push({
        action: "ADD_SEASON",
        seasonId: id,
        prodMatchDayHistory: arrLen(prodSeason.matchDayHistory),
      });
      return;
    }

    const fanmSeason = existing.season;

    const fanmHistoryLen = arrLen(fanmSeason.matchDayHistory);
    const prodHistoryLen = arrLen(prodSeason.matchDayHistory);

    const shouldUpdate =
      prodHistoryLen > fanmHistoryLen ||
      arrLen(prodSeason.results) > arrLen(fanmSeason.results) ||
      arrLen(prodSeason.teams) > arrLen(fanmSeason.teams);

    if (shouldUpdate) {
      mergedSeasons[existing.index] = {
        ...fanmSeason,
        ...prodSeason,
        _fanmProductionOverlay: {
          sourcePath: "clubs/turf-kings/appState_v2/main",
          sourceSeasonId: id,
          overlaidAtISO: new Date().toISOString(),
          previousMatchDayHistoryCount: fanmHistoryLen,
          newMatchDayHistoryCount: prodHistoryLen,
        },
      };

      changes.push({
        action: "UPDATE_SEASON",
        seasonId: id,
        fanmMatchDayHistory: fanmHistoryLen,
        prodMatchDayHistory: prodHistoryLen,
      });
    }
  });

  const nextState = {
    ...fanmState,
    activeSeasonId: prodState.activeSeasonId || fanmState.activeSeasonId,
    seasons: mergedSeasons,
    updatedAt: prodState.updatedAt || fanmState.updatedAt || new Date().toISOString(),
  };

  console.log("");
  console.log("PATCH FANM TURF KINGS STATE FROM PRODUCTION");
  console.log("===========================================");
  console.log("Mode:", EXECUTE ? "EXECUTE" : "DRY RUN ONLY");
  console.log("FANM activeSeasonId:", fanmState.activeSeasonId);
  console.log("Production activeSeasonId:", prodState.activeSeasonId);
  console.log("Next activeSeasonId:", nextState.activeSeasonId);
  console.log("FANM seasons:", fanmSeasons.length);
  console.log("Production seasons:", prodSeasons.length);
  console.log("Next seasons:", mergedSeasons.length);

  console.log("");
  console.log("Planned changes:");
  if (!changes.length) console.log("- none");
  for (const change of changes) {
    console.log("-", change);
  }

  if (!EXECUTE) {
    console.log("");
    console.log("DRY RUN ONLY. No writes made.");
    console.log("To execute:");
    console.log("TARGET_PROJECT_ID=five-asides-near-me node scripts/patchFanmTurfKingsStateFromProduction.cjs --execute --confirm");
    return;
  }

  if (!CONFIRM) {
    throw new Error("--execute requires --confirm");
  }

  await fanmRef.set(
    {
      ...fanmDoc,
      state: nextState,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAtISO: new Date().toISOString(),
      _fanmProductionStatePatch: {
        sourcePath: "clubs/turf-kings/appState_v2/main",
        sourceProject: "turfkings-fc",
        patchedAt: admin.firestore.FieldValue.serverTimestamp(),
        changes,
      },
    },
    { merge: false }
  );

  console.log("");
  console.log("PATCH COMPLETE.");
}

main().catch((err) => {
  console.error("");
  console.error("PATCH FAILED:");
  console.error(err);
  process.exit(1);
});
