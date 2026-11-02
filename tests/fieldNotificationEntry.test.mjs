import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFieldNotificationEntry,fieldEntryMemoryKey,fieldEntryHint} from '../src/core/fieldNotificationEntry.mjs';
const user={uid:'user',email:'user@example.com',emailVerified:true},venue={id:'field',name:'Wynberg MM'};
function setup({staff=null,members=[{id:'member',clubId:'club',uid:'user',status:'active',fullName:'Alex Player',role:'admin'}],link={venueId:'field',status:'active'}}={}){
 let membershipsRead=0;
 return {reads:{staff:async()=>staff,memberships:async()=>{membershipsRead++;return members;},link:async()=>link,club:async id=>({name:id==='club'?'Turf Kings FC':'Other Club'})},count:()=>membershipsRead};
}
test('staff opens with current name, role and actual powers, without a Club selection',async()=>{
 const f=setup({staff:{uid:'user',email:user.email,status:'active',role:'assistant_manager',isAdministrator:true,fullName:'Alex Official'}});
 const identity=await resolveFieldNotificationEntry({user,venue},f.reads);
 assert.equal(identity.role,'assistant_manager');assert.equal(identity.fullName,'Alex Official');assert.equal(identity.isAdministrator,true);assert.equal(f.count(),0);
});
test('player notification reuses verified teleport membership and never grants Club admin Field powers',async()=>{
 const f=setup(),identity=await resolveFieldNotificationEntry({user,venue,request:{preferredClubId:'club',preferredMemberId:'member',clubId:'sender-club'}},f.reads);
 assert.equal(identity.role,'club_member');assert.equal(identity.clubId,'club');assert.equal(identity.memberId,'member');assert.equal(identity.clubName,'Turf Kings FC');assert.equal(identity.isAdministrator,false);
});
test('dual-role account resumes remembered Club context; private Club room explicitly uses its own Club',async()=>{
 const f=setup({staff:{uid:'user',status:'active',role:'field_manager',isAdministrator:true}});
 for(const args of [{remembered:{kind:'club',clubId:'club',memberId:'member'}},{request:{privateClubId:'club'}}]){
  const identity=await resolveFieldNotificationEntry({user,venue,...args},f.reads);assert.equal(identity.role,'club_member');assert.equal(identity.clubId,'club');
 }
});
test('revoked staff, wrong-account staff, stale Club links and inactive players cannot enter',async()=>{
 for(const staff of [{uid:'user',status:'inactive',role:'field_manager'},{uid:'someone-else',status:'active',role:'field_manager'},{uid:'user',email:'other@example.com',status:'active',role:'field_manager'}])await assert.rejects(resolveFieldNotificationEntry({user,venue},setup({staff,members:[]}).reads),/no longer active/);
 await assert.rejects(resolveFieldNotificationEntry({user,venue},setup({link:{venueId:'other-field',status:'active'}}).reads),/no longer active/);
 await assert.rejects(resolveFieldNotificationEntry({user,venue},setup({members:[{id:'member',clubId:'club',uid:'user',status:'inactive'}]}).reads),/No active Club/);
 await assert.rejects(resolveFieldNotificationEntry({user,venue},setup({members:[{id:'member',clubId:'club',uid:'someone-else',status:'active'}]}).reads),/No active Club/);
});
test('private room cannot fall back to unrelated staff or another Club',async()=>{
 const f=setup({staff:{uid:'user',status:'active',role:'field_manager',isAdministrator:true}});
 await assert.rejects(resolveFieldNotificationEntry({user,venue,request:{privateClubId:'not-my-club'}},f.reads),/no longer active/);
});
test('multiple Clubs resolve through remembered or current Club; ambiguity never silently chooses a Club',async()=>{
 const f=setup({members:[{id:'one',clubId:'club',uid:'user',status:'active'},{id:'two',clubId:'other',uid:'user',status:'active'}]});
 assert.equal((await resolveFieldNotificationEntry({user,venue,request:{preferredClubId:'other'}},f.reads)).clubId,'other');
 await assert.rejects(resolveFieldNotificationEntry({user,venue},f.reads),/more than one Club/);
});
test('anonymous, unverified and camera accounts are blocked; remembered context has no permission fields',async()=>{
 for(const change of [{emailVerified:false},{isAnonymous:true},{cameraSession:true}])await assert.rejects(resolveFieldNotificationEntry({user:{...user,...change},venue},setup().reads),/verified account/);
 assert.deepEqual(fieldEntryHint({role:'field_manager',isAdministrator:true}),{kind:'staff'});
 assert.deepEqual(fieldEntryHint({role:'club_member',clubId:'club',memberId:'member',isAdministrator:true}),{kind:'club',clubId:'club',memberId:'member'});
 assert.notEqual(fieldEntryMemoryKey('production','field','user'),fieldEntryMemoryKey('staging','field','user'));
 assert.notEqual(fieldEntryMemoryKey('staging','field','user'),fieldEntryMemoryKey('staging','field','other'));
});
