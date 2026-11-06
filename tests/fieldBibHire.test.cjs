const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');
const {handle,inventory}=require('../functions/fieldBibHire.cjs');
const captain={uid:'cap',email:'cap@example.com',email_verified:true},manager={uid:'manager',email_verified:true};
function setup(){return fixture({
 'leagueVenues/f':{name:'Field',ownerUid:'manager',league:{activeSeason:{id:'season',matchDays:[{id:'day',status:'scheduled',dateLocal:'2099-01-01'}],fixtures:[{id:'game',matchDayId:'day',status:'scheduled',clubAId:'club',clubBId:'other'}]}}},
 'clubs/club':{name:'Club',homeColor:'Blue',ownerUid:'cap'},'clubs/other':{homeColor:'Orange'},'clubs/club/members/cap':{uid:'cap',status:'active',role:'captain'},'clubFieldMemberships/club':{status:'active',venueId:'f'}
 });}
const stock=[1,2,3,4,5,6].map(number=>({color:'Blue',number,quantity:1}));
const hire={action:'placeHire',clubId:'club',seasonId:'season',matchDayId:'day',requestId:'request',customer:{name:'Captain',phone:'0768304880'}};
test('inventory accepts actual numbered quantities and rejects duplicate or invalid numbers',()=>{
 assert.equal(inventory(stock).length,6);assert.throws(()=>inventory([{color:'Blue',number:22,quantity:1}]),/1–6/);assert.throws(()=>inventory([...stock,stock[0]]),/duplicate/);
});
test('only Field management can confirm stock; no inventory is invented',async()=>{
 const f=setup(),view=await handle({...f,user:captain,body:{action:'hireView',clubId:'club'}});assert.deepEqual(view.config.stock,[]);assert.equal(view.seasonId,'season');
 await assert.rejects(()=>handle({...f,user:captain,body:{action:'saveHireStock',clubId:'club',stock,collectionAddress:'Field desk',expectedRevision:0}}),/management/);
 await assert.rejects(()=>handle({...f,user:manager,body:{action:'hireView',venueId:'f',environment:'practice'}}),/Official/);
});
test('hire reserves only needed numbers, creates a Yoco bill, keeps owned 22 and releases after confirmed return',async t=>{
 const f=setup();await handle({...f,user:manager,body:{action:'saveHireStock',venueId:'f',stock,collectionAddress:'Field desk',expectedRevision:0}});
 const players=[{sourcePlayerId:'owner',fullName:'Own Bib',jerseyNumber:22,bibColor:'Blue',ownsNumberedBib:true},...[1,2,3,4,5].map(n=>({sourcePlayerId:`p${n}`,fullName:`Player ${n}`,jerseyNumber:n,bibColor:'Blue',matchBib:{source:'hired',number:n,color:'Blue'}}))];
 t.mock.method(require('../functions/fieldMatchDaySquad'),'loadDay',async()=>({submission:{ready:true,players}}));
 const {order}=await handle({...f,user:captain,body:hire});assert.equal(order.totalMinor,2500);assert.equal(order.paymentMethod,'yoco');assert.equal(order.hirePlayers.length,5);assert.equal(order.bulkAllocations,undefined);assert.equal(order.hirePlayers.some(p=>p.name==='Own Bib'),false);
 assert.deepEqual((await handle({...f,user:captain,body:hire})).order,order);
 await assert.rejects(()=>handle({...f,user:captain,body:{...hire,requestId:'second'}}),/already/);
 assert.equal(f.records.get('clubs/club/members/cap').ownsNumberedBib,undefined);
 await assert.rejects(()=>handle({...f,user:manager,body:{action:'returnHire',venueId:'f',orderId:order.id}}),/paid/);
 f.records.set(`kitShopOrders/${order.id}`,{...order,paymentStatus:'confirmed',status:'processing'});
 await handle({...f,user:manager,body:{action:'returnHire',venueId:'f',orderId:order.id}});
 assert.equal(f.records.get(`kitShopOrders/${order.id}`).hireStatus,'returned');assert.ok(Object.values(f.records.get('leagueVenues/f/bibHireDays/season__day').used).every(n=>n===0));
});
test('insufficient physical stock rejects hire without creating an order or taking payment',async t=>{
 const f=setup();await handle({...f,user:manager,body:{action:'saveHireStock',venueId:'f',stock:[stock[0]],collectionAddress:'Field desk',expectedRevision:0}});
 t.mock.method(require('../functions/fieldMatchDaySquad'),'loadDay',async()=>({submission:{ready:true,players:[{sourcePlayerId:'p1',fullName:'One'},{sourcePlayerId:'p2',fullName:'Two'}]}}));
 await assert.rejects(()=>handle({...f,user:captain,body:hire}),/unavailable/);assert.equal([...f.records.keys()].some(p=>p.startsWith('kitShopOrders/')),false);
});
test('cancelling an unpaid hire releases its stock, but pending Yoco checkout does not',async t=>{
 const f=setup();await handle({...f,user:manager,body:{action:'saveHireStock',venueId:'f',stock,collectionAddress:'Field desk',expectedRevision:0}});
 t.mock.method(require('../functions/fieldMatchDaySquad'),'loadDay',async()=>({submission:{ready:true,players:[{sourcePlayerId:'p',fullName:'One'}]}}));
 const {order}=await handle({...f,user:captain,body:hire});
 f.records.set(`kitShopOrders/${order.id}`,{...order,paymentStatus:'pending',yoco:{checkoutId:'checkout'}});
 const update=()=>require('../functions/kitShop.cjs').handle({...f,user:captain,body:{action:'updateOrder',orderId:order.id,expectedRevision:1,decision:'cancel'}});
 await assert.rejects(update,/awaiting confirmation/);assert.equal(f.records.get('leagueVenues/f/bibHireDays/season__day').used.blue_1,1);
 f.records.set(`kitShopOrders/${order.id}`,order);await update();assert.equal(f.records.get('leagueVenues/f/bibHireDays/season__day').used.blue_1,0);
});
test('multiple fixtures reserve each required colour and charge only rented player appearances',async t=>{
 const f=setup(),venue=f.records.get('leagueVenues/f');venue.league.activeSeason.fixtures.push({id:'game-two',matchDayId:'day',status:'scheduled',clubAId:'other',clubBId:'club'});f.records.set('clubs/club',{name:'Club',homeColor:'Blue',awayColor:'Red',ownerUid:'cap'});f.records.set('clubs/other',{homeColor:'Blue',awayColor:'Orange'});
 await handle({...f,user:manager,body:{action:'saveHireStock',venueId:'f',stock:[...stock,...stock.map(r=>({...r,color:'Red'}))],collectionAddress:'Field desk',expectedRevision:0}});
 t.mock.method(require('../functions/fieldMatchDaySquad'),'loadDay',async()=>({submission:{ready:true,players:[{sourcePlayerId:'owner',fullName:'Own Red',ownsNumberedBib:true,jerseyNumber:1,bibColor:'Blue',personalBib:{number:22,color:'Red'},matchBib:{source:'hired',number:1,color:'Blue'}},{sourcePlayerId:'p',fullName:'Other',jerseyNumber:2,bibColor:'Blue',matchBib:{source:'hired',number:2,color:'Blue'}}]}}));
 const {order}=await handle({...f,user:captain,body:hire});assert.equal(order.totalMinor,1500);assert.equal(order.fixtureCount,2);assert.equal(order.hirePlayers.filter(p=>p.fixtureId==='game').length,2);assert.equal(order.hirePlayers.filter(p=>p.fixtureId==='game-two').length,1);assert.equal(Object.hasOwn(order.hireNeeds,'red_22'),false);
});

test('stock-only staff view skips reservation reads; hires are loaded explicitly',async()=>{
 const f=setup();f.records.set('leagueVenues/f/bibHireDays/day',{orders:{order:true}});f.records.set('kitShopOrders/order',{orderType:'bib_hire',status:'processing',hireStatus:'reserved'});
 const collection=f.db.collection;let reservationQueries=0;f.db.collection=name=>{if(name.endsWith('/bibHireDays'))reservationQueries++;return collection(name);};
 const fast=await handle({...f,user:manager,body:{action:'hireView',venueId:'f',stockOnly:true}});
 assert.equal(reservationQueries,0);assert.deepEqual(fast.orders,[]);
 const full=await handle({...f,user:manager,body:{action:'hireView',venueId:'f'}});
 assert.equal(reservationQueries,1);assert.equal(full.orders.length,1);
});
test('stock-only inventory is readable by approved referees but stock changes remain manager-only',async()=>{
 const f=setup();f.records.set('leagueVenues/f/staff/ref',{uid:'ref',status:'active',role:'referee'});const user={uid:'ref',email_verified:true};const view=await handle({...f,user,body:{action:'hireView',venueId:'f',stockOnly:true}});assert.equal(view.manager,false);assert.deepEqual(view.config.stock,[]);await assert.rejects(()=>handle({...f,user,body:{action:'saveHireStock',venueId:'f',stock,expectedRevision:0,inventoryOnly:true}}),/management/);
});
test('inventory-only save does not invent a rental collection point',async()=>{
 const f=setup();await handle({...f,user:manager,body:{action:'saveHireStock',venueId:'f',stock,collectionAddress:'',inventoryOnly:true,expectedRevision:0}});const config=f.records.get('leagueVenues/f/bibHireConfig/stock');assert.equal(config.stock.length,6);assert.equal(config.collectionAddress,'');await assert.rejects(()=>handle({...f,user:captain,body:hire}),/physical stock/);
});
test('ordinary active Club players can read inventory without receiving stock or booking powers',async()=>{
 const f=setup();f.records.set('clubs/club/members/player',{uid:'player',status:'active',role:'player'});const user={uid:'player',email_verified:true};const view=await handle({...f,user,body:{action:'hireView',clubId:'club',venueId:'f',stockOnly:true}});assert.equal(view.manager,false);assert.equal(view.captain,false);await assert.rejects(()=>handle({...f,user,body:{action:'saveHireStock',clubId:'club',venueId:'f',stock,inventoryOnly:true,expectedRevision:0}}),/management/);
});
