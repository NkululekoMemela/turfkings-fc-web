const test=require("node:test"),assert=require("node:assert/strict");
const service=require("../functions/matchPlayerNumbers.cjs"),{fixture}=require("./helpers/playerWorkflowFirestore.cjs");
const user={uid:"ref",email:"ref@gmail.com",email_verified:true};
const team=(id,key,number,extra={})=>({id,label:id,players:[{key,name:key,aliases:[key],number,...extra}]});
const scope={environment:"official",clubId:"club",seasonId:"S1"};
const body={scope,matchKey:"match-1",expectedRevision:0,teams:[team("A","one",0),team("B","two",0)]};
const initial={"clubs/club":{ownerUid:"admin"},"clubs/club/members/ref":{uid:"ref",email:user.email,role:"referee",status:"active"},"clubs/club/state/main":{state:{activeSeasonId:"S1",seasons:[{seasonId:"S1",liveMatchDraft:{currentMatch:{teamAId:"A",teamBId:"B"},controller:{uid:"ref"}}}]}}};
test("unsigned, camera and wrong-role users cannot verify number sheets",async()=>{
 for(const identity of [null,{...user,email_verified:false},{...user,cameraSession:true},{...user,uid:"spectator"}]){
  const f=fixture(initial);await assert.rejects(service.save({db:f.db,user:identity,body}));assert.equal([...f.records.keys()].some(key=>key.startsWith("matchNumberSheets/")),false);
 }
});
test("referee verification persists null exceptions, real zero and append-only revisions",async()=>{
 const f=fixture(initial);const input={...body,teams:[team("A","one",0),team("B","two",null,{noNumberReason:"inside_out"})]};
 const first=await service.save({db:f.db,user,body:input,now:100});assert.equal(first.revision,1);assert.equal(first.teams[0].players[0].number,0);assert.equal(first.teams[1].players[0].number,null);
 const second=await service.save({db:f.db,user,body:{...input,expectedRevision:1,teams:[team("A","one",8),team("B","two",4)]},now:200});
 assert.equal(second.revision,2);assert.equal(f.records.get(`matchNumberSheets/${first.sheetId}/revisions/1`).teams[0].players[0].number,0);
 assert.equal(f.records.get(`matchNumberSheets/${first.sheetId}/revisions/2`).teams[0].players[0].number,8);
});
test("stale revisions cannot overwrite a different referee's correction",async()=>{
 const f=fixture(initial);await service.save({db:f.db,user,body});await assert.rejects(service.save({db:f.db,user,body}),/another device/);
});
test("duplicate visible numbers and unapproved blank shirts cannot be verified",async()=>{
 const f=fixture(initial);
 await assert.rejects(service.save({db:f.db,user,body:{...body,teams:[{id:"A",label:"A",players:[...team("A","one",8).players,...team("A","three","08").players]},team("B","two",1)]}}),/#8/);
 await assert.rejects(service.save({db:f.db,user,body:{...body,teams:[team("A","one",null),team("B","two",4)]}}),/Verify/);
});
test("Field club representatives cannot act as staff, and a staff member must control the match",async()=>{
 const fieldScope={environment:"official",venueId:"field",seasonId:"S1"};
 const f=fixture({"leagueVenues/field":{ownerUid:"field-admin",league:{activeSeason:{id:"S1"}}},"leagueVenues/field/seasons/S1/matches/current":{currentMatch:{teamAId:"A",teamBId:"B"},liveMatchController:{uid:"ref"}}});
 await assert.rejects(service.save({db:f.db,user,body:{...body,scope:fieldScope}}),/active Field staff/);
 f.records.set("leagueVenues/field/staff/ref",{status:"active",role:"referee"});
 assert.equal((await service.save({db:f.db,user,body:{...body,scope:fieldScope}})).revision,1);
 f.records.get("leagueVenues/field/seasons/S1/matches/current").liveMatchController.uid="other";
 await assert.rejects(service.save({db:f.db,user,body:{...body,scope:fieldScope,expectedRevision:1}}),/Take over/);
});
test("Practice cannot write an Official sheet, and club/season identities never share sheet IDs",async()=>{
 const f=fixture(initial);await assert.rejects(service.save({db:f.db,user,body:{...body,scope:{...scope,environment:"practice"}}}),/Practice/);
 assert.notEqual(service.sheetId(scope,"match-1"),service.sheetId({...scope,clubId:"other"},"match-1"));
 assert.notEqual(service.sheetId(scope,"match-1"),service.sheetId({...scope,seasonId:"S2"},"match-1"));
});

test("a forged controller pointer cannot grant a normal player referee powers",async()=>{
 const f=fixture({...initial,"clubs/club/members/ref":{uid:"ref",email:user.email,role:"player",status:"active"}});
 await assert.rejects(service.save({db:f.db,user,body}),/authenticated referee/);
});
