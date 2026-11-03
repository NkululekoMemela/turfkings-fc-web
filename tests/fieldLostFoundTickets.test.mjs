import {test, after} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const {operate} = require("../functions/fieldLostFoundService.js");
const app = admin.initializeApp({
  projectId: "demo-fanm-lost-found",
}, "lost-found-ticket-tests");
const db = app.firestore();
const venueId = "ticket-workflow-field";
const owner = {uid: "ticket-owner"};
const player = {uid: "ticket-player"};
const referee = {uid: "ticket-referee"};
const call = (user, action, details = {}) =>
  operate({db, user, body: {venueId, action, ...details}});
await db.doc(`leagueVenues/${venueId}`).set({ownerUid: owner.uid});
await db.doc(`leagueVenues/${venueId}/staff/${referee.uid}`).set({
  status: "active", role: "referee", isAdministrator: true,
});
after(() => app.delete());

test("referees cannot see inventory or respond, even with the admin flag", async () => {
  assert.equal((await call(referee, "view")).canManage, false);
  await assert.rejects(call(referee, "respond", {
    claimId: "anything", outcome: "not_found",
  }), /admin team/);
});

test("guided footwear reports require size", async () => {
  await assert.rejects(call(player, "claim", {
    description: "Football boots", details: "Name written inside",
    itemType: "Footwear", colour: "Black",
    place: "Changing room", date: "2026-10-05",
  }), /item questions/);
});

test("tickets stay open after an apology and cannot close before a reply", async () => {
  const claim = await call(player, "claim", {
    description: "Football boots", details: "Name written inside",
    itemType: "Footwear", colour: "Black", size: "UK 8",
    specifics: "White laces", place: "Changing room", date: "2026-10-05",
  });
  await assert.rejects(call(owner, "close", {claimId: claim.id}), /Respond/);
  assert.equal((await call(owner, "summary")).openCount, 1);
  await call(owner, "respond", {claimId: claim.id, outcome: "not_found"});
  const view = await call(player, "view");
  assert.equal(view.items.length, 0);
  assert.equal(view.claims[0].status, "responded");
  assert.match(view.claims[0].response, /Sorry/);
  assert.match(view.claims[0].response, /look around/);
  assert.equal(view.claims[0].open, true);
  assert.equal((await call(owner, "summary")).openCount, 1);
  await call(owner, "close", {claimId: claim.id});
  assert.equal((await call(owner, "summary")).openCount, 0);
  assert.equal((await call(player, "view")).claims[0].open, false);
});

test("player preview never receives the private inventory", async () => {
  const view = await call(owner, "view", {asPlayer: true});
  assert.equal(view.canManage, false);
  assert.deepEqual(view.items, []);
});
