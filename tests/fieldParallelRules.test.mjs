import {after, before, test} from "node:test";
import {readFile} from "node:fs/promises";
import {assertFails, assertSucceeds, initializeTestEnvironment} from "@firebase/rules-unit-testing";
import {doc, FieldPath, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch} from "firebase/firestore";

let env;
const root = "leagueVenues/parallel-field";
const seasonId = "parallel-season";
const day = {id:"day", status:"scheduled", fixtureIds:["one","two"], opensAtMs:1};
const fixtures = [
  {id:"one", status:"scheduled", matchDayId:"day", clubAId:"a", clubBId:"b"},
  {id:"two", status:"scheduled", matchDayId:"day", clubAId:"c", clubBId:"d"},
];
const summary = f => ({fixtureId:f.id, liveDocumentId:f.id, status:"live",
  clubAId:f.clubAId, clubBId:f.clubBId, startedByUid:"ref", matchNo:2});
const liveMatches = {one:{...summary(fixtures[0]), matchNo:1}};
const season = {id:seasonId,status:"active",scheduleVersion:1,gameFormat:"6_V_6",
  matchDays:[day],fixtures,clubIds:["a","b","c","d"],liveMatches};
const matchPath = id => `${root}/seasons/${seasonId}/matches/${id}`;
const approvalPath = id => `${root}/seasons/${seasonId}/startApprovals/${id}`;

before(async () => {
  env = await initializeTestEnvironment({projectId:"demo-fanm-parallel-field",
    firestore:{rules:await readFile("firestore.rules","utf8")}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const stamp = Timestamp.fromMillis(10);
    await setDoc(doc(db,root),{id:"parallel-field", ownerUid:"owner", adminUids:["owner"], league:{activeSeason:season}});
    await setDoc(doc(db,`${root}/staff/ref`),{status:"active",role:"referee"});
    await setDoc(doc(db,matchPath("one")),{...liveMatches.one,venueId:"parallel-field",seasonId,boothVersion:1});
    for (const id of ["c","d"]) {
      await setDoc(doc(db,`leagueSeasonSquads/parallel-field~${seasonId}~${id}`),{status:"active",updatedAt:stamp});
    }
    for (const [id, snapshot] of [["fresh",liveMatches],["stale",{}]]) {
      await setDoc(doc(db,approvalPath(id)),{actorUid:"ref",venueId:"parallel-field",seasonId,
        fixtureId:"two",matchDayId:"day",clubAId:"c",clubBId:"d",gameFormat:"6_V_6",
        matchDays:[day],matchDayHistory:[],squads:{},squadVersions:{c:stamp,d:stamp},
        liveMatchesAtApproval:snapshot,used:false,expiresAt:Timestamp.fromMillis(Date.now()+600000)});
    }
  });
});
after(async () => env?.cleanup());

test("second fixture needs a fresh approval, preserves the first and is server-controlled", async () => {
  const db = env.authenticatedContext("ref").firestore();
  const start = (id, changedFirst = false) => {
    const batch = writeBatch(db);
    const venue = doc(db,root);
    batch.update(venue,new FieldPath("league","activeSeason","liveMatches","two"),summary(fixtures[1]),
      "updatedAt",serverTimestamp());
    if (changedFirst) batch.update(venue,
      new FieldPath("league","activeSeason","liveMatches","one","status"),"completed");
    batch.set(doc(db,matchPath("two")),{venueId:"parallel-field",seasonId,
      fixtureId:"two",status:"live",fixtureIndex:1,matchDayIndex:0,teamAId:"c",teamBId:"d",
      currentMatchNo:2,startedByUid:"ref",liveMatchController:{uid:"ref",deviceId:"phone-two"},
      startApprovalId:id,paidSquads:{}});
    batch.update(doc(db,approvalPath(id)),{used:true});
    return batch.commit();
  };
  await assertFails(start("stale"));
  await assertFails(start("fresh", true));
  await assertSucceeds(start("fresh"));
  await assertSucceeds(getDoc(doc(db,matchPath("one"))));
  await assertFails(updateDoc(doc(db,matchPath("two")),{secondsLeft:10}));
});
