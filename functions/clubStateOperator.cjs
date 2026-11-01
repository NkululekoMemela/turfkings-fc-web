const {FieldValue}=require("firebase-admin/firestore");
async function prepare({db,user,clubId}){
 if(!/^[A-Za-z0-9_-]{1,150}$/.test(String(clubId||""))||!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==="anonymous")throw Error("Sign in with your verified Club account.");
 const club=await db.doc(`clubs/${clubId}`).get(),data=club.data();
 if(!club.exists||data.deleted)throw Error("This Club is unavailable.");
 if([data.ownerUid,data.createdByUid,...(data.adminUids||[])].includes(user.uid)||(user.email&&(data.adminEmails||[]).includes(user.email)))return {ready:true};
 const members=await db.collection(`clubs/${clubId}/members`).get();
 const mine=members.docs.filter(s=>{const m=s.data();return m.status==="active"&&["admin","captain"].includes(m.role)&&(m.uid===user.uid||(!m.uid&&user.email&&String(m.email||"").toLowerCase()===user.email.toLowerCase()));});
 if(mine.length!==1)throw Error("Only your Club captain or admin can change squads and matches.");
 await db.runTransaction(async tx=>{
  const current=await tx.get(mine[0].ref),m=current.data();
  if(!m||m.status!=="active"||!["admin","captain"].includes(m.role)||!(m.uid===user.uid||(!m.uid&&user.email&&String(m.email||"").toLowerCase()===user.email.toLowerCase())))throw Error("Your Club access changed. Please sign in again.");
  tx.set(db.doc(`clubStateOperators/${clubId}/users/${user.uid}`),{uid:user.uid,memberId:current.id,updatedAt:FieldValue.serverTimestamp()});
 });
 return {ready:true};
}
module.exports={prepare};
