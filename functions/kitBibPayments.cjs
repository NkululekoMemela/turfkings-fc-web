const {createHash}=require("node:crypto");
const bulk=require("./kitBulk.cjs");
const hash=v=>createHash("sha256").update(v).digest("hex");
async function checkout({db,user,body,secret,request=fetch}){
 if(body.clubId!=="turf-kings")throw Error("Online bib contributions are not configured for this Club. Pay your captain directly.");
 if(!/^sk_(test|live)_/.test(secret||""))throw Error("Yoco checkout is not configured.");
 if(/staging/.test(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||"")&&!secret.startsWith("sk_test_"))throw Error("Staging bib payments need a Yoco test key. No payment was taken.");
 const origins=new Set(["https://five-asides-near-me-development.web.app","https://five-asides-near-me-testing.web.app","https://five-asides-near-me.web.app","https://five-asides-near-me-staging.web.app","https://5asidenearme.com","https://www.5asidenearme.com"]);
 const origin=origins.has(body.origin)?body.origin:/staging/.test(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||"")?"https://five-asides-near-me-development.web.app":"https://five-asides-near-me.web.app";
 const payment=await db.runTransaction(async tx=>{
  const ctx=await bulk.context(db,user,body.clubId,tx);
  if(!["home","away"].includes(body.side))throw Error("Choose a bib request.");
  const ref=db.doc(`${bulk.root(body.clubId)}/requests/${ctx.member.id}_${body.side}`),row=(await tx.get(ref)).data();
  if(!row||row.status!=="requested")throw Error("Your bib request is unavailable.");
  if(row.paymentStatus==="paid")return {paid:true};
  const id=row.paymentId||hash(`${body.clubId}:${ref.id}:${row.revision}`),payRef=db.doc(`${bulk.root(body.clubId)}/payments/${id}`),old=(await tx.get(payRef)).data();
  if(old)return {...old,id};
  const saved={clubId:body.clubId,requestId:ref.id,ownerUid:user.uid,amount:row.amountMinor,currency:"ZAR",mode:secret.startsWith("sk_test_")?"test":"live",status:"pending",createdAtMs:Date.now()};
  tx.set(payRef,saved);tx.set(ref,{...row,paymentId:id,paymentStatus:"pending",revision:row.revision+1});return {...saved,id};
 });
 if(payment.paid)return {paid:true};if(payment.redirectUrl)return {redirectUrl:payment.redirectUrl};
 const response=await request("https://payments.yoco.com/api/checkouts",{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json","Idempotency-Key":payment.id},body:JSON.stringify({amount:payment.amount,currency:"ZAR",externalId:payment.id,clientReferenceId:"Turf Kings · Bib contribution",metadata:{purpose:"club_bib",clubId:body.clubId,bibPaymentId:payment.id},successUrl:origin+"/?bibPayment=returned",cancelUrl:origin+"/?bibPayment=cancelled",failureUrl:origin+"/?bibPayment=failed"}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("Checkout could not open. Retry the same payment.");
 const result=await response.json(),url=new URL(result.redirectUrl);if(url.protocol!=="https:"||!/(^|\.)yoco\.com$/.test(url.hostname)||!result.id)throw Error("Invalid payment destination.");
 await db.runTransaction(async tx=>{const ref=db.doc(`${bulk.root(body.clubId)}/payments/${payment.id}`),old=(await tx.get(ref)).data();if(old.status!=="paid")tx.set(ref,{...old,redirectUrl:result.redirectUrl,checkoutId:result.id});});return {redirectUrl:result.redirectUrl};
}
async function settle(db,event){
 const data=event.payload||{},meta=data.metadata||{};
 if(!["payment.succeeded","payment.failed"].includes(event.type)||meta.purpose!=="club_bib")return;
 if(meta.clubId!=="turf-kings"||!/^[a-f0-9]{64}$/.test(meta.bibPaymentId||""))throw Error("Invalid bib payment reference.");
 await db.runTransaction(async tx=>{
  const payRef=db.doc(`${bulk.root(meta.clubId)}/payments/${meta.bibPaymentId}`),payment=(await tx.get(payRef)).data();
  if(!payment||payment.status==="paid")return;
  const checkoutId=meta.checkoutId||data.checkoutId;
  if(data.amount!==payment.amount||data.currency!=="ZAR"||data.mode!==payment.mode||!checkoutId||payment.checkoutId&&checkoutId!==payment.checkoutId)throw Error("Bib payment amount or checkout does not match.");
  const reqRef=db.doc(`${bulk.root(meta.clubId)}/requests/${payment.requestId}`),row=(await tx.get(reqRef)).data();
  if(!row||row.paymentId!==meta.bibPaymentId)throw Error("Bib request changed.");
  const paid=event.type==="payment.succeeded";
  tx.set(payRef,{...payment,checkoutId,status:paid?"paid":"failed",settledAtMs:Date.now()});tx.set(reqRef,{...row,paymentId:paid?row.paymentId:"",paymentStatus:paid?"paid":"unpaid",revision:row.revision+1,updatedAtMs:Date.now()});
 });
}
module.exports={checkout,settle};
