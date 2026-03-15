import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envFile =
  process.env.FIREBASE_ENV === "staging" ? ".env.staging" : ".env.production";

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

console.log(`🔥 Firebase env file: ${envFile}`);
console.log(
  `🔥 Project ID: ${process.env.VITE_FIREBASE_PROJECT_ID || "(missing)"}`
);

if (!admin.apps.length) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(process.env.HOME, ".config/turfkings/keys/turfkings-serviceAccountKey.json");
  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

async function main() {
  const snap = await db.collection("players").get();
  const rows = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};

    const fields = [
      doc.id,
      data.fullName,
      data.shortName,
      data.displayName,
      data.name,
      data.playerName,
      ...(Array.isArray(data.aliases) ? data.aliases : []),
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    const joined = fields.join(" | ").toLowerCase();

    if (joined.includes("nkululeko") || joined.includes("nk")) {
      rows.push({
        docId: doc.id,
        fullName: data.fullName || "",
        shortName: data.shortName || "",
        displayName: data.displayName || "",
        name: data.name || "",
        playerName: data.playerName || "",
        aliases: Array.isArray(data.aliases) ? data.aliases.join(", ") : "",
      });
    }
  });

  if (!rows.length) {
    console.log("No Nkululeko-like player docs found.");
    return;
  }

  console.table(rows);
}

main().catch((err) => {
  console.error("Debug failed:", err);
  process.exit(1);
});