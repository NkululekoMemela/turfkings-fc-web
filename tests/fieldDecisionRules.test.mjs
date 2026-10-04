import {readFileSync} from "node:fs";
import {test, before, after, beforeEach} from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, collection, getDoc, getDocs, query, where,
  setDoc, updateDoc, deleteDoc,
} from "firebase/firestore";

let environment;
const root = "leagueVenues/field-one";
const requestPath = `${root}/decisionRequests/request-one`;
const database = uid => environment.authenticatedContext(uid).firestore();

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-field-decision-rules",
    firestore: {rules: readFileSync("firestore.rules", "utf8")},
  });
});
after(async () => {await environment?.cleanup();});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, root), {
      id: "field-one", ownerUid: "creator",
      league: {activeSeason: {id: "season-one", status: "active"}},
    });
    await setDoc(doc(db, requestPath), {
      venueId: "field-one", seasonId: "season-one",
      requestedByUid: "junior", managerUid: "creator", status: "pending",
    });
    await setDoc(doc(db, `${root}/decisionRequests/request-two`), {
      venueId: "field-one", seasonId: "season-one",
      requestedByUid: "other", managerUid: "creator", status: "pending",
    });
  });
});

test("creator and requester can read; unrelated users cannot", async () => {
  await assertSucceeds(getDoc(doc(database("creator"), requestPath)));
  await assertSucceeds(getDoc(doc(database("junior"), requestPath)));
  await assertFails(getDoc(doc(database("other"), requestPath)));
  await assertFails(getDoc(doc(
    environment.unauthenticatedContext().firestore(), requestPath)));
});

test("creator can list requests; staff can query only their own", async () => {
  await assertSucceeds(getDocs(collection(database("creator"), root, "decisionRequests")));
  await assertSucceeds(getDocs(query(
    collection(database("junior"), root, "decisionRequests"),
    where("requestedByUid", "==", "junior"))));
  await assertFails(getDocs(collection(database("junior"), root, "decisionRequests")));
});

test("clients including the creator cannot forge, approve or delete requests", async () => {
  for (const uid of ["creator", "junior", "other"]) {
    const db = database(uid);
    await assertFails(setDoc(doc(db, `${root}/decisionRequests/forged`), {
      requestedByUid: uid, status: "approved",
    }));
    await assertFails(updateDoc(doc(db, requestPath), {status: "approved"}));
    await assertFails(deleteDoc(doc(db, requestPath)));
  }
});
