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
  if (body.action === "operationsView") {
    const [items, people, config] = await Promise.all([stock.get(), staff.get(), stockConfig.get()]);
    return {stock:config.data()?.stock ?? items.docs.map(doc=>{
      const {colour,number,quantity}=doc.data();
      return {color:colour,number,quantity};
    }), revision:config.data()?.revision||0, confirmedAtMs:config.data()?.confirmedAtMs||0,
      staff:people.docs.map(doc=>doc.data())};
  }
  if (body.action === "operationsCountBibs") {
    const rows = require("./fieldBibHire.cjs").inventory(body.stock);
    await db.runTransaction(async tx => {
      const revision = (await tx.get(stockConfig)).data()?.revision || 0;
      if (body.revision !== revision) fail("The inventory changed. Reload before saving.",409);
      tx.set(stockConfig,{stock:rows,revision:revision+1,confirmedAtMs:Date.now(),confirmedBy:user.uid});
      log(tx,"count_bibs",{rows:rows.length,revision:revision+1});
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
    const account = await admin.auth().getUserByEmail(email).catch(() => null);
    if (!account?.emailVerified || account.disabled || account.uid === user.uid) fail("Choose another active, verified FANM account.");
    const ref = staff.doc(account.uid);
    await db.runTransaction(async tx => {
      tx.set(ref,{uid:account.uid,email,name:account.displayName||email,role:body.role,status:body.status,updatedAt:stamp()});
      log(tx,"update_staff",{uid:account.uid,role:body.role,status:body.status});
    });
    return {};
  }
  fail("Choose a valid FANM Operations action.");
}
module.exports = {manageFanmOperations};
