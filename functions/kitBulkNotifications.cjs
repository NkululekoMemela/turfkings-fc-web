const {onDocumentCreated}=require("firebase-functions/v2/firestore");
function buildHandler({db,region,sendBatch}){return onDocumentCreated({document:"kitShopConfig/{configId}/alerts/{alertId}",region,retry:true},async event=>{
 const alert=event.data?.data();if(!alert?.clubId||![6,12].includes(alert.threshold))return;
 const club=(await db.doc(`clubs/${alert.clubId}`).get()).data();if(!club||club.deleted)return;
 const [members,devices]=await Promise.all([db.collection(`clubs/${alert.clubId}/members`).get(),db.collection(`clubs/${alert.clubId}/notificationDevices`).get()]);
 const leaders=new Set([club.ownerUid,club.createdByUid,...(club.adminUids||[])]),uids=new Set(members.docs.filter(d=>{const m=d.data();return m.status==="active"&&(["admin","captain"].includes(m.role)||leaders.has(m.uid));}).map(d=>d.data().uid).filter(Boolean));
 const seen=new Set(),tokenRecords=devices.docs.filter(d=>{const device=d.data();if(!device.enabled||!device.token||!uids.has(device.firebaseUid)||seen.has(device.token))return false;seen.add(device.token);return true;}).map(d=>({token:d.data().token,uid:d.data().firebaseUid,ref:d.ref}));
 if(!tokenRecords.length)return;
 const groupLogoUrl=await require("./notificationRuntime.cjs").groupImage({...club,id:alert.clubId});
 await sendBatch({tokenRecords,title:`${club.name||club.clubName||"Your Club"} · Bib pack ready`,body:`${alert.threshold} players requested ${alert.side} bibs. Review your pack and order for delivery to you.`,data:{type:"bib_pack_ready",route:"landing",clubId:alert.clubId,eventId:event.id,groupName:club.name||club.clubName||"Your Club",groupLogoUrl},imageUrl:groupLogoUrl});
 });}
module.exports={buildHandler};
