const test=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),path=require('node:path');
let gateway;
async function load(){
 if(gateway)return gateway;
 const bundle=await esbuild.build({entryPoints:[path.join(__dirname,'../src/storage/fieldNotificationEntryGateway.js')],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'test-field-entry-reads',setup(build){
  build.onResolve({filter:/firebaseConfig|^firebase\/firestore\/lite$|playerPrivacyGateway|clubFieldPortalReadClient|leagueVenueRepository/},args=>({path:args.path,namespace:'test'}));
  build.onLoad({filter:/.*/,namespace:'test'},args=>{
   let contents;
   if(args.path.includes('firebaseConfig'))contents='export const auth=globalThis.__fieldEntryTest.auth,app={},activeFirebaseProjectId="staging";';
   else if(args.path==='firebase/firestore/lite')contents='export const getFirestore=()=>({}),doc=(...args)=>args,getDoc=async()=>({exists:()=>!!globalThis.__fieldEntryTest.staff,data:()=>globalThis.__fieldEntryTest.staff});';
   else if(args.path.includes('playerPrivacyGateway'))contents='export async function ownMembershipSnapshots(){await globalThis.__fieldEntryTest.pause;return {docs:globalThis.__fieldEntryTest.members.map(m=>({id:m.id,data:()=>m,ref:{parent:{parent:{id:m.clubId}}}}))};}';
   else if(args.path.includes('clubFieldPortalReadClient'))contents='export const readPortalMembership=async()=>({data:()=>({venueId:"field",status:"active"})}),readPortalClub=async()=>({data:()=>({name:"Club"})});';
   else contents='export const claimApprovedVenueStaffProfile=async()=>{throw Error("unexpected claim")},ensureVenueCreatorStaffProfile=async()=>{throw Error("unexpected creator registration")};';
   return {contents};
  });
 }}]});
 const module={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,require);gateway=module.exports;return gateway;
}
test('actual gateway refuses a result when the signed-in account changes during teleport verification',async()=>{
 let release;
 globalThis.localStorage={getItem:()=>null};
 globalThis.__fieldEntryTest={auth:{currentUser:{uid:'user',emailVerified:true,email:'user@x.test'}},staff:null,members:[{id:'member',clubId:'club',uid:'user',status:'active'}],pause:new Promise(resolve=>release=resolve)};
 const g=await load(),pending=g.enterFieldFromNotification({id:'field'},{preferredClubId:'club'});
 globalThis.__fieldEntryTest.auth.currentUser={uid:'other',emailVerified:true,email:'other@x.test'};release();
 await assert.rejects(pending,/account changed/);
});
test('actual gateway restores an active staff identity without making a new staff claim',async()=>{
 globalThis.__fieldEntryTest.auth.currentUser={uid:'staff',emailVerified:true,email:'staff@x.test'};
 globalThis.__fieldEntryTest.staff={uid:'staff',email:'staff@x.test',role:'field_manager',status:'active',fullName:'Field Manager',isAdministrator:true};
 const result=await (await load()).enterFieldFromNotification({id:'field',name:'Field'},{});
 assert.equal(result.fullName,'Field Manager');assert.equal(result.role,'field_manager');assert.equal(result.isAdministrator,true);
});
