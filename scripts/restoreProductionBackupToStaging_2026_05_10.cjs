#!/usr/bin/env node

// scripts/restoreProductionBackupToStaging_2026_05_10.cjs

const fs = require("fs");
const path = require("path");
const os = require("os");
const admin = require("firebase-admin");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "turfkings-staging";
const EXPECTED_PROJECT_ID = "turfkings-staging";

const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm");

const BACKUP_ROOT = path.join(
  os.homedir(),
  "Projects",
  "turfkings-backups",
  "firestore",
  "production"
);

const ALLOWED_TOP_COLLECTIONS = new Set([
  "appState",
  "appState_v2",
  "matches",
  "seasons",
  "players",
  "members",
  "humanMembers",
  "matchSignups",
  "pendingSignups",
  "payments",
  "peerRatings",
  "peerRatingBaselines",
  "playerPhotos",
  "formationDefaults",
  "newsStories",
  "kitOrders",
  "yearEndRSVP",
  "yearEndRSVP_withdrawals",
  "yearEndConfig",
  "member_withdrawal_requests",
  "tkApp",
]);

function getLatestBackupFile() {
  const dirs = fs
    .readdirSync(BACKUP_ROOT)
    .map((name) => path.join(BACKUP_ROOT, name))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort();

  if (!dirs.length) {
    throw new Error(`No production backup folders found in: ${BACKUP_ROOT}`);
  }

  const latestDir = dirs[dirs.length - 1];
  const fullBackup = path.join(latestDir, "firestore-full-backup.json");

  if (!fs.existsSync(fullBackup)) {
    throw new Error(`Missing firestore-full-backup.json in: ${latestDir}`);
  }

  return fullBackup;
}

function restoreSpecialTypes(value) {
  if (Array.isArray(value)) {
    return value.map(restoreSpecialTypes);
  }

  if (value && typeof value === "object") {
    if (value.__type === "timestamp" && value.iso) {
      return admin.firestore.Timestamp.fromDate(new Date(value.iso));
    }

    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = restoreSpecialTypes(child);
    }
    return out;
  }

  return value;
}

async function main() {
  if (PROJECT_ID !== EXPECTED_PROJECT_ID) {
    console.error("\nBLOCKED.");
    console.error(`This script may only write to: ${EXPECTED_PROJECT_ID}`);
    console.error(`Current FIREBASE_PROJECT_ID is: ${PROJECT_ID}`);
    process.exit(1);
  }

  const backupFile = getLatestBackupFile();
  const raw = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  const docs = Array.isArray(raw.documents) ? raw.documents : [];

  const selectedDocs = docs.filter((item) => {
    const docPath = item.path || "";
    const top = docPath.split("/")[0];
    return ALLOWED_TOP_COLLECTIONS.has(top);
  });

  console.log("\nRESTORE PRODUCTION BACKUP TO STAGING");
  console.log("Backup file:", backupFile);
  console.log("Target project:", PROJECT_ID);
  console.log("Mode:", EXECUTE ? "EXECUTE" : "DRY RUN");
  console.log("Selected docs:", selectedDocs.length);

  const counts = {};
  for (const item of selectedDocs) {
    const top = item.path.split("/")[0];
    counts[top] = (counts[top] || 0) + 1;
  }

  console.log("\nCollections to restore:");
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, count]) => {
      console.log(`- ${name}: ${count}`);
    });

  if (!EXECUTE) {
    console.log("\nDry run only. No Firestore writes were made.");
    console.log("To actually restore, run:");
    console.log(
      "FIREBASE_PROJECT_ID=turfkings-staging node scripts/restoreProductionBackupToStaging_2026_05_10.cjs --execute --confirm"
    );
    return;
  }

  if (!CONFIRM) {
    console.error("\nBLOCKED.");
    console.error("You used --execute but did not pass --confirm.");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });

  const db = admin.firestore();

  let batch = db.batch();
  let batchCount = 0;
  let written = 0;

  for (const item of selectedDocs) {
    const docPath = item.path;
    const data = restoreSpecialTypes(item.data || {});

    batch.set(db.doc(docPath), data, { merge: false });
    batchCount += 1;
    written += 1;

    if (batchCount >= 400) {
      await batch.commit();
      console.log(`Committed ${written}/${selectedDocs.length}`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed ${written}/${selectedDocs.length}`);
  }

  console.log("\nRESTORE COMPLETE.");
  console.log(`Wrote ${written} documents into ${PROJECT_ID}.`);
}

main().catch((err) => {
  console.error("\nRESTORE FAILED:");
  console.error(err);
  process.exit(1);
});