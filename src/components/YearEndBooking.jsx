import {auth,getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";

export async function openYearEndCheckout(event, details) {
  const user=auth.currentUser;
  if(!user)throw Error("Sign in with your Club account.");
  const res=await fetch(`${getActiveFirebaseFunctionsBaseUrl().replace(/\/$/,"")}/createYocoCheckout`,{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`},
    body:JSON.stringify({...details,purpose:"year_end",eventId:event.id,eventVersion:event.updatedAtMs,origin:window.location.origin}),
  });
  const result=await res.json();
  if(!res.ok)throw Error(result.error||"Could not open Yoco.");
  if(result.confirmed)return;
  if(!result.redirectUrl)throw Error("No checkout link was returned.");
  window.location.assign(result.redirectUrl);
}
