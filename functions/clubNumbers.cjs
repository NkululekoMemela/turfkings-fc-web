const {FieldValue}=require("firebase-admin/firestore");
const privacy=require("./playerPrivacy.cjs");
const validId=value=>{if(typeof value!=="string"||!value||value.includes("/")||value.length>150)throw new Error("Invalid club or member.");return value;};
const number=value=>{if(value===null||value===undefined||String(value).trim()==="")return null;if(!/^\d{1,3}$/.test(String(value)))throw new Error("Use a number from 0 to 999.");return Number(value);};
const captain=(club,user)=>privacy.adminOf(club,user)||Boolean(user?.email_verified&&!user.cameraSession&&user.uid&&[club?.captainEmail,club?.captain?.email,...(club?.captainEmails||[])].filter(Boolean).some(email=>email.toLowerCase()===String(user.email||"").toLowerCase()));
const active=member=>member&&! ["withdrawn","deleted","rejected"].includes(member.status);
// The reservation document serializes concurrent claims. The member scan protects legacy allocations too.
async function readClaim(tx,db,clubId,memberId,next,previous){
 const refs=[...new Set([next,previous].filter(value=>value!==null))].map(value=>db.doc(`clubs/${clubId}/numberReservations/${value}`));
 const reservations=await tx.getAll(...refs);
 const members=await tx.get(db.collection(`clubs/${clubId}/members`));
 if(next!==null){
  const reserved=reservations.find(s=>s.id===String(next))?.data();
  if(reserved?.pendingMemberId&&reserved.pendingMemberId!==memberId)throw new Error("Another player requested this number first. Ask your captain about the pending request.");
  if(reserved?.memberId&&reserved.memberId!==memberId)throw new Error("This number already belongs to a teammate. Respect their first claim or speak to them about a voluntary transfer.");
  if(members.docs.some(item=>item.id!==memberId&&number(item.data().jerseyNumber)===next))throw new Error("This number already belongs to a teammate. Ask admin to resolve any existing duplicate.");
 }
 return {reservations,next,previous};
}
function writeClaim(tx,db,clubId,memberId,claim){
 if(claim.previous!==null&&claim.previous!==claim.next){const old=claim.reservations.find(s=>s.id===String(claim.previous))?.data();if(old?.memberId===memberId)tx.delete(db.doc(`clubs/${clubId}/numberReservations/${claim.previous}`));}
 if(claim.next!==null)tx.set(db.doc(`clubs/${clubId}/numberReservations/${claim.next}`),{memberId,number:claim.next,claimedAt:FieldValue.serverTimestamp()});
}
const currencies={ZA:"ZAR",US:"USD",GB:"GBP",UK:"GBP",KE:"KES",NG:"NGN",GH:"GHS",BW:"BWP",NA:"NAD",ZM:"ZMW",ZW:"USD",AU:"AUD",NZ:"NZD",CA:"CAD",IN:"INR",FR:"EUR",DE:"EUR",PT:"EUR",ES:"EUR",IT:"EUR",NL:"EUR"};
function currencyFor(club){const country=String(club.countryCode||club.country||"ZA").toUpperCase();const names={"SOUTH AFRICA":"ZA","UNITED STATES":"US","UNITED KINGDOM":"GB","KENYA":"KE","NIGERIA":"NG","GHANA":"GH"};const code=club.currency||currencies[names[country]||country];if(!/^[A-Z]{3}$/.test(code||""))throw new Error("Ask admin to configure the club's ISO currency code.");return code;}
let cachedRates=null;
async function rateQuote(currency){
 if(currency==="USD")return {currency,amount:10,rate:1,date:new Date().toISOString().slice(0,10),source:"USD face value"};
 if(!cachedRates||cachedRates.until<Date.now()){
  const response=await fetch("https://open.er-api.com/v6/latest/USD",{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error("A local currency quote is unavailable. No offer was sent.");
  const data=await response.json();if(data.result!=="success"||data.base_code!=="USD"||!(data.time_last_update_unix>0))throw new Error("A current exchange rate is unavailable.");
  cachedRates={data,until:Date.now()+3600000};
 }
 const data=cachedRates.data,rate=data.rates?.[currency],date=new Date(data.time_last_update_unix*1000).toISOString().slice(0,10);
 if(!(rate>0)||Date.now()-data.time_last_update_unix*1000>7*86400000)throw new Error("A current exchange rate is unavailable. Try again later.");
 const digits=new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits,factor=10**digits;
 return {currency,amount:Math.round(10*rate*factor)/factor,rate,date,source:"ExchangeRate-API"};
}
async function handle({db,user,body,quote=rateQuote}){
 if(!user?.uid||!user.email_verified||user.cameraSession)throw new Error("Sign in with your verified account.");
 const clubId=validId(body.clubId),clubRef=db.doc(`clubs/${clubId}`),club=(await clubRef.get()).data();
 if(!club)throw new Error("Club not found.");
 const isAdmin=captain(club,user),action=body.action;
 if(action==="settings"){
  if(!isAdmin)throw new Error("Captain or admin approval is required.");
  if(!/^#[0-9a-f]{6}$/i.test(body.homeColor||"")||!/^#[0-9a-f]{6}$/i.test(body.awayColor||"")||(body.currency!==undefined&&! /^[A-Z]{3}$/.test(body.currency)))throw new Error("Choose valid home and away club colours.");
  return db.runTransaction(async tx=>{const current=(await tx.get(clubRef)).data();if(!captain(current,user))throw new Error("Captain access changed.");tx.update(clubRef,{homeColor:body.homeColor,awayColor:body.awayColor,...(body.currency?{currency:body.currency}:{})});return {ok:true};});
 }
 if(action==="inbox"){
  const snap=await db.collection(`clubs/${clubId}/numberOffers`).get();
  const own=await privacy.ownMemberships(db,user,clubId),ids=new Set(own.map(item=>item.id));
  const offers=snap.docs.map(item=>({...item.data(),id:item.id})).filter(item=>isAdmin||ids.has(item.buyerId)||ids.has(item.holderId)).sort((a,b)=>a.createdAtMs-b.createdAtMs).slice(-100);
  return {offers:offers.map(item=>({...item,holderUid:ids.has(item.holderId)?user.uid:""})),isAdmin};
 }
 const memberId=validId(body.memberId),memberRef=db.doc(`clubs/${clubId}/members/${memberId}`);
 if(action==="availability"){
  const member=(await memberRef.get()).data();
  if(!privacy.owns(member,user)||!active(member))throw new Error("This player account is unavailable.");
  const desired=number(body.number);if(desired===null)throw new Error("Choose a number from 0 to 999.");
  const [members,reservation]=await Promise.all([db.collection(`clubs/${clubId}/members`).get(),db.doc(`clubs/${clubId}/numberReservations/${desired}`).get()]);
  const holders=members.docs.filter(item=>number(item.data().jerseyNumber)===desired),claim=reservation.data();
  if(holders.length>1)return {availability:{kind:"conflict",number:desired}};
  if(holders.length===1){const holder=holders[0];return {availability:{kind:holder.id===memberId?"own":"held",number:desired,holderId:holder.id,holderName:holder.data().fullName || holder.data().shortName || "Teammate"}};}
  if(claim?.memberId)return {availability:{kind:"conflict",number:desired}};
  if(claim?.pendingMemberId)return {availability:{kind:"pending",number:desired,mine:claim.pendingMemberId===memberId}};
  return {availability:{kind:"available",number:desired}};
 }
 if(action==="quote"){
  if(!privacy.owns((await memberRef.get()).data(),user))throw new Error("This profile does not belong to you.");
  const value=await quote(currencyFor(club)),quoteId=require("node:crypto").randomUUID();
  await db.runTransaction(async tx=>{tx.set(db.doc(`clubs/${clubId}/numberQuotes/${quoteId}`),{...value,memberId,uid:user.uid,expiresAtMs:Date.now()+15*60000});});
  return {quote:{...value,id:quoteId}};
 }
 return db.runTransaction(async tx=>{
  const currentClub=(await tx.get(clubRef)).data();const adminNow=captain(currentClub,user);
  if(action==="requestFree"){
   const buyer=(await tx.get(memberRef)).data();if(!privacy.owns(buyer,user)||!active(buyer))throw new Error("This player account is unavailable.");
   const desired=number(body.number);if(desired===null||desired===number(buyer.jerseyNumber))throw new Error("Choose an available number.");
   const claim=await readClaim(tx,db,clubId,memberId,desired,number(buyer.jerseyNumber));
   const offers=await tx.get(db.collection(`clubs/${clubId}/numberOffers`));
   if(offers.docs.some(item=>item.data().buyerId===memberId&&["pending","accepted"].includes(item.data().status)))throw new Error("You already have an active number request.");
   const offerId=require("node:crypto").randomUUID();
   tx.set(db.doc(`clubs/${clubId}/numberOffers/${offerId}`),{kind:"allocation",buyerId:memberId,buyerName:buyer.fullName || buyer.shortName || "Player",holderId:"",number:desired,previousBuyerNumber:number(buyer.jerseyNumber),status:"pending",createdAtMs:Date.now(),updatedAtMs:Date.now()});
   const reserved=claim.reservations.find(item=>item.id===String(desired))?.data()||{};
   tx.set(db.doc(`clubs/${clubId}/numberReservations/${desired}`),{...reserved,pendingMemberId:memberId,requestId:offerId});
   return {ok:true};
  }
  if(action==="decideFree"){
   if(!adminNow)throw new Error("Captain or admin approval is required.");
   const offerRef=db.doc(`clubs/${clubId}/numberOffers/${validId(body.offerId)}`),offer=(await tx.get(offerRef)).data();
   if(!offer||offer.kind!=="allocation"||offer.status!=="pending")throw new Error("This request is no longer pending.");
   if(!["approved","declined"].includes(body.decision))throw new Error("Choose approve or decline.");
   const reservationRef=db.doc(`clubs/${clubId}/numberReservations/${offer.number}`),reserved=(await tx.get(reservationRef)).data();
   if(reserved?.requestId!==body.offerId||reserved?.pendingMemberId!==offer.buyerId||reserved?.memberId)throw new Error("The number claim changed. Ask admin to resolve it.");
   if(body.decision==="declined"){tx.delete(reservationRef);tx.update(offerRef,{status:"declined",confirmedByUid:user.uid,updatedAtMs:Date.now()});return {ok:true};}
   const buyerRef=db.doc(`clubs/${clubId}/members/${offer.buyerId}`),buyer=(await tx.get(buyerRef)).data();
   if(!active(buyer)||number(buyer.jerseyNumber)!==offer.previousBuyerNumber)throw new Error("The player or their number changed. Decline this request and start again.");
   const claim=await readClaim(tx,db,clubId,offer.buyerId,offer.number,offer.previousBuyerNumber);
   const playerRef=buyer.playerId?db.doc(`clubs/${clubId}/players/${validId(buyer.playerId)}`):null,player=playerRef?(await tx.get(playerRef)).data():null;
   if(player&&player.sourceMemberId!==offer.buyerId)throw new Error("Ask admin to repair the player link first.");
   const patch={jerseyNumber:offer.number,updatedAt:FieldValue.serverTimestamp()};
   writeClaim(tx,db,clubId,offer.buyerId,claim);
   tx.update(buyerRef,patch);tx.set(db.doc(`clubs/${clubId}/publicMembers/${offer.buyerId}`),privacy.projection("members",{...buyer,...patch}));
   if(player){tx.update(playerRef,patch);tx.set(db.doc(`clubs/${clubId}/publicPlayers/${playerRef.id}`),privacy.projection("players",{...player,...patch}));}
   tx.update(offerRef,{status:"approved",confirmedByUid:user.uid,updatedAtMs:Date.now()});return {ok:true};
  }
  if(action==="offer"){
   if(body.discussed!==true)throw new Error("Speak to your teammate first and respect their right to decline.");
   const buyer=(await tx.get(memberRef)).data();if(!privacy.owns(buyer,user)||!active(buyer))throw new Error("This player account is unavailable.");
   const desired=number(body.number);if(desired===null||number(buyer.jerseyNumber)===desired)throw new Error("Choose a teammate's number.");
   const members=await tx.get(db.collection(`clubs/${clubId}/members`));const holders=members.docs.filter(item=>number(item.data().jerseyNumber)===desired);
   if(holders.length!==1)throw new Error("This number is unassigned or has a legacy conflict. Ask admin to resolve it.");
   const holder=holders[0];if(body.holderId&&body.holderId!==holder.id)throw new Error("The number holder changed. Check the number again.");if(!active(holder.data()))throw new Error("Ask admin to resolve this former player’s number.");const offerId=`${memberId}__${holder.id}__${desired}`;
   const offerRef=db.doc(`clubs/${clubId}/numberOffers/${offerId}`),old=(await tx.get(offerRef)).data();
   if(old&&! ["reopened","expired"].includes(old.status))throw new Error(old.status==="declined"?"Your teammate declined. Respect their decision; only they can reopen this discussion.":"An offer already exists. Check its status.");
   const q=(await tx.get(db.doc(`clubs/${clubId}/numberQuotes/${validId(body.quoteId)}`))).data();
   if(!q||q.uid!==user.uid||q.memberId!==memberId||q.expiresAtMs<Date.now()||q.currency!==currencyFor(currentClub))throw new Error("Get a fresh exchange-rate quote before submitting.");
   const pending=await tx.get(db.collection(`clubs/${clubId}/numberOffers`));
   if(pending.docs.some(item=>["pending","accepted"].includes(item.data().status)&&[item.data().buyerId,item.data().holderId].some(id=>id===memberId||id===holder.id)))throw new Error("One of these players already has an active number offer.");
   const result={buyerId:memberId,holderId:holder.id,buyerName:buyer.fullName,holderName:holder.data().fullName,number:desired,previousBuyerNumber:number(buyer.jerseyNumber),quote:{currency:q.currency,amount:q.amount,rate:q.rate,date:q.date,source:q.source},status:"pending",createdAtMs:Date.now(),updatedAtMs:Date.now()};tx.set(offerRef,result);return {ok:true};
  }
  const offerRef=db.doc(`clubs/${clubId}/numberOffers/${validId(body.offerId)}`),offer=(await tx.get(offerRef)).data();
  if(!offer)throw new Error("Offer not found.");
  const holderRef=db.doc(`clubs/${clubId}/members/${offer.holderId}`),buyerRef=db.doc(`clubs/${clubId}/members/${offer.buyerId}`);
  const [holderSnap,buyerSnap]=await tx.getAll(holderRef,buyerRef),holder=holderSnap.data(),buyer=buyerSnap.data();
  if(action==="respond"){
   if(!privacy.owns(holder,user))throw new Error("Only the number holder can decide.");
   const next=body.decision;
   if(next==="reopened"&&offer.status!=="declined"||next!=="reopened"&&offer.status!=="pending"&&!(next==="declined"&&offer.status==="accepted")||!["accepted","declined","reopened"].includes(next))throw new Error("This offer is no longer awaiting that decision.");
   tx.update(offerRef,{status:next,updatedAtMs:Date.now()});return {ok:true};
  }
  if(action!=="complete"||!adminNow||offer.status!=="accepted"||body.paymentConfirmed!==true||body.holderPaymentConfirmed!==true)throw new Error("Holder acceptance and captain/admin confirmation of payment to the holder are required.");
  if(!active(holder)||!active(buyer)||number(holder.jerseyNumber)!==offer.number||number(buyer.jerseyNumber)!==offer.previousBuyerNumber)throw new Error("A player or number changed. Start a new discussion.");
  const members=await tx.get(db.collection(`clubs/${clubId}/members`));if(members.docs.some(item=>item.id!==offer.holderId&&number(item.data().jerseyNumber)===offer.number))throw new Error("Resolve the legacy duplicate before transfer.");
  const reservations=await tx.getAll(...[offer.number,offer.previousBuyerNumber].filter(n=>n!==null).map(n=>db.doc(`clubs/${clubId}/numberReservations/${n}`)));
  const occupied=reservations.find(s=>s.id===String(offer.number))?.data();if(occupied?.memberId&&occupied.memberId!==offer.holderId)throw new Error("Number reservation changed.");
  const linked=[];
  for(const [id,data,next] of [[offer.holderId,holder,null],[offer.buyerId,buyer,offer.number]]){
   const playerRef=data.playerId?db.doc(`clubs/${clubId}/players/${validId(data.playerId)}`):null;
   const player=playerRef?(await tx.get(playerRef)).data():null;
   if(player&&player.sourceMemberId!==id)throw new Error("Ask admin to repair the player link first.");
   linked.push({id,data,next,playerRef,player});
  }
  for(const item of linked){const patch={jerseyNumber:item.next,updatedAt:FieldValue.serverTimestamp()};tx.update(db.doc(`clubs/${clubId}/members/${item.id}`),patch);tx.set(db.doc(`clubs/${clubId}/publicMembers/${item.id}`),privacy.projection("members",{...item.data,...patch}));if(item.player){tx.update(item.playerRef,patch);tx.set(db.doc(`clubs/${clubId}/publicPlayers/${item.playerRef.id}`),privacy.projection("players",{...item.player,...patch}));}}
  writeClaim(tx,db,clubId,offer.buyerId,{next:offer.number,previous:offer.previousBuyerNumber,reservations});
  tx.update(offerRef,{status:"completed",confirmedByUid:user.uid,updatedAtMs:Date.now(),paymentConfirmed:true,holderPaymentConfirmed:true});return {ok:true};
 });
}
module.exports={number,captain,currencyFor,readClaim,writeClaim,handle};
