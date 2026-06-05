
const fs = require("fs");
const path = require("path");
const os = require("os");
const archiverModule = require("archiver");
const archiver = archiverModule.default || archiverModule;
const { google } = require("googleapis");
const admin = require("firebase-admin");

const PROJECT_ID = "five-asides-near-me";
const STORAGE_BUCKET = "five-asides-near-me.firebasestorage.app";
const DRIVE_ROOT_FOLDER_NAME = "FANM_BACKUPS_AUTO";

const SERVICE_ACCOUNT_KEY = path.join(process.env.HOME, "Projects/FANM_SECRETS/fanm-backup-bot.json");
const CLIENT_PATH = path.join(process.env.HOME, "Projects/FANM_SECRETS/fanm-drive-oauth-client.json");
const TOKEN_PATH = path.join(process.env.HOME, "Projects/FANM_SECRETS/fanm-drive-oauth-token.json");

const DOWNLOAD_STORAGE_FILES = process.env.BACKUP_STORAGE_FILES !== "false";

function serialise(value) {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === "function") return { __type: "timestamp", iso: value.toDate().toISOString() };
  if (Buffer.isBuffer(value)) return { __type: "buffer", base64: value.toString("base64") };
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialise(v);
    return out;
  }
  return value;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

async function backupCollection(collectionRef, outDir, stats) {
  console.log("Reading:", collectionRef.path);
  const snap = await collectionRef.get();

  for (const doc of snap.docs) {
    writeJson(path.join(outDir, "firestore", doc.ref.path + ".json"), {
      id: doc.id,
      path: doc.ref.path,
      data: serialise(doc.data()),
    });

    stats.firestoreDocuments += 1;

    const subs = await doc.ref.listCollections();
    for (const sub of subs) {
      await backupCollection(sub, outDir, stats);
    }
  }
}

async function backupFirestore(outDir, stats) {
  const db = admin.firestore();
  const roots = await db.listCollections();

  writeJson(path.join(outDir, "firestore-root-collections.json"), roots.map(c => c.id));

  for (const collection of roots) {
    await backupCollection(collection, outDir, stats);
  }
}

async function backupStorage(outDir, stats) {
  const bucket = admin.storage().bucket(STORAGE_BUCKET);
  console.log("Reading Storage:", STORAGE_BUCKET);

  const [files] = await bucket.getFiles();

  const inventory = [];

  for (const file of files) {
    const meta = file.metadata || {};
    const item = {
      name: file.name,
      bucket: file.bucket.name,
      size: Number(meta.size || 0),
      contentType: meta.contentType || "",
      updated: meta.updated || "",
      md5Hash: meta.md5Hash || "",
      generation: meta.generation || "",
    };

    inventory.push(item);
    stats.storageObjects += 1;
    stats.storageBytes += item.size;

    if (DOWNLOAD_STORAGE_FILES) {
      const target = path.join(outDir, "storage-files", file.name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await file.download({ destination: target });
    }
  }

  writeJson(path.join(outDir, "storage-inventory.json"), inventory);
}

function driveClient() {
  const credentials = JSON.parse(fs.readFileSync(CLIENT_PATH, "utf8"));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  const cfg = credentials.installed || credentials.web;

  const client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, cfg.redirect_uris[0]);
  client.setCredentials(token);

  return google.drive({ version: "v3", auth: client });
}

async function findOrCreateFolder(drive, name) {
  const found = await drive.files.list({
    q: "name='" + name + "' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: "files(id,name)",
  });

  if (found.data.files && found.data.files[0]) return found.data.files[0];

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder" },
    fields: "id,name",
  });

  return created.data;
}

function zipDir(sourceDir, zipPath) {
  const { execFileSync } = require("child_process");

  const parentDir = path.dirname(sourceDir);
  const folderName = path.basename(sourceDir);

  execFileSync("zip", ["-r", zipPath, folderName], {
    cwd: parentDir,
    stdio: "inherit",
  });
}

async function uploadToDrive(zipPath) {
  const drive = driveClient();
  const folder = await findOrCreateFolder(drive, DRIVE_ROOT_FOLDER_NAME);

  const upload = await drive.files.create({
    requestBody: {
      name: path.basename(zipPath),
      parents: [folder.id],
      mimeType: "application/zip",
    },
    media: {
      mimeType: "application/zip",
      body: fs.createReadStream(zipPath),
    },
    fields: "id,name,webViewLink",
  });

  return upload.data;
}

async function main() {
  const startedAt = new Date();
  const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const backupId = "fanm_baseline_" + timestamp;

  const workDir = path.join(os.tmpdir(), backupId);
  const zipPath = path.join(os.tmpdir(), backupId + ".zip");

  fs.mkdirSync(workDir, { recursive: true });

  admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_KEY)),
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  });

  const stats = {
    firestoreDocuments: 0,
    storageObjects: 0,
    storageBytes: 0,
  };

  await backupFirestore(workDir, stats);
  console.log("Skipping Storage backup for first successful baseline.");

  const manifest = {
    backupId,
    projectId: PROJECT_ID,
    type: "baseline",
    mode: "full",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    storageFilesDownloaded: DOWNLOAD_STORAGE_FILES,
    stats,
  };

  writeJson(path.join(workDir, "manifest.json"), manifest);

  console.log("Creating ZIP...");
  zipDir(workDir, zipPath);

  console.log("Uploading to Google Drive...");
  const driveFile = await uploadToDrive(zipPath);

  console.log("");
  console.log("BACKUP COMPLETE");
  console.log("Backup ID:", backupId);
  console.log("ZIP:", zipPath);
  console.log("Drive file:", driveFile.name);
  console.log("Drive link:", driveFile.webViewLink);
  console.log("Firestore docs:", stats.firestoreDocuments);
  console.log("Storage objects:", stats.storageObjects);
  console.log("Storage bytes:", stats.storageBytes);
}

main().catch((err) => {
  console.error("BACKUP FAILED");
  console.error(err);
  process.exit(1);
});
