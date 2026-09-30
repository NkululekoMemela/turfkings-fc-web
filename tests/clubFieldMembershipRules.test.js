import test from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

let env;
test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-field-membership",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "clubs", "club-one"), {
      ownerUid: "owner", createdByUid: "owner",
      adminUids: ["owner"], adminEmails: ["owner@example.com"],
    });
    for (const id of ["field-one", "field-two"]) {
      await setDoc(doc(db, "leagueVenues", id), {
        id, ownerUid: "staff", league: { activeSeason: { clubIds: [] } },
      });
    }
  });
});
test.after(async () => { await env?.cleanup(); });

test("Club admin joins once and changes Field; other users cannot", async () => {
  const owner = env.authenticatedContext("owner", {
    email: "owner@example.com", email_verified: true,
  }).firestore();
  const outsider = env.authenticatedContext("outsider", {
    email: "outsider@example.com", email_verified: true,
  }).firestore();
  const payload = uid => ({
    clubId: "club-one", venueId: "field-one", status: "active",
    previousVenueId: "", joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(), changedByUid: uid,
  });

  await assertFails(setDoc(doc(outsider, "clubFieldMemberships", "club-one"),
    payload("outsider")));
  await assertSucceeds(setDoc(doc(owner, "clubFieldMemberships", "club-one"),
    payload("owner")));
  await assertFails(updateDoc(doc(outsider, "clubFieldMemberships", "club-one"), {
    venueId: "field-two", previousVenueId: "field-one",
    updatedAt: serverTimestamp(), changedByUid: "outsider",
  }));
  await assertFails(updateDoc(doc(owner, "clubFieldMemberships", "club-one"), {
    venueId: "missing-field", previousVenueId: "field-one",
    updatedAt: serverTimestamp(), changedByUid: "owner",
  }));
  await assertSucceeds(updateDoc(doc(owner, "clubFieldMemberships", "club-one"), {
    venueId: "field-two", previousVenueId: "field-one",
    updatedAt: serverTimestamp(), changedByUid: "owner",
  }));
  const membership = await assertSucceeds(
    getDoc(doc(owner, "clubFieldMemberships", "club-one")));
  if (membership.data().venueId !== "field-two") {
    throw new Error("Field change was not saved.");
  }
});
