const {onRequest}=require("firebase-functions/v2/https");
const billing=require("./poolBilling.cjs");
async function checkout({db,user,body,secret,liveEnabled=false,request=fetch}){
 const mode=String(secret||"").startsWith("sk_test_")?"test":String(secret||"").startsWith("sk_live_")?"live":"";
 if(!mode)throw Error("Pool checkout is not configured yet. You can keep playing.");
 if(mode==="live"&&!liveEnabled)throw Error("Live pool payments are not open yet. Receipt branding is being prepared. You can keep playing.");
 const code=String(body.code||"").toUpperCase(),order=await billing.reserve({db,user,code,origin:body.origin,mode});
 if(order.redirectUrl)return {redirectUrl:order.redirectUrl,amount:order.amount,mode:order.mode};
 const base=`${order.origin}/?poolNight=${order.code}&poolTab=tables`;
 const response=await request("https://payments.yoco.com/api/checkouts",{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json","Idempotency-Key":order.id},body:JSON.stringify({amount:order.amount,currency:"ZAR",externalId:order.id,clientReferenceId:"Pool Table from FANM",metadata:{purpose:"pool_night",poolOrderId:order.id},successUrl:base+"&poolPayment=returned",cancelUrl:base+"&poolPayment=cancelled",failureUrl:base+"&poolPayment=failed"}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("Checkout could not open. Your games are safe. Please retry the same payment.");
 const result=await response.json(),url=new URL(result.redirectUrl);
 if(url.protocol!=="https:"||!/(^|\.)yoco\.com$/.test(url.hostname)||!result.id)throw Error("Invalid payment destination. Please retry.");
 await db.runTransaction(async tx=>{const ref=db.doc(`poolNights/_billing/orders/${order.id}`),saved=(await tx.get(ref)).data();if(saved.status!=="paid")tx.set(ref,{...saved,status:"pending",redirectUrl:result.redirectUrl,checkoutId:result.id});});
 return {redirectUrl:result.redirectUrl,amount:order.amount,mode};
}
exports.checkout=checkout;
exports.poolCheckout=onRequest({region:"us-central1",cors:true,timeoutSeconds:60,maxInstances:5},async(req,res)=>{
 if(req.method!=="POST"){res.status(405).json({error:"Use POST."});return;}
 try{const admin=require("firebase-admin");if(!admin.apps.length)admin.initializeApp();const token=String(req.headers.authorization||"").match(/^Bearer (.+)$/);if(!token){res.status(401).json({error:"Sign in to contribute."});return;}
 const user=await admin.auth().verifyIdToken(token[1],true);res.json(await checkout({db:admin.firestore(),user,body:req.body||{},secret:process.env.YOCO_SECRET_KEY||process.env.YOCO_SECRET,liveEnabled:process.env.POOL_LIVE_PAYMENTS==="true"}));
 }catch(error){res.status(400).json({error:error.message||"Could not open pool checkout."});}
});
