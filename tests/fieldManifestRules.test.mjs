
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, setDoc, getDocs, updateDoc, deleteDoc,
} from "firebase/firestore";

test("Spectators read Field manifests; clients cannot alter them", async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-field-manifest-access",
    firestore: {rules: await readFile("firestore.rules", "utf8")},
  });
  const root =
    "leagueVenues/field/seasons/season/fieldMatchDayManifests/day/clubs";
  try {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), `${root}/club`), {
        clubId: "club", confirmed: true,
        players: [{memberId: "member", fullName: "Registered Player"}],
      });
    });
    const spectator = env.unauthenticatedContext().firestore();
    const result = await assertSucceeds(getDocs(collection(spectator, root)));
    assert.equal(result.size, 1);
    for (const uid of ["captain", "field-owner", "outsider"]) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(setDoc(doc(db, `${root}/another`), {players: []}));
      await assertFails(updateDoc(doc(db, `${root}/club`), {players: []}));
      await assertFails(deleteDoc(doc(db, `${root}/club`)));
    }
  } finally {
    await env.cleanup();
  }
});
