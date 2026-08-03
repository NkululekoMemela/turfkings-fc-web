#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const admin = require("firebase-admin");

const SERVICE_ACCOUNT_KEY = path.join(
  os.homedir(),
  "Projects",
  "FANM_SECRETS",
  "fanm-backup-bot.json"
);

const TARGET_PROJECT_ID = process.env.TARGET_PROJECT_ID || "five-asides-near-me";
const CLUB_ID = process.env.CLUB_ID || "turf-kings";
const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm");

const BACKUP_ROOT =
  process.env.BACKUP_ROOT ||
  path.join(os.homedir(), "Projects", "turfkings-backups", "firestore", "production");

const INCLUDED_ROOT_COLLECTIONS = new Set([
  "appState_v2",
  "players",
  "members",
  "humanMembers",
  "matchSignups",
  "peerRatingBaselines",
  "playerPhotos",
  "formationDefaults",
  "newsStories",
  "seasons",
  "matches",
]);

const SKIPPED_ROOT_COLLECTIONS = new Set([
  "payments",
  "pendingSignups",
  "peerRatings",
  "kitOrders",
  "yearEndConfig",
  "yearEndRSVP",
  "yearEndRSVP_withdrawals",
  "member_withdrawal_requests",
  "tkApp",
  "appState",
]);

function latestBackupFile() {
  const dirs = fs.readdirSync(BACKUP_ROOT)
    .map((name) => path.join(BACKUP_ROOT, name))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort();

  if (!dirs.length) throw new Error(`No backup folders found in ${BACKUP_ROOT}`);

  const latestDir = dirs[dirs.length - 1];
  const file = path.join(latestDir, "firestore-full-backup.json");

  if (!fs.existsSync(file)) throw new Error(`Missing backup file: ${file}`);
  return file;
}

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

function shouldSkipPath(oldPath) {
  if (!oldPath) return true;

  const parts = oldPath.split("/");
  const top = parts[0];

  if (SKIPPED_ROOT_COLLECTIONS.has(top)) return true;
  if (!INCLUDED_ROOT_COLLECTIONS.has(top)) return true;

  if (top === "seasons") {
    const seasonId = parts[1] || "";
    if (seasonId.toUpperCase().includes("TEST")) return true;
  }

  return false;
}

function mapPath(oldPath) {
  if (shouldSkipPath(oldPath)) return null;
  const parts = oldPath.split("/");
  return ["clubs", CLUB_ID, parts[0], ...parts.slice(1)].join("/");
}

function loadMappedDocs() {
  const backupFile = latestBackupFile();
  const raw = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  const docs = raw.documents || [];

  const mapped = [];
  const skipped = {};

  for (const doc of docs) {
    const from = doc.path || "";
    const top = from.split("/")[0] || "(unknown)";
    const to = mapPath(from);

    if (!to) {
      skipped[top] = (skipped[top] || 0) + 1;
      continue;
    }

    mapped.push({ from, to, data: doc.data || {} });
  }

  return { backupFile, docs, mapped, skipped };
}

function summarize(mapped) {
  const counts = {};

  for (const item of mapped) {
    const collection = item.to.split("/")[2];
    counts[collection] = (counts[collection] || 0) + 1;
  }

  return counts;
}

async function main() {
  if (TARGET_PROJECT_ID !== "five-asides-near-me") {
    console.error("BLOCKED: TARGET_PROJECT_ID must be five-asides-near-me");
    process.exit(1);
  }

  const { backupFile, docs, mapped, skipped } = loadMappedDocs();
  const counts = summarize(mapped);

  console.log("");
  console.log("TURF KINGS PRODUCTION -> FANM OVERLAY SYNC");
  console.log("==========================================");
  console.log("Source backup:", backupFile);
  console.log("Target project:", TARGET_PROJECT_ID);
  console.log("Target club:", `clubs/${CLUB_ID}`);
  console.log("Mode:", EXECUTE ? "EXECUTE" : "DRY RUN ONLY");
  console.log("Source docs:", docs.length);
  console.log("Mapped docs:", mapped.length);
  console.log("Skipped docs:", docs.length - mapped.length);

  console.log("");
  console.log("Mapped counts:");
  Object.entries(counts).sort().forEach(([k, v]) => console.log(`- ${k}: ${v}`));

  console.log("");
  console.log("Skipped top-level counts:");
  Object.entries(skipped).sort().forEach(([k, v]) => console.log(`- ${k}: ${v}`));

  console.log("");
  console.log("Sample mappings:");
  mapped.slice(0, 80).forEach((m) => console.log(`${m.from} -> ${m.to}`));

  if (!EXECUTE) {
    console.log("");
    console.log("DRY RUN ONLY. No writes were made.");
    return;
  }

  if (!CONFIRM) {
    console.error("BLOCKED: --execute requires --confirm");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_KEY)),
    projectId: TARGET_PROJECT_ID,
  });

  const db = admin.firestore();

  let batch = db.batch();
  let batchCount = 0;
  let written = 0;

  for (const item of mapped) {
    const data = restoreSpecialTypes(item.data);

    const enriched = {
      ...data,
      _fanmSync: {
        sourceProject: "turfkings-fc",
        sourcePath: item.from,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        syncType: "legacy-production-root-to-club-overlay",
      },
    };

    batch.set(db.doc(item.to), enriched, { merge: true });
    batchCount++;
    written++;

    if (batchCount >= 20) {
      await batch.commit();
      console.log(`Committed ${written}/${mapped.length}`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed ${written}/${mapped.length}`);
  }

  console.log("");
  console.log("SYNC COMPLETE.");
  console.log(`Upserted ${written} docs into clubs/${CLUB_ID}.`);
}

main().catch((error) => {
  console.error("");
  console.error("SYNC FAILED:");
  console.error(error);
  process.exit(1);
});
