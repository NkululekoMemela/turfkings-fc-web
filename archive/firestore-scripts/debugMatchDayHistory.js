//debugMatchDayHistory.js

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

async function main() {
  const docRef = db.collection("appState_v2").doc("main");
  const snap = await docRef.get();

  if (!snap.exists) {
    console.log("❌ appState_v2/main does not exist");
    return;
  }

  const data = snap.data() || {};
  const state = data.state || {};

  console.log("✅ appState_v2/main found");
  console.log("schemaVersion:", data.schemaVersion ?? null);
  console.log("activeSeasonId:", state.activeSeasonId || null);

  const seasons = Array.isArray(state.seasons) ? state.seasons : [];
  console.log("season count:", seasons.length);

  seasons.forEach((season, idx) => {
    const history = Array.isArray(season?.matchDayHistory)
      ? season.matchDayHistory
      : [];

    const results = Array.isArray(season?.results) ? season.results : [];
    const teams = Array.isArray(season?.teams) ? season.teams : [];

    console.log(`\n--- season ${idx + 1} ---`);
    console.log("seasonId:", season?.seasonId || null);
    console.log("seasonNo:", season?.seasonNo || null);
    console.log("teams length:", teams.length);
    console.log("season results length:", results.length);
    console.log("matchDayHistory length:", history.length);

    history.forEach((day, i) => {
      console.log(
        `  [${i}] id=${day?.id || null} createdAt=${day?.createdAt || null} results=${Array.isArray(day?.results) ? day.results.length : 0} events=${Array.isArray(day?.allEvents) ? day.allEvents.length : 0}`
      );
    });
  });
}

main().catch((err) => {
  console.error("Debug failed:", err);
  process.exit(1);
});