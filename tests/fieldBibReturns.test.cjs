const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');const {handle}=require('../functions/fieldBibHire.cjs');
const manager={uid:'manager',email_verified:true},captain={uid:'cap',email_verified:true};const id='b'.repeat(64);
function setup(){return fixture({'leagueVenues/f':{ownerUid:'manager'},'clubs/club':{name:'Club'},'clubFieldMemberships/club':{status:'active',venueId:'f'},'clubs/club/members/cap':{uid:'cap',status:'active',role:'captain'},'clubs/club/members/player':{uid:'player',status:'active',role:'player'},'leagueVenues/f/bibHireConfig/stock':{stock:[{color:'Blue',number:1,quantity:1}],revision:1,confirmedAtMs:1},[`leagueVenues/f/bibLoans/${id}`]:{venueId:'f',clubId:'club',clubName:'Club',matchDayId:'day',hireStatus:'handed_out',hirePlayers:[{playerId:'p',name:'Player One',color:'Blue',number:1}],revision:1}});}
const op=(f,user,action,body={})=>handle({...f,user,body:{action,venueId:'f',...body}});
const count=(f,states=[{index:0,state:'returned'}])=>op(f,manager,'reviewBibReturn',{orderId:id,recordType:'handout',expectedRevision:1,states});
test('staff count and captain signature are independent; stale or self confirmation is rejected',async()=>{
 const f=setup();await count(f);
 await assert.rejects(()=>op(f,captain,'confirmBibReturn',{clubId:'club',orderId:id,recordType:'handout',expectedRevision:1}),/changed/);
 f.records.set('clubs/club/members/manager',{uid:'manager',status:'active',role:'captain'});
 await assert.rejects(()=>op(f,manager,'confirmBibReturn',{clubId:'club',orderId:id,recordType:'handout',expectedRevision:2}),/different person/);
 await op(f,captain,'confirmBibReturn',{clubId:'club',orderId:id,recordType:'handout',expectedRevision:2});
 const record=f.records.get(`leagueVenues/f/bibLoans/${id}`);assert.equal(record.returnReview.status,'confirmed');assert.equal(record.returnReview.respondedBy,'cap');assert.equal(record.returnReview.proposedBy,'manager');
 assert.equal((await op(f,manager,'bibReturnsView')).records.length,0);
});
test('captain sees only their club and ordinary players cannot read private custody',async()=>{
 const f=setup();f.records.set(`leagueVenues/f/bibLoans/${'c'.repeat(64)}`,{...f.records.get(`leagueVenues/f/bibLoans/${id}`),clubId:'other'});
 const view=await op(f,captain,'bibReturnsView',{clubId:'club'});assert.equal(view.records.length,1);assert.equal(view.ledger,null);
 await assert.rejects(()=>op(f,{uid:'player',email_verified:true},'bibReturnsView',{clubId:'club'}),/captain/);
});
test('carry-over requires manager policy and a return date; held bib stays unavailable to others',async()=>{
 const f=setup(),states=[{index:0,state:'kept',until:new Date(Date.now()+7*86400000).toISOString().slice(0,10)}];
 await assert.rejects(()=>count(f,states),/requires bibs/);
 await op(f,manager,'saveBibReturnPolicy',{policy:'carry_allowed',expectedRevision:1});await count(f,states);
 const view=await op(f,manager,'bibReturnsView');assert.equal(view.ledger.kept,1);assert.equal(view.ledger.available,0);
 const {playerCarryPins}=await import('../functions/fieldBibCustody.mjs');const {stockFixtureBibs}=await import('../functions/confirmedFieldBibs.mjs');
 const pins=playerCarryPins([{...f.records.get(`leagueVenues/f/bibLoans/${id}`),id}],'club','next-day');
 const assigned=stockFixtureBibs([{sourcePlayerId:'p',fullName:'Player One'},{sourcePlayerId:'other',fullName:'Other'}],'Blue',view.ledger.availableStock,pins);
 assert.equal(assigned.find(player=>player.sourcePlayerId==='p').matchBib.carryLoanId,id);assert.equal(assigned.find(player=>player.sourcePlayerId==='other').matchBib.available,false);
});
test('missing-bib reimbursement needs agreed count and captain acknowledgement; payment never adds stock',async()=>{
 const f=setup();await count(f,[{index:0,state:'missing'}]);
 await assert.rejects(()=>op(f,manager,'recordBibReimbursement',{orderId:id,recordType:'handout',expectedRevision:2,playerIndex:0,amountMinor:10000,reference:'Cash'}),/Agree/);
 await op(f,captain,'confirmBibReturn',{clubId:'club',orderId:id,recordType:'handout',expectedRevision:2});
 await op(f,manager,'recordBibReimbursement',{orderId:id,recordType:'handout',expectedRevision:3,playerIndex:0,amountMinor:10000,reference:'Cash'});
 assert.equal(f.records.get('leagueVenues/f/bibHireConfig/stock').stock[0].quantity,1);
 assert.equal((await op(f,manager,'bibReturnsView')).ledger.available,0);
 await op(f,captain,'ackBibReimbursement',{clubId:'club',orderId:id,recordType:'handout',expectedRevision:4,playerIndex:0});
 const record=f.records.get(`leagueVenues/f/bibLoans/${id}`);assert.equal(record.reimbursements['0'].status,'acknowledged');assert.equal(record.bibStates['0'].state,'lost_settled');assert.equal(f.records.get('leagueVenues/f/bibHireConfig/stock').stock[0].quantity,0);
 await op(f,manager,'saveHireStock',{stock:[{color:'Blue',number:1,quantity:1}],inventoryOnly:true,expectedRevision:3});
 assert.equal((await op(f,manager,'bibReturnsView')).ledger.available,1);
});
test('a disputed count can be corrected with a reason; confirmed receipts retain count history',async()=>{
 const f=setup();await count(f);await op(f,captain,'disputeBibReturn',{clubId:'club',orderId:id,recordType:'handout',expectedRevision:2,reason:'Number one is still missing'});
 await op(f,manager,'reviewBibReturn',{orderId:id,recordType:'handout',expectedRevision:3,reason:'Corrected after captain check',states:[{index:0,state:'missing'}]});
 const record=f.records.get(`leagueVenues/f/bibLoans/${id}`);assert.equal(record.bibStates['0'].state,'missing');assert.equal(record.returnHistory[0].status,'disputed');
});
test('paid hire stays visible for captain signature after its reservation is released',async()=>{
 const f=setup(),order={...f.records.get(`leagueVenues/f/bibLoans/${id}`),orderType:'bib_hire',paymentStatus:'confirmed',ownerUid:'cap',reservationId:'day',hireNeeds:{blue_1:1}};
 f.records.delete(`leagueVenues/f/bibLoans/${id}`);f.records.set(`kitShopOrders/${id}`,order);f.records.set('leagueVenues/f/bibHireDays/day',{used:{blue_1:1},orders:{[id]:true}});
 await op(f,manager,'reviewBibReturn',{orderId:id,recordType:'hire',expectedRevision:1,states:[{index:0,state:'returned'}]});
 const view=await op(f,captain,'bibReturnsView',{clubId:'club'});assert.equal(view.records.length,1);assert.equal(view.records[0].returnReview.status,'pending');assert.equal(view.records[0].recordType,'hire');
});

test('fresh handout is pinned to its wearer for the same matchday but not another player or week',async()=>{
 const {playerCarryPins,bibCustodySnapshot}=await import('../functions/fieldBibCustody.mjs');
 const loans=[{id,clubId:'club',matchDayId:'day',hirePlayers:[{playerId:'p',name:'Player',color:'Blue',number:1}]}];
 assert.equal(playerCarryPins(loans,'club','day').length,1);assert.equal(playerCarryPins(loans,'club','next-week').length,0);assert.equal(playerCarryPins(loans,'other','day').length,0);
 assert.equal(bibCustodySnapshot([{color:'Blue',number:1,quantity:1}],loans).availableStock[0].quantity,0);
});
test('roster checks share one loan read only within the same transaction',async()=>{
 const {readBibCustody}=await import('../functions/fieldBibCustody.mjs');let reads=0;
 const db={collection:path=>path},tx={get:async()=>{reads++;return {docs:[]};}};
 await Promise.all([readBibCustody(db,tx,'f'),readBibCustody(db,tx,'f')]);assert.equal(reads,1);
 await readBibCustody(db,{...tx},'f');assert.equal(reads,2);
});
