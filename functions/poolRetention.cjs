const {creatorUid}=require("./poolAdminPolicy.cjs");
const week=7*24*60*60*1000;
const expired=(night,now=Date.now())=>night.lifecycle==="ended"&&now-Math.max(night.endReason==="inactive"?require("./poolLifecycle.cjs").lastGameAt(night):night.endedAt||night.updatedAt||night.createdAt,night.restoredAt||0)>=week;
async function archive(db,code,{uid,revision,confirmation,automatic=false,restore=false,now=Date.now()}={}){
 return db.runTransaction(async tx=>{
  const ref=db.doc(`poolNights/${code}`),night=(await tx.get(ref)).data();if(!night)throw Error("Night not found.");
  if(automatic){if(!expired(night,now))return night;}else{
   if(creatorUid(night)!==uid)throw Error("Only the tournament creator can delete or restore this night.");
   if(night.revision!==revision)throw Error("This night changed. Refresh before continuing.");
   if(restore){if(night.lifecycle!=="deleted"||now-night.deletedAt>week)throw Error("This night is outside its recovery period.");}
   else{if(night.lifecycle!=="ended")throw Error("End the tournament before deleting it.");if(confirmation!==code)throw Error("Type the exact night code to confirm deletion.");}
  }
  const next={...night,lifecycle:restore?"ended":"deleted",retentionAt:restore?now+week:null,revision:night.revision+1};
  if(restore){next.restoredAt=now;}else{next.deletedAt=now;next.deleteReason=automatic?"retention":"creator";}
  tx.set(ref,next);return next;
 });
}
exports.archive=archive;exports.expired=expired;exports.week=week;
exports.cleanupOldPoolNights=require("firebase-functions/v2/scheduler").onSchedule({schedule:"every 60 minutes",region:"us-central1",timeoutSeconds:540},async()=>{
 const admin=require("firebase-admin");if(!admin.apps.length)admin.initializeApp();const db=admin.firestore();const docs=await db.collection("poolNights").where("retentionAt","<=",Date.now()).limit(200).get();for(const doc of docs.docs)if(/^[A-F0-9]{10}$/.test(doc.id))await archive(db,doc.id,{automatic:true});
});
