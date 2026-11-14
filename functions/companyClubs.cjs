const {companyClubSetup,emptyCompanyFootballState}=require("./companyClubSetup.cjs");
const {createHash}=require('node:crypto');
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(x);
const text=(x,n=160)=>String(x||'').trim().slice(0,n);
const operator=user=>String(user.email||'').toLowerCase()==='nkululekolerato@gmail.com';
function signed(user){if(!user?.uid||!user.email_verified||user.cameraSession||user.cameraSessionId||user.cameraHandoffId||user.firebase?.sign_in_provider==='anonymous')throw Error('Sign in with your verified Google account.');}
const grantId=scope=>[scope.venueId,scope.seasonId,scope.clubId].join('~');
function publicApplication(row,id){return {id,setup:row.setup||null,companyName:row.companyName,city:row.city,contactName:row.contactName,contactEmail:row.contactEmail,phone:row.phone,logoUrl:row.logoUrl,status:row.status,reason:row.reason||'',companyId:row.companyId||'',clubId:row.clubId||''};}
async function companyContext({db,tx,user,companyId}){
 if(!valid(companyId))throw Error('Choose your company.');
 const [orgSnap,accountSnap]=await tx.getAll(db.doc(`companyOrganizations/${companyId}`),db.doc(`companyFundingAccounts/${companyId}`));
 const org=orgSnap.data(),account=accountSnap.data();
 if(!org||org.status!=='active'||!operator(user)&&!org.participantUids?.includes(user.uid))throw Error('Company administration access is required.');
 return {org,account};
}
async function seasonContext({db,tx,clubId}){
 if(!valid(clubId))throw Error('Choose a Company Club.');
 const [clubSnap,membershipSnap]=await tx.getAll(db.doc(`clubs/${clubId}`),db.doc(`clubFieldMemberships/${clubId}`));
 const club=clubSnap.data(),membership=membershipSnap.data();
 if(club?.clubType!=='company'||!valid(club.companyId))throw Error('Choose a verified Company Club.');
 if(membership?.status!=='active'||!valid(membership.venueId))throw Error('Link this Company Club to its Field season first.');
 const venue=(await tx.get(db.doc(`leagueVenues/${membership.venueId}`))).data(),season=venue?.league?.activeSeason;
 if(!valid(season?.id)||season.status!=='active'||!season.clubIds?.includes(clubId))throw Error('This Company Club has no active Field season.');
 const scope={venueId:membership.venueId,seasonId:season.id,clubId},ref=db.doc(`leagueSeasonSquads/${grantId(scope)}`),squad=(await tx.get(ref)).data();
 return {club,venue,season,scope,ref,squad};
}
async function handle({db,user,body,uploadLogo=async()=>{throw Error('Company logo upload is unavailable.');}}){
 signed(user);const action=body.action;
 if(body.environment==='practice'||body.isPracticeMode)throw Error('Company administration is available in Official only.');
 if(['weeklyView','weeklyBooking','weeklyInvoiceView','weeklyInvoicePreview','weeklyInvoiceIssue','weeklyInvoicePaid'].includes(action))
  return require('./companyWeeklyBookings.cjs').handle({db,user,body,operator});
 if(action==='view'){
  const index=(await db.doc(`companyUserAccounts/${user.uid}`).get()).data();
  const own=operator(user)?(await db.collection('companyOrganizations').limit(30).get()).docs:await Promise.all((index?.companyIds||[]).slice(0,30).map(id=>db.doc(`companyOrganizations/${id}`).get()));
  const companies=(await Promise.all(own.map(async snap=>{const org=snap.data();if(!org||!operator(user)&&!org.participantUids?.includes(user.uid))return null;const [account,grants]=await Promise.all([db.doc(`companyFundingAccounts/${snap.id}`).get(),db.collection('companySponsorships').where('companyId','==',snap.id).limit(30).get()]);return {...org,id:snap.id,funding:{...(account.data()||{status:'pending_terms',limitMinor:0,reservedMinor:0,revision:0}),commitments:grants.docs.filter(g=>g.data().status==='active').map(g=>({id:g.id,amountMinor:g.data().amountMinor,label:g.data().label||'Field season'}))}};}))).filter(Boolean);
  const apps=await db.collection('companyApplications').where(operator(user)?'status':'applicantUid','==',operator(user)?'pending':user.uid).limit(30).get();
  return {isOperator:operator(user),companies,applications:apps.docs.map(s=>publicApplication(s.data(),s.id))};
 }
 if(action==='apply'){
  const setup=companyClubSetup(body.setup);
  if(!valid(body.requestId))throw Error('Refresh the company registration form.');
  const companyName=text(body.companyName,100),contactName=text(body.contactName,100),city=text(body.city,100),phone=text(body.phone,40);
  if(!companyName||!city||!contactName||!/^\+?[\d ()-]{7,40}$/.test(phone))throw Error('Add the company name, city, your contact name and phone.');
  const dataUrl=String(body.logoDataUrl||''),match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl),bytes=match?Buffer.from(match[1],'base64'):null;
  if(!bytes||bytes.length>4*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Upload your company logo as PNG, JPG or WebP.');
  const id=createHash('sha256').update(`${user.uid}:${body.requestId}`).digest('hex'),ref=db.doc(`companyApplications/${id}`),hash=createHash('sha256').update(JSON.stringify([companyName,city,contactName,phone,dataUrl,setup])).digest('hex');
  const old=(await ref.get()).data();if(old){if(old.requestHash!==hash)throw Error('This registration changed. Start a new request.');return {application:publicApplication(old,id)};}
  const indexRef=db.doc(`companyUserAccounts/${user.uid}`);
  if(((await indexRef.get()).data()?.pendingApplications||[]).length>=3)throw Error('FANM is already reviewing your requests. Wait before sending another.');
  const upload=await uploadLogo({bytes,uid:user.uid});let used=false;
  try{const result=await db.runTransaction(async tx=>{
   const existing=(await tx.get(ref)).data();if(existing){if(existing.requestHash!==hash)throw Error('Registration changed. Refresh.');return {application:publicApplication(existing,id)};}
   const index=(await tx.get(indexRef)).data()||{};if((index.pendingApplications||[]).length>=3)throw Error('FANM is already reviewing your requests.');
   const row={setup,companyName,city,contactName,phone,contactEmail:String(user.email||'').toLowerCase(),applicantUid:user.uid,logoUrl:upload.url,status:'pending',requestHash:hash,createdAtMs:Date.now()};tx.set(ref,row);tx.set(indexRef,{...index,pendingApplications:[...(index.pendingApplications||[]),id]});return {application:publicApplication(row,id)};
  });used=result.application.logoUrl===upload.url;return result;}finally{if(!used)await upload.remove?.();}
 }
 if(action==='reject'){
  if(!operator(user)||!/^[a-f0-9]{64}$/.test(body.applicationId||'')||!text(body.reason,400))throw Error('FANM review and a reason are required.');
  return db.runTransaction(async tx=>{const ref=db.doc(`companyApplications/${body.applicationId}`),app=(await tx.get(ref)).data();if(!app||app.status!=='pending')throw Error('This request was already reviewed.');const indexRef=db.doc(`companyUserAccounts/${app.applicantUid}`),index=(await tx.get(indexRef)).data()||{};tx.set(ref,{...app,status:'rejected',reason:text(body.reason,400),reviewedByUid:user.uid,reviewedAtMs:Date.now()});tx.set(indexRef,{...index,pendingApplications:(index.pendingApplications||[]).filter(id=>id!==body.applicationId)});return {ok:true};});
 }
 if(action==='activate'){
  if(!operator(user)||!/^[a-f0-9]{64}$/.test(body.applicationId||''))throw Error('FANM approval is required.');
  return db.runTransaction(async tx=>{
   const ref=db.doc(`companyApplications/${body.applicationId}`),app=(await tx.get(ref)).data();if(!app)throw Error('Company request unavailable.');if(app.status==='active')return {companyId:app.companyId,clubId:app.clubId};if(app.status!=='pending')throw Error('This request was already reviewed.');
   const companyId=`co_${body.applicationId.slice(0,24)}`,clubId=`company-${body.applicationId.slice(0,24)}`;
   const refs=[db.doc(`companyOrganizations/${companyId}`),db.doc(`clubs/${clubId}`),db.doc(`companyUserAccounts/${app.applicantUid}`)],existing=await tx.getAll(...refs);
   if(existing[0].exists||existing[1].exists)throw Error('Company identity already exists. Refresh.');
   const setup=companyClubSetup(app.setup);
   const now=Date.now();
   tx.set(refs[0],{name:app.companyName,logoUrl:app.logoUrl,status:'active',clubIds:[clubId],participantUids:[app.applicantUid],roles:{[app.applicantUid]:['company_admin','coordinator']},contactEmail:app.contactEmail,contactName:app.contactName,phone:app.phone,createdAtMs:now,approvedByUid:user.uid});
   tx.set(refs[1],{...setup,id:clubId,name:setup.clubName,clubType:'company',companyId,billingModel:'company',companyStatus:'active',ownerType:'company',ownerCompanyId:companyId,ownerUid:user.uid,createdByUid:user.uid,adminUids:[app.applicantUid],logoUrl:app.logoUrl,image:app.logoUrl,branding:{logoUrl:app.logoUrl},city:setup.city,locationDetails:setup.locationDetails,schedule:setup.schedule,status:'active',createdAtMs:now});
   tx.set(db.doc(`clubs/${clubId}/state/main`),{state:emptyCompanyFootballState(clubId),clubId,updatedAtMs:now});
   tx.set(db.doc(`clubs/${clubId}/members/${app.applicantUid}`),{uid:app.applicantUid,email:app.contactEmail,fullName:app.contactName,status:'active',role:'captain',companyRole:'coordinator',isPlayer:false,createdAtMs:now});
   tx.set(db.doc(`companyFundingAccounts/${companyId}`),{companyId,status:'pending_terms',currency:'ZAR',limitMinor:0,reservedMinor:0,revision:1});
   tx.set(refs[2],{...(existing[2].data()||{}),pendingApplications:(existing[2].data()?.pendingApplications||[]).filter(id=>id!==body.applicationId),companyIds:[...new Set([...(existing[2].data()?.companyIds||[]),companyId])]});tx.set(ref,{...app,status:'active',companyId,clubId,approvedAtMs:now,approvedByUid:user.uid});return {companyId,clubId};
  });
 }
 if(action==='setFunding'){
  if(!operator(user))throw Error('Only FANM can authorise company funding.');
  return db.runTransaction(async tx=>{
   const {account}=await companyContext({db,tx,user,companyId:body.companyId});
   if(account?.revision!==body.expectedRevision)throw Error('Funding changed. Refresh before saving.');
   const limitMinor=body.limitMinor,termsReference=text(body.termsReference,160);
   if(!Number.isSafeInteger(limitMinor)||limitMinor<account.reservedMinor||limitMinor>100000000||!termsReference)throw Error('Add agreed terms and an allowance covering existing commitments.');
   const next={...account,status:limitMinor>0?'active':'pending_terms',limitMinor,termsReference,revision:account.revision+1,authorisedAtMs:Date.now(),authorisedByUid:user.uid};tx.set(db.doc(`companyFundingAccounts/${body.companyId}`),next);tx.set(db.doc(`companyFundingAudit/${body.companyId}_terms_${next.revision}`),{kind:"terms",...next});return {ok:true};
  });
 }
 if(action==='revokeSeason'){
  if(!operator(user)||!/^[-A-Za-z0-9_~]{1,460}$/.test(body.grantId||'')||!text(body.reason,400))throw Error('FANM authorisation and a reason are required.');
  return db.runTransaction(async tx=>{const {account}=await companyContext({db,tx,user,companyId:body.companyId}),ref=db.doc(`companySponsorships/${body.grantId}`),grant=(await tx.get(ref)).data();if(!grant||grant.companyId!==body.companyId)throw Error('Choose this company’s commitment.');if(grant.status==='revoked')return {ok:true,unchanged:true};if(grant.status!=='active'||!Number.isSafeInteger(grant.amountMinor)||grant.amountMinor<=0||account.reservedMinor<grant.amountMinor)throw Error('This commitment needs a funding review.');const live=(await tx.get(db.doc(`leagueVenues/${grant.venueId}/seasons/${grant.seasonId}/matches/current`))).data();if(live?.status==='live'&&!live.isFinished)throw Error('Finish the live match before withdrawing season funding.');const squadRef=db.doc(`leagueSeasonSquads/${grantId(grant)}`),squad=(await tx.get(squadRef)).data();const next={...grant,status:'revoked',revision:grant.revision+1,reason:text(body.reason,400),revokedByUid:user.uid,revokedAtMs:Date.now()};tx.set(ref,next);if(squad){const entries={...squad.entries};for(const member of grant.members||[])if(entries[member.memberId]?.companyId===body.companyId)entries[member.memberId]={...entries[member.memberId],fundingStatus:"revoked"};tx.update(squadRef,{entries,updatedAt:require("firebase-admin/firestore").FieldValue.serverTimestamp()});}tx.set(db.doc(`companyFundingAccounts/${body.companyId}`),{...account,reservedMinor:account.reservedMinor-grant.amountMinor,revision:account.revision+1});tx.set(db.doc(`companyFundingAudit/${body.grantId}_${next.revision}`),next);return {ok:true};});
 }
 if(action==='seasonView'||action==='authoriseSeason')return db.runTransaction(async tx=>{
  const ctx=await seasonContext({db,tx,clubId:body.clubId}),{account}=await companyContext({db,tx,user,companyId:ctx.club.companyId});
  const entries=Object.values(ctx.squad?.entries||{}),ref=db.doc(`companySponsorships/${grantId(ctx.scope)}`),old=(await tx.get(ref)).data();
  if(action==='seasonView')return {scope:ctx.scope,companyId:ctx.club.companyId,fieldName:ctx.venue.name||'Field',seasonName:ctx.season.name||'Season',invited:entries.filter(e=>['pending','accepted'].includes(e.invitationStatus)).length,accepted:entries.filter(e=>e.invitationStatus==='accepted').length,authorised:old?.status==='active'?old.members.length:0};
  if(!operator(user))throw Error('FANM authorises the company’s season commitment.');
  if(account?.status!=='active'||!account.termsReference)throw Error('Agree company funding terms before authorising a squad.');
  if(!ctx.squad||ctx.squad.status!=='active'||entries.length>30||['venueId','seasonId','clubId'].some(k=>ctx.squad[k]!==ctx.scope[k]))throw Error('Create the official season squad first.');
  const accepted=entries.filter(e=>['pending','accepted'].includes(e.invitationStatus));if(!accepted.length)throw Error('Invite your company season squad first.');
  if(accepted.some(e=>e.paymentStatus==='paid'||e.seasonCheckoutPaymentId))throw Error('Resolve existing personal payments before company sponsorship.');
  if(accepted.some(e=>!valid(e.memberId)||!valid(e.sourcePlayerId)||!Number.isSafeInteger(e.contributionCents)||e.contributionCents<=0||e.currency!=='ZAR'))throw Error('Check the agreed season amounts and player links.');
  const members=accepted.map(e=>({memberId:e.memberId,sourcePlayerId:e.sourcePlayerId,amountMinor:e.contributionCents})),amountMinor=ctx.squad.plan?.totalCents;
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||entries.reduce((sum,e)=>sum+e.contributionCents,0)!==amountMinor)throw Error('Check the agreed company team cost.');
  const personal=await tx.getAll(...members.map(e=>db.doc(`clubs/${body.clubId}/members/${e.memberId}`)));
  const profiles=await tx.getAll(...members.map(e=>db.doc(`clubs/${body.clubId}/players/${e.sourcePlayerId}`)));
  if(profiles.some(s=>!s.exists||(s.data()?.status||'active')!=='active'))throw Error('Check active player profiles before sponsorship.');
  if(personal.some((s,i)=>s.data()?.status!=='active'||s.data()?.playerId!==members[i].sourcePlayerId))throw Error('Check active player membership before sponsorship.');
  if(old&&old.companyId!==ctx.club.companyId)throw Error('Sponsorship belongs to another company.');
  const newReserved=account.reservedMinor-(old?.status==='active'?old.amountMinor:0)+amountMinor;if(!Number.isSafeInteger(newReserved)||newReserved<0||newReserved>account.limitMinor)throw Error('This season exceeds the company’s authorised allowance.');
  const fingerprint=createHash('sha256').update(JSON.stringify(members)).digest('hex');if(old?.fingerprint===fingerprint&&old.status==='active')return {ok:true,unchanged:true};
  const now=Date.now(),grant={...ctx.scope,companyId:ctx.club.companyId,status:'active',members,amountMinor,currency:'ZAR',label:`${ctx.venue.name||'Field'} · ${ctx.season.name||'Season'}`,fingerprint,revision:(old?.revision||0)+1,authorisedByUid:user.uid,authorisedAtMs:now};
  const nextEntries={...ctx.squad.entries};for(const member of members)nextEntries[member.memberId]={...nextEntries[member.memberId],fundingType:'company',fundingStatus:'authorised',companyId:ctx.club.companyId};
  tx.set(ref,grant);tx.set(db.doc(`companyFundingAccounts/${ctx.club.companyId}`),{...account,reservedMinor:newReserved,revision:account.revision+1});tx.update(ctx.ref,{entries:nextEntries,updatedAt:require('firebase-admin/firestore').FieldValue.serverTimestamp()});tx.set(db.doc(`companyFundingAudit/${grantId(ctx.scope)}_${grant.revision}`),grant);return {ok:true,amountMinor};
 });
 throw Error('Unknown Company Club action.');
}
async function sponsoredMembers({db,tx,club,scope,squad}){
 if(club?.clubType!=='company')return new Map();
 if(!valid(club.companyId))return new Map();
 const [org,account,grant]=await tx.getAll(db.doc(`companyOrganizations/${club.companyId}`),db.doc(`companyFundingAccounts/${club.companyId}`),db.doc(`companySponsorships/${grantId(scope)}`));
 const g=grant.data(),a=account.data();if(org.data()?.status!=='active'||a?.status!=='active'||!a.termsReference||g?.status!=='active'||!Number.isSafeInteger(g.amountMinor)||g.amountMinor<=0||a.reservedMinor<g.amountMinor||g.companyId!==club.companyId||g.currency!=='ZAR'||['venueId','seasonId','clubId'].some(k=>g[k]!==scope[k]))return new Map();
 return new Map((g.members||[]).filter(m=>{const entry=squad?.entries?.[m.memberId];return entry&&entry.sourcePlayerId===m.sourcePlayerId&&entry.contributionCents===m.amountMinor&&entry.currency==='ZAR';}).map(m=>[m.memberId,m]));
}
module.exports={handle,sponsoredMembers,operator,grantId};
