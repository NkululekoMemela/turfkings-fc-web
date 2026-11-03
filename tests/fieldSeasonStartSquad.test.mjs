import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {loadSeasonStartSquad} = require("../functions/fieldSeasonStartSquad.js");
const projectId = "demo-season-start-squad";
const app = admin.initializeApp({projectId}, "season-start-squad-tests");
const db = getFirestore(app);
const scope = {venueId: "field", seasonId: "season", clubId: "club"};
const squadRef = db.doc("leagueSeasonSquads/field~season~club");
const memberRef = db.doc("clubs/club/members/member");
const receiptRef = squadRef.collection("paymentConfirmations").doc("member");
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
    status: "active", venueId: "field",
  });
  batch.set(memberRef, {status: "active", playerId: "player"});
  batch.set(db.doc("clubs/club/players/player"), {
    status: "active", fullName: "Current Player Name",
  });
  batch.set(squadRef, {
    ...scope, version: 1, status: "active", updatedAt: Timestamp.now(),
    entries: {member: {
      memberId: "member", sourcePlayerId: "player", fullName: "Old Name",
      invitationStatus: "accepted", paymentStatus: "paid",
      contributionCents: 75000, paidCents: 75000, currency: "ZAR",
      paymentConfirmedByUid: "captain",
    }},
  });
  batch.set(receiptRef, {
    ...scope, memberId: "member", sourcePlayerId: "player",
    amountCents: 75000, currency: "ZAR", confirmedByUid: "captain",
  });
  await batch.commit();
});
const load = () => db.runTransaction(transaction =>
  loadSeasonStartSquad({transaction, db, scope}));

test("paid accepted players with current links and receipts enter the lineup", async () => {
  const result = await load();
  assert.equal(result.eligible.length, 1);
  assert.equal(result.eligible[0].fullName, "Current Player Name");
  assert.equal(Object.hasOwn(result.eligible[0], "contributionCents"), false);
});

test("missing season squads return null for legacy booking handling", async () => {
  await squadRef.delete();
  assert.equal(await load(), null);
});

test("inactive membership and changed player links exclude a player", async () => {
  await memberRef.update({status: "pending"});
  assert.equal((await load()).eligible.length, 0);
  await memberRef.update({status: "active", playerId: "different"});
  assert.equal((await load()).eligible.length, 0);
});

test("missing or mismatched receipts stop approval", async () => {
  await receiptRef.delete();
  await assert.rejects(load(), /receipt/);
  await receiptRef.set({
    ...scope, memberId: "member", sourcePlayerId: "player",
    amountCents: 74000, currency: "ZAR", confirmedByUid: "captain",
  });
  await assert.rejects(load(), /receipt/);
});

test("a Club leaving the Field cannot use its paid season squad", async () => {
  await db.doc("clubFieldMemberships/club").update({status: "inactive"});
  await assert.rejects(load(), /active member/);
});

test("unpaid players cannot use a previously created receipt", async () => {
  await squadRef.update({"entries.member.paymentStatus": "pending"});
  assert.equal((await load()).eligible.length, 0);
});
