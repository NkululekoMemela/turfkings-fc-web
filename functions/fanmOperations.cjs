const {randomUUID} = require("node:crypto");
const {canonicalVideoPath} = require("./highlightRetentionPolicy.cjs");
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
  const stamp = admin.firestore.FieldValue.serverTimestamp;
  const log = (tx, action, details) => tx.create(root.collection("audit").doc(randomUUID()),
    {action, details, actorUid:user.uid, at:stamp()});
  if (body.action === "operationsView") {
    const [items, people] = await Promise.all([stock.get(), staff.get()]);
    return {stock:items.docs.map(doc=>doc.data()), staff:people.docs.map(doc=>doc.data())};
  }
  if (body.action === "operationsCountBibs") {
    const colour = clean(body.colour).toLowerCase();
    const {number, quantity} = body;
    if (!/^[a-z]{2,24}$/.test(colour) || !Number.isInteger(number) || number < 1 || number > 99 ||
        !Number.isInteger(quantity) || quantity < 0 || quantity > 999) fail("Enter a colour, bib number (1–99) and count (0–999).");
    const ref = stock.doc(`${colour}-${number}`);
    await db.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data()?.quantity ?? null;
      tx.set(ref,{colour,number,quantity,updatedAt:stamp()});
      log(tx,"count_bibs",{colour,number,previous,quantity});
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
  if (body.action === "operationsDeleteVideo") {
    const {kind, ownerId, matchId, clipId} = body;
    const reason = clean(body.reason);
    if (!["club","field"].includes(kind) || ![ownerId,matchId,clipId].every(validId) ||
        body.confirmation !== `DELETE ${clipId}` || reason.length < 10 || reason.length > 500) {
      fail("Enter the exact video reference, confirmation and audit reason.");
    }
    const match = db.doc(`${kind==="field"?"leagueVenues":"clubs"}/${ownerId}/video_highlights/${matchId}`);
    const refs = ["raw","archived","cleanup_queue"].map(name => match.collection(name).doc(clipId));
    const copies = (await Promise.all(refs.slice(0,2).map(ref=>ref.get()))).filter(snap=>snap.exists);
    if (!copies.length) fail("No video with that exact reference was found.", 404);
    const bucket = admin.storage().bucket();
    const paths = copies.map(snap=>{
      const clip = snap.data();
      if (clip.storagePath) return clip.storagePath;
      try {
        const url = new URL(clip.mediaUrl || clip.videoUrl || clip.downloadUrl || "");
        const location = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
        return url.origin === "https://firebasestorage.googleapis.com" && location?.[1] === bucket.name
          ? decodeURIComponent(location[2]) : "";
      } catch {return "";}
    });
    if (paths.some(path=>!canonicalVideoPath(path,{kind,ownerId,matchId}))) fail("The stored file does not match this video. The records were kept.", 409);
    await Promise.all([...new Set(paths)].map(path=>bucket.file(path).delete({ignoreNotFound:true})));
    const batch = db.batch();
    refs.forEach(ref=>batch.delete(ref));
    log(batch,"delete_video",{kind,ownerId,matchId,clipId,reason});
    await batch.commit();
    return {deleted:true};
  }
  fail("Choose a valid FANM Operations action.");
}
module.exports = {manageFanmOperations};
