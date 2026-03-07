import admin from "firebase-admin";
import fs from "fs";

// ---------- LOAD SERVICE ACCOUNT JSON FILES ----------
const prodServiceAccount = JSON.parse(
  fs.readFileSync("./prodServiceAccount.json", "utf8")
);

const stagingServiceAccount = JSON.parse(
  fs.readFileSync("./stagingServiceAccount.json", "utf8")
);

// ---------- INIT APPS ----------
const prodApp = admin.initializeApp(
  {
    credential: admin.credential.cert(prodServiceAccount),
  },
  "prod"
);

const stagingApp = admin.initializeApp(
  {
    credential: admin.credential.cert(stagingServiceAccount),
  },
  "staging"
);

const prodDb = admin.firestore(prodApp);
const stagingDb = admin.firestore(stagingApp);

// ---------- COLLECTIONS TO COPY ----------
const COLLECTIONS_TO_COPY = [
  "appState_v2",
  "humanMembers",
  "kitOrders",
  "matches",
  "members",
  "peerRatings",
  "playerPhotos",
  "players",
  "yearEndConfig",
  "yearEndRSVP",
  "yearEndRSVP_withdrawals",
];

// ---------- HELPERS ----------
async function copyCollection(collectionName) {
  console.log(`\n📦 Copying collection: ${collectionName}`);

  const snapshot = await prodDb.collection(collectionName).get();

  if (snapshot.empty) {
    console.log(`⚠️  Collection "${collectionName}" is empty in production.`);
    return;
  }

  const batchSize = 400;
  let batch = stagingDb.batch();
  let opCount = 0;
  let total = 0;

  for (const docSnap of snapshot.docs) {
    const destRef = stagingDb.collection(collectionName).doc(docSnap.id);
    batch.set(destRef, docSnap.data(), { merge: true });

    opCount += 1;
    total += 1;

    if (opCount >= batchSize) {
      await batch.commit();
      console.log(`   ✅ committed ${total} docs so far...`);
      batch = stagingDb.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log(`✅ Finished "${collectionName}" (${total} docs copied)`);
}

// ---------- RUN ----------
async function main() {
  try {
    console.log("🚀 Starting Firestore clone...");
    console.log("FROM: turfkings-fc");
    console.log("TO:   turfkings-staging");

    for (const collectionName of COLLECTIONS_TO_COPY) {
      await copyCollection(collectionName);
    }

    console.log("\n🎉 Firestore clone completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Firestore clone failed:");
    console.error(err);
    process.exit(1);
  }
}

main();