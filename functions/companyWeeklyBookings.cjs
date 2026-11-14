const {createHash}=require("node:crypto");
const KEY=/^[A-Za-z0-9_-]{1,150}$/;
const DAY=86400000;
const weekdays=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const hash=value=>createHash("sha256").update(value).digest("hex");
function dateInZone(ms,zone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(ms).map(p=>[p.type,p.value]));
 return parts.year+"-"+parts.month+"-"+parts.day;
}
function weeksFor(schedule={},now=Date.now()){
 const zone=schedule.timezone||"Africa/Johannesburg";
 const day=weekdays.indexOf(schedule.playDay);
 if(day<0)return [];
 const date=dateInZone(now,zone),start=Date.parse(date+"T00:00:00Z");
 return Array.from({length:56},(_,i)=>new Date(start+i*DAY)).filter(d=>d.getUTCDay()===day).map(d=>d.toISOString().slice(0,10));
}
function staffNumber(value){
 const clean=String(value||"").trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9 ./_-]{0,39}$/.test(clean))throw Error("Enter your company staff number (up to 40 characters).");
 return clean;
}
async function handle({db,user,body,operator}){
 if(!KEY.test(body.clubId||""))throw Error("Choose a Company Club.");
 const root="clubs/"+body.clubId,ref=db.doc(root);
 return db.runTransaction(async tx=>{
  const club=(await tx.get(ref)).data();
  if(club?.clubType!=="company"||!KEY.test(club.companyId||"")||club.deleted||club.archived||club.status==="archived")throw Error("Choose an active Company Club.");
  const org=(await tx.get(db.doc("companyOrganizations/"+club.companyId))).data();
  if(org?.status!=="active"||!org.clubIds?.includes(body.clubId))throw Error("This company is unavailable.");
  const billing="companyOrganizations/"+club.companyId;
  if(body.action==="weeklyView"||body.action==="weeklyBooking"){
   const members=(await tx.get(db.collection(root+"/members").where("uid","==",user.uid))).docs.filter(d=>d.data().status==="active"&&d.data().isPlayer!==false);
   if(members.length!==1)throw Error("An active Company Club player membership is required.");
   const member=members[0],playerId=member.data().playerId||member.id;
   const profileRef=db.doc(billing+"/staffNumbers/"+hash(user.uid)),bookingRef=db.doc(root+"/matchSignups/company_"+hash(user.uid));
   const [profileSnap,bookingSnap]=await tx.getAll(profileRef,bookingRef);
   const profile=profileSnap.data(),old=bookingSnap.data();
   const schedule=club.schedule||{};
   const weeks=weeksFor(schedule);
   if(body.action==="weeklyView")return {weeks,selectedWeeks:(old?.selectedWeeks||[]).filter(day=>weeks.includes(day)),staffNumber:profile?.staffNumber||"",playTime:schedule.playTime||"",venue:club.venueName||club.locationDetails?.venueName||""};
   if(!weeks.includes(body.week)||typeof body.booked!=="boolean")throw Error("Choose an available match date.");
   const number=staffNumber(body.staffNumber);
   if(profile&&profile.staffNumber!==number)throw Error("Ask FANM to correct your registered staff number.");
   const numberRef=db.doc(billing+"/numberOwners/"+hash(number)),numberOwner=(await tx.get(numberRef)).data();
   if(numberOwner&&numberOwner.uid!==user.uid)throw Error("That staff number is already registered. Contact your company coordinator.");
   const selected=new Set(old?.selectedWeeks||[]);
   if(body.booked)selected.add(body.week);else selected.delete(body.week);
   const selectedWeeks=[...selected].sort();
   tx.set(profileRef,{staffNumber:number,uid:user.uid});
   tx.set(numberRef,{uid:user.uid});
   tx.set(bookingRef,{clubId:body.clubId,profileOwnerUid:user.uid,payerUserId:user.uid,playerId,beneficiaryPlayerId:playerId,
    beneficiaryName:member.data().fullName||member.data().shortName||"Company player",selectedWeeks,paidWeeks:selectedWeeks,primaryPaidWeeks:selectedWeeks,
    paymentStatus:selectedWeeks.length?"paid":"not_selected",paymentMethod:"company_invoice",paymentActuallyReceived:false,fundingType:"company",updatedAtMs:Date.now()});
   return {selectedWeeks:selectedWeeks.filter(day=>weeks.includes(day)),staffNumber:number};
  }
  const companyAdmin=org.roles?.[user.uid]?.includes("company_admin");
  if(!operator(user)&&!companyAdmin)throw Error("Company billing access is required.");
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month||""))throw Error("Choose a billing month.");
  const invoiceRef=db.doc(billing+"/weeklyInvoices/"+body.clubId+"_"+body.month);
  const existing=(await tx.get(invoiceRef)).data();
  if(body.action==="weeklyInvoiceView")return {invoice:existing||null};
  if(!operator(user))throw Error("Only FANM can issue invoices.");
  if(body.action==="weeklyInvoicePaid"){
   if(!existing)throw Error("Issue an invoice first.");
   if(existing.status==="paid")return {invoice:existing};
   const reference=String(body.reference||"").trim().slice(0,120);
   if(!reference)throw Error("Enter the actual payment reference.");
   const invoice={...existing,status:"paid",paymentReference:reference,paidAtMs:Date.now(),recordedBy:user.uid};
   tx.set(invoiceRef,invoice);return {invoice};
  }
  if(!["weeklyInvoiceIssue","weeklyInvoicePreview"].includes(body.action))throw Error("Unknown billing action.");
  if(existing)return {invoice:existing};
  if(body.month>=dateInZone(Date.now(),club.schedule?.timezone||"Africa/Johannesburg").slice(0,7))throw Error("Issue invoices after the billing month has closed.");
  if(body.action==="weeklyInvoiceIssue"&&(!Number.isSafeInteger(body.unitMinor)||body.unitMinor<1||body.unitMinor>1000000))throw Error("Enter the agreed rate per staff member per attended day.");
  if(body.action==="weeklyInvoiceIssue"&&body.confirmed!==true)throw Error("Review actual participation before issuing the invoice.");
  const state=(await tx.get(db.doc(root+"/state/main"))).data()?.state;
  const roster=(await tx.get(db.collection(root+"/members"))).docs;
  const identities=new Map();
  for(const member of roster){
   const m=member.data();
   if(m.uid)for(const id of [member.id,m.playerId])if(id)identities.set(id,m.uid);
  }
  const attended=new Map(),zone=club.schedule?.timezone||"Africa/Johannesburg";
  for(const season of state?.seasons||[])for(const event of [...(season.matchDayHistory||[]),...(season.friendlyMatchDayHistory||[])]){
   const timestamp=Date.parse(event.createdAt);
   if(!Number.isFinite(timestamp)||!event.results?.length)continue;
   const date=dateInZone(timestamp,zone);
   if(!date.startsWith(body.month+"-"))continue;
   for(const row of event.playerAppearances||[]){
    if(!(Number(row.matchesPlayed)>0))continue;
    const uid=identities.get(row.playerId);
    if(!uid)throw Error("A recorded participant has no linked company account. Check the attendance records.");
    attended.set(date+"/"+uid,{date,uid});
   }
  }
  if(!attended.size)throw Error("No confirmed participation found for this month.");
  if(attended.size>500)throw Error("This month needs a split billing review before issuing.");
  const owners=[...new Set([...attended.values()].map(row=>row.uid))];
  const profiles=await tx.getAll(...owners.map(uid=>db.doc(billing+"/staffNumbers/"+hash(uid))));
  const numbers=new Map(owners.map((uid,index)=>[uid,profiles[index].data()?.staffNumber]));
  const candidates=[...attended.values()].map(row=>({id:hash(row.date+"/"+row.uid),date:row.date,staffNumber:numbers.get(row.uid)||""})).sort((a,b)=>a.date.localeCompare(b.date)||a.staffNumber.localeCompare(b.staffNumber));
  if(body.action==="weeklyInvoicePreview")return {candidates};
  const selected=new Set(Array.isArray(body.lineIds)?body.lineIds:[]);
  const lines=candidates.filter(row=>selected.has(row.id)).map(({date,staffNumber})=>({date,staffNumber,amountMinor:body.unitMinor}));
  if(!lines.length||lines.length!==selected.size||lines.some(row=>!row.staffNumber))throw Error("Review the current attendance rows and select staff with registered numbers.");
  const invoice={id:"FANM-"+hash(body.clubId).slice(0,10).toUpperCase()+"-"+body.month,companyName:org.name,clubId:body.clubId,month:body.month,currency:"ZAR",
   unitMinor:body.unitMinor,totalMinor:lines.length*body.unitMinor,lines,status:"issued",issuedAtMs:Date.now(),issuedBy:user.uid};
  tx.set(invoiceRef,invoice);return {invoice};
 });
}
module.exports={handle,weeksFor,staffNumber};
