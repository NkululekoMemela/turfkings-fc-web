const test=require('node:test');const assert=require('node:assert/strict');
const {requireProofs}=require('../functions/playerGoogleAccountPolicy.cjs');
const {changePlayerGoogleAccount}=require('../functions/playerGoogleAccountService.js');
const now=1800000000000;
const old={sub:'old-google',email:'old@gmail.com',email_verified:true,aud:'client',iat:now/1000};
const replacement={...old,sub:'new-google',email:'new@gmail.com'};
const firebase={uid:'same-uid',email_verified:true,auth_time:now/1000};
const record={uid:'same-uid',email:'old@gmail.com',providerData:[{providerId:'google.com',uid:'old-google'}]};
const proof=more=>requireProofs({firebase,original:old,replacement,record,requestedEmail:'new@gmail.com',nowSeconds:now/1000,...more});
test('both signed Google identities must match the current account and entered replacement',()=>{
 assert.equal(proof().uid,'same-uid');
 for(const more of [{firebase:{...firebase,auth_time:1}},{replacement:{...replacement,email_verified:false}},{replacement:{...replacement,aud:'another-app'}},{requestedEmail:'typo@gmail.com'},{original:{...old,sub:'someone-else'}},{replacement:old}])assert.throws(()=>proof(more));
});
function fixture({collision=false,syncFailure=false}={}){
 const records=new Map([
  ['clubs/club/members/member',{email:'old@gmail.com',playerId:'player',status:'active'}],
  ['clubs/club/players/player',{email:'old@gmail.com',sourceMemberId:'member'}],
  ['clubs/club',{adminEmails:['old@gmail.com'],captainEmail:'old@gmail.com'}],
 ]);
 const changes=[];let authChanged=false;
 const snapshot=path=>({exists:records.has(path),id:path.split('/').at(-1),ref:ref(path),data:()=>records.get(path)});
 function ref(path){return {path,id:path.split('/').at(-1),get:async()=>snapshot(path),set:async data=>records.set(path,{...records.get(path),...data}),parent:{parent:{collection:name=>({doc:id=>ref(path.split('/').slice(0,-2).join('/')+'/'+name+'/'+id)})}}};}
 const query=(collection,group)=>({where(field,op,value){return {get:async()=>({docs:[...records.keys()].filter(path=>group?path.split('/').at(-2)===collection:path.split('/').length===2&&path.startsWith(collection+'/')).filter(path=>op==='array-contains'?records.get(path)[field]?.includes(value):records.get(path)[field]===value).map(snapshot)})};}});
 const writer=()=>{const writes=[];return {update:(r,data)=>writes.push([r.path,data]),set:(r,data)=>writes.push([r.path,data]),commit:async()=>{
  if(authChanged&&syncFailure)throw new Error('simulated database interruption');
  for(const [path,data]of writes)records.set(path,{...records.get(path),...data});
 }};};
 const db={doc:ref,collectionGroup:name=>query(name,true),collection:name=>query(name,false),batch:writer,runTransaction:async callback=>{
  const tx=writer();tx.get=async r=>snapshot(r.path);tx.getAll=async(...refs)=>refs.map(r=>snapshot(r.path));await callback(tx);await tx.commit();
 }};
 const admin={auth:()=>({getUser:async()=>record,getUserByProviderUid:async()=>{
  if(collision)return {uid:'other-fanm-user'};throw Object.assign(new Error('not found'),{code:'auth/user-not-found'});
 },updateUser:async(uid,patch)=>{changes.push({uid,patch});authChanged=true;}}),firestore:{FieldValue:{serverTimestamp:()=>123}}};
 const run=()=>changePlayerGoogleAccount({admin,db,firebase,body:{originalGoogleIdToken:'old',replacementGoogleIdToken:'new',requestedEmail:'new@gmail.com',clubId:'club',memberId:'member'},verifyGoogle:async token=>token==='old'?old:replacement,now});
 return {records,changes,run};
}
test('provider replacement preserves UID, memberships, player IDs and club admin references',async()=>{
 const f=fixture();const result=await f.run();assert.equal(result.uid,'same-uid');assert.equal(result.profileSyncPending,false);
 assert.equal(f.changes.length,1);assert.deepEqual(f.changes[0].patch.providersToUnlink,['google.com']);assert.equal(f.changes[0].patch.providerToLink.uid,'new-google');
 assert.equal(f.records.get('clubs/club/members/member').uid,'same-uid');assert.equal(f.records.get('clubs/club/players/player').email,'new@gmail.com');
 assert.deepEqual(f.records.get('clubs/club').adminEmails,['new@gmail.com']);assert.equal(f.records.get('clubs/club').captainEmail,'new@gmail.com');
 assert.equal(f.records.get('profileAccountChanges/same-uid').status,'completed');
 assert.equal(JSON.stringify(f.records.get('profileAccountChanges/same-uid')).includes('IdToken'),false);
});
test('replacement already linked elsewhere cannot merge or alter either account',async()=>{
 const f=fixture({collision:true});await assert.rejects(f.run(),/already has a FANM account/);assert.equal(f.changes.length,0);
 assert.equal(f.records.get('clubs/club/members/member').uid,undefined);
});
test('post-auth sync interruption is explicit and memberships remain bound to the original UID',async()=>{
 const f=fixture({syncFailure:true});const result=await f.run();assert.equal(result.profileSyncPending,true);
 assert.equal(f.records.get('clubs/club/members/member').uid,'same-uid');assert.equal(f.records.get('profileAccountChanges/same-uid').status,'profile_sync_pending');
});
