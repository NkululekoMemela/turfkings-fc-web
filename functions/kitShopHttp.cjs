const {onRequest} = require("firebase-functions/v2/https");

exports.kitShop = onRequest({region: "us-central1", cors: true}, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({error: "Use POST."});
    return;
  }
  try {
    const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    if (!bearer) {
      res.status(401).json({error: "Sign in to the shop."});
      return;
    }
    // Authenticate before loading the shop service or opening Firestore.
    const {getApps, initializeApp, getApp} = require("firebase-admin/app");
    const app = getApps().length ? getApp() : initializeApp();
    const {getAuth} = require("firebase-admin/auth");
    const user = await getAuth(app).verifyIdToken(bearer[1], true);
    const {getFirestore} = require("firebase-admin/firestore");
    const {handle} = require("./kitShop.cjs");
    res.json(await handle({db: getFirestore(app), user, body: req.body || {}}));
  } catch (error) {
    res.status(403).json({error: error.message || "Shop request failed."});
  }
});
