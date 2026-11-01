const {acceptedClubs}=require("./fieldAcceptancePolicy.cjs");
const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(v);
async function audience(db,venueId,venue,auth){
 const eligible=new Set(),defaults=new Set();
 const add=(uid,on)=>{if(valid(uid)){eligible.add(uid);if(on)defaults.add(uid);}};
 add(venue.ownerUid,true);
 const staff=await db.collection(`leagueVenues/${venueId}/staff`).get();
 for(const d of staff.docs)if(d.data().status==="active")add(d.data().uid||d.id,true);
 const season=venue.league?.activeSeason;
 if(!season?.id||season.status!=="active"||season.isTest||season.isPracticeMode)return {eligible,defaults};
 for(const clubId of acceptedClubs(season)){
  const [club,link,members,squad]=await Promise.all([db.doc(`clubs/${clubId}`).get(),db.doc(`clubFieldMemberships/${clubId}`).get(),db.collection(`clubs/${clubId}/members`).get(),db.doc(`leagueSeasonSquads/${venueId}~${season.id}~${clubId}`).get()]);
  const c=club.data(),l=link.data(),s=squad.data();if(!c||c.deleted||c.status==="deleted"||l?.status!=="active"||l.venueId!==venueId)continue;
  const leaders=new Set([c.ownerUid,c.createdByUid,...(Array.isArray(c.adminUids)?c.adminUids:[])]);
  for(const uid of leaders)add(uid,true);
  for(const d of members.docs){
   const m=d.data();if(m.status!=="active"||!valid(m.uid))continue;
   let user;try{auth=auth||require("firebase-admin/auth").getAuth();user=await auth.getUser(m.uid);}catch(e){if(e.code==="auth/user-not-found")continue;throw e;}
   if(!user?.emailVerified||user.disabled||(m.email&&String(user.email||"").toLowerCase()!==String(m.email).toLowerCase()))continue;
   const entry=s?.status==="active"?s.entries?.[d.id]:null;
   const inSquad=!!entry&&entry.sourcePlayerId===m.playerId&&entry.invitationStatus==="accepted";
   add(m.uid,leaders.has(m.uid)||m.role==="admin"||inSquad);
  }
 }
 return {eligible,defaults};
}
async function handle({db,user,body}){
 if(!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==="anonymous"||!valid(body.venueId))throw Error("Sign in to manage Field chat alerts.");
 const venue=(await db.doc(`leagueVenues/${body.venueId}`).get()).data();if(!venue||venue.deleted)throw Error("Field unavailable.");
 const policy=await audience(db,body.venueId,venue),eligible=policy.eligible.has(user.uid);
 return {eligible,defaultMuted:!policy.defaults.has(user.uid)};
}
module.exports={audience,handle};
