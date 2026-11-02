const {createHash,randomUUID}=require("node:crypto");
const {FieldValue}=require("firebase-admin/firestore");
const {onDocumentCreated,onDocumentUpdated}=require("firebase-functions/v2/firestore");
const {onSchedule}=require("firebase-functions/v2/scheduler");
const {https,publicImage}=require("./notificationMedia.cjs");
const valid=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(value);
const hash=value=>createHash("sha256").update(value).digest("hex");
const badge=group=>https(group?.branding?.logoUrl||group?.transparentLogoUrl||group?.logoUrl||group?.logo||"");
async function groupImage(group){
 const builtIn={"turf-kings":"TurfKings_logo.jpeg","turf-dribblers":"TurfLegends_logo.jpeg"}[group?.id||group?.slug];
 if(builtIn){
  try{return await publicImage("data:image/jpeg;base64,"+require("node:fs").readFileSync(require("node:path").join(__dirname,"notification-assets",builtIn)).toString("base64"));}
  catch(error){console.warn("[Notification logo] Built-in badge unavailable",error.code||error.name);}
 }
 const candidates=[group?.branding?.logoUrl,group?.transparentLogoUrl,group?.logoUrl,group?.branding?.uploadedLogoUrl,group?.media?.logoOriginalUrl,group?.media?.logoTransparentUrl,group?.logo,group?.logoPath,group?.badgeUrl,group?.badge,group?.image,group?.branding?.generatedLogoDataUrl,group?.branding?.generatedLogoSvg];
 for(const value of candidates){
  if(typeof value!=="string")continue;
  try{const image=await publicImage(value);if(image)return image;}
  catch(error){console.warn("[Notification logo] Badge unavailable",error.code||error.name);}
 }
 return "";
}
const preview=value=>String(value||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,170);
async function verifiedUser(auth,uid,email){
 try{auth=auth||require("firebase-admin/auth").getAuth();const u=uid?await auth.getUser(uid):email?await auth.getUserByEmail(email):null;return u&&u.emailVerified&&!u.disabled&&(!email||u.email===email)?u:null;}
 catch(error){if(error.code==="auth/user-not-found"||error.code==="auth/invalid-email")return null;throw error;}
}
async function clubAudience(db,clubId,auth,membersOnly=false){
 const [club,members]=await Promise.all([db.doc(`clubs/${clubId}`).get(),db.collection(`clubs/${clubId}/members`).get()]);
 const c=club.data();if(!c||c.deleted||c.status==="deleted")return [];
 const ids=new Set();
 for(const uid of (membersOnly?[]:[c.ownerUid,c.createdByUid,...(Array.isArray(c.adminUids)?c.adminUids:[])]))if(valid(uid))ids.add(uid);
 for(const item of members.docs){const m=item.data();if(m.status!=="active")continue;const user=await verifiedUser(auth,m.uid,m.email);if(user&&valid(user.uid))ids.add(user.uid);}
 return [...ids];
}
async function allFieldAudience(db,venueId,venue,auth){
 const staff=await db.collection(`leagueVenues/${venueId}/staff`).get(),ids=new Set([venue.ownerUid].filter(valid));
 for(const item of staff.docs)if(item.data().status==="active")ids.add(item.id);
 const links=await db.collection("clubFieldMemberships").where("venueId","==",venueId).get();
 for(const link of links.docs){if(link.data().status!=="active")continue;for(const uid of await clubAudience(db,link.id,auth,true))ids.add(uid);}
 return [...ids];
}
async function registeredTokens(db,uids){
 const ids=[...new Set(uids.filter(valid))],records=[],seen=new Set();
 for(let start=0;start<ids.length;start+=30){
  const wanted=ids.slice(start,start+30);
  const fresh=await db.collection("notificationRegistrations").where("firebaseUid","in",wanted).get();
  for(const item of fresh.docs){const d=item.data();if(d.enabled===true&&d.token&&!seen.has(d.token)){seen.add(d.token);records.push({token:d.token,uid:d.firebaseUid,ref:item.ref});}}
  // Old installs remain supported. A new registration is authoritative for its device.
  try{
   const legacy=await db.collectionGroup("notificationDevices").where("firebaseUid","in",wanted).get();
   for(const item of legacy.docs){const d=item.data();if(!d.enabled||!d.token||seen.has(d.token))continue;
    if(valid(d.deviceId)){const current=(await db.doc(`notificationRegistrations/${d.deviceId}`).get()).data();if(current&&(current.firebaseUid!==d.firebaseUid||current.enabled!==true||current.token!==d.token))continue;}
    seen.add(d.token);records.push({token:d.token,uid:d.firebaseUid,ref:item.ref});
   }
  }catch(error){if(Number(error.code)!==9)throw error;console.warn("[FANM push] Legacy device index missing; updated devices remain supported.");if(!records.length)throw error;}
 }
 return records;
}
async function notificationSource(db,data={}){
 const scopeId=data.venueId||data.clubId;
 if(!valid(scopeId))return data;
 try{
  const group=(await db.doc(`${data.venueId?"leagueVenues":"clubs"}/${scopeId}`).get()).data();
  if(!group)return data;
  return {...data,sourceName:["club_team_chat","field_club_chat"].includes(data.type)?String(data.sourceName||"Team"):String(group.name||group.clubName||data.sourceName||"FANM"),groupLogoUrl:["club_team_chat","field_club_chat"].includes(data.type)?String(data.groupLogoUrl||""):data.groupLogoUrl||await groupImage({...group,id:scopeId})};
 }catch(error){console.warn("[FANM notification] Source badge unavailable",error.code||error.name);return data;}
}
async function sendMulticast(db,messaging,payload,records=[]){
 payload={...payload,data:await notificationSource(db,payload.data)};
 const current=new Map();
 for(let i=0;i<payload.tokens.length;i+=30){
  const result=await db.collection("notificationRegistrations").where("token","in",payload.tokens.slice(i,i+30)).get();
  for(const item of result.docs)current.set(item.data().token,item.data());
 }
 const responses=[];
 for(let i=0;i<payload.tokens.length;i++){
  const token=payload.tokens[i],registration=current.get(token),record=records[i];
  let expectedUid=record?.uid;
  if(!expectedUid&&record?.ref)expectedUid=(await record.ref.get()).data()?.firebaseUid;
  if(registration&&(registration.enabled!==true||(expectedUid&&registration.firebaseUid!==expectedUid))){responses.push({success:true,messageId:"inactive-device-skipped"});continue;}
  const data=Object.fromEntries(Object.entries({...payload.data,recipientUid:expectedUid||registration?.firebaseUid||"",title:payload.notification?.title||payload.data?.title||"FANM update",body:payload.notification?.body||payload.data?.body||""}).map(([k,v])=>[k,String(v??"")]));
  const key=[data.type,data.venueId||data.clubId,data.messageId||data.storyId||data.pollId||data.paymentId||data.matchDayId||data.seasonId||"",data.clubId||""].join(":");
  const native=registration?.rendererVersion==="2"&&registration.platform==="android";
  const {tokens,...base}=payload;void tokens;
  const message=native?{token,data:{...data,fanmRenderer:"2",notificationKey:hash(key)},android:{priority:"high"}}:{...base,token,data};
  try{responses.push({success:true,messageId:await messaging.send(message)});}catch(error){responses.push({success:false,error});}
 }
 return {responses,successCount:responses.filter(r=>r.success).length,failureCount:responses.filter(r=>!r.success).length};
}
async function reliableBatch({db,messaging,tokenRecords,title,body,data,imageUrl="",clock=Date.now}){
 const eventKey=[data.type,data.venueId||data.clubId,data.messageId||data.storyId||data.pollId||data.seasonId||"",data.clubId||""].join(":");
 let successCount=0,failureCount=0;
 for(const record of tokenRecords){
  const ref=db.doc(`notificationReceipts/${hash(eventKey+":"+record.token)}`),claim=randomUUID(),now=clock();
  const acquired=await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();if(old?.status==="sent"||old?.status==="invalid")return false;if(old?.leaseUntilMs>now)throw Error("Recipient delivery is already running.");tx.set(ref,{status:"sending",claim,leaseUntilMs:now+120000});return true;});
  if(!acquired){successCount++;continue;}
  try{
   const image=https(imageUrl),payload={token:record.token,notification:{title,body,...(image?{imageUrl:image}:{})},data:Object.fromEntries(Object.entries({...data,title,body,...(image?{imageUrl:image}:{})}).map(([k,v])=>[k,String(v??"")])),android:{priority:"high",notification:{channelId:"field_invitations",tag:hash(eventKey).slice(0,28)}}};
   const result=await sendMulticast(db,messaging,{tokens:[record.token],notification:payload.notification,data:payload.data,android:payload.android},[record]);
   if(!result.responses[0].success)throw result.responses[0].error;
   await ref.set({status:"sent",claim,leaseUntilMs:0,updatedAt:FieldValue.serverTimestamp()});successCount++;
  }catch(error){
   const invalid=["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(error.code);
   await ref.set({status:invalid?"invalid":"retry",leaseUntilMs:0,code:String(error.code||"unknown"),updatedAt:FieldValue.serverTimestamp()});
   if(invalid){await record.ref.set({enabled:false},{merge:true});successCount++;}else{failureCount++;console.error("[FANM push] Recipient delivery failed",{type:data.type,code:error.code||"unknown"});}
  }
 }
 if(failureCount)throw Error(`${failureCount} notification deliveries require retry.`);
 return {successCount,failureCount};
}
function publicationHandlers({db,region,auth,messaging,testOnly=false,now=Date.now}){
 const created=testOnly?(_options,fn)=>fn:onDocumentCreated;
 const updated=testOnly?(_options,fn)=>fn:onDocumentUpdated;
 async function publish(ref){
  const entry=(await ref.get()).data();if(!entry||entry.status!=="pending")return;
  const document=await db.doc(entry.path).get(),item=document.data();
  if(!item||item.archived||!(item.title||item.question)){await ref.set({status:"cancelled",dueAtMs:FieldValue.delete()},{merge:true});return;}
  if(entry.scope==="club"&&item.clubId!==entry.groupId)throw Error("Publication Club changed; delivery blocked.");
  const due=Number(item.publishDateMs)||entry.dueAtMs;
  if(due>now()){await ref.set({dueAtMs:due},{merge:true});return;}
  const prefix=entry.scope==="field"?"leagueVenues":"clubs",group=(await db.doc(`${prefix}/${entry.groupId}`).get()).data();
  if(!group||group.deleted||group.status==="deleted"){await ref.set({status:"cancelled",dueAtMs:FieldValue.delete()},{merge:true});return;}
  const ids=entry.scope==="field"?await allFieldAudience(db,entry.groupId,group,auth):await clubAudience(db,entry.groupId,auth);
  const records=await registeredTokens(db,ids),isPoll=entry.kind==="poll",type=`${entry.scope}_${isPoll?"poll":"story"}`;
  const groupLogo=await groupImage({...group,id:entry.groupId}),contentImage=await publicImage(item.notificationImageUrl||item.imageUrl||"");
  if(item.winnersAnnouncement&&!contentImage)throw Error("A winners photo is required before announcing the champions.");
  const data={type,route:`${entry.scope}-${isPoll?"poll":"story"}`,sourceName:String(group.name||group.clubName||"FANM"),groupLogoUrl:groupLogo,contentImageUrl:contentImage,[entry.scope==="field"?"venueId":"clubId"]:entry.groupId,[isPoll?"pollId":"storyId"]:document.id};
  await reliableBatch({db,messaging,tokenRecords:records,title:`${group.name||group.clubName||"FANM"} · ${isPoll?"New poll":"News"}`,body:preview(isPoll?item.question:`${item.title}${item.body?" · "+item.body:""}`),imageUrl:contentImage||groupLogo,data});
  await ref.set({status:"completed",recipientCount:records.length,dueAtMs:FieldValue.delete(),completedAt:FieldValue.serverTimestamp()},{merge:true});
  console.info("[FANM publication] Completed",{type,groupId:entry.groupId,recipients:records.length});
 }
 function handler(scope,kind){return async event=>{const item=event.data?.data(),groupId=scope==="field"?event.params.venueId:item?.clubId;
  if(!item||item.archived||!valid(groupId)||!(kind==="poll"?item.question:item.title))return;
  const path=event.data.ref.path,ref=db.doc(`notificationOutbox/${hash(path)}`);
  await db.runTransaction(async tx=>{const old=await tx.get(ref);if(!old.exists)tx.set(ref,{status:"pending",scope,kind,groupId,path,dueAtMs:Number(item.publishDateMs)||now(),createdAt:FieldValue.serverTimestamp()});});
  await publish(ref);
 };}
 const exports={
  onFieldWinnersStoryReady:updated({document:"leagueVenues/{venueId}",region,retry:true,timeoutSeconds:180},async event=>{
   const venue=event.data?.after.data(),season=venue?.league?.activeSeason,fixtures=season?.fixtures;
   if(!season?.id||!Array.isArray(fixtures)||!fixtures.length||season.isTest||season.isPracticeMode||!fixtures.every(f=>f.status==="completed"))return;
   if(Object.values(season.liveMatches||{}).some(match=>match?.status==="live"))return;
   const venueId=event.params.venueId,staff=await db.collection(`leagueVenues/${venueId}/staff`).get(),ids=new Set([venue.ownerUid].filter(valid));
   for(const item of staff.docs)if(item.data().status==="active"&&item.data().isAdministrator===true)ids.add(item.id);
   await reliableBatch({db,messaging,tokenRecords:await registeredTokens(db,[...ids]),title:`${venue.name||"Field"} · Celebrate the champions`,body:"Confirm the final standings, take a winners photo and publish your league story.",imageUrl:await groupImage(venue),data:{type:"field_winners_story_request",route:"field-news",venueId,seasonId:season.id,sourceName:String(venue.name||"Field"),groupLogoUrl:await groupImage(venue)}});
  }),
  onClubStoryPublished:created({document:"newsStories/{storyId}",region,retry:true,timeoutSeconds:180},handler("club","story")),
  onClubPollCreated:created({document:"newsPolls/{pollId}",region,retry:true,timeoutSeconds:180},handler("club","poll")),
  onFieldStoryPublished:created({document:"leagueVenues/{venueId}/newsStories/{storyId}",region,retry:true,timeoutSeconds:180},handler("field","story")),
  onFieldPollPublished:created({document:"leagueVenues/{venueId}/newsPolls/{pollId}",region,retry:true,timeoutSeconds:180},handler("field","poll")),
 };
 const drain=async()=>{const due=await db.collection("notificationOutbox").where("dueAtMs","<=",now()).limit(100).get();const failures=[];for(const item of due.docs)try{await publish(item.ref);}catch(error){console.error("[FANM publication] Retry pending",{id:item.id,error:error.message});failures.push(error);}if(failures.length)throw Error("Some publication notifications remain queued.");};
 exports.deliverScheduledPublications=testOnly?drain:onSchedule({schedule:"every 5 minutes",region,retryCount:3,timeoutSeconds:540},drain);
 return exports;
}
module.exports={notificationSource,valid,badge,groupImage,preview,clubAudience,allFieldAudience,registeredTokens,reliableBatch,sendMulticast,publicationHandlers};
