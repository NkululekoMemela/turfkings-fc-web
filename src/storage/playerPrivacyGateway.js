import {auth, getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";
export async function playerPrivacyRequest(body) {
  const user = auth.currentUser;
  if (!user?.uid || !user.emailVerified) throw new Error("Sign in with your verified Google account.");
  const token = await user.getIdToken();
  const response = await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/playerPrivacy`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}, body:JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(`${body.action || "profile"}: ${result.error || "Your private profile could not be loaded."}`);
  if (auth.currentUser?.uid !== user.uid) throw new Error("Your account changed. Sign in again.");
  return result;
}
export async function ownMembershipSnapshots(clubId = "") {
  const result = await playerPrivacyRequest({action:"memberships",clubId});
  const docs = result.members.map(item => ({id:item.id,exists:()=>true,data:()=>item.data,ref:{path:item.path,parent:{parent:{id:item.clubId}}}}));
  return {docs,size:docs.length,empty:!docs.length,forEach:fn=>docs.forEach(fn)};
}
