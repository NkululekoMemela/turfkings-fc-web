#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  "/tmp/fanm_restore_test/fanm_baseline_2026-06-06T10-52-25-849Z";

const TARGET_PROJECT_ID =
  process.env.TARGET_PROJECT_ID || "five-asides-near-me";

const RESTORE_PREFIX =
  process.env.RESTORE_PREFIX || "restore_tests/fanm_baseline_2026_06_06";

const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm");

function walkJsonFiles(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walkJsonFiles(full));
    else if (item.isFile() && item.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function backupFileToDocPath(filePath) {
  const firestoreRoot = path.join(BACKUP_DIR, "firestore");
  const rel = path.relative(firestoreRoot, filePath);

  const noExt = rel.replace(/\.json$/, "");
  const parts = noExt.split(path.sep);

  return parts.join("/");
}

async function main() {
  const firestoreRoot = path.join(BACKUP_DIR, "firestore");

  if (!fs.existsSync(firestoreRoot)) {
    throw new Error(`Missing firestore folder: ${firestoreRoot}`);
  }

  const files = walkJsonFiles(firestoreRoot);
  const docs = files.map((file) => ({
    file,
    originalPath: backupFileToDocPath(file),
    restorePath: `${RESTORE_PREFIX}/${backupFileToDocPath(file)}`,
  }));

  console.log("");
  console.log("FANM BASELINE RESTORE TEST");
  console.log("==========================");
  console.log("Backup dir:", BACKUP_DIR);
  console.log("Target project:", TARGET_PROJECT_ID);
  console.log("Restore prefix:", RESTORE_PREFIX);
  console.log("Mode:", EXECUTE ? "EXECUTE" : "DRY RUN ONLY");
  console.log("JSON docs found:", docs.length);

  console.log("");
  console.log("Sample restore paths:");
  docs.slice(0, 30).forEach((d) => {
    console.log(`${d.originalPath} -> ${d.restorePath}`);
  });

  if (!EXECUTE) {
    console.log("");
    console.log("DRY RUN ONLY. No writes were made.");
    return;
  }

  if (!CONFIRM) {
    throw new Error("Blocked: --execute requires --confirm");
  }

  if (RESTORE_PREFIX === "" || RESTORE_PREFIX === "." || RESTORE_PREFIX === "/") {
    throw new Error("Blocked: unsafe RESTORE_PREFIX");
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(
      process.env.HOME,
      "Projects/FANM_SECRETS/fanm-backup-bot.json"
    ))),
    projectId: TARGET_PROJECT_ID,
  });

  const db = admin.firestore();

  let batch = db.batch();
  let batchCount = 0;
  let written = 0;

  for (const d of docs) {
    const data = JSON.parse(fs.readFileSync(d.file, "utf8"));
    batch.set(db.doc(d.restorePath), data, { merge: true });
    batchCount++;
    written++;

    if (batchCount >= 50) {
      await batch.commit();
      console.log(`Committed ${written}/${docs.length}`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed ${written}/${docs.length}`);
  }

  console.log("");
  console.log("RESTORE TEST COMPLETE.");
  console.log(`Restored ${written} docs under: ${RESTORE_PREFIX}`);
}

main().catch((err) => {
  console.error("");
  console.error("RESTORE FAILED");
  console.error(err);
  process.exit(1);
});
