const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs'),{handle}=require('../functions/fieldStaffManagement.cjs');
const data=()=>fixture({'leagueVenues/field':{ownerUid:'owner'},'leagueVenues/field/staff/owner':{uid:'owner',isCreator:true,status:'active'},'leagueVenues/field/staff/staff':{uid:'staff',status:'active',role:'assistant_manager',isAdministrator:true},'leagueVenues/field/staff/manager':{uid:'manager',status:'active',role:'field_manager',isAdministrator:true},'leagueVenues/field/staffPermissions/staff':{endSeason:true}});
test('owner and active Field manager can manage staff; other accounts cannot',async()=>{
 for(const uid of ['owner','manager'])assert.equal((await handle({db:data().db,user:{uid,email_verified:true},body:{venueId:'field',action:'list'}})).staff.length,3);
 for(const uid of ['staff','stranger'])await assert.rejects(handle({db:data().db,user:{uid,email_verified:true},body:{venueId:'field',action:'list'}}),/Only the Field/);
});
test('revocation preserves staff history, removes powers and protects creator and current manager',async()=>{
 const f=data(),user={uid:'owner',email_verified:true};await handle({db:f.db,user,body:{venueId:'field',action:'status',staffId:'staff',status:'inactive',confirmName:'Field staff'}});
 assert.equal(f.records.get('leagueVenues/field/staff/staff').status,'inactive');assert.equal(f.records.get('leagueVenues/field/staff/staff').isAdministrator,false);assert.equal(f.records.has('leagueVenues/field/staffPermissions/staff'),false);
 await assert.rejects(handle({db:f.db,user,body:{venueId:'field',action:'status',staffId:'owner',status:'inactive'}}),/protected/);
 await assert.rejects(handle({db:f.db,user:{uid:'manager',email_verified:true},body:{venueId:'field',action:'status',staffId:'manager',status:'inactive'}}),/protected/);
});
test('owner edits profiles and grants powers; manager cannot elevate staff; identity cannot be injected',async()=>{
 const f=data(),user={uid:'owner',email_verified:true},body={venueId:'field',staffId:'staff'};
 await handle({db:f.db,user,body:{...body,action:'profile',draft:{fullName:'Alex Staff',shortName:'Alex',whatsappNumber:'+27820000000',photoUrl:'https://example.com/face.png',uid:'attacker',email:'attacker@x.test'}}});
 assert.equal(f.records.get('leagueVenues/field/staff/staff').uid,'staff');assert.equal(f.records.get('leagueVenues/field/staff/staff').email,undefined);
 const permissions={...body,action:'administrator',role:'field_manager',isAdministrator:true,endMatchDay:true,endSeason:false};
 await assert.rejects(handle({db:f.db,user:{uid:'manager',email_verified:true},body:permissions}),/Only the Field creator/);
 await handle({db:f.db,user,body:permissions});assert.equal(f.records.get('leagueVenues/field/staff/staff').role,'field_manager');assert.equal(f.records.get('leagueVenues/field/staffPermissions/staff').endMatchDay,true);
 await assert.rejects(handle({db:f.db,user,body:{...permissions,role:'referee'}}),/Referees cannot/);
});
test('removal requires exact name; restoration preserves access level without restoring dangerous powers',async()=>{
 const f=data(),user={uid:'owner',email_verified:true};
 await assert.rejects(handle({db:f.db,user,body:{venueId:'field',staffId:'staff',action:'status',status:'inactive'}}),/Type the staff/);
 await handle({db:f.db,user,body:{venueId:'field',staffId:'staff',action:'status',status:'inactive',confirmName:'Field staff'}});
 await handle({db:f.db,user,body:{venueId:'field',staffId:'staff',action:'status',status:'active'}});
 assert.equal(f.records.get('leagueVenues/field/staff/staff').isAdministrator,true);assert(!f.records.has('leagueVenues/field/staffPermissions/staff'));
});
