const {isAdmin}=require("./poolAdminPolicy.cjs");
const {createHash,randomUUID}=require("node:crypto");
const fee=1500,cap=4500;
const accountId=user=>createHash("sha256").update(String(user.email||user.uid).trim().toLowerCase()).digest("hex");
const accountRef=(db,id)=>db.doc(`poolNights/_billing/accounts/${id}`);
const fresh=()=>({used:0,deferred:{}});
const total=account=>Object.values(account.deferred||{}).reduce((sum,n)=>sum+n,0);
const assert= (ok,message)=>{if(!ok)throw Error(message);};
function eligible(night){return night.pool.matches.length>=10;}
function decisionRequired(night,uid){const bill=night.contribution||{state:"due"};return night.lifecycle!=="ended"&&night.lifecycle!=="deleted"&&night.ownerUid===uid&&eligible(night)&&bill.state==="due"&&!bill.addressedAt&&!bill.requestedUid&&!bill.orderId;}
async function checkCreate(db,user){
 const account=(await accountRef(db,accountId(user)).get()).data()||fresh();assert(total(account)<cap,"You’ve reached the limit on deferred payments. Open a previous night to contribute before starting another.");
 const previous=await db.collection("poolNights").where("ownerUid","==",user.uid).limit(100).get();
 assert(!previous.docs.some(doc=>{const n=doc.data();return n.contribution?.state==="due";}),"Choose Pay, a free coupon, or Pay next time in your previous night before starting another. Your existing night is safe.");
}
async function handle({db,user,body}){
 assert(user?.uid&&user.email_verified===true&&!user.cameraSession,"Sign in with a verified account.");
 const code=String(body.code||"").toUpperCase();assert(/^[A-F0-9]{10}$/.test(code),"Choose a valid night.");
 return db.runTransaction(async tx=>{
  const ref=db.doc(`poolNights/${code}`),night=(await tx.get(ref)).data();assert(night,"Night not found.");
  const owner=isAdmin(night,user.uid);assert(owner||night.members?.[user.uid]?.status==="approved","Join this night first.");
  const id=accountId(user),ar=accountRef(db,id),account=(await tx.get(ar)).data()||fresh();
  let bill=night.contribution||{state:"due"};
  const invited=bill.requestedUid===user.uid,active=eligible(night);
  const summary=()=>({eligible:active,decisionRequired:decisionRequired({...night,contribution:bill},user.uid),state:bill.state,promptShown:!!bill.promptSeenAt,promptRecipient:night.ownerUid===user.uid,owner,invited,payer:bill.payerUid===user.uid,responsible:bill.accountId===id,requesterName:night.members?.[bill.requestedByUid]?.name||"Your admin",requestId:bill.requestId||String(bill.requestedAt||"legacy"),requestName:night.members?.[bill.requestedUid]?.name||"",couponsLeft:Math.max(0,3-account.used),outstanding:total(account),canDefer:total(account)+(account.deferred[code]?0:fee)<=cap,amount:owner||bill.accountId===id?total(account)+(account.deferred[code]?0:fee):fee,pending:!!bill.orderId,checkoutUrl:bill.payerUid===user.uid?bill.checkoutUrl||"":"",paidBy:bill.paidByName||""});
  if(body.action==="billingStatus"){if(active&&!night.contribution){bill={state:"due",activatedAt:Date.now()};tx.set(ref,{...night,contribution:bill,revision:night.revision+1});}const result=summary();if(bill.orderId&&bill.payerUid===user.uid){const order=(await tx.get(db.doc(`poolNights/_billing/orders/${bill.orderId}`))).data();result.checkoutUrl=order?.redirectUrl||"";}return result;}
  if(body.action==="billingPromptSeen"){
   if(night.ownerUid!==user.uid||!active)return summary();
   if(!bill.promptSeenAt&&(body.manual===true||(typeof body.token==="string"&&body.token===bill.promptLease?.token))){
    bill={...bill,promptSeenAt:Date.now()};delete bill.promptLease;tx.set(ref,{...night,contribution:bill,revision:night.revision+1});
   }
   return summary();
  }
  if(body.action==="billingPrompt"){
   if(night.ownerUid!==user.uid||!active||bill.state!=="due"||bill.promptSeenAt||bill.orderId)return {...summary(),showPrompt:false};
   if(!body.clientId){
    if(bill.promptShownAt)return {...summary(),showPrompt:false};
    bill={...bill,promptShownAt:Date.now()};tx.set(ref,{...night,contribution:bill,revision:night.revision+1});return {...summary(),showPrompt:true};
   }
   const clientId=String(body.clientId||randomUUID()).slice(0,100),lease=bill.promptLease;
   if(lease&&lease.expiresAt>Date.now()&&lease.clientId!==clientId)return {...summary(),showPrompt:false};
   const nextLease=lease&&lease.expiresAt>Date.now()?lease:{token:randomUUID(),clientId,expiresAt:Date.now()+30000};
   bill={...bill,promptLease:nextLease};tx.set(ref,{...night,contribution:bill,revision:night.revision+1});return {...summary(),showPrompt:true,promptToken:nextLease.token};
  }
  assert(active,"Contributions open after ten recorded games.");
  assert(!["paid","coupon"].includes(bill.state),"This night is already covered. Thank you!");
  assert(!bill.orderId,"A checkout is already open. Resume it or wait for payment confirmation.");
  if(body.action==="billingDecline"){
   assert(invited,"This payment request is not addressed to you.");bill={...bill,requestedUid:null};
  }else{
   assert(owner||(body.action==="billingCoupon"&&bill.accountId===id),"Only the current night admin can choose this option.");
   if(body.action==="billingAsk"){
    const uid=String(body.uid||"");assert(uid!==user.uid&&night.members?.[uid]?.status==="approved"&&night.pool.players.some(p=>p.id===uid&&!p.removed),"Choose an approved teammate.");
    assert(bill.state!=="deferred","This night was already deferred. Pay its balance from the responsible account.");
    bill={...bill,requestedUid:uid,requestedByUid:user.uid,requestedAt:Date.now(),addressedAt:Date.now(),promptSeenAt:Date.now(),requestId:randomUUID()};
    tx.set(db.doc(`poolNights/${code}/alerts/${randomUUID()}`),{kind:"contribution",subjectUid:uid,createdAt:Date.now()});
   }else if(body.action==="billingCoupon"){
    assert(bill.state!=="deferred"||bill.accountId===id,"This deferred contribution belongs to another player.");assert(account.used<3,"You have used your three lifetime coupons.");
    const deferred={...account.deferred};if(bill.accountId===id)delete deferred[code];
    tx.set(ar,{...account,used:account.used+1,deferred});bill={state:"coupon",coveredByUid:user.uid,coveredAt:Date.now()};
   }else if(body.action==="billingDefer"){
    assert(bill.state!=="deferred","This night is already saved for next time.");assert(total(account)+fee<=cap,"You’ve reached the limit on deferred payments.");
    tx.set(ar,{...account,deferred:{...account.deferred,[code]:fee}});bill={state:"deferred",accountId:id,responsibleUid:user.uid,deferredAt:Date.now()};
   }else throw Error("Choose a valid contribution option.");
  }
  tx.set(ref,{...night,contribution:bill,revision:night.revision+1});return summary();
 });
}
async function reserve({db,user,code,origin,mode}){
 assert(user?.uid&&user.email_verified===true&&!user.cameraSession,"Sign in with a verified account.");
 assert(/^[A-F0-9]{10}$/.test(code),"Choose a valid night.");
 const allowed=["https://five-asides-near-me-development.web.app","https://five-asides-near-me-testing.web.app","https://five-asides-near-me.web.app","https://five-asides-near-me-staging.web.app"];
 assert(allowed.includes(origin),"Open the FANM website to pay securely.");
 return db.runTransaction(async tx=>{
  const nr=db.doc(`poolNights/${code}`),night=(await tx.get(nr)).data();assert(night&&eligible(night),"Contributions open after ten games.");
  const bill=night.contribution||{state:"due"},owner=isAdmin(night,user.uid);
  assert(owner||bill.requestedUid===user.uid||bill.payerUid===user.uid||bill.accountId===accountId(user),"Ask the admin to invite you to cover this night.");
  assert(night.members?.[user.uid]?.status==="approved","Join this night first.");assert(!["paid","coupon"].includes(bill.state),"This night is already covered.");
  if(bill.orderId){const existing=(await tx.get(db.doc(`poolNights/_billing/orders/${bill.orderId}`))).data();assert(existing?.mode===mode,"Payment configuration changed. Please contact FANM support before retrying.");assert(existing?.payerUid===user.uid,"Another player has already opened checkout. Please wait.");return existing;}
  const id=accountId(user),ar=accountRef(db,id),account=(await tx.get(ar)).data()||fresh();
  assert(bill.state!=="deferred"||bill.accountId===id,"This balance belongs to the player who deferred it.");
  const debts=owner||bill.accountId===id?Object.keys(account.deferred):[],codes=[...new Set([...debts,code])];
  const refs=codes.map(c=>db.doc(`poolNights/${c}`));const nights=await Promise.all(refs.map(r=>tx.get(r)));
  assert(nights.every(s=>!s.data()?.contribution?.orderId),"Another checkout already covers part of this balance.");
  const order={id:randomUUID(),payerUid:user.uid,accountId:id,codes,amount:codes.length*fee,code,status:"creating",origin,mode,createdAt:Date.now(),payerName:night.members[user.uid].name};
  tx.set(db.doc(`poolNights/_billing/orders/${order.id}`),order);
  nights.forEach((s,i)=>{const n=s.data();assert(n,"A previous night could not be found.");tx.set(refs[i],{...n,contribution:{...(n.contribution||{state:"due"}),orderId:order.id,payerUid:user.uid},revision:n.revision+1});});return order;
 });
}
async function settle(db,event){
 const payload=event.payload||{},metadata=payload.metadata||{};if(metadata.purpose!=="pool_night")return false;
 assert(/^[a-f0-9-]{36}$/.test(metadata.poolOrderId||""),"Invalid pool payment reference.");
 if(!["payment.succeeded","payment.failed"].includes(event.type))return true;
 await db.runTransaction(async tx=>{
  const or=db.doc(`poolNights/_billing/orders/${metadata.poolOrderId}`),order=(await tx.get(or)).data();assert(order,"Pool payment order missing.");
  if(order.status==="paid")return;
  assert(payload.currency==="ZAR"&&payload.amount===order.amount,"Pool payment amount or currency does not match.");
  assert(payload.mode===order.mode,"Pool payment environment does not match.");
  assert(!order.checkoutId||payload.metadata.checkoutId===order.checkoutId,"Pool checkout does not match.");
  const ar=accountRef(db,order.accountId),account=(await tx.get(ar)).data()||fresh();
  const refs=order.codes.map(code=>db.doc(`poolNights/${code}`)),snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
  const paid=event.type==="payment.succeeded",deferred={...account.deferred};
  snaps.forEach((snapshot,i)=>{const night=snapshot.data();assert(night?.contribution?.orderId===order.id,"Pool payment reservation changed.");const contribution={...night.contribution};delete contribution.orderId;delete contribution.checkoutUrl;delete contribution.payerUid;
   if(paid){delete deferred[order.codes[i]];Object.assign(contribution,{state:"paid",paidAt:Date.now(),paidByUid:order.payerUid,paidByName:order.payerName,paymentId:payload.id});}
   tx.set(refs[i],{...night,contribution,revision:night.revision+1});});
  if(paid)tx.set(ar,{...account,deferred});tx.set(or,{...order,status:paid?"paid":"failed",eventId:event.id,settledAt:Date.now()});
 });return true;
}
module.exports={handle,reserve,settle,checkCreate,eligible,accountId,decisionRequired};
