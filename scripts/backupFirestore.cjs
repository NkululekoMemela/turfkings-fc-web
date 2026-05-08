// scripts/backupFirestore.js

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "turfkings-staging";

const BACKUP_ROOT =
  process.env.BACKUP_ROOT ||
  path.join(process.env.HOME, "Projects/turfkings-backups/firestore/staging");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

function serializeValue(value) {
  if (value === null || value === undefined) return value;

  if (typeof value.toDate === "function") {
    return {
      __type: "timestamp",
      iso: value.toDate().toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object") {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      output[key] = serializeValue(val);
    }
    return output;
  }

  return value;
}

function writeDocumentFile(outputDir, docPath, payload) {
  const safeFilePath = path.join(outputDir, "documents", `${docPath}.json`);
  fs.mkdirSync(path.dirname(safeFilePath), { recursive: true });
  fs.writeFileSync(safeFilePath, JSON.stringify(payload, null, 2));
}

async function backupDocument(docRef, output, outputDir) {
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    const payload = {
      id: docSnap.id,
      path: docSnap.ref.path,
      data: serializeValue(docSnap.data()),
    };

    output.documents.push(payload);
    writeDocumentFile(outputDir, docSnap.ref.path, payload);
  }

  const subcollections = await docRef.listCollections();

  for (const subcollection of subcollections) {
    await backupCollection(subcollection, output, outputDir);
  }
}

async function backupCollection(collectionRef, output, outputDir) {
  console.log(`Reading collection: ${collectionRef.path}`);

  const snapshot = await collectionRef.get();

  output.collections.push({
    id: collectionRef.id,
    path: collectionRef.path,
    documentCount: snapshot.size,
  });

  for (const docSnap of snapshot.docs) {
    await backupDocument(docSnap.ref, output, outputDir);
  }
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(BACKUP_ROOT, timestamp);

  fs.mkdirSync(outputDir, { recursive: true });

  const output = {
    manifest: {
      projectId: PROJECT_ID,
      createdAt: new Date().toISOString(),
      backupType: "recursive_full_firestore_backup_with_path_files",
      note:
        "Read-only backup. Includes top-level collections, nested subcollections, one full JSON archive, and one JSON file per Firestore document path.",
    },
    collections: [],
    documents: [],
  };

  console.log("Firestore recursive backup started");
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Output: ${outputDir}`);
  console.log("");

  const rootCollections = await db.listCollections();

  for (const collection of rootCollections) {
    await backupCollection(collection, output, outputDir);
  }

  fs.writeFileSync(
    path.join(outputDir, "firestore-full-backup.json"),
    JSON.stringify(output, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "_manifest.json"),
    JSON.stringify(output.manifest, null, 2)
  );

  console.log("");
  console.log("Backup complete.");
  console.log(`Collections found: ${output.collections.length}`);
  console.log(`Documents backed up: ${output.documents.length}`);
  console.log(`Saved to: ${outputDir}`);
}

main().catch((error) => {
  console.error("Backup failed:");
  console.error(error);
  process.exit(1);
});