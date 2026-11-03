import {auth} from "../firebaseConfig.js";
import {ownsPlayerProfile, validatePlayerProfile, profileFingerprint} from "../core/playerProfilePolicy.mjs";
import {playerPrivacyRequest, ownMembershipSnapshots} from "./playerPrivacyGateway.js";
// Private, memory-only cache. Never share data between accounts or persist it to disk.
let accountKey="";
const profiles=new Map(), requests=new Map();
function cacheKey(clubId,memberId="") {
  const user=auth.currentUser;
  const key=user?.uid && user.emailVerified ? `${user.uid}:${user.email || ""}` : "";
  if(key!==accountKey){accountKey=key;profiles.clear();requests.clear();}
  return key && clubId ? `${key}:${clubId}:${memberId}` : "";
}
export function cachedOwnPlayerProfile(clubId,memberId="") {
  const key=cacheKey(clubId,memberId),entry=profiles.get(key);
  return entry && ownsPlayerProfile(entry.member,auth.currentUser) ? structuredClone(entry.member) : null;
}
export function preloadOwnPlayerProfile(clubId,memberId="") {
  const key=cacheKey(clubId,memberId);
  if(!key || !memberId)return Promise.resolve(null);
  const entry=profiles.get(key);
  if(entry && Date.now()-entry.time<60000)return Promise.resolve(structuredClone(entry.member));
  return loadOwnPlayerProfile(clubId,memberId);
}
export function loadOwnPlayerProfile(clubId,preferredMemberId="") {
  const key=cacheKey(clubId,preferredMemberId);
  if(!key)return Promise.reject(new Error("Sign in with your verified Google account."));
  if(requests.has(key))return requests.get(key);
  const request=(async()=>{
    let memberId=preferredMemberId;
    if(!memberId){
      const snapshots=await ownMembershipSnapshots(clubId);
      const members=snapshots.docs.map(item=>({...item.data(),id:item.id})).filter(item=>item.status!=="withdrawn");
      if(members.length>1)throw new Error("Ask the club administrator to resolve your duplicate memberships.");
      if(!members.length)return null;
      memberId=members[0].id;
    }
    const member=(await playerPrivacyRequest({action:"load",clubId,memberId})).member;
    if(cacheKey(clubId,preferredMemberId)!==key)throw new Error("Your account changed. Sign in again.");
    if(!ownsPlayerProfile(member,auth.currentUser))throw new Error("Sign in as this player to view your profile.");
    const entry={member:structuredClone(member),time:Date.now()};
    profiles.set(key,entry);profiles.set(cacheKey(clubId,member.id),entry);
    const portrait=member.displayPhoto || member.photoData || member.photoUrl;
    if(portrait && typeof Image!=="undefined"){const image=new Image();image.src=portrait;image.decode?.().catch(()=>{});}
    return structuredClone(member);
  })();
  requests.set(key,request);
  request.finally(()=>{if(requests.get(key)===request)requests.delete(key);}).catch(()=>{});
  return request;
}
export async function saveOwnPlayerProfile({clubId,member,draft,photoData}) {
  if (!ownsPlayerProfile(member,auth.currentUser)) throw new Error("Sign in as this player to edit your profile.");
  validatePlayerProfile(draft);
  profiles.clear();
  return playerPrivacyRequest({action:"save",clubId,memberId:member.id,draft,photoData,fingerprint:profileFingerprint(member)});
}
