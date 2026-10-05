import {createRequire} from "node:module";
import {test, before, after, beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const {
  createSeasonSquad, respondSeasonInvitation, confirmSeasonPayment,
  getSeasonSquadView,
} = require("../functions/fieldSeasonSquadService.js");
const projectId = "demo-season-squad";
const app = admin.initializeApp({projectId}, "season-squad-tests");
const db = getFirestore(app);
const scope = {venueId: "field", seasonId: "season", clubId: "club"};
const owner = {uid: "owner"};
const captain = {
  uid: "captain", email: "captain@example.com", email_verified: true,
};
const players = Array.from({length: 6}, (_, index) => ({
  sourcePlayerId: `player-${index}`, memberId: `member-${index}`,
}));
const squadRef = db.doc("leagueSeasonSquads/field~season~club");
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
  batch.set(db.doc("clubs/club"), {
    ownerUid: "owner", captainEmails: ["captain@example.com"],
  });
  batch.set(db.doc("clubFieldMemberships/club"), {
    status: "active", venueId: "field",
  });
  batch.set(db.doc("leagueVenues/field"), {
    ownerUid: "field-manager",
    league: {activeSeason: {
      id: "season", status: "active", gameFormat: "5_V_5",
      clubIds: ["club"], maxPlayersPerClubPerDay: 10,
    }},
  });
  for (let index = 0; index < 6; index++) {
    batch.set(db.doc(`clubs/club/players/player-${index}`), {
      fullName: `Player ${index}`, status: "active",
    });
    batch.set(db.doc(`clubs/club/members/member-${index}`), {
      uid: `user-${index}`, playerId: `player-${index}`,
      email: `player-${index}@example.com`, status: "active",
    });
  }
  await batch.commit();
});

const create = (user = owner, extra = {}) => createSeasonSquad({
  db, user, body: {...scope, players, totalCents: 450000, ...extra}, now: 100,
});
const accept = (user = {uid: "user-0"}, extra = {}) =>
  respondSeasonInvitation({
    db, user, body: {...scope, memberId: "member-0", response: "accepted", ...extra},
    now: 200,
  });
const pay = (user = owner) => confirmSeasonPayment({
  db, user, body: {...scope, memberId: "member-0"}, now: 300,
});

test("Club owner creates six unpaid invitations with registered names", async () => {
  await create();
  const squad = (await squadRef.get()).data();
  assert.equal(Object.keys(squad.entries).length, 6);
  assert.equal(squad.entries["member-0"].fullName, "Player 0");
  assert.equal(squad.entries["member-0"].contributionCents, 75000);
  assert.equal(squad.entries["member-0"].paymentStatus, "pending");
});

test("verified captain can create; ordinary player and Field manager cannot", async () => {
  await assert.rejects(create({uid: "user-0"}), /administrator or captain/);
  await assert.rejects(create({uid: "field-manager"}), /administrator or captain/);
  await assert.rejects(create({...captain, email_verified: false}), /administrator or captain/);
  await create(captain);
});

test("duplicate creation preserves entries and cannot change agreed amounts", async () => {
  await create();
  await accept();
  const repeated = await create();
  assert.equal(repeated.status, "existing");
  assert.equal((await squadRef.get()).data().entries["member-0"].invitationStatus,
    "accepted");
  await assert.rejects(create(owner, {totalCents: 480000}), /overwritten/);
});

test("missing player links and inactive members cannot be invited", async () => {
  await db.doc("clubs/club/members/member-0").update({playerId: "wrong"});
  await assert.rejects(create(), /matching player link/);
  await db.doc("clubs/club/members/member-0").update({
    playerId: "player-0", status: "pending",
  });
  await assert.rejects(create(), /matching player link/);
  assert.equal((await squadRef.get()).exists, false);
});

test("another player and even the captain cannot accept someone else's invitation", async () => {
  await create();
  await assert.rejects(accept({uid: "user-1"}), /invited Club member/);
  await assert.rejects(accept(captain), /invited Club member/);
  await accept();
  assert.equal((await squadRef.get()).data().entries["member-0"].paymentStatus,
    "pending");
});

test("verified member email works; an unverified email cannot impersonate a member", async () => {
  await create();
  const user = {
    uid: "new-account", email: "player-0@example.com", email_verified: false,
  };
  await assert.rejects(accept(user), /invited Club member/);
  await accept({...user, email_verified: true});
});

test("payment requires acceptance and Club authority; repeated confirmation creates one receipt", async () => {
  await create();
  await assert.rejects(pay(), /accept/);
  await accept();
  await assert.rejects(pay({uid: "user-0"}), /administrator or captain/);
  await pay(captain);
  await pay(owner);
  const receipts = await squadRef.collection("paymentConfirmations").get();
  assert.equal(receipts.size, 1);
  assert.equal(receipts.docs[0].data().amountCents, 75000);
  assert.equal(receipts.docs[0].data().confirmedByUid, "captain");
  assert.equal((await squadRef.get()).data().entries["member-0"].paymentStatus,
    "paid");
});

test("a changed season or Field membership blocks further operations", async () => {
  await create();
  await db.doc("clubFieldMemberships/club").update({venueId: "another-field"});
  await assert.rejects(accept(), /not registered/);
  await db.doc("clubFieldMemberships/club").update({venueId: "field"});
  await db.doc("leagueVenues/field").update({
    "league.activeSeason.id": "next-season",
  });
  await assert.rejects(pay(), /not registered/);
});

test("players see only their own season invitation", async () => {
  await create();
  const view = await getSeasonSquadView({
    db, user: {uid: "user-0"}, body: scope,
  });
  assert.equal(view.canManage, false);
  assert.equal(view.invitation.memberId, "member-0");
  assert.equal(view.invitation.contributionCents, 75000);
  assert.equal(Object.hasOwn(view, "squad"), false);
  assert.equal(Object.hasOwn(view, "plan"), false);
});

test("uninvited accounts and Field managers receive no player payment details", async () => {
  await create();
  for (const uid of ["outsider", "field-manager"]) {
    const view = await getSeasonSquadView({db, user: {uid}, body: scope});
    assert.equal(view.canManage, false);
    assert.equal(view.invitation, null);
    assert.equal(Object.hasOwn(view, "squad"), false);
  }
});

test("owner and verified captain see the squad management view", async () => {
  await create();
  for (const user of [owner, captain]) {
    const view = await getSeasonSquadView({db, user, body: scope});
    assert.equal(view.canManage, true);
    assert.equal(Object.keys(view.squad.entries).length, 6);
  }
});

test("inactive members lose access to their invitation details", async () => {
  await create();
  await db.doc("clubs/club/members/member-0").update({status: "inactive"});
  const view = await getSeasonSquadView({
    db, user: {uid: "user-0"}, body: scope,
  });
  assert.equal(view.invitation, null);
});

test("ambiguous account links are rejected instead of selecting a player", async () => {
  await create();
  await db.doc("clubs/club/members/member-1").update({uid: "user-0"});
  await assert.rejects(getSeasonSquadView({
    db, user: {uid: "user-0"}, body: scope,
  }), /multiple squad members/);
});
