const crypto = require("node:crypto");
const clean = (value, max=100) => String(value || "").trim().slice(0,max);
function scheduleFromDraft(draft, fail) {
  const timezone=clean(draft.timezone,60)||"Africa/Johannesburg";
  try {new Intl.DateTimeFormat("en",{timeZone:timezone});} catch {fail("Choose a valid timezone.");}
  const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const operatingHours={},groups=[];
  for(const day of days) {
    const value=draft.operatingHours?.[day] || {},status=value.status || "";
    if(!status) continue;
    if(!["open","closed","24h"].includes(status)) fail(`Choose valid operating hours for ${day}.`);
    let label=status==="closed" ? "Closed" : "24 hours";
    operatingHours[day]={status};
    if(status==="open") {
      const opens=clean(value.opens,5),closes=clean(value.closes,5);
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(opens) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closes)) fail(`Set opening and closing times for ${day}.`);
      if(opens===closes) fail(`Choose different opening and closing times for ${day}, or select Open 24 hours.`);
      operatingHours[day]={status,opens,closes};
      label=`${opens}–${closes}${closes<opens ? " (+1 day)" : ""}`;
    }
    const previous=groups[groups.length-1];
    if(previous && previous.label===label && previous.lastIndex===days.indexOf(day)-1) {previous.last=day;previous.lastIndex=days.indexOf(day);}
    else groups.push({first:day,last:day,label,lastIndex:days.indexOf(day)});
  }
  const operatingHoursSummary=groups.map(group=>`${group.first.slice(0,3)}${group.last!==group.first ? `–${group.last.slice(0,3)}` : ""} ${group.label}`).join(" · ");
  return {operatingHours,operatingHoursSummary,timezone};
}
async function updateFieldProfile({body,user,admin,db,fail,replenish}) {
  const id=clean(body.venueId,150);
  if(!/^[a-zA-Z0-9_-]+$/.test(id)) fail("Choose a valid Field.");
  const ref=db.doc(`leagueVenues/${id}`),initial=await ref.get();
  const authorized=venue=>venue && (venue.ownerUid===user.uid || venue.createdByUid===user.uid || (venue.adminUids || []).includes(user.uid) || user.email_verified===true && String(user.email || "").toLowerCase()==="nkululekolerato@gmail.com");
  if(!initial.exists || !authorized(initial.data())) fail("Only an authorized Field administrator can edit this Field.",403);
  if(initial.data().deleted===true) fail("This Field was deleted.",409);
  const draft=body.draft || {},name=clean(draft.clubName || draft.name),city=clean(draft.city);
  if(!name || !city) fail("Field name and city are required.");
  const timing=scheduleFromDraft(draft,fail);
  let websiteUrl;
  if(draft.websiteUrl !== undefined) {
    const website=clean(draft.websiteUrl,500);
    websiteUrl="";
    if(website) {try {
      const url=new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
      if(!["https:","http:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) throw new Error("website");
      websiteUrl=url.href;
    } catch {fail("Enter a valid Field website address.");}}
  }
  const catalog=await import("./fieldLogoDesigns.mjs");
  const logo=body.logo || {};
  let spec=catalog.validSpec(logo.spec) ? logo.spec : catalog.stockSpec(0),stockRef;
  if(!logo.unchanged && logo.stockId) {
    if(!/^design-\d{4}$/.test(logo.stockId)) fail("Choose a stock design again.");
    stockRef=db.doc(`fieldLogoStock/${logo.stockId}`);
    const stock=await stockRef.get();
    if(!stock.exists || stock.data().status!=="available") fail("That stock design was just claimed. Choose another.",409);
    spec={...stock.data().spec,palette:spec.palette,nameStyle:spec.nameStyle || "auto",lettering:spec.lettering || "full",shortName:spec.shortName || ""};
  }
  let uploaded;
  try {
    let branding,logoUrl;
    if(!logo.unchanged) {
      let bytes,contentType,ext;
      if(logo.uploadDataUrl) {
        const match=/^data:image\/png;base64,([a-zA-Z0-9+/=]+)$/.exec(logo.uploadDataUrl);
        if(!match) fail("Choose the logo image again.");
        bytes=Buffer.from(match[1],"base64");
        if(bytes.length>4*1024*1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail("The logo image is invalid or too large.");
        contentType="image/png";ext="png";
      } else {bytes=Buffer.from(catalog.renderFieldLogo(spec,name));contentType="image/svg+xml";ext="svg";}
      const token=crypto.randomUUID();uploaded=admin.storage().bucket().file(`leagueVenues/${id}/branding/${token}.${ext}`);
      await uploaded.save(bytes,{resumable:false,metadata:{contentType,metadata:{firebaseStorageDownloadTokens:token}}});
      logoUrl=`https://firebasestorage.googleapis.com/v0/b/${uploaded.bucket.name}/o/${encodeURIComponent(uploaded.name)}?alt=media&token=${token}`;
      branding={logoUrl,accent:catalog.PALETTES[spec.palette][1],spec,stockId:stockRef ? logo.stockId : "",logoSource:logo.uploadDataUrl ? "uploaded_file" : stockRef ? "exclusive_stock" : "local_designer"};
    }
    const result=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),existing=snap.data();
      if(!snap.exists || !authorized(existing)) fail("Field editing permission changed.",403);
      if(existing.deleted===true) fail("This Field was deleted.",409);
      let pool;
      if(stockRef) {
        const stock=await tx.get(stockRef);
        if(!stock.exists || stock.data().status!=="available") fail("That stock design was just claimed. Choose another.",409);
        pool=await replenish(tx,db,catalog,logo.stockId);
      }
      const patch={name,...timing,schedule:{...(existing.schedule || {}),...timing},
        location:{...(existing.location || {}),city,suburb:clean(draft.suburb),address:clean(draft.address,300),province:clean(draft.province),country:clean(draft.country)||"South Africa"},
        updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedByUid:user.uid};
      if(websiteUrl !== undefined) patch.websiteUrl=websiteUrl;
      if(branding) {patch.branding={...(existing.branding || {}),...branding};patch.logoUrl=logoUrl;patch.image=logoUrl;}
      if(body.bankingDraft) {
        patch.banking={...(existing.banking || {})};
        for(const key of ["bankName","accountHolder","accountNumber","branchCode","paymentReference","normalMatchFee"]) patch.banking[key]=clean(body.bankingDraft[key],150);
      }
      tx.update(ref,patch);
      if(stockRef) {tx.update(stockRef,{status:"claimed",venueId:id,claimedByUid:user.uid,claimedAt:admin.firestore.FieldValue.serverTimestamp()});pool.apply();}
      return {id,...existing,...patch};
    });
    uploaded=null;
    return result;
  } finally {if(uploaded) await uploaded.delete().catch(()=>{});}
}
module.exports={updateFieldProfile,scheduleFromDraft};
