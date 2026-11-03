const {FieldValue}=require("firebase-admin/firestore");
const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(v);
const roles=["field_manager","assistant_manager","field_assistant","other_staff","referee"];
async function handle({db,user,body}){
 if(!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==="anonymous"||!valid(body.venueId))throw Error("Sign in as the Field manager.");
 const authorize=async tx=>{
  const read=ref=>tx?tx.get(ref):ref.get();
  const [venue,staff]=await Promise.all([read(db.doc(`leagueVenues/${body.venueId}`)),read(db.doc(`leagueVenues/${body.venueId}/staff/${user.uid}`))]);
  if(!venue.exists)throw Error("Field unavailable.");
  const own=venue.data().ownerUid===user.uid,s=staff.data();
  if(!own&&!(s?.status==="active"&&s.uid===user.uid&&s.role==="field_manager"&&s.isAdministrator===true))throw Error("Only the Field creator or active Field manager can manage staff.");
  return {...venue.data(),isOwner:own};
 };
 if(body.action==="list"){
  const venue=await authorize(),records=await db.collection(`leagueVenues/${body.venueId}/staff`).get();
  return {isOwner:venue.isOwner,staff:await Promise.all(records.docs.map(async d=>{
   const s=d.data(),permissions=(await db.doc(`leagueVenues/${body.venueId}/staffPermissions/${d.id}`).get()).data();
   return {id:d.id,name:s.fullName||s.name||"Field staff",shortName:s.shortName||"",whatsappNumber:s.whatsappNumber||"",photoUrl:s.photoUrl||"",role:s.role,status:s.status,isAdministrator:s.isAdministrator===true,endMatchDay:permissions?.endMatchDay===true,endSeason:permissions?.endSeason===true,protected:d.id===user.uid||d.id===venue.ownerUid||s.uid===venue.ownerUid||s.isCreator===true};
  }))};
 }
 if(!valid(body.staffId)||!["status","profile","administrator"].includes(body.action))throw Error("Choose a valid staff action.");
 return db.runTransaction(async tx=>{
  const venue=await authorize(tx),ref=db.doc(`leagueVenues/${body.venueId}/staff/${body.staffId}`),snap=await tx.get(ref),staff=snap.data();
  if(!staff)throw Error("Staff profile unavailable.");
  const protectedPerson=staff.isCreator||body.staffId===user.uid||body.staffId===venue.ownerUid||staff.uid===user.uid||staff.uid===venue.ownerUid;
  const meta={updatedAt:FieldValue.serverTimestamp(),updatedByUid:user.uid};
  if(body.action==="profile"){
   const draft=body.draft||{},fullName=String(draft.fullName||"").trim(),shortName=String(draft.shortName||"").trim(),whatsappNumber=String(draft.whatsappNumber||"").trim(),photoUrl=String(draft.photoUrl||"").trim();
   if(!fullName||fullName.length>100||shortName.length>50||whatsappNumber.length>30||photoUrl.length>350000||(photoUrl&&!/^https:\/\//i.test(photoUrl)&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photoUrl)))throw Error("Check the name, contact number and HTTPS photo address.");
   if(protectedPerson&&staff.uid!==user.uid&&body.staffId!==user.uid)throw Error("The creator profile is protected.");
   tx.update(ref,{fullName,name:fullName,shortName,whatsappNumber,photoUrl,...meta});return {saved:true};
  }
  if(protectedPerson)throw Error("The creator and your own access are protected.");
  if(!["active","inactive"].includes(staff.status))throw Error("Review pending staff requests through staff approval.");
  if(body.action==="administrator"){
   if(!venue.isOwner)throw Error("Only the Field creator may assign administrators and match-day powers.");
   if(staff.status!=="active"||!roles.includes(body.role)||typeof body.isAdministrator!=="boolean"||typeof body.endMatchDay!=="boolean"||typeof body.endSeason!=="boolean")throw Error("Choose a valid active staff role and permissions.");
   if(body.role==="referee"&&body.isAdministrator)throw Error("Referees cannot be Field administrators.");
   tx.update(ref,{role:body.role,isAdministrator:body.isAdministrator,...meta});
   tx.set(db.doc(`leagueVenues/${body.venueId}/staffPermissions/${body.staffId}`),{uid:body.staffId,endMatchDay:body.isAdministrator&&body.endMatchDay,endSeason:body.isAdministrator&&body.endSeason,...meta});return {saved:true};
  }
  if(!["active","inactive"].includes(body.status))throw Error("Choose a valid staff status.");
  if(body.status==="inactive"&&body.confirmName!==(staff.fullName||staff.name||"Field staff"))throw Error("Type the staff member’s name to confirm removal.");
  tx.update(ref,{status:body.status,restoreAdministrator:body.status==="inactive"?staff.isAdministrator===true:staff.restoreAdministrator===true,isAdministrator:body.status==="active"&&staff.role!=="referee"&&staff.restoreAdministrator===true,...meta});
  if(body.status==="inactive")tx.delete(db.doc(`leagueVenues/${body.venueId}/staffPermissions/${body.staffId}`));
  return {saved:true};
 });
}
module.exports={handle};
