import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canUsePlayerFeatures} from '../src/core/playerFeatureAccess.mjs';
const user={uid:'owner',email:'owner@example.com',emailVerified:true};
const identity={clubId:'club',memberId:'member',uid:'owner',role:'player',status:'active'};
const access=(patch={})=>canUsePlayerFeatures({user,identity,clubId:'club',...patch});
test('verified club players, captains and administrators can use player features',()=>{
 for(const role of ['player','captain','admin'])assert.equal(access({identity:{...identity,role},activeRole:role}),true);
 assert.equal(access({user:{firebaseUser:user}}),true);
});
test('spectator mode overrides a retained Google session, real admin role and team captain detection',()=>{
 assert.equal(access({activeRole:'spectator'}),false);
 assert.equal(access({identity:{...identity,actingRole:'spectator',realRole:'admin',isRolePreview:true}}),false);
 assert.equal(access({identity:{...identity,role:'spectator'},activeRole:'captain'}),false);
});
test('signed out, unverified, wrong account and camera sessions cannot use player features',()=>{
 for(const session of [null,{...user,emailVerified:false},{...user,uid:'other'},{...user,cameraSession:true}])assert.equal(access({user:session}),false);
});
test('club context and active membership are required',()=>{
 for(const member of [null,{...identity,clubId:'other'},{...identity,memberId:null},{...identity,status:'pending'},{...identity,status:'withdrawn'}])assert.equal(access({identity:member}),false);
 assert.equal(access({activeRole:'unknown'}),false);
});
test('older email-bound identities support non-Gmail Google accounts without name matching',()=>{
 assert.equal(access({identity:{...identity,uid:undefined,email:'OWNER@EXAMPLE.COM'}}),true);
 assert.equal(access({identity:{...identity,uid:undefined,email:'other@example.com'}}),false);
 assert.equal(access({identity:{...identity,uid:undefined,email:undefined,fullName:'Owner'}}),false);
});
