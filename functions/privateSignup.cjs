const {FieldValue} = require("firebase-admin/firestore");
const privacy = require("./playerPrivacy.cjs");
const valid = value => typeof value === "string" && value.length > 0 && value.length <= 500 && !value.includes("/");
const ids = value => [...new Set((Array.isArray(value)?value:[]).map(String).filter(Boolean))];
const booked = data => ids([...(data.selectedWeeks || []),...(data.primaryPaidWeeks || []),...(data.paidWeeks || [])]);
const participant = (data,fallback) => String(data.beneficiaryPlayerId || data.playerId || data.beneficiaryStableKey || data.userId || fallback).trim().toLowerCase();
async function save({db,user,body}) {
  const {clubId,kind,docId}=body;
  if(!user?.uid || !user.email_verified || user.cameraSession===true)throw new Error("Sign in to save your booking.");
  if(!valid(clubId) || !valid(docId) || !["pendingSignups","matchSignups"].includes(kind))throw new Error("Invalid booking reference.");
  const patch=body.data;
  if(!patch || Array.isArray(patch) || typeof patch!=="object" || JSON.stringify(patch).length>150000)throw new Error("Invalid booking details.");
  const ref=db.doc(`clubs/${clubId}/${kind}/${docId}`);
  return db.runTransaction(async tx=>{
    const [clubSnap,currentSnap]=await tx.getAll(db.doc(`clubs/${clubId}`),ref);
    const club=clubSnap.data(),current=currentSnap.data() || {};
    if(!club || club.deleted || club.status==="deleted")throw new Error("This club is unavailable.");
    const administrator=privacy.adminOf(club,user);
    let owner=current.profileOwnerUid===user.uid || current.payerUserId===user.uid || current.userId===user.uid;
    const payer=String(current.payerUserId || current.userId || "");
    if(currentSnap.exists && !owner && valid(payer)){
      const profile=(await tx.get(db.doc(`clubs/${clubId}/players/${payer}`))).data();
      if(profile?.platformIdentityUid===user.uid)owner=true;
      else if(profile?.sourceMemberId && valid(profile.sourceMemberId))owner=privacy.owns((await tx.get(db.doc(`clubs/${clubId}/members/${profile.sourceMemberId}`))).data(),user);
    }
    if(currentSnap.exists && !administrator && !owner)throw new Error("Only the booking owner or club administrator can change this booking.");
    const [pending,matches]=await Promise.all([tx.get(db.collection(`clubs/${clubId}/pendingSignups`)),tx.get(db.collection(`clubs/${clubId}/matchSignups`))]);
    const next={...(body.merge?current:{}),...patch,profileOwnerUid:current.profileOwnerUid || user.uid,updatedAt:FieldValue.serverTimestamp()};
    if(!currentSnap.exists)next.createdAt=FieldValue.serverTimestamp();else if(patch.createdAt)next.createdAt=current.createdAt || FieldValue.serverTimestamp();
    const limit=Number(club.bookingSettings?.maxPlayers || 25);
    if(!Number.isInteger(limit) || limit<1 || limit>100)throw new Error("The club's booking limit is invalid.");
    const requested=booked(next),previous=booked(current),key=participant(next,docId);
    for(const week of requested){
      const occupants=new Set([...pending.docs,...matches.docs].filter(item=>item.ref.path!==ref.path && booked(item.data()).includes(week)).map(item=>participant(item.data(),item.id)));
      const already=previous.includes(week) || occupants.has(key);occupants.delete(key);
      const fixture=(club.acceptedClubChallenges || []).find(item=>String(item.fixtureId || item.id)===week);
      const requestedLimit=Number(body.fixtureLimits?.[week]);
      const maximum=Number(fixture?.maxPlayers || (Number.isInteger(requestedLimit)&&requestedLimit>0?Math.min(requestedLimit,limit):limit));
      if(!already && occupants.size>=maximum)throw new Error(`The game on ${week} is full (${maximum} players). Choose another game.`);
    }
    tx.set(ref,next);
    tx.set(db.doc(`clubs/${clubId}/${privacy.publicCollection[kind]}/${privacy.publicId(docId)}`),privacy.projection(kind,next));
    return {ok:true};
  });
}
module.exports={save};
