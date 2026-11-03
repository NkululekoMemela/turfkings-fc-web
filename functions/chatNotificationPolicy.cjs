const valid=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(value);
function preferencePath(uid,scope,groupId){
 if(!valid(uid)||!["club","field"].includes(scope)||!valid(groupId))throw Error("Invalid chat preference identity.");
 return `notificationPreferences/${uid}/chats/${scope}__${groupId}`;
}
async function filterChatRecipients(db,records,scope,groupId,options={}){
 const eligible=[];
 for(const record of records){
  if(valid(record.deviceId)){
   const registration=(await db.doc(`notificationRegistrations/${record.deviceId}`).get()).data();
   if(registration&&(registration.firebaseUid!==(record.uid||record.firebaseUid)||registration.enabled!==true||registration.token!==record.token))continue;
  }
  eligible.push(record);
 }
 records=eligible;
 const preferences=new Map();
 for(const record of records){
  const uid=record.uid||record.firebaseUid;
  if(!valid(uid)||preferences.has(uid))continue;
  const snapshot=await db.doc(preferencePath(uid,scope,groupId)).get();
  const data=snapshot.data();
  const explicit=data?.scope===scope&&data?.groupId===groupId&&typeof data.muted==="boolean";
  preferences.set(uid,explicit?!data.muted:options.defaultEnabled?options.defaultEnabled.has(uid):true);
 }
 return records.filter(record=>preferences.get(record.uid||record.firebaseUid)===true);
}
module.exports={preferencePath,filterChatRecipients};
