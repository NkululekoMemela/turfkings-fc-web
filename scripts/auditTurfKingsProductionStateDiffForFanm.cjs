#!/usr/bin/env node

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(
      require("/home/nc.memela/Projects/FANM_SECRETS/fanm-backup-bot.json")
    ),
  projectId: "five-asides-near-me",
});

const db = admin.firestore();

function arrLen(x) {
  return Array.isArray(x) ? x.length : 0;
}

async function main() {
  const fanmSnap = await db.doc("clubs/turf-kings/state/main").get();
  const prodSnap = await db.doc("clubs/turf-kings/appState_v2/main").get();

  if (!fanmSnap.exists) throw new Error("Missing FANM state/main");
  if (!prodSnap.exists) throw new Error("Missing synced production appState_v2/main");

  const fanm = fanmSnap.data()?.state || {};
  const prod = prodSnap.data()?.state || {};

  console.log("\nTURF KINGS STATE DIFF AUDIT");
  console.log("===========================");
  console.log("FANM activeSeasonId:", fanm.activeSeasonId);
  console.log("Production activeSeasonId:", prod.activeSeasonId);

  const fanmSeasons = Array.isArray(fanm.seasons) ? fanm.seasons : [];
  const prodSeasons = Array.isArray(prod.seasons) ? prod.seasons : [];

  console.log("\nSeason counts:");
  console.log("FANM seasons:", fanmSeasons.length);
  console.log("Production seasons:", prodSeasons.length);

  console.log("\nSeason-by-season comparison:");

  const max = Math.max(fanmSeasons.length, prodSeasons.length);

  for (let i = 0; i < max; i++) {
    const f = fanmSeasons[i];
    const p = prodSeasons[i];

    console.log(`\nIndex ${i}`);
    console.log("  FANM:", f ? {
      id: f.id || f.seasonId,
      label: f.label,
      status: f.status,
      matchDayHistory: arrLen(f.matchDayHistory),
      results: arrLen(f.results),
      teams: arrLen(f.teams),
    } : "MISSING");

    console.log("  PROD:", p ? {
      id: p.id || p.seasonId,
      label: p.label,
      status: p.status,
      matchDayHistory: arrLen(p.matchDayHistory),
      results: arrLen(p.results),
      teams: arrLen(p.teams),
    } : "MISSING");
  }

  console.log("\nDRY RUN ONLY. No writes made.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
