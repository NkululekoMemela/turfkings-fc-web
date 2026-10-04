import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {setSeasonMatchDayAvailability} =
  require("../functions/fieldSeasonSquadService.js");
const projectId = "demo-season-availability";
const app = admin.initializeApp({projectId}, "season-availability-tests");
const db = getFirestore(app);
const scope = {venueId: "field", seasonId: "season", clubId: "club"};
const squadRef = db.doc("leagueSeasonSquads/field~season~club");
const venueRef = db.doc("leagueVenues/field");
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
  batch.set(db.doc("clubs/club"), {ownerUid: "captain"});
  batch.set(db.doc("clubFieldMemberships/club"), {
    venueId: "field", status: "active",
  });
  batch.set(venueRef, {
    ownerUid: "field-manager",
    league: {activeSeason: {
      id: "season", status: "active", scheduleVersion: 1,
      clubIds: ["club"],
      matchDays: [{id: "day", status: "scheduled", fixtureIds: ["game"]}],
      fixtures: [{
        id: "game", matchDayId: "day", status: "scheduled",
        clubAId: "club", clubBId: "opponent",
      }],
      liveMatches: {},
    }},
  });
  batch.set(db.doc("clubs/club/members/member"), {
    status: "active", uid: "player-user", playerId: "player",
  });
  batch.set(db.doc("clubs/club/players/player"), {
    status: "active", fullName: "Player One",
  });
  batch.set(squadRef, {
    ...scope, version: 1, status: "active",
    updatedAt: Timestamp.fromMillis(1000),
    plan: {currency: "ZAR", totalCents: 75000},
    entries: {member: {
      memberId: "member", sourcePlayerId: "player",
      invitationStatus: "accepted", paymentStatus: "paid",
      contributionCents: 75000, paidCents: 75000,
    }},
  });
  batch.set(squadRef.collection("paymentConfirmations").doc("member"), {
    amountCents: 75000, currency: "ZAR", confirmedByUid: "captain",
  });
  await batch.commit();
});

function change(uid = "player-user", details = {}) {
  return setSeasonMatchDayAvailability({
    db, user: {uid},
    body: {...scope, matchDayId: "day", memberId: "member",
      available: false, ...details},
  });
}

test("a player changes availability without changing season money", async () => {
  const before = (await squadRef.get()).data();
  const receiptRef = squadRef.collection("paymentConfirmations").doc("member");
  const receipt = (await receiptRef.get()).data();
  assert.equal((await change()).status, "unavailable");
  const after = (await squadRef.get()).data();
  assert.equal(after.matchDayAvailability.day.member.status, "unavailable");
  assert.equal(after.matchDayAvailability.day.member.changedByUid, "player-user");
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.plan, before.plan);
  assert.deepEqual((await receiptRef.get()).data(), receipt);
  assert.ok(after.updatedAt.toMillis() > before.updatedAt.toMillis());
});

test("the Club captain can record availability for a squad player", async () => {
  await change("captain");
  assert.equal((await squadRef.get()).data()
    .matchDayAvailability.day.member.changedByUid, "captain");
});

test("outsiders and Field managers cannot change Club player availability", async () => {
  for (const uid of ["outsider", "field-manager"]) {
    await assert.rejects(change(uid), /Only/);
  }
});

test("pending invitations cannot set availability", async () => {
  await squadRef.update({"entries.member.invitationStatus": "pending"});
  await assert.rejects(change(), /accepted/);
});

test("live and archived games block changes", async () => {
  const liveRef = db.doc("leagueVenues/field/seasons/season/matches/current");
  await liveRef.set({fixtureId: "game", status: "live"});
  await assert.rejects(change(), /started/);
  await liveRef.delete();
  await venueRef.update({
    "league.activeSeason.matchDayHistory": [{scheduledMatchDayId: "day"}],
  });
  await assert.rejects(change(), /no longer/);
});

test("a stale season or changed member link blocks changes", async () => {
  await assert.rejects(change("player-user", {seasonId: "old-season"}), /registered/);
  await db.doc("clubs/club/members/member").update({playerId: "other-player"});
  await assert.rejects(change(), /matching Club membership/);
});

test("returning requires removing pending or accepted replacement cover", async () => {
  for (const invitationStatus of ["pending", "accepted"]) {
    await squadRef.update({
      "matchDayReplacements.day.member": {invitationStatus},
    });
    await assert.rejects(change("player-user", {available: true}), /replacement/);
  }
});

test("repeating the same choice preserves the squad revision", async () => {
  await change();
  const version = (await squadRef.get()).data().updatedAt;
  assert.equal((await change()).unchanged, true);
  assert.ok((await squadRef.get()).data().updatedAt.isEqual(version));
});
