/* eslint-env node */
const {requireProofs}=require("./playerGoogleAccountPolicy.cjs");
async function changePlayerGoogleAccount({admin, db, firebase, body, verifyGoogle, now=Date.now()}) {
  const [original,replacement,record]=await Promise.all([
    verifyGoogle(body.originalGoogleIdToken),verifyGoogle(body.replacementGoogleIdToken),admin.auth().getUser(firebase.uid),
  ]);
  const proof=requireProofs({firebase,original,replacement,record,requestedEmail:body.requestedEmail,nowSeconds:Math.floor(now/1000)});
  try {
    const existing=await admin.auth().getUserByProviderUid("google.com",proof.newSubject);
    if (existing.uid !== proof.uid) { const error=new Error("That Google account already has a FANM account. Choose another address; accounts have not been merged."); error.status=409; throw error; }
  } catch (error) { if (error.code !== "auth/user-not-found") throw error; }
  if (!body.clubId || !body.memberId || [body.clubId,body.memberId].some(value => typeof value !== "string" || value.includes("/"))) throw new Error("Reopen your player profile before changing Google accounts.");
  const selectedRef=db.doc(`clubs/${body.clubId}/members/${body.memberId}`);
  const [byUid,byEmail,selected]=await Promise.all([
    db.collectionGroup("members").where("uid","==",proof.uid).get(),
    db.collectionGroup("members").where("email","==",proof.oldEmail).get(),selectedRef.get(),
  ]);
  const own = doc => doc.exists && /^clubs\/[^/]+\/members\/[^/]+$/.test(doc.ref.path) &&
    (doc.data().uid ? doc.data().uid===proof.uid : String(doc.data().email || "").toLowerCase()===proof.oldEmail.toLowerCase());
  if (!own(selected)) {const error=new Error("This club profile does not belong to your current account.");error.status=403;throw error;}
  const members=[...new Map([...byUid.docs,...byEmail.docs,selected].filter(own).map(doc=>[doc.ref.path,doc])).values()];
  if (members.length>100) throw new Error("This account has too many memberships for an automatic email change. Nothing changed.");
  const clubQueries=await Promise.all([
    ["adminEmails","array-contains",proof.oldEmail],["captainEmails","array-contains",proof.oldEmail],
    ["ownerUid","==",proof.uid],["createdByUid","==",proof.uid],
    ["ownerEmail","==",proof.oldEmail],["createdByEmail","==",proof.oldEmail],["captainEmail","==",proof.oldEmail],
  ].map(([field,op,value])=>db.collection("clubs").where(field,op,value).get()));
  const clubs=[...new Map(clubQueries.flatMap(snapshot=>snapshot.docs).map(club=>[club.ref.path,club])).values()];
  if (clubs.length+members.length>150) throw new Error("This account needs an administrator-assisted email change. Nothing changed.");
  const jobRef=db.doc(`profileAccountChanges/${proof.uid}`);
  await db.runTransaction(async tx => {
    const job=await tx.get(jobRef);
    const fresh=await tx.getAll(...members.map(member=>member.ref));
    if (fresh.some(member=>!own(member))) throw new Error("Your club membership changed. Reopen Profile and retry.");
    if (job.exists && job.data().status==="changing" && now-Number(job.data().startedAtMs)<600000) throw new Error("An account change is already being processed. Reopen Profile shortly.");
    tx.set(jobRef,{...proof,status:"changing",startedAtMs:now,members:members.map(doc=>doc.ref.path),clubs:clubs.map(doc=>doc.ref.path)});
    for (const member of fresh) if (!member.data().uid) tx.update(member.ref,{uid:proof.uid});
  });
  try {
    // One Auth update replaces the provider; never unlink first in the client.
    await admin.auth().updateUser(proof.uid,{
      email:proof.newEmail,emailVerified:true,providersToUnlink:["google.com"],
      providerToLink:{providerId:"google.com",uid:proof.newSubject,email:proof.newEmail,
        ...(replacement.name || record.displayName ? {displayName:replacement.name || record.displayName} : {}),
        ...(replacement.picture || record.photoURL ? {photoURL:replacement.picture || record.photoURL} : {})},
    });
  } catch (error) {
    await jobRef.set({status:"failed",failureCode:error.code || "auth-update-failed"},{merge:true});
    throw error;
  }
  try {
    await synchronizePlayerAccountDetails({admin,db,proof,membershipPaths:members.map(member=>member.ref.path),clubPaths:clubs.map(club=>club.ref.path)});
    return {email:proof.newEmail,uid:proof.uid,profileSyncPending:false};
  } catch (error) {
    try { await jobRef.set({status:"profile_sync_pending",failureCode:error.code || "profile-sync-failed"},{merge:true}); } catch (_) { /* UID ownership remains bound; selected profile can resync on its next save. */ }
    return {email:proof.newEmail,uid:proof.uid,profileSyncPending:true};
  }
}
async function synchronizePlayerAccountDetails({admin,db,proof,membershipPaths=[],clubPaths=[]}) {
  const memberRefs=membershipPaths.filter(path=>/^clubs\/[^/]+\/members\/[^/]+$/.test(path)).map(path=>db.doc(path));
  const clubRefs=clubPaths.filter(path=>/^clubs\/[^/]+$/.test(path)).map(path=>db.doc(path));
  const jobRef=db.doc(`profileAccountChanges/${proof.uid}`);
  await db.runTransaction(async tx=>{
    const documents=await tx.getAll(...memberRefs,...clubRefs);
    const members=documents.slice(0,memberRefs.length).filter(doc=>doc.exists&&doc.data().uid===proof.uid);
    const clubs=documents.slice(memberRefs.length).filter(doc=>doc.exists);
    const playerRefs=members.flatMap(member=>{
      const id=member.data().playerId;
      return typeof id==="string"&&id&&!id.includes("/")?[db.doc(member.ref.path.split("/").slice(0,2).join("/")+"/players/"+id)]:[];
    });
    const players=playerRefs.length?await tx.getAll(...playerRefs):[];
    for(const member of members)tx.update(member.ref,{email:proof.newEmail,profileUpdatedAt:admin.firestore.FieldValue.serverTimestamp()});
    for(const player of players)if(player.exists&&(members.some(member=>member.id===player.data().sourceMemberId)||String(player.data().email||"").toLowerCase()===proof.oldEmail.toLowerCase()))tx.update(player.ref,{email:proof.newEmail});
    for(const club of clubs){
      const before=club.data(),patch={};
      for(const key of ["ownerEmail","createdByEmail","captainEmail"])if(String(before[key]||"").toLowerCase()===proof.oldEmail.toLowerCase())patch[key]=proof.newEmail;
      for(const key of ["adminEmails","captainEmails"])if(Array.isArray(before[key])&&before[key].some(email=>String(email).toLowerCase()===proof.oldEmail.toLowerCase()))patch[key]=before[key].map(email=>String(email).toLowerCase()===proof.oldEmail.toLowerCase()?proof.newEmail:email);
      if(Object.keys(patch).length)tx.update(club.ref,patch);
    }
    tx.set(jobRef,{status:"completed",completedAtMs:Date.now()},{merge:true});
  });
}
module.exports={changePlayerGoogleAccount,synchronizePlayerAccountDetails};
