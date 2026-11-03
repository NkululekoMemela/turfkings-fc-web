const test=require("node:test"),assert=require("node:assert/strict");
const privacy=require("../functions/playerPrivacy.cjs"),{fixture}=require("./helpers/playerWorkflowFirestore.cjs");
const user={uid:"owner",email:"owner@gmail.com",email_verified:true};
const member={uid:"owner",email:user.email,fullName:"Alex Player",shortName:"Ace",playerId:"ace",role:"player",status:"active",whatsappNumber:"+27820000000",phoneNumber:"+27820000000",jerseyNumber:8};
const initial={"clubs/club":{ownerUid:"admin"},"clubs/club/members/member":member,"clubs/club/players/ace":{fullName:"Alex Player",sourceMemberId:"member",email:user.email}};
test("private membership ownership requires a verified session and a matching bound UID",()=>{
 assert.equal(privacy.owns(member,null),false);assert.equal(privacy.owns(member,{...user,email_verified:false}),false);
 assert.equal(privacy.owns(member,{...user,uid:"other"}),false);assert.equal(privacy.owns({...member,uid:""},user),true);
 assert.equal(privacy.owns(member,{...user,cameraSession:true}),false);
});
test("public football projections exclude all contact, auth and arbitrary nested fields",()=>{
 for(const kind of ["members","players","playerPhotos","pendingSignups","matchSignups"]){
  const result=privacy.projection(kind,{...member,email:user.email,phoneNumber:"private",whatsappNumber:"private",effectiveWhatsappNumber:"private",providerData:[{email:user.email}],uid:"owner",platformIdentityUid:"owner",secret:{email:user.email}});
  for(const key of ["email","phoneNumber","whatsappNumber","effectiveWhatsappNumber","providerData","uid","platformIdentityUid","secret"])assert.equal(Object.hasOwn(result,key),false,kind+":"+key);
 }
 assert.equal(privacy.publicId("old@gmail.com").includes("@"),false);
 assert.equal(privacy.projection("matchSignups",{payerUserId:"old@gmail.com"}).payerUserId,undefined);
});
test("signed-out and wrong-account profile loads and saves cannot read or change the member",async()=>{
 const f=fixture(initial),body={action:"load",clubId:"club",memberId:"member"};
 await assert.rejects(privacy.handle({db:f.db,user:null,body}),/does not belong/);
 await assert.rejects(privacy.handle({db:f.db,user:{...user,uid:"other"},body}),/does not belong/);
 const save={...body,action:"save",fingerprint:privacy.profileFingerprint(member),draft:{fullName:"Hacked",shortName:"Hacked",jerseyNumber:1}};
 await assert.rejects(privacy.handle({db:f.db,user:{...user,uid:"other"},body:save}),/Sign in as/);
 assert.equal(f.records.get("clubs/club/members/member").fullName,"Alex Player");
});
test("profile saves are atomic, preserve history aliases and cannot inject roles or sign-in identity",async()=>{
 const existing={...member,jerseyNumber:0};
 const f=fixture({...initial,"clubs/club/members/member":existing,"clubs/club":{ownerUid:"admin",homeColor:"Red",awayColor:"Blue"}});
 await privacy.handle({db:f.db,user,body:{action:"save",clubId:"club",memberId:"member",fingerprint:privacy.profileFingerprint(existing),draft:{fullName:"Alex New",shortName:"Ace",jerseyNumber:"0",whatsappNumber:"+27821111111",ownsNumberedBib:"yes",bibColor:"Red",role:"admin",email:"attacker@gmail.com",uid:"attacker"}}});
 const saved=f.records.get("clubs/club/members/member"),publicMember=f.records.get("clubs/club/publicMembers/member");
 assert.equal(saved.role,"player");assert.equal(saved.uid,"owner");assert.equal(saved.email,user.email);assert.equal(saved.jerseyNumber,0);
 assert.ok(saved.profileNameAliases.includes("Alex Player"));assert.equal(publicMember.jerseyNumber,0);assert.equal(publicMember.email,undefined);
 assert.equal(f.records.get("clubs/club/publicPlayers/ace").email,undefined);
});
test("a stale profile fingerprint prevents overwriting a concurrent edit",async()=>{
 const f=fixture({...initial,"clubs/club/members/member":{...member,bibColor:"Blue"}});
 await assert.rejects(privacy.handle({db:f.db,user,body:{action:"save",clubId:"club",memberId:"member",fingerprint:privacy.profileFingerprint(member),draft:{fullName:"Alex New",shortName:"Ace",jerseyNumber:2}}}),/changed elsewhere/);
 assert.equal(f.records.has("clubs/club/publicMembers/member"),false);
});
test("public projection triggers reread current data and remove deleted source records",async()=>{
 const f=fixture({...initial,"clubs/club/publicMembers/member":{fullName:"Stale",email:"leaked"}});
 await privacy.projectDocument(f.db,"members",f.ref("clubs/club/members/member"));
 assert.equal(f.records.get("clubs/club/publicMembers/member").email,undefined);
 f.records.delete("clubs/club/members/member");await privacy.projectDocument(f.db,"members",f.ref("clubs/club/members/member"));
 assert.equal(f.records.has("clubs/club/publicMembers/member"),false);
});

test("sign-in binding uses the verified member record, preserves existing IDs and rejects another account",async()=>{
 const f=fixture(initial);const result=await privacy.handle({db:f.db,user,body:{action:"bind",clubId:"club",memberId:"member",role:"admin"}});
 assert.equal(result.playerId,"ace");assert.equal(f.records.get("clubs/club/players/ace").roles.admin,false);
 await assert.rejects(privacy.handle({db:f.db,user:{...user,uid:"other"},body:{action:"bind",clubId:"club",memberId:"member"}}),/does not belong/);
});
