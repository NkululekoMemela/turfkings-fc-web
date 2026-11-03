import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {submitDecision, reviewDecision} = require("../functions/fieldDecisionService.js");
const projectId = "demo-field-decisions";
const app = admin.initializeApp({projectId}, "decision-tests");
const db = getFirestore(app);
const root = db.doc("leagueVenues/field-one");
const now = Date.parse("2026-10-04T09:00:00+02:00");
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
  await root.set({
    id: "field-one", ownerUid: "creator",
    league: {activeSeason: {
      id: "season-one", status: "active", scheduleVersion: 1,
      gameFormat: "5_V_5",
      scheduleSettings: {matchMinutes: 40, halftimeMinutes: 5, turnaroundMinutes: 5},
      matchDays: [
        {id: "day-one", status: "scheduled", dateLocal: "2026-10-11",
          startTime: "18:00", fixtureIds: ["game-one"]},
        {id: "day-two", status: "scheduled", dateLocal: "2026-10-18",
          startTime: "18:00", fixtureIds: ["game-two"]},
      ],
      fixtures: [
        {id: "game-one", matchDayId: "day-one", status: "scheduled",
          clubAId: "a", clubBId: "b", scheduledLocal: "2026-10-11T18:00"},
        {id: "game-two", matchDayId: "day-two", status: "scheduled",
          clubAId: "a", clubBId: "c", scheduledLocal: "2026-10-18T18:00"},
      ],
      liveMatches: {}, results: [], matchDayHistory: [],
    }},
  });
  await root.collection("staff").doc("junior").set({
    status: "active", role: "other_staff", isAdministrator: false,
  });
});

const body = (extra = {}) => ({
  venueId: "field-one", seasonId: "season-one", requestId: "request-one",
  action: "reschedule_day", reason: "Heavy rain makes the venue unsafe.",
  parameters: {matchDayId: "day-one", dateLocal: "2026-10-12", startTime: "19:00"},
  ...extra,
});
const submit = (actorUid = "junior", extra = {}) =>
  submitDecision({db, actorUid, body: body(extra), now});
const review = (response = "approve", actorUid = "creator", time = now + 1000) =>
  reviewDecision({
    db, actorUid, now: time,
    body: {venueId: "field-one", requestId: "request-one", response},
  });
const season = async () => (await root.get()).data().league.activeSeason;

test("staff request records the proposal without changing the schedule", async () => {
  const original = await season();
  assert.equal((await submit()).status, "pending");
  assert.deepEqual(await season(), original);
  const request = (await root.collection("decisionRequests").doc("request-one").get()).data();
  assert.equal(request.managerUid, "creator");
  assert.equal(request.requestedByUid, "junior");
  assert.equal(request.summary.after[0].scheduledLocal, "2026-10-12T19:00");
});

test("creator approval applies only the proposed day and records the decision", async () => {
  await submit();
  assert.equal((await review()).status, "approved");
  const current = await season();
  assert.equal(current.fixtures[0].scheduledLocal, "2026-10-12T19:00");
  assert.equal(current.fixtures[1].scheduledLocal, "2026-10-18T18:00");
  assert.equal(current.matchDays[0].dateLocal, "2026-10-12");
  assert.equal((await root.collection("actionLog").get()).size, 1);
});

test("rejection preserves the schedule", async () => {
  const original = await season();
  await submit();
  assert.equal((await review("reject")).status, "rejected");
  assert.deepEqual(await season(), original);
  await assert.rejects(review("approve"), /pending/);
});

test("outsiders cannot request and junior staff cannot approve", async () => {
  await assert.rejects(submit("outsider"));
  await submit();
  await assert.rejects(review("approve", "junior"), /creator/);
  assert.equal((await season()).fixtures[0].scheduledLocal, "2026-10-11T18:00");
});

test("changed schedules invalidate pending approval", async () => {
  await submit();
  const current = await season();
  current.fixtures[0].scheduledLocal = "2026-10-11T18:30";
  await root.update({"league.activeSeason.fixtures": current.fixtures});
  await assert.rejects(review());
  assert.equal((await season()).fixtures[0].scheduledLocal, "2026-10-11T18:30");
});

test("expired requests and revoked staff cannot receive approval", async () => {
  await submit();
  await assert.rejects(review("approve", "creator", now + 86400001), /expired/);
  await root.collection("staff").doc("junior").update({status: "rejected"});
  await assert.rejects(review());
  assert.equal((await season()).fixtures[0].scheduledLocal, "2026-10-11T18:00");
});

test("repeated submission and approval do not duplicate changes or audit records", async () => {
  await submit();
  await submit();
  assert.equal((await root.collection("decisionRequests").get()).size, 1);
  await review();
  const approved = await season();
  await review();
  assert.deepEqual(await season(), approved);
  assert.equal((await root.collection("actionLog").get()).size, 1);
});

test("a request ID cannot be reused for different details", async () => {
  await submit();
  await assert.rejects(submit("junior", {
    parameters: {matchDayId: "day-one", dateLocal: "2026-10-12", startTime: "20:00"},
  }), /already been used/);
});
