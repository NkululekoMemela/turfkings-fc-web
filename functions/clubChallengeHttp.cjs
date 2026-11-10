"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {getApps, getApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");
const service = require("./clubChallengeService.cjs");

const actions = Object.freeze({
  list: service.listClubChallenges,
  exhibitionOverview: service.exhibitionOverview,
  bookExhibition: service.bookExhibition,
  matchday: service.getExhibitionMatchday,
  saveLineup: service.saveExhibitionLineup,
  changeKit: service.changeExhibitionKit,
  clips: service.listExhibitionClips,
  manageExhibitionBookings: service.manageExhibitionBookings,
  revise: service.reviseClubChallenge,
  send: service.sendClubChallenge,
  instigate: service.instigateClubChallenge,
  respond: service.respondToClubChallenge,
  saveTeam: service.updateChallengeTeam,
  chat: service.challengeChat,
  operate: service.operateChallenge,
});
const statuses = {
  "invalid-argument": 400, "permission-denied": 403, "not-found": 404,
  "already-exists": 409, "failed-precondition": 409,
};

exports.clubChallengeMatch = onRequest({region: "us-central1", cors: true}, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({error: "POST is required."});
  const action = req.body?.action;
  if (action === "watch") {
    const app = getApps().length ? getApp() : initializeApp();
    try {return res.json(await service.watchExhibition({db:getFirestore(app),data:req.body?.data}));}
    catch (error) {
      if (error instanceof service.ChallengeError) return res.status(statuses[error.code] || 400).json({error:error.message});
      console.error("[Exhibition spectator]", error);
      return res.status(500).json({error:"The exhibition score is temporarily unavailable."});
    }
  }
  if (!Object.hasOwn(actions, action)) return res.status(400).json({error: "Unknown challenge action."});
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/);
  if (!bearer) return res.status(401).json({error: "Sign in to your Club account."});
  const app = getApps().length ? getApp() : initializeApp();
  let user;
  try { user = await getAuth(app).verifyIdToken(bearer[1], true); }
  catch { return res.status(401).json({error: "Sign in again."}); }
  try {
    const result = await actions[action]({db: getFirestore(app), user, data: req.body?.data});
    return res.json(result);
  } catch (error) {
    if (error instanceof service.ChallengeError) {
      return res.status(statuses[error.code] || 400).json({error: error.message});
    }
    console.error("[Club challenge]", error);
    return res.status(500).json({error: "The Club challenge service is temporarily unavailable."});
  }
});
