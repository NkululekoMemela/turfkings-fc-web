const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const validId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const confirmed=order=>order.paymentStatus==='confirmed';
const staging=()=>/staging/.test(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||'');
const origins=new Set(['https://five-asides-near-me-development.web.app','https://five-asides-near-me-testing.web.app','https://five-asides-near-me.web.app','https://five-asides-near-me-staging.web.app','https://5asidenearme.com','https://www.5asidenearme.com']);
function paymentUrl(value){let url;try{url=new URL(value);}catch{throw Error('Invalid Yoco checkout destination.');}if(url.protocol!=='https:'||!/(^|\.)yoco\.com$/.test(url.hostname))throw Error('Invalid Yoco checkout destination.');return url.href;}
async function checkout({db,user,body,secret,request=fetch}){
 if(!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==='anonymous')throw Error('Sign in with your verified account to pay.');
 if(!validId(body.orderId))throw Error('Choose your shop order.');
 if(!/^sk_(test|live)_/.test(secret||''))throw Error('The store Yoco gateway is not configured. Your order is saved; no payment was taken.');
 if(staging()&&!secret.startsWith('sk_test_'))throw Error('Staging purchases require a Yoco test key. No payment was taken.');
 const ref=db.doc(`kitShopOrders/${body.orderId}`),mode=secret.startsWith('sk_test_')?'test':'live';
 const order=await db.runTransaction(async tx=>{
  const row=(await tx.get(ref)).data();
  if(!row||row.ownerUid!==user.uid)throw Error('This order does not belong to your account.');
  if(confirmed(row))return {...row,paid:true};
  if(row.status!=='awaiting_payment'||row.cancellationRequested||row.changeRequest)throw Error('This order is not available for payment.');
  if(!Number.isSafeInteger(row.totalMinor)||row.totalMinor<=0||row.currency!=='ZAR')throw Error('This order needs a valid rand total.');
  const old=row.yoco||{};
  if(old.mode&&old.mode!==mode)throw Error('This order belongs to a different payment environment.');
  if(old.state==='pending'&&old.redirectUrl)return row;
  const attempt=old.state==='failed'?(old.attempt||1)+1:old.attempt||1;
  const key=hash(`${body.orderId}:${attempt}`);
  const updated={...row,paymentMethod:'yoco',paymentStatus:'pending',yoco:{...old,attempt,key,mode,state:'creating',...(old.state==='failed'?{checkoutId:'',redirectUrl:''}:{})},revision:row.revision+1,updatedAtMs:Date.now()};
  tx.set(ref,updated);tx.set(db.doc(`kitShopCustomers/${row.ownerUid}/orders/${body.orderId}`),updated);return updated;
 });
 if(order.paid)return {paid:true};
 if(order.yoco.state==='pending'&&order.yoco.redirectUrl)return {redirectUrl:paymentUrl(order.yoco.redirectUrl)};
 const origin=origins.has(body.origin)?body.origin:staging()?'https://five-asides-near-me-development.web.app':'https://five-asides-near-me.web.app';
 const returnUrl=status=>`${origin}/?shopOrder=${body.orderId}&shopPayment=${status}`;
 let response;
 try{response=await request('https://payments.yoco.com/api/checkouts',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json','Idempotency-Key':order.yoco.key},body:JSON.stringify({amount:order.totalMinor,currency:'ZAR',externalId:order.yoco.key,clientReferenceId:`FANM-${body.orderId.slice(0,12).toUpperCase()}`,metadata:{purpose:'kit_shop',orderId:body.orderId,paymentKey:order.yoco.key},successUrl:returnUrl('returned'),cancelUrl:returnUrl('cancelled'),failureUrl:returnUrl('failed')}),signal:AbortSignal.timeout(15000)});}catch{throw Error('Yoco could not connect. Your order is saved. Retry payment from your bill.');}
 if(!response.ok)throw Error('Yoco could not open checkout. Your order is saved. Retry payment from your bill.');
 const result=await response.json(),url=paymentUrl(result.redirectUrl);if(!result.id)throw Error('Yoco did not return a checkout reference. Retry from your bill.');
 const paid=await db.runTransaction(async tx=>{
  const saved=(await tx.get(ref)).data();if(confirmed(saved))return true;
  if(saved.status!=='awaiting_payment'||saved.yoco?.key!==order.yoco.key)throw Error('This order changed. Reopen your bill.');
  const updated={...saved,yoco:{...saved.yoco,checkoutId:result.id,redirectUrl:url,state:'pending'},revision:saved.revision+1,updatedAtMs:Date.now()};
  tx.set(ref,updated);tx.set(db.doc(`kitShopCustomers/${saved.ownerUid}/orders/${body.orderId}`),updated);return false;
 });
 return paid?{paid:true}:{redirectUrl:url};
}
// Called only after the existing handleYocoWebhook signature check succeeds.
async function settle(db,event){
 const data=event.payload||{},meta=data.metadata||{};
 if(meta.purpose!=='kit_shop'||!['payment.succeeded','payment.failed'].includes(event.type))return;
 if(!validId(meta.orderId))throw Error('Invalid shop payment reference.');
 await db.runTransaction(async tx=>{
  const ref=db.doc(`kitShopOrders/${meta.orderId}`),order=(await tx.get(ref)).data();
  if(!order)throw Error('Shop payment has no matching order.');
  if(confirmed(order)||order.paymentStatus==='refund_recorded')return;
  const pay=order.yoco||{},checkoutId=meta.checkoutId||data.checkoutId;
  if(meta.paymentKey!==pay.key||!checkoutId||pay.checkoutId&&pay.checkoutId!==checkoutId||data.amount!==order.totalMinor||data.currency!=='ZAR'||data.mode!==pay.mode)throw Error('Shop payment does not match the saved checkout.');
  if(order.status!=='awaiting_payment')throw Error('The shop order is no longer awaiting payment.');
  const paid=event.type==='payment.succeeded',now=Date.now();
  const refs=(order.bulkAllocations||[]).map(a=>db.doc(`${require("./kitBulk.cjs").root(order.clubId)}/requests/${a.memberId}_${a.side}`));
  const rows=paid?await Promise.all(refs.map(r=>tx.get(r))):[];
  const updated={...order,paymentStatus:paid?'confirmed':'unpaid',status:paid?'processing':'awaiting_payment',yoco:{...pay,checkoutId,state:paid?'paid':'failed',settledAtMs:now},revision:order.revision+1,updatedAtMs:now,timeline:[...(order.timeline||[]),{status:paid?'processing':'awaiting_payment',atMs:now,note:paid?'Yoco payment confirmed':'Yoco payment failed. Retry payment.'}]};
  tx.set(ref,updated);tx.set(db.doc(`kitShopCustomers/${order.ownerUid}/orders/${meta.orderId}`),updated);
  rows.forEach((snap,i)=>{const row=snap.data();if(row?.orderId===meta.orderId)tx.set(refs[i],{...row,status:'processing',revision:(row.revision||0)+1,updatedAtMs:now});});
 });
}
module.exports={checkout,settle,paymentUrl};
