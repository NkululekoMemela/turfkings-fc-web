const actions=new Set(['bibReturnsView','saveBibReturnPolicy','reviewBibReturn','confirmBibReturn','disputeBibReturn','recordBibReimbursement','ackBibReimbursement']);
const clean=(value,max=300)=>String(value||'').trim().slice(0,max);
const safe=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
async function operate({db,tx,user,body,ctx,base,config,configRef}){
 const manager=ctx.manager,captain=ctx.club?.captain,clubId=body.clubId;
 if(!manager&&!captain)throw Error('Field management or the Club captain must confirm this record.');
 const {custodyItems,bibCustodySnapshot}=await import('./fieldBibCustody.mjs');
 const readRecords=async()=>{
  const snapshot=await tx.get(db.collection(`${base}/bibLoans`));
  const loans=snapshot.docs.map(doc=>({...doc.data(),id:doc.id,recordType:doc.data().recordType||'handout'}));
  const days=await tx.get(db.collection(`${base}/bibHireDays`));
  const ids=[...new Set(days.docs.flatMap(doc=>Object.keys(doc.data().orders||{})))];
  const hires=ids.length?await tx.getAll(...ids.map(id=>db.doc(`kitShopOrders/${id}`))):[];
  return [...new Map([...loans,...hires.map((doc,i)=>({...doc.data(),id:ids[i],recordType:'hire'})).filter(record=>record.orderType==='bib_hire'&&record.paymentStatus==='confirmed'&&record.status!=='cancelled')].map(record=>[`${record.recordType}:${record.id}`,record])).values()].filter(record=>manager||record.clubId===clubId);
 };
 if(body.action==='bibReturnsView'){
  const records=await readRecords();
  const visible=records.filter(record=>custodyItems(record).some(player=>!['returned','lost_settled'].includes(player.state))||record.returnReview?.status==='pending'||record.returnReview?.status==='disputed'||Object.values(record.reimbursements||{}).some(payment=>payment.status!=='acknowledged'));
  return {manager,captain:Boolean(captain),policy:config.returnPolicy||'return_after_play',configRevision:config.revision||0,records:visible.map(record=>({...record,items:custodyItems(record)})),settledRecords:records.filter(record=>!visible.includes(record)).map(record=>({...record,items:custodyItems(record)})),ledger:manager?bibCustodySnapshot(config.stock||[],records):null};
 }
 if(body.action==='saveBibReturnPolicy'){
  if(!manager||body.expectedRevision!==config.revision)throw Error('Refresh stock before changing the return policy.');
  if(!['return_after_play','carry_allowed'].includes(body.policy))throw Error('Choose a return policy.');
  tx.set(configRef,{...config,returnPolicy:body.policy,revision:(config.revision||0)+1,updatedBy:user.uid,updatedAtMs:Date.now()});return {ok:true};
 }
 if(!safe(body.orderId))throw Error('Choose a bib record.');
 const handout=body.recordType==='handout',ref=db.doc(handout?`${base}/bibLoans/${body.orderId}`:`kitShopOrders/${body.orderId}`);
 const record=(await tx.get(ref)).data();
 if(!record||record.venueId!==ctx.venueId||(!manager&&record.clubId!==clubId)||(!handout&&(record.orderType!=='bib_hire'||record.paymentStatus!=='confirmed')))throw Error('This bib record is unavailable to your account.');
 if(body.expectedRevision!==(record.revision||1))throw Error('This record changed. Refresh and confirm the latest version.');
 const items=custodyItems(record),now=Date.now(),updated={...record,revision:(record.revision||1)+1,updatedAtMs:now};
 let inventoryChanged=false;
 if(body.action==='reviewBibReturn'){
  if(!manager)throw Error('Field staff must count and record the bibs first.');
  if(!Array.isArray(body.states)||body.states.length!==items.length)throw Error('Record the status of every bib.');
  const states={},seen=new Set();
  for(const choice of body.states){
   const item=items.find(item=>item.index===choice.index);
   if(!item||seen.has(choice.index)||!['returned','kept','missing','lost_settled'].includes(choice.state))throw Error('Choose a valid status for every bib.');
   seen.add(choice.index);
   if(choice.state==='lost_settled'&&item.state!=='lost_settled')throw Error('Confirm the replacement receipt before settling a lost bib.');
   if(['returned','lost_settled'].includes(item.state)&&choice.state!==item.state&&!(item.state==='returned'&&['pending','disputed'].includes(record.returnReview?.status)&&clean(body.reason).length>=5))throw Error('Explain the count correction, or record a new handout after an agreed return.');
   if(choice.state==='kept'&&config.returnPolicy!=='carry_allowed')throw Error('This Field requires bibs to be returned after play.');
   if(choice.state==='kept'&&(!/^\d{4}-\d{2}-\d{2}$/.test(choice.until||'')||!Number.isFinite(Date.parse(choice.until))||Date.parse(choice.until)<now-86400000||Date.parse(choice.until)>now+90*86400000))throw Error('Choose a carry-over return date within 90 days.');
   states[choice.index]={state:choice.state,until:choice.state==='kept'?choice.until:'',atMs:now,byUid:user.uid};
  }
  updated.bibStates=states;updated.hireStatus=body.states.every(choice=>['returned','lost_settled'].includes(choice.state))?'returned':'outstanding';
  updated.returnHistory=[...(record.returnHistory||[]),...(record.returnReview?[{...record.returnReview,bibStates:record.bibStates||{}}]:[])].slice(-30);
  updated.returnReview={reason:clean(body.reason),status:'pending',version:updated.revision,proposedBy:user.uid,proposedAtMs:now};inventoryChanged=true;
  if(!handout&&updated.hireStatus==='returned'&&record.hireStatus!=='returned')await require('./fieldBibHire.cjs').release({db,tx,order:record,orderId:body.orderId});
 }else if(body.action==='confirmBibReturn'||body.action==='disputeBibReturn'){
  if(!captain||record.clubId!==clubId)throw Error('The signed-in captain of this Club must respond.');
  if(record.returnReview?.status!=='pending'||record.returnReview.proposedBy===user.uid)throw Error('A different person must confirm the Field’s recorded count.');
  const disputed=body.action==='disputeBibReturn';
  if(disputed&&clean(body.reason).length<5)throw Error('Briefly explain which bib count needs checking.');
  updated.returnReview={...record.returnReview,status:disputed?'disputed':'confirmed',respondedBy:user.uid,respondedAtMs:now,reason:disputed?clean(body.reason):''};
 }else if(body.action==='recordBibReimbursement'){
  if(!manager)throw Error('Only Field management can record receipt of replacement money.');
  const item=items.find(item=>item.index===body.playerIndex);
  if(item?.state!=='missing'||record.returnReview?.status!=='confirmed')throw Error('Agree the missing-bib record with the captain before recording reimbursement.');
  if(record.reimbursements?.[item.index])throw Error('A receipt already exists for this bib.');
  if(!Number.isInteger(body.amountMinor)||body.amountMinor<=0||body.amountMinor>1000000||clean(body.reference).length<2)throw Error('Enter the amount received and a payment reference.');
  updated.reimbursements={...(record.reimbursements||{}),[item.index]:{amountMinor:body.amountMinor,reference:clean(body.reference,100),status:'received_pending_ack',receivedBy:user.uid,receivedAtMs:now}};
 }else if(body.action==='ackBibReimbursement'){
  const payment=record.reimbursements?.[body.playerIndex];
  if(!captain||record.clubId!==clubId||!payment||payment.status!=='received_pending_ack'||payment.receivedBy===user.uid)throw Error('The Club captain must acknowledge the Field’s receipt.');
  updated.reimbursements={...record.reimbursements,[body.playerIndex]:{...payment,status:'acknowledged',acknowledgedBy:user.uid,acknowledgedAtMs:now}};
  const item=items.find(item=>item.index===body.playerIndex);
  if(item?.state!=='missing')throw Error('This bib is no longer recorded missing. Ask the Field to reconcile its receipt.');
  updated.bibStates={...(record.bibStates||{}),[item.index]:{...(record.bibStates?.[item.index]||{}),state:'lost_settled',writtenOffAtMs:now}};
  const {bibKey}=await import('./fieldBibCustody.mjs');
  config.stock=(config.stock||[]).map(row=>bibKey(row.color,row.number)===bibKey(item.color,item.number)?{...row,quantity:Math.max(0,Number(row.quantity)-1)}:row);
  inventoryChanged=true;
  updated.hireStatus=custodyItems(updated).every(item=>['returned','lost_settled'].includes(item.state))?'returned':'outstanding';
  if(!handout&&updated.hireStatus==='returned'&&record.hireStatus!=='returned')await require('./fieldBibHire.cjs').release({db,tx,order:record,orderId:body.orderId});

 }else throw Error('Unknown bib return action.');
 tx.set(ref,updated);
 if(!handout){tx.set(db.doc(`kitShopCustomers/${record.ownerUid}/orders/${body.orderId}`),updated);tx.set(db.doc(`${base}/bibLoans/${body.orderId}`),{...updated,ledgerOnly:true,recordType:'hire'});}
 if(inventoryChanged)tx.set(configRef,{...config,revision:(config.revision||0)+1});
 return {ok:true};
}
module.exports={actions,operate};
