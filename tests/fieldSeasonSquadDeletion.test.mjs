import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {requestDeletion, cleanDeletion} =
  require("../functions/fieldTestSeasonDeletion.js");
const projectId = "demo-season-squad-deletion";
const app = admin.initializeApp({projectId}, "squad-deletion-tests");
const db = getFirestore(app);
const venueRef = db.doc("leagueVenues/field");
const squadRef = db.doc("leagueSeasonSquads/field~season~club");
const body = {
  venueId: "field", seasonId: "season",
  confirmation: "Test League", confirmedTest: true,
};
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {rules: "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }"},
  });
});
after(async () => {
  await environment?.cleanup();
  await app.delete();
});
beforeEach(async () => {
  await environment.clearFirestore();
  await venueRef.set({
    ownerUid: "creator",
    league: {activeSeason: {
      id: "season", name: "Test League", status: "active",
      gameFormat: "5_V_5", liveMatches: {}, fixtures: [],
      results: [], matchDayHistory: [],
    }},
  });
  await squadRef.set({
    venueId: "field", seasonId: "season", clubId: "club",
    entries: {member: {paymentStatus: "pending"}},
  });
});
const request = () => requestDeletion({db, actorUid: "creator", body});

test("a paid season squad prevents deletion and preserves the season", async () => {
  await squadRef.update({"entries.member.paymentStatus": "paid"});
  await assert.rejects(request(), /confirmed squad payments/);
  assert.equal((await venueRef.get()).data().league.activeSeason.id, "season");
  assert.equal((await squadRef.get()).exists, true);
  assert.equal((await venueRef.collection("seasonDeletionJobs").get()).empty, true);
});

test("a receipt prevents deletion even if the entry says pending", async () => {
  const receipt = squadRef.collection("paymentConfirmations").doc("member");
  await receipt.set({amountCents: 75000});
  await assert.rejects(request(), /confirmed squad payments/);
  assert.equal((await receipt.get()).exists, true);
});

test("unpaid test squads are recorded and removed with retry-safe cleanup", async () => {
  const result = await request();
  const job = await venueRef.collection("seasonDeletionJobs").doc("season").get();
  assert.deepEqual(job.data().seasonSquadIds, ["field~season~club"]);
  assert.notEqual(result.nextSeasonId, "season");
  await cleanDeletion({db, venueId: "field", seasonId: "season"});
  assert.equal((await squadRef.get()).exists, false);
  await cleanDeletion({db, venueId: "field", seasonId: "season"});
  assert.equal((await job.ref.get()).data().status, "completed");
});

test("another Field's paid squad is preserved", async () => {
  const other = db.doc("leagueSeasonSquads/other~season~club");
  await other.set({
    venueId: "other", seasonId: "season", clubId: "club",
    entries: {member: {paymentStatus: "paid", paidCents: 75000}},
  });
  await request();
  await cleanDeletion({db, venueId: "field", seasonId: "season"});
  assert.equal((await other.get()).exists, true);
});

test("cleanup stops if a payment receipt appears after the deletion request", async () => {
  await request();
  const receipt = squadRef.collection("paymentConfirmations").doc("member");
  await receipt.set({amountCents: 75000});
  await assert.rejects(
    cleanDeletion({db, venueId: "field", seasonId: "season"}), /receipts/
  );
  assert.equal((await receipt.get()).exists, true);
  assert.equal((await squadRef.get()).exists, true);
});
