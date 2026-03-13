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
  const serviceAccountPath = path.resolve(
    process.cwd(),
    "serviceAccountKey.json"
  );
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

async function main() {
  const appRef = db.collection("appState_v2").doc("main");
  const snap = await appRef.get();

  if (!snap.exists) {
    console.log("❌ appState_v2/main does not exist");
    return;
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

      // 1. remove from playerAppearances
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

      // 2. remove from teams.players
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

      // 3. null/remove from allEvents
      const oldEvents = Array.isArray(day?.allEvents) ? day.allEvents : [];
      const newEvents = oldEvents.map((evt) => {
        let nextEvt = { ...evt };

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

  console.log("✅ Cleanup complete.");
  console.log("Touched match days:", touchedDays);
  console.log("Removed playerAppearances:", removedAppearances);
  console.log("Removed team player entries:", removedTeamPlayers);
  console.log("Nulled scorers:", nulledScorers);
  console.log("Nulled assists:", nulledAssists);
  console.log("Nulled playerNames:", nulledPlayerNames);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});