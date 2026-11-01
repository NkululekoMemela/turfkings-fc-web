const {createHash}=require("node:crypto");
const {FieldValue}=require("firebase-admin/firestore");
const {acceptedClubs}=require("./fieldAcceptancePolicy.cjs");
const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(v);
const roomKey=(venueId,seasonId,clubId)=>createHash("sha256").update(JSON.stringify([venueId,seasonId,clubId])).digest("hex");
async function context(db,user,body,tx){
 if(!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==="anonymous")throw Error("Sign in with your verified Club account.");
 if(!valid(body.venueId)||!valid(body.clubId))return null;
 const read=ref=>tx?tx.get(ref):ref.get();
 const [venue,club,link,members]=await Promise.all([read(db.doc(`leagueVenues/${body.venueId}`)),read(db.doc(`clubs/${body.clubId}`)),read(db.doc(`clubFieldMemberships/${body.clubId}`)),read(db.collection(`clubs/${body.clubId}/members`))]);
 const season=venue.data()?.league?.activeSeason;
 if(!season?.id||season.status!=="active"||season.isTest||season.isPracticeMode||!acceptedClubs(season).includes(body.clubId)||link.data()?.status!=="active"||link.data()?.venueId!==body.venueId||!club.exists||club.data().deleted)return null;
 const squad=await read(db.doc(`leagueSeasonSquads/${body.venueId}~${season.id}~${body.clubId}`));
 const leaders=new Set([club.data().ownerUid,club.data().createdByUid,...(club.data().adminUids||[])]);
 const active=members.docs.map(d=>({...d.data(),id:d.id})).filter(m=>m.status==="active"&&(
  ["admin","captain"].includes(m.role)||leaders.has(m.uid)||
  (squad.data()?.status==="active"&&squad.data()?.entries?.[m.id]?.invitationStatus==="accepted"&&squad.data()?.entries?.[m.id]?.sourcePlayerId===m.playerId)
 )),mine=active.filter(m=>m.uid===user.uid);
 if(mine.length!==1)return null;
 if(body.seasonId&&body.seasonId!==season.id)throw Error("This season has changed. Reopen your Club chat.");
 return {venue:venue.data(),club:club.data(),season,member:mine[0],members:active,roomId:roomKey(body.venueId,season.id,body.clubId)};
}
async function handle({db,user,body,now=Date.now()}){
 if(body.action==="rooms"){
  const ctx=await context(db,user,body);return {canManage:false,hasTeams:!!ctx,rooms:ctx?[{id:body.clubId,name:ctx.club.name||ctx.club.clubName||"Your Club",seasonId:ctx.season.id,captains:ctx.members.filter(m=>m.role==="captain").map(m=>m.shortName||m.fullName||"Captain")}]:[]};
 }
 if(body.action==="send"){
  const text=String(body.text||"").trim();if(!text||text.length>2000||!valid(body.requestId))throw Error("Write a message of up to 2,000 characters.");
  return db.runTransaction(async tx=>{
   const ctx=await context(db,user,body,tx);if(!ctx)throw Error("Only members of an accepted season Club may use this room.");
   const id=createHash("sha256").update(user.uid+":"+body.requestId).digest("hex"),ref=db.doc(`privateFieldClubChats/${ctx.roomId}/messages/${id}`);
   if((await tx.get(ref)).exists)return {sent:true};
   tx.set(ref,{venueId:body.venueId,clubId:body.clubId,seasonId:ctx.season.id,senderUid:user.uid,senderName:ctx.member.shortName||ctx.member.fullName||"Player",senderIsCaptain:ctx.member.role==="captain",text,createdAtMs:now,createdAt:FieldValue.serverTimestamp()});return {sent:true};
  });
 }
 const ctx=await context(db,user,body);if(!ctx)throw Error("Only members of an accepted season Club may use this room.");
 const preference=db.doc(`privateFieldClubChats/${ctx.roomId}/preferences/${user.uid}`);
 if(body.action==="mute"){if(typeof body.muted!=="boolean")throw Error("Choose a notification setting.");await preference.set({muted:body.muted});return {muted:body.muted};}
 if(body.action!=="messages")throw Error("Unknown Club chat action.");
 const [messages,pref]=await Promise.all([db.collection(`privateFieldClubChats/${ctx.roomId}/messages`).orderBy("createdAtMs","desc").limit(60).get(),preference.get()]);
 return {messages:messages.docs.map(d=>({id:d.id,senderName:d.data().senderName,senderUid:d.data().senderUid,senderIsCaptain:d.data().senderIsCaptain===true,text:d.data().text,createdAtMs:d.data().createdAtMs})).reverse(),muted:pref.data()?.muted===true};
}
async function notify({db,messaging,auth,event}){
 const message=event.data?.data();if(!message)return;
 let sender;try{sender=await auth.getUser(message.senderUid);}catch(e){if(e.code==="auth/user-not-found")return;throw e;}
 if(!sender.emailVerified||sender.disabled)return;
 const ctx=await context(db,{uid:message.senderUid,email_verified:true},message);if(!ctx)return;
 const uids=[];
 for(const uid of [...new Set(ctx.members.filter(m=>m.uid&&m.uid!==message.senderUid).map(m=>m.uid))]){
  let account;try{account=await auth.getUser(uid);}catch(e){if(e.code==="auth/user-not-found")continue;throw e;}
  if(!account.emailVerified||account.disabled)continue;
  const pref=await db.doc(`privateFieldClubChats/${ctx.roomId}/preferences/${uid}`).get();if(!pref.data()?.muted)uids.push(uid);
 }
 const runtime=require("./notificationRuntime.cjs"),media=require("./notificationMedia.cjs"),name=ctx.club.name||ctx.club.clubName||"Your Club";
 await runtime.reliableBatch({db,messaging,tokenRecords:await runtime.registeredTokens(db,uids),title:`${message.senderName} · ${name} · ${ctx.venue.name||"Field"}`,body:message.text.slice(0,170),data:{type:"field_club_chat",route:"field-chat",venueId:message.venueId,clubId:message.clubId,seasonId:message.seasonId,messageId:event.params.messageId,groupLogoUrl:await runtime.groupImage({...ctx.club,id:message.clubId}),sourceName:name,senderPhotoUrl:await media.senderPortrait(db,message.clubId,message.senderUid)}});
}
module.exports={handle,notify,roomKey};
