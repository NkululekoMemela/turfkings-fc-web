const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs'),{handle}=require('../functions/fieldStaffManagement.cjs');
const data=()=>fixture({'leagueVenues/field':{ownerUid:'owner'},'leagueVenues/field/staff/owner':{uid:'owner',isCreator:true,status:'active'},'leagueVenues/field/staff/staff':{uid:'staff',status:'active',role:'assistant_manager',isAdministrator:true},'leagueVenues/field/staff/manager':{uid:'manager',status:'active',role:'field_manager',isAdministrator:true},'leagueVenues/field/staffPermissions/staff':{endSeason:true}});
test('owner and active Field manager can manage staff; other accounts cannot',async()=>{
 for(const uid of ['owner','manager'])assert.equal((await handle({db:data().db,user:{uid,email_verified:true},body:{venueId:'field',action:'list'}})).staff.length,3);
 for(const uid of ['staff','stranger'])await assert.rejects(handle({db:data().db,user:{uid,email_verified:true},body:{venueId:'field',action:'list'}}),/Only the Field/);
});
test('revocation preserves staff history, removes powers and protects creator and current manager',async()=>{
 const f=data(),user={uid:'owner',email_verified:true};await handle({db:f.db,user,body:{venueId:'field',action:'status',staffId:'staff',status:'inactive'}});
 assert.equal(f.records.get('leagueVenues/field/staff/staff').status,'inactive');assert.equal(f.records.get('leagueVenues/field/staff/staff').isAdministrator,false);assert.equal(f.records.has('leagueVenues/field/staffPermissions/staff'),false);
 await assert.rejects(handle({db:f.db,user,body:{venueId:'field',action:'status',staffId:'owner',status:'inactive'}}),/protected/);
 await assert.rejects(handle({db:f.db,user:{uid:'manager',email_verified:true},body:{venueId:'field',action:'status',staffId:'manager',status:'inactive'}}),/protected/);
});
