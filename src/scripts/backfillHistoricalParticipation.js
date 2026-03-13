//src/scripts/backfillHistoricalParticipation.js

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

/* ------------------------------------------------------------------ */
/* CONFIG                                                             */
/* ------------------------------------------------------------------ */

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

const PARTICIPATION_OVERRIDES = {
  "2026-02-24": {
    lloyd: 3,
  },
  "2026-02-26": {
    lloyd: 3,
  },
  "2026-03-07": {
    lloyd: 3,
  },
  "2026-03-11": {
    chad: "__ONE_THIRD__",
    nabeel: "__TWO_THIRDS__",
  },
};

const NAME_ALIASES = {
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

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */

function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

function toTitleCaseLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugFromLooseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function firstNameOf(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
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

function buildMemberLookup(members = []) {
  const lookup = new Map();
  const byId = new Map();

  const add = (key, member) => {
    const k = safeLower(key);
    if (!k) return;
    if (!lookup.has(k)) lookup.set(k, member);
  };

  (Array.isArray(members) ? members : []).forEach((member) => {
    const docId = String(member?.id || "").trim();
    if (docId) byId.set(docId, member);

    const values = [
      member?.id,
      member?.memberId,
      member?.playerId,
      member?.fullName,
      member?.shortName,
      member?.displayName,
      member?.name,
      member?.playerName,
      member?.email,
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);

    values.forEach((v) => {
      add(v, member);
      add(toTitleCaseLoose(v), member);
      add(slugFromLooseName(v), member);

      const first = firstNameOf(v);
      if (first) add(first, member);
    });

    const aliases = Array.isArray(member?.aliases) ? member.aliases : [];
    aliases.forEach((alias) => {
      const v = String(alias || "").trim();
      if (!v) return;
      add(v, member);
      add(toTitleCaseLoose(v), member);
      add(slugFromLooseName(v), member);

      const first = firstNameOf(v);
      if (first) add(first, member);
    });
  });

  return { lookup, byId };
}

function resolveMemberByAnyName(raw, memberMaps) {
  const { lookup, byId } = memberMaps;
  const original = String(raw || "").trim();
  if (!original) return null;

  const aliasApplied = NAME_ALIASES[safeLower(original)] || original;
  const pretty = toTitleCaseLoose(aliasApplied);
  const prettyLower = safeLower(pretty);

  // Hard fix: NK / Nkululeko Memela must always resolve to docId "nkululeko"
  if (prettyLower === "nkululeko memela" || prettyLower === "nk") {
    const exact = byId.get("nkululeko");
    if (exact) return exact;
  }

  const exactCandidates = [
    safeLower(pretty),
    safeLower(aliasApplied),
    safeLower(slugFromLooseName(pretty)),
  ].filter(Boolean);

  for (const c of exactCandidates) {
    const hit = lookup.get(c);
    if (hit) return hit;
  }

  const first = firstNameOf(pretty);
  if (first && safeLower(first) !== "nkululeko") {
    const hit = lookup.get(safeLower(first));
    if (hit) return hit;
  }

  return null;
}

function countTeamMatches(results = []) {
  const counts = {};
  (Array.isArray(results) ? results : []).forEach((r) => {
    if (r?.teamAId) counts[r.teamAId] = (counts[r.teamAId] || 0) + 1;
    if (r?.teamBId) counts[r.teamBId] = (counts[r.teamBId] || 0) + 1;
  });
  return counts;
}

function computeExpectedFullMatches(teamMatches, squadSize) {
  const matches = Number(teamMatches || 0);
  const size = Number(squadSize || 0);

  if (matches <= 0) return 0;
  if (size <= 5) return matches;

  return Math.round((matches * 5) / size);
}

function buildSeasonTeamLookup(teams = []) {
  const byLabel = new Map();
  const byId = new Map();

  (Array.isArray(teams) ? teams : []).forEach((team) => {
    if (team?.id) byId.set(team.id, team);

    const label = String(team?.label || "").trim();
    if (label) {
      byLabel.set(safeLower(label), team);
      byLabel.set(safeLower(label.replace(/\s+/g, "")), team);
    }
  });

  return { byLabel, byId };
}

function resolveSeasonTeamByLabel(rawLabel, byLabel) {
  const direct = safeLower(rawLabel);
  const compact = safeLower(String(rawLabel || "").replace(/\s+/g, ""));
  return byLabel.get(direct) || byLabel.get(compact) || null;
}

function normalizePlayerEntry(rawEntry, memberMaps) {
  const rawName = extractRawName(rawEntry);
  const matched = resolveMemberByAnyName(rawName, memberMaps);

  const playerId = matched
    ? String(
        matched.id || matched.memberId || matched.playerId || slugFromLooseName(rawName)
      ).trim()
    : slugFromLooseName(rawName);

  const playerName = matched
    ? toTitleCaseLoose(
        matched.fullName ||
          matched.displayName ||
          matched.shortName ||
          matched.name ||
          matched.playerName ||
          rawName
      )
    : toTitleCaseLoose(rawName);

  const shortName = matched
    ? toTitleCaseLoose(
        matched.shortName ||
          matched.name ||
          matched.displayName ||
          matched.fullName ||
          rawName
      )
    : toTitleCaseLoose(firstNameOf(rawName) || rawName);

  return {
    playerId,
    playerName,
    shortName,
  };
}

function dedupePlayers(players = []) {
  const seen = new Set();
  const out = [];

  (Array.isArray(players) ? players : []).forEach((p) => {
    const key = safeLower(p?.playerId || p?.playerName || "");
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  });

  return out;
}

function buildRebuiltTeamsForDay(dayId, seasonTeams, memberMaps) {
  const manual = HISTORICAL_DAY_SQUADS[dayId];
  if (!manual) return null;

  const { byLabel } = buildSeasonTeamLookup(seasonTeams);

  return Object.entries(manual).map(([label, rawPlayers]) => {
    const seasonTeam = resolveSeasonTeamByLabel(label, byLabel) || {};

    const normalizedPlayers = dedupePlayers(
      (rawPlayers || []).map((rawName) =>
        normalizePlayerEntry(rawName, memberMaps)
      )
    );

    return {
      id: seasonTeam.id || label,
      label: seasonTeam.label || label,
      players: normalizedPlayers,
      captain: seasonTeam.captain || "",
      captainId: seasonTeam.captainId || null,
      slot: seasonTeam.slot ?? null,
    };
  });
}

function buildFallbackTeamsFromSeason(seasonTeams, memberMaps) {
  return (Array.isArray(seasonTeams) ? seasonTeams : []).map((team) => {
    const rawPlayers = Array.isArray(team?.players) ? team.players : [];

    const players = dedupePlayers(
      rawPlayers.map((entry) => normalizePlayerEntry(entry, memberMaps))
    );

    return {
      id: team?.id || "",
      label: team?.label || team?.id || "",
      players,
      captain: team?.captain || "",
      captainId: team?.captainId || null,
      slot: team?.slot ?? null,
    };
  });
}

function buildPlayerAppearancesForDay(day, rebuiltTeams) {
  const results = Array.isArray(day?.results) ? day.results : [];
  const matchCounts = countTeamMatches(results);

  const out = [];

  (Array.isArray(rebuiltTeams) ? rebuiltTeams : []).forEach((team) => {
    const teamId = team?.id || "";
    if (!teamId) return;

    const teamName = team?.label || teamId;
    const players = Array.isArray(team?.players) ? team.players : [];
    const squadSize = players.length;
    const teamMatches = Number(matchCounts[teamId] || 0);
    const expectedFullMatches = computeExpectedFullMatches(
      teamMatches,
      squadSize
    );

    players.forEach((player) => {
      out.push({
        playerId: player.playerId,
        playerName: player.playerName,
        shortName: player.shortName || player.playerName,
        teamId,
        teamName,
        squadSize,
        teamMatches,
        expectedFullMatches,
        matchesPlayed: expectedFullMatches,
        source: "historical_rebuild_default",
      });
    });
  });

  return out;
}

function applyOverridesToAppearances(dayId, appearances, memberMaps) {
  const overrides = PARTICIPATION_OVERRIDES[dayId];
  if (!overrides) return appearances;

  return appearances.map((entry) => {
    let overrideValue = null;

    Object.entries(overrides).forEach(([rawKey, matchesPlayed]) => {
      const matched = resolveMemberByAnyName(rawKey, memberMaps);

      const candidateKeys = new Set([
        safeLower(rawKey),
        safeLower(NAME_ALIASES[safeLower(rawKey)] || ""),
        matched ? safeLower(matched.id || matched.playerId || matched.memberId) : "",
        matched ? safeLower(matched.shortName) : "",
        matched ? safeLower(matched.fullName) : "",
        matched ? safeLower(matched.name) : "",
      ]);

      const isThisPlayer =
        candidateKeys.has(safeLower(entry?.playerId)) ||
        candidateKeys.has(safeLower(entry?.shortName)) ||
        candidateKeys.has(safeLower(entry?.playerName));

      if (!isThisPlayer) return;

      const teamMatches = Number(entry.teamMatches || 0);

      if (matchesPlayed === "__ONE_THIRD__") {
        overrideValue = Math.round(teamMatches / 3);
      } else if (matchesPlayed === "__TWO_THIRDS__") {
        overrideValue = Math.round((2 * teamMatches) / 3);
      } else {
        overrideValue = Number(matchesPlayed);
      }
    });

    if (overrideValue == null) return entry;

    const capped = Math.max(
      0,
      Math.min(Number(entry.teamMatches || 0), overrideValue)
    );

    return {
      ...entry,
      matchesPlayed: capped,
      source: "historical_manual_correction",
      updatedAtISO: new Date().toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* MAIN                                                               */
/* ------------------------------------------------------------------ */

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
  const activeSeasonId = state.activeSeasonId || null;

  const targetSeason =
    seasons.find((s) => s?.seasonId === activeSeasonId) || seasons[0] || null;

  if (!targetSeason) {
    console.log("❌ No season found");
    return;
  }

  const history = Array.isArray(targetSeason.matchDayHistory)
    ? targetSeason.matchDayHistory
    : [];
  const seasonTeams = Array.isArray(targetSeason.teams)
    ? targetSeason.teams
    : [];

  const playersSnap = await db.collection("players").get();
  const members = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const memberMaps = buildMemberLookup(members);

  console.log("✅ Loaded season:", targetSeason.seasonId || "(unknown)");
  console.log("Historical days:", history.length);

  let changedDays = 0;

  const nextHistory = history.map((day) => {
    const dayId = String(day?.id || "").trim();

    const hasManualSquad = !!HISTORICAL_DAY_SQUADS[dayId];
    const hasOverride = !!PARTICIPATION_OVERRIDES[dayId];

    if (!hasManualSquad && !hasOverride) return day;

    const rebuiltTeams =
      buildRebuiltTeamsForDay(dayId, seasonTeams, memberMaps) ||
      buildFallbackTeamsFromSeason(seasonTeams, memberMaps);

    const rebuiltAppearances = buildPlayerAppearancesForDay(day, rebuiltTeams);
    const finalAppearances = applyOverridesToAppearances(
      dayId,
      rebuiltAppearances,
      memberMaps
    );

    changedDays += 1;
    console.log(
      `✏️ Rebuilt ${dayId} -> teams=${rebuiltTeams.length}, playerAppearances=${finalAppearances.length}`
    );

    return {
      ...day,
      teams: rebuiltTeams,
      playerAppearances: finalAppearances,
    };
  });

  if (changedDays === 0) {
    console.log("ℹ️ No matching historical days found to rebuild.");
    return;
  }

  const nextSeasons = seasons.map((season) => {
    if (season?.seasonId !== targetSeason.seasonId) return season;

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

  console.log("✅ Historical participation rebuilt and saved.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});