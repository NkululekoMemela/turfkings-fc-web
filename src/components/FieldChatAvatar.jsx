import React,{useEffect,useState} from 'react';
import {collection,getDocs} from 'firebase/firestore';
import {db} from '../firebaseConfig.js';
const clubs=new Map();
const normalize=value=>String(value||'').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
function loadClub(clubId){
 const old=clubs.get(clubId);if(old&&old.expires>Date.now())return old.promise;
 const promise=Promise.all([getDocs(collection(db,'clubs',clubId,'publicPlayerPhotos')),getDocs(collection(db,'clubs',clubId,'publicMembers'))]).then(([snapshot,members])=>{
  const index=new Map();
  snapshot.docs.forEach(doc=>{const data=doc.data(),photo=data.photoData||data.photoUrl||data.profilePhotoUrl;
   if(!photo)return;
   for(const name of [doc.id,data.name,data.fullName,data.shortName,data.playerId,data.sourceMemberId]){
    const key=normalize(name);if(key)index.set(key,index.has(key)&&index.get(key)!==photo?null:photo);
   }
  });
  members.docs.forEach(doc=>{const member=doc.data();
   const photo=[member.playerId,member.sourceMemberId,doc.id,member.fullName,member.shortName].map(normalize).map(key=>index.get(key)).find(Boolean);
   if(photo)for(const name of [member.fullName,member.shortName]){const key=normalize(name);if(key)index.set(key,index.has(key)&&index.get(key)!==photo?null:photo);}
  });return index;
 }).catch(()=>new Map());
 if(clubs.size>=100)clubs.delete(clubs.keys().next().value);
 clubs.set(clubId,{promise,expires:Date.now()+60000});return promise;
}
export default function FieldChatAvatar({message,staffPhoto='',fieldLogo=''}){
 const clubIdentity=Boolean(message.clubId&&(!message.senderRole||message.senderRole==='club_member'));
 const key=JSON.stringify([clubIdentity,message.clubId,message.senderName]);
 const [resolved,setResolved]=useState({key:'',photo:''}),[failed,setFailed]=useState('');
 useEffect(()=>{let active=true;if(clubIdentity)loadClub(message.clubId).then(index=>{if(active)setResolved({key,photo:index.get(normalize(message.senderName))||''});});return()=>{active=false;};},[key]);
 const photo=clubIdentity?(resolved.key===key?resolved.photo:''):(staffPhoto||fieldLogo);
 const initials=String(message.senderName||'Field member').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
 return <span className="fanm-chat-sender-avatar field-chat-avatar" role="img" aria-label={`${message.senderName||'Member'} · ${clubIdentity?message.clubName||'Club member':'Field team'}`}>
 {photo&&failed!==photo?<img src={photo} alt="" decoding="async" onError={()=>setFailed(photo)}/>:initials}
 </span>;
}
