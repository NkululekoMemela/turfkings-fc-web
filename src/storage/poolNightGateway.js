import {auth,getActiveFirebaseFunctionsBaseUrl} from '../firebaseConfig.js';
export async function poolNightRequest(body){
 const user=auth.currentUser;
 if(!user||user.isAnonymous)throw new Error('Sign in to join the night.');
 const token=await user.getIdToken();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const response=await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/poolNight`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:controller.signal});
  const data=await response.json().catch(()=>({error:'Pool service unavailable. Please retry.'}));
  if(!response.ok)throw new Error(data.error||'Could not update the night.');
  return data;
 }finally{clearTimeout(timer);}
}
