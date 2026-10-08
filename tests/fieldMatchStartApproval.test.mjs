import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {approvalHandler} = require("../functions/fieldMatchStartApproval");
const {loadDay} = require("../functions/fieldMatchDaySquad");
const {save} = require("../functions/fieldMatchDayFormation");
const projectId = "demo-field-start-approval";
const app = admin.initializeApp({projectId}, "approval-tests");
const db = getFirestore(app);
const venuePath = "leagueVenues/field-one";
const squadRef = clubId =>
  db.doc(`leagueSeasonSquads/field-one~season-one~${clubId}`);
const clubs = ["club-a", "club-b"];
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }",
    },
  });
});
after(async () => {
  await environment?.cleanup();
  await app.delete();
});

async function confirmFormation(clubId, count = 6) {
  const scope = {venueId: "field-one", seasonId: "season-one", clubId};
  const day = await db.runTransaction(tx =>
    loadDay({tx, db, scope, matchDayId: "day-one"}));
  const selected = day.candidates.slice(0, count);
  await squadRef(clubId).update({
    "matchDaySubmissions.day-one": {
      memberIds: selected.map(p => p.memberId),
      fingerprint: day.submission.fingerprint,
      submittedByUid: `captain-${clubId}`,
      submittedAtMs: Date.now(),
    },
    updatedAt: Timestamp.now(),
  });
  const lineup = {
    formationId: "1-2-1",
    positions: Object.fromEntries(selected.slice(0, 5).map((p, i) =>
      [`p${i + 1}`, p.fullName])),
    benchSnapshot: selected.slice(5).map(p => p.fullName),
  };
  return save({
    db, user: {uid: `captain-${clubId}`},
    body: {...scope, matchDayId: "day-one",
      expectedFingerprint: day.submission.fingerprint, lineup},
  });
}

beforeEach(async () => {
  await environment.clearFirestore();
  const batch = db.batch();
  batch.set(db.doc(venuePath), {
    ownerUid: "creator",
    league: {activeSeason: {
      id: "season-one", status: "active", scheduleVersion: 1,
      gameFormat: "5_V_5", liveMatches: {},
      announcedAtMs: 1, schedulePublishedAtMs: 1,
      entryFee: 100, clubIds: clubs,
      invitations: Object.fromEntries(clubs.map(clubId =>
        [clubId, {status: "accepted", clubName: clubId}])),
      fixtures: [{
        id: "fixture-one", status: "scheduled", matchDayId: "day-one",
        clubAId: "club-a", clubBId: "club-b",
        scheduledLocal: "2026-01-01T18:00",
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
  for (const clubId of clubs) {
    const scope = {venueId: "field-one", seasonId: "season-one", clubId};
    batch.set(db.doc(`clubs/${clubId}`), {
      ownerUid: `captain-${clubId}`, name: clubId,
    });
    batch.set(db.doc(`clubFieldMemberships/${clubId}`), {
      status: "active", venueId: "field-one",
    });
    batch.set(db.doc(`${venuePath}/seasons/season-one/clubEntryReceipts/${clubId}`), {
      ...scope, amountCents: 10000, currency: "ZAR", status: "paid",
      confirmedByUid: "creator", confirmedAtMs: 1,
    });
    const entries = {};
    for (let i = 1; i <= 6; i++) {
      const memberId = `member-${i}`;
      const sourcePlayerId = `player-${i}`;
      batch.set(db.doc(`clubs/${clubId}/members/${memberId}`), {
        status: "active", playerId: sourcePlayerId,
      });
      batch.set(db.doc(`clubs/${clubId}/players/${sourcePlayerId}`), {
        status: "active", fullName: `Player ${i}`,
        mentality: i % 5 + 1, shooting: 5 - i % 5,
      });
      entries[memberId] = {
        memberId, sourcePlayerId, fullName: `Player ${i}`,
        invitationStatus: "accepted", paymentStatus: "paid",
        currency: "ZAR", contributionCents: 75000, paidCents: 75000,
        paymentConfirmedByUid: `captain-${clubId}`,
      };
      batch.set(squadRef(clubId).collection("paymentConfirmations").doc(memberId), {
        ...scope, memberId, sourcePlayerId, amountCents: 75000,
        currency: "ZAR", confirmedByUid: `captain-${clubId}`,
      });
    }
    batch.set(squadRef(clubId), {
      ...scope, version: 1, status: "active", entries,
      updatedAt: Timestamp.now(),
    });
  }
  await batch.commit();
  for (const clubId of clubs) await confirmFormation(clubId);
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

async function approved() {
  const result = await request();
  assert.equal(result.status, 200, result.body?.error);
  return (await db.doc(
    `${venuePath}/seasons/season-one/startApprovals/${result.body.approvalId}`
  ).get()).data();
}

test("Approval carries the exact saved formation and Club mentality values", async () => {
  const receipt = await approved();
  const season = (await db.doc(venuePath).get()).data().league.activeSeason;
  assert.equal(receipt.used, false);
  assert.equal(receipt.actorUid, "referee");
  assert.equal(receipt.squads["club-a"].length, 6);
  assert.equal(receipt.squads["club-a"][0].playerId, "club-a::player-1");
  assert.equal(receipt.squads["club-a"][0].mentality, 2);
  assert.equal(receipt.squads["club-a"][0].shooting, 4);
  const saved = season.savedLineups["club-a"]["5"].variants.captain;
  assert.deepEqual(receipt.startingLineups["club-a"].positions, saved.positions);
  assert.deepEqual(receipt.startingLineups["club-a"].benchSnapshot, saved.benchSnapshot);
  assert.ok(receipt.expiresAt.toMillis() > Date.now());
  assert.deepEqual(receipt.bookingVersions, {});
});

test("Five-player squads start without a substitute", async () => {
  for (const clubId of clubs) await confirmFormation(clubId, 5);
  const receipt = await approved();
  assert.equal(receipt.squads["club-a"].length, 5);
  assert.deepEqual(receipt.startingLineups["club-a"].benchSnapshot, []);
});

test("Unaccepted invitations block play but Club entry payment does not", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.invitations.club-a.status": "pending",
  });
  const invitation = await request();
  assert.equal(invitation.status, 400);
  assert.match(invitation.body.error, /accept/);
  await db.doc(venuePath).update({
    "league.activeSeason.invitations.club-a.status": "accepted",
  });
  await db.doc(`${venuePath}/seasons/season-one/clubEntryReceipts/club-a`).delete();
  await approved();
});

test("Unpaid player invalidates the confirmed squad", async () => {
  await squadRef("club-a").update({"entries.member-1.paymentStatus": "pending"});
  assert.equal((await request()).status, 400);
});

test("Inactive or relinked player cannot enter the starting lineup", async () => {
  await db.doc("clubs/club-a/members/member-1").update({playerId: "player-2"});
  assert.equal((await request()).status, 400);
});

test("Missing player receipt cannot fall back to legacy daily bookings", async () => {
  await squadRef("club-a").collection("paymentConfirmations").doc("member-1").delete();
  const result = await request();
  assert.equal(result.status, 400);
  assert.match(result.body.error, /receipt/);
});

test("Missing and stale saved formations use automatic kickoff positions", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.savedLineups.club-a.5.variants.captain.squadFingerprint": "stale",
  });
  assert.equal((await approved()).startingLineups["club-a"].meta.automatic, true);
  await db.doc(venuePath).update({"league.activeSeason.savedLineups": {}});
  assert.equal((await approved()).startingLineups["club-a"].meta.automatic, true);
});

test("A captain cannot save another Club's formation", async () => {
  const season = (await db.doc(venuePath).get()).data().league.activeSeason;
  const lineup = season.savedLineups["club-b"]["5"].variants.captain;
  await assert.rejects(save({
    db, user: {uid: "captain-club-a"},
    body: {venueId: "field-one", seasonId: "season-one", clubId: "club-b",
      matchDayId: "day-one", lineup, expectedFingerprint: lineup.squadFingerprint},
  }), /Only this Club/);
});

test("Stale captain save cannot overwrite the formation", async () => {
  const before = (await db.doc(venuePath).get()).data().league.activeSeason.savedLineups;
  await assert.rejects(save({
    db, user: {uid: "captain-club-a"},
    body: {venueId: "field-one", seasonId: "season-one", clubId: "club-a",
      matchDayId: "day-one", lineup: before["club-a"]["5"].variants.captain,
      expectedFingerprint: "stale"},
  }), /squad changed/);
  const after = (await db.doc(venuePath).get()).data().league.activeSeason.savedLineups;
  assert.deepEqual(after, before);
});

test("Unauthorized users and missing authentication are rejected", async () => {
  assert.equal((await request("outsider")).status, 400);
  assert.equal((await request("referee", {})).status, 401);
});

test("Future dates require the creator's testing setting", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.matchDays": [{
      id: "day-one", status: "scheduled", dateLocal: "2099-01-01",
      fixtureIds: ["fixture-one"],
    }],
    "league.activeSeason.fixtures": [{
      id: "fixture-one", status: "scheduled", matchDayId: "day-one",
      clubAId: "club-a", clubBId: "club-b", scheduledLocal: "2099-01-01T18:00",
    }],
  });
  assert.equal((await request()).status, 400);
  for (const clubId of clubs) await confirmFormation(clubId);
  await db.doc(venuePath).update({"league.activeSeason.allowEarlyStarts": true});
  await approved();
});

test("A live fixture blocks another approval", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.liveMatches.other": {status: "live"},
  });
  assert.equal((await request()).status, 400);
});
