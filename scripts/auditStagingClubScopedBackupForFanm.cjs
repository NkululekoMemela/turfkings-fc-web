#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  path.join(os.homedir(), "Projects", "turfkings-backups", "firestore", "staging", "2026-05-29T17-15-38-273Z");

const file = path.join(BACKUP_DIR, "firestore-full-backup.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const docs = raw.documents || [];

const include = [];
const exclude = [];

function reason(p) {
  if (!p.startsWith("clubs/")) return "legacy-root";
  const parts = p.split("/");
  const clubId = parts[1] || "";
  const collection = parts[2] || "";

  if (clubId.includes("practice")) return "practice-club";
  if (collection === "peerRatings") return "old-peerRatings";
  if (collection === "payments") return "payments-excluded";
  if (collection === "pendingSignups") return "pendingSignups-excluded";
  if (collection === "kitOrders") return "kitOrders-excluded";
  if (collection === "member_withdrawal_requests") return "withdrawal-requests-excluded";

  if (collection === "seasons") {
    const seasonId = parts[3] || "";
    if (seasonId.toUpperCase().includes("TEST")) return "test-season";
  }

  return "include";
}

for (const d of docs) {
  const p = d.path || "";
  const r = reason(p);
  if (r === "include") include.push(p);
  else exclude.push({ path: p, reason: r });
}

const includeByClub = {};
for (const p of include) {
  const parts = p.split("/");
  const clubId = parts[1];
  const collection = parts[2] || "_clubDoc";
  includeByClub[clubId] ??= {};
  includeByClub[clubId][collection] = (includeByClub[clubId][collection] || 0) + 1;
}

const excludeCounts = {};
for (const e of exclude) {
  excludeCounts[e.reason] = (excludeCounts[e.reason] || 0) + 1;
}

console.log("\nSTAGING CLUB-SCOPED FANM AUDIT");
console.log("==============================");
console.log("Backup:", file);
console.log("Total docs:", docs.length);
console.log("Included docs:", include.length);
console.log("Excluded docs:", exclude.length);

console.log("\nIncluded by club/collection:");
for (const [clubId, collections] of Object.entries(includeByClub).sort()) {
  console.log(`\n${clubId}`);
  for (const [name, count] of Object.entries(collections).sort()) {
    console.log(`  - ${name}: ${count}`);
  }
}

console.log("\nExcluded counts:");
for (const [name, count] of Object.entries(excludeCounts).sort()) {
  console.log(`- ${name}: ${count}`);
}

console.log("\nSample included:");
include.slice(0, 80).forEach(p => console.log(p));

console.log("\nSample excluded:");
exclude.slice(0, 80).forEach(e => console.log(`${e.reason}: ${e.path}`));
