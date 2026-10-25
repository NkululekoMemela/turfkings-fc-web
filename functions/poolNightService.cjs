const {isAdmin,creatorUid}=require("./poolAdminPolicy.cjs");
const {randomBytes,randomUUID,createHash}=require("node:crypto");
const validUser=user=>Boolean(user?.uid&&user.email_verified===true&&!user.cameraSession);
const fail=message=>{throw new Error(message);};
const integer=(value,min,max,label)=>Number.isInteger(value)&&value>=min&&value<=max?value:fail(label);
const text=(value,max=40)=>String(value||"").trim().replace(/\s+/g," ").slice(0,max);
async function handle({db,user,body}){
 if(!validUser(user))fail("Sign in with a verified account to join the night.");
 const engine=await import("./poolEngine.mjs");
 const action=body.action,code=String(body.code||"").trim().toUpperCase();
 if(action==="list"){
  const {FieldPath}=require("firebase-admin/firestore");
  const nights=db.collection("poolNights");
  const snapshots=await Promise.all([nights.where("ownerUid","==",user.uid).limit(100).get(),nights.where("createdByUid","==",user.uid).limit(100).get(),nights.where(new FieldPath("members",user.uid,"status"),"in",["approved","pending"]).limit(100).get()]);
  const unique=new Map();for(const snapshot of snapshots)for(const doc of snapshot.docs){
   if(!/^[A-F0-9]{10}$/.test(doc.id))continue;let night=doc.data();if(require("./poolRetention.cjs").expired(night))night=await require("./poolRetention.cjs").archive(db,doc.id,{automatic:true});const owner=isAdmin(night,user.uid),status=night.members?.[user.uid]?.status;
   if(!owner&&!["approved","pending"].includes(status))continue;
   unique.set(doc.id,{code:doc.id,title:night.title,role:owner?"admin":status==="pending"?"pending":"player",createdAt:night.createdAt||0,endedAt:night.endedAt||0,deletedAt:night.deletedAt||0,deleted:night.lifecycle==="deleted",canDelete:creatorUid(night)===user.uid&&night.lifecycle==="ended",canRestore:creatorUid(night)===user.uid&&night.lifecycle==="deleted"&&Date.now()-night.deletedAt<require("./poolRetention.cjs").week,revision:night.revision,hasContribution:["due","deferred"].includes(night.contribution?.state),updatedAt:night.updatedAt||night.createdAt||0,playing:owner||status==="approved"?night.pool.active.length:0,games:owner||status==="approved"?night.pool.matches.length:0,attention:night.lifecycle!=="deleted"?[...(owner?night.pool.matches.filter(m=>m.verification!=="verified").map(m=>({id:m.id,submittedAt:m.submittedAt,needsScore:m.verification==="needsScore"})):[]),...(night.contribution?.requestedUid===user.uid&&! ["paid","coupon","deferred"].includes(night.contribution.state)?[{id:"contribution:"+(night.contribution.requestId||"legacy"),kind:"contribution",submittedAt:night.contribution.requestedAt||0,requesterName:night.members?.[night.contribution.requestedByUid]?.name||"Your admin"}]:[])]:[]});
  }
  return {nights:[...unique.values()].sort((a,b)=>b.updatedAt-a.updatedAt),hasMore:snapshots.some(snapshot=>snapshot.docs.length===100)};
 }

 if(action==="create"){
  await require("./poolBilling.cjs").checkCreate(db,user);
  const requestId=body.requestId?String(body.requestId):"";
  if(requestId&&!/^[A-Fa-f0-9-]{36}$/.test(requestId))fail("Invalid night creation request.");
  const name=text(body.name||user.name);if(!name)fail("Enter your player name.");
  const tables=integer(body.tables,1,20,"Choose 1 to 20 tables.");
  const coins=integer(body.coins,0,10000,"Enter a whole number of coins.");
  for(let attempt=0;attempt<3;attempt++){
   const id=requestId?createHash("sha256").update(`${user.uid}:${requestId}:${attempt}`).digest("hex").slice(0,10).toUpperCase():randomBytes(5).toString("hex").toUpperCase(),ref=db.doc(`poolNights/${id}`);
   const pool={...engine.migratePool(engine.emptyPool()),tables,coins,coinSpan:coins,players:[{id:user.uid,name,present:true,arrival:"normal",joinedAtGame:0}],matches:[]};
   const data={lifecycle:"active",lastActivityAt:Date.now(),version:1,revision:1,ownerUid:user.uid,createdByUid:user.uid,createRequestId:requestId,title:text(body.title||"Pool night",60),createdAt:Date.now(),updatedAt:Date.now(),members:{[user.uid]:{name,status:"approved",joinedAt:Date.now()}},pool,audit:[]};
   try{await ref.create(data);return {code:id,...data};}catch(error){
    if(error.code!==6&&error.code!=="already-exists")throw error;
    if(requestId){const existing=(await ref.get()).data();if(existing?.createdByUid===user.uid&&existing.createRequestId===requestId)return {code:id,...existing};}
   }
  }
  fail("Could not create a night. Please retry.");
 }
 if(!/^[A-F0-9]{10}$/.test(code))fail("Enter the ten-character night code.");
 if(["deleteNight","restoreNight"].includes(action)){
  const n=await require("./poolRetention.cjs").archive(db,code,{uid:user.uid,revision:body.revision,confirmation:body.confirmation,restore:action==="restoreNight"});return {code,...n,membership:"approved"};
 }
 if(action==="resumeNight"){const n=await require("./poolLifecycle.cjs").resume(db,code,{uid:user.uid,revision:body.revision});return {code,...n,membership:"approved"};}
 if(action==="endNight"){
  const night=await require("./poolLifecycle.cjs").close(db,code,{uid:user.uid,revision:body.revision});return {code,...night,membership:"approved"};
 }
 if(action==="load"){
  const ref=db.doc(`poolNights/${code}`),existing=(await ref.get()).data();
  if(existing&&(isAdmin(existing,user.uid)||existing.members?.[user.uid]?.status==="approved")){
   await require("./poolLifecycle.cjs").close(db,code,{automatic:true});
   await require("./poolRetention.cjs").archive(db,code,{automatic:true});
   if(!existing.lifecycle)await db.runTransaction(async tx=>{const n=(await tx.get(ref)).data();if(!n.lifecycle)tx.set(ref,{...n,lifecycle:"active",lastActivityAt:require("./poolLifecycle.cjs").lastGameAt(n),revision:n.revision+1});});
  }
 }
 return db.runTransaction(async tx=>{
  const ref=db.doc(`poolNights/${code}`),snapshot=await tx.get(ref);if(!snapshot.exists)fail("That night was not found.");
  const current=snapshot.data();if(current.version!==1)fail("This night needs a newer app.");
  const owner=isAdmin(current,user.uid),member=current.members?.[user.uid];
  const view=night=>{
   if(!owner&&night.members?.[user.uid]?.status!=="approved")return {code,title:night.title,revision:night.revision,membership:night.members?.[user.uid]?.status||"none"};
   if(action==="load"&&body.revision===night.revision)return {code,revision:night.revision,unchanged:true};
   return {code,...night,membership:"approved"};
  };
  if(action==="load")return view(current);
  if(current.lifecycle==="deleted")fail("This night was deleted. Its creator may restore it during the recovery period.");
  if(action==="join"){
   if(current.lifecycle==="ended")fail("This tournament has ended. Ask for the next night’s code.");
   if(member&&member.status!=="removed")return view(current);
   if(Object.keys(current.members).length>=100)fail("This night has reached its player limit.");
   const name=text(body.name||user.name);if(!name)fail("Enter your player name.");
   const next={...current,revision:current.revision+1,updatedAt:Date.now(),members:{...current.members,[user.uid]:{name,status:"pending",joinedAt:Date.now()}}};
   tx.set(ref,next);tx.set(db.doc(`poolNights/${code}/alerts/join-${randomUUID()}`),{kind:"join",subjectUid:user.uid,createdAt:Date.now()});return view(next);
  }
  if(!owner&&member?.status!=="approved")fail("The host must approve you before you can log scores.");
  if(current.lifecycle==="ended"&&!["verify","correct","completeScore","transferAdmin"].includes(action))fail("This tournament has ended. Its scores are saved.");
  if(require("./poolBilling.cjs").decisionRequired(current,user.uid))fail("Choose a contribution option to continue: pay, ask a teammate, use a coupon, or pay next time.");
  if(body.revision!==current.revision)fail("The night changed on another phone. Refresh and try again.");
  let next={...current,pool:{...current.pool}};
  const adminOnly=new Set(["approveMember","rejectMember","settings","presence","cancel","verify","correct","transferAdmin","removePlayer"]);
  if(adminOnly.has(action)&&!owner)fail("Only the night admin can do that.");
  if(action==="removePlayer"){
   const target=String(body.uid||"");
   if(target===creatorUid(current))fail("The tournament creator keeps admin access and cannot be removed.");
   if(target===current.ownerUid)fail("Appoint another admin before removing the current primary admin.");
   if(current.members?.[target]?.status!=="approved"||!next.pool.players.some(player=>player.id===target))fail("Choose an approved player in this night.");
   if(next.pool.active.some(game=>[game.a,game.b].includes(target)))fail("Finish or cancel their active game before removing them.");
   const hasHistory=next.pool.matches.some(game=>[game.a,game.b].includes(target));
   next.pool.players=hasHistory?next.pool.players.map(player=>player.id===target?{...player,present:false,removed:true}:player):next.pool.players.filter(player=>player.id!==target);
   next.members={...current.members,[target]:{...current.members[target],status:"removed",removedAt:Date.now(),removedByUid:user.uid}};
   next.audit=[...(current.audit||[]),{id:randomUUID(),action:"removePlayer",subjectUid:target,byUid:user.uid,at:Date.now(),historyPreserved:hasHistory}];
  }else if(action==="transferAdmin"){
   const target=String(body.uid||"");
   if(target===current.ownerUid)fail("That player is already the primary admin.");
   if(current.members?.[target]?.status!=="approved"||!next.pool.players.some(player=>player.id===target&&player.present!==false))fail("Choose an approved player who is here tonight.");
   next.createdByUid=creatorUid(current);next.ownerUid=target;
   if(next.contribution&&!next.contribution.orderId)next.contribution={...next.contribution,requestedUid:null};
   next.audit=[...(current.audit||[]),{id:randomUUID(),action:"transferAdmin",byUid:user.uid,previousOwnerUid:current.ownerUid,nextOwnerUid:target,at:Date.now()}];
  }else if(action==="approveMember"||action==="rejectMember"){
   const target=String(body.uid||""),entry=current.members[target];if(!entry||entry.status!=="pending")fail("This join request is no longer pending.");
   next.members={...current.members,[target]:{...entry,status:action==="approveMember"?"approved":"rejected"}};
   if(action==="approveMember")next.pool.players=next.pool.players.some(player=>player.id===target)?next.pool.players.map(player=>player.id===target?{...player,name:entry.name,present:true,removed:false,joinedAtGame:next.pool.matches.length}:player):[...next.pool.players,{id:target,name:entry.name,present:true,arrival:"normal",joinedAtGame:next.pool.matches.length}];
  }else if(action==="settings"){
   const tables=integer(body.tables,1,20,"Choose 1 to 20 tables.");
   if(next.pool.active.some(game=>game.table>tables))fail("Finish games before removing those tables.");
   if(!["rotation","winner"].includes(body.mode))fail("Choose a valid game mode.");
   next.pool={...engine.reconcileCoins(next.pool,integer(body.coins,0,10000,"Enter unused coins.")),tables,mode:body.mode};
  }else if(action==="presence"){
   if(next.pool.active.some(game=>[game.a,game.b].includes(body.uid)))fail("Finish the active game first.");
   if(!next.pool.players.some(player=>player.id===body.uid))fail("Choose a player.");
   next.pool.players=next.pool.players.map(player=>player.id===body.uid?{...player,present:body.present===true,joinedAtGame:body.present===true?next.pool.matches.length:player.joinedAtGame}:player);
  }else if(action==="start"){
   const table=integer(body.table,1,next.pool.tables,"Choose a table.");
   const pair=body.a&&body.b?{a:body.a,b:body.b}:engine.suggestedPoolPairs(next.pool)[table];
   if(!owner&&(!pair||![pair.a,pair.b].includes(user.uid)))fail("Start your own game, or ask the host.");
   if(next.pool.matches.length>=500)fail("This night has reached 500 games. Start a new night.");
   next.pool=engine.beginPoolGame(next.pool,table,pair,Boolean(body.a&&body.b));
  }else if(action==="finishUnscored"){
   const game=next.pool.active.find(item=>item.id===body.matchId);if(!game)fail("This game has already finished or changed.");
   next.pool=engine.finishPoolGame(next.pool,game.id,{...game,winner:null,scoreA:null,scoreB:null});
   next.pool.matches=next.pool.matches.map(item=>item.id===game.id?{...item,verification:"needsScore",submittedByUid:user.uid,submittedAt:Date.now()}:item);
  }else if(action==="completeScore"){
   const game=next.pool.matches.find(item=>item.id===body.matchId&&item.verification==="needsScore");if(!game)fail("This game’s scores have already been entered.");
   if(!["score","black","foul"].includes(body.finish))fail("Choose the finish type.");
   const result=engine.poolResult(game,body.scoreA,body.scoreB,body.winner,body.finish==="black",body.finish==="foul");
   next.pool.matches=next.pool.matches.map(item=>item.id===game.id?{...item,...result,verification:"pending",submittedByUid:user.uid,submittedAt:Date.now()}:item);
  }else if(action==="submit"){
   const game=next.pool.active.find(item=>item.id===body.matchId);if(!game)fail("This game has already finished or changed.");
   if(!["score","black","foul"].includes(body.finish))fail("Choose the finish type.");
   const result=engine.poolResult(game,body.scoreA,body.scoreB,body.winner,body.finish==="black",body.finish==="foul");
   next.pool=engine.finishPoolGame(next.pool,game.id,result);
   next.pool.matches=next.pool.matches.map(item=>item.id===game.id?{...item,verification:"pending",submittedByUid:user.uid,submittedAt:Date.now()}:item);
  }else if(action==="cancel"){
   if(!next.pool.active.some(game=>game.id===body.matchId))fail("This game is no longer active.");
   next.pool.active=next.pool.active.filter(game=>game.id!==body.matchId);
  }else if(action==="verify"||action==="correct"){
   const game=next.pool.matches.find(item=>item.id===body.matchId);if(!game)fail("Choose a recorded game.");
   if(action==="verify"&&game.verification!=="pending")fail("This result is already verified.");
   let result=game;
   if(action==="correct"){
    if(!["score","black","foul"].includes(body.finish))fail("Choose the finish type.");
    result=engine.poolResult(game,body.scoreA,body.scoreB,body.winner,body.finish==="black",body.finish==="foul");
   }
   next.pool.matches=next.pool.matches.map(item=>item.id===game.id?{...result,verification:"verified",verifiedByUid:user.uid,verifiedAt:Date.now()}:item);
   next.audit=[...(current.audit||[]),{id:randomUUID(),action,matchId:game.id,byUid:user.uid,at:Date.now(),before:{scoreA:game.scoreA,scoreB:game.scoreB,winner:game.winner,blackBall:game.blackBall,blackFoul:game.blackFoul}}];
  }else fail("Choose a valid pool action.");
  if(next.lifecycle!=="ended"&&["submit","finishUnscored","completeScore"].includes(action))next.lastActivityAt=Date.now();
  if(next.lifecycle==="ended"&&["verify","correct"].includes(action)){next.finalStandings=engine.poolStandings(next.pool.players,next.pool.matches.filter(m=>m.verification==="verified"));next.pendingAtEnd=next.pool.matches.filter(m=>m.verification!=="verified").length;}
  next={...next,revision:current.revision+1,updatedAt:Date.now()};
  if(Buffer.byteLength(JSON.stringify(next))>800000)fail("This night is full. Start a new night.");
  tx.set(ref,next);
  const event=action==="transferAdmin"?{kind:"admin",subjectUid:next.ownerUid}:action==="approveMember"?{kind:"approved",subjectUid:String(body.uid)}:["submit","finishUnscored","completeScore"].includes(action)?{kind:"score",matchId:String(body.matchId)}:null;
  if(event)tx.set(db.doc(`poolNights/${code}/alerts/${randomUUID()}`),{...event,createdAt:Date.now()});
  return view(next);
 });
}
module.exports={handle,validUser};
