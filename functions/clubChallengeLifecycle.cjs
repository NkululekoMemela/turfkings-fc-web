"use strict";

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {getMessaging} = require("firebase-admin/messaging");
const {COLLECTION, expireExhibitionCancellations} = require("./clubChallengeService.cjs");
const {clubAudience, registeredTokens, reliableBatch} = require("./notificationRuntime.cjs");

const region = "us-central1";
exports.expireClubChallengeCancellations = onSchedule({region, schedule: "every 1 minutes", retryCount: 3},
  () => expireExhibitionCancellations(getFirestore()));

exports.notifyClubChallengeLifecycle = onDocumentUpdated({region, document: `${COLLECTION}/{fixtureId}`, retry: true}, async (event) => {
  const before = event.data?.before.data();
  const match = event.data?.after.data();
  if (!before || !match) return;
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
