import {auth,getActiveFirebaseFunctionsBaseUrl} from '../firebaseConfig.js';
export async function memberWorkspaceRequest(endpoint,body){
 const user=auth.currentUser;if(!user?.uid||!user.emailVerified)throw Error('Sign in with your verified account.');
 const response=await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const result=await response.json();if(auth.currentUser?.uid!==user.uid)throw Error('Your signed-in account changed.');
 if(!response.ok||result.error)throw Error(result.error||'Please try again.');return result;
}
