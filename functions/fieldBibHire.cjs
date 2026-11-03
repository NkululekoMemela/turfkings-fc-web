const {createHash}=require('node:crypto');
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const clean=(x,n=200)=>String(x||'').trim().slice(0,n);
const key=(color,number)=>`${color.toLowerCase()}_${number}`;
function inventory(rows=[]){
 if(!Array.isArray(rows)||rows.length>120)throw Error('Check the Field inventory.');
 const seen=new Set();return rows.map(row=>{
  const color=clean(row.color,7).toLowerCase(),number=Number(row.number),quantity=Number(row.quantity);
  if(!(/(^#[a-f0-9]{6}$)|(^[a-z][a-z ]{0,30}$)/.test(color))||!Number.isInteger(number)||number<1||number>6||!Number.isInteger(quantity)||quantity<0||quantity>100)throw Error('Use a colour, number 1–6 and actual stock quantity.');
  const id=key(color,number);if(seen.has(id))throw Error('Combine duplicate stock rows.');seen.add(id);return {color,number,quantity};
 });
}
async function access({db,tx,user,body}){
 let venueId=body.venueId,club=null;
 if(body.clubId){
  club=await require('./kitBulk.cjs').context(db,user,body.clubId,tx);
  const membership=(await tx.get(db.doc(`clubFieldMemberships/${body.clubId}`))).data();
  if(membership?.status!=='active'||!safe(membership.venueId))throw Error('Your Club must be linked to a Field for hire.');
  if(venueId&&venueId!==membership.venueId)throw Error('Choose your Club’s Field.');venueId=membership.venueId;
 }
 if(!safe(venueId))throw Error('Choose a Field.');
 const venue=(await tx.get(db.doc(`leagueVenues/${venueId}`))).data();
 if(!venue||venue.deleted)throw Error('Field unavailable.');
 const staff=(await tx.get(db.doc(`leagueVenues/${venueId}/staff/${user.uid}`))).data();
 const manager=venue.ownerUid===user.uid||staff?.status==='active'&&(staff.isAdministrator===true||['field_manager','assistant_manager'].includes(staff.role));
 if(!club&&!manager)throw Error('Field management access is required.');
 return {venueId,venue,manager,club};
}
async function handle({db,user,body}){
 if(!user?.uid||!user.email_verified||user.cameraSession||body.isPracticeMode||body.environment==='practice')throw Error('Use your verified Official account for bib hire.');
 return db.runTransaction(async tx=>{
  const {kitColourKey}=await import('./opponentKitColours.mjs');
  const stockKey=(c,n)=>key(kitColourKey(c),n);
  const ctx=await access({db,tx,user,body}),base=`leagueVenues/${ctx.venueId}`;
  const configRef=db.doc(`${base}/bibHireConfig/stock`),config=(await tx.get(configRef)).data()||{revision:0,stock:[],collectionAddress:''};
  const season=ctx.venue.league?.activeSeason;
  if(body.action==='hireView'){
   const days=(season?.matchDays||[]).filter(d=>d.status==='scheduled'&&(season.fixtures||[]).some(f=>f.matchDayId===d.id&&f.status==='scheduled'&&(!body.clubId||[f.clubAId,f.clubBId].includes(body.clubId))));
   const reservations=ctx.manager?await tx.get(db.collection(`${base}/bibHireDays`)):null;
   const ids=[...new Set((reservations?.docs||[]).flatMap(d=>Object.keys(d.data().orders||{})))];
   const orders=ids.length?await tx.getAll(...ids.map(id=>db.doc(`kitShopOrders/${id}`))):[];
   return {venueId:ctx.venueId,fieldName:ctx.venue.name||'Field',manager:ctx.manager,captain:ctx.club?.captain||false,config,seasonId:season?.id||'',days:days.map(d=>({id:d.id,dateLocal:d.dateLocal})),orders:orders.map((s,i)=>({...s.data(),id:ids[i]})).filter(o=>o.orderType==='bib_hire'&&o.status!=='cancelled'&&o.hireStatus!=='returned')};
  }
  if(body.action==='saveHireStock'){
   if(!ctx.manager)throw Error('Only Field management can confirm stock.');
   if(body.expectedRevision!==config.revision)throw Error('Stock changed. Refresh before saving.');
   const stock=inventory(Array.isArray(body.stock)?body.stock.map(r=>({...r,color:kitColourKey(r.color)})):body.stock),address=clean(body.collectionAddress,500);if(!address)throw Error('Add the Field collection point.');
   const days=await tx.get(db.collection(`${base}/bibHireDays`));
   const capacities=Object.fromEntries(stock.map(r=>[stockKey(r.color,r.number),r.quantity]));
   for(const day of days.docs)for(const [id,used]of Object.entries(day.data().used||{}))if((capacities[id]||0)<used)throw Error('This stock is reserved. Resolve the hire before reducing it.');
   tx.set(configRef,{stock,collectionAddress:address,revision:config.revision+1,confirmedBy:user.uid,confirmedAtMs:Date.now()});return {ok:true};
  }
  if(body.action==='placeHire'){
   if(!ctx.club?.captain)throw Error('Your captain books the team’s hire.');
   if(!safe(body.requestId)||!safe(body.matchDayId)||season?.id!==body.seasonId)throw Error('Choose the upcoming match day.');
   const day=(season.matchDays||[]).find(d=>d.id===body.matchDayId&&d.status==='scheduled');if(!day)throw Error('Match day is unavailable.');
   const fixtures=(season.fixtures||[]).filter(f=>f.matchDayId===day.id&&f.status==='scheduled'&&[f.clubAId,f.clubBId].includes(body.clubId));if(!fixtures.length)throw Error('Your Club has no upcoming fixture that day.');
   const customer={name:clean(body.customer?.name,100),phone:clean(body.customer?.phone,40)};
   if(!customer.name||!/^\+?[\d ()-]{7,40}$/.test(customer.phone))throw Error('Add the captain’s name and phone.');
   const orderId=createHash('sha256').update(`hire:${user.uid}:${body.requestId}`).digest('hex'),orderRef=db.doc(`kitShopOrders/${orderId}`);
   const existing=(await tx.get(orderRef)).data();
   if(existing){if(existing.venueId!==ctx.venueId||existing.clubId!==body.clubId||existing.matchDayId!==day.id)throw Error('Reopen your existing hire bill.');return {order:{...existing,id:orderId}};}
   if(!config.collectionAddress||!config.stock?.some(r=>r.quantity>0))throw Error('This Field must confirm its physical stock before paid hire. Ask Field management to contact FANM if more bibs are needed.');
   const roster=await require('./fieldMatchDaySquad').loadDay({db,tx,scope:{venueId:ctx.venueId,seasonId:season.id,clubId:body.clubId},matchDayId:day.id});
   if(!roster.submission?.ready)throw Error('Your season squad needs attention before hire.');
   const players=(roster.submission.players||[]).map(p=>p.personalBib?{...p,jerseyNumber:p.personalBib.number,bibColor:p.personalBib.color,matchBib:undefined}:p.matchBib?.source==='hired'?{...p,ownsNumberedBib:false}:p);
   const {fixtureColours,automaticFixtureBibs}=await import('./automaticFixtureKit.mjs');
   const clubIds=[...new Set(fixtures.flatMap(f=>[f.clubAId,f.clubBId]))],clubs=await tx.getAll(...clubIds.map(id=>db.doc(`clubs/${id}`)));
   const byId=Object.fromEntries(clubIds.map((id,i)=>[id,clubs[i].data()||{}]));
   const rentalPlayers=[],needs={};
   for(const fixture of fixtures){
    const colours=fixtureColours(byId[fixture.clubAId],byId[fixture.clubBId]);
    const color=fixture.clubAId===body.clubId?colours.home:colours.away;
    // Recompute each fixture: an owned bib is usable only in that fixture's team colour.
    const actual=automaticFixtureBibs(players,color).filter(p=>p.matchBib?.source==='hired');
    const fixtureNeeds={};for(const p of actual){const id=stockKey(p.matchBib.color,p.matchBib.number);fixtureNeeds[id]=(fixtureNeeds[id]||0)+1;rentalPlayers.push({...p,fixtureId:fixture.id});}
    for(const [id,n]of Object.entries(fixtureNeeds))needs[id]=Math.max(needs[id]||0,n);
   }
   if(!rentalPlayers.length)throw Error('Your squad already has its own or Club bibs. No hire is needed.');
   const reservationId=`${season.id}__${day.id}`,reservationRef=db.doc(`${base}/bibHireDays/${reservationId}`),reservation=(await tx.get(reservationRef)).data()||{used:{},orders:{}};
   const bookedIds=Object.keys(reservation.orders||{}),booked=bookedIds.length?await tx.getAll(...bookedIds.map(id=>db.doc(`kitShopOrders/${id}`))):[];
   if(booked.some(s=>s.data()?.clubId===body.clubId&&s.data()?.status!=='cancelled'))throw Error('This Club already has a hire reservation for this match day. Reopen its bill.');
   const capacities=Object.fromEntries(config.stock.map(r=>[stockKey(r.color,r.number),r.quantity]));
   for(const [id,n]of Object.entries(needs))if((reservation.used[id]||0)+n>(capacities[id]||0))throw Error('Some assigned bibs are unavailable. Ask the Field to arrange additional FANM stock. No payment was taken.');
   const totalMinor=rentalPlayers.length*500;
   const now=Date.now(),order={orderType:'bib_hire',venueId:ctx.venueId,clubId:body.clubId,seasonId:season.id,matchDayId:day.id,reservationId,hireStatus:'reserved',hireNeeds:needs,hirePlayers:rentalPlayers.map(p=>({name:p.fullName||p.name||'Player',fixtureId:p.fixtureId,fixtureTime:fixtures.find(f=>f.id===p.fixtureId)?.scheduledLocal||'',number:p.matchBib.number,color:p.matchBib.color})),fixtureCount:fixtures.length,ownerUid:user.uid,email:user.email,customer,items:[{productId:'field-bib-hire',title:`${ctx.venue.name||'Field'} bib hire · ${day.dateLocal}`,size:`R5 per bib per match · return after play`,quantity:rentalPlayers.length,color:rentalPlayers[0].matchBib.color,unitPriceMinor:500,lineTotalMinor:totalMinor,madeToOrder:true}],fulfilment:{method:'collection',collectionAddress:config.collectionAddress},currency:'ZAR',subtotalMinor:totalMinor,deliveryMinor:0,totalMinor,paymentInstructions:'Collect at the Field before kickoff. Return all numbered bibs after play.',paymentMethod:'yoco',paymentStatus:'unpaid',status:'awaiting_payment',createdAtMs:now,updatedAtMs:now,revision:1,timeline:[{status:'awaiting_payment',atMs:now,note:'Field bibs reserved. Payment goes to FANM through Yoco.'}],cancellationRequested:false};
   const used={...reservation.used};for(const [id,n]of Object.entries(needs))used[id]=(used[id]||0)+n;
   tx.set(reservationRef,{...reservation,used,orders:{...reservation.orders,[orderId]:true},matchDayId:day.id,seasonId:season.id});tx.set(orderRef,order);tx.set(db.doc(`kitShopCustomers/${user.uid}/orders/${orderId}`),order);return {order:{...order,id:orderId}};
  }
  if(body.action==='returnHire'){
   if(!ctx.manager||!body.orderId?.match(/^[a-f0-9]{64}$/))throw Error('Field management access is required.');
   const ref=db.doc(`kitShopOrders/${body.orderId}`),order=(await tx.get(ref)).data();if(!order||order.orderType!=='bib_hire'||order.venueId!==ctx.venueId||order.paymentStatus!=='confirmed')throw Error('Only a paid hire can be returned here.');
   if(order.hireStatus==='returned')return {ok:true};
   await release({db,tx,order,orderId:body.orderId});const updated={...order,hireStatus:'returned',status:'collected',revision:order.revision+1,updatedAtMs:Date.now(),timeline:[...order.timeline,{status:'collected',atMs:Date.now(),note:'Field confirmed all hired bibs returned.'}]};tx.set(ref,updated);tx.set(db.doc(`kitShopCustomers/${order.ownerUid}/orders/${body.orderId}`),updated);return {ok:true};
  }
  throw Error('Unknown hire action.');
 });
}
// Read during the caller's transaction before any writes.
async function prepareRelease({db,tx,order,orderId}){
 const ref=db.doc(`leagueVenues/${order.venueId}/bibHireDays/${order.reservationId}`),row=(await tx.get(ref)).data();if(!row?.orders?.[orderId])return ()=>{};
 const used={...row.used},orders={...row.orders};for(const [id,n]of Object.entries(order.hireNeeds||{}))used[id]=Math.max(0,(used[id]||0)-n);delete orders[orderId];return ()=>tx.set(ref,{...row,used,orders});
}
async function release(args){const write=await prepareRelease(args);write();}
module.exports={handle,inventory,release,prepareRelease};
