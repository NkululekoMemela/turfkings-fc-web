const crypto=require("node:crypto");
const OWNER_EMAIL="nkululekolerato@gmail.com";
const text=(value,max=200)=>String(value||"").trim().slice(0,max);
const id=value=>{const s=text(value,100);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(s))throw new Error("Invalid shop reference.");return s;};
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`Check ${label}.`);return value;};
function signed(user){if(!user?.uid||!user.email_verified||user.cameraSession)throw new Error("Sign in with your verified Google account.");}
const operator=(user,access)=>String(user.email||"").toLowerCase()===OWNER_EMAIL||(access?.uids||[]).includes(user.uid);
const DEFAULT={enabled:false,currency:"ZAR",countryCode:"ZA",collectionEnabled:false,collectionAddress:"",deliveryEnabled:false,zones:[],paymentInstructions:"",paymentMethod:"yoco",bulkOnly:true,launchProfileVersion:0};
function settings(draft){
 const s={...DEFAULT,enabled:draft.enabled===true,launchProfileVersion:draft.launchProfileVersion===1?1:0,collectionEnabled:draft.collectionEnabled===true,collectionAddress:text(draft.collectionAddress,500),deliveryEnabled:draft.deliveryEnabled===true,paymentInstructions:text(draft.paymentInstructions,1500),zones:(Array.isArray(draft.zones)?draft.zones:[]).slice(0,30).map(zone=>({id:id(zone.id),label:text(zone.label,100),feeMinor:integer(zone.feeMinor,0,10000000,"delivery fee")}))};
 if(new Set(s.zones.map(z=>z.id)).size!==s.zones.length||s.zones.some(z=>!z.label))throw new Error("Delivery areas need distinct references and names.");
 if(s.collectionEnabled&&!s.collectionAddress)throw new Error("Add the collection point.");
 if(s.deliveryEnabled&&!s.zones.length)throw new Error("Add at least one delivery area and fee.");
 if(s.enabled&&(!s.collectionEnabled&&!s.deliveryEnabled))throw new Error("Configure delivery or collection before opening checkout.");
 return s;
}
function product(draft){
 const p={title:text(draft.title,100),description:text(draft.description,600),kind:"bib",color:text(draft.color,40),size:text(draft.size,40),priceMinor:integer(draft.priceMinor,1,10000000,"bib price"),stock:integer(draft.stock,0,100000,"available stock"),active:draft.active===true,madeToOrder:draft.madeToOrder===true,currency:"ZAR"};
 if(!p.title||!/^#[0-9a-f]{6}$/i.test(p.color)||!p.size)throw new Error("Add a title, bib colour and size.");return p;
}
function requestData(body){
 if(!Array.isArray(body.items)||!body.items.length||body.items.length>20)throw new Error("Choose between 1 and 20 bib variants.");
 const seen=new Set();const items=body.items.map(item=>{const productId=id(item.productId);if(seen.has(productId))throw new Error("Combine quantities for each bib variant.");seen.add(productId);return {productId,quantity:integer(item.quantity,1,20,"quantity")};}).sort((a,b)=>a.productId.localeCompare(b.productId));
 const customer={name:text(body.customer?.name,100),phone:text(body.customer?.phone,40)};
 if(!customer.name||!/^\+?[\d ()-]{7,40}$/.test(customer.phone))throw new Error("Add your name and contact phone number.");
 const method=body.fulfilment?.method;
 if(!["delivery","collection"].includes(method))throw new Error("Choose delivery or collection.");
 const fulfilment={method,...(method==="delivery"?{zoneId:id(body.fulfilment.zoneId),address:text(body.fulfilment.address,600),postalCode:text(body.fulfilment.postalCode,20)}:{})};
 if(method==="delivery"&&(!fulfilment.address||!fulfilment.postalCode))throw new Error("Add the complete delivery address and postal code.");
 return {items,customer,fulfilment,expectedTotalMinor:integer(body.expectedTotalMinor,1,100000000,"order total")};
}
async function handle({db,user,body}){
 signed(user);const action=body.action;
 if(["hireView","saveHireStock","placeHire","returnHire","recordBibHandout","recordBibReturn","bibReturnsView","saveBibReturnPolicy","reviewBibReturn","confirmBibReturn","disputeBibReturn","recordBibReimbursement","ackBibReimbursement"].includes(action))return require("./fieldBibHire.cjs").handle({db,user,body});
 if(["requestBib","confirmBibContribution"].includes(action))return require("./kitBulk.cjs").handle({db,user,body});
 const configRef=db.doc("kitShopConfig/store"),accessRef=db.doc("kitShopConfig/operators");
 const access=(await accessRef.get()).data(),isOperator=operator(user,access);
 if(action==="activateLaunchShop")return require("./kitShopLaunchProfile.cjs").activateLaunchShop({db,user,isOperator});
 if(action==="bibView"){
  const [view,snapshot]=await Promise.all([require("./kitBulk.cjs").handle({db,user,body}),configRef.get()]);
  return {...view,isOperator,settings:{...Object.fromEntries(Object.keys(DEFAULT).map(key=>[key,snapshot.data()?.[key]??DEFAULT[key]])),revision:snapshot.data()?.revision||0}};
 }
 if(action==="catalogue"){
  const [s,products]=await Promise.all([configRef.get(),db.collection("kitShopProducts").get()]);
  return {settings:{...Object.fromEntries(Object.keys(DEFAULT).map(key=>[key,s.data()?.[key]??DEFAULT[key]])),revision:s.data()?.revision||0},isOperator,products:products.docs.map(d=>({...Object.fromEntries(["title","description","kind","color","size","priceMinor","stock","active","madeToOrder","currency","revision"].map(key=>[key,d.data()[key]])),id:d.id})).filter(p=>isOperator||p.active)};
 }
 if(action==="orders"){
  if(body.manage&&!isOperator)throw new Error("Shop operator access is required.");
  const root=db.collection(body.manage?"kitShopOrders":`kitShopCustomers/${user.uid}/orders`);let query=root.orderBy("createdAtMs","desc").limit(30);
  if(body.cursor){const cursor=await root.doc(id(body.cursor)).get();if(!cursor.exists)throw new Error("Order page expired. Refresh your orders.");query=query.startAfter(cursor);}
  const snap=await query.get();return {orders:snap.docs.map(d=>({...d.data(),id:d.id})),nextCursor:snap.docs.length===30?snap.docs.at(-1).id:""};
 }
 if(action==="saveSettings"||action==="saveProduct"){
  if(!isOperator)throw new Error("Shop operator access is required.");
  const value=action==="saveSettings"?settings(body.settings):product(body.product);
  const ref=action==="saveSettings"?configRef:db.doc(`kitShopProducts/${id(body.productId)}`);
  return db.runTransaction(async tx=>{
   if(!operator(user,(await tx.get(accessRef)).data()))throw new Error("Shop operator access changed.");
   const current=(await tx.get(ref)).data();if((current?.revision||0)!==body.expectedRevision)throw new Error("This shop record changed. Refresh before saving.");
   tx.set(ref,{...value,revision:(current?.revision||0)+1,updatedAtMs:Date.now(),updatedByUid:user.uid});return {ok:true};
  });
 }
 if(action==="placeOrder"){
  const data=requestData(body),requestId=id(body.requestId),orderId=crypto.createHash("sha256").update(`${user.uid}|${requestId}`).digest("hex");
  const requestHash=crypto.createHash("sha256").update(JSON.stringify({...data,...(body.clubId?{clubId:body.clubId,allocations:body.allocations}: {})})).digest("hex"),orderRef=db.doc(`kitShopOrders/${orderId}`);
  return db.runTransaction(async tx=>{
   const plan=body.clubId?await require("./kitBulk.cjs").prepare({db,tx,user,body,orderId}):null;
   const existing=(await tx.get(orderRef)).data();if(existing){if(existing.ownerUid!==user.uid||existing.requestHash!==requestHash)throw new Error("That submission reference was already used for another order.");return {order:{...existing,id:orderId}};}
   const config={...DEFAULT,...(await tx.get(configRef)).data()};if(!config.enabled)throw new Error("The shop is not accepting orders yet.");
   if(config.bulkOnly!==false&&!plan)throw new Error("Your captain places the bulk order. Submit a Club bib request instead.");
   const delivery=data.fulfilment.method==="delivery";if(delivery&&!config.deliveryEnabled||!delivery&&!config.collectionEnabled)throw new Error("This fulfilment option is unavailable.");
   const zone=delivery?config.zones.find(z=>z.id===data.fulfilment.zoneId):null;if(delivery&&!zone)throw new Error("Choose a supported delivery area.");
   const unpaid=await tx.get(db.collection(`kitShopCustomers/${user.uid}/orders`).where("status","==","awaiting_payment").limit(3));
   if(unpaid.docs.length>=3)throw new Error("Complete or cancel an unpaid order before placing another.");
   const docs=await tx.getAll(...data.items.map(item=>db.doc(`kitShopProducts/${item.productId}`)));
   const lines=data.items.map((item,index)=>{const p=docs[index].data();if(!p?.active||!p.madeToOrder&&p.stock<item.quantity)throw new Error("A bib variant is unavailable or has insufficient stock. Refresh your basket.");return {...item,title:p.title,color:p.color,size:p.size,madeToOrder:p.madeToOrder===true,unitPriceMinor:p.priceMinor,lineTotalMinor:p.priceMinor*item.quantity};});
   const subtotalMinor=lines.reduce((sum,line)=>sum+line.lineTotalMinor,0),deliveryMinor=zone?.feeMinor||0,totalMinor=subtotalMinor+deliveryMinor;
   if(totalMinor!==data.expectedTotalMinor)throw new Error("Prices or delivery fees changed. Refresh and review the order total.");
   const now=Date.now(),order={...(plan?{clubId:plan.clubId,bulkAllocations:plan.allocations.map(a=>({memberName:a.memberName,memberId:a.memberId,ownerUid:a.ownerUid,side:a.side,productId:a.productId,number:a.number}))}:{}),ownerUid:user.uid,email:user.email,requestHash,items:lines,customer:data.customer,fulfilment:{...data.fulfilment,countryCode:config.countryCode,...(zone?{area:zone.label}:{collectionAddress:config.collectionAddress})},currency:config.currency,subtotalMinor,deliveryMinor,totalMinor,paymentInstructions:config.paymentInstructions,paymentMethod:"yoco",paymentStatus:"unpaid",status:"awaiting_payment",createdAtMs:now,updatedAtMs:now,revision:1,timeline:[{status:"awaiting_payment",atMs:now}],cancellationRequested:false};
   docs.forEach((snap,index)=>{if(!snap.data().madeToOrder)tx.update(snap.ref,{stock:snap.data().stock-lines[index].quantity,revision:(snap.data().revision||0)+1});});
   tx.set(orderRef,order);tx.set(db.doc(`kitShopCustomers/${user.uid}/orders/${orderId}`),order);if(plan)require("./kitBulk.cjs").write({db,tx,plan,order:{...order,id:orderId}});return {order:{...order,id:orderId}};
  });
 }
 if(action!=="updateOrder")throw new Error("Unknown shop operation.");
 const orderId=id(body.orderId),orderRef=db.doc(`kitShopOrders/${orderId}`);
 return db.runTransaction(async tx=>{
  const order=(await tx.get(orderRef)).data();if(!order)throw new Error("Order not found.");
  const staff=operator(user,(await tx.get(accessRef)).data()),owns=order.ownerUid===user.uid;
  if(!owns&&!staff)throw new Error("This order does not belong to your account.");
  if(order.revision!==body.expectedRevision)throw new Error("This order changed. Refresh it before updating.");
  const decision=body.decision,note=text(body.note,400);let status=order.status,paymentStatus=order.paymentStatus;
  if(decision==="requestCancellation"){
   if(!owns||["cancelled","delivered","collected"].includes(status))throw new Error("This order cannot request cancellation.");
   const updated={...order,cancellationRequested:true,revision:order.revision+1,updatedAtMs:Date.now()};tx.set(orderRef,updated);tx.set(db.doc(`kitShopCustomers/${order.ownerUid}/orders/${orderId}`),updated);return {ok:true};
  }
  if(["cancel","processing"].includes(decision)&&order.paymentStatus==="pending"&&order.yoco)throw new Error("Yoco payment is awaiting confirmation. Request a review instead of cancelling or confirming it manually.");
  if(decision==="cancel"&&order.yoco?.checkoutId&&order.paymentStatus!=="confirmed")throw new Error("Request a payment review before cancelling a Yoco checkout. Stock stays reserved until payment is resolved.");
  if(decision==="cancel"){
   if(status==="cancelled"||["delivered","collected"].includes(status))throw new Error("This order cannot be cancelled.");
   if(!staff&&(!owns||status!=="awaiting_payment"))throw new Error("Ask the shop operator about cancelling this order.");
   if(paymentStatus==="confirmed"&&(!staff||!note||body.refundConfirmed!==true))throw new Error("Record the completed refund reference before cancelling a paid order.");
   status="cancelled";if(paymentStatus==="confirmed")paymentStatus="refund_recorded";
  }else{
   if(!staff)throw new Error("Only the shop operator may confirm payment or fulfil an order.");
   const allowed={awaiting_payment:["processing"],processing:[order.fulfilment.method==="delivery"?"dispatched":"ready_for_collection"],dispatched:["delivered"],ready_for_collection:["collected"]};
   if(!allowed[status]?.includes(decision))throw new Error("This order status cannot move to that stage.");
   if(decision==="processing"){if(!note)throw new Error("Record the verified payment reference.");paymentStatus="confirmed";}
   if(decision==="dispatched"&&(!text(body.courier,100)||!text(body.trackingReference,100)))throw new Error("Add the courier and tracking reference.");
   status=decision;
  }
  const releaseHire=status==="cancelled"&&order.orderType==="bib_hire"?await require("./fieldBibHire.cjs").prepareRelease({db,tx,order,orderId}):()=>{};
  const restock=status==="cancelled"?await tx.getAll(...order.items.map(item=>db.doc(`kitShopProducts/${item.productId}`))):[];
  const bibRequests=order.bulkAllocations?.length?await tx.getAll(...order.bulkAllocations.map(a=>db.doc(`${require("./kitBulk.cjs").root(order.clubId)}/requests/${a.memberId}_${a.side}`))):[];
  const atMs=Date.now(),updated={...order,status,paymentStatus,updatedAtMs:atMs,revision:order.revision+1,cancellationRequested:false,timeline:[...order.timeline,{status,atMs,note,byUid:user.uid}],...(status==="dispatched"?{courier:text(body.courier,100),trackingReference:text(body.trackingReference,100)}:{})};
  releaseHire();
  restock.forEach((snap,index)=>{if(snap.data()&&!order.items[index].madeToOrder)tx.update(snap.ref,{stock:snap.data().stock+order.items[index].quantity,revision:(snap.data().revision||0)+1});});
  for(const snap of bibRequests)if(snap.data()?.orderId===orderId)tx.set(snap.ref,{...snap.data(),status,updatedAtMs:atMs,revision:snap.data().revision+1});
  tx.set(orderRef,updated);tx.set(db.doc(`kitShopCustomers/${order.ownerUid}/orders/${orderId}`),updated);return {ok:true};
 });
}
module.exports={handle,settings,product,requestData};
