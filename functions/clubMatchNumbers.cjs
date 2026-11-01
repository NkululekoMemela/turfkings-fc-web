async function save({db,user,body}){
 if([body.environment,body.scope?.environment,body.dataScope?.environment].includes("practice"))throw Error("Practice numbers must stay in the Practice session.");
 const valid=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(value);
 const {clubId,teamId,playerKey,teamKind}=body;
 if(!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==="anonymous")throw Error("Sign in with your verified Club account.");
 if(!valid(clubId)||!teamId||!["league","friendly"].includes(teamKind)||typeof playerKey!=="string"||playerKey.length>200)throw Error("Choose a current team-sheet player.");
 const policy=await import("./playerKitPolicy.mjs"),number=policy.jerseyNumber(body.number),ref=db.doc(`clubs/${clubId}/state/main`);
 return db.runTransaction(async tx=>{
  const [club,snapshot,members,profiles]=await Promise.all([tx.get(db.doc(`clubs/${clubId}`)),tx.get(ref),tx.get(db.collection(`clubs/${clubId}/members`)),tx.get(db.collection(`clubs/${clubId}/publicPlayers`))]);
  const c=club.data();if(!c||c.deleted)throw Error("This Club is unavailable.");
  const owns=m=>m.uid===user.uid||(!m.uid&&user.email&&String(m.email||"").toLowerCase()===user.email.toLowerCase());
  const admin=[c.ownerUid,c.createdByUid,...(c.adminUids||[])].includes(user.uid)||(user.email&&(c.adminEmails||[]).includes(user.email));
  if(!admin&&!members.docs.some(s=>{const m=s.data();return m.status==="active"&&["admin","captain"].includes(m.role)&&owns(m);}))throw Error("Only your Club captain or admin can change match numbers.");
  const state=snapshot.data()?.state;if(!state)throw Error("The Club setup is unavailable.");
  if(body.seasonId&&body.seasonId!==state.activeSeasonId&&body.seasonId!==state.seasonId)throw Error("The active season changed. Reopen the team sheet.");
  const season=state.seasons?state.seasons.find(s=>s.seasonId===state.activeSeasonId):state;if(!season)throw Error("Open the active season first.");
  const field=teamKind==="friendly"?"fiveVFiveTeams":"teams",teams=season[field]||[],team=teams.find(t=>String(t.id)===String(teamId));if(!team)throw Error("This team changed. Reopen the team sheet.");
  const profileRows=profiles.docs.map(s=>({...s.data(),id:s.id})),roster=policy.buildKitRoster([team],profileRows)[0];
  if(!roster.players.some(p=>p.key===playerKey))throw Error("This player is no longer in that squad.");
  policy.validateKitTeams([{...roster,players:roster.players.map(p=>p.key===playerKey?{...p,number}:p)}]);
  const updated={...team,kitNumbers:{...team.kitNumbers,[playerKey]:{number,source:"captain"}}},nextSeason={...season,[field]:teams.map(t=>String(t.id)===String(teamId)?updated:t)};
  const next=state.seasons?{...state,seasons:state.seasons.map(s=>s.seasonId===state.activeSeasonId?nextSeason:s)}:nextSeason;
  const updatedAt=new Date().toISOString();next.updatedAt=updatedAt;tx.update(ref,{state:next,updatedAt});return {saved:true,number,updatedAt};
 });
}
module.exports={save};
