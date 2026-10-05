import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {buildHandlers} = require("../functions/fieldSeasonSquadNotifications.js");
const projectId = "demo-season-squad-notifications";
const app = admin.initializeApp({projectId}, "squad-notification-tests");
const db = getFirestore(app);
const squadId = "field~season~club";
const squadRef = db.doc(`leagueSeasonSquads/${squadId}`);
const deliveryRef = squadRef.collection("invitationDeliveries").doc("member");
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
  batch.set(squadRef, {
    version: 1, status: "active",
    clubId: "club", venueId: "field", seasonId: "season",
    entries: {member: {
      memberId: "member", sourcePlayerId: "player",
      invitationStatus: "pending", contributionCents: 75000,
    }},
  });
  batch.set(db.doc("clubs/club"), {name: "Test Club", ownerUid: "captain"});
  batch.set(db.doc("clubs/club/members/member"), {
    status: "active", playerId: "player", uid: "invited",
    email: "player@example.com",
  });
  batch.set(db.doc("clubs/club/players/player"), {
    status: "active", fullName: "Invited Player",
  });
  batch.set(db.doc("clubFieldMemberships/club"), {
    status: "active", venueId: "field",
  });
  batch.set(db.doc("leagueVenues/field"), {
    league: {activeSeason: {
      id: "season", status: "active", name: "Test League", clubIds: ["club"],
    }},
  });
  for (const [id, uid, token, enabled] of [
    ["one", "invited", "player-token", true],
    ["duplicate", "invited", "player-token", true],
    ["disabled", "invited", "disabled-token", false],
    ["captain", "captain", "captain-token", true],
    ["outsider", "outsider", "outsider-token", true],
  ]) {
    batch.set(db.doc(`clubs/club/notificationDevices/${id}`), {
      firebaseUid: uid, token, enabled,
    });
  }
  await batch.commit();
});

function handlers(sendBatch, authService = {
  getUser: async uid => ({uid}),
  getUserByEmail: async email => ({
    uid: "invited", email, emailVerified: true,
  }),
}) {
  return buildHandlers({
    db, region: "us-central1", testOnly: true, authService, sendBatch,
  });
}

test("only the invited player's enabled unique tokens receive the invitation", async () => {
  const messages = [];
  const {notifyPlayer} = handlers(async message => {
    messages.push(message);
    return {successCount: 1, failureCount: 0};
  });
  assert.equal((await notifyPlayer(squadId, "member")).status, "sent");
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].tokenRecords.map(item => item.token), ["player-token"]);
  assert.equal(messages[0].data.type, "field_season_squad_invitation");
  assert.equal(messages[0].data.clubId, "club");
  assert.equal(messages[0].data.seasonId, "season");
  assert.equal(messages[0].data.memberId, "member");
  assert.equal((await deliveryRef.get()).data().status, "sent");
});

test("a successfully delivered invitation is not sent again", async () => {
  let calls = 0;
  const {notifyPlayer} = handlers(async () => {
    calls++;
    return {successCount: 1};
  });
  await notifyPlayer(squadId, "member");
  assert.equal((await notifyPlayer(squadId, "member")).status, "skipped");
  assert.equal(calls, 1);
});

test("accepted and declined invitations do not send notifications", async () => {
  const {notifyPlayer} = handlers(async () => {
    assert.fail("A responded invitation must not send.");
  });
  for (const status of ["accepted", "declined"]) {
    await squadRef.update({"entries.member.invitationStatus": status});
    assert.equal((await notifyPlayer(squadId, "member")).status, "skipped");
  }
});

test("a changed season or inactive Club membership prevents delivery", async () => {
  const {notifyPlayer} = handlers(async () => {
    assert.fail("A stale invitation must not send.");
  });
  await db.doc("leagueVenues/field").update({
    "league.activeSeason.id": "another-season",
  });
  assert.equal((await notifyPlayer(squadId, "member")).status, "skipped");
  await db.doc("leagueVenues/field").update({
    "league.activeSeason.id": "season",
  });
  await db.doc("clubFieldMemberships/club").update({status: "inactive"});
  assert.equal((await notifyPlayer(squadId, "member")).status, "skipped");
});

test("inactive members and changed player links prevent delivery", async () => {
  const {notifyPlayer} = handlers(async () => {
    assert.fail("An invalid member must not receive an invitation.");
  });
  const ref = db.doc("clubs/club/members/member");
  await ref.update({status: "inactive"});
  assert.equal((await notifyPlayer(squadId, "member")).status, "skipped");
  await ref.update({status: "active", playerId: "another-player"});
  assert.equal((await notifyPlayer(squadId, "member")).status, "skipped");
});

test("email-only member links require a verified matching account", async () => {
  await db.doc("clubs/club/members/member").update({
    uid: admin.firestore.FieldValue.delete(),
  });
  const {notifyPlayer} = handlers(async () => {
    assert.fail("An unverified account must not receive an invitation.");
  }, {
    getUserByEmail: async email => ({
      uid: "invited", email, emailVerified: false,
    }),
  });
  assert.equal((await notifyPlayer(squadId, "member")).status, "no_account");
});

test("failed delivery can retry and completed delivery stays recorded", async () => {
  let calls = 0;
  const {notifyPlayer} = handlers(async () => {
    calls++;
    if (calls === 1) throw new Error("Transport temporarily unavailable");
    return {successCount: 1};
  });
  await assert.rejects(notifyPlayer(squadId, "member"), /temporarily/);
  assert.equal((await deliveryRef.get()).data().status, "failed");
  assert.equal((await notifyPlayer(squadId, "member")).status, "sent");
  assert.equal(calls, 2);
});

test("responding during recipient lookup stops notification delivery", async () => {
  const {notifyPlayer} = handlers(async () => {
    assert.fail("An invitation accepted during lookup must not send.");
  }, {
    getUser: async uid => {
      await squadRef.update({"entries.member.invitationStatus": "accepted"});
      return {uid};
    },
  });
  assert.equal((await notifyPlayer(squadId, "member")).status, "skipped");
});
