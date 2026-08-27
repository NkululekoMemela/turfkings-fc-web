const admin = require("firebase-admin");

const SERVICE_ACCOUNT_KEY =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  "/home/nc.memela/Projects/FANM_SECRETS/fanm-backup-bot.json";

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || "five-asides-near-me";

const CLUB_ID = "turf-kings";
const shouldApply = process.argv.includes("--apply");

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_KEY)),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function main() {
  const ref = db.collection("clubs").doc(CLUB_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error(`Club document not found: clubs/${CLUB_ID}`);
  }

  const club = snap.data() || {};
  const current = club.paymentSettings || {};
  const currentProviders = Array.isArray(current.availableProviders)
    ? current.availableProviders
    : [];

  const {
    commissionModel: _legacyCommissionModel,
    ...currentWithoutLegacyCommission
  } = current;

  const next = {
    ...currentWithoutLegacyCommission,
    collectionMethod: "platform",
    pricingModel: {
      type: "club_total",
      serviceFeePerPlayer: 0,
    },
    provider: "yoco",
    preferredProvider: "yoco",
    availableProviders: [...new Set(["yoco", ...currentProviders])],
    onboardingStatus: "active",
    allowedActions: {
      ...(current.allowedActions || {}),
      canCollectExternal: false,
      canCollectOnline: true,
    },
    updatedByScript: "enableTurfKingsYoco",
    updatedAtIso: new Date().toISOString(),
  };

  console.log("Project:", PROJECT_ID);
  console.log("Club:", CLUB_ID);
  console.log("Mode:", shouldApply ? "APPLY" : "DRY RUN");
  console.log("\nCurrent payment settings:");
  console.log(JSON.stringify(current, null, 2));
  console.log("\nProposed payment settings:");
  console.log(JSON.stringify(next, null, 2));

  if (!shouldApply) {
    console.log("\nNo live changes made. Add --apply only after review.");
    return;
  }

  await ref.set(
    {
      paymentSettings: next,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("\nTurf Kings Yoco settings applied successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });
