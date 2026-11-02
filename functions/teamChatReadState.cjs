async function unread(db,path,uid){
 const pref=await db.doc(`${path}/preferences/${uid}`).get();
 const after=Number(pref.data()?.lastReadAtMs)||0;
 const messages=await db.collection(`${path}/messages`).where("createdAtMs",">",after).get();
 return messages.docs.filter(s=>s.data().senderUid!==uid).length;
}
async function markRead(db,preference,docs){
 const newest=Math.max(0,...docs.map(s=>Number(s.data().createdAtMs)||0));
 if(!newest)return;
 await db.runTransaction(async tx=>{
  const pref=await tx.get(preference);
  if(newest>(Number(pref.data()?.lastReadAtMs)||0))tx.set(preference,{lastReadAtMs:newest},{merge:true});
 });
}
module.exports={unread,markRead};
