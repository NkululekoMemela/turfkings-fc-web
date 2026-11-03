import {auth,getActiveFirebaseFunctionsBaseUrl} from '../firebaseConfig.js';
export async function companyClubsRequest(body){
 const user=auth.currentUser;if(!user?.uid||!user.emailVerified)throw Error('Sign in with your verified Google account.');
 const base=getActiveFirebaseFunctionsBaseUrl().replace(/\/$/,'');
 const response=await fetch(`${base}/companyClubs`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const result=await response.json();if(auth.currentUser?.uid!==user.uid)throw Error('Your account changed. Reopen Company Clubs.');
 if(!response.ok||result.error)throw Error(result.error||'Could not update Company Clubs.');return result;
}
