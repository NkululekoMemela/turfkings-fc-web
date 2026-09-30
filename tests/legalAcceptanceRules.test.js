import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";

let env;
test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-legal-signature",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
test.after(async () => { await env?.cleanup(); });

test("only the signer creates their immutable acceptance", async () => {
  const signer = env.authenticatedContext("signer").firestore();
  const other = env.authenticatedContext("other").firestore();
  const path = [
    "legalAcceptances", "signer", "records", "club-2026-09-29-1",
  ];
  const record = {
    uid: "signer",
    scope: "club",
    version: "club-2026-09-29-1",
    documentHash: "a".repeat(64),
    acceptedAt: serverTimestamp(),
  };

  await assertFails(setDoc(doc(other, ...path), record));
  await assertSucceeds(setDoc(doc(signer, ...path), record));
  assert.equal(
    (await assertSucceeds(getDoc(doc(signer, ...path)))).exists(),
    true
  );
  await assertFails(getDoc(doc(other, ...path)));
  await assertFails(updateDoc(doc(signer, ...path), {
    documentHash: "b".repeat(64),
  }));
  await assertFails(deleteDoc(doc(signer, ...path)));
});
