const {randomUUID}=require("node:crypto");
const {context}=require("./kitBulk.cjs");
const ROOT="yearEndEvents/turf-kings";
const PAYMENT="yearEndPayments";
const originSet=new Set(["https://five-asides-near-me-staging.web.app","https://five-asides-near-me-development.web.app","https://five-asides-near-me-testing.web.app","https://five-asides-near-me.web.app","https://5asidenearme.com","https://www.5asidenearme.com"]);
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const text=(x,max)=>typeof x==="string"&&x.trim().length<=max?x.trim():"";
const eventId=x=>typeof x==="string"&&/^[a-f0-9-]{36}$/.test(x);
const slots=new Set(["top","after-jersey","after-hero","after-headlines","after-mvp","after-streak","before-old-stories","before-recap"]);
function settings(input={}){
 const {date,arrival,program,player,guest,cooler,bottle,maxGuests,capacity}=input;
 const venue=text(input.venue,180),dress=text(input.dress,120);
 const startsAt=Date.parse(`${date}T${arrival}:00+02:00`);
 const calendar=new Date(`${date}T00:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+calendar)||calendar.toISOString().slice(0,10)!==date||
    ![arrival,program].every(x=>typeof x==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x))||
    startsAt<=Date.now()||!venue||!dress||![player,guest,cooler,bottle].every(x=>integer(x,0,10000000))||
    !integer(maxGuests,0,20)||!integer(capacity,1,500))throw Error("Check the event date, time, venue, prices and capacity.");
 return {date,arrival,program,venue,dress,player,guest,cooler,bottle,maxGuests,capacity,startsAt,
  slotKey:slots.has(input.slotKey)?input.slotKey:"before-old-stories",
  title:text(input.title,120),intro:text(input.intro,1000),drinksCopy:text(input.drinksCopy,1000),coverCopy:text(input.coverCopy,1000)};
}
async function eventAction({db,user,body}){
 const ref=db.doc(ROOT);
 if(body.action==="yearEndView"){
  const event=(await ref.get()).data()||null;
  if(!event)return {event:null};
  let manager=false;
  if(event.archived || !event.programPublished){
   manager=(await context(db,user,"turf-kings").catch(()=>null))?.captain===true;
   if(event.archived&&!manager)return {event:null};
  }
  const booking=(await ref.collection("editions").doc(event.id).collection("bookings").doc(user.uid).get()).data();
  const {programItems,...publicEvent}=event;
  let attendees;
  if(body.includeAttendees===true && !event.archived){
   const {members}=await context(db,user,"turf-kings");
   const roster=new Map(members.map(member=>[member.uid,member.fullName||member.shortName]));
   const snapshot=await ref.collection("editions").doc(event.id).collection("bookings").get();
   attendees=snapshot.docs.flatMap((doc,index)=>{
    const row=doc.data();
    if(!["paid","confirmed","pending"].includes(row.status))return [];
    return [{id:doc.id===user.uid?"self":String(index),name:row.displayName||roster.get(doc.id)||"Club player",friends:row.seats-1,amount:row.amount,status:row.status,paid:row.status==="paid"}];
   });
  }
  return {attendees,event:manager||event.programPublished?event:publicEvent,booking:booking?{status:booking.status,guests:booking.guests,coolers:booking.coolers,bottles:booking.bottles,amount:booking.amount}:null};
 }
 return db.runTransaction(async tx=>{
  const ctx=await context(db,user,"turf-kings",tx);
  if(!ctx.captain)throw Error("Only a Turf Kings administrator or captain can edit the event.");
  const current=(await tx.get(ref)).data();
  if(body.action==="yearEndProgramme"){
   if(!current || body.eventId!==current.id)throw Error("Reopen the current event.");
   const items=body.items;
   if(!Array.isArray(items)||!items.length||items.length>30||items.some(item=>!item||
     !text(item.title,100)||!integer(item.offsetStart,0,720)||!integer(item.offsetEnd,item.offsetStart+1,720)))
     throw Error("Each programme item needs a title and valid start and end minutes.");
   tx.update(ref,{programPublished:body.published===true,programItems:items.map(item=>({
     title:text(item.title,100),speaker:text(item.speaker,100),desc:text(item.desc,2000),icon:text(item.icon,16)||"🎤",
     offsetStart:item.offsetStart,offsetEnd:item.offsetEnd,
   })).sort((a,b)=>a.offsetStart-b.offsetStart)});
   return {};
  }
  if(body.action==="yearEndArchive"){
   if(!current||current.archived)return {};
   tx.update(ref,{archived:true});return {};
  }
  if(body.action!=="yearEndPublish")throw Error("Choose an event action.");
  const values=settings(body.event);
  if(current&&current.date===values.date&&current.reserved>0&&values.capacity<current.reserved)throw Error("Capacity cannot be below reserved seats.");
  if(current&&!current.archived&&current.reserved>0&&values.date!==current.date)throw Error("Archive this edition before starting a different date.");
  const newEdition=!current||current.archived&&current.date!==values.date;
  tx.set(ref,{...values,id:newEdition?randomUUID():current.id,reserved:newEdition?0:current.reserved||0,
    programPublished:newEdition?false:current?.programPublished===true,programItems:current?.programItems||[],
    archived:false,updatedBy:user.uid,updatedAtMs:Date.now()});
  return {};
 });
}
async function checkout({db,user,body,secret,request=fetch}){
 const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||"";
 if(!/^sk_(test|live)_/.test(secret||"")||(project!=="five-asides-near-me"&&!secret.startsWith("sk_test_")))throw Error("This environment needs a Yoco test key.");
 if(body.accepted!==true||!eventId(body.eventId)||!integer(body.eventVersion,1,Number.MAX_SAFE_INTEGER))throw Error("Review the RSVP and accept the payment terms.");
 const origin=originSet.has(body.origin)?body.origin:"https://five-asides-near-me-staging.web.app";
 const guests=Array.isArray(body.guests)?body.guests.map(x=>text(x,80)):null;
 if(!guests||guests.some(x=>!x)||new Set(guests.map(x=>x.toLowerCase())).size!==guests.length||!integer(body.coolers,0,20)||!integer(body.bottles,0,20))throw Error("Enter unique guest names and valid quantities.");
 const ref=db.doc(ROOT),bookingRef=ref.collection("editions").doc(body.eventId).collection("bookings").doc(user.uid);
 const payment=await db.runTransaction(async tx=>{
  const {member}=await context(db,user,"turf-kings",tx);
  const [eventSnap,bookingSnap]=await tx.getAll(ref,bookingRef);
  const event=eventSnap.data(),old=bookingSnap.data();
  if(old?.status==="paid"||old?.status==="confirmed")return {confirmed:true};
  if(old?.status==="pending"){
   const pending=(await tx.get(db.collection(PAYMENT).doc(old.paymentId))).data();
   if(!pending)throw Error("Contact support to verify your pending RSVP.");
   if(JSON.stringify(old.guests)!==JSON.stringify(guests)||old.coolers!==body.coolers||old.bottles!==body.bottles)throw Error("An RSVP payment is already pending. Resume that payment before changing the booking.");
   return pending;
  }
  if(!event||event.id!==body.eventId||event.archived||event.startsAt<=Date.now()||event.updatedAtMs!==body.eventVersion)throw Error("The event changed. Refresh and review it.");
  if(guests.length>event.maxGuests)throw Error("Too many guests for this event.");
  const seats=1+guests.length;
  if(event.reserved+seats>event.capacity)throw Error("There are not enough seats left.");
  const amount=event.player+event.guest*guests.length+event.cooler*body.coolers+event.bottle*body.bottles;
  const id=randomUUID(),status=amount?"pending":"confirmed";
  tx.update(ref,{reserved:event.reserved+seats});
  tx.set(bookingRef,{displayName:member.fullName||member.shortName||user.name||"Club player",status,guests,coolers:body.coolers,bottles:body.bottles,seats,amount,paymentId:id,createdAtMs:Date.now()});
  if(!amount)return {confirmed:true};
  const payment={id,eventId:event.id,uid:user.uid,amount,status,mode:secret.startsWith("sk_test_")?"test":"live"};
  tx.create(db.collection(PAYMENT).doc(id),payment);
  return payment;
 });
 if(payment.confirmed||payment.redirectUrl)return payment.confirmed?{confirmed:true}:{redirectUrl:payment.redirectUrl};
 const response=await request("https://payments.yoco.com/api/checkouts",{
  method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json","Idempotency-Key":payment.id},
  body:JSON.stringify({amount:payment.amount,currency:"ZAR",externalId:payment.id,
   metadata:{purpose:"year_end",yearEndPaymentId:payment.id},successUrl:origin+"/?yearEndPayment=returned",
   cancelUrl:origin+"/?yearEndPayment=cancelled",failureUrl:origin+"/?yearEndPayment=failed"}),signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)throw Error("Checkout could not open. Retry the same RSVP.");
 const result=await response.json(),url=new URL(result.redirectUrl);
 if(url.protocol!=="https:"||!/(^|\.)yoco\.com$/.test(url.hostname)||!result.id)throw Error("Invalid checkout destination.");
 const payRef=db.collection(PAYMENT).doc(payment.id);
 await db.runTransaction(async tx=>{
  const saved=(await tx.get(payRef)).data();
  if(saved?.checkoutId&&saved.checkoutId!==result.id)throw Error("The checkout reference does not match.");
  if(saved?.status==="pending")tx.update(payRef,{checkoutId:result.id,redirectUrl:result.redirectUrl});
 });
 return {redirectUrl:result.redirectUrl};
}
async function settle(db,event){
 const payload=event.payload||{},meta=payload.metadata||{};
 if(meta.purpose!=="year_end"||!["payment.succeeded","payment.failed"].includes(event.type))return;
 if(!eventId(meta.yearEndPaymentId))throw Error("Invalid event payment.");
 const payRef=db.collection(PAYMENT).doc(meta.yearEndPaymentId),ref=db.doc(ROOT);
 await db.runTransaction(async tx=>{
  const payment=(await tx.get(payRef)).data();
  if(!payment||payment.status!=="pending")return;
  const checkoutId=meta.checkoutId||payload.checkoutId;
  if(!checkoutId||payment.checkoutId&&payment.checkoutId!==checkoutId||payload.amount!==payment.amount||payload.currency!=="ZAR"||payload.mode!==payment.mode)throw Error("Event payment does not match.");
  const bookingRef=ref.collection("editions").doc(payment.eventId).collection("bookings").doc(payment.uid);
  const [eventSnap,bookingSnap]=await tx.getAll(ref,bookingRef),booking=bookingSnap.data();
  if(booking?.paymentId!==payment.id)throw Error("The RSVP changed.");
  const paid=event.type==="payment.succeeded",status=paid?"paid":"failed";
  tx.update(payRef,{status,checkoutId});tx.update(bookingRef,{status});
  if(!paid&&eventSnap.data()?.id===payment.eventId)tx.update(ref,{reserved:Math.max(0,eventSnap.data().reserved-booking.seats)});
 });
}
module.exports={eventAction,checkout,settle,settings};
