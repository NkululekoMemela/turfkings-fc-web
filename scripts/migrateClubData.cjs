// scripts/migrateClubData.cjs

const admin = require("firebase-admin");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "turfkings-staging";
const CLUB_ID = process.env.CLUB_ID || "turf-kings";
const WRITE = process.env.WRITE === "true";

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

const MIGRATION_MAP = [
  ["appState_v2", `clubs/${CLUB_ID}/state`],
  ["players", `clubs/${CLUB_ID}/players`],
  ["members", `clubs/${CLUB_ID}/members`],
  ["humanMembers", `clubs/${CLUB_ID}/humanMembers`],
  ["matchSignups", `clubs/${CLUB_ID}/matchSignups`],
  ["payments", `clubs/${CLUB_ID}/payments`],
  ["peerRatings", `clubs/${CLUB_ID}/peerRatings`],
  ["peerRatingBaselines", `clubs/${CLUB_ID}/peerRatingBaselines`],
  ["playerPhotos", `clubs/${CLUB_ID}/playerPhotos`],
  ["pendingSignups", `clubs/${CLUB_ID}/pendingSignups`],
  ["newsStories", `clubs/${CLUB_ID}/newsStories`],
  ["video_highlights", `clubs/${CLUB_ID}/video_highlights`],
  ["seasons", `clubs/${CLUB_ID}/seasons`],
  ["matches", `clubs/${CLUB_ID}/matches`],
  ["kitOrders", `clubs/${CLUB_ID}/kitOrders`],
  ["yearEndConfig", `clubs/${CLUB_ID}/yearEndConfig`],
  ["yearEndRSVP", `clubs/${CLUB_ID}/yearEndRSVP`],
  ["yearEndRSVP_withdrawals", `clubs/${CLUB_ID}/yearEndRSVP_withdrawals`],
];

async function copyCollection(sourceCollectionRef, targetCollectionRef, stats) {
  const snapshot = await sourceCollectionRef.get();

  if (snapshot.empty) {
    stats.skippedEmptyCollections += 1;
    return;
  }

  for (const docSnap of snapshot.docs) {
    const targetDocRef = targetCollectionRef.doc(docSnap.id);
    const targetSnap = await targetDocRef.get();

    if (targetSnap.exists) {
      stats.skippedExistingDocs += 1;
      console.log(`SKIP existing: ${targetDocRef.path}`);
      continue;
    }

    console.log(`${WRITE ? "COPY" : "WOULD_COPY"} ${docSnap.ref.path} -> ${targetDocRef.path}`);

    if (WRITE) {
      await targetDocRef.set(docSnap.data());
    }

    stats.copiedDocs += 1;

    const subcollections = await docSnap.ref.listCollections();

    for (const subcollection of subcollections) {
      const targetSubcollectionRef = targetDocRef.collection(subcollection.id);
      await copyCollection(subcollection, targetSubcollectionRef, stats);
    }
  }
}

async function ensureClubProfile() {
  const clubRef = db.doc(`clubs/${CLUB_ID}`);
  const clubSnap = await clubRef.get();

  if (clubSnap.exists) {
    console.log(`Club profile already exists: ${clubRef.path}`);
    return false;
  }

  const profile = {
    clubId: CLUB_ID,
    name: "Turf Kings",
    platform: "5 Asides Near Me",
    migrationCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    migrationSource: "legacy-root-firestore-collections",
    migrationProjectId: PROJECT_ID,
  };

  console.log(`${WRITE ? "CREATE" : "WOULD_CREATE"} ${clubRef.path}`);

  if (WRITE) {
    await clubRef.set(profile);
  }

  return true;
}

async function main() {
  console.log("");
  console.log("Club data migration");
  console.log("===================");
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Club ID: ${CLUB_ID}`);
  console.log(`Mode: ${WRITE ? "WRITE ENABLED" : "DRY RUN ONLY"}`);
  console.log("");

  if (PROJECT_ID !== "turfkings-staging") {
    console.error("Blocked: this migration script is only allowed on turfkings-staging for now.");
    process.exit(1);
  }

  const stats = {
    copiedDocs: 0,
    skippedExistingDocs: 0,
    skippedEmptyCollections: 0,
    missingSourceCollections: 0,
    clubProfileCreated: false,
  };

  stats.clubProfileCreated = await ensureClubProfile();

  for (const [sourcePath, targetPath] of MIGRATION_MAP) {
    const sourceCollectionRef = db.collection(sourcePath);
    const targetCollectionRef = db.collection(targetPath);

    const sourceSnapshot = await sourceCollectionRef.limit(1).get();

    if (sourceSnapshot.empty) {
      stats.missingSourceCollections += 1;
      console.log(`SKIP missing/empty source: ${sourcePath}`);
      continue;
    }

    console.log("");
    console.log(`Migrating collection: ${sourcePath} -> ${targetPath}`);
    await copyCollection(sourceCollectionRef, targetCollectionRef, stats);
  }

  console.log("");
  console.log("Migration summary");
  console.log("-----------------");
  console.log(`Club profile created: ${stats.clubProfileCreated}`);
  console.log(`Copied docs: ${stats.copiedDocs}`);
  console.log(`Skipped existing docs: ${stats.skippedExistingDocs}`);
  console.log(`Skipped empty collections: ${stats.skippedEmptyCollections}`);
  console.log(`Missing/empty source collections: ${stats.missingSourceCollections}`);
  console.log("");

  if (!WRITE) {
    console.log("No Firestore writes were made. Run again with WRITE=true to migrate staging.");
  } else {
    console.log("Migration completed on staging.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("Migration failed:");
  console.error(error);
  process.exit(1);
});