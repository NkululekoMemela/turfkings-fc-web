const test=require("node:test"),assert=require("node:assert/strict"),{fixture}=require("./helpers/playerWorkflowFirestore.cjs");
const {save}=require("../functions/privateSignup.cjs");
const user={uid:"owner",email:"owner@gmail.com",email_verified:true},body={clubId:"club",kind:"pendingSignups",docId:"booking",merge:true,data:{payerUserId:"player",playerId:"player",playerName:"Owner",selectedWeeks:["week"],whatsappNumber:"+27820000000"}};
test("booking saves protect contact copies and publish football selections atomically",async()=>{
 const f=fixture({"clubs/club":{ownerUid:"admin",bookingSettings:{maxPlayers:5}}});await save({db:f.db,user,body});
 assert.equal(f.records.get("clubs/club/pendingSignups/booking").profileOwnerUid,"owner");
 assert.equal(f.records.get("clubs/club/publicPendingSignups/booking").whatsappNumber,undefined);
 assert.deepEqual(f.records.get("clubs/club/publicPendingSignups/booking").selectedWeeks,["week"]);
});
test("another signed-in user cannot overwrite a private booking",async()=>{
 const f=fixture({"clubs/club":{ownerUid:"admin"},"clubs/club/pendingSignups/booking":{profileOwnerUid:"other",payerUserId:"other"}});
 await assert.rejects(save({db:f.db,user,body}),/booking owner/);assert.equal(f.records.has("clubs/club/publicPendingSignups/booking"),false);
});
test("capacity counts private source records even before public projections arrive",async()=>{
 const f=fixture({"clubs/club":{ownerUid:"admin",bookingSettings:{maxPlayers:1}},"clubs/club/matchSignups/other":{playerId:"other",selectedWeeks:["week"]}});
 await assert.rejects(save({db:f.db,user,body}),/is full/);assert.equal(f.records.has("clubs/club/pendingSignups/booking"),false);
});
test("unsigned and camera accounts cannot create booking contact records",async()=>{
 const f=fixture({"clubs/club":{ownerUid:"admin"}});
 for(const identity of [null,{...user,cameraSession:true},{...user,email_verified:false}])await assert.rejects(save({db:f.db,user:identity,body}),/Sign in/);
});
