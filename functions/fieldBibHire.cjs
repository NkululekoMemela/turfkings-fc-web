const {createHash}=require('node:crypto');
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const clean=(x,n=200)=>String(x||'').trim().slice(0,n);
const key=(color,number)=>`${color.toLowerCase()}_${number}`;
function inventory(rows=[]){
 if(!Array.isArray(rows)||rows.length>2000)throw Error('Check the Field inventory.');
 const seen=new Set();return rows.map(row=>{
  const color=clean(row.color,40).toLowerCase(),number=Number(row.number),quantity=Number(row.quantity);
  if(!(/(^#[a-f0-9]{6}$)|(^[a-z][a-z ]{0,30}$)/.test(color))||!Number.isInteger(number)||number<1||number>999||!Number.isInteger(quantity)||quantity<0||quantity>100)throw Error('Use a colour, number 1–999 and actual stock quantity.');
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
 const [venueSnap,staffSnap]=await tx.getAll(db.doc(`leagueVenues/${venueId}`),db.doc(`leagueVenues/${venueId}/staff/${user.uid}`));
 const venue=venueSnap.data(),staff=staffSnap.data();
 if(!venue||venue.deleted)throw Error('Field unavailable.');
 const manager=venue.ownerUid===user.uid||staff?.status==='active'&&(staff.isAdministrator===true||['field_manager','assistant_manager'].includes(staff.role));
 if(!club&&!manager&&!(body.action==='hireView'&&body.stockOnly===true&&staff?.status==='active'))throw Error('Field management access is required.');
 return {venueId,venue,manager,club};
}
async function handle({db,user,body}){
 if(!user?.uid||!user.email_verified||user.cameraSession||body.isPracticeMode||body.environment==='practice')throw Error('Use your verified Official account for bib hire.');
 return db.runTransaction(async tx=>{
  const {kitColourKey}=await import('./opponentKitColours.mjs');
  const stockKey=(c,n)=>key(kitColourKey(c),n);
  const prefetchedStock=body.action==='hireView'&&body.stockOnly===true&&safe(body.venueId)?tx.get(db.doc(`leagueVenues/${body.venueId}/bibHireConfig/stock`)):null;
  const ctx=await access({db,tx,user,body}),base=`leagueVenues/${ctx.venueId}`;
  const configRef=db.doc(`${base}/bibHireConfig/stock`),config=(await (prefetchedStock||tx.get(configRef))).data()||{revision:0,stock:[],collectionAddress:''};
  if(require('./fieldBibReturns.cjs').actions.has(body.action))return require('./fieldBibReturns.cjs').operate({db,tx,user,body,ctx,base,config,configRef});
  const season=ctx.venue.league?.activeSeason;
  if(body.action==='hireView'){
   const days=(season?.matchDays||[]).filter(d=>d.status==='scheduled'&&(season.fixtures||[]).some(f=>f.matchDayId===d.id&&f.status==='scheduled'&&(!body.clubId||[f.clubAId,f.clubBId].includes(body.clubId))));
   const reservations=ctx.manager&&body.stockOnly!==true?await tx.get(db.collection(`${base}/bibHireDays`)):null;
   const ids=[...new Set((reservations?.docs||[]).flatMap(d=>Object.keys(d.data().orders||{})))];
   const orders=ids.length?await tx.getAll(...ids.map(id=>db.doc(`kitShopOrders/${id}`))):[];
   const loans=ctx.manager&&body.stockOnly!==true?await tx.get(db.collection(`${base}/bibLoans`)):null;
   return {venueId:ctx.venueId,fieldName:ctx.venue.name||'Field',manager:ctx.manager,captain:ctx.club?.captain||false,config,seasonId:season?.id||'',days:days.map(d=>({id:d.id,dateLocal:d.dateLocal})),orders:[...orders.map((s,i)=>({...s.data(),id:ids[i]})).filter(o=>o.orderType==='bib_hire'&&o.status!=='cancelled'&&o.hireStatus!=='returned'),...(loans?.docs||[]).map(doc=>({...doc.data(),id:doc.id,recordType:'handout'})).filter(loan=>loan.hireStatus!=='returned')]};
  }
  if(body.action==='saveHireStock'){
   if(!ctx.manager)throw Error('Only Field management can confirm stock.');
   if(body.expectedRevision!==config.revision)throw Error('Stock changed. Refresh before saving.');
   const stock=inventory(Array.isArray(body.stock)?body.stock.map(r=>({...r,color:kitColourKey(r.color)})):body.stock),address=clean(body.collectionAddress,500);if(!address&&body.inventoryOnly!==true)throw Error('Add the Field collection point.');
   const days=await tx.get(db.collection(`${base}/bibHireDays`));
   const capacities=Object.fromEntries(stock.map(r=>[stockKey(r.color,r.number),r.quantity]));
   for(const day of days.docs)for(const [id,used]of Object.entries(day.data().used||{}))if((capacities[id]||0)<used)throw Error('This stock is reserved. Resolve the hire before reducing it.');
   tx.set(configRef,{...config,stock,collectionAddress:address,revision:config.revision+1,confirmedBy:user.uid,confirmedAtMs:Date.now()});return {ok:true};
  }
  if(body.action==='placeHire'){
   if(ctx.club?.club?.clubType==='company')throw Error('Company hire is billed through the company account. Do not pay personally.');
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
    const colours=fixtureColours(byId[fixture.clubAId],byId[fixture.clubBId],config.confirmedAtMs?config.stock||[]:[]);
    const color=fixture.clubAId===body.clubId?colours.home:colours.away;
    // Recompute each fixture: an owned bib is usable only in that fixture's team colour.
    const actual=automaticFixtureBibs(players,color,config.confirmedAtMs?config.stock||[]:[]).filter(p=>p.matchBib?.source==='hired');
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
   const now=Date.now(),order={orderType:'bib_hire',venueId:ctx.venueId,clubId:body.clubId,seasonId:season.id,matchDayId:day.id,reservationId,hireStatus:'reserved',hireNeeds:needs,hirePlayers:rentalPlayers.map(p=>({playerId:p.sourcePlayerId||p.id||'',name:p.fullName||p.name||'Player',fixtureId:p.fixtureId,fixtureTime:fixtures.find(f=>f.id===p.fixtureId)?.scheduledLocal||'',number:p.matchBib.number,color:p.matchBib.color})),fixtureCount:fixtures.length,ownerUid:user.uid,email:user.email,customer,items:[{productId:'field-bib-hire',title:`${ctx.venue.name||'Field'} bib hire · ${day.dateLocal}`,size:`R5 per bib per match · return after play`,quantity:rentalPlayers.length,color:rentalPlayers[0].matchBib.color,unitPriceMinor:500,lineTotalMinor:totalMinor,madeToOrder:true}],fulfilment:{method:'collection',collectionAddress:config.collectionAddress},currency:'ZAR',subtotalMinor:totalMinor,deliveryMinor:0,totalMinor,paymentInstructions:'Collect at the Field before kickoff. Return all numbered bibs after play.',paymentMethod:'yoco',paymentStatus:'unpaid',status:'awaiting_payment',createdAtMs:now,updatedAtMs:now,revision:1,timeline:[{status:'awaiting_payment',atMs:now,note:'Field bibs reserved. Payment goes to FANM through Yoco.'}],cancellationRequested:false};
   const used={...reservation.used};for(const [id,n]of Object.entries(needs))used[id]=(used[id]||0)+n;
   tx.set(reservationRef,{...reservation,used,orders:{...reservation.orders,[orderId]:true},matchDayId:day.id,seasonId:season.id});tx.set(orderRef,order);tx.set(db.doc(`kitShopCustomers/${user.uid}/orders/${orderId}`),order);return {order:{...order,id:orderId}};
  }
  if(body.action==='recordBibHandout'){
   if(!ctx.manager)throw Error('Only Field management can record handouts.');
   if(!safe(body.borrowerClubId)||!safe(body.matchDayId)||season?.id!==body.seasonId||!(season.fixtures||[]).some(fixture=>fixture.matchDayId===body.matchDayId&&[fixture.clubAId,fixture.clubBId].includes(body.borrowerClubId)))throw Error('Choose a Club in this season.');
   const day=(season.matchDays||[]).find(day=>day.id===body.matchDayId&&day.status==='scheduled');
   if(!day||!config.confirmedAtMs)throw Error('Choose a published matchday with confirmed stock.');
   const loanId=createHash('sha256').update(`${season.id}:${day.id}:${body.borrowerClubId}`).digest('hex');
   const loanRef=db.doc(`${base}/bibLoans/${loanId}`),existing=(await tx.get(loanRef)).data();
   if(existing)return {ok:true,id:loanId};
   const booked=(await tx.get(db.doc(`${base}/bibHireDays/${season.id}__${day.id}`))).data();
   const bookedIds=Object.keys(booked?.orders||{}),bookedOrders=bookedIds.length?await tx.getAll(...bookedIds.map(id=>db.doc(`kitShopOrders/${id}`))):[];
   if(bookedOrders.some(doc=>doc.data()?.clubId===body.borrowerClubId&&doc.data()?.status!=='cancelled'))throw Error('This club already has a hire reservation. Use its recorded hire in Returns.');
   const clubProfile=(await tx.get(db.doc(`clubs/${body.borrowerClubId}`))).data()||{};
   const roster=await require('./fieldMatchDaySquad').loadDay({db,tx,scope:{venueId:ctx.venueId,seasonId:season.id,clubId:body.borrowerClubId},matchDayId:day.id});
   const players=(roster.submission?.players||[]).filter(player=>player.matchBib?.source==='hired'&&!player.matchBib.carryLoanId);
   if(!players.length)throw Error('No Field bibs assigned to these players.');
   const outstanding=await tx.get(db.collection(`${base}/bibLoans`));
   const used={};
   const {custodyItems}=await import('./fieldBibCustody.mjs');
   for(const doc of outstanding.docs)for(const player of custodyItems(doc.data()))if(!['returned','lost_settled'].includes(player.state)){const k=stockKey(player.color,player.number);used[k]=(used[k]||0)+1;}
   const hirePlayers=players.map(player=>{const bib=player.matchBib,k=stockKey(bib.color,bib.number),row=(config.stock||[]).find(row=>stockKey(row.color,row.number)===k);used[k]=(used[k]||0)+1;if(!row||used[k]>row.quantity)throw Error('A bib is still out or unavailable. Check Returns before issuing it.');return {playerId:player.sourcePlayerId||player.id||'',name:player.fullName||player.name||'Player',color:bib.color,number:bib.number};});
   const contact={name:clean(body.contact?.name,100),phone:clean(body.contact?.phone,40)};
   if(contact.phone&&!/^\+?[\d ()-]{7,40}$/.test(contact.phone))throw Error('Check the contact phone number.');
   tx.set(loanRef,{venueId:ctx.venueId,seasonId:season.id,clubId:body.borrowerClubId,clubName:clubProfile.name||clubProfile.clubName||'',matchDayId:day.id,dateLocal:day.dateLocal,hireStatus:'handed_out',hirePlayers,customer:contact,returnedPlayers:{},createdAtMs:Date.now(),issuedBy:user.uid,revision:1});tx.set(configRef,{...config,revision:(config.revision||0)+1});return {ok:true,id:loanId};
  }
  if(body.action==='recordBibReturn'){
   if(!ctx.manager||!body.orderId?.match(/^[a-f0-9]{64}$/))throw Error('Field management access is required.');
   const handout=body.recordType==='handout',ref=db.doc(handout?`${base}/bibLoans/${body.orderId}`:`kitShopOrders/${body.orderId}`),order=(await tx.get(ref)).data();
   if(!order||order.venueId!==ctx.venueId||(!handout&&(order.orderType!=='bib_hire'||order.paymentStatus!=='confirmed')))throw Error('Choose a recorded handout or paid hire.');
   const index=body.playerIndex;
   if(!Number.isInteger(index)||index<0||index>=(order.hirePlayers||[]).length)throw Error('Choose the assigned player.');
   const returnedPlayers={...(order.returnedPlayers||{})};
   if(returnedPlayers[String(index)])return {ok:true};
   returnedPlayers[String(index)]={atMs:Date.now(),byUid:user.uid};
   const complete=order.hirePlayers.every((_,i)=>returnedPlayers[String(i)]);
   if(complete&&!handout)await release({db,tx,order,orderId:body.orderId});
   const updated={...order,returnedPlayers,hireStatus:complete?'returned':handout?'handed_out':'part_returned',revision:(order.revision||0)+1,updatedAtMs:Date.now()};
   updated.bibStates=Object.fromEntries(order.hirePlayers.map((_,i)=>[String(i),{state:returnedPlayers[String(i)]?'returned':order.bibStates?.[String(i)]?.state||'out'}]));
   updated.returnReview={status:'pending',version:updated.revision,proposedBy:user.uid,proposedAtMs:Date.now()};
   tx.set(ref,updated);
   tx.set(configRef,{...config,revision:(config.revision||0)+1});
   if(!handout){tx.set(db.doc(`kitShopCustomers/${order.ownerUid}/orders/${body.orderId}`),updated);tx.set(db.doc(`${base}/bibLoans/${body.orderId}`),{...updated,ledgerOnly:true,recordType:'hire'});}
   return {ok:true};
  }
  if(body.action==='returnHire'){
   if(!ctx.manager||!body.orderId?.match(/^[a-f0-9]{64}$/))throw Error('Field management access is required.');
   const ref=db.doc(`kitShopOrders/${body.orderId}`),order=(await tx.get(ref)).data();if(!order||order.orderType!=='bib_hire'||order.venueId!==ctx.venueId||order.paymentStatus!=='confirmed')throw Error('Only a paid hire can be returned here.');
   if(order.hireStatus==='returned')return {ok:true};
   await release({db,tx,order,orderId:body.orderId});const updated={...order,hireStatus:'returned',status:'collected',revision:order.revision+1,updatedAtMs:Date.now(),timeline:[...order.timeline,{status:'collected',atMs:Date.now(),note:'Field confirmed all hired bibs returned.'}]};updated.bibStates=Object.fromEntries((order.hirePlayers||[]).map((_,index)=>[index,{state:'returned'}]));updated.returnReview={status:'pending',version:updated.revision,proposedBy:user.uid,proposedAtMs:Date.now()};tx.set(ref,updated);tx.set(db.doc(`kitShopCustomers/${order.ownerUid}/orders/${body.orderId}`),updated);tx.set(db.doc(`${base}/bibLoans/${body.orderId}`),{...updated,ledgerOnly:true,recordType:'hire'});tx.set(configRef,{...config,revision:(config.revision||0)+1});return {ok:true};
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
