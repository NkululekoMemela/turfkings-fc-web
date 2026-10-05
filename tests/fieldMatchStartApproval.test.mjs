import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {approvalHandler} = require("../functions/fieldMatchStartApproval.js");
const projectId = "demo-field-start-approval";
const app = admin.initializeApp({projectId}, "approval-tests");
const db = getFirestore(app);
let environment;
const venuePath = "leagueVenues/field-one";
const bookingPath = clubId =>
  `leagueClubBookings/field-one~season-one~day-one~${clubId}`;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId, firestore: {rules: "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }"},
  });
});
after(async () => {
  await environment?.cleanup();
  await app.delete();
});
beforeEach(async () => {
  await environment.clearFirestore();
  const batch = db.batch();
  batch.set(db.doc(venuePath), {
    ownerUid: "creator",
    league: {activeSeason: {
      id: "season-one", status: "active", scheduleVersion: 1,
      gameFormat: "5_V_5", liveMatches: {},
      clubIds: ["club-a", "club-b"],
      fixtures: [{
        id: "fixture-one", status: "scheduled", matchDayId: "day-one",
        clubAId: "club-a", clubBId: "club-b",
      }],
      matchDays: [{
        id: "day-one", status: "scheduled",
        dateLocal: "2026-01-01", fixtureIds: ["fixture-one"],
      }],
    }},
  });
  batch.set(db.doc(`${venuePath}/staff/referee`), {
    status: "active", role: "referee", isAdministrator: false,
  });
  for (const clubId of ["club-a", "club-b"]) {
    const entries = {};
    for (let i = 1; i <= 5; i++) {
      entries[`player-${i}`] = {
        playerId: `player-${i}`, sourcePlayerId: `player-${i}`,
        fullName: `Player ${i}`, paymentStatus: "paid",
      };
      batch.set(db.doc(`clubs/${clubId}/players/player-${i}`), {
        fullName: `Player ${i}`, status: "active",
      });
    }
    batch.set(db.doc(bookingPath(clubId)), {
      venueId: "field-one", seasonId: "season-one",
      matchDayId: "day-one", clubId, entries,
      updatedAt: Timestamp.now(),
    });
  }
  await batch.commit();
});

async function request(uid = "referee", headers = {authorization: "Bearer test"}) {
  let status = 200;
  let body;
  const res = {
    status(value) {status = value; return this;},
    json(value) {body = value; return this;},
  };
  await approvalHandler({
    method: "POST", headers,
    body: {venueId: "field-one", seasonId: "season-one", fixtureId: "fixture-one"},
  }, res, {
    db,
    verifyToken: async (token, revoked) => {
      assert.equal(token, "test");
      assert.equal(revoked, true);
      return {uid};
    },
  });
  return {status, body};
}

test("valid paid squads receive a single-use approval", async () => {
  const result = await request();
  assert.equal(result.status, 200);
  const receipt = (await db.doc(
    `${venuePath}/seasons/season-one/startApprovals/${result.body.approvalId}`
  ).get()).data();
  assert.equal(receipt.used, false);
  assert.equal(receipt.actorUid, "referee");
  assert.equal(receipt.squads["club-a"].length, 5);
  assert.equal(receipt.squads["club-b"].length, 5);
  assert.ok(receipt.expiresAt.toMillis() > Date.now());
});

test("unpaid players cannot satisfy the minimum squad", async () => {
  await db.doc(bookingPath("club-a")).update({
    "entries.player-5.paymentStatus": "pending",
  });
  assert.equal((await request()).status, 400);
});

test("inactive player profiles cannot satisfy the minimum squad", async () => {
  await db.doc("clubs/club-b/players/player-5").update({status: "inactive"});
  assert.equal((await request()).status, 400);
});

test("duplicate profile entries cannot inflate the squad", async () => {
  await db.doc(bookingPath("club-a")).update({
    "entries.player-5.sourcePlayerId": "player-4",
  });
  assert.equal((await request()).status, 400);
});

test("bookings from a different league day are rejected", async () => {
  await db.doc(bookingPath("club-a")).update({matchDayId: "other-day"});
  assert.equal((await request()).status, 400);
});

test("unauthorized users and missing authentication are rejected", async () => {
  assert.equal((await request("outsider")).status, 400);
  assert.equal((await request("referee", {})).status, 401);
});

test("future dates require the creator's testing setting", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.matchDays": [{
      id: "day-one", status: "scheduled",
      dateLocal: "2099-01-01", fixtureIds: ["fixture-one"],
    }],
  });
  assert.equal((await request()).status, 400);
  await db.doc(venuePath).update({"league.activeSeason.allowEarlyStarts": true});
  assert.equal((await request()).status, 200);
});

test("a live match blocks another approval", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.liveMatches.other": {status: "live"},
  });
  assert.equal((await request()).status, 400);
});

test("an unarchived previous day blocks server approval even in testing", async () => {
  const season = (await db.doc(venuePath).get()).data().league.activeSeason;
  season.allowEarlyStarts = true;
  season.matchDays.unshift({
    id: "previous-day", roundNo: 1, status: "scheduled",
    dateLocal: "2025-12-25", fixtureIds: ["previous-fixture"],
  });
  await db.doc(venuePath).update({"league.activeSeason": season});
  assert.equal((await request()).status, 400);
  await db.doc(venuePath).update({
    "league.activeSeason.matchDayHistory": [
      {scheduledMatchDayId: "previous-day"},
    ],
  });
  assert.equal((await request()).status, 200);
});

test("unregistered fixture Clubs cannot receive approval", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.clubIds": ["club-a"],
  });
  const result = await request();
  assert.equal(result.status, 400);
  assert.match(result.body.error, /registered/);
});

async function seedPaidSeasonSquads() {
  const batch = db.batch();
  for (const clubId of ["club-a", "club-b"]) {
    batch.set(db.doc(`clubs/${clubId}`), {ownerUid: `captain-${clubId}`});
    batch.set(db.doc(`clubFieldMemberships/${clubId}`), {
      status: "active", venueId: "field-one",
    });
    const scope = {venueId: "field-one", seasonId: "season-one", clubId};
    const ref = db.doc(`leagueSeasonSquads/field-one~season-one~${clubId}`);
    const entries = {};
    for (let i = 1; i <= 5; i++) {
      const memberId = `member-${i}`;
      const sourcePlayerId = `player-${i}`;
      entries[memberId] = {
        memberId, sourcePlayerId, fullName: `Player ${i}`,
        invitationStatus: "accepted", paymentStatus: "paid",
        currency: "ZAR", contributionCents: 75000, paidCents: 75000,
        paymentConfirmedByUid: `captain-${clubId}`,
      };
      batch.set(db.doc(`clubs/${clubId}/members/${memberId}`), {
        status: "active", playerId: sourcePlayerId,
      });
      batch.set(ref.collection("paymentConfirmations").doc(memberId), {
        ...scope, memberId, sourcePlayerId,
        amountCents: 75000, currency: "ZAR",
        confirmedByUid: `captain-${clubId}`,
      });
    }
    batch.set(ref, {
      ...scope, version: 1, status: "active", entries,
      updatedAt: Timestamp.now(),
    });
  }
  await batch.commit();
}

test("paid season squads approve a fixture without daily bookings", async () => {
  await seedPaidSeasonSquads();
  for (const clubId of ["club-a", "club-b"]) {
    await db.doc(bookingPath(clubId)).delete();
  }
  const result = await request();
  assert.equal(result.status, 200);
  const approval = (await db.doc(
    `${venuePath}/seasons/season-one/startApprovals/${result.body.approvalId}`
  ).get()).data();
  assert.equal(approval.squads["club-a"].length, 5);
  assert.equal(approval.squads["club-a"][0].playerId, "club-a::player-1");
  assert.equal(Object.keys(approval.squadVersions).length, 2);
  assert.deepEqual(approval.bookingVersions, {});
  assert.equal(Object.hasOwn(approval.squads["club-a"][0], "contributionCents"), false);
});

test("an unpaid season squad cannot fall back to old paid daily bookings", async () => {
  await seedPaidSeasonSquads();
  await db.doc("leagueSeasonSquads/field-one~season-one~club-a").update({
    "entries.member-1.paymentStatus": "pending",
    updatedAt: Timestamp.now(),
  });
  const result = await request();
  assert.equal(result.status, 400);
  assert.match(result.body.error, /eligible/);
});

test("a season player without a matching receipt cannot receive approval", async () => {
  await seedPaidSeasonSquads();
  await db.doc(
    "leagueSeasonSquads/field-one~season-one~club-a/paymentConfirmations/member-1"
  ).delete();
  const result = await request();
  assert.equal(result.status, 400);
  assert.match(result.body.error, /receipt/);
});

test("one season squad and one legacy daily squad can approve during migration", async () => {
  await seedPaidSeasonSquads();
  await db.doc("leagueSeasonSquads/field-one~season-one~club-b").delete();
  const result = await request();
  assert.equal(result.status, 200);
  const approval = (await db.doc(
    `${venuePath}/seasons/season-one/startApprovals/${result.body.approvalId}`
  ).get()).data();
  assert.deepEqual(Object.keys(approval.squadVersions), ["club-a"]);
  assert.deepEqual(Object.keys(approval.bookingVersions), ["club-b"]);
});
