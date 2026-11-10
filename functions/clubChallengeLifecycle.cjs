"use strict";

const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {getMessaging} = require("firebase-admin/messaging");
const {COLLECTION, expireExhibitionCancellations, isClubChallengeCaptain} = require("./clubChallengeService.cjs");
const {clubAudience, groupImage, registeredTokens, reliableBatch} = require("./notificationRuntime.cjs");

const region = "us-central1";
exports.expireClubChallengeCancellations = onSchedule({region, schedule: "every 1 minutes", retryCount: 3},
  () => expireExhibitionCancellations(getFirestore()));

function invitationTargets(match, now = Date.now()) {
  if (match?.status !== "pending" || !(match.kickoffMs > now)) return [];
  const acceptances = match.acceptances || {home:!match.instigated,away:false};
  return ["home","away"].filter(side => !acceptances[side] && match[side]?.id);
}

async function challengeCaptains(db, auth, clubId, club) {
  const roster = await db.collection(`clubs/${clubId}/members`).where("role","==","captain").get();
  const candidates = [
    ...[club.captainEmail,club.captain?.email,...(Array.isArray(club.captainEmails)?club.captainEmails:[])].map(email=>({email})),
    ...roster.docs.map(doc=>doc.data()).filter(member=>member.status==="active"),
  ];
  const found = await Promise.all(candidates.map(async ({uid,email}) => {
    if (!uid && !email) return null;
    let user;
    try {user=uid?await auth.getUser(uid):await auth.getUserByEmail(String(email).trim().toLowerCase());}
    catch(error) {
      if (["auth/user-not-found","auth/invalid-email","auth/invalid-uid"].includes(error.code)) return null;
      throw error;
    }
    if (user.disabled || !await isClubChallengeCaptain(db,clubId,{uid:user.uid,email:user.email,email_verified:user.emailVerified})) return null;
    return user.uid;
  }));
  return [...new Set(found.filter(Boolean))];
}

async function deliverInvitations(snapshot) {
  const original = snapshot?.data();
  if (!invitationTargets(original).length) return;
  const match = (await snapshot.ref.get()).data();
  if (!match || match.revision !== original.revision) return;
  const targets=invitationTargets(match);
  if (!targets.length) return;
  const db=getFirestore(),auth=getAuth(),messaging=getMessaging();
  const profiles=await Promise.all(["home","away"].map(async side=>{
    const {id,name,logoUrl}=match[side];
    const club=(await db.doc(`clubs/${id}`).get()).data()||{};
    const image=await groupImage({...club,id,logoUrl:club.logoUrl||logoUrl});
    return {id,name,club,image};
  }));
  for (const side of targets) {
    const own=profiles[side==="home"?0:1], opponent=profiles[side==="home"?1:0];
    const recipients=await challengeCaptains(db,auth,own.id,own.club);
    const tokenRecords=await registeredTokens(db,recipients);
    await reliableBatch({db,messaging,tokenRecords,
      title:match.instigated?"FANM exhibition invitation":"Club challenge invitation",
      body:`${own.name} vs ${opponent.name} · ${match.proposedDate} at ${match.proposedKickoff} SAST. Review and reply in FANM.`,
      imageUrl:opponent.image,data:{
        type:"club_exhibition_invitation",clubId:own.id,fixtureId:match.fixtureId,
        messageId:`${match.fixtureId}-invite-${match.revision||1}`,sourceName:own.name,groupLogoUrl:own.image,
        homeCrestUrl:profiles[0].image,awayCrestUrl:profiles[1].image,homeClubName:profiles[0].name,awayClubName:profiles[1].name,
      }});
  }
}

exports.notifyClubChallengeInvitation = onDocumentCreated({region,document:`${COLLECTION}/{fixtureId}`,retry:true},
  event=>deliverInvitations(event.data));
exports.notifyClubChallengeLifecycle = onDocumentUpdated({region, document: `${COLLECTION}/{fixtureId}`, retry: true}, async (event) => {
  const before = event.data?.before.data();
  const match = event.data?.after.data();
  if (!before || !match) return;
  if (match.status === "pending" && match.revision !== before.revision) return deliverInvitations(event.data.after);
  const type = before.status === "pending" && match.status === "accepted" ? "accepted"
    : before.status === "accepted" && match.status === "withdrawn" ? "cancelled"
    : before.status === "withdrawn" && match.status === "accepted" ? "restored"
    : before.status === "accepted" && match.status === "accepted" && before.kickoffMs !== match.kickoffMs &&
      match.postponement?.status === "agreed" ? "postponed" : "";
  if (!type) return;
  const db = getFirestore(), auth = getAuth(), messaging = getMessaging();
  const current = (await event.data.after.ref.get()).data();
  // A retry must not send an obsolete message after a newer decision.
  const at = type === "cancelled" ? match.withdrawnAtMs : type === "restored" ? match.cancellation?.restoredAtMs : type === "postponed" ? match.postponement?.decidedAtMs : match.acceptedAtMs;
  if (type !== "cancelled" && match.kickoffMs <= Date.now()) return;
  if (!at || (type === "cancelled" ? current?.withdrawnAtMs !== at || current?.status !== "withdrawn"
    : current?.status !== "accepted" || current.kickoffMs !== match.kickoffMs || (type === "restored" ? current.cancellation?.restoredAtMs !== at : type === "postponed" ? current.postponement?.decidedAtMs !== at : current.cancellation?.restoredAtMs))) return;
  const date = `${match.proposedDate} at ${match.proposedKickoff} SAST`;
  await Promise.all(["home", "away"].map(async (side) => {
    const club = match[side], opponent = match[side === "home" ? "away" : "home"];
    const title = type === "accepted" ? "Exhibition accepted" : type === "cancelled" ? "Exhibition cancelled" : type === "postponed" ? "New exhibition kickoff" : "Exhibition back on";
    const body = type === "accepted" ? `Your captain accepted the challenge with ${opponent.name} on ${date}. Go to Signups to book your spot.`
      : type === "postponed" ? `Your match against ${opponent.name} has moved to ${date}. Your booking still counts.`
      : `Your match against ${opponent.name} on ${date} is ${type === "cancelled" ? "cancelled." : "back on. Existing bookings still count."}`;
    const tokenRecords = await registeredTokens(db, await clubAudience(db, club.id, auth, true));
    await reliableBatch({db, messaging, tokenRecords, title, body, data: {
      type: `club_exhibition_${type}`, clubId: club.id, messageId: `${match.fixtureId}-${at}`,
      fixtureId: match.fixtureId, eventAtMs: at, homeCrestUrl: match.home.logoUrl, awayCrestUrl: match.away.logoUrl,
      sourceName: club.name, groupLogoUrl: club.logoUrl,
    }});
  }));
});
