#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

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
  "peerRatings",
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
  "kitOrders",
  "yearEndConfig",
  "yearEndRSVP",
  "yearEndRSVP_withdrawals",
  "member_withdrawal_requests",
  "tkApp",
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
  const top = parts[0];

  return ["clubs", CLUB_ID, top, ...parts.slice(1)].join("/");
}

function main() {
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

    mapped.push({ from, to });
  }

  const counts = {};
  for (const item of mapped) {
    const parts = item.to.split("/");
    const clubCollection = parts[2];
    counts[clubCollection] = (counts[clubCollection] || 0) + 1;
  }

  console.log("");
  console.log("FILTERED FANM CLUB-SCOPE IMPORT DRY RUN");
  console.log("=======================================");
  console.log("Backup file:", backupFile);
  console.log("Target club:", `clubs/${CLUB_ID}`);
  console.log("Source docs:", docs.length);
  console.log("Mapped docs:", mapped.length);
  console.log("Skipped docs:", docs.length - mapped.length);
  console.log("Mode:", EXECUTE ? "EXECUTE requested" : "DRY RUN ONLY");
  console.log("");

  console.log("Mapped collection counts:");
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, count]) => console.log(`- ${name}: ${count}`));

  console.log("");
  console.log("Skipped top-level counts:");
  Object.entries(skipped)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, count]) => console.log(`- ${name}: ${count}`));

  console.log("");
  console.log("Sample mappings:");
  mapped.slice(0, 80).forEach((m) => {
    console.log(`${m.from}  ->  ${m.to}`);
  });

  if (!EXECUTE) {
    console.log("");
    console.log("DRY RUN ONLY. No writes were made.");
    return;
  }

  if (!CONFIRM) {
    console.error("");
    console.error("BLOCKED: --execute requires --confirm.");
    process.exit(1);
  }

  console.error("");
  console.error("WRITE MODE NOT IMPLEMENTED YET. Dry-run validation first.");
  process.exit(1);
}

main();
