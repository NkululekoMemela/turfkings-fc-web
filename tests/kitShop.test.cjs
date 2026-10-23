const {test}=require('node:test'),assert=require('node:assert/strict');
const shop=require('../functions/kitShop.cjs'),{fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const buyer={uid:'buyer',email:'buyer@example.com',email_verified:true},staff={uid:'operator',email:'operator@example.com',email_verified:true};
const config={enabled:true,currency:'ZAR',countryCode:'ZA',collectionEnabled:true,collectionAddress:'Club office',deliveryEnabled:true,zones:[{id:'local',label:'Local',feeMinor:5000}],paymentInstructions:'Use the verified shop payment details',revision:1};
const bib={title:'Training bib',description:'Mesh',kind:'bib',color:'#2563eb',size:'Adult M',priceMinor:10000,stock:5,active:true,currency:'ZAR',revision:1};
function setup(extra={}){
 const f=fixture({'kitShopConfig/store':config,'kitShopConfig/operators':{uids:['operator']},'kitShopProducts/blue':bib,...extra});
 const original=f.db.collection;
 function wrap(q,options={}){return new Proxy(q,{get(target,key){
  if(key==='orderBy')return(field,direction)=>wrap(q,{...options,field,direction});
  if(key==='limit')return limit=>wrap(q,{...options,limit});
  if(key==='startAfter')return after=>wrap(q,{...options,after:after.id});
  if(key==='where')return(...args)=>wrap(q.where(...args),options);
  if(key==='get')return async()=>{let {docs}=await q.get();if(options.field)docs.sort((a,b)=>{const cmp=a.data()[options.field]-b.data()[options.field]||a.id.localeCompare(b.id);return options.direction==='desc'?-cmp:cmp;});if(options.after)docs=docs.slice(docs.findIndex(d=>d.id===options.after)+1);if(options.limit)docs=docs.slice(0,options.limit);return{docs,size:docs.length,empty:!docs.length};};
  return target[key];
 }});}
 f.db.collection=path=>wrap(original(path));
 f.call=(body,user=buyer)=>shop.handle({db:f.db,user,body});return f;
}
const request=(extra={})=>({action:'placeOrder',requestId:'request-1',items:[{productId:'blue',quantity:2}],customer:{name:'Buyer',phone:'+27821111111'},fulfilment:{method:'collection'},expectedTotalMinor:20000,...extra});
const update=(order,decision,extra={})=>({action:'updateOrder',orderId:order.id,expectedRevision:order.revision,decision,...extra});
const latest=(f,id)=>({...f.records.get('kitShopOrders/'+id),id});
test('verified accounts only, and club captains cannot change the shop',async()=>{
 const f=setup();for(const user of [null,{...buyer,email_verified:false},{...buyer,cameraSession:true}])await assert.rejects(f.call({action:'catalogue'},user),/verified/);
 await assert.rejects(f.call({action:'saveSettings',settings:config,expectedRevision:1},{...buyer,role:'admin'}),/operator/);
 await assert.rejects(f.call({action:'orders',manage:true}),/operator/);
});
test('new shop is closed and private operator metadata is not in shopper catalogue',async()=>{
 const f=setup({'kitShopConfig/store':undefined,'kitShopProducts/hidden':{...bib,active:false}});f.records.delete('kitShopConfig/store');
 const result=await f.call({action:'catalogue'});assert.equal(result.settings.enabled,false);assert.equal(result.isOperator,false);assert.equal(result.products.length,1);assert.equal(result.settings.updatedByUid,undefined);
 await assert.rejects(f.call(request()),/not accepting/);assert.equal(f.records.get('kitShopProducts/blue').stock,5);
});
test('prices, delivery fees and stock reservations come from server records',async()=>{
 const f=setup();const {order}=await f.call(request({fulfilment:{method:'delivery',zoneId:'local',address:'12 Test Road',postalCode:'7800'},expectedTotalMinor:25000,totalMinor:1,ownerUid:'other',paymentStatus:'confirmed'}));
 assert.equal(order.totalMinor,25000);assert.equal(order.ownerUid,buyer.uid);assert.equal(order.paymentStatus,'unpaid');assert.equal(f.records.get('kitShopProducts/blue').stock,3);
 assert.deepEqual(f.records.get(`kitShopCustomers/buyer/orders/${order.id}`),f.records.get('kitShopOrders/'+order.id));
 assert.equal(order.fulfilment.countryCode,'ZA');assert.equal(f.records.has('clubs/club/members/buyer'),false);
});
test('a retried submission creates exactly one order and cannot be reused for changed items',async()=>{
 const f=setup(),first=await f.call(request()),second=await f.call(request());assert.equal(second.order.id,first.order.id);assert.equal(f.records.get('kitShopProducts/blue').stock,3);
 await assert.rejects(f.call(request({items:[{productId:'blue',quantity:1}],expectedTotalMinor:10000})),/already used/);
 assert.equal([...f.records.keys()].filter(p=>p.startsWith('kitShopOrders/')).length,1);
});
test('stale prices, stock shortages and unsupported fulfilment fail without partial changes',async()=>{
 for(const extra of [{expectedTotalMinor:1},{items:[{productId:'blue',quantity:6}],expectedTotalMinor:60000},{fulfilment:{method:'delivery',zoneId:'unknown',address:'12 Road',postalCode:'7800'},expectedTotalMinor:20000},{items:[{productId:'blue',quantity:1},{productId:'missing',quantity:1}],expectedTotalMinor:20000}]){
  const f=setup();await assert.rejects(f.call(request(extra)));assert.equal(f.records.get('kitShopProducts/blue').stock,5);assert.equal([...f.records.keys()].filter(p=>p.startsWith('kitShopOrders/')).length,0);
 }
});
test('buyers see only their orders and cannot update another buyer order or confirm payment',async()=>{
 const f=setup(),{order}=await f.call(request());assert.equal((await f.call({action:'orders'}, {...buyer,uid:'other'})).orders.length,0);
 await assert.rejects(f.call(update(order,'cancel'),{...buyer,uid:'other'}),/does not belong/);
 await assert.rejects(f.call(update(order,'processing',{note:'forged'})),/Only the shop/);
 assert.equal((await f.call({action:'orders'})).orders[0].id,order.id);
});
test('unpaid cancellation releases stock once and rejects stale repeated updates',async()=>{
 const f=setup(),{order}=await f.call(request());await f.call(update(order,'cancel'));assert.equal(f.records.get('kitShopProducts/blue').stock,5);
 await assert.rejects(f.call(update(order,'cancel')),/changed/);await assert.rejects(f.call(update(latest(f,order.id),'cancel')),/cannot be cancelled/);assert.equal(f.records.get('kitShopProducts/blue').stock,5);
});
test('delivery follows verified payment, tracked dispatch and delivered state',async()=>{
 const f=setup();let {order}=await f.call(request({fulfilment:{method:'delivery',zoneId:'local',address:'12 Road',postalCode:'7800'},expectedTotalMinor:25000}));
 await assert.rejects(f.call(update(order,'processing'),staff),/payment reference/);
 await f.call(update(order,'processing',{note:'BANK-123'}),staff);order=latest(f,order.id);assert.equal(order.paymentStatus,'confirmed');
 await assert.rejects(f.call(update(order,'dispatched'),staff),/courier/);
 await f.call(update(order,'dispatched',{courier:'Courier',trackingReference:'TRACK-123'}),staff);order=latest(f,order.id);assert.equal(order.trackingReference,'TRACK-123');
 await f.call(update(order,'delivered'),staff);assert.equal(latest(f,order.id).timeline.length,4);await assert.rejects(f.call(update(latest(f,order.id),'cancel'),staff),/cannot be cancelled/);
});
test('collection and paid cancellation require explicit fulfilment or completed refund',async()=>{
 const f=setup();let {order}=await f.call(request());await f.call(update(order,'processing',{note:'BANK-123'}),staff);order=latest(f,order.id);
 await f.call(update(order,'requestCancellation'));order=latest(f,order.id);assert.equal(order.cancellationRequested,true);
 await assert.rejects(f.call(update(order,'cancel',{note:'requested'}),staff),/completed refund/);
 await f.call(update(order,'cancel',{note:'REFUND-123',refundConfirmed:true}),staff);assert.equal(latest(f,order.id).paymentStatus,'refund_recorded');assert.equal(f.records.get('kitShopProducts/blue').stock,5);
 const g=setup();let other=(await g.call(request())).order;for(const decision of ['processing','ready_for_collection','collected']){await g.call(update(other,decision,{note:'BANK-123'}),staff);other=latest(g,other.id);}assert.equal(other.status,'collected');
});
test('shop configuration validates real fulfilment and stale stock edits cannot undo reservations',async()=>{
 const f=setup();await assert.rejects(f.call({action:'saveSettings',expectedRevision:1,settings:{enabled:true}},staff),/Configure/);
 await f.call(request());await assert.rejects(f.call({action:'saveProduct',productId:'blue',expectedRevision:1,product:bib},staff),/changed/);
 await f.call({action:'saveProduct',productId:'blue',expectedRevision:2,product:{...bib,stock:4}},staff);assert.equal(f.records.get('kitShopProducts/blue').stock,4);
});
test('outstanding unpaid order limit and private pagination are enforced',async()=>{
 const f=setup({'kitShopProducts/blue':{...bib,stock:100}});for(let n=0;n<3;n++)await f.call(request({requestId:'request-'+n}));await assert.rejects(f.call(request({requestId:'request-4'})),/unpaid order/);
 for(let n=0;n<33;n++)f.records.set(`kitShopCustomers/buyer/orders/order-${String(n).padStart(2,'0')}`,{createdAtMs:n,status:'delivered'});
 const first=await f.call({action:'orders'}),next=await f.call({action:'orders',cursor:first.nextCursor});assert.equal(first.orders.length,30);assert.equal(next.orders.length,6);assert.equal(new Set([...first.orders,...next.orders].map(o=>o.id)).size,36);
});
