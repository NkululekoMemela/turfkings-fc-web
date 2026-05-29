#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const admin = require("firebase-admin");

const TARGET_PROJECT_ID = process.env.TARGET_PROJECT_ID || "five-asides-near-me";
const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm");

const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  path.join(os.homedir(), "Projects", "turfkings-backups", "firestore", "staging", "2026-05-29T17-15-38-273Z");

const file = path.join(BACKUP_DIR, "firestore-full-backup.json");

const SKIP_COLLECTIONS = new Set([
  "peerRatings",
  "payments",
  "pendingSignups",
  "kitOrders",
  "member_withdrawal_requests",
  "yearEndConfig",
  "yearEndRSVP",
  "yearEndRSVP_withdrawals",
  "challengeNotices",
]);

function restoreSpecialTypes(value) {
  if (Array.isArray(value)) return value.map(restoreSpecialTypes);

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

function exclusionReason(p) {
  if (!p.startsWith("clubs/")) return "legacy-root";

  const parts = p.split("/");
  const clubId = parts[1] || "";
  const collection = parts[2] || "";

  if (clubId.includes("practice")) return "practice-club";
  if (SKIP_COLLECTIONS.has(collection)) return `${collection}-excluded`;

  if (collection === "seasons") {
    const seasonId = parts[3] || "";
    if (seasonId.toUpperCase().includes("TEST")) return "test-season";
  }

  return "";
}

function loadSelectedDocs() {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const docs = raw.documents || [];

  const selected = [];
  const skipped = {};

  for (const doc of docs) {
    const p = doc.path || "";
    const reason = exclusionReason(p);

    if (reason) {
      skipped[reason] = (skipped[reason] || 0) + 1;
      continue;
    }

    selected.push(doc);
  }

  return { docs, selected, skipped };
}

function summarize(selected) {
  const byClub = {};

  for (const doc of selected) {
    const parts = doc.path.split("/");
    const clubId = parts[1];
    const collection = parts[2] || "_clubDoc";

    byClub[clubId] ??= {};
    byClub[clubId][collection] = (byClub[clubId][collection] || 0) + 1;
  }

  return byClub;
}

async function main() {
  if (TARGET_PROJECT_ID !== "five-asides-near-me") {
    console.error("BLOCKED: TARGET_PROJECT_ID must be five-asides-near-me");
    process.exit(1);
  }

  const { docs, selected, skipped } = loadSelectedDocs();
  const byClub = summarize(selected);

  console.log("");
  console.log("IMPORT STAGING CLUB-SCOPED DATA TO FANM");
  console.log("======================================");
  console.log("Backup:", file);
  console.log("Target project:", TARGET_PROJECT_ID);
  console.log("Mode:", EXECUTE ? "EXECUTE" : "DRY RUN ONLY");
  console.log("Total docs:", docs.length);
  console.log("Selected docs:", selected.length);
  console.log("Skipped docs:", docs.length - selected.length);

  console.log("");
  console.log("Selected by club/collection:");
  for (const [clubId, collections] of Object.entries(byClub).sort()) {
    console.log(`\n${clubId}`);
    for (const [collection, count] of Object.entries(collections).sort()) {
      console.log(`  - ${collection}: ${count}`);
    }
  }

  console.log("");
  console.log("Skipped counts:");
  for (const [reason, count] of Object.entries(skipped).sort()) {
    console.log(`- ${reason}: ${count}`);
  }

  console.log("");
  console.log("Sample writes:");
  selected.slice(0, 60).forEach((doc) => {
    console.log(doc.path);
  });

  if (!EXECUTE) {
    console.log("");
    console.log("DRY RUN ONLY. No writes were made.");
    console.log("To execute later:");
    console.log("TARGET_PROJECT_ID=five-asides-near-me node scripts/importStagingClubScopedToFanm.cjs --execute --confirm");
    return;
  }

  if (!CONFIRM) {
    console.error("BLOCKED: --execute requires --confirm");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: TARGET_PROJECT_ID,
  });

  const db = admin.firestore();

  const existingCollections = await db.listCollections();

  if (existingCollections.length > 0) {
    console.error("");
    console.error("BLOCKED: Target FANM database is not empty.");
    console.error("Refusing to import into non-empty database.");
    process.exit(1);
  }

  let batch = db.batch();
  let batchCount = 0;
  let written = 0;

  for (const doc of selected) {
    const data = restoreSpecialTypes(doc.data || {});
    const enriched = {
      ...data,
      _fanmImport: {
        sourceProject: "turfkings-staging",
        sourcePath: doc.path,
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
        importType: "filtered-staging-club-scoped",
      },
    };

    batch.set(db.doc(doc.path), enriched, { merge: false });
    batchCount += 1;
    written += 1;

    if (batchCount >= 100) {
      await batch.commit();
      console.log(`Committed ${written}/${selected.length}`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed ${written}/${selected.length}`);
  }

  console.log("");
  console.log("IMPORT COMPLETE.");
  console.log(`Wrote ${written} documents into ${TARGET_PROJECT_ID}.`);
}

main().catch((error) => {
  console.error("");
  console.error("IMPORT FAILED:");
  console.error(error);
  process.exit(1);
});
