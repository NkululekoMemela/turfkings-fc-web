const {createHash,randomUUID}=require("node:crypto");
const {onDocumentCreated}=require("firebase-functions/v2/firestore");
const OWNER="nkululekolerato@gmail.com";
const digest=value=>createHash("sha256").update(value).digest("hex");
async function deliver({db,auth,messaging,id,sendWeb}){
 if(!/^[a-f0-9]{64}$/.test(id))return;
 const queue=db.doc(`facebookHighlightQueue/${id}`);
 if((await queue.get()).data()?.status!=="pending")return;
 const owner=await auth.getUserByEmail(OWNER);
 if(!owner.emailVerified||owner.disabled)return;
 const native=await db.collection("notificationRegistrations").where("firebaseUid","==",owner.uid).get();
 const shared=await db.collection("poolNights/_pushDevices/devices").where("uid","==",owner.uid).get();
 const devices=new Map();
 for(const doc of [...native.docs,...shared.docs]){
  const d=doc.data();if(d.enabled!==true)continue;
  const kind=d.kind||"native",key=kind==="web"?d.subscription?.endpoint:d.token;
  if(key)devices.set(kind+":"+key,{doc,d,kind,key});
 }
 for(const {doc,d,kind,key} of devices.values()){
  const delivery=queue.collection("notificationDeliveries").doc(digest(kind+":"+key));
  const claim=randomUUID();
  const acquired=await db.runTransaction(async tx=>{
   const old=(await tx.get(delivery)).data();
   if(["sent","expired"].includes(old?.status))return false;
   if(old?.leaseUntil>Date.now())throw Error("Notification delivery is in progress.");
   tx.set(delivery,{status:"sending",claim,leaseUntil:Date.now()+120000});return true;
  });
  if(!acquired)continue;
  try{
   const fresh=(await doc.ref.get()).data();
   const currentOwner=await auth.getUser(owner.uid);
   if(!fresh?.enabled||(fresh.uid||fresh.firebaseUid)!==owner.uid||currentOwner.disabled||!currentOwner.emailVerified||currentOwner.email?.toLowerCase()!==OWNER||(await queue.get()).data()?.status!=="pending"){
    await delivery.set({status:"expired",leaseUntil:0});continue;
   }
   const payload={type:"facebook_highlight_ready",draftId:id,recipientUid:owner.uid,tag:`facebook-review-${id}`};
   const title="Facebook highlight ready",body="A winning goal is ready. Tap to review the clip and caption before publishing.";
   if(kind==="web"){
    const origin=new URL(d.origin).origin;
    if(!/^https:\/\/five-asides-near-me(?:-(?:staging|testing|development))?\.(?:web\.app|firebaseapp\.com)$/.test(origin))throw Error("Unsupported notification origin.");
    const keys=(await db.doc("poolNights/_pushKeys").get()).data();
    if(!keys?.publicKey||!keys?.privateKey)throw Error("Enable phone alerts again.");
    const notification={...payload,title,body,url:`${origin}/?facebookReview=${id}`};
    await (sendWeb||((subscription,data,keys)=>require("web-push").sendNotification(subscription,JSON.stringify(data),{vapidDetails:{subject:"https://five-asides-near-me.web.app",publicKey:keys.publicKey,privateKey:keys.privateKey},TTL:86400,urgency:"high",timeout:10000})))(d.subscription,notification,keys);
   }else{
    await messaging.send({token:d.token,notification:{title,body},data:payload,android:{priority:"high",notification:{channelId:"field_invitations",tag:payload.tag}}});
   }
   await delivery.set({status:"sent",sentAt:Date.now(),leaseUntil:0});
  }catch(error){
   const permanent=[404,410].includes(Number(error.statusCode))||["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(error.code);
   if(permanent){await doc.ref.set({enabled:false},{merge:true});await delivery.set({status:"expired",leaseUntil:0});}
   else{await delivery.set({status:"failed",leaseUntil:0});throw Error("Facebook review notification delivery failed.");}
  }
 }
}
function buildHandler(){return onDocumentCreated({document:"facebookHighlightQueue/{draftId}",region:"us-central1",retry:true,timeoutSeconds:180,maxInstances:3},async event=>{
 const {getApps,initializeApp}=require("firebase-admin/app");if(!getApps().length)initializeApp();
 await deliver({db:require("firebase-admin/firestore").getFirestore(),auth:require("firebase-admin/auth").getAuth(),messaging:require("firebase-admin/messaging").getMessaging(),id:event.params.draftId});
});}
module.exports={deliver,buildHandler};
