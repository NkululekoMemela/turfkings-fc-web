import {ownsPlayerProfile} from "./playerProfilePolicy.mjs";
// Input must come from the authenticated own-memberships endpoint, never the public roster.
export function resolvePortalClubMember(members,user,preferredMemberId=""){
 if(!user?.uid||!user.emailVerified)throw new Error("Sign in with your verified Google account.");
 const owned=members.filter(member=>member.status==="active"&&ownsPlayerProfile(member,user));
 const selected=owned.find(member=>member.id===preferredMemberId);
 if(selected)return selected;
 if(owned.length!==1)throw new Error(owned.length?"More than one active Club profile matches this account. Return to your Club and select your player name.":"No active Club player profile belongs to your signed-in account. Return to your Club and confirm your Google account.");
 return owned[0];
}
