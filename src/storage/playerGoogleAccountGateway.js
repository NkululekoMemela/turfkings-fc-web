import {GoogleAuthProvider, signInWithCredential} from "firebase/auth";
import {Capacitor} from "@capacitor/core";
import {FirebaseAuthentication} from "@capacitor-firebase/authentication";
import {auth, reauthenticateWithGoogle, getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";
let googleScript;
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScript) googleScript=new Promise((resolve,reject)=>{
    const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;
    script.onload=resolve;script.onerror=()=>{googleScript=null;reject(new Error("Google account selection could not load. Check your connection and retry."));};
    document.head.appendChild(script);
  });
  return googleScript;
}
export async function confirmCurrentGoogleAccount() {
  const current=auth.currentUser;
  if (!current) throw new Error("Sign in before changing your Google account.");
  const result=await reauthenticateWithGoogle(current);
  const originalGoogleIdToken=GoogleAuthProvider.credentialFromResult(result)?.idToken;
  if (!originalGoogleIdToken || auth.currentUser?.uid!==current.uid) throw new Error("Confirm the Google account currently linked to your profile.");
  return {uid:current.uid,originalGoogleIdToken};
}
export async function selectReplacementGoogleToken({originalGoogleIdToken,container,signal}) {
  if (Capacitor.isNativePlatform()) {
    const result=await FirebaseAuthentication.signInWithGoogle({skipNativeAuth:true});
    if (signal.aborted) throw new Error("Account change cancelled.");
    if (!result?.credential?.idToken) throw new Error("Google did not return account confirmation.");
    return result.credential.idToken;
  }
  await loadGoogleIdentity();
  if (signal.aborted) throw new Error("Account change cancelled.");
  const payload=JSON.parse(atob(originalGoogleIdToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
  return new Promise((resolve,reject)=>{
    const cancel=()=>{window.google.accounts.id.cancel();reject(new Error("Account change cancelled."));};
    signal.addEventListener("abort",cancel,{once:true});
    window.google.accounts.id.initialize({client_id:payload.aud,auto_select:false,callback:result=>{
      signal.removeEventListener("abort",cancel);
      if (!signal.aborted && result.credential) resolve(result.credential);
      else reject(new Error("Google account selection was cancelled."));
    }});
    window.google.accounts.id.renderButton(container,{theme:"outline",size:"large",text:"continue_with",width:260});
  });
}
export async function replacePlayerGoogleAccount({proof,replacementGoogleIdToken,requestedEmail,clubId,memberId}) {
  if (auth.currentUser?.uid!==proof.uid) throw new Error("Your signed-in account changed. Reopen Profile.");
  const token=await auth.currentUser.getIdToken(true);
  const response=await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/changePlayerGoogleAccount`,{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body:JSON.stringify({originalGoogleIdToken:proof.originalGoogleIdToken,replacementGoogleIdToken,requestedEmail,clubId,memberId}),
  });
  const result=await response.json().catch(()=>({error:"Account change service did not respond. Reopen Profile to check your sign-in details."}));
  if (!response.ok) throw new Error(result.error || "Your Google account could not be changed.");
  const signed = await signInWithCredential(auth, GoogleAuthProvider.credential(replacementGoogleIdToken));
  if (signed.user.uid !== proof.uid) throw new Error("Your Google account was changed, but the sign-in identity needs review. Reopen FANM before editing any records.");
  await signed.user.getIdToken(true);
  return result;
}
