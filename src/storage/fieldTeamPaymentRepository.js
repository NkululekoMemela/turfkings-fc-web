const viewCache=new Map();
let viewGeneration=0;
import {
  auth, getActiveFirebaseFunctionsBaseUrl,
} from "../firebaseConfig.js";

async function performFieldTeamPaymentRequest(
  venueId, action, details = {}, signal,
) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in with Google to use Field payments.");
  }
  const generation=viewGeneration;
  const readOnly=["signupView","leagueEntryView"].includes(action);
  const cacheKey=JSON.stringify([getActiveFirebaseFunctionsBaseUrl(),user.uid,venueId,action,details]);
  const cached=viewCache.get(cacheKey);
  if(readOnly&&cached&&Date.now()-cached.at<10000)return cached.value;
  if(!readOnly){viewGeneration++;viewCache.clear();}
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, {once: true});
  const timeout = window.setTimeout(abort, 20000);

  try {
    const token = await user.getIdToken();
    const configured = getActiveFirebaseFunctionsBaseUrl();
    const base = configured.endsWith("/")
      ? configured.slice(0, -1) : configured;
    const response = await fetch(`${base}/fieldTeamPayments`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({...details, venueId, action}),
    });
    const result = await response.json();
    if(auth.currentUser?.uid!==user.uid)throw new Error("Your account changed. Reopen Field payments.");
    if (!response.ok) {
      throw new Error(result.error || "Could not update Field payments.");
    }
    if(readOnly&&generation===viewGeneration){viewCache.set(cacheKey,{at:Date.now(),value:result});if(viewCache.size>30)viewCache.delete(viewCache.keys().next().value);}
    return result;
  } catch (error) {
    if (error.name === "AbortError" && !signal?.aborted) {
      throw new Error(
        "The payment service is taking longer than usual. Refresh before retrying."
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

const pendingViews=new Map();
export function fieldTeamPaymentRequest(venueId,action,details={},signal){
 if(!["signupView","leagueEntryView"].includes(action))return performFieldTeamPaymentRequest(venueId,action,details,signal);
 const key=JSON.stringify([viewGeneration,getActiveFirebaseFunctionsBaseUrl(),auth.currentUser?.uid,venueId,action,details]);
 if(!pendingViews.has(key))pendingViews.set(key,performFieldTeamPaymentRequest(venueId,action,details).finally(()=>pendingViews.delete(key)));
 return pendingViews.get(key);
}
