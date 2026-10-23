import {auth,getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";
export async function kitShopRequest(body){
 const user=auth.currentUser;if(!user?.uid||!user.emailVerified)throw new Error("Sign in with your verified Google account.");
 const response=await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/kitShop`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify(body)});
 const result=await response.json();if(auth.currentUser?.uid!==user.uid)throw new Error("Your account changed. Reopen Shop.");
 if(!response.ok||result.error)throw new Error(result.error||"The shop could not complete this request.");return result;
}
