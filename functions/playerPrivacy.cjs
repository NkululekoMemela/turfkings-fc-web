const {FieldValue} = require("firebase-admin/firestore");
const fields = {
  members: ["fullName", "shortName", "name", "playerName", "playerId", "role", "status", "photoData", "photoUrl", "profilePhotoUrl", "jerseyNumber", "ownsNumberedBib", "bibColor", "ownsHomeShirt", "ownsAwayShirt", "additionalBibs", "homeShirtColor", "awayShirtColor", "profileNameAliases", "createdAt", "joinedAt", "joinedAtMs"],
  players: ["fullName", "shortName", "name", "displayName", "playerName", "sourceMemberId", "aliases", "profileNameAliases", "status", "roles", "mentality", "shooting", "photoUrl", "photoData", "jerseyNumber", "ownsNumberedBib", "bibColor", "ownsHomeShirt", "ownsAwayShirt", "additionalBibs", "homeShirtColor", "awayShirtColor"],
  playerPhotos: ["name", "fullName", "shortName", "sourceMemberId", "status", "photoData"],
  pendingSignups: ["activeSeasonId","seasonAtSignupTime","signupType","signupScopeId","signupScopeLabel","monthLabel","monthKey","payerName","payerShortName","payerUserId","userId","playerId","playerName","shortName","displayName","beneficiaryType","beneficiaryPlayerId","beneficiaryName","beneficiaryShortName","beneficiaryStableKey","selectedWeeks","primaryPaidWeeks","paidWeeks","unpaidWeeks","weeksToPayNow","selectedEventDetails","paymentStatus","amountDue","amountPaid","totalAmount","amountDueNow","amountPaidTotal","costPerGame","eventPrices","paymentForMode","paymentMethod","paymentReference","createdAt","updatedAt","isUnpaid","status"],
  matchSignups: [],
};
fields.matchSignups = fields.pendingSignups;
const publicCollection = {members:"publicMembers", players:"publicPlayers", playerPhotos:"publicPlayerPhotos",pendingSignups:"publicPendingSignups",matchSignups:"publicMatchSignups"};
function publicId(id) {return id.includes("@")?require("node:crypto").createHash("sha256").update(id).digest("hex"):id;}
function projection(kind, data = {}) {
  const result=Object.fromEntries(fields[kind].filter(key => data[key] !== undefined).map(key => [key, data[key]]));
  // Old signup IDs sometimes used email addresses. Never copy them into a public view.
  if(kind.endsWith("Signups"))for(const key of ["payerUserId","userId","playerId","beneficiaryPlayerId","beneficiaryStableKey"])if(typeof result[key]==="string" && result[key].includes("@"))delete result[key];
  return result;
}
function owns(data, user) {
  if (!data || !user?.uid || user.email_verified !== true || user.cameraSession === true) return false;
  return data.uid ? data.uid === user.uid : Boolean(user.email && String(data.email || "").toLowerCase() === user.email.toLowerCase());
}
function adminOf(club, user) {
  if (!club || !user?.uid || user.cameraSession === true || user.email_verified !== true) return false;
  return [club.ownerUid, club.createdByUid, ...(club.adminUids || [])].includes(user.uid) ||
    (club.adminEmails || []).some(email => String(email).toLowerCase() === String(user.email || "").toLowerCase());
}
function id(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.length > 150) throw new Error("Choose a valid club or player.");
  return value;
}
function profileFingerprint(member = {}) {
  return JSON.stringify(["fullName", "shortName", "email", "whatsappNumber", "phoneNumber", "photoData", "photoUrl", "jerseyNumber", "playerId", "ownsNumberedBib", "bibColor", "ownsHomeShirt", "ownsAwayShirt", "additionalBibs", "homeShirtColor", "awayShirtColor", "profileNameAliases"].map(key => member[key] ?? null));
}
async function ownMemberships(db, user, clubId = "") {
  if (!user?.uid || user.email_verified !== true || user.cameraSession === true) throw new Error("Sign in with your verified Google account.");
  const root = clubId ? db.collection(`clubs/${id(clubId)}/members`) : db.collectionGroup("members");
  const uidSnapshot=await root.where("uid", "==", user.uid).limit(100).get();
  const ownedByUid=uidSnapshot.docs.filter(item=>
    /^clubs\/[^/]+\/members\/[^/]+$/.test(item.ref.path) && owns(item.data(),user));
  if(clubId && ownedByUid.length)return ownedByUid;
  const snapshots=[uidSnapshot];
  if(user.email)snapshots.push(await root.where("email", "==", user.email).limit(100).get());
  const unique = new Map();
  for (const snap of snapshots) for (const item of snap.docs) {
    if (/^clubs\/[^/]+\/members\/[^/]+$/.test(item.ref.path) && owns(item.data(), user)) unique.set(item.ref.path, item);
  }
  return [...unique.values()];
}
async function projectDocument(db, kind, reference) {
  // Reread the current document in a transaction: out-of-order triggers cannot restore stale data.
  await db.runTransaction(async tx => {
    const current = await tx.get(reference);
    const target = reference.parent.parent.collection(publicCollection[kind]).doc(publicId(reference.id));
    if (current.exists) tx.set(target, projection(kind, current.data())); else tx.delete(target);
  });
}
async function prepareClub(db, clubId) {
  if((await db.doc(`playerPrivacyMigrations/${id(clubId)}`).get()).data()?.version===1)return;
  for (const kind of Object.keys(fields)) {
    let after = null;
    for (;;) {
      let query = db.collection(`clubs/${id(clubId)}/${kind}`).orderBy("__name__").limit(150);
      if (after) query = query.startAfter(after);
      const snap = await query.get();
      // Transactions also protect projection backfill against concurrent profile edits.
      await Promise.all(snap.docs.map(item => projectDocument(db, kind, item.ref)));
      if (snap.size < 150) break;
      after = snap.docs[snap.docs.length - 1];
    }
  }
  await db.doc(`playerPrivacyMigrations/${clubId}`).set({version:1, completedAt:FieldValue.serverTimestamp()});
}
async function handle({db, user, body}) {
  const action = body.action;
  if (action === "memberships") {
    const docs = await ownMemberships(db, user, body.clubId || "");
    return {members: docs.map(item => ({path:item.ref.path, id:item.id, clubId:item.ref.parent.parent.id, data:item.data()}))};
  }
  const clubId = id(body.clubId);
  if(action==="signup")return require("./privateSignup.cjs").save({db,user,body});
  if (action === "prepare") {
    const club = (await db.doc(`clubs/${clubId}`).get()).data();
    if (!adminOf(club, user)) throw new Error("Only the club administrator can prepare private profiles.");
    await prepareClub(db, clubId); return {ok:true};
  }
  const memberId = id(body.memberId);
  const memberRef = db.doc(`clubs/${clubId}/members/${memberId}`);
  if(action==="bind")return db.runTransaction(async tx=>{
    const [memberSnap,clubSnap]=await tx.getAll(memberRef,db.doc(`clubs/${clubId}`));
    const member=memberSnap.data(),isOwner=owns(member,user);
    if(!member || (!isOwner && !adminOf(clubSnap.data(),user)))throw new Error("This membership does not belong to your signed-in account.");
    const playerId=id(member.playerId || String(member.shortName || member.fullName || "").trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""));
    const playerRef=db.doc(`clubs/${clubId}/players/${playerId}`),current=(await tx.get(playerRef)).data() || {};
    if(current.sourceMemberId && current.sourceMemberId!==memberId)throw new Error("Ask admin to correct the player link.");
    if(current.platformIdentityUid && member.uid && current.platformIdentityUid!==member.uid){
      const email=value=>String(value || "").trim().toLowerCase();
      const confirmedLegacyLink=isOwner && member.uid===user.uid
        && member.playerId===playerId
        && email(member.email)===email(user.email)
        && email(current.email)===email(user.email)
        && (!current.uid || current.uid===user.uid)
        && (!current.sourceMemberId || current.sourceMemberId===memberId);
      if(!confirmedLegacyLink)throw new Error("The player record belongs to a different account.");
    }
    if(!member.playerId && Object.keys(current).length && !current.sourceMemberId && String(current.email || "").toLowerCase()!==String(member.email || "").toLowerCase())throw new Error("Ask admin to link this existing player record.");
    const next={...current,name:member.shortName || member.fullName || "Player",fullName:member.fullName || member.displayName || member.name || member.shortName || "Player",shortName:member.shortName || member.fullName || "Player",email:member.email || "",sourceMemberId:memberId,status:member.status || "active",platformIdentityUid:member.uid || (isOwner?user.uid:""),whatsappNumber:member.whatsappNumber || "",phoneNumber:member.phoneNumber || member.whatsappNumber || "",photoUrl:member.photoUrl || current.photoUrl || "",jerseyNumber:member.jerseyNumber ?? current.jerseyNumber ?? null,ownsNumberedBib:member.ownsNumberedBib ?? current.ownsNumberedBib ?? false,bibColor:member.bibColor || current.bibColor || "",roles:{...current.roles,player:true,captain:member.role==="captain",coach:member.role==="coach",admin:member.role==="admin"},updatedAt:FieldValue.serverTimestamp()};
    if(current.platformIdentityUid && current.platformIdentityUid!==next.platformIdentityUid){
      next.previousPlatformIdentityUid=current.platformIdentityUid;
      next.identityLinkRepairedAt=FieldValue.serverTimestamp();
      next.identityLinkRepairedByUid=user.uid;
    }
    const membership={playerId,...(isOwner&&!member.uid?{uid:user.uid}:{})};
    tx.update(memberRef,membership);tx.set(playerRef,next);
    tx.set(db.doc(`clubs/${clubId}/publicMembers/${memberId}`),projection("members",{...member,...membership}));
    tx.set(db.doc(`clubs/${clubId}/publicPlayers/${playerId}`),projection("players",next));
    return {playerId};
  });
  if (action === "load") {
    const snapshot = await memberRef.get(), member = snapshot.data();
    if (!owns(member, user)) throw new Error("This profile does not belong to your signed-in account.");
    const portrait = member.playerId ? await db.doc(`clubs/${clubId}/playerPhotos/${id(member.playerId)}`).get() : null;
    return {member:{...member,id:memberId,displayPhoto:portrait?.data()?.photoData || member.photoData || member.photoUrl || ""}};
  }
  if (action !== "save") throw new Error("Unknown profile operation.");
  const draft = body.draft || {};
  const clean = value => String(value ?? "").trim();
  const fullName = clean(draft.fullName), shortName = clean(draft.shortName);
  const phone = clean(draft.whatsappNumber);
  const raw = clean(draft.jerseyNumber);
  if (!fullName || fullName.length > 100 || !shortName || shortName.length > 60) throw new Error("Enter a valid player name.");
  if (phone && !/^\+?[\d ()-]{7,25}$/.test(phone)) throw new Error("Enter a valid WhatsApp number.");
  if (raw && !/^\d{1,3}$/.test(raw)) throw new Error("Use a jersey number from 0 to 999, or leave it blank.");
  const jerseyNumber = raw ? Number(raw) : null;
  const ownsNumberedBib = draft.ownsNumberedBib === true || draft.ownsNumberedBib === "yes";
  const bibColor = ownsNumberedBib ? clean(draft.bibColor) : "";
  if (ownsNumberedBib && (jerseyNumber === null || !bibColor || bibColor.length > 40)) throw new Error("Enter your bib number and colour.");
  const ownsHomeShirt=draft.ownsHomeShirt===true||draft.ownsHomeShirt==="yes",ownsAwayShirt=draft.ownsAwayShirt===true||draft.ownsAwayShirt==="yes";
  if(draft.additionalBibs!==undefined&&!Array.isArray(draft.additionalBibs))throw new Error("Choose up to two numbered bibs.");
  const additionalBibs=Array.isArray(draft.additionalBibs)?draft.additionalBibs:[];
  const requestedHomeShirtColor=clean(draft.homeShirtColor),requestedAwayShirtColor=clean(draft.awayShirtColor);
  if([requestedHomeShirtColor,requestedAwayShirtColor].some(value=>value&&!/^#[0-9a-f]{6}$/i.test(value)))throw new Error("Choose a valid jersey colour.");
  if(additionalBibs.length&&!ownsNumberedBib)throw new Error("Choose the number of bibs you own first.");
  if(additionalBibs.length && jerseyNumber===null)throw new Error("Set your reserved number before adding numbered bibs.");
  if(additionalBibs.length>1||additionalBibs.some(color=>typeof color!=="string"||!/^#[0-9a-f]{6}$/i.test(color)))throw new Error("A player can have at most two numbered bibs. Choose their colours.");
  const photo = body.photoData || "";
  if (photo && (typeof photo !== "string" || photo.length > 450000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo))) throw new Error("Choose a valid prepared portrait.");
  return db.runTransaction(async tx => {
    const currentSnap = await tx.get(memberRef), current = currentSnap.data();
    const club=(await tx.get(db.doc(`clubs/${clubId}`))).data()||{};
    const homeShirtColor=club.homeColor||"",awayShirtColor=club.awayColor||"";
    const allowedColours=[homeShirtColor,awayShirtColor].filter(Boolean).map(value=>String(value).toLowerCase());
    const bibColoursChanged=bibColor!==String(current?.bibColor||"") || JSON.stringify(additionalBibs)!==JSON.stringify(current?.additionalBibs||[]);
    if(ownsNumberedBib&&allowedColours.length===2&&bibColoursChanged&&[bibColor,...additionalBibs].some(value=>!allowedColours.includes(String(value).toLowerCase())))throw new Error("Choose Home or Away club colour for your bib. Ask your captain to set the club colours first.");


    if (!owns(current, user) || ["withdrawn", "deleted", "rejected"].includes(current.status)) throw new Error("Sign in as this player before editing.");
    if (body.fingerprint !== profileFingerprint(current)) throw new Error("Your profile changed elsewhere. Reopen it before saving.");
    const playerId = id(current.playerId || clean(current.shortName || current.fullName).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
    const playerRef = db.doc(`clubs/${clubId}/players/${playerId}`), photoRef = db.doc(`clubs/${clubId}/playerPhotos/${playerId}`);
    const [playerSnap, photoSnap] = await tx.getAll(playerRef, photoRef);
    const player = playerSnap.data() || {};
    if (player.sourceMemberId && player.sourceMemberId !== memberId) throw new Error("Ask admin to correct your player link.");
    if (!current.playerId && playerSnap.exists && player.sourceMemberId !== memberId && String(player.email || "").toLowerCase() !== String(user.email).toLowerCase()) throw new Error("Ask admin to link your existing player record.");
    const profileNameAliases = [...new Set([...(current.profileNameAliases || []), current.fullName, current.shortName].map(clean).filter(name => name && name !== fullName && name !== shortName))].slice(-20);
    const claim=await require("./clubNumbers.cjs").readClaim(tx,db,clubId,memberId,jerseyNumber,require("./clubNumbers.cjs").number(current.jerseyNumber));
    if(jerseyNumber!==require("./clubNumbers.cjs").number(current.jerseyNumber))throw new Error("Request a number from your captain/admin, or a voluntary transfer from its holder. Profile edits cannot allocate numbers.");
    const common = {fullName, shortName, jerseyNumber, ownsNumberedBib, bibColor, ownsHomeShirt, ownsAwayShirt, additionalBibs, homeShirtColor, awayShirtColor, profileNameAliases};
    const patch = {...common, uid:user.uid, email:user.email, whatsappNumber:phone, phoneNumber:phone, playerId, updatedAt:FieldValue.serverTimestamp(), profileUpdatedAt:FieldValue.serverTimestamp(), profileUpdatedByUid:user.uid, profileUpdatedByRole:"player"};
    if (photo) {patch.photoData = photo; patch.photoUrl = photo;}
    const portrait = photo || photoSnap.data()?.photoData || current.photoData || current.photoUrl || player.photoUrl || "";
    const nextPlayer = {...player,...common,name:shortName,email:user.email,sourceMemberId:memberId,photoUrl:portrait,aliases:[...new Set([...(player.aliases || []),...profileNameAliases])].slice(-50)};
    require("./clubNumbers.cjs").writeClaim(tx,db,clubId,memberId,claim);
    tx.update(memberRef, patch); tx.set(playerRef, nextPlayer);
    tx.set(db.doc(`clubs/${clubId}/publicMembers/${memberId}`), projection("members", {...current,...patch}));
    tx.set(db.doc(`clubs/${clubId}/publicPlayers/${playerId}`), projection("players", nextPlayer));
    if (portrait) {
      const nextPhoto = {name:fullName,shortName,email:user.email,sourceMemberId:memberId,role:current.role || "player",status:current.status || "active",photoData:portrait,updatedAt:FieldValue.serverTimestamp()};
      tx.set(photoRef,nextPhoto,{merge:true});
      tx.set(db.doc(`clubs/${clubId}/publicPlayerPhotos/${playerId}`),projection("playerPhotos",nextPhoto));
    }
    return {ok:true};
  });
}
module.exports = {publicId,projection, owns, adminOf, profileFingerprint, ownMemberships, projectDocument, prepareClub, handle, publicCollection};
