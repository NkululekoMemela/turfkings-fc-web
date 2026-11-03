import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {buildHandlers} = require("../functions/fieldMatchDayHandlers.js");
const projectId = "demo-match-day-handlers";
const app = admin.initializeApp({projectId}, "day-handler-tests");
const db = getFirestore(app);
let environment;
let service;
let queued;
let sent;
const venueRef = db.doc("leagueVenues/field-one");
const reviewRef = venueRef.collection("seasons").doc("season-one")
  .collection("matchDayReviews").doc("day-one");
const readyAtMs = Date.parse("2026-10-03T21:00:00+02:00");
const cutoff = Date.parse("2026-10-03T23:59:00+02:00");

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
  queued = [];
  sent = [];
  service = buildHandlers({
    db, region: "us-central1", testOnly: true,
    enqueueTask: async (payload, options) => queued.push({payload, options}),
    sendBatch: async message => {
      sent.push(message);
      return {successCount: message.tokenRecords.length, failureCount: 0};
    },
  });
  const batch = db.batch();
  batch.set(venueRef, {
    ownerUid: "creator", name: "Test Field",
    league: {activeSeason: {
      id: "season-one", status: "active", scheduleVersion: 1,
      matchDays: [{
        id: "day-one", dateLocal: "2026-10-03", fixtureIds: ["fixture-one"],
      }],
      fixtures: [{
        id: "fixture-one", matchDayId: "day-one", status: "completed",
        clubAId: "club-a", clubBId: "club-b",
      }],
      results: [{
        fixtureId: "fixture-one", matchNo: 1, status: "completed",
      }],
      matchDayHistory: [], liveMatches: {}, allEvents: [],
    }},
  });
  for (const uid of ["creator", "assistant", "referee"]) {
    batch.set(db.doc(`clubs/club-a/notificationDevices/${uid}`), {
      firebaseUid: uid, enabled: true, token: `token-${uid}`,
    });
  }
  batch.set(venueRef.collection("staff").doc("assistant"), {status: "active"});
  batch.set(venueRef.collection("staffPermissions").doc("assistant"), {
    endMatchDay: true,
  });
  batch.set(venueRef.collection("staff").doc("referee"), {
    status: "active", role: "referee",
  });
  await batch.commit();
});

test("unfinished fixtures create no review or jobs", async () => {
  const season = (await venueRef.get()).data().league.activeSeason;
  season.fixtures[0].status = "scheduled";
  await venueRef.update({"league.activeSeason": season});
  await service.processVenue("field-one");
  assert.equal((await reviewRef.get()).exists, false);
  assert.equal(queued.length, 0);
});

test("completion creates one review and two targeted jobs", async () => {
  await service.runReview("field-one", "season-one", "day-one");
  assert.equal((await reviewRef.get()).data().status, "ready");
  assert.deepEqual(queued.map(job => job.payload.kind), ["reminder", "closure"]);
  assert.equal(sent.length, 1);
  await service.runReview("field-one", "season-one", "day-one");
  assert.equal(queued.length, 2);
  assert.equal(sent.length, 1);
});

test("only the creator and staff with closure powers receive push", async () => {
  await service.runReview("field-one", "season-one", "day-one");
  assert.deepEqual(sent[0].tokenRecords.map(item => item.token).sort(), [
    "token-assistant", "token-creator",
  ]);
});

test("two-hour reminder is delivered once", async () => {
  await service.processDay("field-one", "season-one", "day-one", Date.now() - 10800000);
  await reviewRef.update({initialSentAtMs: Date.now() - 10800000});
  await service.notifyReview("field-one", "season-one", "day-one", "reminder");
  await service.notifyReview("field-one", "season-one", "day-one", "reminder");
  assert.equal(sent.length, 1);
});

test("cutoff archives once and preserves season results", async () => {
  await service.processDay("field-one", "season-one", "day-one", readyAtMs);
  await service.processDay("field-one", "season-one", "day-one", cutoff);
  await service.processDay("field-one", "season-one", "day-one", cutoff + 1000);
  const season = (await venueRef.get()).data().league.activeSeason;
  assert.equal(season.matchDayHistory.length, 1);
  assert.equal(season.results.length, 1);
  assert.equal(season.matchDayHistory[0].automatic, true);
  assert.equal((await reviewRef.get()).data().status, "closed");
});

test("a live match blocks automatic closure", async () => {
  await service.processDay("field-one", "season-one", "day-one", readyAtMs);
  await venueRef.update({
    "league.activeSeason.liveMatches.other": {status: "live"},
  });
  await service.processDay("field-one", "season-one", "day-one", cutoff);
  assert.equal((await venueRef.get()).data().league.activeSeason.matchDayHistory.length, 0);
});

test("manual closure closes the review without another archive", async () => {
  await service.processDay("field-one", "season-one", "day-one", readyAtMs);
  await venueRef.update({
    "league.activeSeason.matchDayHistory": [{scheduledMatchDayId: "day-one"}],
  });
  await service.processDay("field-one", "season-one", "day-one", cutoff);
  assert.equal((await reviewRef.get()).data().status, "closed");
  assert.equal((await venueRef.get()).data().league.activeSeason.matchDayHistory.length, 1);
});
