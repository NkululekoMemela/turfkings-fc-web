const {test}=require("node:test");
const assert=require("node:assert/strict");
const {manageFanmOperations}=require("../functions/fanmOperations.cjs");
test("city reservations prevent double commitments and release stock",async()=>{
 const fixtureId="a".repeat(64), other="b".repeat(64);
 const records=new Map([fixtureId,other].map(id=>["clubChallengeMatches/"+id,{instigated:true,status:"accepted",home:{name:"A"},away:{name:"B"},venue:"Arena"}]));
 const doc=path=>({path,collection:key=>collection(path+"/"+key),get:async()=>({data:()=>records.get(path)})});
 const collection=path=>({doc:key=>doc(path+"/"+key)});
 const db={doc,collection,runTransaction:async work=>{
   const writes=[];
   const result=await work({get:r=>r.get(),set:(r,data)=>writes.push(()=>records.set(r.path,data)),
     update:(r,data)=>writes.push(()=>records.set(r.path,{...records.get(r.path),...data})),create:()=>{}});
   writes.forEach(write=>write());return result;
 }};
 const run=(action,body)=>manageFanmOperations({db,body:{action,...body},user:{uid:"director",email_verified:true,email:"nkululekolerato@gmail.com"},
   admin:{firestore:{FieldValue:{serverTimestamp:()=>0}}},fail:message=>{throw Error(message);}});
 const rows=[{color:"blue",number:1,quantity:2}];
 await run("operationsCountBibs",{city:"Cape Town",stock:rows,revision:0});
 await run("operationsReserveBibs",{city:"Cape Town",fixtureId,rows,revision:1});
 await assert.rejects(run("operationsReserveBibs",{city:"Cape Town",fixtureId:other,rows,revision:2}),/not have enough stock/);
 await run("operationsCountBibs",{city:"Durban",stock:rows,revision:0});
 await assert.rejects(run("operationsReserveBibs",{city:"Durban",fixtureId,rows,revision:1}),/other city/);
 await run("operationsReleaseBibs",{city:"Cape Town",fixtureId,revision:2});
 await run("operationsReserveBibs",{city:"Cape Town",fixtureId:other,rows,revision:3});
 assert.equal(records.get("fanmOperations/main/cityBibs/durban").stock[0].quantity,2);
});
