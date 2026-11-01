function shortName(profile={},fallback="Player"){
 const preferred=String(profile.shortName||profile.nickname||profile.nickName||"").trim();
 if(preferred)return preferred.slice(0,50);
 return String(profile.fullName||profile.displayName||profile.name||fallback||"Player").trim().split(/\s+/)[0].slice(0,50)||"Player";
}
async function displayName(db,{uid,clubId,venueId,fallback}){
 try{
  if(clubId){const members=await db.collection(`clubs/${clubId}/members`).where("uid","==",uid).limit(2).get();if(members.docs.length===1)return shortName(members.docs[0].data(),fallback);}
  if(venueId){const staff=await db.doc(`leagueVenues/${venueId}/staff/${uid}`).get();if(staff.exists)return shortName(staff.data(),fallback);}
 }catch(error){console.warn("[FANM notification] Name lookup unavailable",error.code||error.name);}
 return shortName({},fallback);
}
module.exports={shortName,displayName};
