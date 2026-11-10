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
      submittedAtMs: Date.parse("2025-12-31T09:00:00+02:00"),
      kitConfirmed:true,
      kitNumbers:Object.fromEntries(selected.map(p=>[p.sourcePlayerId,p.jerseyNumber])),
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
  batch.set(db.doc("leagueVenues/field-one/bibHireConfig/stock"),{revision:1,confirmedAtMs:1,stock:["Blue","Orange"].flatMap(color=>[1,2,3,4,5,6].map(number=>({color,number,quantity:1})))});
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
        status: "active", fullName: `Player ${i}`,jerseyNumber:i,ownsNumberedBib:true,bibColor:clubId===clubs[0]?"Blue":"Orange",
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

async function request(uid = "referee", headers = {authorization: "Bearer test"}, confirmed = true, extra = {}) {
  let status = 200;
  let body;
  const res = {
    status(value) {status = value; return this;},
    json(value) {body = value; return this;},
  };
  await approvalHandler({
    method: "POST", headers,
    body: {venueId: "field-one", seasonId: "season-one", fixtureId: "fixture-one", earlyStartConfirmed: confirmed, earlyStartReason:confirmed?"Manager moved kickoff for pitch availability":"",...extra},
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

test("Unpaid player is excluded and the remaining five can start", async () => {
  await squadRef("club-a").update({"entries.member-1.paymentStatus": "pending"});
  const result=await approved();
  assert.equal(result.squads["club-a"].length,5);
  assert.equal(result.squads["club-a"].some(player=>player.memberId==="member-1"),false);
});

test("Relinked player is excluded and the remaining five can start", async () => {
  await db.doc("clubs/club-a/members/member-1").update({playerId: "player-2"});
  const result=await approved();
  assert.equal(result.squads["club-a"].length,5);
  assert.equal(result.squads["club-a"].some(player=>player.memberId==="member-1"),false);
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

test("Future dates require this fixture's explicit Official confirmation", async () => {
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
  assert.equal((await request("referee", {authorization:"Bearer test"}, false)).status, 400);
  for (const clubId of clubs) await confirmFormation(clubId);
  await approved();
  assert.notEqual((await db.doc(venuePath).get()).data().league.activeSeason.allowEarlyStarts, true);
});

test("A club cannot start a second fixture while it is playing", async () => {
  await db.doc(venuePath).update({
    "league.activeSeason.liveMatches.other": {status: "live", clubAId: clubs[0], clubBId: "another-club"},
  });
  assert.equal((await request()).status, 400);
});

test("Only fixtures with an approved shared kickoff can start beside another fixture", async () => {
  const other = {fixtureId: "other", status: "live", clubAId: "other-a", clubBId: "other-b"};
  await db.doc(venuePath).update({"league.activeSeason.liveMatches.other": other});
  assert.equal((await request()).status, 400);
  const season = (await db.doc(venuePath).get()).data().league.activeSeason;
  const kickoff = season.fixtures[0].scheduledLocal;
  await db.doc(venuePath).update({"league.activeSeason.fixtures": [
    {...season.fixtures[0], parallelKickoff:kickoff,pitchNumber:1},
    {id:"other", matchDayId:"day-one", scheduledLocal:kickoff,parallelKickoff:kickoff,pitchNumber:2},
  ]});
  const result = await request();
  assert.equal(result.status, 200, result.body?.error);
  const approval = (await db.doc(`${venuePath}/seasons/season-one/startApprovals/${result.body.approvalId}`).get()).data();
  assert.deepEqual(approval.liveMatchesAtApproval, {other});
});

for (const role of ["field_manager", "assistant_manager", "field_assistant", "other_staff", "referee"]) {
  test(`Approved ${role} can request match start without administrator powers`, async () => {
    await db.doc(`${venuePath}/staff/standin`).set({role, status: "active", isAdministrator: false});
    const result = await request("standin");
    assert.equal(result.status, 200, result.body?.error);
    const receipt = (await db.doc(`${venuePath}/seasons/season-one/startApprovals/${result.body.approvalId}`).get()).data();
    assert.equal(receipt.actorUid, "standin");
  });
}
for (const role of ["club_rep", "spectator", "club_member"]) {
  test(`${role} cannot request match start`, async () => {
    await db.doc(`${venuePath}/staff/standin`).set({role, status: "active", isAdministrator: true});
    assert.equal((await request("standin")).status, 400);
  });
}
test("Pending Field staff cannot request match start", async () => {
  await db.doc(`${venuePath}/staff/standin`).set({role: "field_assistant", status: "pending", isAdministrator: false});
  assert.equal((await request("standin")).status, 400);
});


test("the approved endpoint creates the shared referee booth atomically without client writes", async () => {
  await db.doc(venuePath).update({"league.activeSeason.clubIds":[...clubs,"club-c"]});
  const extra={startRequested:true,deviceId:"referee-phone-one",requestId:"start-request-one"};
  const result=await request("referee",{authorization:"Bearer test"},true,extra);
  assert.equal(result.status,200,result.body?.error);
  assert.equal(result.body.match.liveDocumentId,"fixture-one");
  const live=(await db.doc(`${venuePath}/seasons/season-one/matches/fixture-one`).get()).data();
  assert.equal(live.awaitingKitVerification,true);
  assert.equal(live.running,false);
  assert.equal(live.liveMatchController.uid,"referee");
  assert.equal(live.liveMatchController.deviceId,extra.deviceId);
  assert.equal(Object.keys(live.paidSquads).length,2);
  assert.equal(Object.keys(live.confirmedLineupSnapshot).length,2);
  assert.equal((await db.doc(`${venuePath}/seasons/season-one/startApprovals/${result.body.approvalId}`).get()).data().used,true);
  const retry=await request("referee",{authorization:"Bearer test"},true,extra);
  assert.equal(retry.status,200,retry.body?.error);
  assert.equal((await db.collection(`${venuePath}/actionLog`).get()).size,1);
  assert.equal((await db.collection(`${venuePath}/seasons/season-one/matches`).get()).size,1);
});

test("the server start rejects a spectator and never writes an unapproved booth", async () => {
  const result=await request("visitor",{authorization:"Bearer test"},true,{
    startRequested:true,deviceId:"spectator-phone",requestId:"forged-start-one"});
  assert.equal(result.status,400);
  assert.equal((await db.collection(`${venuePath}/seasons/season-one/matches`).get()).size,0);
});

const kickoffRequest = suffix => ({startRequested:true,deviceId:"retry-phone-one",requestId:`retry-request-${suffix}`});
async function permitThreeClubs() {
  await db.doc(venuePath).update({"league.activeSeason.clubIds":[...clubs,"club-c"]});
}
function orphanedLineup() {
  return {venueId:"field-one",seasonId:"season-one",fixtureId:"fixture-one",
    teamAId:"club-a",teamBId:"club-b",standbyId:"club-c",status:"live",
    gameFormat:"5_V_5",currentMatchNo:1,awaitingKitVerification:true,running:false,
    isFinished:false,timeUp:false,clockPhase:"first_half",goalsA:0,goalsB:0,
    events:[],currentEvents:[],secondsLeft:2400,startedByUid:"referee"};
}
test("an existing unstarted fixture document no longer causes ALREADY_EXISTS at early kickoff",async()=>{
  await permitThreeClubs();
  const ref=db.doc(`${venuePath}/seasons/season-one/matches/fixture-one`);
  const previous=orphanedLineup();
  await ref.set(previous);
  await db.doc(venuePath).update({
    "league.activeSeason.matchDays":[{
      id:"day-one",dateLocal:"2099-01-01",opensAtMs:Date.parse("2099-01-01T00:00:00+02:00"),
      status:"scheduled",fixtureIds:["fixture-one"]}],
    "league.activeSeason.fixtures":[{
      id:"fixture-one",status:"scheduled",matchDayId:"day-one",clubAId:"club-a",clubBId:"club-b",
      scheduledLocal:"2099-01-01T18:00"}],
  });
  const result=await request("referee",{authorization:"Bearer test"},true,kickoffRequest("draft"));
  assert.equal(result.status,200,result.body?.error);
  assert.equal(result.body.match.status,"live");
  const live=(await ref.get()).data();
  assert.equal(live.awaitingKitVerification,true);
  assert.equal(live.liveMatchController.uid,"referee");
  const history=await ref.collection("startRecoveryHistory").get();
  assert.equal(history.size,1);
  assert.deepEqual(history.docs[0].data().previousMatch,previous);
});
test("the same unstarted recovery still requires an explicit outside-schedule confirmation",async()=>{
  await permitThreeClubs();
  const ref=db.doc(`${venuePath}/seasons/season-one/matches/fixture-one`);
  await ref.set(orphanedLineup());
  const result=await request("referee",{authorization:"Bearer test"},false,kickoffRequest("no-confirm"));
  assert.equal(result.status,400);
  assert.match(result.body.error,/Confirm Official/);
  assert.deepEqual((await ref.get()).data(),orphanedLineup());
});
test("an orphaned running match resumes without erasing a goal or taking the referee’s device",async()=>{
  await permitThreeClubs();
  const first=await request("referee",{authorization:"Bearer test"},true,kickoffRequest("played"));
  assert.equal(first.status,200,first.body?.error);
  const ref=db.doc(`${venuePath}/seasons/season-one/matches/fixture-one`);
  await ref.update({awaitingKitVerification:false,running:true,secondsLeft:381,goalsA:2,
    currentEvents:[{id:"goal-one",type:"goal"}]});
  const before=(await ref.get()).data();
  await db.doc(venuePath).update({"league.activeSeason.liveMatches":{}});
  const result=await request("creator",{authorization:"Bearer test"},false,{
    ...kickoffRequest("reopen"),deviceId:"different-phone-two"});
  assert.equal(result.status,200,result.body?.error);
  assert.equal(result.body.match.scoreA,2);
  assert.deepEqual((await ref.get()).data(),before);
  assert.equal((await db.doc(venuePath).get()).data().league.activeSeason.liveMatches["fixture-one"].status,"live");
});
test("a completed nil-nil orphan cannot be overwritten by a fresh kickoff",async()=>{
  await permitThreeClubs();
  const ref=db.doc(`${venuePath}/seasons/season-one/matches/fixture-one`);
  const completed={...orphanedLineup(),status:"completed",isFinished:true};
  await ref.set(completed);
  const result=await request("referee",{authorization:"Bearer test"},true,kickoffRequest("finished"));
  assert.equal(result.status,400);
  assert.match(result.body.error,/saved result/);
  assert.deepEqual((await ref.get()).data(),completed);
});
test("an unstarted legacy singleton can be refreshed without the old availability lock",async()=>{
  await permitThreeClubs();
  const ref=db.doc(`${venuePath}/seasons/season-one/matches/current`);
  await ref.set(orphanedLineup());
  await db.doc(venuePath).update({"league.activeSeason.liveMatches":{
    "fixture-one":{fixtureId:"fixture-one",liveDocumentId:"current",status:"live",clubAId:"club-a",clubBId:"club-b"}}});
  const result=await request("referee",{authorization:"Bearer test"},true,kickoffRequest("legacy"));
  assert.equal(result.status,200,result.body?.error);
  assert.equal(result.body.match.liveDocumentId,"current");
  assert.equal((await ref.get()).data().awaitingKitVerification,true);
  assert.equal((await ref.collection("startRecoveryHistory").get()).size,1);
});
test("simultaneous starts open one fixture and do not replace the first referee",async()=>{
  await permitThreeClubs();
  const replies=await Promise.all([
    request("referee",{authorization:"Bearer test"},true,kickoffRequest("race-one")),
    request("creator",{authorization:"Bearer test"},true,{...kickoffRequest("race-two"),deviceId:"race-phone-two"}),
  ]);
  for(const result of replies)assert.equal(result.status,200,result.body?.error);
  const matches=await db.collection(`${venuePath}/seasons/season-one/matches`).get();
  assert.equal(matches.size,1);
  assert.equal((await db.collection(`${venuePath}/actionLog`).get()).size,1);
  assert.equal((await matches.docs[0].ref.collection("startRecoveryHistory").get()).size,0);
});

test("a manager-deleted return leg launches again without deleting the first leg result",async()=>{
  await permitThreeClubs();
  const ref=db.doc(`${venuePath}/seasons/season-one/matches/fixture-one`);
  const previous={...orphanedLineup(),status:"completed",isFinished:true,completedAtMs:1000,goalsA:3,goalsB:2};
  await ref.set(previous);
  const fixture=(await db.doc(venuePath).get()).data().league.activeSeason.fixtures[0];
  const firstLeg={fixtureId:"first-leg",status:"completed",teamAId:"club-b",teamBId:"club-a",goalsA:1,goalsB:0};
  await db.doc(venuePath).update({"league.activeSeason.results":[firstLeg]});
  await db.doc(`${venuePath}/matchReversals/old-manager-deletion`).set({seasonId:"season-one",fixtureId:"fixture-one",
    actorUid:"creator",reason:"Replay this incorrect result",at:admin.firestore.Timestamp.fromMillis(2000),
    result:{fixtureId:"fixture-one",goalsA:3,goalsB:2},fixture:{...fixture,status:"completed"}});
  const result=await request("referee",{authorization:"Bearer test"},true,kickoffRequest("return-leg"));
  assert.equal(result.status,200,result.body?.error);
  const live=(await ref.get()).data();
  assert.equal(live.status,"live");assert.equal(live.goalsA,0);assert.equal(live.goalsB,0);
  assert.equal(live.awaitingKitVerification,true);
  const history=await ref.collection("startRecoveryHistory").get();
  assert.equal(history.size,1);assert.deepEqual(history.docs[0].data().previousMatch,previous);
  assert.deepEqual((await db.doc(venuePath).get()).data().league.activeSeason.results,[firstLeg]);
});

test("deleting an archived result clears and archives its canonical document and preserves other fixtures",async()=>{
  await permitThreeClubs();
  const fixture=(await db.doc(venuePath).get()).data().league.activeSeason.fixtures[0];
  const recorded={fixtureId:"fixture-one",status:"completed",matchNo:2,teamAId:"club-a",teamBId:"club-b",goalsA:3,goalsB:2};
  const firstLeg={fixtureId:"first-leg",status:"completed",matchNo:1,teamAId:"club-b",teamBId:"club-a",goalsA:1,goalsB:0};
  const ref=db.doc(`${venuePath}/seasons/season-one/matches/fixture-one`);
  const previous={...orphanedLineup(),status:"completed",completedAtMs:1000,goalsA:3,goalsB:2};
  await ref.set(previous);
  const otherRef=db.doc(`${venuePath}/seasons/season-one/matches/current`);
  const other={fixtureId:"first-leg",status:"completed",goalsA:1,goalsB:0};
  await otherRef.set(other);
  const firstEvent={id:"first-goal",fixtureId:"first-leg",matchNo:2};
  await db.doc(venuePath).update({"league.activeSeason.fixtures":[{...fixture,status:"completed"}],
    "league.activeSeason.results":[firstLeg,recorded],"league.activeSeason.liveMatches":{},
    "league.activeSeason.allEvents":[firstEvent,{id:"return-goal",fixtureId:"fixture-one",matchNo:2}]});
  let status=200,body;
  await require("../functions/fieldResultReversal.cjs").reversalHandler({method:"POST",headers:{authorization:"Bearer test"},
    body:{venueId:"field-one",seasonId:"season-one",fixtureId:"fixture-one",reason:"Replay incorrect return leg"}},
    {status(code){status=code;return this;},json(value){body=value;return this;}},
    {db,verifyToken:async()=>({uid:"creator",email_verified:true})});
  assert.equal(status,200,body?.error);
  assert.equal((await ref.get()).exists,false);
  assert.deepEqual((await otherRef.get()).data(),other);
  const season=(await db.doc(venuePath).get()).data().league.activeSeason;
  assert.deepEqual(season.results,[firstLeg]);assert.deepEqual(season.allEvents,[firstEvent]);
  assert.equal(season.fixtures[0].status,"scheduled");
  const audits=await db.collection(`${venuePath}/matchReversals`).get();
  assert.equal(audits.size,1);
  assert.deepEqual(audits.docs[0].data().previousMatches,[{documentId:"fixture-one",match:previous}]);
  const result=await request("referee",{authorization:"Bearer test"},true,kickoffRequest("deleted-canonical"));
  assert.equal(result.status,200,result.body?.error);
});
