const {onDocumentUpdated,onDocumentCreated}=require("firebase-functions/v2/firestore");
const {FieldValue}=require("firebase-admin/firestore");
const {createHash,randomUUID}=require("node:crypto");
const {newlyAccepted,acceptedClubs,safe}=require("./fieldAcceptancePolicy.cjs");
const {senderPortrait,https}=require("./notificationMedia.cjs");
async function tokensFor(db,uids){const tokens=[],seen=new Set(),ids=[...new Set(uids.filter(Boolean))];for(let i=0;i<ids.length;i+=30){const result=await db.collectionGroup("notificationDevices").where("firebaseUid","in",ids.slice(i,i+30)).get();for(const item of result.docs){const data=item.data();if(data.enabled&&data.token&&!seen.has(data.token)){seen.add(data.token);tokens.push({token:data.token,ref:item.ref});}}}return tokens;}
async function deliverOnce(db,key,work){const ref=db.doc(`notificationDeliveries/${createHash("sha256").update(key).digest("hex")}`),claim=randomUUID();const claimed=await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();if(old?.status==="completed")return false;if(old?.leaseUntilMs>Date.now())throw new Error("Notification delivery is in progress.");tx.set(ref,{status:"processing",claim,leaseUntilMs:Date.now()+180000});return true;});if(!claimed)return;try{await work();await ref.set({status:"completed",leaseUntilMs:0,updatedAt:FieldValue.serverTimestamp()},{merge:true});}catch(e){await ref.set({status:"failed",leaseUntilMs:0},{merge:true});throw e;}}
async function fieldAudience(db,venueId,venue,includeClubs=false,authService=null){
 const staff=await db.collection(`leagueVenues/${venueId}/staff`).get();const ids=new Set([venue.ownerUid].filter(Boolean));for(const doc of staff.docs)if(doc.data().status==="active")ids.add(doc.id);
 if(includeClubs){
  const participants=await db.collection(`leagueVenues/${venueId}/chatParticipants`).get();
  for(const doc of participants.docs){const p=doc.data();if(!safe(p.clubId)||!safe(p.memberId))continue;const [membership,member]=await Promise.all([db.doc(`clubFieldMemberships/${p.clubId}`).get(),db.doc(`clubs/${p.clubId}/members/${p.memberId}`).get()]);const m=member.data(),link=membership.data();if(link?.status!=="active"||link.venueId!==venueId||m?.status!=="active"||(m.uid&&m.uid!==doc.id))continue;const user=await (authService||require("firebase-admin/auth").getAuth()).getUser(doc.id).catch(()=>null);if(user?.emailVerified&&user.email===m.email&&!user.disabled)ids.add(doc.id);}
 }
 return [...ids];
}
function buildHandlers({db,region,sendBatch,testOnly=false,authService=null,portrait=senderPortrait}){const updated=testOnly?(_options,handler)=>handler:onDocumentUpdated,created=testOnly?(_options,handler)=>handler:onDocumentCreated;return {
 onFieldSeasonTeamAccepted:updated({document:"leagueVenues/{venueId}",region,retry:true},async event=>{
  const before=event.data?.before.data()?.league?.activeSeason,after=event.data?.after.data()?.league?.activeSeason,venueId=event.params.venueId;
  for(const clubId of newlyAccepted(before,after))await deliverOnce(db,`team-accepted:${venueId}:${after.id}:${clubId}`,async()=>{
   const fresh=(await db.doc(`leagueVenues/${venueId}`).get()).data(),season=fresh?.league?.activeSeason;
   if(season?.id!==after.id||!acceptedClubs(season).includes(clubId))return;
   const club=(await db.doc(`clubs/${clubId}`).get()).data();if(!club||club.deleted||club.status==="deleted")return;const membership=(await db.doc(`clubFieldMemberships/${clubId}`).get()).data();if(membership?.status!=="active"||membership.venueId!==venueId)return;
   const tokens=await tokensFor(db,await fieldAudience(db,venueId,fresh));if(!tokens.length)return;
   const logo=https(club.branding?.logoUrl||club.transparentLogoUrl||club.logoUrl||"");
   const result=await sendBatch({tokenRecords:tokens,title:`${club.name||clubId} accepted`,body:`${season.name||"Your season"} · ${fresh.name||"Your Field"} welcomes the team.`,imageUrl:logo,data:{type:"field_team_accepted",route:"field",venueId,seasonId:season.id,clubId,clubName:String(club.name||clubId),imageUrl:logo}});if(!result.successCount)throw new Error("No acceptance notifications delivered.");
  });
 }),
 onFieldChatMessageCreated:created({document:"leagueVenues/{venueId}/chatMessages/{messageId}",region,retry:true},async event=>{
  const message=event.data?.data(),{venueId,messageId}=event.params;if(!message?.senderUid)return;
  await deliverOnce(db,`field-chat:${venueId}:${messageId}`,async()=>{
   const venue=(await db.doc(`leagueVenues/${venueId}`).get()).data();if(!venue||venue.deleted)return;
   const audience=await fieldAudience(db,venueId,venue,true,authService);if(!audience.includes(message.senderUid))return;
   const tokenRecords=await tokensFor(db,audience.filter(uid=>uid!==message.senderUid));if(!tokenRecords.length)return;
   const senderImage=await portrait(db,message.clubId,message.senderUid);
   const result=await sendBatch({tokenRecords,title:`${message.senderName||"Field member"} · ${venue.name||"Field chat"}`,body:String(message.text||"Shared a highlight").slice(0,180),imageUrl:senderImage,data:{type:"field_chat",route:"field-chat",venueId,messageId,senderUid:message.senderUid,senderName:String(message.senderName||"Field member"),senderPhotoUrl:senderImage}});if(!result.successCount)throw new Error("No chat notifications delivered.");
  });
 })
};}
module.exports={buildHandlers,tokensFor,fieldAudience};
