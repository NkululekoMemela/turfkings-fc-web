import test, { before, after, beforeEach } from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let env;

const venue = {
  id: "pilot-field-owner",
  name: "Pilot Field",
  ownerUid: "owner",
  adminUids: ["owner"],
  visibility: { listed: true },
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-league-venues",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

test("manager creates and updates only their own venue", async () => {
  const db = env.authenticatedContext("owner").firestore();
  const ref = doc(db, "leagueVenues", venue.id);

  await assertSucceeds(setDoc(ref, venue));
  await assertSucceeds(updateDoc(ref, { name: "Pilot Field Updated" }));
  await assertFails(updateDoc(ref, { ownerUid: "another-user" }));
  await assertFails(deleteDoc(ref));
});

test("another signed-in user cannot claim or modify the venue", async () => {
  const otherDb = env.authenticatedContext("other").firestore();
  const otherRef = doc(otherDb, "leagueVenues", venue.id);

  await assertFails(setDoc(otherRef, venue));

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "leagueVenues", venue.id), venue);
  });

  await assertFails(updateDoc(otherRef, { name: "Hijacked" }));
  await assertFails(deleteDoc(otherRef));
});

test("public visitors can discover venue records", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "leagueVenues", venue.id), venue);
  });

  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "leagueVenues", venue.id)));
  await assertSucceeds(getDocs(collection(db, "leagueVenues")));
  await assertFails(setDoc(doc(db, "leagueVenues", "anonymous"), {
    id: "anonymous",
    ownerUid: "anonymous",
    adminUids: ["anonymous"],
  }));
});

test("camera identity cannot register a venue or write venue subcollections", async () => {
  const db = env.authenticatedContext("camera", {
    cameraSession: true,
    dataScope: "official",
  }).firestore();

  await assertFails(setDoc(doc(db, "leagueVenues", "camera-venue"), {
    id: "camera-venue",
    ownerUid: "camera",
    adminUids: ["camera"],
  }));

  await assertFails(setDoc(
    doc(db, "leagueVenues", venue.id, "seasons", "season-1"),
    { title: "Unauthorized" }
  ));
});

test("the general signed-in fallback does not bypass venue ownership", async () => {
  const db = env.authenticatedContext("other").firestore();

  await assertFails(setDoc(doc(db, "leagueVenues", venue.id), {
    ...venue,
    ownerUid: "owner",
  }));

  await assertFails(setDoc(
    doc(db, "leagueVenues", venue.id, "seasons", "season-1"),
    { title: "Unauthorized" }
  ));
});
