import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {requestDeletion, cleanDeletion} =
  require("../functions/fieldTestSeasonDeletion.js");
const projectId = "demo-field-test-deletion";
const app = admin.initializeApp({projectId}, "deletion-tests");
const db = getFirestore(app);
const root = "leagueVenues/field-one";
const oldSeason = `${root}/seasons/season-one`;
const booking = "leagueClubBookings/field-one~season-one~day-one~club-one";
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
  const batch = db.batch();
  batch.set(db.doc(root), {
    ownerUid: "creator", name: "Keep this Field",
    league: {activeSeason: {
      id: "season-one", name: "Test league", status: "active",
      gameFormat: "5_V_5", liveMatches: {},
      results: [{id: "result-one", status: "completed"}],
    }},
  });
  batch.set(db.doc(`${oldSeason}/matches/current`), {status: "completed"});
  batch.set(db.doc(`${oldSeason}/matchDayReviews/day-one`), {status: "ready"});
  batch.set(db.doc(`${root}/staff/referee`), {status: "active"});
  batch.set(db.doc(booking), {
    venueId: "field-one", seasonId: "season-one",
    entries: {player: {paymentStatus: "pending"}},
  });
  batch.set(db.doc("clubs/club-one"), {name: "Keep this Club"});
  batch.set(db.doc("leagueClubBookings/other-field~season-one~day-one~club-one"), {
    venueId: "other-field", seasonId: "season-one",
    entries: {player: {paymentStatus: "paid"}},
  });
  batch.set(db.doc(`${root}/seasons/other-season`), {name: "Keep archive"});
  await batch.commit();
});

const request = (actorUid = "creator", extra = {}) => requestDeletion({
  db, actorUid,
  body: {
    venueId: "field-one", seasonId: "season-one",
    confirmation: "Test league", confirmedTest: true, ...extra,
  },
});
const clean = () => cleanDeletion({
  db, venueId: "field-one", seasonId: "season-one",
});

test("deletion replaces only the selected season and removes its test records", async () => {
  const result = await request();
  assert.equal(result.status, "pending");
  const fresh = (await db.doc(root).get()).data();
  assert.equal(fresh.name, "Keep this Field");
  assert.equal(fresh.league.activeSeason.id, result.nextSeasonId);
  assert.equal(fresh.league.activeSeason.scheduleVersion, 1);
  assert.deepEqual(fresh.league.activeSeason.results, []);
  await clean();
  for (const path of [
    `${oldSeason}/matches/current`, `${oldSeason}/matchDayReviews/day-one`, booking,
  ]) assert.equal((await db.doc(path).get()).exists, false);
  for (const path of [
    root, `${root}/staff/referee`, "clubs/club-one",
    `${root}/seasons/other-season`,
    "leagueClubBookings/other-field~season-one~day-one~club-one",
  ]) assert.equal((await db.doc(path).get()).exists, true);
  assert.equal((await db.doc(`${root}/seasonDeletionJobs/season-one`).get())
    .data().status, "completed");
});

test("repeated requests and cleanup do not create another season", async () => {
  const first = await request();
  const second = await request();
  assert.equal(first.nextSeasonId, second.nextSeasonId);
  await clean();
  await clean();
  assert.equal((await db.doc(root).get()).data().league.activeSeason.id,
    first.nextSeasonId);
});

test("noncreators and incorrect confirmation cannot delete", async () => {
  await assert.rejects(request("referee"), /creator/);
  await assert.rejects(request("creator", {confirmation: "wrong"}), /exact name/);
  assert.equal((await db.doc(root).get()).data().league.activeSeason.id, "season-one");
});

test("a live game blocks deletion", async () => {
  await db.doc(`${oldSeason}/matches/current`).update({status: "live"});
  await assert.rejects(request(), /live game/);
});

test("confirmed payments block deletion before any records change", async () => {
  await db.doc(booking).update({"entries.player.paymentStatus": "paid"});
  await assert.rejects(request(), /confirmed payments/);
  assert.equal((await db.doc(root).get()).data().league.activeSeason.id, "season-one");
});

test("unknown season collections prevent deletion", async () => {
  await db.doc(`${oldSeason}/additionalRecords/one`).set({keep: true});
  await assert.rejects(request(), /additional records/);
  assert.equal((await db.doc(`${oldSeason}/additionalRecords/one`).get()).exists, true);
});

test("archived seasons cannot enter the active-season deletion flow", async () => {
  await db.doc(oldSeason).set({status: "completed"});
  await assert.rejects(request(), /archive/);
});
