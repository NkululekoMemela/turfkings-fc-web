const {createHash,randomUUID}=require("node:crypto");
const https=value=>/^https:\/\//i.test(String(value||""))?String(value):"";
function imagePayload(value){
 if(typeof value!=="string"||value.length>1000000)return null;
 const match=/^data:image\/(png|jpeg|webp|svg\+xml)(;charset=utf-8)?(;base64)?,([\s\S]*)$/i.exec(value);
 let bytes,type;
 try{
  if(match){type=match[1].toLowerCase();bytes=match[3]?Buffer.from(match[4],"base64"):Buffer.from(decodeURIComponent(match[4]),"utf8");}
  else if(/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(value)){type="svg+xml";bytes=Buffer.from(value);}
  else return null;
 }catch{return null;}
 if(!bytes.length||bytes.length>562500)return null;
 if(type==="svg+xml"&&(!/<svg\b/i.test(bytes.toString())||/<!DOCTYPE|<!ENTITY/i.test(bytes.toString())))return null;
 return {bytes,contentType:`image/${type}`,extension:type==="jpeg"?"jpg":type==="svg+xml"?"svg":type};
}
async function publicImage(value){
 if(https(value))return value;
 const image=imagePayload(value);if(!image)return "";
 const {bytes,contentType,extension}=image,hash=createHash("sha256").update(bytes).digest("hex");
 const bucket=require("firebase-admin/storage").getStorage().bucket();
 const file=bucket.file(`notification-portraits/${hash}.${extension}`);
 let token;
 try{const [metadata]=await file.getMetadata();token=metadata.metadata?.firebaseStorageDownloadTokens;}catch(error){if(Number(error.code)!==404)throw error;}
 if(!token){token=randomUUID();await file.save(bytes,{resumable:false,metadata:{contentType,cacheControl:"public,max-age=86400",metadata:{firebaseStorageDownloadTokens:token}}});}
 return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(file.name)}?alt=media&token=${encodeURIComponent(token.split(",")[0])}`;
}
async function senderPortrait(db,clubId,uid){
 if(!uid)return "";
 try{
  if(clubId){
   const members=await db.collection(`clubs/${clubId}/members`).where("uid","==",uid).limit(2).get();
   if(members.docs.length===1){
    const member=members.docs[0].data();
    if((member.status||"active")==="active"&&member.playerId){
     const snap=await db.doc(`clubs/${clubId}/publicPlayerPhotos/${member.playerId}`).get();
     const value=snap.data()?.photoData||snap.data()?.photoUrl||"";
     if(https(value))return value;
     return await publicImage(value);
    }
   }
  }
  return "";
 }catch(error){console.warn("[Notification portrait] unavailable",error.code||error.name);return "";}
}
module.exports={senderPortrait,publicImage,https,imagePayload};
