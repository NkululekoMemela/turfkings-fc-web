import {test,before,after} from "node:test";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {doc,getDoc,setDoc,updateDoc,collection,getDocs} from "firebase/firestore";
let env;
const authenticated=(uid,email=uid+"@gmail.com",extra={})=>env.authenticatedContext(uid,{email,email_verified:true,...extra}).firestore();
before(async()=>{
 env=await initializeTestEnvironment({projectId:"demo-fanm-profile-kit",firestore:{rules:readFileSync("firestore.rules","utf8")}});
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  const data={
   "clubs/club":{ownerUid:"admin",createdByUid:"admin",adminUids:["admin"],adminEmails:["admin@gmail.com"]},
   "clubs/club/members/member":{uid:"owner",email:"owner@gmail.com",role:"player",status:"active",fullName:"Owner",playerId:"player",phoneNumber:"private"},
   "clubs/club/players/player":{sourceMemberId:"member",email:"owner@gmail.com",roles:{player:true,admin:false,captain:false}},
   "clubs/club/playerPhotos/player":{sourceMemberId:"member",email:"owner@gmail.com",photoData:"portrait"},
   "clubs/club/publicMembers/member":{fullName:"Owner",jerseyNumber:0},
   "clubs/club/publicPlayers/player":{fullName:"Owner",jerseyNumber:0},
   "clubs/club/publicPlayerPhotos/player":{photoData:"portrait"},
   "clubs/club/pendingSignups/booking":{profileOwnerUid:"owner",payerUserId:"player",whatsappNumber:"private"},
   "clubs/club/publicPendingSignups/booking":{playerName:"Owner",selectedWeeks:["week"]},
   "matchNumberSheets/sheet":{revision:1,teams:[]},
   "playerPrivacyMigrations/club":{version:1},
  };
  for(const [path,value]of Object.entries(data))await setDoc(doc(db,path),value);
 });
});
after(async()=>{await env?.cleanup();});
test("anonymous users cannot read or edit private profile sources or booking contacts",async()=>{
 const db=env.unauthenticatedContext().firestore();
 for(const path of ["clubs/club/members/member","clubs/club/players/player","clubs/club/playerPhotos/player","clubs/club/pendingSignups/booking"]){
  await assertFails(getDoc(doc(db,path)));await assertFails(updateDoc(doc(db,path),{fullName:"intruder"}));
 }
});
test("other players and fake local admin roles cannot read another player's contact details",async()=>{
 const db=authenticated("other","owner@gmail.com");
 for(const path of ["clubs/club/members/member","clubs/club/players/player","clubs/club/playerPhotos/player","clubs/club/pendingSignups/booking"])await assertFails(getDoc(doc(db,path)));
 await assertFails(getDocs(collection(authenticated("other"),"clubs/club/members")));
});
test("the authenticated owner and actual club administrator can read private records",async()=>{
 for(const db of [authenticated("owner"),authenticated("admin")])for(const path of ["clubs/club/members/member","clubs/club/players/player","clubs/club/playerPhotos/player","clubs/club/pendingSignups/booking"])await assertSucceeds(getDoc(doc(db,path)));
 await assertSucceeds(getDocs(collection(authenticated("admin"),"clubs/club/members")));
});
test("public football projections remain readable but cannot be forged by a player or admin",async()=>{
 const guest=env.unauthenticatedContext().firestore();
 for(const path of ["clubs/club/publicMembers/member","clubs/club/publicPlayers/player","clubs/club/publicPlayerPhotos/player","clubs/club/publicPendingSignups/booking"]){
  await assertSucceeds(getDoc(doc(guest,path)));
  for(const db of [authenticated("owner"),authenticated("admin")])await assertFails(setDoc(doc(db,path),{email:"leak@gmail.com"}));
 }
});
test("a profile owner cannot grant themselves admin rights or swap the bound account UID",async()=>{
 const db=authenticated("owner");
 await assertFails(updateDoc(doc(db,"clubs/club/members/member"),{role:"admin"}));
 await assertFails(updateDoc(doc(db,"clubs/club/members/member"),{uid:"other"}));
 await assertFails(updateDoc(doc(db,"clubs/club/players/player"),{roles:{admin:true}}));
});
test("number sheets and migration records have no bootstrap write bypass",async()=>{
 for(const db of [authenticated("owner"),authenticated("admin")]){
  await assertFails(setDoc(doc(db,"matchNumberSheets/sheet"),{revision:99}));
  await assertFails(setDoc(doc(db,"matchNumberSheets/sheet/revisions/99"),{revision:99}));
  await assertFails(getDoc(doc(db,"playerPrivacyMigrations/club")));
  await assertFails(setDoc(doc(db,"playerPrivacyMigrations/club"),{version:99}));
 }
});
test("camera and unverified sessions cannot open private player details",async()=>{
 await assertFails(getDoc(doc(authenticated("owner","owner@gmail.com",{email_verified:false}),"clubs/club/members/member")));
 await assertFails(getDoc(doc(authenticated("owner","owner@gmail.com",{cameraSession:true,dataScope:"official"}),"clubs/club/members/member")));
});
test("number ownership and transfers cannot bypass server transactions",async()=>{
 for(const db of [authenticated("owner"),authenticated("admin")]){
  await assertFails(updateDoc(doc(db,"clubs/club/members/member"),{jerseyNumber:10}));
  await assertFails(updateDoc(doc(db,"clubs/club/players/player"),{jerseyNumber:10}));
  for(const kind of ["numberReservations","numberOffers","numberQuotes"]){
   await assertFails(setDoc(doc(db,`clubs/club/${kind}/forged`),{memberId:"member",status:"completed"}));
   await assertFails(getDoc(doc(db,`clubs/club/${kind}/forged`)));
  }
 }
 await assertFails(updateDoc(doc(authenticated("other"),"clubs/club"),{homeColor:"#ff0000",currency:"USD"}));
});
