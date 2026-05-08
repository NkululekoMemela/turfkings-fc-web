// scripts/auditClubMigration.cjs

const admin = require("firebase-admin");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "turfkings-staging";
const CLUB_ID = process.env.CLUB_ID || "turf-kings";

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

async function countCollectionRecursive(collectionRef) {
  const snapshot = await collectionRef.get();

  let documentCount = snapshot.size;
  let subcollectionCount = 0;

  for (const docSnap of snapshot.docs) {
    const subcollections = await docSnap.ref.listCollections();

    for (const subcollection of subcollections) {
      subcollectionCount += 1;
      const nested = await countCollectionRecursive(subcollection);
      documentCount += nested.documentCount;
      subcollectionCount += nested.subcollectionCount;
    }
  }

  return { documentCount, subcollectionCount };
}

async function collectionExists(collectionPath) {
  const snapshot = await db.collection(collectionPath).limit(1).get();
  return !snapshot.empty;
}

async function auditPath(sourcePath, targetPath) {
  const sourceRef = db.collection(sourcePath);
  const sourceSnapshot = await sourceRef.get();

  const sourceExists = !sourceSnapshot.empty;
  const targetExists = await collectionExists(targetPath);

  let recursiveCounts = {
    documentCount: 0,
    subcollectionCount: 0,
  };

  if (sourceExists) {
    recursiveCounts = await countCollectionRecursive(sourceRef);
  }

  return {
    sourcePath,
    targetPath,
    sourceTopLevelDocuments: sourceSnapshot.size,
    sourceRecursiveDocuments: recursiveCounts.documentCount,
    sourceNestedSubcollections: recursiveCounts.subcollectionCount,
    sourceExists,
    targetAlreadyExists: targetExists,
    action:
      sourceExists && !targetExists
        ? "WOULD_COPY"
        : sourceExists && targetExists
          ? "TARGET_EXISTS_REVIEW_BEFORE_COPY"
          : "SOURCE_MISSING_SKIP",
  };
}

async function main() {
  console.log("");
  console.log("Club migration dry-run audit");
  console.log("============================");
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Club ID: ${CLUB_ID}`);
  console.log("Mode: READ ONLY / DRY RUN");
  console.log("");

  const rows = [];

  for (const [sourcePath, targetPath] of MIGRATION_MAP) {
    const result = await auditPath(sourcePath, targetPath);
    rows.push(result);
  }

  console.table(
    rows.map((row) => ({
      source: row.sourcePath,
      target: row.targetPath,
      docs: row.sourceRecursiveDocuments,
      nestedCollections: row.sourceNestedSubcollections,
      targetExists: row.targetAlreadyExists,
      action: row.action,
    }))
  );

  const totals = rows.reduce(
    (acc, row) => {
      acc.sourcePaths += row.sourceExists ? 1 : 0;
      acc.missingSources += row.sourceExists ? 0 : 1;
      acc.documents += row.sourceRecursiveDocuments;
      acc.nestedSubcollections += row.sourceNestedSubcollections;
      acc.targetConflicts += row.targetAlreadyExists ? 1 : 0;
      return acc;
    },
    {
      sourcePaths: 0,
      missingSources: 0,
      documents: 0,
      nestedSubcollections: 0,
      targetConflicts: 0,
    }
  );

  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(`Existing source paths: ${totals.sourcePaths}`);
  console.log(`Missing source paths: ${totals.missingSources}`);
  console.log(`Documents discovered: ${totals.documents}`);
  console.log(`Nested subcollections discovered: ${totals.nestedSubcollections}`);
  console.log(`Target paths already existing: ${totals.targetConflicts}`);

  console.log("");
  console.log("No Firestore writes were made.");
}

main().catch((error) => {
  console.error("");
  console.error("Audit failed:");
  console.error(error);
  process.exit(1);
});