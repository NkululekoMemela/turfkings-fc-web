const {randomUUID} = require("node:crypto");
const ROLES = new Set(["operations_manager","referee","camera_operator","support_staff"]);
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value);
const clean = value => typeof value === "string" ? value.trim() : "";

async function manageFanmOperations({body, user, admin, db, fail}) {
  if (user.email_verified !== true || user.cameraSession ||
      clean(user.email).toLowerCase() !== "nkululekolerato@gmail.com") {
    fail("Sign in with the verified FANM director account.", 403);
  }
  const root = db.doc("fanmOperations/main");
  const stock = root.collection("bibStock");
  const staff = root.collection("staff");
  const stockConfig = root.collection("config").doc("bibs");
  const stamp = admin.firestore.FieldValue.serverTimestamp;
  const log = (tx, action, details) => tx.create(root.collection("audit").doc(randomUUID()),
    {action, details, actorUid:user.uid, at:stamp()});
  const cities=root.collection("cityBibs");
  const city=clean(body.city).replace(/\s+/g," ");
  const cityKey = value => /^[\p{L}\p{N} .'-]{2,60}$/u.test(value) ? value.toLowerCase() : "";
  const cityId=cityKey(city);
  const inventory=require("./fieldBibHire.cjs").inventory;
  const bibKey=row=>JSON.stringify([row.color,row.number]);
  function totals(rows,reservations){
    const used=new Map();
    for(const reservation of Object.values(reservations||{}))for(const row of reservation.rows){
      const key=bibKey(row);used.set(key,(used.get(key)||0)+row.quantity);
    }
    return rows.map(row=>({...row,committed:used.get(bibKey(row))||0}));
  }
  if (body.action === "operationsView") {
    const [items,people,config,cityList,fixtures,clubs] = await Promise.all([stock.get(),staff.get(),stockConfig.get(),cities.get(),
      db.collection("clubChallengeMatches").where("instigated","==",true).get(), db.collection("clubs").get()]);
    const local=cityId?cityList.docs.find(doc=>doc.id===cityId)?.data():null;
    const knownCities=new Map();
    for(const doc of clubs.docs){
      const club=doc.data();
      if(club.archived||club.deleted||club.organizationArchive?.active||["archived","deleted","draft","inactive"].includes(club.status))continue;
      const name=clean(club.locationDetails?.city||club.city).replace(/\s+/g," ");
      if(cityKey(name))knownCities.set(cityKey(name),name);
    }
    for(const doc of cityList.docs)knownCities.set(doc.id,doc.data().city);
    return {cities:[...knownCities.values()].sort((a,b)=>a.localeCompare(b)),stock:local?.stock||[],
      unassignedStock:config.data()?.stock ?? items.docs.map(doc=>{
        const {colour,number,quantity}=doc.data();return {color:colour,number,quantity};
      }), unassignedMoved:config.data()?.cityMigrationComplete===true,
      revision:local?.revision||0, confirmedAtMs:local?.confirmedAtMs||0,
      committed:totals(local?.stock||[],local?.reservations),reservations:Object.values(local?.reservations||{}),
      fixtures:fixtures.docs.flatMap(doc=>{
        const f=doc.data();return ["pending","accepted","live"].includes(f.status)?
          [{id:doc.id,label:`${f.home?.name} vs ${f.away?.name} · ${f.venue}`,city:f.fanmBibCity||""}]:[];
      }), staff:people.docs.map(doc=>doc.data())};
  }
  if (["operationsCountBibs","operationsReserveBibs","operationsReleaseBibs"].includes(body.action)) {
    if(!cityId)fail("Select or enter a stock city.");
    const ref=cities.doc(cityId);
    await db.runTransaction(async tx => {
      const local=(await tx.get(ref)).data()||{stock:[],reservations:{},revision:0};
      if (body.revision !== local.revision) fail("The inventory changed. Reload before saving.",409);
      const reservations={...(local.reservations||{})};
      let rows=local.stock;
      if(body.action==="operationsCountBibs"){
        rows=inventory(body.stock);
        if(body.moveUnassigned===true){
          const config=(await tx.get(stockConfig)).data()||{};
          if(config.cityMigrationComplete)fail("Unassigned stock has already been moved.",409);
          if(local.stock.length)fail("Move unassigned stock into a city without recorded stock.");
          tx.set(stockConfig,{cityMigrationComplete:true},{merge:true});
        }
      }else{
        const {fixtureId}=body;
        if(typeof fixtureId!=="string"||!/^[a-f0-9]{64}$/.test(fixtureId))fail("Choose a FANM fixture.");
        const fixtureRef=db.collection("clubChallengeMatches").doc(fixtureId);
        const match=(await tx.get(fixtureRef)).data();
        if(body.action==="operationsReleaseBibs"){
          if(!reservations[fixtureId])fail("This city has no reservation for that fixture.");
          delete reservations[fixtureId];
        }else{
          if(!match?.instigated||!["pending","accepted","live"].includes(match.status))fail("Choose an upcoming FANM fixture.");
          if(match.fanmBibCity&&match.fanmBibCity!==cityId)fail("Release the reservation in the other city first.");
          const reserved=inventory(body.rows).filter(row=>row.quantity>0);
          if(!reserved.length)fail("Enter at least one bib quantity.");
          reservations[fixtureId]={fixtureId,label:`${match.home?.name} vs ${match.away?.name} · ${match.venue}`,rows:reserved};
        }
        if(match)tx.update(fixtureRef,{fanmBibCity:body.action==="operationsReleaseBibs"?"":cityId});
      }
      const counted=totals(rows,reservations);
      if(counted.some(row=>row.quantity<row.committed)||
        Object.values(reservations).some(r=>r.rows.some(row=>!rows.some(s=>bibKey(s)===bibKey(row)))))
        fail("The city does not have enough stock for those commitments.",409);
      tx.set(ref,{city:local.city||city,stock:rows,reservations,revision:local.revision+1,confirmedAtMs:Date.now(),confirmedBy:user.uid});
      log(tx,body.action,{city,fixtureId:body.fixtureId||"",revision:local.revision+1});
    });
    return {};
  }
  if (body.action === "operationsAssignOfficial") {
    const {fixtureId,role,uid}=body;
    if (!/^[a-f0-9]{64}$/.test(fixtureId)||!["referee","camera_operator"].includes(role)||!validId(uid)) fail("Choose a FANM fixture and registered official.");
    const ref=db.collection("clubChallengeMatches").doc(fixtureId);
    await db.runTransaction(async tx=>{
      const [fixture,official]=await tx.getAll(ref,staff.doc(uid));
      const match=fixture.data(), person=official.data();
      if(!match?.instigated||!["pending","accepted"].includes(match.status))fail("Choose an upcoming FANM challenge.");
      if(person?.status!=="active"||person.role!==role)fail("That staff member is not active in this role.");
      const key=role==="referee"?"refereeUid":"cameraUid";
      tx.update(ref,{[`fanmOfficials.${key}`]:uid});
      log(tx,"assign_official",{fixtureId,role,uid});
    });
    return {};
  }
  if (body.action === "operationsStaff") {
    const email = clean(body.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        !ROLES.has(body.role) || !["active","inactive"].includes(body.status)) fail("Choose a staff role and a valid account email.");
    if (["referee","camera_operator"].includes(body.role) && !cityId) fail("Choose the city where this official works.");
    const account = await admin.auth().getUserByEmail(email).catch(() => null);
    if (!account?.emailVerified || account.disabled || account.uid === user.uid) fail("Choose another active, verified FANM account.");
    const ref = staff.doc(account.uid);
    await db.runTransaction(async tx => {
      tx.set(ref,{uid:account.uid,email,name:account.displayName||email,role:body.role,status:body.status,city:cityId?city:"",updatedAt:stamp()});
      log(tx,"update_staff",{uid:account.uid,role:body.role,status:body.status});
    });
    return {};
  }
  fail("Choose a valid FANM Operations action.");
}
module.exports = {manageFanmOperations};
