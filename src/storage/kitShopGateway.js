import {Capacitor} from "@capacitor/core";
import {openShopPaymentWindow} from "../core/shopPaymentWindow.mjs";
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
 if(!['catalogue','bibView','hireView'].includes(body.action))return performShopRequest(body);
 const user=auth.currentUser;if(!user?.uid||!user.emailVerified)throw new Error("Sign in with your verified Google account.");
 const key=JSON.stringify([user.uid,getActiveFirebaseFunctionsBaseUrl(),body]);
 if(pendingShopReads.has(key))return pendingShopReads.get(key);
 const request=performShopRequest(body).then(async result=>{
  if(result.isOperator&&!result.settings?.enabled&&!result.settings?.launchProfileVersion){
    await performShopRequest({action:"activateLaunchShop"});return performShopRequest(body);
  }return result;
 }).finally(()=>pendingShopReads.delete(key));pendingShopReads.set(key,request);return request;
}

export async function openShopYocoPayment(orderId){
 const user=auth.currentUser;
 if(!user?.uid||!user.emailVerified)throw new Error("Sign in to pay for your order.");
 let response;
 try{response=await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/createYocoCheckout`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({purpose:"kit_shop",orderId,origin:window.location.origin}),signal:AbortSignal.timeout(20000)});}
 catch{throw new Error("Yoco could not connect. Your order is saved. Retry payment from your bill.");}
 if(auth.currentUser?.uid!==user.uid)throw new Error("Your account changed. Reopen your order.");
 let result;try{result=await response.json();}catch{throw new Error("Payment is temporarily unavailable. Your order is saved.");}
 if(!response.ok||result.error)throw new Error(result.error||"Yoco checkout could not open.");
 if(result.paid)return result;
 let url;try{url=new URL(result.redirectUrl);}catch{throw new Error("Yoco did not return a payment page.");}
 if(url.protocol!=="https:"||!/(^|\.)yoco\.com$/.test(url.hostname))throw new Error("Invalid Yoco payment destination.");
 const native=Capacitor.isNativePlatform();
 const browser=native?(await import("@capacitor/browser")).Browser:null;
 await openShopPaymentWindow(url.href,{native,browser,location:window.location,onReturn:()=>window.dispatchEvent(new Event("focus"))});return result;
}
