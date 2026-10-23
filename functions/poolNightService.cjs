const {randomBytes,randomUUID}=require("node:crypto");
const validUser=user=>Boolean(user?.uid&&user.email_verified===true&&!user.cameraSession);
const fail=message=>{throw new Error(message);};
const integer=(value,min,max,label)=>Number.isInteger(value)&&value>=min&&value<=max?value:fail(label);
const text=(value,max=40)=>String(value||"").trim().replace(/\s+/g," ").slice(0,max);
async function handle({db,user,body}){
 if(!validUser(user))fail("Sign in with a verified account to join the night.");
 const engine=await import("./poolEngine.mjs");
 const action=body.action,code=String(body.code||"").trim().toUpperCase();
 if(action==="create"){
  const name=text(body.name||user.name);if(!name)fail("Enter your player name.");
  const tables=integer(body.tables,1,20,"Choose 1 to 20 tables.");
  const coins=integer(body.coins,0,10000,"Enter a whole number of coins.");
  for(let attempt=0;attempt<3;attempt++){
   const id=randomBytes(5).toString("hex").toUpperCase(),ref=db.doc(`poolNights/${id}`);
   const pool={...engine.migratePool(engine.emptyPool()),tables,coins,coinSpan:coins,players:[{id:user.uid,name,present:true,arrival:"normal",joinedAtGame:0}],matches:[]};
   const data={version:1,revision:1,ownerUid:user.uid,title:text(body.title||"Pool night",60),createdAt:Date.now(),updatedAt:Date.now(),members:{[user.uid]:{name,status:"approved",joinedAt:Date.now()}},pool,audit:[]};
   try{await ref.create(data);return {code:id,...data};}catch(error){if(error.code!==6&&error.code!=="already-exists")throw error;}
  }
  fail("Could not create a night. Please retry.");
 }
 if(!/^[A-F0-9]{10}$/.test(code))fail("Enter the ten-character night code.");
 return db.runTransaction(async tx=>{
  const ref=db.doc(`poolNights/${code}`),snapshot=await tx.get(ref);if(!snapshot.exists)fail("That night was not found.");
  const current=snapshot.data();if(current.version!==1)fail("This night needs a newer app.");
  const owner=current.ownerUid===user.uid,member=current.members?.[user.uid];
  const view=night=>{
   if(!owner&&night.members?.[user.uid]?.status!=="approved")return {code,title:night.title,revision:night.revision,membership:night.members?.[user.uid]?.status||"none"};
   if(action==="load"&&body.revision===night.revision)return {code,revision:night.revision,unchanged:true};
   return {code,...night,membership:"approved"};
  };
  if(action==="load")return view(current);
  if(action==="join"){
   if(member)return view(current);
   if(Object.keys(current.members).length>=100)fail("This night has reached its player limit.");
   const name=text(body.name||user.name);if(!name)fail("Enter your player name.");
   const next={...current,revision:current.revision+1,updatedAt:Date.now(),members:{...current.members,[user.uid]:{name,status:"pending",joinedAt:Date.now()}}};
   tx.set(ref,next);return view(next);
  }
  if(!owner&&member?.status!=="approved")fail("The host must approve you before you can log scores.");
  if(body.revision!==current.revision)fail("The night changed on another phone. Refresh and try again.");
  let next={...current,pool:{...current.pool}};
  const adminOnly=new Set(["approveMember","rejectMember","settings","presence","cancel","verify","correct"]);
  if(adminOnly.has(action)&&!owner)fail("Only the night admin can do that.");
  if(action==="approveMember"||action==="rejectMember"){
   const target=String(body.uid||""),entry=current.members[target];if(!entry||entry.status!=="pending")fail("This join request is no longer pending.");
   next.members={...current.members,[target]:{...entry,status:action==="approveMember"?"approved":"rejected"}};
   if(action==="approveMember")next.pool.players=[...next.pool.players,{id:target,name:entry.name,present:true,arrival:"normal",joinedAtGame:next.pool.matches.length}];
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
  next={...next,revision:current.revision+1,updatedAt:Date.now()};
  if(Buffer.byteLength(JSON.stringify(next))>800000)fail("This night is full. Start a new night.");
  tx.set(ref,next);return view(next);
 });
}
module.exports={handle,validUser};
