const admin = require("firebase-admin");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "turfkings-fc";
const CLUB_ID = "turf-kings";

const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm");
const DRY_RUN = !(EXECUTE && CONFIRM);

const COLLECTIONS = [
  "players",
  "members",
  "matchSignups",
  "payments",
  "pendingSignups",
  "peerRatings",
  "peerRatingBaselines",
  "playerPhotos",
  "newsStories",
  "seasons",
  "matches",
  "kitOrders",
  "humanMembers",
  "yearEndConfig",
  "yearEndRSVP",
  "yearEndRSVP_withdrawals",
];

if (PROJECT_ID !== "turfkings-fc") {
  console.error(`Blocked: this script is only allowed on turfkings-fc. Current project: ${PROJECT_ID}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function copyCollectionRecursive(sourceColPath, destColPath) {
  const snap = await db.collection(sourceColPath).get();
  let copied = 0;

  for (const docSnap of snap.docs) {
    const sourceDocPath = `${sourceColPath}/${docSnap.id}`;
    const destDocPath = `${destColPath}/${docSnap.id}`;

    console.log(`${DRY_RUN ? "WOULD_OVERWRITE" : "OVERWRITE"} ${sourceDocPath} -> ${destDocPath}`);

    if (!DRY_RUN) {
      await db.doc(destDocPath).set(docSnap.data(), { merge: false });
    }

    copied++;

    const subcols = await docSnap.ref.listCollections();
    for (const subcol of subcols) {
      copied += await copyCollectionRecursive(
        `${sourceDocPath}/${subcol.id}`,
        `${destDocPath}/${subcol.id}`
      );
    }
  }

  return copied;
}

async function copyStateDoc() {
  const sourceSnap = await db.doc("appState_v2/main").get();
  const destSnap = await db.doc(`clubs/${CLUB_ID}/state/main`).get();

  if (!sourceSnap.exists) {
    console.log("SKIP state: missing appState_v2/main");
    return 0;
  }

  const sourceData = sourceSnap.data();
  const existingDest = destSnap.exists ? destSnap.data() : {};

  const nextDest = {
    ...existingDest,
    clubId: CLUB_ID,
    schemaVersion: sourceData.schemaVersion || existingDest.schemaVersion || 3,
    state: sourceData.state,
    updatedAt: sourceData.updatedAt || new Date().toISOString(),
    updatedAtISO: new Date().toISOString(),
  };

  console.log(`${DRY_RUN ? "WOULD_OVERWRITE" : "OVERWRITE"} appState_v2/main -> clubs/${CLUB_ID}/state/main`);
  console.log("State activeSeasonId:", nextDest?.state?.activeSeasonId);
  console.log("State seasons:", Array.isArray(nextDest?.state?.seasons) ? nextDest.state.seasons.length : "not array");

  if (!DRY_RUN) {
    await db.doc(`clubs/${CLUB_ID}/state/main`).set(nextDest, { merge: false });
  }

  return 1;
}

async function main() {
  console.log("\nPRODUCTION CLUB-SCOPE MIGRATION");
  console.log("Project:", PROJECT_ID);
  console.log("Club:", CLUB_ID);
  console.log("Mode:", DRY_RUN ? "DRY RUN ONLY" : "WRITE / OVERWRITE");
  console.log("");

  let total = 0;

  total += await copyStateDoc();

  for (const name of COLLECTIONS) {
    console.log(`\nMigrating ${name} -> clubs/${CLUB_ID}/${name}`);
    const count = await copyCollectionRecursive(name, `clubs/${CLUB_ID}/${name}`);
    console.log(`Count: ${count}`);
    total += count;
  }

  console.log("\nSUMMARY");
  console.log("Total docs selected:", total);
  console.log(DRY_RUN ? "No writes made." : "Overwrite complete.");
}

main().catch((err) => {
  console.error("\nMIGRATION FAILED:");
  console.error(err);
  process.exit(1);
});
