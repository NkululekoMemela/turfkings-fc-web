async function handle({db,user,body}){
 const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(v);
 if(!user?.uid||!user.email_verified||user.cameraSession||!valid(body.venueId))throw Error("Sign in as the Field manager.");
 const authorize=async tx=>{
  const read=ref=>tx?tx.get(ref):ref.get();
  const [venue,staff]=await Promise.all([read(db.doc(`leagueVenues/${body.venueId}`)),read(db.doc(`leagueVenues/${body.venueId}/staff/${user.uid}`))]);
  if(!venue.exists)throw Error("Field unavailable.");
  const own=venue.data().ownerUid===user.uid,s=staff.data();
  if(!own&&!(s?.status==="active"&&s.uid===user.uid&&s.role==="field_manager"&&s.isAdministrator===true))throw Error("Only the Field creator or active Field manager can manage staff.");
  return venue.data();
 };
 if(body.action==="list"){
  const venue=await authorize();const records=await db.collection(`leagueVenues/${body.venueId}/staff`).get();
  return {staff:records.docs.map(d=>({id:d.id,name:d.data().fullName||d.data().name||"Field staff",role:d.data().role,status:d.data().status,protected:d.id===user.uid||d.id===venue.ownerUid||d.data().uid===venue.ownerUid||d.data().isCreator===true}))};
 }
 if(body.action!=="status"||!valid(body.staffId)||!["active","inactive"].includes(body.status))throw Error("Choose a valid staff action.");
 return db.runTransaction(async tx=>{
  const venue=await authorize(tx),ref=db.doc(`leagueVenues/${body.venueId}/staff/${body.staffId}`),snap=await tx.get(ref),staff=snap.data();
  if(!staff||staff.isCreator||body.staffId===user.uid||body.staffId===venue.ownerUid||staff.uid===user.uid||staff.uid===venue.ownerUid)throw Error("The creator and your own access are protected.");
  if(!["active","inactive"].includes(staff.status))throw Error("Review pending staff requests through staff approval.");
  tx.update(ref,{status:body.status,isAdministrator:body.status==="active"&&staff.role!=="referee",updatedAt:require("firebase-admin/firestore").FieldValue.serverTimestamp(),updatedByUid:user.uid});
  if(body.status==="inactive")tx.delete(db.doc(`leagueVenues/${body.venueId}/staffPermissions/${body.staffId}`));
  return {saved:true};
 });
}
module.exports={handle};
