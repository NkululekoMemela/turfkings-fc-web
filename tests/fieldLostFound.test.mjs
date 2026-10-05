import {test, after} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment, assertFails} from "@firebase/rules-unit-testing";
import {doc, getDoc, setDoc} from "firebase/firestore";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {operate} = require("../functions/fieldLostFoundService.js");
const projectId = "demo-fanm-lost-found";
const app = admin.initializeApp({projectId}, "lost-found-tests");
const db = app.firestore();
const env = await initializeTestEnvironment({
  projectId, firestore: {rules: readFileSync("firestore.rules", "utf8")},
});
const venueId = "lost-found-test-field";
const owner = {uid: "field-owner"};
const player = {uid: "reporter", name: "Reporter"};
const stranger = {uid: "stranger"};
await db.doc(`leagueVenues/${venueId}`).set({ownerUid: owner.uid});
const call = (user, action, details = {}) =>
  operate({db, user, body: {venueId, action, ...details}});
const description = {
  description: "Training jacket", details: "Name stitched inside the left pocket",
  place: "Changing room", date: "2026-10-05",
};
let itemId, claimId;

after(async () => {
  await env.cleanup();
  await app.delete();
});

test("players cannot create found items or use a camera identity", async () => {
  await assert.rejects(call(player, "found", description), /admin team/);
  await assert.rejects(call({...player, cameraSession: true}, "view"), /own account/);
});

test("players see only their own reports, never the found inventory", async () => {
  itemId = (await call(owner, "found", description)).id;
  claimId = (await call(player, "claim", description)).id;
  const own = await call(player, "view");
  assert.equal(own.items.length, 0);
  assert.equal(own.claims.length, 1);
  assert.equal(own.claims[0].itemId, undefined);
  assert.equal((await call(stranger, "view")).claims.length, 0);
  await assert.rejects(call(player, "photo", {claimId}), /verify ownership/);
  await assert.rejects(call(player, "photo", {itemId}), /valid Field or report/);
});

test("only admins verify ownership and items cannot be assigned twice", async () => {
  await assert.rejects(call(player, "approve", {claimId, itemId}), /admin team/);
  await call(owner, "approve", {claimId, itemId});
  const second = (await call(stranger, "claim", description)).id;
  await assert.rejects(call(owner, "approve", {claimId: second, itemId}), /processed/);
  await assert.rejects(call(stranger, "photo", {claimId}), /verify ownership/);
  assert.deepEqual(await call(player, "photo", {claimId}), {photo: null});
});

test("collection follows ownership approval", async () => {
  await assert.rejects(call(player, "collect", {claimId}), /admin team/);
  await call(owner, "collect", {claimId});
  assert.equal((await call(player, "view")).claims[0].status, "collected");
});

test("broad Firestore fallback does not expose either private collection", async () => {
  for (const uid of [player.uid, owner.uid, stranger.uid]) {
    const client = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client, "fieldLostFoundItems", itemId)));
    await assertFails(getDoc(doc(client, "fieldLostFoundClaims", claimId)));
    await assertFails(setDoc(doc(client, "fieldLostFoundItems", "forged"), description));
  }
});
