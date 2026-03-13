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

const HISTORICAL_DAY_SQUADS = {
  "2026-02-24": {
    "Man U": ["Dayaan", "Chad", "Maanda", "Theo", "Lloyd"],
    PSG: ["Nkululeko Memela", "Barlo", "Taku", "Akhona", "Josh"],
    Madrid: ["Zizou", "Dr Babs", "Mdu", "Dayton", "Enoch"],
  },
  "2026-02-26": {
    "Man U": ["Dayaan", "Chad", "Maanda", "Theo", "Lloyd", "Nabeel"],
    PSG: ["Nkululeko Memela", "Barlo", "Taku", "Akhona", "Josh"],
    Madrid: ["Nkumbuzo", "Dr Babs", "Mdu", "Dayton", "Enoch", "Junaid"],
  },
  "2026-03-07": {
    "Man U": ["Dayaan", "Chad", "Maanda", "Junaid", "Nabeel", "Jason"],
    PSG: ["Nkululeko Memela", "Barlo", "Taku", "Akhona", "Josh", "Likhanye"],
    Madrid: ["Zizou", "Dr Babs", "Mdu", "Dayton", "Enoch", "Scott"],
  },
  "2026-03-11": {
    "Man U": ["Dayaan", "Chad", "Maanda", "Junaid", "Nabeel", "Jason"],
    PSG: ["Nkululeko Memela", "Barlo", "Taku", "Akhona", "Josh", "Likhanye"],
    Madrid: ["Zizou", "Dr Babs", "Mdu", "Dayton", "Enoch", "Scott"],
  },
};

const RAW_ALIAS_HINTS = {
  nk: "nkululeko memela",
  "n.k": "nkululeko memela",
  "nkululeko memela": "nkululeko memela",
  "dr babs": "dr babs",
  drbabs: "dr babs",
  dr_babs: "dr babs",
  mdu: "mdu",
  zizou: "zizou",
  dayton: "dayton",
  enoch: "enoch",
  josh: "josh",
  chad: "chad",
  maanda: "maanda",
  theo: "theo",
  lloyd: "lloyd",
  barlo: "barlo",
  taku: "taku",
  akhona: "akhona",
  nabeel: "nabeel",
  junaid: "junaid",
  dayaan: "dayaan",
  nkumbuzo: "nkumbuzo",
  scott: "scott",
  jason: "jason",
  likhanye: "likhanye",
};

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

function slugFromName(name) {
  return toTitleCase(name)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
}

function normLoose(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function buildIdentityStrings(playerDoc) {
  const id = String(playerDoc.id || "").trim();
  const name = toTitleCase(playerDoc.name || "");
  const fullName = toTitleCase(playerDoc.fullName || "");
  const shortName = toTitleCase(playerDoc.shortName || "");

  const aliasesArr = Array.isArray(playerDoc.aliases) ? playerDoc.aliases : [];
  const aliases = aliasesArr.map((a) => toTitleCase(a));

  const strings = [id, name, fullName, shortName, ...aliases].filter(Boolean);

  const expanded = new Set();

  strings.forEach((s) => {
    expanded.add(safeLower(s));
    expanded.add(slugFromName(s));
    expanded.add(normLoose(s));

    const fn = safeLower(firstNameOf(s));
    if (fn) expanded.add(fn);
  });

  return Array.from(expanded);
}

function makeResolver(players) {
  const lookup = {};
  const byId = {};

  players.forEach((p) => {
    const canon = toTitleCase(
      p.fullName || p.shortName || p.name || p.id || ""
    );
    if (!canon) return;

    if (p.id) byId[p.id] = canon;

    const keys = buildIdentityStrings(p);
    keys.forEach((k) => {
      if (!k) return;
      if (!lookup[k]) lookup[k] = canon;
    });
  });

  function resolveName(raw) {
    const original = String(raw || "").trim();
    if (!original) return "";

    const hinted = RAW_ALIAS_HINTS[normLoose(original)] || original;
    const tc = toTitleCase(hinted);
    const tcLower = safeLower(tc);

    // Hard protection so NK/Nkululeko Memela never resolves to the wrong Nkululeko
    if (tcLower === "nkululeko memela" || tcLower === "nk") {
      return byId["nkululeko"] || "Nkululeko Memela";
    }

    const candidates = [
      safeLower(tc),
      slugFromName(tc),
      normLoose(tc),
    ].filter(Boolean);

    for (const c of candidates) {
      if (lookup[c]) return lookup[c];
    }

    const first = safeLower(firstNameOf(tc));
    if (first && first !== "nkululeko") {
      if (lookup[first]) return lookup[first];
    }

    return tc;
  }

  return { resolveName };
}

function ensurePlayer(stats, name) {
  if (!stats[name]) {
    stats[name] = {
      name,
      teamIds: new Set(),
      teamLabels: new Set(),
      gamesPlayed: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      gkCleanSheets: 0,
      defCleanSheets: 0,
      points: 0,
      matchDaysPresentSet: new Set(),
    };
  }
  return stats[name];
}

function buildManualTeamsForDay(dayId, seasonTeams, resolveCanonicalName) {
  const manual = HISTORICAL_DAY_SQUADS[dayId];
  if (!manual) return null;

  const seasonTeamByLabel = {};
  (seasonTeams || []).forEach((t) => {
    if (t?.label) {
      seasonTeamByLabel[t.label] = t;
    }
  });

  return Object.entries(manual).map(([label, rawPlayers]) => {
    const seasonTeam = seasonTeamByLabel[label] || {};
    return {
      id: seasonTeam.id || label,
      label,
      players: (rawPlayers || []).map((name) => resolveCanonicalName(name)),
    };
  });
}

function addAppearance({
  stats,
  appearanceSeen,
  playerName,
  dayId,
  matchNo,
  teamId = "",
  teamLabel = "",
  increment = 1,
}) {
  if (!playerName) return;

  const key =
    matchNo == null
      ? `${dayId}|saved|${safeLower(playerName)}`
      : `${dayId}|${matchNo}|${safeLower(playerName)}`;

  if (appearanceSeen.has(key)) return;
  appearanceSeen.add(key);

  const p = ensurePlayer(stats, playerName);
  p.gamesPlayed += Number(increment || 0);
  p.matchDaysPresentSet.add(dayId);

  if (teamId) p.teamIds.add(teamId);
  if (teamLabel) p.teamLabels.add(teamLabel);
}

async function main() {
  const docRef = db.collection("appState_v2").doc("main");
  const snap = await docRef.get();

  if (!snap.exists) {
    console.log("❌ appState_v2/main does not exist");
    return;
  }

  const data = snap.data() || {};
  const state = data.state || {};

  const activeSeasonId = state.activeSeasonId || null;
  const seasons = Array.isArray(state.seasons) ? state.seasons : [];

  console.log("✅ appState_v2/main found");
  console.log("activeSeasonId:", activeSeasonId);
  console.log("season count:", seasons.length);

  const targetSeason =
    seasons.find((s) => s?.seasonId === activeSeasonId) || seasons[0] || null;

  if (!targetSeason) {
    console.log("❌ No season found to inspect");
    return;
  }

  console.log("\n==============================");
  console.log("Inspecting season:", targetSeason.seasonId || "(unknown)");
  console.log("Season no:", targetSeason.seasonNo ?? null);
  console.log("==============================\n");

  const playersSnap = await db.collection("players").get();
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const { resolveName: resolveCanonicalName } = makeResolver(players);

  const stats = {};
  const unresolvedEventNames = new Set();

  const history = Array.isArray(targetSeason.matchDayHistory)
    ? targetSeason.matchDayHistory
    : [];

  const seasonTeams = Array.isArray(targetSeason.teams)
    ? targetSeason.teams
    : [];

  history.forEach((day, dayIndex) => {
    const dayId = day?.id || `day-${dayIndex + 1}`;
    const results = Array.isArray(day?.results) ? day.results : [];
    const events = Array.isArray(day?.allEvents) ? day.allEvents : [];
    const savedAppearances = Array.isArray(day?.playerAppearances)
      ? day.playerAppearances
      : [];

    console.log(
      `--- ${dayId} ---\nresults=${results.length}, events=${events.length}, savedAppearances=${savedAppearances.length}`
    );

    const teamsForDay =
      (Array.isArray(day?.teams) && day.teams.length > 0
        ? day.teams
        : buildManualTeamsForDay(dayId, seasonTeams, resolveCanonicalName)) ||
      seasonTeams;

    const teamsById = {};
    teamsForDay.forEach((t) => {
      if (!t?.id) return;
      teamsById[t.id] = {
        ...t,
        players: Array.isArray(t.players)
          ? t.players.map((raw) => resolveCanonicalName(extractRawName(raw)))
          : [],
      };
    });

    const appearanceSeen = new Set();

    savedAppearances.forEach((entry) => {
      const canon = resolveCanonicalName(
        extractRawName(entry) ||
          entry?.playerName ||
          entry?.shortName ||
          entry?.playerId ||
          ""
      );
      if (!canon) return;

      addAppearance({
        stats,
        appearanceSeen,
        playerName: canon,
        dayId,
        matchNo: null,
        teamId: entry?.teamId || "",
        teamLabel: entry?.teamName || "",
        increment: Number(entry?.matchesPlayed || 0),
      });
    });

    const eventsByMatchNo = {};
    events.forEach((e) => {
      const m = e?.matchNo;
      if (m == null) return;
      if (!eventsByMatchNo[m]) eventsByMatchNo[m] = [];
      eventsByMatchNo[m].push(e);
    });

    results.forEach((r) => {
      const matchNo = r?.matchNo;
      const participatingTeamIds = [r?.teamAId, r?.teamBId].filter(Boolean);

      participatingTeamIds.forEach((teamId) => {
        const team = teamsById[teamId];
        if (!team) return;

        const teamPlayers = Array.isArray(team.players) ? team.players : [];
        teamPlayers.forEach((canonPlayer) => {
          const savedKey = `${dayId}|saved|${safeLower(canonPlayer)}`;
          if (appearanceSeen.has(savedKey)) return;

          addAppearance({
            stats,
            appearanceSeen,
            playerName: canonPlayer,
            dayId,
            matchNo,
            teamId,
            teamLabel: team.label || teamId,
            increment: 1,
          });
        });
      });

      const matchEvents = eventsByMatchNo[matchNo] || [];
      matchEvents.forEach((e) => {
        const rawNames = [e?.scorer, e?.assist, e?.playerName].filter(Boolean);

        rawNames.forEach((rawName) => {
          const canon = resolveCanonicalName(rawName);
          if (!canon) {
            unresolvedEventNames.add(String(rawName));
            return;
          }

          const savedKey = `${dayId}|saved|${safeLower(canon)}`;
          if (appearanceSeen.has(savedKey)) return;

          const eventTeamId = e?.teamId || "";
          const eventTeam = eventTeamId ? teamsById[eventTeamId] : null;

          addAppearance({
            stats,
            appearanceSeen,
            playerName: canon,
            dayId,
            matchNo,
            teamId: eventTeamId,
            teamLabel: eventTeam?.label || "",
            increment: 1,
          });
        });
      });
    });

    events.forEach((e) => {
      if (!e) return;

      if (e.type === "goal" && e.scorer) {
        const scorer = resolveCanonicalName(e.scorer);
        if (scorer) {
          const p = ensurePlayer(stats, scorer);
          p.goals += 1;

          if (e.teamId) {
            const eventTeam = teamsById[e.teamId];
            p.teamIds.add(e.teamId);
            if (eventTeam?.label) p.teamLabels.add(eventTeam.label);
          }
        } else {
          unresolvedEventNames.add(String(e.scorer));
        }
      }

      if (e.assist) {
        const assister = resolveCanonicalName(e.assist);
        if (assister) {
          const p = ensurePlayer(stats, assister);
          p.assists += 1;

          if (e.teamId) {
            const eventTeam = teamsById[e.teamId];
            p.teamIds.add(e.teamId);
            if (eventTeam?.label) p.teamLabels.add(eventTeam.label);
          }
        } else {
          unresolvedEventNames.add(String(e.assist));
        }
      }

      if (e.type === "clean_sheet") {
        const holder = resolveCanonicalName(e.playerName || e.scorer || "");
        if (holder) {
          const p = ensurePlayer(stats, holder);
          p.cleanSheets += 1;
          if (e.role === "gk") p.gkCleanSheets += 1;
          if (e.role === "def") p.defCleanSheets += 1;

          if (e.teamId) {
            const eventTeam = teamsById[e.teamId];
            p.teamIds.add(e.teamId);
            if (eventTeam?.label) p.teamLabels.add(eventTeam.label);
          }
        } else {
          unresolvedEventNames.add(String(e.playerName || e.scorer || ""));
        }
      }
    });
  });

  const rows = Object.values(stats).map((p) => {
    p.points = p.goals + p.assists + p.defCleanSheets + p.gkCleanSheets;

    const gp = p.gamesPlayed || 0;

    return {
      player: p.name,
      team: Array.from(p.teamLabels).join(", "),
      matchDaysPresent: p.matchDaysPresentSet.size,
      gamesPlayed: p.gamesPlayed,
      goals: p.goals,
      assists: p.assists,
      gkCleanSheets: p.gkCleanSheets,
      defCleanSheets: p.defCleanSheets,
      points: p.points,
      goalsPerGame: Number((gp > 0 ? p.goals / gp : 0).toFixed(3)),
      assistsPerGame: Number((gp > 0 ? p.assists / gp : 0).toFixed(3)),
      gkCsPerGame: Number((gp > 0 ? p.gkCleanSheets / gp : 0).toFixed(3)),
      defCsPerGame: Number((gp > 0 ? p.defCleanSheets / gp : 0).toFixed(3)),
      pointsPerGame: Number((gp > 0 ? p.points / gp : 0).toFixed(3)),
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.player.localeCompare(b.player);
  });

  console.log("\n===== PLAYER APPEARANCE INSPECTION =====\n");
  console.table(rows);

  console.log("\nTop 10 by points per game:\n");
  const byFormish = [...rows]
    .filter((r) => r.gamesPlayed > 0)
    .sort((a, b) => {
      if (b.pointsPerGame !== a.pointsPerGame) {
        return b.pointsPerGame - a.pointsPerGame;
      }
      if (b.points !== a.points) return b.points - a.points;
      return a.player.localeCompare(b.player);
    })
    .slice(0, 10);

  console.table(byFormish);

  if (unresolvedEventNames.size > 0) {
    console.log("\nUnresolved raw event names:");
    console.table(
      Array.from(unresolvedEventNames)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ rawName: name }))
    );
  }

  console.log("\n✅ Read-only inspection complete. No writes made.");
}

main().catch((err) => {
  console.error("Inspection failed:", err);
  process.exit(1);
});