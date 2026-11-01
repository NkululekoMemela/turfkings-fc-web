const {onDocumentUpdated,onDocumentCreated}=require("firebase-functions/v2/firestore");
const {FieldValue}=require("firebase-admin/firestore");
const {createHash,randomUUID}=require("node:crypto");
const {newlyAccepted,acceptedClubs}=require("./fieldAcceptancePolicy.cjs");
const {senderPortrait,https}=require("./notificationMedia.cjs");
async function tokensFor(db,uids){return require("./notificationRuntime.cjs").registeredTokens(db,uids);}
async function deliverOnce(db,key,work){const ref=db.doc(`notificationDeliveries/${createHash("sha256").update(key).digest("hex")}`),claim=randomUUID();const claimed=await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();if(old?.status==="completed")return false;if(old?.leaseUntilMs>Date.now())throw new Error("Notification delivery is in progress.");tx.set(ref,{status:"processing",claim,leaseUntilMs:Date.now()+180000});return true;});if(!claimed)return;try{await work();await ref.set({status:"completed",leaseUntilMs:0,updatedAt:FieldValue.serverTimestamp()},{merge:true});}catch(e){await ref.set({status:"failed",leaseUntilMs:0},{merge:true});throw e;}}
async function fieldAudience(db,venueId,venue,includeClubs=false,authService=null){
 const auth=authService;
 if(includeClubs)return require("./notificationRuntime.cjs").allFieldAudience(db,venueId,venue,auth);
 const staff=await db.collection(`leagueVenues/${venueId}/staff`).get(),ids=new Set([venue.ownerUid].filter(Boolean));
 for(const item of staff.docs)if(item.data().status==="active")ids.add(item.id);
 return [...ids];
}
function buildHandlers({db,region,sendBatch,testOnly=false,authService=null,portrait=senderPortrait,includeSenderForTesting=false}){const updated=testOnly?(_options,handler)=>handler:onDocumentUpdated,created=testOnly?(_options,handler)=>handler:onDocumentCreated;return {
 onFieldSeasonTeamAccepted:updated({document:"leagueVenues/{venueId}",region,retry:true,timeoutSeconds:180},async event=>{
  const before=event.data?.before.data()?.league?.activeSeason,after=event.data?.after.data()?.league?.activeSeason,venueId=event.params.venueId;
  for(const clubId of newlyAccepted(before,after))await deliverOnce(db,`team-accepted:${venueId}:${after.id}:${clubId}`,async()=>{
   const fresh=(await db.doc(`leagueVenues/${venueId}`).get()).data(),season=fresh?.league?.activeSeason;
   if(season?.id!==after.id||!acceptedClubs(season).includes(clubId))return;
   const club=(await db.doc(`clubs/${clubId}`).get()).data();if(!club||club.deleted||club.status==="deleted")return;const membership=(await db.doc(`clubFieldMemberships/${clubId}`).get()).data();if(membership?.status!=="active"||membership.venueId!==venueId)return;
   const tokens=await tokensFor(db,await fieldAudience(db,venueId,fresh));if(!tokens.length)return;
   const logo=https(club.branding?.logoUrl||club.transparentLogoUrl||club.logoUrl||"");
   const result=await sendBatch({tokenRecords:tokens,title:`${club.name||clubId} accepted`,body:`${season.name||"Your season"} · ${fresh.name||"Your Field"} welcomes the team.`,imageUrl:logo,data:{type:"field_team_accepted",route:"field",venueId,seasonId:season.id,clubId,clubName:String(club.name||clubId),sourceName:String(fresh.name||"Field"),groupLogoUrl:await require("./notificationRuntime.cjs").groupImage(fresh),imageUrl:logo}});if(!result.successCount)throw new Error("No acceptance notifications delivered.");
  });
 }),
 onFieldChatMessageCreated:created({document:"leagueVenues/{venueId}/chatMessages/{messageId}",region,retry:true,timeoutSeconds:180},async event=>{
  const message=event.data?.data(),{venueId,messageId}=event.params;if(!message?.senderUid)return;
  await deliverOnce(db,`field-chat:${venueId}:${messageId}`,async()=>{
   const venue=(await db.doc(`leagueVenues/${venueId}`).get()).data();if(!venue||venue.deleted)return;
   const policy=await require("./fieldChatAudience.cjs").audience(db,venueId,venue,authService),audience=[...policy.eligible];if(!audience.includes(message.senderUid)){console.info("[Field chat] Sender is no longer eligible",{venueId,messageId});return;}
   const tokenRecords=await require("./chatNotificationPolicy.cjs").filterChatRecipients(db,await tokensFor(db,audience.filter(uid=>includeSenderForTesting||uid!==message.senderUid)),"field",venueId,{defaultEnabled:policy.defaults});if(!tokenRecords.length){console.info("[Field chat] No enabled recipient devices",{venueId,messageId,audience:audience.length});return;}
   const senderImage=message.clubId?await portrait(db,message.clubId,message.senderUid):await require("./notificationMedia.cjs").publicImage((await db.doc(`leagueVenues/${venueId}/staff/${message.senderUid}`).get()).data()?.photoUrl||"");
   const result=await sendBatch({tokenRecords,title:`${message.senderName||"Field member"} · ${venue.name||"Field chat"}`,body:String(message.text||"Shared a highlight").slice(0,180),imageUrl:senderImage,data:{type:"field_chat",route:"field-chat",venueId,messageId,senderUid:message.senderUid,senderName:String(message.senderName||"Field member"),senderPhotoUrl:senderImage,sourceName:String(venue.name||"Field chat"),groupLogoUrl:await require("./notificationRuntime.cjs").groupImage(venue)}});if(!result.successCount)throw new Error("No chat notifications delivered.");
  });
 })
};}
module.exports={buildHandlers,tokensFor,fieldAudience};
