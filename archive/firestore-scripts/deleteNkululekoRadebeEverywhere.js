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

const BAD_KEYS = new Set([
  "freedom",
  "nkululeko radebe",
  "nkululekor",
]);

function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

function isBadName(v) {
  return BAD_KEYS.has(safeLower(v));
}

function extractRawName(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  return (
    entry.playerId ||
    entry.memberId ||
    entry.id ||
    entry.fullName ||
    entry.shortName ||
    entry.displayName ||
    entry.name ||
    entry.playerName ||
    ""
  );
}

async function deleteBadPlayerDocs() {
  const playersSnap = await db.collection("players").get();

  const docsToDelete = playersSnap.docs.filter((docSnap) => {
    const data = docSnap.data() || {};

    return (
      isBadName(docSnap.id) ||
      isBadName(data.fullName) ||
      isBadName(data.shortName) ||
      isBadName(data.displayName) ||
      isBadName(data.name) ||
      isBadName(data.playerName)
    );
  });

  if (docsToDelete.length === 0) {
    console.log("No bad player docs found in players collection.");
    return 0;
  }

  console.log("The following player docs will be deleted:");
  console.table(
    docsToDelete.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        docId: docSnap.id,
        fullName: data.fullName || "",
        shortName: data.shortName || "",
        displayName: data.displayName || "",
        name: data.name || "",
        playerName: data.playerName || "",
      };
    })
  );

  const batch = db.batch();
  docsToDelete.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();

  return docsToDelete.length;
}

async function cleanupAppState() {
  const appRef = db.collection("appState_v2").doc("main");
  const snap = await appRef.get();

  if (!snap.exists) {
    console.log("❌ appState_v2/main does not exist");
    return null;
  }

  const data = snap.data() || {};
  const state = data.state || {};
  const seasons = Array.isArray(state.seasons) ? state.seasons : [];

  let touchedDays = 0;
  let removedAppearances = 0;
  let removedTeamPlayers = 0;
  let nulledScorers = 0;
  let nulledAssists = 0;
  let nulledPlayerNames = 0;

  const nextSeasons = seasons.map((season) => {
    const history = Array.isArray(season?.matchDayHistory)
      ? season.matchDayHistory
      : [];

    const nextHistory = history.map((day) => {
      let changed = false;

      const oldAppearances = Array.isArray(day?.playerAppearances)
        ? day.playerAppearances
        : [];

      const newAppearances = oldAppearances.filter((entry) => {
        const bad =
          isBadName(entry?.playerName) ||
          isBadName(entry?.shortName) ||
          isBadName(entry?.playerId);

        if (bad) {
          removedAppearances += 1;
          changed = true;
          return false;
        }
        return true;
      });

      const oldTeams = Array.isArray(day?.teams) ? day.teams : [];
      const newTeams = oldTeams.map((team) => {
        const oldPlayers = Array.isArray(team?.players) ? team.players : [];

        const newPlayers = oldPlayers.filter((entry) => {
          const raw = extractRawName(entry);
          const bad = isBadName(raw);
          if (bad) {
            removedTeamPlayers += 1;
            changed = true;
            return false;
          }
          return true;
        });

        return {
          ...team,
          players: newPlayers,
        };
      });

      const oldEvents = Array.isArray(day?.allEvents) ? day.allEvents : [];
      const newEvents = oldEvents.map((evt) => {
        const nextEvt = { ...evt };

        if (isBadName(nextEvt?.scorer)) {
          nextEvt.scorer = null;
          nulledScorers += 1;
          changed = true;
        }

        if (isBadName(nextEvt?.assist)) {
          nextEvt.assist = null;
          nulledAssists += 1;
          changed = true;
        }

        if (isBadName(nextEvt?.playerName)) {
          nextEvt.playerName = null;
          nulledPlayerNames += 1;
          changed = true;
        }

        return nextEvt;
      });

      if (changed) {
        touchedDays += 1;
      }

      return {
        ...day,
        teams: newTeams,
        playerAppearances: newAppearances,
        allEvents: newEvents,
      };
    });

    return {
      ...season,
      matchDayHistory: nextHistory,
      updatedAt: new Date().toISOString(),
    };
  });

  await appRef.set(
    {
      ...data,
      state: {
        ...state,
        seasons: nextSeasons,
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );

  return {
    touchedDays,
    removedAppearances,
    removedTeamPlayers,
    nulledScorers,
    nulledAssists,
    nulledPlayerNames,
  };
}

async function main() {
  const cleanupStats = await cleanupAppState();

  if (!cleanupStats) return;

  const deletedPlayerDocs = await deleteBadPlayerDocs();

  console.log("✅ Cleanup complete.");
  console.log("Touched match days:", cleanupStats.touchedDays);
  console.log("Removed playerAppearances:", cleanupStats.removedAppearances);
  console.log("Removed team player entries:", cleanupStats.removedTeamPlayers);
  console.log("Nulled scorers:", cleanupStats.nulledScorers);
  console.log("Nulled assists:", cleanupStats.nulledAssists);
  console.log("Nulled playerNames:", cleanupStats.nulledPlayerNames);
  console.log("Deleted player docs:", deletedPlayerDocs);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});