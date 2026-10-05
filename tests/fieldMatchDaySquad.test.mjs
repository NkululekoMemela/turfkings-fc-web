import {createRequire} from "node:module";
import {test,before,after,beforeEach} from "node:test";
import assert from "node:assert/strict";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";
const require=createRequire(new URL("../functions/package.json",import.meta.url));
const admin=require("firebase-admin");
const {getFirestore,Timestamp}=require("firebase-admin/firestore");
const {submit,getClubDay}=require("../functions/fieldMatchDaySquad");
const {inviteSeasonMatchDayReplacement}=require("../functions/fieldSeasonSquadService");
const projectId="demo-field-matchday-six";
const app=admin.initializeApp({projectId},"field-matchday-six");
const db=getFirestore(app);
const scope={venueId:"field",seasonId:"season",clubId:"club"};
const body={...scope,matchDayId:"day"};
const user={uid:"captain"};
const ref=db.doc("leagueSeasonSquads/field~season~club");
let environment;
before(async()=>{
  environment=await initializeTestEnvironment({
    projectId,firestore:{rules:"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }"},
  });
});
after(async()=>{await environment?.cleanup();await app.delete();});
beforeEach(async()=>{
  await environment.clearFirestore();
  const batch=db.batch();
  batch.set(db.doc("clubs/club"),{ownerUid:"captain"});
  batch.set(db.doc("clubFieldMemberships/club"),{status:"active",venueId:"field"});
  batch.set(db.doc("leagueVenues/field"),{ownerUid:"field-owner",league:{activeSeason:{
    id:"season",status:"active",gameFormat:"5_V_5",scheduleVersion:1,
    schedulePublishedAtMs:1,clubIds:["club"],
    matchDays:[{id:"day",dateLocal:"2030-10-10",status:"scheduled",fixtureIds:["fixture"]}],
    fixtures:[{id:"fixture",matchDayId:"day",clubAId:"club",clubBId:"opponent",
      scheduledLocal:"2030-10-10T18:00",status:"scheduled"}],
  }}});
  const entries={};
  for(let index=0;index<7;index++){
    const memberId=`member-${index}`,sourcePlayerId=`player-${index}`;
    batch.set(db.doc(`clubs/club/members/${memberId}`),{
      status:"active",playerId:sourcePlayerId,uid:`user-${index}`,
    });
    batch.set(db.doc(`clubs/club/players/${sourcePlayerId}`),{
      status:"active",fullName:`Player ${index}`,
    });
    if(index===6)continue;
    entries[memberId]={memberId,sourcePlayerId,fullName:`Player ${index}`,
      invitationStatus:"accepted",paymentStatus:"paid",currency:"ZAR",
      contributionCents:10000,paidCents:10000,paymentConfirmedByUid:"captain"};
    batch.set(ref.collection("paymentConfirmations").doc(memberId),{
      ...scope,memberId,sourcePlayerId,currency:"ZAR",
      amountCents:10000,confirmedByUid:"captain",
    });
  }
  batch.set(ref,{...scope,version:1,status:"active",updatedAt:Timestamp.now(),entries});
  await batch.commit();
});
const six=Array.from({length:6},(_,index)=>`member-${index}`);

test("only captain/admin sends exactly six",async()=>{
  await assert.rejects(submit({now:Date.parse("2030-10-09T09:00:00+02:00"),db,user:{uid:"outsider"},body:{...body,memberIds:six}}));
  await assert.rejects(submit({now:Date.parse("2030-10-09T09:00:00+02:00"),db,user,body:{...body,memberIds:six.slice(0,5)}}));
  await submit({now:Date.parse("2030-10-09T09:00:00+02:00"),db,user,body:{...body,memberIds:six}});
  const result=await getClubDay({db,user,body});
  assert.equal(result.confirmed,true);
  assert.equal(result.players.length,6);
  assert.equal(Object.hasOwn(result.players[0],"paidCents"),false);
});

test("availability changes invalidate the sent squad",async()=>{
  await submit({now:Date.parse("2030-10-09T09:00:00+02:00"),db,user,body:{...body,memberIds:six}});
  await ref.update({"matchDayAvailability.day.member-0":{status:"unavailable"}});
  const result=await getClubDay({db,user,body});
  assert.equal(result.confirmed,false);
  assert.equal(result.candidates.length,5);
  await assert.rejects(submit({now:Date.parse("2030-10-09T09:00:00+02:00"),db,user,body:{...body,memberIds:six}}));
});

test("agreed fill-in replaces one paid place without adding season money",async()=>{
  await ref.update({"matchDayAvailability.day.member-0":{status:"unavailable"}});
  await inviteSeasonMatchDayReplacement({db,user,body:{
    ...body,originalMemberId:"member-0",memberId:"member-6",
    sourcePlayerId:"player-6",captainConfirmed:true,
  }});
  const ids=[...six.slice(1),"member-6"];
  await submit({now:Date.parse("2030-10-09T09:00:00+02:00"),db,user,body:{...body,memberIds:ids}});
  const result=await getClubDay({db,user,body});
  assert.equal(result.confirmed,true);
  assert.equal(result.players.find(player=>player.memberId==="member-6").isFillIn,true);
  const squad=(await ref.get()).data();
  assert.equal(Object.keys(squad.entries).length,6);
  assert.equal(squad.entries["member-0"].paidCents,10000);
  assert.equal((await ref.collection("paymentConfirmations").doc("member-6").get()).exists,false);
});

test("withdrawn or relinked fill-in invalidates confirmation",async()=>{
  await ref.update({"matchDayAvailability.day.member-0":{status:"unavailable"}});
  await inviteSeasonMatchDayReplacement({db,user,body:{
    ...body,originalMemberId:"member-0",memberId:"member-6",
    sourcePlayerId:"player-6",captainConfirmed:true,
  }});
  await submit({now:Date.parse("2030-10-09T09:00:00+02:00"),db,user,body:{...body,memberIds:[...six.slice(1),"member-6"]}});
  await db.doc("clubs/club/members/member-6").update({playerId:"different"});
  const result=await getClubDay({db,user,body});
  assert.equal(result.confirmed,false);
  assert.equal(result.candidates.length,5);
});


test("production cannot use the staging early-send exception", async()=>{
  const {sendWindow}=require("../functions/fieldMatchDaySquad");
  const day={dateLocal:"2030-10-10"};
  const fixture={scheduledLocal:"2030-10-10T18:00"};
  const early=Date.parse("2030-10-08T12:00:00+02:00");
  assert.equal(sendWindow({
    day,fixture,now:early,testMode:true,projectId:"five-asides-near-me",
  }).sendAllowed,false);
  assert.equal(sendWindow({
    day,fixture,now:early,testMode:true,projectId:"five-asides-near-me-staging",
  }).sendAllowed,true);
  assert.equal(sendWindow({
    day,fixture,now:Date.parse("2030-10-09T00:00:00+02:00"),
    projectId:"five-asides-near-me",
  }).sendAllowed,true);
  assert.equal(sendWindow({
    day,fixture,now:Date.parse("2030-10-10T18:00:00+02:00"),
    projectId:"five-asides-near-me",
  }).sendAllowed,false);
});
