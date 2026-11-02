const {createHash}=require("node:crypto");
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
 for(const m of active)for(const value of [m.id,m.playerId,m.sourcePlayerId,m.memberId,m.uid,m.email,m.fullName,m.shortName,m.displayName]){
  if(!value)continue;const k=key(value);if(!aliases.has(k))aliases.set(k,new Set());aliases.get(k).add(m.id);
 }
 const resolve=value=>{
  const values=value&&typeof value==="object"?[value.playerId,value.sourcePlayerId,value.memberId,value.uid,value.id,value.fullName,value.name,value.displayName,value.shortName]:[value];
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
 const rooms=base.rooms.filter(r=>base.member&&r.memberIds.has(base.member.id)).map(r=>({...r,seasonId:base.seasonId}));
 return {...base,rooms,club:club.data()};
}
async function handle({db,user,body,now=Date.now()}){
 const {clubId,teamId}=body;
 if(body.action==="setMatchNumber")return require("./clubMatchNumbers.cjs").save({db,user,body});
 if(body.action==="prepareOperator")return require("./clubStateOperator.cjs").prepare({db,user,clubId});
 if(body.action==="rooms"){
  const ctx=await context(db,user,clubId);
  return {canManage:false,hasTeams:ctx.rooms.length>0,rooms:await Promise.all(ctx.rooms.map(async({team,seasonId,captainMemberIds})=>({id:team.id,seasonId,name:team.label||team.name||"Team",logoUrl:await teamLogo(team),flag:teamFlag(team),unreadCount:await require("./teamChatReadState.cjs").unread(db,`privateTeamChats/${roomKey(clubId,seasonId,team.id)}`,user.uid),captains:ctx.active.filter(m=>captainMemberIds.has(m.id)).map(m=>m.shortName||m.fullName||"Captain")})))};
 }
 if(!valid(teamId))throw Error("Choose one of your teams.");
 if(body.action==="send"){
  const text=String(body.text||"").trim();if((!text&&!body.highlight)||text.length>2000||!valid(body.requestId))throw Error("Write a message of up to 2,000 characters.");
  return db.runTransaction(async tx=>{
   const ctx=await context(db,user,clubId,tx),room=ctx.rooms.find(r=>r.team.id===teamId);
   if(!room)throw Error("Only current team members may use this chat.");
   if(body.seasonId&&body.seasonId!==room.seasonId)throw Error("This team session has changed. Reopen your chat.");
   const roomId=roomKey(clubId,room.seasonId,teamId),id=createHash("sha256").update(user.uid+":"+body.requestId).digest("hex"),ref=db.doc(`privateTeamChats/${roomId}/messages/${id}`);
   if((await tx.get(ref)).exists)return {sent:true};
   const extras=await require("./teamChatFeatures.cjs").extra({db,tx,body,path:`privateTeamChats/${roomId}`,clubId,members:ctx.active.filter(m=>room.memberIds.has(m.id))});
   tx.set(ref,{...extras,clubId,seasonId:room.seasonId,teamId,teamName:room.team.label||room.team.name||"Team",senderUid:user.uid,senderName:ctx.member.shortName||ctx.member.fullName||"Player",senderIsCaptain:room.captainMemberIds.has(ctx.member.id),text:text||"Shared a highlight",createdAtMs:now,createdAt:FieldValue.serverTimestamp()});
   return {sent:true};
  });
 }
 if(["react","delete"].includes(body.action))return db.runTransaction(async tx=>{
  const ctx=await context(db,user,clubId,tx),room=ctx.rooms.find(r=>r.team.id===teamId);
  if(!room||body.seasonId!==room.seasonId)throw Error("This team session has changed. Reopen your chat.");
  return require("./teamChatFeatures.cjs").mutate({db,tx,path:`privateTeamChats/${roomKey(clubId,room.seasonId,teamId)}`,user,body,canModerate:room.captainMemberIds.has(ctx.member.id)||ctx.member.role==="admin"});
 });
 const ctx=await context(db,user,clubId),room=ctx.rooms.find(r=>r.team.id===teamId);
 if(!room)throw Error("Only current team members may use this chat.");
   if(body.seasonId&&body.seasonId!==room.seasonId)throw Error("This team session has changed. Reopen your chat.");
 const roomId=roomKey(clubId,room.seasonId,teamId),preference=db.doc(`privateTeamChats/${roomId}/preferences/${user.uid}`);
 if(body.action==="mute"){
  if(typeof body.muted!=="boolean")throw Error("Choose a notification setting.");
  await preference.set({muted:body.muted},{merge:true});return {muted:body.muted};
 }
 if(body.action==="highlights")return require("./teamChatFeatures.cjs").highlights(db,clubId);
 if(body.action!=="messages")throw Error("Unknown team chat action.");
 const [messages,pref]=await Promise.all([db.collection(`privateTeamChats/${roomId}/messages`).orderBy("createdAtMs","desc").limit(60).get(),preference.get()]);
 if(body.markRead===true)await require("./teamChatReadState.cjs").markRead(db,preference,messages.docs);
 return {...await require("./teamChatFeatures.cjs").view({db,clubId,members:ctx.active.filter(m=>room.memberIds.has(m.id)),captainIds:[...room.captainMemberIds],messages}),canModerate:room.captainMemberIds.has(ctx.member.id)||ctx.member.role==="admin",muted:pref.data()?.muted===true};
}
function teamFlag(team){
 const normalize=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const identity=team?.teamIdentity||{},aliases=[identity.name,identity.abbr,team?.label,team?.name,team?.abbrev].map(normalize).filter(Boolean);
 if(identity.flag)return identity.flag;
 if(identity.type==="club")return "";
 const catalog=require("./teamBadgeCatalog.cjs"),named=catalog.find(r=>r.flag&&aliases.includes(normalize(r.name)));
 if(named)return named.flag;
 if(identity.type!=="national"&&catalog.some(r=>!r.flag&&aliases.includes(normalize(r.abbr))))return "";
 return catalog.find(r=>r.flag&&aliases.includes(normalize(r.abbr)))?.flag||"";
}
async function teamLogo(team){
 const media=require("./notificationMedia.cjs");
 try{
  const identity=team?.teamIdentity||{},raw=identity.fantasyLogo32||identity.logo32||identity.badgeUrl||identity.logoUrl||team?.logoUrl||"";
  let logo=await media.publicImage(raw);if(logo)return logo;
  if(teamFlag(team))return "";
  const normalize=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const aliases=[identity.abbr,identity.name,identity.shortName,team?.abbrev,team?.label,team?.name].map(normalize).filter(Boolean);
  const canonical=require("./teamBadgeCatalog.cjs").find(r=>aliases.includes(normalize(r.abbr))||aliases.includes(normalize(r.name)));
  const asset=String(raw).match(/(?:^|\/)([A-Z]{2,4})(?:-[A-Za-z0-9_-]+)?\.(?:png|svg)(?:\?.*)?$/);
  if(canonical?.flag)return "";
  const abbr=String(asset?.[1]||canonical?.abbr||identity.abbr||team?.abbrev||"").toUpperCase();
  if(/^[A-Z]{2,4}$/.test(abbr))logo=await media.publicImage("data:image/png;base64,"+require("node:fs").readFileSync(require("node:path").join(__dirname,"notification-team-assets",abbr+".png")).toString("base64"));
  return logo;
 }catch(error){console.warn("[TeamChat] Badge unavailable",error.message);return "";}
}

async function notify({db,messaging,event,auth,includeSenderForTesting=false}){
 const message=event.data?.data();if(!message)return;
 let sender;try{sender=await auth.getUser(message.senderUid);}catch(error){if(error.code==="auth/user-not-found")return;throw error;}
 if(!sender.emailVerified||sender.disabled)return;
 const ctx=await context(db,{uid:message.senderUid,email_verified:true},message.clubId);
 const room=ctx.rooms.find(r=>r.team.id===message.teamId&&r.seasonId===message.seasonId);if(!room)return;
 const ids=[];const team=room.team;
 for(const uid of room.memberUids.filter(uid=>includeSenderForTesting||uid!==message.senderUid)){
  let account;try{account=await auth.getUser(uid);}catch(error){if(error.code==="auth/user-not-found")continue;throw error;}
  if(!account.emailVerified||account.disabled)continue;
  const pref=await db.doc(`privateTeamChats/${roomKey(message.clubId,message.seasonId,message.teamId)}/preferences/${uid}`).get();if(!pref.data()?.muted)ids.push(uid);
 }
 if(!ids.length){console.info("[TeamChatPush] No eligible unmuted teammates",{clubId:message.clubId,teamId:message.teamId,senderIncludedForTesting:includeSenderForTesting});return;}
 const media=require("./notificationMedia.cjs"),runtime=require("./notificationRuntime.cjs");
 const logo=await teamLogo(team);
 const senderName=await require("./notificationSender.cjs").displayName(db,{uid:message.senderUid,clubId:message.clubId,fallback:message.senderName});
 const club=(await db.doc(`clubs/${message.clubId}`).get()).data()||{};
 const tokenRecords=await runtime.registeredTokens(db,ids);
 console.info("[TeamChatPush] Sending",{clubId:message.clubId,teamId:message.teamId,recipients:ids.length,devices:tokenRecords.length,senderIncludedForTesting:includeSenderForTesting});
 const result=await runtime.reliableBatch({db,messaging,tokenRecords,title:`${senderName} · ${message.teamName} · ${club.name||"Club"}`,body:message.text.slice(0,170),data:{type:"club_team_chat",route:"club-chat",clubId:message.clubId,teamId:message.teamId,seasonId:message.seasonId,messageId:event.params.messageId,senderName,senderUid:message.senderUid,sentAtMs:String(message.createdAtMs||Date.now()),groupLogoUrl:logo,groupFlag:teamFlag(team),sourceName:message.teamName,senderPhotoUrl:await media.senderPortrait(db,message.clubId,message.senderUid)}});
 console.info("[TeamChatPush] Delivery complete",{clubId:message.clubId,teamId:message.teamId,...result});
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
