const {onRequest} = require("firebase-functions/v2/https");
const {getApps, getApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");

exports.announceFieldPracticeSeason = onRequest({region:"us-central1", cors:true}, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({error:"POST is required."});
  const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!bearer) return res.status(401).json({error:"Sign in first."});
  const app = getApps().length ? getApp() : initializeApp();
  let user;
  try { user = await getAuth(app).verifyIdToken(bearer[1], true); }
  catch { return res.status(401).json({error:"Sign in again."}); }
  if (user.cameraSession || user.firebase?.sign_in_provider === "anonymous") {
    return res.status(403).json({error:"Use your Field account."});
  }
  try {
    const result = await require("./fieldPracticeInvitations").announce({
      db:getFirestore(app), user, venueId:req.body?.venueId,
      sessionId:req.body?.sessionId, settings:req.body?.settings,
    });
    return res.status(200).json({ok:true, ...result});
  } catch (error) {
    console.error("[Field Practice invitation]", error);
    return res.status(400).json({ok:false, error:error.message || "Practice invitation failed."});
  }
});
