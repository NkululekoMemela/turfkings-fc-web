const test=require("node:test"),assert=require("node:assert/strict");
const privacy=require("../functions/playerPrivacy.cjs"),{fixture}=require("./helpers/playerWorkflowFirestore.cjs");
const user={uid:"owner",email:"owner@gmail.com",email_verified:true};
const member={uid:"owner",email:user.email,fullName:"Alex Player",shortName:"Ace",playerId:"ace",role:"player",status:"active",whatsappNumber:"+27820000000",phoneNumber:"+27820000000",jerseyNumber:8};
const initial={"clubs/club":{ownerUid:"admin",homeColor:"#15803d",awayColor:"#ffffff"},"clubs/club/members/member":member,"clubs/club/players/ace":{fullName:"Alex Player",sourceMemberId:"member",email:user.email}};
test("profile stores two jerseys and at most two numbered bibs",async()=>{
 const f=fixture(initial);await privacy.handle({db:f.db,user,body:{action:"save",clubId:"club",memberId:"member",fingerprint:privacy.profileFingerprint(member),draft:{...member,ownsHomeShirt:true,ownsAwayShirt:true,homeShirtColor:"#15803d",awayShirtColor:"#ffffff",ownsNumberedBib:"yes",bibColor:"#15803d",additionalBibs:["#ffffff"]}}});
 const saved=f.records.get("clubs/club/members/member");assert.equal(saved.ownsHomeShirt,true);assert.equal(saved.awayShirtColor,"#ffffff");assert.deepEqual(saved.additionalBibs,["#ffffff"]);assert.equal(f.records.get("clubs/club/publicPlayers/ace").homeShirtColor,"#15803d");
});
test("server rejects a third numbered bib, extras without primary ownership and unsafe jersey colours",async()=>{
 for(const patch of [{additionalBibs:["#2563eb","#ffffff"]},{ownsNumberedBib:false,additionalBibs:["#2563eb"]},{homeShirtColor:"url(unsafe)"}]){
 const f=fixture(initial);await assert.rejects(privacy.handle({db:f.db,user,body:{action:"save",clubId:"club",memberId:"member",fingerprint:privacy.profileFingerprint(member),draft:{...member,ownsNumberedBib:"yes",bibColor:"#f97316",...patch}}}));assert.equal(f.records.get("clubs/club/members/member").jerseyNumber,8);
 }
});
