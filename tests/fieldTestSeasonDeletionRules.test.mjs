import {readFileSync} from "node:fs";
import {test, before, after, beforeEach} from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {doc, getDoc, setDoc, updateDoc, deleteDoc} from "firebase/firestore";

let environment;
const root = "leagueVenues/field-one";
const jobPath = `${root}/seasonDeletionJobs/season-one`;
const database = uid => environment.authenticatedContext(uid).firestore();

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-field-deletion-rules",
    firestore: {rules: readFileSync("firestore.rules", "utf8")},
  });
});
after(async () => {await environment?.cleanup();});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, root), {
      ownerUid: "creator", adminUids: ["administrator"],
      league: {activeSeason: {id: "season-one", status: "active"}},
    });
    await setDoc(doc(db, `${root}/staff/administrator`), {
      status: "active", isAdministrator: true, role: "manager",
    });
    await setDoc(doc(db, jobPath), {
      venueId: "field-one", seasonId: "season-one",
      requestedByUid: "creator", status: "pending",
    });
  });
});

test("only the creator can read deletion progress", async () => {
  await assertSucceeds(getDoc(doc(database("creator"), jobPath)));
  await assertFails(getDoc(doc(database("administrator"), jobPath)));
  await assertFails(getDoc(doc(database("outsider"), jobPath)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), jobPath)));
});

test("even the creator cannot forge, alter or delete server cleanup jobs", async () => {
  const db = database("creator");
  await assertFails(setDoc(doc(db, `${root}/seasonDeletionJobs/forged`), {
    venueId: "field-one", seasonId: "other-season", status: "pending",
  }));
  await assertFails(updateDoc(doc(db, jobPath), {status: "completed"}));
  await assertFails(deleteDoc(doc(db, jobPath)));
});
