import test, { before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import fs from "node:fs";
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

const PROJECT_ID = "demo-fanm-official-regression";
const rules = fs.readFileSync("firestore.rules", "utf8");

const OFFICIAL_COLLECTIONS = [
  "acceptedClubChallenges",
  "clubChallengeFixtures",
  "clubChallenges",
  "clubs",
  "kitOrders",
  "payments",
  "platformPlayers",
  "restore_tests",
  "seasons",
  "video_highlights",
];

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

test("all existing Official top-level namespaces remain writable by signed-in users", async () => {
  const db = testEnv
    .authenticatedContext("official-regression-user")
    .firestore();

  for (const collectionName of OFFICIAL_COLLECTIONS) {
    await assertSucceeds(
      setDoc(
        doc(db, collectionName, "regression-probe"),
        {
          regressionProbe: true,
          collectionName,
        }
      )
    );
  }
});

test("all existing Official top-level namespaces remain readable by signed-in users", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const collectionName of OFFICIAL_COLLECTIONS) {
      await setDoc(
        doc(db, collectionName, "regression-probe"),
        { regressionProbe: true }
      );
    }
  });

  const db = testEnv
    .authenticatedContext("official-regression-user")
    .firestore();

  for (const collectionName of OFFICIAL_COLLECTIONS) {
    await assertSucceeds(
      getDoc(doc(db, collectionName, "regression-probe"))
    );
  }
});

test("clubs remain publicly readable exactly as before", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "clubs", "public-club"),
      { name: "Public Club" }
    );
  });

  const db = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(
    getDoc(doc(db, "clubs", "public-club"))
  );
});

test("non-club Official namespaces remain unavailable to unauthenticated writes", async () => {
  const db = testEnv.unauthenticatedContext().firestore();

  for (const collectionName of OFFICIAL_COLLECTIONS.filter(
    (name) => name !== "clubs"
  )) {
    await assertFails(
      setDoc(
        doc(db, collectionName, "unauthenticated-probe"),
        { unsafe: true }
      )
    );
  }
});
