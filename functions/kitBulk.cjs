const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const clean=(v,n=120)=>String(v||"").trim().slice(0,n);
const root=clubId=>`kitShopConfig/club_${clubId}`;
const requestId=(memberId,side)=>`${memberId}_${side}`;
function number(v){if(v===null||v==="")return null;const n=Number(v);if(!Number.isInteger(n)||n<0||n>99||!/^[0-9]{1,2}$/.test(String(v)))throw Error("Use a bib number from 0 to 99.");return n;}
async function context(db,user,clubId,tx){
 if(!valid(clubId)||!user?.uid||!user.email_verified||user.cameraSession||user.firebase?.sign_in_provider==="anonymous")throw Error("Sign in with your verified Club account.");
 const read=r=>tx?tx.get(r):r.get();
 const [club,snap]=await Promise.all([read(db.doc(`clubs/${clubId}`)),read(db.collection(`clubs/${clubId}/members`))]);
 if(!club.exists||club.data().deleted)throw Error("Club unavailable.");
 const members=snap.docs.map(d=>({...d.data(),id:d.id})).filter(m=>m.status==="active");
 const mine=members.filter(m=>m.uid===user.uid);if(mine.length!==1)throw Error("Your active Club membership is required.");
 const leaders=[club.data().ownerUid,club.data().createdByUid,...(club.data().adminUids||[])];
 return {club:club.data(),members,member:mine[0],captain:["admin","captain"].includes(mine[0].role)||leaders.includes(user.uid)};
}
const publicRequest=(d,id)=>({id,memberId:d.memberId,side:d.side,productId:d.productId,number:d.number,status:d.status,paymentStatus:d.paymentStatus,amountMinor:d.amountMinor,orderId:d.orderId||"",revision:d.revision||1,updatedAtMs:d.updatedAtMs});
async function handle({db,user,body}){
 if(body.isPracticeMode||body.environment==="practice")throw Error("Switch to Official for bib orders.");
 const clubId=body.clubId;
 if(body.action==="bibView"){
  const ctx=await context(db,user,clubId),[requests,products]=await Promise.all([db.collection(`${root(clubId)}/requests`).get(),db.collection("kitShopProducts").get()]);
  return {payerModel:ctx.club.clubType==="company"?"company":"individual",captain:ctx.captain,memberId:ctx.member.id,clubName:ctx.club.name||ctx.club.clubName||"Your Club",onlinePayments:clubId==="turf-kings",members:(ctx.captain?ctx.members:[ctx.member]).map(m=>({id:m.id,name:m.shortName||m.fullName||"Player",number:m.jerseyNumber??null})),requests:requests.docs.filter(d=>ctx.captain||d.data().memberId===ctx.member.id).map(d=>publicRequest(d.data(),d.id)),products:products.docs.filter(d=>d.data().active).map(d=>({id:d.id,title:d.data().title,size:d.data().size,color:d.data().color,priceMinor:d.data().priceMinor,stock:d.data().stock,madeToOrder:d.data().madeToOrder===true}))};
 }
 return db.runTransaction(async tx=>{
  const ctx=await context(db,user,clubId,tx);
  if(body.action==="confirmBibContribution"){
   if(ctx.club.clubType==="company")throw Error("Company merchandise is billed to the company, not to players.");
   if(!ctx.captain||!valid(body.requestId)||!clean(body.reference))throw Error("Captain access and a verified payment reference are required.");
   const ref=db.doc(`${root(clubId)}/requests/${body.requestId}`),saved=(await tx.get(ref)).data();
   if(!saved||saved.revision!==body.expectedRevision||saved.status!=="requested"||saved.paymentStatus==="pending")throw Error("Refresh this request before confirming payment.");
   tx.set(ref,{...saved,paymentStatus:"paid",paymentReference:clean(body.reference),paymentConfirmedBy:user.uid,revision:saved.revision+1,updatedAtMs:Date.now()});return {saved:true};
  }
  if(body.action!=="requestBib")throw Error("Unknown bib operation.");
  if(!["home","away"].includes(body.side)||!valid(body.productId))throw Error("Choose a home or away bib and size.");
  const ref=db.doc(`${root(clubId)}/requests/${requestId(ctx.member.id,body.side)}`);
  const [old,product,counter,all]=await Promise.all([tx.get(ref),tx.get(db.doc(`kitShopProducts/${body.productId}`)),tx.get(db.doc(root(clubId))),tx.get(db.collection(`${root(clubId)}/requests`))]);
  const previous=old.data(),p=product.data();
  if(!p?.active)throw Error("This bib is unavailable.");
  if(previous&&(previous.status!=="requested"||["paid","pending"].includes(previous.paymentStatus)))throw Error("Ask your captain to review your existing bib order.");
  if((previous?.revision||0)!==(body.expectedRevision||0))throw Error("This request changed. Refresh before saving.");
  const row={memberId:ctx.member.id,ownerUid:user.uid,side:body.side,productId:body.productId,number:number(body.number),amountMinor:p.priceMinor,status:"requested",paymentStatus:"unpaid",revision:(previous?.revision||0)+1,updatedAtMs:Date.now()};
  const total=all.docs.filter(d=>d.id!==ref.id&&d.data().side===body.side&&d.data().status==="requested").length+1;
  const cycle=counter.data()?.[`${body.side}Cycle`]||0;
  const alerts=[];for(const threshold of [6,12])if(total>=threshold){const ref=db.doc(`${root(clubId)}/alerts/${body.side}_${cycle}_${threshold}`);if(!(await tx.get(ref)).exists)alerts.push({ref,threshold});}
  for(const alert of alerts)tx.set(alert.ref,{clubId,side:body.side,threshold:alert.threshold,createdAtMs:Date.now()});
  tx.set(ref,row);return {saved:true};
 });
}
async function prepare({db,tx,user,body,orderId}){
 const ctx=await context(db,user,body.clubId,tx);if(ctx.club.clubType==="company")throw Error("Company merchandise ordering opens with company invoicing. No personal payment is required.");if(!ctx.captain)throw Error("Your captain places the bulk order.");
 if(!Array.isArray(body.allocations)||![6,12,18,24].includes(body.allocations.length))throw Error("Select a pack of 6 or 12 players per home or away colour.");
 const seen=new Set(),numbers=new Set(),counts={},items={};
 const allocations=[];
 for(const a of body.allocations){
  if(!valid(a.memberId)||!valid(a.productId)||!["home","away"].includes(a.side)||!ctx.members.some(m=>m.id===a.memberId))throw Error("Select active Club players and a bib for each.");
  const key=requestId(a.memberId,a.side),n=number(a.number);if(n===null)throw Error("Confirm a number for every bib before ordering.");
  if(seen.has(key)||numbers.has(`${a.side}:${n}`))throw Error("Each player and bib number must be unique within a home or away pack.");seen.add(key);numbers.add(`${a.side}:${n}`);counts[a.side]=(counts[a.side]||0)+1;items[a.productId]=(items[a.productId]||0)+1;
  const old=(await tx.get(db.doc(`${root(body.clubId)}/requests/${key}`))).data();
  if(old?.orderId&&old.orderId!==orderId&&!["cancelled","delivered","collected"].includes(old.status))throw Error("A selected player already has a pending bib.");
  if(old?.paymentStatus==="pending")throw Error("Wait for the selected player’s payment result before placing their order.");
  allocations.push({memberName:clean(ctx.members.find(m=>m.id===a.memberId).shortName||ctx.members.find(m=>m.id===a.memberId).fullName||"Player"),memberId:a.memberId,ownerUid:ctx.members.find(m=>m.id===a.memberId).uid||"",side:a.side,productId:a.productId,number:n,previous:old||null});
 }
 if(Object.values(counts).some(n=>![6,12].includes(n)))throw Error("Home and away packs each need 6 or 12 players.");
 const expected=JSON.stringify(Object.entries(items).sort()),actual=JSON.stringify(body.items.map(i=>[i.productId,i.quantity]).sort());if(expected!==actual)throw Error("The basket must match the selected players.");
 const pending=await tx.get(db.collection(`${root(body.clubId)}/requests`));
 for(const a of allocations){
  const reservation=(await tx.get(db.doc(`clubs/${body.clubId}/numberReservations/${a.number}`))).data();
  if(reservation&&[reservation.memberId,reservation.pendingMemberId].filter(Boolean).some(id=>id!==a.memberId))throw Error("This bib number belongs to another player. Resolve it before ordering.");
  if(ctx.members.some(m=>m.id!==a.memberId&&m.jerseyNumber!==null&&m.jerseyNumber!==undefined&&m.jerseyNumber!==""&&Number(m.jerseyNumber)===a.number))throw Error("This bib number belongs to another player.");
  if(pending.docs.some(d=>{const r=d.data();return r.memberId!==a.memberId&&r.side===a.side&&r.number===a.number&&!["requested","cancelled","delivered","collected"].includes(r.status);}))throw Error("Another player has this bib number pending.");
 }
 const products=await tx.getAll(...Object.keys(items).map(id=>db.doc(`kitShopProducts/${id}`)));
 for(const side of Object.keys(counts)){const colors=new Set(allocations.filter(a=>a.side===side).map(a=>products.find(p=>p.id===a.productId)?.data()?.color));if(colors.size!==1)throw Error("Choose the same colour throughout each home or away pack.");}
 const counter=(await tx.get(db.doc(root(body.clubId)))).data()||{};
 return {clubId:body.clubId,counts,allocations,cycles:Object.fromEntries(Object.keys(counts).map(side=>[`${side}Cycle`,(counter[`${side}Cycle`]||0)+1]))};
}
function write({db,tx,plan,order}){
 for(const a of plan.allocations){const ref=db.doc(`${root(plan.clubId)}/requests/${requestId(a.memberId,a.side)}`),old=a.previous||{};tx.set(ref,{...old,memberId:a.memberId,ownerUid:a.ownerUid,side:a.side,productId:a.productId,number:a.number,amountMinor:old.amountMinor||order.items.find(p=>p.productId===a.productId).unitPriceMinor,status:"ordered",orderId:order.id,paymentStatus:old.paymentStatus==="paid"?"paid":"captain_covered",revision:(old.revision||0)+1,updatedAtMs:Date.now()});}
 tx.set(db.doc(root(plan.clubId)),plan.cycles,{merge:true});
}
module.exports={handle,context,prepare,write,root,number,publicRequest};
