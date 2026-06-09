const admin = require("firebase-admin");

const SERVICE_ACCOUNT_KEY =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/home/nc.memela/Projects/FANM_SECRETS/fanm-backup-bot.json";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "five-asides-near-me";

const clubId = process.argv[2] || "turf-kings";

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_KEY)),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function main() {
  const ref = db.collection("clubs").doc(clubId);

  const paymentSettings = {
    collectionMethod: "external",
    provider: null,
    preferredProvider: "peach",
    availableProviders: ["peach", "stripe", "paystack"],
    onboardingStatus: "not_started",
    payoutStatus: "not_enabled",
    pricingModel: {
      type: "fixed_service_fee",
      serviceFeePerPlayer: 7.5,
    },
    allowedActions: {
      canCollectExternal: true,
      canCollectOnline: false,
      canReceivePayouts: false,
      canUseFreeTrial: true,
    },
    updatedByScript: "setDefaultFanmPaymentSettings",
    updatedAtIso: new Date().toISOString(),
  };

  await ref.set(
    {
      paymentSettings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Default FANM payment settings written.");
  console.log("Club:", clubId);
  console.log(JSON.stringify(paymentSettings, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to write payment settings:", err);
    process.exit(1);
  });
