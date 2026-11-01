const {createHash,randomUUID}=require("node:crypto");
const {FieldValue}=require("firebase-admin/firestore");
const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(v);
const key=v=>String(v||"").trim().toLowerCase();
const roomKey=(clubId,seasonId,teamId)=>createHash("sha256").update(JSON.stringify([clubId,seasonId,teamId])).digest("hex");
function teamContext(state,members,user,{all=false}={}){
 if(!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==="anonymous")throw Error("Sign in with your verified player account.");
 const active=members.filter(m=>m.status==="active");
 const mine=active.filter(m=>m.uid===user.uid);
 if(mine.length!==1&&!all)throw Error("Your active Club membership could not be verified.");
 const aliases=new Map();
 for(const m of active)for(const value of [m.id,m.playerId,m.uid,m.email,m.fullName,m.shortName]){
  if(!value)continue;const k=key(value);if(!aliases.has(k))aliases.set(k,new Set());aliases.get(k).add(m.id);
 }
 const resolve=value=>{
  const values=value&&typeof value==="object"?[value.playerId,value.memberId,value.uid,value.id,value.fullName,value.shortName]:[value];
  const resolved=new Set();for(const v of values){const ids=aliases.get(key(v));if(ids?.size===1)resolved.add([...ids][0]);}
  return resolved.size===1?[...resolved][0]:null;
 };
 const season=Array.isArray(state?.seasons)?state.seasons.find(s=>s.seasonId===state.activeSeasonId):state;
 if(!season)return {seasonId:"",rooms:[],member:mine[0],active};
 const baseSeasonId=String(season.seasonId||state.activeSeasonId||"legacy");
 const mode=String(season.matchType||"").toUpperCase()==="FRIENDLY"?"friendly":"league";
 const cycle=(season.friendlyMatchDayHistory||[]).length;
 const seasonId=mode==="friendly"?`${baseSeasonId}:friendly:${cycle}`:baseSeasonId;
 const rooms=(mode==="friendly"?season.fiveVFiveTeams||[]:season.teams||[]).filter(t=>valid(t.id)).map(team=>{
  const memberIds=new Set((team.players||[]).map(resolve).filter(Boolean));
  const captainMemberIds=new Set();
  for(const value of [team.captainId,team.captain,team.captainName,team.captainEmail]){const id=resolve(value);if(id){memberIds.add(id);captainMemberIds.add(id);}}
  return {team,captainMemberIds,memberIds,memberUids:[...new Set(active.filter(m=>memberIds.has(m.id)&&m.uid).map(m=>m.uid))]};
 }).filter(room=>all||room.memberIds.has(mine[0].id));
 return {seasonId,baseSeasonId,mode,cycle,rooms,member:mine[0],active};
}
async function context(db,user,clubId,tx){
 if(!valid(clubId))throw Error("Choose a valid Club.");
 const read=ref=>tx?tx.get(ref):ref.get();
 const [club,state,members]=await Promise.all([read(db.doc(`clubs/${clubId}`)),read(db.doc(`clubs/${clubId}/state/main`)),read(db.collection(`clubs/${clubId}/members`))]);
 if(!club.exists||club.data().deleted)throw Error("This Club is unavailable.");
 const memberRecords=members.docs.map(d=>({...d.data(),id:d.id}));
 const base=teamContext(state.data()?.state||{},memberRecords,user,{all:true});
 const access=await read(db.collection(`privateTeamChatAccess/${clubId}/rooms`).where("active","==",true));
 const rooms=access.docs.map(d=>d.data()).filter(r=>r.active===true&&(r.scopeKey||r.seasonId)===base.seasonId&&(r.mode!=="friendly"||r.expiresAtMs>Date.now())&&base.member&&(r.memberIds||[]).includes(base.member.id)&&base.rooms.some(current=>current.team.id===r.team.id&&current.memberIds.has(base.member.id))).map(r=>({...r,memberIds:new Set(r.memberIds),memberUids:[...new Set(base.active.filter(m=>r.memberIds.includes(m.id)&&m.uid&&base.rooms.some(current=>current.team.id===r.team.id&&current.memberIds.has(m.id))).map(m=>m.uid))]}));
 const canManage=[club.data().ownerUid,club.data().createdByUid,...(club.data().adminUids||[])].includes(user.uid)||base.member?.role==="admin";
 return {...base,proposed:base.rooms,rooms,access,canManage,club:club.data()};
}
async function handle({db,user,body,now=Date.now()}){
 const {clubId,teamId}=body;
 if(body.action==="rooms"){
  const ctx=await context(db,user,clubId);
  return {canManage:ctx.canManage,hasTeams:ctx.proposed.some(r=>r.memberIds.size>0),rooms:ctx.rooms.map(({team,seasonId,captainMemberIds=[]})=>({id:team.id,seasonId,name:team.label||team.name||"Team",captains:ctx.active.filter(m=>Array.from(captainMemberIds).includes(m.id)).map(m=>m.shortName||m.fullName||"Captain")}))};
 }
 if(["setupPreview","setupSave"].includes(body.action)){
  return db.runTransaction(async tx=>{
   const ctx=await context(db,user,clubId,tx);if(!ctx.canManage)throw Error("Only a Club admin may confirm team access.");
   const proposed=ctx.proposed.filter(r=>r.memberIds.size>0).map(r=>({team:r.team,memberIds:[...r.memberIds].sort(),captainMemberIds:[...r.captainMemberIds].sort(),seasonId:ctx.seasonId,baseSeasonId:ctx.baseSeasonId,mode:ctx.mode,cycle:ctx.cycle}));
   const fingerprint=createHash("sha256").update(JSON.stringify(proposed)).digest("hex");
   if(body.action==="setupPreview")return {fingerprint,teams:proposed.map(r=>({name:r.team.label||r.team.name||"Team",members:ctx.active.filter(m=>r.memberIds.includes(m.id)).map(m=>m.fullName||m.shortName||"Player")}))};
   if(body.fingerprint!==fingerprint)throw Error("The squads changed. Review team access again.");
   for(const old of ctx.access.docs)if((old.data().mode||"league")===ctx.mode)tx.set(old.ref,{active:false},{merge:true});
   for(const room of proposed){
    const existing=ctx.access.docs.map(d=>d.data()).find(r=>r.active&&r.mode==="friendly"&&(r.scopeKey||r.seasonId)===room.seasonId&&r.team?.id===room.team.id&&r.expiresAtMs>now);
    const seasonId=room.mode==="friendly"?existing?.seasonId||`${room.seasonId}:${randomUUID()}`:room.seasonId;
    tx.set(db.doc(`privateTeamChatAccess/${clubId}/rooms/${roomKey(clubId,seasonId,room.team.id)}`),{...room,scopeKey:room.seasonId,seasonId,active:true,...(room.mode==="friendly"?{expiresAtMs:existing?.expiresAtMs||now+24*60*60*1000}:{}),approvedByUid:user.uid,updatedAt:FieldValue.serverTimestamp()});
   }
   return {saved:true};
  });
 }
 if(!valid(teamId))throw Error("Choose one of your teams.");
 if(body.action==="send"){
  const text=String(body.text||"").trim();if(!text||text.length>2000||!valid(body.requestId))throw Error("Write a message of up to 2,000 characters.");
  return db.runTransaction(async tx=>{
   const ctx=await context(db,user,clubId,tx),room=ctx.rooms.find(r=>r.team.id===teamId);
   if(!room)throw Error("Only current team members may use this chat.");
   if(body.seasonId&&body.seasonId!==room.seasonId)throw Error("This team session has changed. Reopen your chat.");
   const roomId=roomKey(clubId,room.seasonId,teamId),id=createHash("sha256").update(user.uid+":"+body.requestId).digest("hex"),ref=db.doc(`privateTeamChats/${roomId}/messages/${id}`);
   if((await tx.get(ref)).exists)return {sent:true};
   tx.set(ref,{clubId,seasonId:room.seasonId,teamId,teamName:room.team.label||room.team.name||"Team",senderUid:user.uid,senderName:ctx.member.shortName||ctx.member.fullName||"Player",senderIsCaptain:(room.captainMemberIds||[]).includes(ctx.member.id),text,createdAtMs:now,createdAt:FieldValue.serverTimestamp()});
   return {sent:true};
  });
 }
 const ctx=await context(db,user,clubId),room=ctx.rooms.find(r=>r.team.id===teamId);
 if(!room)throw Error("Only current team members may use this chat.");
   if(body.seasonId&&body.seasonId!==room.seasonId)throw Error("This team session has changed. Reopen your chat.");
 const roomId=roomKey(clubId,room.seasonId,teamId),preference=db.doc(`privateTeamChats/${roomId}/preferences/${user.uid}`);
 if(body.action==="mute"){
  if(typeof body.muted!=="boolean")throw Error("Choose a notification setting.");
  await preference.set({muted:body.muted});return {muted:body.muted};
 }
 if(body.action!=="messages")throw Error("Unknown team chat action.");
 const [messages,pref]=await Promise.all([db.collection(`privateTeamChats/${roomId}/messages`).orderBy("createdAtMs","desc").limit(60).get(),preference.get()]);
 return {messages:messages.docs.map(d=>({id:d.id,senderName:d.data().senderName,senderUid:d.data().senderUid,senderIsCaptain:d.data().senderIsCaptain===true,text:d.data().text,createdAtMs:d.data().createdAtMs})).reverse(),muted:pref.data()?.muted===true};
}
async function notify({db,messaging,event,auth}){
 const message=event.data?.data();if(!message)return;
 let sender;try{sender=await auth.getUser(message.senderUid);}catch(error){if(error.code==="auth/user-not-found")return;throw error;}
 if(!sender.emailVerified||sender.disabled)return;
 const ctx=await context(db,{uid:message.senderUid,email_verified:true},message.clubId);
 const room=ctx.rooms.find(r=>r.team.id===message.teamId&&r.seasonId===message.seasonId);if(!room)return;
 const ids=[];const team=room.team;
 for(const uid of room.memberUids.filter(uid=>uid!==message.senderUid)){
  let account;try{account=await auth.getUser(uid);}catch(error){if(error.code==="auth/user-not-found")continue;throw error;}
  if(!account.emailVerified||account.disabled)continue;
  const pref=await db.doc(`privateTeamChats/${roomKey(message.clubId,message.seasonId,message.teamId)}/preferences/${uid}`).get();if(!pref.data()?.muted)ids.push(uid);
 }
 if(!ids.length)return;
 const media=require("./notificationMedia.cjs"),runtime=require("./notificationRuntime.cjs");
 let logo=await media.publicImage(team?.teamIdentity?.fantasyLogo32||team?.teamIdentity?.logo32||team?.teamIdentity?.badgeUrl||team?.teamIdentity?.logoUrl||team?.logoUrl||"");
 if(!logo){const asset=String(team?.teamIdentity?.fantasyLogo32||team?.teamIdentity?.logo32||team?.teamIdentity?.logoUrl||"").match(/(?:^|\/)([A-Z]{2,4})(?:-[A-Za-z0-9_-]+)?\.png(?:\?.*)?$/);const abbr=String(asset?.[1]||team?.teamIdentity?.abbr||team?.abbrev||"").toUpperCase();if(/^[A-Z]{2,4}$/.test(abbr)){try{logo=await media.publicImage("data:image/png;base64,"+require("node:fs").readFileSync(require("node:path").join(__dirname,"notification-team-assets",abbr+".png")).toString("base64"));}catch{/* Missing artwork keeps a named team badge. */}}}
 const club=(await db.doc(`clubs/${message.clubId}`).get()).data()||{};
 await runtime.reliableBatch({db,messaging,tokenRecords:await runtime.registeredTokens(db,ids),title:`${message.senderName} · ${message.teamName} · ${club.name||"Club"}`,body:message.text.slice(0,170),data:{type:"club_team_chat",route:"club-chat",clubId:message.clubId,teamId:message.teamId,seasonId:message.seasonId,messageId:event.params.messageId,groupLogoUrl:logo,sourceName:message.teamName,senderPhotoUrl:await media.senderPortrait(db,message.clubId,message.senderUid)}});
}
async function closeFriendly({db,event}){
 const after=event.data?.after;if(!after?.exists)return;
 const raw=after.data()?.state||{},season=raw.seasons?.find(s=>s.seasonId===raw.activeSeasonId)||(!raw.seasons?raw:null);
 const beforeRaw=event.data?.before?.data()?.state||{},before=beforeRaw.seasons?.find(s=>s.seasonId===beforeRaw.activeSeasonId)||(!beforeRaw.seasons?beforeRaw:null);
 if(!before||String(before.matchType||"").toUpperCase()!=="FRIENDLY")return;
 const baseId=String(before.seasonId||beforeRaw.activeSeasonId||"legacy"),ended=String(season?.seasonId||raw.activeSeasonId||"legacy")!==baseId||String(season?.matchType||"").toUpperCase()!=="FRIENDLY"||(season.friendlyMatchDayHistory||[]).length>(before.friendlyMatchDayHistory||[]).length;
 if(!ended)return;
 const access=await db.collection(`privateTeamChatAccess/${event.params.clubId}/rooms`).get();
 for(const snap of access.docs){const room=snap.data();if(room.active&&room.mode==="friendly"&&room.baseSeasonId===baseId&&(!room.updatedAt?.toMillis||room.updatedAt.toMillis()<=after.updateTime.toMillis()))await snap.ref.set({active:false},{merge:true});}
}
module.exports={teamContext,roomKey,handle,notify,closeFriendly};
