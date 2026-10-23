const {createHash,randomUUID}=require("node:crypto");
const https=value=>/^https:\/\//i.test(String(value||""))?String(value):"";
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
     const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
     if(match&&match[2].length<750000){
      const bytes=Buffer.from(match[2],"base64"),hash=createHash("sha256").update(bytes).digest("hex");
      const bucket=require("firebase-admin/storage").getStorage().bucket();
      const file=bucket.file(`notification-portraits/${hash}.${match[1]==="jpeg"?"jpg":match[1]}`);
      let token;
      try{const [metadata]=await file.getMetadata();token=metadata.metadata?.firebaseStorageDownloadTokens;}catch(error){if(Number(error.code)!==404)throw error;}
      if(!token){token=randomUUID();await file.save(bytes,{resumable:false,metadata:{contentType:`image/${match[1]}`,cacheControl:"public,max-age=86400",metadata:{firebaseStorageDownloadTokens:token}}});}
      return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(file.name)}?alt=media&token=${encodeURIComponent(token.split(",")[0])}`;
     }
    }
   }
  }
  return https((await require("firebase-admin/auth").getAuth().getUser(uid)).photoURL);
 }catch(error){console.warn("[Notification portrait] unavailable",error.code||error.name);try{return https((await require("firebase-admin/auth").getAuth().getUser(uid)).photoURL);}catch{return "";}}
}
module.exports={senderPortrait,https};
