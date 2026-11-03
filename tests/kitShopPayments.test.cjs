const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const api=require('../functions/kitShopPayments.cjs');
const id='a'.repeat(64),user={uid:'captain',email_verified:true},secret='sk_test_example';
function setup(){return fixture({['kitShopOrders/'+id]:{ownerUid:'captain',clubId:'club',currency:'ZAR',totalMinor:57000,subtotalMinor:57000,deliveryMinor:0,status:'awaiting_payment',paymentStatus:'unpaid',revision:1,items:[{productId:'bib',quantity:6}],bulkAllocations:[{memberId:'m1',side:'home'}],timeline:[]},'kitShopConfig/club_club/requests/m1_home':{orderId:id,status:'ordered',revision:1},'kitShopProducts/bib':{stock:12}});}
const body={orderId:id,amount:1,origin:'https://attacker.invalid'};
const result={id:'ch_one',redirectUrl:'https://checkout.yoco.com/ch_one'};
const checkout=(f,request=async()=>({ok:true,json:async()=>result}),who=user)=>api.checkout({db:f.db,user:who,body,secret,request});
const saved=f=>f.records.get('kitShopOrders/'+id);
function event(f,type='payment.succeeded',extra={}){return {type,payload:{amount:57000,currency:'ZAR',mode:'test',metadata:{purpose:'kit_shop',orderId:id,paymentKey:saved(f).yoco.key,checkoutId:'ch_one'},...extra}};}
test('the saved bill determines the Yoco charge, and retries reuse one checkout',async()=>{
 const f=setup();let calls=0;
 const request=async(url,options)=>{calls++;assert.equal(url,'https://payments.yoco.com/api/checkouts');const p=JSON.parse(options.body);assert.equal(p.amount,57000);assert.equal(p.metadata.orderId,id);assert.ok(p.successUrl.startsWith('https://five-asides-near-me'));assert.equal(options.headers['Idempotency-Key'],p.externalId);return {ok:true,json:async()=>result};};
 assert.equal((await checkout(f,request)).redirectUrl,result.redirectUrl);await checkout(f,request);assert.equal(calls,1);assert.equal(saved(f).paymentStatus,'pending');assert.equal(f.records.get('kitShopProducts/bib').stock,12);
});
test('verified webhook updates the order, customer bill and pending bibs exactly once',async()=>{
 const f=setup();await checkout(f);const e=event(f);await api.settle(f.db,e);const revision=saved(f).revision;
 assert.equal(saved(f).status,'processing');assert.equal(saved(f).paymentStatus,'confirmed');assert.equal(f.records.get(`kitShopCustomers/captain/orders/${id}`).status,'processing');assert.equal(f.records.get('kitShopConfig/club_club/requests/m1_home').status,'processing');
 await api.settle(f.db,e);await api.settle(f.db,event(f,'payment.failed'));assert.equal(saved(f).revision,revision);assert.equal(saved(f).status,'processing');
});
test('another account, anonymous/camera accounts and closed orders cannot open a checkout',async()=>{
 const f=setup();for(const who of [{uid:'other',email_verified:true},{...user,cameraSession:true},{...user,email_verified:false},{...user,firebase:{sign_in_provider:'anonymous'}}])await assert.rejects(checkout(f,undefined,who));
 f.records.set('kitShopOrders/'+id,{...saved(f),status:'cancelled'});await assert.rejects(checkout(f),/not available/);
});
test('wrong amount, mode, currency and checkout references cannot settle a bill',async()=>{
 const f=setup();await checkout(f);for(const extra of [{amount:1},{mode:'live'},{currency:'USD'},{metadata:{...event(f).payload.metadata,checkoutId:'wrong'}}])await assert.rejects(api.settle(f.db,event(f,'payment.succeeded',extra)),/does not match/);
 assert.equal(saved(f).status,'awaiting_payment');
});
test('network failure keeps one saved order and reuses the idempotency key on retry',async()=>{
 const f=setup();let firstKey;
 await assert.rejects(checkout(f,async(_url,options)=>{firstKey=options.headers['Idempotency-Key'];throw Error('network');}),/order is saved/);
 await checkout(f,async(_url,options)=>{assert.equal(options.headers['Idempotency-Key'],firstKey);return {ok:true,json:async()=>result};});
 assert.equal([...f.records.keys()].filter(p=>p.startsWith('kitShopOrders/')).length,1);
});
test('a failed payment can retry, while a paid order never opens a second checkout',async()=>{
 const f=setup();await checkout(f);const key=saved(f).yoco.key;await api.settle(f.db,event(f,'payment.failed'));await checkout(f);assert.notEqual(saved(f).yoco.key,key);
 await api.settle(f.db,event(f));const paid=await checkout(f,()=>{throw Error('must not charge');});assert.equal(paid.paid,true);
});
test('unsafe checkout destinations are rejected',()=>{for(const url of ['http://checkout.yoco.com/x','https://yoco.com.attacker.invalid/x','javascript:alert(1)'])assert.throws(()=>api.paymentUrl(url));});
test('staging cannot create a checkout with a live merchant key',async t=>{
 const prior=process.env.GCLOUD_PROJECT;process.env.GCLOUD_PROJECT='five-asides-near-me-staging';t.after(()=>{if(prior===undefined)delete process.env.GCLOUD_PROJECT;else process.env.GCLOUD_PROJECT=prior;});
 await assert.rejects(api.checkout({db:setup().db,user,body,secret:'sk_live_example'}),/test key/);
});
test('a webhook arriving before checkout creation returns cannot downgrade confirmed payment',async()=>{
 const f=setup();const response=await checkout(f,async()=>{await api.settle(f.db,event(f));return {ok:true,json:async()=>result};});
 assert.equal(response.paid,true);assert.equal(saved(f).paymentStatus,'confirmed');assert.equal(saved(f).yoco.state,'paid');
});
test('an in-flight payment cannot release reserved stock through cancellation',async()=>{
 const f=setup();await checkout(f);
 await assert.rejects(require('../functions/kitShop.cjs').handle({db:f.db,user,body:{action:'updateOrder',orderId:id,expectedRevision:saved(f).revision,decision:'cancel'}}),/awaiting confirmation/);
 assert.equal(saved(f).status,'awaiting_payment');assert.equal(f.records.get('kitShopProducts/bib').stock,12);
});
test('Yoco shop setup does not require a redundant manual bank-payment step',()=>{
 const settings=require('../functions/kitShop.cjs').settings({enabled:true,collectionEnabled:true,collectionAddress:'Supplier collection point'});
 assert.equal(settings.paymentMethod,'yoco');assert.equal(settings.enabled,true);assert.equal(settings.paymentInstructions,'');
});
