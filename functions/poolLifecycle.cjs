const {onSchedule}=require("firebase-functions/v2/scheduler");
const idleMs=7*24*60*60*1000;
function lastGameAt(night){return Math.max(night.createdAt||0,...night.pool.matches.map(m=>m.submittedAt||m.finishedAt||m.at||0));}
async function close(db,code,{automatic=false,uid,revision,now=Date.now()}={}){
 const {poolStandings}=await import("./poolEngine.mjs");
 return db.runTransaction(async tx=>{
  const ref=db.doc(`poolNights/${code}`),night=(await tx.get(ref)).data();if(!night)return null;
  if(["ended","deleted"].includes(night.lifecycle))return night;
  if(automatic){if(now-lastGameAt(night)<idleMs)return night;}else{
   if(!require("./poolAdminPolicy.cjs").isAdmin(night,uid))throw Error("Only the current admin can end this tournament.");
   if(require("./poolBilling.cjs").decisionRequired(night,uid))throw Error("Choose a contribution option before ending your night.");
   if(revision!==night.revision)throw Error("The night changed. Refresh before ending it.");
  }
  const finalStandings=poolStandings(night.pool.players,night.pool.matches.filter(m=>m.verification==="verified"));
  const next={...night,lifecycle:"ended",lastActivityAt:null,endedAt:now,retentionAt:(automatic?lastGameAt(night):now)+7*24*60*60*1000,endReason:automatic?"inactive":"admin",finalStandings,pendingAtEnd:night.pool.matches.filter(m=>m.verification!=="verified").length,pool:{...night.pool,active:[]},unfinishedAtEnd:night.pool.active,revision:night.revision+1};
  tx.set(ref,next);return next;
 });
}
exports.close=close;exports.lastGameAt=lastGameAt;exports.idleMs=idleMs;
exports.closeIdlePoolNights=onSchedule({schedule:"every 15 minutes",region:"us-central1",timeoutSeconds:540},async()=>{
 const admin=require("firebase-admin");if(!admin.apps.length)admin.initializeApp();const db=admin.firestore();
 const snapshot=await db.collection("poolNights").where("lastActivityAt","<=",Date.now()-idleMs).limit(200).get();
 for(const doc of snapshot.docs)if(/^[A-F0-9]{10}$/.test(doc.id))await close(db,doc.id,{automatic:true});
});

exports.resume=async function(db,code,{uid,revision,now=Date.now()}){
 return db.runTransaction(async tx=>{const ref=db.doc(`poolNights/${code}`),night=(await tx.get(ref)).data();
  if(!night||!require("./poolAdminPolicy.cjs").isAdmin(night,uid))throw Error("Only a night admin can resume this tournament.");
  if(night.lifecycle!=="ended")throw Error("Only completed nights can be resumed.");
  if(night.revision!==revision)throw Error("The night changed. Refresh and retry.");
  if(now-Math.max(lastGameAt(night),night.endedAt||0,night.restoredAt||0)>=idleMs)throw Error("This night has been inactive for seven days. Start a new tournament.");
  const next={...night,lifecycle:"active",endedAt:null,retentionAt:null,lastActivityAt:now,endReason:null,finalStandings:null,pendingAtEnd:0,pool:{...night.pool,active:night.unfinishedAtEnd||[]},unfinishedAtEnd:[],revision:night.revision+1,resumedAt:now};tx.set(ref,next);return next;
 });
};
