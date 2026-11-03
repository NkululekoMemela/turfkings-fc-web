const test=require("node:test"),assert=require("node:assert/strict"),{fixture}=require("./helpers/playerWorkflowFirestore.cjs"),privacy=require("../functions/playerPrivacy.cjs"),numbers=require("../functions/clubNumbers.cjs");
const user={uid:"player",email:"player@gmail.com",email_verified:true};
const member={uid:"player",email:user.email,fullName:"Player",shortName:"Player",playerId:"player",jerseyNumber:7,status:"active"};
const initial={"clubs/c":{ownerUid:"admin",captainEmail:"captain@gmail.com",homeColor:"#15803d",awayColor:"#ffffff",currency:"ZAR"},"clubs/c/members/m":member,"clubs/c/players/player":{sourceMemberId:"m",email:user.email}};
test("players inherit club colours and cannot replace them with personal overrides",async()=>{
 const f=fixture(initial);await privacy.handle({db:f.db,user,body:{action:"save",clubId:"c",memberId:"m",fingerprint:privacy.profileFingerprint(member),draft:{...member,ownsHomeShirt:true,ownsAwayShirt:true,homeShirtColor:"#ff0000",awayShirtColor:"#0000ff"}}});
 const saved=f.records.get("clubs/c/members/m");assert.equal(saved.homeShirtColor,"#15803d");assert.equal(saved.awayShirtColor,"#ffffff");assert.equal(f.records.get("clubs/c").homeColor,"#15803d");
});
test("only the captain or admin may save traditional colours and currency is preserved",async()=>{
 const f=fixture(initial),body={action:"settings",clubId:"c",homeColor:"#dc2626",awayColor:"#111827"};
 await assert.rejects(numbers.handle({db:f.db,user,body}),/approval/);
 await numbers.handle({db:f.db,user:{uid:"captain",email:"captain@gmail.com",email_verified:true},body});
 assert.equal(f.records.get("clubs/c").homeColor,"#dc2626");assert.equal(f.records.get("clubs/c").currency,"ZAR");
});
test("new bib colours must be selected from the captain's club colours",async()=>{
 const f=fixture(initial);await assert.rejects(privacy.handle({db:f.db,user,body:{action:"save",clubId:"c",memberId:"m",fingerprint:privacy.profileFingerprint(member),draft:{...member,ownsNumberedBib:"yes",bibColor:"#f97316"}}}),/Home or Away/);
});
