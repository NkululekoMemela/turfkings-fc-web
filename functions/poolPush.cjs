const {createHash,randomUUID}=require("node:crypto");
const {onDocumentCreated}=require("firebase-functions/v2/firestore");
const hash=value=>createHash("sha256").update(value).digest("hex");
const officialOrigins=new Set(["https://five-asides-near-me-development.web.app","https://five-asides-near-me-testing.web.app","https://five-asides-near-me.web.app","https://five-asides-near-me-staging.web.app","https://five-asides-near-me-development.firebaseapp.com","https://five-asides-near-me-testing.firebaseapp.com","https://five-asides-near-me.firebaseapp.com","https://five-asides-near-me-staging.firebaseapp.com"]);
async function keysFor(db){
 const ref=db.doc("poolNights/_pushKeys");
 return db.runTransaction(async tx=>{
  const data=(await tx.get(ref)).data();if(data?.publicKey&&data?.privateKey)return data;
  const keys=require("web-push").generateVAPIDKeys();tx.set(ref,{...keys,createdAt:Date.now()});return keys;
 });
}
function validSubscription(value){
 if(!value||typeof value.endpoint!=="string"||value.endpoint.length>2048)throw Error("Invalid notification subscription.");
 let url;try{url=new URL(value.endpoint);}catch{throw Error("Invalid notification service.");}
 const host=url.hostname,allowed=["fcm.googleapis.com","updates.push.services.mozilla.com","push.services.mozilla.com","web.push.apple.com","notify.windows.com"];
 if(url.protocol!=="https:"||url.port||url.username||url.password||!allowed.some(domain=>host===domain||host.endsWith("."+domain)))throw Error("Unsupported notification service.");
 if(!/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh||"")||!/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth||""))throw Error("Invalid notification keys.");
 return {endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
async function register({db,user,body}){
 if(!user?.uid||user.email_verified!==true||user.cameraSession)throw Error("Sign in with a verified account to enable alerts.");
 if(body.action==="pushConfig")return {publicKey:(await keysFor(db)).publicKey};
 const kind=body.kind;
 let data,id;
 if(kind==="native"){
  if(typeof body.token!=="string"||!/^[A-Za-z0-9_:.-]{20,4096}$/.test(body.token))throw Error("Invalid phone notification token.");
  id=hash(body.token);data={kind,token:body.token};
 }else if(kind==="web"){
  const subscription=validSubscription(body.subscription);if(!officialOrigins.has(body.origin))throw Error("Use an official FANM website to enable alerts.");
  id=hash(subscription.endpoint);data={kind,subscription,origin:body.origin};
 }else throw Error("Choose a notification device.");
 // One device belongs to its most recently signed-in account; old accounts must not receive their private alerts on it.
 await db.doc(`poolNights/_pushDevices/devices/${id}`).set({...data,uid:user.uid,enabled:true,updatedAt:Date.now()});
 return {ok:true};
}
function audience(night,alert){
 if(!night)return [];
 if(alert.kind==="join"&&night.members?.[alert.subjectUid]?.status==="pending")return [night.ownerUid];
 if(alert.kind==="score"&&night.pool?.matches.some(m=>m.id===alert.matchId&&m.verification==="pending"))return [night.ownerUid];
 if(alert.kind==="admin"&&night.ownerUid===alert.subjectUid)return [night.ownerUid];
 if(alert.kind==="approved"&&night.members?.[alert.subjectUid]?.status==="approved")return [alert.subjectUid];
 return [];
}
async function deliver({db,code,alertId,alert,sendWeb,sendNative}){
 const nightRef=db.doc(`poolNights/${code}`),night=(await nightRef.get()).data(),uids=audience(night,alert);
 if(!uids.length)return;
 const title=alert.kind==="join"?"Pool · Player wants to join":alert.kind==="score"?"Pool · Score needs verification":alert.kind==="admin"?"Pool · You are now the admin":"Pool · You’re approved";
 const name=String(night.members?.[alert.subjectUid]?.name||"A player").slice(0,40);
 const body=alert.kind==="join"?`${name} asked to join ${night.title}.`:alert.kind==="score"?`A result is ready to verify in ${night.title}.`:alert.kind==="admin"?`You now manage ${night.title}.`:`You can now play and log scores in ${night.title}.`;
 const tab=alert.kind==="score"?"results":alert.kind==="join"?"players":"tables";
 for(const uid of uids){
  const devices=await db.collection("poolNights/_pushDevices/devices").where("uid","==",uid).get();
  for(const doc of devices.docs){
   const device=doc.data();if(!device.enabled)continue;
   const delivery=db.doc(`poolNights/${code}/alerts/${alertId}/deliveries/${hash(uid+":"+doc.id)}`),claim=randomUUID();
   const acquired=await db.runTransaction(async tx=>{const old=(await tx.get(delivery)).data();if(old?.status==="sent"||old?.status==="expired")return false;if(old?.leaseUntil>Date.now())throw Error("Push delivery in progress; retry later.");tx.set(delivery,{status:"sending",claim,leaseUntil:Date.now()+60000});return true;});
   if(!acquired)continue;
   try{
    const fresh=(await nightRef.get()).data(),currentDevice=(await doc.ref.get()).data();
    if(!audience(fresh,alert).includes(uid)||currentDevice?.uid!==uid||!currentDevice.enabled){await delivery.set({status:"expired",leaseUntil:0});continue;}
    const payload={title,body,code,tab,eventId:alertId,recipientUid:uid,tag:`pool-${code}-${alertId}`,type:"pool_alert"};
    if(device.kind==="web"){
     const keys=await keysFor(db);
     await (sendWeb||((subscription,payload,keys)=>require("web-push").sendNotification(subscription,JSON.stringify(payload),{vapidDetails:{subject:"https://five-asides-near-me.web.app",publicKey:keys.publicKey,privateKey:keys.privateKey},TTL:3600,urgency:"high",timeout:10000})))(device.subscription,{...payload,url:`${device.origin}/?poolNight=${code}&poolTab=${tab}`},keys);
    }else{
     await (sendNative||((token,payload)=>require("firebase-admin/messaging").getMessaging().send({token,notification:{title:payload.title,body:payload.body},data:Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,String(v)])),android:{priority:"high",notification:{channelId:"field_invitations",tag:payload.tag}}})))(device.token,payload);
    }
    await delivery.set({status:"sent",leaseUntil:0,sentAt:Date.now()});
   }catch(error){
    const permanent=[404,410].includes(Number(error.statusCode))||["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(error.code);
    if(permanent){await doc.ref.set({enabled:false},{merge:true});await delivery.set({status:"expired",leaseUntil:0});}
    else{await delivery.set({status:"failed",leaseUntil:0});throw Error("Pool push delivery failed; retry required.");}
   }
  }
 }
}
function buildHandler(){return onDocumentCreated({document:"poolNights/{code}/alerts/{alertId}",region:"us-central1",retry:true,timeoutSeconds:120,maxInstances:5},async event=>{
 const {getFirestore}=require("firebase-admin/firestore");
 if(!/^[A-F0-9]{10}$/.test(event.params.code))return;
 await deliver({db:getFirestore(),code:event.params.code,alertId:event.params.alertId,alert:event.data.data()});
});}
module.exports={register,audience,validSubscription,deliver,buildHandler};
