import {auth,getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";
async function performShopRequest(body){
 const user=auth.currentUser;if(!user?.uid||!user.emailVerified)throw new Error("Sign in with your verified Google account.");
 let response;
 try{response=await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/kitShop`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
 catch(error){if(auth.currentUser?.uid!==user.uid)throw new Error("Your account changed. Reopen Shop.");if(["TypeError","TimeoutError","AbortError"].includes(error.name))throw new Error("The shop could not connect. Please retry. Your products are still available to browse.");throw error;}
 if(auth.currentUser?.uid!==user.uid)throw new Error("Your account changed. Reopen Shop.");
 let result;try{result=await response.json();}catch{throw new Error("The shop service is unavailable. Please retry shortly.");}
 if(!response.ok||result.error)throw new Error(result.error||"The shop could not complete this request.");return result;
}

// Share only simultaneous reads. Never cache order mutations or data across accounts.
const pendingShopReads=new Map();
export async function kitShopRequest(body){
 if(!['catalogue','bibView'].includes(body.action))return performShopRequest(body);
 const user=auth.currentUser;if(!user?.uid||!user.emailVerified)throw new Error("Sign in with your verified Google account.");
 const key=JSON.stringify([user.uid,getActiveFirebaseFunctionsBaseUrl(),body]);
 if(pendingShopReads.has(key))return pendingShopReads.get(key);
 const request=performShopRequest(body).finally(()=>pendingShopReads.delete(key));pendingShopReads.set(key,request);return request;
}
