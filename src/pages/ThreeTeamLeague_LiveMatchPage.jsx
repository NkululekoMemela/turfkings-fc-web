// src/pages/ThreeTeamLeague_LiveMatchPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FANM_NATIONAL_TEAMS,
  FANM_PRO_CLUBS,
} from "../data/fanm/fanmTeamLibrary.js";
import { getTeamById } from "../core/teams.js";
import { db } from "../firebaseConfig.js";
import {
  getMatchDoc,
  getPlayerPhotosCollection,
} from "../core/clubFirestorePaths";
import {
  doc,
  updateDoc,
  setDoc,
  arrayUnion,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";
import {
  FORMATIONS_5,
  DEFAULT_FORMATION_ID_5,
  loadSavedLineups,
  resolvePreferredTeamLineup,
  createVerifiedLineupSnapshot,
  isGuestPlayerInSnapshot,
  toTitleCaseLoose,
  uniqueNames,
} from "../core/lineups.js";
import {
  GAME_FORMAT,
  getGameFormatConfig,
  normalizeGameFormat,
} from "../core/matchConfig.js";

const CAPTAIN_PASSWORDS = ["11", "22", "3333"];
const MATCH_DOC_ID = "current";
const SOUND_URL = `${import.meta.env.BASE_URL}alarm.mp4`;
const PLAYERS_COLLECTION = "players";


const GAME_TYPE_6 = "6_aside";
const GAME_TYPE_7 = "7_aside";
const DEFAULT_FORMATION_ID_6 = "6_2_2_1";
const DEFAULT_FORMATION_ID_7 = "7_3_2_1";

const FORMATIONS_6 = {
  "6_2_2_1": {
    id: "6_2_2_1",
    label: "2-2-1",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 34, y: 68 },
      { id: "def_r", label: "DEF", x: 66, y: 68 },
      { id: "mid_l", label: "MID", x: 35, y: 43 },
      { id: "mid_r", label: "MID", x: 65, y: 43 },
      { id: "fwd", label: "ST", x: 50, y: 20 },
    ],
  },
  "6_1_3_1": {
    id: "6_1_3_1",
    label: "1-3-1",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def", label: "DEF", x: 50, y: 68 },
      { id: "mid_l", label: "MID", x: 28, y: 45 },
      { id: "mid_c", label: "MID", x: 50, y: 42 },
      { id: "mid_r", label: "MID", x: 72, y: 45 },
      { id: "fwd", label: "ST", x: 50, y: 20 },
    ],
  },
  "6_2_1_2": {
    id: "6_2_1_2",
    label: "2-1-2",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 35, y: 68 },
      { id: "def_r", label: "DEF", x: 65, y: 68 },
      { id: "mid", label: "MID", x: 50, y: 45 },
      { id: "fwd_l", label: "ST", x: 35, y: 20 },
      { id: "fwd_r", label: "ST", x: 65, y: 20 },
    ],
  },
};

const FORMATIONS_7 = {
  "7_3_2_1": {
    id: "7_3_2_1",
    label: "3-2-1",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 28, y: 68 },
      { id: "def_c", label: "DEF", x: 50, y: 72 },
      { id: "def_r", label: "DEF", x: 72, y: 68 },
      { id: "mid_l", label: "MID", x: 36, y: 43 },
      { id: "mid_r", label: "MID", x: 64, y: 43 },
      { id: "fwd", label: "ST", x: 50, y: 20 },
    ],
  },
  "7_2_3_1": {
    id: "7_2_3_1",
    label: "2-3-1",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 35, y: 68 },
      { id: "def_r", label: "DEF", x: 65, y: 68 },
      { id: "mid_l", label: "MID", x: 28, y: 43 },
      { id: "mid_c", label: "MID", x: 50, y: 40 },
      { id: "mid_r", label: "MID", x: 72, y: 43 },
      { id: "fwd", label: "ST", x: 50, y: 18 },
    ],
  },
  "7_2_2_2": {
    id: "7_2_2_2",
    label: "2-2-2",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 35, y: 68 },
      { id: "def_r", label: "DEF", x: 65, y: 68 },
      { id: "mid_l", label: "MID", x: 35, y: 43 },
      { id: "mid_r", label: "MID", x: 65, y: 43 },
      { id: "fwd_l", label: "ST", x: 35, y: 18 },
      { id: "fwd_r", label: "ST", x: 65, y: 18 },
    ],
  },
};

function getLineupGameTypeFromFormat(rawFormat) {
  const safeFormat = normalizeGameFormat(rawFormat, GAME_FORMAT.FIVE_V_FIVE);
  if (safeFormat === GAME_FORMAT.SEVEN_V_SEVEN) return GAME_TYPE_7;
  if (safeFormat === GAME_FORMAT.SIX_V_SIX) return GAME_TYPE_6;
  return "5";
}

function getLiveFormationsMap(rawFormat) {
  const safeFormat = normalizeGameFormat(rawFormat, GAME_FORMAT.FIVE_V_FIVE);
  if (safeFormat === GAME_FORMAT.SEVEN_V_SEVEN) return FORMATIONS_7;
  if (safeFormat === GAME_FORMAT.SIX_V_SIX) return FORMATIONS_6;
  return FORMATIONS_5;
}

function getLiveDefaultFormationId(rawFormat) {
  const safeFormat = normalizeGameFormat(rawFormat, GAME_FORMAT.FIVE_V_FIVE);
  if (safeFormat === GAME_FORMAT.SEVEN_V_SEVEN) return DEFAULT_FORMATION_ID_7;
  if (safeFormat === GAME_FORMAT.SIX_V_SIX) return DEFAULT_FORMATION_ID_6;
  return DEFAULT_FORMATION_ID_5;
}

const matchEndSound =
  typeof Audio !== "undefined" ? new Audio(SOUND_URL) : null;

if (matchEndSound) {
  matchEndSound.preload = "auto";
  matchEndSound.loop = false;
  matchEndSound.volume = 1;
}

function normKey(x) {
  return String(x || "").trim().toLowerCase();
}

function slugFromLooseName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
}

function stopAlarmLoop(alarmLoopRef) {
  if (alarmLoopRef.current) {
    clearInterval(alarmLoopRef.current);
    alarmLoopRef.current = null;
  }
  if (matchEndSound) {
    try {
      matchEndSound.pause();
      matchEndSound.currentTime = 0;
    } catch (_) {
      // ignore
    }
  }
}

function getShortName(label) {
  if (!label) return "";
  const map = {

    Madrid: "MAD",

  };
  if (map[label]) return map[label];

  const cleaned = String(label).replace(/team/gi, "").trim();
  if (!cleaned) return String(label || "");
  return cleaned.slice(0, 3).toUpperCase();
}

function getIdentityDisplayName(identity) {
  return (
    identity?.shortName ||
    identity?.fullName ||
    identity?.displayName ||
    identity?.name ||
    identity?.email ||
    "viewer"
  );
}

function buildPlayerResolver(players = []) {
  const byAny = new Map();
  const firstNameCounts = new Map();

  const addKey = (set, value) => {
    const raw = String(value || "").trim();
    if (!raw) return;

    const pretty = toTitleCaseLoose(raw);

    set.add(normKey(raw));
    set.add(normKey(pretty));
    set.add(normKey(slugFromLooseName(raw)));
    set.add(normKey(slugFromLooseName(pretty)));

    const first = normKey(firstNameOf(pretty));
    if (first) {
      firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
      set.add(first);
    }
  };

  players.forEach((p) => {
    const keys = new Set();

    addKey(keys, p.id);
    addKey(keys, p.fullName);
    addKey(keys, p.shortName);
    (p.aliases || []).forEach((a) => addKey(keys, a));

    keys.forEach((k) => {
      if (k && !byAny.has(k)) {
        byAny.set(k, p);
      }
    });
  });

  function resolve(rawLabel) {
    const raw = toTitleCaseLoose(rawLabel || "");
    const k = normKey(raw);
    if (!k) {
      return {
        player: null,
        canonical: "",
        compact: "",
      };
    }

    const exact = byAny.get(k);
    if (exact) {
      const canonical = exact.fullName || raw;
      const compact =
        String(exact.shortName || "").trim() ||
        firstNameOf(canonical) ||
        canonical;

      return {
        player: exact,
        canonical,
        compact,
      };
    }

    const slug = normKey(slugFromLooseName(raw));
    const bySlug = byAny.get(slug);
    if (bySlug) {
      const canonical = bySlug.fullName || raw;
      const compact =
        String(bySlug.shortName || "").trim() ||
        firstNameOf(canonical) ||
        canonical;

      return {
        player: bySlug,
        canonical,
        compact,
      };
    }

    const first = normKey(firstNameOf(raw));
    if (first && firstNameCounts.get(first) === 1) {
      const candidate = byAny.get(first);
      if (candidate) {
        const canonical = candidate.fullName || raw;
        const compact =
          String(candidate.shortName || "").trim() ||
          firstNameOf(canonical) ||
          canonical;

        return {
          player: candidate,
          canonical,
          compact,
        };
      }
    }

    return {
      player: null,
      canonical: raw,
      compact: firstNameOf(raw) || raw,
    };
  }

  return {
    resolve,
    canonicalName(raw) {
      return resolve(raw).canonical;
    },
    compactName(raw) {
      return resolve(raw).compact;
    },
    playerKey(raw) {
      return slugFromLooseName(resolve(raw).canonical || "");
    },
  };
}

function uniquePlayersNormalized(list = [], canonicalName, playerKeyFor) {
  const seen = new Set();
  const out = [];

  list.forEach((item) => {
    const pretty = canonicalName(item);
    const key = playerKeyFor(pretty);
    if (!pretty || seen.has(key)) return;
    seen.add(key);
    out.push(pretty);
  });

  return out;
}

function removePlayerByKey(list = [], name = "", canonicalName, playerKeyFor) {
  const targetKey = playerKeyFor(name);
  return uniquePlayersNormalized(list, canonicalName, playerKeyFor).filter(
    (item) => playerKeyFor(item) !== targetKey
  );
}

function movePlayerToFront(list = [], name = "", canonicalName, playerKeyFor) {
  const clean = canonicalName(name);
  if (!clean) return uniquePlayersNormalized(list, canonicalName, playerKeyFor);

  return uniquePlayersNormalized(
    [clean, ...removePlayerByKey(list, clean, canonicalName, playerKeyFor)],
    canonicalName,
    playerKeyFor
  );
}

function getLineupPlayerNames(lineup = {}, canonicalName) {
  const names = [
    ...Object.values(lineup?.positions || {}),
    ...(Array.isArray(lineup?.benchSnapshot) ? lineup.benchSnapshot : []),
    ...(Array.isArray(lineup?.registeredPlayers) ? lineup.registeredPlayers : []),
    ...(Array.isArray(lineup?.guestPlayers) ? lineup.guestPlayers : []),
  ]
    .map((name) => canonicalName(name))
    .filter(Boolean);

  return uniqueNames(names);
}

function buildRegisteredFallbackPlayers(teamPlayers = [], lineup = {}, canonicalName) {
  const fromTeam = uniqueNames(
    (Array.isArray(teamPlayers) ? teamPlayers : [])
      .map((name) => canonicalName(name))
      .filter(Boolean)
  );

  if (fromTeam.length) return fromTeam;

  // Important for League 5s/6s/7s:
  // If Manage Squads has not been fully seeded for the chosen side yet,
  // do not wipe the FormationPage lineup. Use the saved formation players
  // as the temporary registered pool for the pre-match verification screen.
  return getLineupPlayerNames(lineup, canonicalName);
}

function sanitizeLiveLineupToRegisteredPlayers(
  lineup,
  registeredPlayers = [],
  canonicalName,
  playerKeyFor,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5
) {
  const formation =
    formationMap[lineup?.formationId] || formationMap[defaultFormationId] || Object.values(formationMap)[0];

  const validRegistered = uniquePlayersNormalized(
    registeredPlayers || [],
    canonicalName,
    playerKeyFor
  );
  const validKeys = new Set(validRegistered.map((name) => playerKeyFor(name)));

  const cleanPositions = {};
  const usedKeys = new Set();

  (formation.positions || []).forEach((pos) => {
    const rawName = lineup?.positions?.[pos.id] || "";
    const canonical = canonicalName(rawName);
    const key = playerKeyFor(canonical);

    if (canonical && validKeys.has(key) && !usedKeys.has(key)) {
      cleanPositions[pos.id] = canonical;
      usedKeys.add(key);
    } else {
      cleanPositions[pos.id] = null;
    }
  });

  const remainingRegistered = validRegistered.filter(
    (name) => !usedKeys.has(playerKeyFor(name))
  );

  (formation.positions || []).forEach((pos) => {
    if (!cleanPositions[pos.id] && remainingRegistered.length > 0) {
      const next = remainingRegistered.shift();
      cleanPositions[pos.id] = next;
      usedKeys.add(playerKeyFor(next));
    }
  });

  const cleanGuests = uniquePlayersNormalized(
    lineup?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  ).filter((name) => !usedKeys.has(playerKeyFor(name)));

  return {
    ...lineup,
    formationId: formation.id,
    positions: cleanPositions,
    guestPlayers: cleanGuests,
    benchSnapshot: remainingRegistered,
    registeredPlayers: validRegistered,
  };
}

function liveLineupStateEquals(
  a,
  b,
  canonicalName,
  playerKeyFor,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5
) {
  const formationA =
    formationMap[a?.formationId] || formationMap[defaultFormationId] || Object.values(formationMap)[0];
  const formationB =
    formationMap[b?.formationId] || formationMap[defaultFormationId] || Object.values(formationMap)[0];

  if (formationA.id !== formationB.id) return false;

  const posIds = new Set([
    ...(formationA.positions || []).map((p) => p.id),
    ...(formationB.positions || []).map((p) => p.id),
  ]);

  for (const posId of posIds) {
    if (
      playerKeyFor(a?.positions?.[posId] || "") !==
      playerKeyFor(b?.positions?.[posId] || "")
    ) {
      return false;
    }
  }

  const aGuests = uniquePlayersNormalized(
    a?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  );
  const bGuests = uniquePlayersNormalized(
    b?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  );
  if (aGuests.length !== bGuests.length) return false;
  for (let i = 0; i < aGuests.length; i += 1) {
    if (playerKeyFor(aGuests[i]) !== playerKeyFor(bGuests[i])) return false;
  }

  const aBench = uniquePlayersNormalized(
    a?.benchSnapshot || [],
    canonicalName,
    playerKeyFor
  );
  const bBench = uniquePlayersNormalized(
    b?.benchSnapshot || [],
    canonicalName,
    playerKeyFor
  );
  if (aBench.length !== bBench.length) return false;
  for (let i = 0; i < aBench.length; i += 1) {
    if (playerKeyFor(aBench[i]) !== playerKeyFor(bBench[i])) return false;
  }

  return true;
}

function getTeamCaptainNames(team, canonicalName) {
  const rawCaptain = team?.captain;
  if (!rawCaptain) return [];
  return uniqueNames([canonicalName(rawCaptain)]);
}

function getOnFieldPlayersFromSnapshot(
  snapshot,
  fallbackPlayers = [],
  canonicalName,
  playerKeyFor,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5
) {
  const sanitized = sanitizeLiveLineupToRegisteredPlayers(
    snapshot,
    fallbackPlayers,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId
  );

  return uniqueNames(
    Object.values(sanitized?.positions || {})
      .map((name) => canonicalName(name))
      .filter(Boolean)
  );
}

function getBenchPlayersFromSnapshot(
  snapshot,
  fallbackPlayers = [],
  canonicalName,
  playerKeyFor,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5
) {
  const sanitized = sanitizeLiveLineupToRegisteredPlayers(
    snapshot,
    fallbackPlayers,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId
  );

  const assignedKeys = new Set(
    Object.values(sanitized?.positions || {})
      .map((name) => canonicalName(name))
      .filter(Boolean)
      .map((name) => playerKeyFor(name))
  );

  const guestBench = uniquePlayersNormalized(
    sanitized?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  ).filter((name) => !assignedKeys.has(playerKeyFor(name)));

  const registeredBench = uniquePlayersNormalized(
    sanitized?.benchSnapshot || [],
    canonicalName,
    playerKeyFor
  ).filter((name) => !assignedKeys.has(playerKeyFor(name)));

  return uniquePlayersNormalized(
    [...guestBench, ...registeredBench],
    canonicalName,
    playerKeyFor
  ).filter((name) => !assignedKeys.has(playerKeyFor(name)));
}

function roleTagFromPosition(positionIdOrLabel = "") {
  const key = String(positionIdOrLabel || "").trim().toLowerCase();

  if (!key) return "";

  if (
    key === "gk" ||
    key.includes("goalkeeper") ||
    key.includes("keeper") ||
    key.includes("goalie")
  ) {
    return "GK";
  }

  if (
    key === "def" ||
    key.includes("def") ||
    key.includes("back") ||
    key.includes("centre back") ||
    key.includes("center back") ||
    key.includes("cb") ||
    key.includes("rb") ||
    key.includes("lb")
  ) {
    return "DEF";
  }

  return "";
}

function getPlayerRoleTagMapFromSnapshot(
  snapshot,
  canonicalName,
  playerKeyFor,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5
) {
  const out = {};

  const formation =
    formationMap[snapshot?.formationId] || formationMap[defaultFormationId] || Object.values(formationMap)[0];

  const labelByPosId = new Map(
    (formation?.positions || []).map((pos) => [pos.id, pos.label || pos.id])
  );

  Object.entries(snapshot?.positions || {}).forEach(([posId, rawName]) => {
    const canonical = canonicalName(rawName);
    const key = playerKeyFor(canonical);
    if (!key) return;

    const posLabel = labelByPosId.get(posId) || posId;
    const roleTag = roleTagFromPosition(posLabel);

    if (roleTag) {
      out[key] = roleTag;
    }
  });

  return out;
}

function buildGoalRecorderChoices({
  snapshot,
  fallbackPlayers = [],
  canonicalName,
  playerKeyFor,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5,
}) {
  const onField = getOnFieldPlayersFromSnapshot(
    snapshot,
    fallbackPlayers,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId
  );

  const bench = getBenchPlayersFromSnapshot(
    snapshot,
    fallbackPlayers,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId
  );

  const roleTagMap = getPlayerRoleTagMapFromSnapshot(
    snapshot,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId
  );

  return [
    ...onField.map((name) => ({
      name,
      isSub: false,
      disabled: false,
      roleTag: roleTagMap[playerKeyFor(name)] || "",
    })),
    ...bench.map((name) => ({
      name,
      isSub: true,
      disabled: true,
      roleTag: roleTagMap[playerKeyFor(name)] || "",
    })),
  ];
}

function lineupHasEmptyPositions(
  lineup,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5
) {
  const formation =
    formationMap[lineup?.formationId] || formationMap[defaultFormationId] || Object.values(formationMap)[0];

  return formation.positions.some((pos) => {
    const name = lineup?.positions?.[pos.id];
    return !String(name || "").trim();
  });
}

function normalizeHexColor(v) {
  const raw = String(v || "").trim().replace(/[^#a-fA-F0-9]/g, "");
  if (!raw) return "";
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return "";
}

function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return `rgba(56, 189, 248, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorNameToHex(name = "") {
  const key = String(name || "").trim().toLowerCase();

  if (!key) return "";
  if (key.includes("white")) return "#F8FAFC";
  if (key.includes("black")) return "#0F172A";
  if (key.includes("gold")) return "#D4A017";
  if (key.includes("yellow")) return "#EAB308";
  if (key.includes("orange")) return "#F97316";
  if (key.includes("pink")) return "#EC4899";
  if (key.includes("purple")) return "#A855F7";
  if (key.includes("navy")) return "#1E3A8A";
  if (key.includes("sky")) return "#38BDF8";
  if (key.includes("blue")) return "#2563EB";
  if (key.includes("red")) return "#DC2626";
  if (key.includes("green")) return "#22C55E";
  if (key.includes("slate") || key.includes("grey") || key.includes("gray"))
    return "#64748B";

  return "";
}

function getTeamAccent(team = {}) {
  const explicitHex = normalizeHexColor(
    team.teamColorHex || team.colorHex || team.teamColor || ""
  );
  const colorNameHex = colorNameToHex(
    team.teamColorName || team.colorName || ""
  );

  const accent = colorNameHex || explicitHex;

  if (accent) {
    return {
      dot: accent,
      soft: hexToRgba(accent, 0.18),
      border: hexToRgba(accent, 0.42),
      text: "#E5E7EB",
    };
  }

  const key = String(team?.label || "").trim().toLowerCase();

  if (
    key.includes("man u") ||
    key.includes("manu") ||
    key.includes("man united") ||
    key.includes("manchester united")
  ) {
    return {
      dot: "#dc2626",
      soft: "rgba(220, 38, 38, 0.18)",
      border: "rgba(220, 38, 38, 0.45)",
      text: "#fecaca",
    };
  }

  if (key.includes("madrid") || key.includes("real madrid")) {
    return {
      dot: "#f8fafc",
      soft: "rgba(248, 250, 252, 0.14)",
      border: "rgba(248, 250, 252, 0.30)",
      text: "#f8fafc",
    };
  }

  if (key.includes("psg") || key.includes("paris")) {
    return {
      dot: "#1d4ed8",
      soft: "rgba(29, 78, 216, 0.18)",
      border: "rgba(29, 78, 216, 0.42)",
      text: "#bfdbfe",
    };
  }

  return {
    dot: "#38bdf8",
    soft: "rgba(56, 189, 248, 0.16)",
    border: "rgba(56, 189, 248, 0.35)",
    text: "#e5e7eb",
  };
}


function normalizeIdentityLookup(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const FANM_TEAM_IDENTITY_LOOKUP = [
  ...(Array.isArray(FANM_NATIONAL_TEAMS) ? FANM_NATIONAL_TEAMS : []),
  ...(Array.isArray(FANM_PRO_CLUBS) ? FANM_PRO_CLUBS : []),
];

function resolveLiveTeamIdentity(team = {}) {
  if (team?.teamIdentity) return team.teamIdentity;

  const keys = [
    team?.abbr,
    team?.label,
    team?.name,
    team?.title,
  ]
    .map(normalizeIdentityLookup)
    .filter(Boolean);

  return (
    FANM_TEAM_IDENTITY_LOOKUP.find((identity) => {
      const identityKeys = [
        identity?.abbr,
        identity?.name,
      ]
        .map(normalizeIdentityLookup)
        .filter(Boolean);

      return keys.some((key) => identityKeys.includes(key));
    }) || null
  );
}

function getLiveTeamLabel(team = {}, short = false) {
  const identity = resolveLiveTeamIdentity(team);
  if (short && identity?.abbr) return identity.abbr;
  if (identity?.name) return identity.name;
  if (short) return team?.abbrev || getShortName(team?.label);
  return team?.label || team?.name || team?.title || "Team";
}

function getLiveTeamAbbrev(team = {}) {
  const identity = resolveLiveTeamIdentity(team);
  return identity?.abbr || team?.abbrev || getShortName(team?.label) || "TEAM";
}

function TeamColorBadge({ team, short = false }) {
  const accent = getTeamAccent(team);
  const identity = resolveLiveTeamIdentity(team);
  const label = short ? getLiveTeamAbbrev(team) : getLiveTeamLabel(team, false);

  return (
    <span
      className="fanm-live-team-badge"
      style={{
        "--team-badge-bg": accent.soft,
        "--team-badge-border": accent.border,
        "--team-badge-text": accent.text,
      }}
    >
      {identity?.type === "national" && identity.flag ? (
        <span className="fanm-live-team-flag">{identity.flag}</span>
      ) : identity?.logo32 ? (
        <img
          src={identity.logo32}
          alt=""
          className="fanm-live-team-logo"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

function getRoleBadgeStyle(roleTag = "", isSub = false) {
  const role = String(roleTag || "").trim().toLowerCase();

  if (role === "gk") {
    return {
      background: "#38bdf8",
      color: "#082f49",
    };
  }

  if (role === "def") {
    return {
      background: "#ffffff",
      color: "#111827",
    };
  }

  return {
    background: isSub ? "#f59e0b" : "#94a3b8",
    color: "#111827",
  };
}

async function hardResetMatchDoc(summaryInfo, matchSeconds) {
  try {
    const ref = getMatchDoc(db, MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        matchNumber: summaryInfo.matchNumber,
        teamAId: summaryInfo.teamAId,
        teamBId: summaryInfo.teamBId,
        standbyId: summaryInfo.standbyId,
        teamALabel: summaryInfo.teamALabel,
        teamBLabel: summaryInfo.teamBLabel,
        standbyLabel: summaryInfo.standbyLabel,
        events: [],
        goalsA: 0,
        goalsB: 0,
        finalSummary: null,
        isFinished: false,
        matchSeconds: matchSeconds ?? 0,
        secondsLeft: matchSeconds ?? 0,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      },
      { merge: false }
    );
  } catch (err) {
    console.error("⚠️ Failed to hard reset match doc:", err);
  }
}

async function appendEventToFirestore(
  event,
  summaryInfo,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = getMatchDoc(db, MATCH_DOC_ID);

    const common = {
      ...summaryInfo,
      matchSeconds: matchSeconds ?? 0,
      secondsLeft:
        typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : null,
      isFinished: false,
      lastUpdated: serverTimestamp(),
    };

    try {
      await updateDoc(ref, {
        events: arrayUnion(event),
        ...common,
      });
    } catch (_) {
      await setDoc(
        ref,
        {
          events: [event],
          createdAt: serverTimestamp(),
          ...common,
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("⚠️ Failed to mirror event to Firestore:", err);
  }
}

async function overwriteEventsInFirestore(
  allEvents,
  summaryInfo,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = getMatchDoc(db, MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        events: allEvents,
        matchSeconds: matchSeconds ?? 0,
        secondsLeft:
          typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : null,
        isFinished: false,
        lastUpdated: serverTimestamp(),
        ...summaryInfo,
      },
      { merge: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to overwrite events in Firestore:", err);
  }
}

async function writeFinalSummaryToFirestore(
  finalSummary,
  events,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = getMatchDoc(db, MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        finalSummary,
        events,
        isFinished: true,
        finishedAt: serverTimestamp(),
        matchSeconds: matchSeconds ?? 0,
        secondsLeft:
          typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : 0,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to write final summary to Firestore:", err);
  }
}

function PlayerBenchChip({
  name,
  isSelected,
  onClick,
  photoData,
  disabled = false,
  suffix = "",
  isSub = false,
  roleTag = "",
}) {
  const roleStyle = getRoleBadgeStyle(roleTag, isSub);

  return (
    <button
      type="button"
      className={`bench-player live-bench-chip ${isSelected ? "selected" : ""} ${
        isSub ? "is-sub" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
      title={isSub ? "This player is currently a sub and cannot be selected." : ""}
    >
      {isSub && (
        <span className="live-chip-corner-badge right sub">Sub</span>
      )}

      {roleTag && (
        <span
          className="live-chip-corner-badge left"
          style={{
            background: roleStyle.background,
            color: roleStyle.color,
          }}
        >
          {roleTag}
        </span>
      )}

      <span
        className={`live-bench-avatar ${isSub ? "is-sub" : ""}`}
        style={{
          background: photoData
            ? "transparent"
            : isSub
            ? "radial-gradient(circle at 30% 20%, #f59e0b, #78350f)"
            : "radial-gradient(circle at 30% 20%, #38bdf8, #0f172a)",
        }}
      >
        {photoData ? (
          <img
            src={photoData}
            alt={name}
            className={`live-bench-avatar-image ${isSub ? "is-sub" : ""}`}
          />
        ) : (
          <span className="live-bench-avatar-fallback">
            {String(name || "?").charAt(0).toUpperCase()}
          </span>
        )}
      </span>

      <span className={isSub ? "live-bench-chip-text is-sub" : ""}>
        {name}
        {suffix}
      </span>
    </button>
  );
}

function PlayerChoiceGrid({
  title,
  players,
  selectedName,
  onSelect,
  displayCompactPlayerName,
  getPlayerPhoto,
  guestSnapshotChecker = null,
  disabled = false,
}) {
  const firstSubIndex = players.findIndex(
    (entry) => typeof entry !== "string" && Boolean(entry?.isSub)
  );

  return (
    <div className="field-row">
      <label>{title}</label>
      {players.length === 0 ? (
        <p className="muted small">No players available.</p>
      ) : (
        <div className="live-player-choice-grid">
          {players.map((entry, idx) => {
            const rawName =
              typeof entry === "string" ? entry : entry?.name || "";
            const isSub =
              typeof entry === "string" ? false : Boolean(entry?.isSub);
            const isEntryDisabled =
              disabled ||
              (typeof entry === "string" ? false : Boolean(entry?.disabled));
            const roleTag =
              typeof entry === "string" ? "" : String(entry?.roleTag || "");
            const isSelected = selectedName === rawName;
            const isGuest = guestSnapshotChecker
              ? guestSnapshotChecker(rawName)
              : false;
            const photoData = getPlayerPhoto(rawName);

            const showDivider = firstSubIndex > 0 && idx === firstSubIndex;

            return (
              <React.Fragment
                key={`${rawName}-${isSub ? "sub" : "field"}-${
                  roleTag || "norole"
                }`}
              >
                {showDivider && (
                  <div
                    aria-hidden="true"
                    className="live-sub-divider"
                    title="Divider between on-field players and subs"
                  />
                )}

                <PlayerBenchChip
                  name={displayCompactPlayerName(rawName)}
                  isSelected={isSelected}
                  onClick={() => {
                    if (isEntryDisabled) return;
                    onSelect(isSelected ? "" : rawName);
                  }}
                  photoData={photoData}
                  disabled={isEntryDisabled}
                  suffix={isGuest ? " (Guest)" : ""}
                  isSub={isSub}
                  roleTag={roleTag}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LineupBoard({
  title,
  team = null,
  lineup,
  setLineup,
  registeredPlayers,
  canonicalName,
  displayCompactPlayerName,
  playerKeyFor,
  getPlayerPhoto,
  disabled = false,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5,
}) {
  const formation =
    formationMap[lineup?.formationId] || formationMap[defaultFormationId] || Object.values(formationMap)[0];
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [guestName, setGuestName] = useState("");
  const lastSanitizedSignatureRef = useRef("");

  useEffect(() => {
    setSelectedPlayer(null);
  }, [lineup?.formationId]);

  const allRegistered = uniquePlayersNormalized(
    registeredPlayers || [],
    canonicalName,
    playerKeyFor
  );

  const sanitizedLineup = useMemo(
    () =>
      sanitizeLiveLineupToRegisteredPlayers(
        lineup,
        allRegistered,
        canonicalName,
        playerKeyFor,
        formationMap,
        defaultFormationId
      ),
    [lineup, allRegistered, canonicalName, playerKeyFor, formationMap, defaultFormationId]
  );

  useEffect(() => {
    const signature = JSON.stringify({
      formationId: sanitizedLineup?.formationId || "",
      positions: sanitizedLineup?.positions || {},
      guestPlayers: sanitizedLineup?.guestPlayers || [],
      benchSnapshot: sanitizedLineup?.benchSnapshot || [],
      registeredPlayers: sanitizedLineup?.registeredPlayers || [],
    });

    if (lastSanitizedSignatureRef.current === signature) return;

    setLineup((prev) => {
      if (
        liveLineupStateEquals(
          prev,
          sanitizedLineup,
          canonicalName,
          playerKeyFor,
          formationMap,
          defaultFormationId
        )
      ) {
        lastSanitizedSignatureRef.current = signature;
        return prev;
      }

      const next = {
        ...prev,
        ...sanitizedLineup,
      };

      const prevSignature = JSON.stringify({
        formationId: prev?.formationId || "",
        positions: prev?.positions || {},
        guestPlayers: prev?.guestPlayers || [],
        benchSnapshot: prev?.benchSnapshot || [],
        registeredPlayers: prev?.registeredPlayers || [],
      });

      if (prevSignature === signature) {
        lastSanitizedSignatureRef.current = signature;
        return prev;
      }

      lastSanitizedSignatureRef.current = signature;
      return next;
    });
  }, [
    sanitizedLineup,
    setLineup,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId,
  ]);

  const assignedNames = Object.values(sanitizedLineup?.positions || {})
    .map((name) => canonicalName(name))
    .filter(Boolean);

  const assignedKeys = new Set(assignedNames.map((name) => playerKeyFor(name)));

  const guestPlayers = uniquePlayersNormalized(
    sanitizedLineup?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  );

  const sanitizedBenchRegistered = uniquePlayersNormalized(
    sanitizedLineup?.benchSnapshot || [],
    canonicalName,
    playerKeyFor
  ).filter((p) => !assignedKeys.has(playerKeyFor(p)));

  const sanitizedGuestBench = uniquePlayersNormalized(
    guestPlayers,
    canonicalName,
    playerKeyFor
  ).filter((p) => !assignedKeys.has(playerKeyFor(p)));

  const benchList = uniquePlayersNormalized(
    [...sanitizedGuestBench, ...sanitizedBenchRegistered],
    canonicalName,
    playerKeyFor
  ).filter((p) => !assignedKeys.has(playerKeyFor(p)));

  const handleBenchClick = (playerName) => {
    if (disabled) return;

    if (
      selectedPlayer &&
      selectedPlayer.from === "bench" &&
      selectedPlayer.name === playerName
    ) {
      setSelectedPlayer(null);
      return;
    }

    setSelectedPlayer({ from: "bench", name: playerName });
  };

  const handlePitchClick = (posId) => {
    if (disabled) return;

    const currentAtPos = sanitizedLineup?.positions?.[posId] || null;

    if (!selectedPlayer) {
      if (!currentAtPos) return;
      setSelectedPlayer({ from: "pitch", name: currentAtPos, posId });
      return;
    }

    const newPositions = { ...(sanitizedLineup?.positions || {}) };
    let nextBenchSnapshot = [...sanitizedBenchRegistered];

    if (selectedPlayer.from === "bench") {
      const incoming = canonicalName(selectedPlayer.name);
      const outgoing = canonicalName(currentAtPos);

      Object.keys(newPositions).forEach((key) => {
        if (playerKeyFor(newPositions[key]) === playerKeyFor(incoming)) {
          newPositions[key] = null;
        }
      });

      newPositions[posId] = incoming;
      nextBenchSnapshot = removePlayerByKey(
        nextBenchSnapshot,
        incoming,
        canonicalName,
        playerKeyFor
      );

      if (outgoing) {
        nextBenchSnapshot = movePlayerToFront(
          nextBenchSnapshot,
          outgoing,
          canonicalName,
          playerKeyFor
        );
      }
    } else {
      const fromPos = selectedPlayer.posId;
      const fromName = canonicalName(selectedPlayer.name);
      const toName = canonicalName(currentAtPos);

      newPositions[fromPos] = toName || null;
      newPositions[posId] = fromName;
    }

    const nextAssignedKeys = new Set(
      Object.values(newPositions)
        .map((name) => canonicalName(name))
        .filter(Boolean)
        .map((name) => playerKeyFor(name))
    );

    setLineup((prev) => ({
      ...prev,
      positions: newPositions,
      benchSnapshot: uniquePlayersNormalized(
        nextBenchSnapshot,
        canonicalName,
        playerKeyFor
      ).filter((p) => !nextAssignedKeys.has(playerKeyFor(p))),
    }));

    setSelectedPlayer(null);
  };

  const handleGuestAdd = () => {
    if (disabled) return;

    const clean = canonicalName(guestName);
    if (!clean) return;

    if (assignedKeys.has(playerKeyFor(clean))) {
      setGuestName("");
      return;
    }

    const knownClubPlayer = canonicalName(clean);

    const registeredMatch = allRegistered.find(
      (p) => playerKeyFor(p) === playerKeyFor(clean)
    );

    if (registeredMatch) {
      setLineup((prev) => ({
        ...prev,
        benchSnapshot: movePlayerToFront(
          prev?.benchSnapshot || [],
          registeredMatch,
          canonicalName,
          playerKeyFor
        ),
      }));
      setGuestName("");
      return;
    }

    setLineup((prev) => ({
      ...prev,
      guestPlayers: uniquePlayersNormalized(
        [...(prev?.guestPlayers || []), clean],
        canonicalName,
        playerKeyFor
      ),
    }));

    setGuestName("");
  };

  const handleRemoveGuest = (name) => {
    if (disabled) return;

    setLineup((prev) => {
      const nextGuests = (prev?.guestPlayers || []).filter(
        (g) => playerKeyFor(g) !== playerKeyFor(name)
      );

      const nextPositions = { ...(prev?.positions || {}) };
      Object.keys(nextPositions).forEach((k) => {
        if (playerKeyFor(nextPositions[k]) === playerKeyFor(name)) {
          nextPositions[k] = null;
        }
      });

      const cleanedBenchSnapshot = removePlayerByKey(
        prev?.benchSnapshot || [],
        name,
        canonicalName,
        playerKeyFor
      );

      return {
        ...prev,
        positions: nextPositions,
        guestPlayers: nextGuests,
        benchSnapshot: cleanedBenchSnapshot,
      };
    });

    setSelectedPlayer(null);
  };

  return (
    <div className="live-lineup-column">
      <h3 className="live-bench-title">
        <TeamColorBadge team={team || { label: title }} />
      </h3>

      <div className="pitch-wrapper">
        <div className="pitch" style={{ maxWidth: "100%" }}>
          <div className="pitch-centre-circle" />
          <div className="pitch-half-line" />
          <div className="pitch-box pitch-box-top" />
          <div className="pitch-box pitch-box-bottom" />

          {formation.positions.map((pos) => {
            const name = sanitizedLineup?.positions?.[pos.id] || "";
            const isSelected =
              selectedPlayer &&
              selectedPlayer.from === "pitch" &&
              selectedPlayer.posId === pos.id;

            const photoData = getPlayerPhoto(name);

            return (
              <div
                key={pos.id}
                className={`pitch-position ${name ? "has-player" : ""} ${
                  isSelected ? "selected" : ""
                }`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onClick={() => handlePitchClick(pos.id)}
              >
                <div className="player-token">
                  <div
                    className={`player-shirt ${photoData ? "with-photo" : ""}`}
                    style={
                      photoData ? { backgroundImage: `url(${photoData})` } : {}
                    }
                  />
                  <div className="live-player-meta">
                    <span className="player-name">
                      {name ? displayCompactPlayerName(name) : "Empty"}
                    </span>
                    <span className="position-tag">{pos.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bench-wrapper live-bench-wrapper">
        <h4 className="live-bench-title">Bench</h4>

        {benchList.length === 0 ? (
          <p className="muted">No bench players available.</p>
        ) : (
          <ul className="bench-list live-bench-list">
            {benchList.map((p) => {
              const isSelected =
                selectedPlayer &&
                selectedPlayer.from === "bench" &&
                selectedPlayer.name === p;
              const isGuest = (lineup?.guestPlayers || []).some(
                (g) => playerKeyFor(g) === playerKeyFor(p)
              );
              const photoData = getPlayerPhoto(p);

              return (
                <li key={p} className="live-bench-item">
                  <PlayerBenchChip
                    name={displayCompactPlayerName(p)}
                    isSelected={isSelected}
                    onClick={() => handleBenchClick(p)}
                    photoData={photoData}
                    disabled={disabled}
                    suffix={isGuest ? " (Guest)" : ""}
                  />
                  {isGuest && !disabled && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => handleRemoveGuest(p)}
                      title="Remove guest"
                    >
                      remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!disabled && (
          <div className="live-guest-add">
            <label className="muted small live-guest-label live-guest-label-hidden">
              Add guest player
            </label>
            <div className="live-guest-row">
              <input
                type="text"
                className="text-input"
                placeholder="Guest player name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={handleGuestAdd}
              >
                + Guest
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreeTeamLeagueLiveMatchPage({
  matchSeconds,
  secondsLeft,
  timeUp,
  running,
  teams,
  currentMatchNo,
  currentMatch,
  currentEvents,
  identity = null,
  activeRole = "spectator",
  isAdmin = false,
  isCaptain = false,
  canControlMatch = false,
  refereeDeviceId = null,
  liveMatchController = null,
  liveMatchTakeoverRequest = null,
  canControlCurrentLiveMatch = false,
  onTakeOverLiveMatch,
  onRequestTakeOverLiveMatch,
  onAcceptTakeoverRequest,
  onRejectTakeoverRequest,
  pendingMatchStartContext = null,
  matchType = "LEAGUE",
  gameFormat = GAME_FORMAT.FIVE_V_FIVE,
  playersPerSide = null,
  confirmedLineupSnapshot = null,
  confirmedLineupsByMatchNo = {},
  playerPhotosByName = {},
  activeClubId = "turf-kings",
  activeClub = null,
  onConfirmPreMatchLineups,
  onCancelPreMatchLineups,
  onAddEvent,
  onDeleteEvent,
  onUndoLastEvent,
  onConfirmEndMatch,
  onBackToLanding,
  onGoToStats,
  onOpenHighlightsCamera,
  onUpdateMatchSeconds,
  matchTeamColorOverrides = {},
  onUpdateMatchTeamColorOverride = null,
  onResetMatchTeamColorOverrides = null,
}) {
  const liveTeams =
    Array.isArray(pendingMatchStartContext?.teams) &&
    pendingMatchStartContext.teams.length
      ? pendingMatchStartContext.teams
      : Array.isArray(teams)
      ? teams
      : [];

  const rawLiveCurrentMatch =
    pendingMatchStartContext?.currentMatch ||
    currentMatch ||
    {};

  const validTeamIds = new Set(liveTeams.map((team) => team?.id).filter(Boolean));

  const rawTeamAId = rawLiveCurrentMatch?.teamAId || null;
  const rawTeamBId = rawLiveCurrentMatch?.teamBId || null;
  const rawStandbyId = rawLiveCurrentMatch?.standbyId || null;

  const hasValidPair =
    rawTeamAId &&
    rawTeamBId &&
    rawTeamAId !== rawTeamBId &&
    validTeamIds.has(rawTeamAId) &&
    validTeamIds.has(rawTeamBId);

  const teamAId = hasValidPair ? rawTeamAId : liveTeams[0]?.id || null;
  const teamBId = hasValidPair
    ? rawTeamBId
    : liveTeams.find((team) => team?.id && team.id !== teamAId)?.id || null;
  const standbyId =
    rawStandbyId &&
    validTeamIds.has(rawStandbyId) &&
    rawStandbyId !== teamAId &&
    rawStandbyId !== teamBId
      ? rawStandbyId
      : liveTeams.find(
          (team) => team?.id && team.id !== teamAId && team.id !== teamBId
        )?.id || null;

  const role = String(activeRole || "spectator").trim().toLowerCase();
  const formatConfig = getGameFormatConfig(gameFormat);
  const liveGameFormat = normalizeGameFormat(gameFormat, GAME_FORMAT.FIVE_V_FIVE);
  const livePlayersPerSide = Number(playersPerSide || formatConfig.playersPerSide || 5);
  const liveFormatLabel = formatConfig.label || `${livePlayersPerSide} v ${livePlayersPerSide}`;
  const liveLineupGameType = getLineupGameTypeFromFormat(liveGameFormat);
  const liveFormationsMap = getLiveFormationsMap(liveGameFormat);
  const liveDefaultFormationId = getLiveDefaultFormationId(liveGameFormat);
  const isControllerSession =
    Boolean(pendingMatchStartContext) && canControlMatch;

  const controllerName =
    liveMatchController?.name ||
    liveMatchController?.email ||
    "Current referee";

  const takeoverRequesterName =
    liveMatchTakeoverRequest?.requester?.name ||
    liveMatchTakeoverRequest?.requester?.email ||
    "Another referee";

  const hasPendingTakeoverRequest =
    liveMatchTakeoverRequest?.status === "pending";

  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.innerWidth <= 480);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setPlayersLoading(true);

      try {
        const snap = await getDocs(collection(db, PLAYERS_COLLECTION));
        if (cancelled) return;

        const list = snap.docs.map((d) => {
          const data = d.data() || {};

          const fullName = toTitleCaseLoose(
            data.fullName ||
              data.displayName ||
              data.name ||
              data.playerName ||
              ""
          );

          const shortName = toTitleCaseLoose(
            data.shortName ||
              data.name ||
              data.displayName ||
              firstNameOf(fullName) ||
              fullName
          );

          const aliases = Array.isArray(data.aliases)
            ? data.aliases.map((a) => toTitleCaseLoose(a)).filter(Boolean)
            : [];

          return {
            id: d.id,
            fullName,
            shortName,
            aliases,
            status: data.status || "active",
          };
        });

        const active = list.filter(
          (p) => String(p.status || "active").toLowerCase() === "active"
        );

        active.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setPlayers(active);
      } catch (err) {
        console.error("Failed to load players in LiveMatchPage:", err);
      } finally {
        if (!cancelled) {
          setPlayersLoading(false);
        }
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, []);

  const playersReady = !playersLoading;

  const playerResolver = useMemo(() => buildPlayerResolver(players), [players]);

  const canonicalName = useMemo(
    () => (raw) => playerResolver.canonicalName(raw),
    [playerResolver]
  );

  const displayCompactPlayerName = useMemo(
    () => (raw) => playerResolver.compactName(raw),
    [playerResolver]
  );

  const playerKeyFor = useMemo(
    () => (raw) => playerResolver.playerKey(raw),
    [playerResolver]
  );

  const canonicalTeams = useMemo(() => {
    return (liveTeams || []).map((t) => ({
      ...t,
      playerIds: (t.players || [])
        .map((p) => (typeof p === "string" ? p : p?.id || ""))
        .filter(Boolean),
      players: (t.players || [])
        .map((p) => {
          const raw =
            typeof p === "string" ? p : p?.name || p?.displayName || "";
          return canonicalName(raw);
        })
        .filter(Boolean),
      captain: canonicalName(t.captain || ""),
      captainId: t.captainId || null,
    }));
  }, [liveTeams, canonicalName]);

  const teamA = getTeamById(canonicalTeams, teamAId);
  const teamB = getTeamById(canonicalTeams, teamBId);
  const standbyTeam = getTeamById(canonicalTeams, standbyId);

  /*
   * Match-day colour overrides persist in liveMatchDraft.
   * They apply to each team across all Three Team League fixtures
   * until changed by the referee or reset to squad defaults.
   */
  const [
    localMatchTeamColorOverrides,
    setLocalMatchTeamColorOverrides,
  ] = useState(matchTeamColorOverrides || {});

  useEffect(() => {
    setLocalMatchTeamColorOverrides(
      matchTeamColorOverrides || {}
    );
  }, [matchTeamColorOverrides]);

  const applyMatchTeamColorOverride = (
    teamId,
    nextColour
  ) => {
    if (!teamId || !nextColour) return;

    const safeColour = {
      teamColorName: String(
        nextColour.teamColorName ||
        nextColour.colorName ||
        ""
      ).trim(),
      colorName: String(
        nextColour.colorName ||
        nextColour.teamColorName ||
        ""
      ).trim(),
      teamColorHex: String(
        nextColour.teamColorHex ||
        nextColour.colorHex ||
        ""
      ).trim(),
      colorHex: String(
        nextColour.colorHex ||
        nextColour.teamColorHex ||
        ""
      ).trim(),
    };

    setLocalMatchTeamColorOverrides((prev) => ({
      ...(prev || {}),
      [teamId]: safeColour,
    }));

    onUpdateMatchTeamColorOverride?.(
      teamId,
      safeColour
    );
  };

  const resetMatchTeamColourOverrides = () => {
    setLocalMatchTeamColorOverrides({});
    onResetMatchTeamColorOverrides?.();
  };

  const buildEffectiveMatchTeam = (team, teamId) => {
    if (!team) return team;

    const override =
      localMatchTeamColorOverrides?.[teamId] || null;

    if (!override) return team;

    const overrideName = String(
      override.teamColorName ||
      override.colorName ||
      ""
    ).trim();

    const overrideHex = String(
      override.teamColorHex ||
      override.colorHex ||
      ""
    ).trim();

    return {
      ...team,
      teamColorName:
        overrideName ||
        team.teamColorName ||
        team.colorName ||
        "",
      colorName:
        overrideName ||
        team.colorName ||
        team.teamColorName ||
        "",
      teamColorHex:
        overrideHex ||
        team.teamColorHex ||
        team.colorHex ||
        "",
      colorHex:
        overrideHex ||
        team.colorHex ||
        team.teamColorHex ||
        "",
      matchColorOverride: override,
      hasMatchColorOverride: true,
    };
  };

  const effectiveTeamA = buildEffectiveMatchTeam(
    teamA,
    teamAId
  );

  const effectiveTeamB = buildEffectiveMatchTeam(
    teamB,
    teamBId
  );

  const effectiveStandby = buildEffectiveMatchTeam(
    standbyTeam,
    standbyId
  );

  const [mergedPlayerPhotos, setMergedPlayerPhotos] = useState(
    playerPhotosByName || {}
  );

  useEffect(() => {
    setMergedPlayerPhotos((prev) => ({
      ...prev,
      ...(playerPhotosByName || {}),
    }));
  }, [playerPhotosByName]);

  useEffect(() => {
    const alreadyLoaded =
      playerPhotosByName &&
      Object.keys(playerPhotosByName).length > 20;

    if (alreadyLoaded) {
      return;
    }

    let cancelled = false;

    async function loadPhotos() {
      try {
        const snap = await getDocs(getPlayerPhotosCollection(db, activeClubId));
        if (cancelled) return;

        const loaded = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const photoData = data?.photoData || "";
          const rawName = data?.name || docSnap.id || "";
          if (!photoData) return;

          const canonical = canonicalName(rawName);
          const compact = displayCompactPlayerName(rawName);
          const slug = slugFromLooseName(canonical || rawName);
          const firstCanon = firstNameOf(canonical);
          const firstCompact = firstNameOf(compact);

          [
            rawName,
            toTitleCaseLoose(rawName),
            canonical,
            compact,
            slug,
            firstCanon,
            firstCompact,
          ]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .forEach((key) => {
              loaded[key] = photoData;
            });
        });

        setMergedPlayerPhotos((prev) => ({
          ...loaded,
          ...prev,
        }));
      } catch (err) {
        console.error("Failed to load player photos in LiveMatchPage:", err);
      }
    }

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [activeClubId]);

  const getPlayerPhoto = useMemo(() => {
    return (playerName = "") => {
      const raw = String(playerName || "").trim();
      if (!raw) return null;

      const canonical = canonicalName(raw);
      const compact = displayCompactPlayerName(raw);
      const slug = slugFromLooseName(canonical || raw);
      const firstCanonical = firstNameOf(canonical);
      const firstCompact = firstNameOf(compact);

      const candidates = [
        raw,
        toTitleCaseLoose(raw),
        canonical,
        compact,
        slug,
        firstCanonical,
        firstCompact,
      ]
        .map((x) => String(x || "").trim())
        .filter(Boolean);

      for (const key of candidates) {
        if (mergedPlayerPhotos[key]) return mergedPlayerPhotos[key];
        const matchedKey = Object.keys(mergedPlayerPhotos).find(
          (k) => normKey(k) === normKey(key)
        );
        if (matchedKey && mergedPlayerPhotos[matchedKey]) {
          return matchedKey ? mergedPlayerPhotos[matchedKey] : null;
        }
      }

      return null;
    };
  }, [mergedPlayerPhotos, canonicalName, displayCompactPlayerName]);

  const [scoringTeamId, setScoringTeamId] = useState("");
  const [scorerName, setScorerName] = useState("");
  const [assistName, setAssistName] = useState("");
  const [editingGoalIndex, setEditingGoalIndex] = useState(null);
  const [showGoalRecorder, setShowGoalRecorder] = useState(false);
  const [showAdditionalTimeModal, setShowAdditionalTimeModal] = useState(false);
  const [pendingAdditionalTimeSeconds, setPendingAdditionalTimeSeconds] = useState(0);
  const [additionalTimeTotalSeconds, setAdditionalTimeTotalSeconds] = useState(0);
  const [additionalTimeSecondsLeft, setAdditionalTimeSecondsLeft] = useState(0);
  const [additionalTimeRunning, setAdditionalTimeRunning] = useState(false);
  const [additionalTimeFinished, setAdditionalTimeFinished] = useState(false);
  const [goalStep, setGoalStep] = useState("team");

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState(15);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [showBackModal, setShowBackModal] = useState(false);
  const [backPassword, setBackPassword] = useState("");
  const [backError, setBackError] = useState("");

  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoPassword, setUndoPassword] = useState("");
  const [undoError, setUndoError] = useState("");

  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const alarmLoopRef = useRef(null);

  const wakeLockRef = useRef(null);
  const idleTimerRef = useRef(null);
  const [screenDimmed, setScreenDimmed] = useState(false);

  const savedLineups = useMemo(() => loadSavedLineups(), []);

  const defaultTeamALineup = useMemo(() => {
    const preferred = resolvePreferredTeamLineup(
      teamA,
      liveLineupGameType,
      savedLineups,
      liveFormationsMap,
      liveDefaultFormationId,
      teamA?.players || []
    );

    const registeredPool = buildRegisteredFallbackPlayers(
      teamA?.players || [],
      preferred,
      canonicalName
    );

    return sanitizeLiveLineupToRegisteredPlayers(
      preferred,
      registeredPool,
      canonicalName,
      playerKeyFor,
      liveFormationsMap,
      liveDefaultFormationId
    );
  }, [
    teamA,
    savedLineups,
    canonicalName,
    playerKeyFor,
    liveLineupGameType,
    liveFormationsMap,
    liveDefaultFormationId,
  ]);

  const defaultTeamBLineup = useMemo(() => {
    const preferred = resolvePreferredTeamLineup(
      teamB,
      liveLineupGameType,
      savedLineups,
      liveFormationsMap,
      liveDefaultFormationId,
      teamB?.players || []
    );

    const registeredPool = buildRegisteredFallbackPlayers(
      teamB?.players || [],
      preferred,
      canonicalName
    );

    return sanitizeLiveLineupToRegisteredPlayers(
      preferred,
      registeredPool,
      canonicalName,
      playerKeyFor,
      liveFormationsMap,
      liveDefaultFormationId
    );
  }, [
    teamB,
    savedLineups,
    canonicalName,
    playerKeyFor,
    liveLineupGameType,
    liveFormationsMap,
    liveDefaultFormationId,
  ]);

  const [verifyTeamALineup, setVerifyTeamALineup] =
    useState(defaultTeamALineup);
  const [verifyTeamBLineup, setVerifyTeamBLineup] =
    useState(defaultTeamBLineup);
  const [localConfirmedSnapshots, setLocalConfirmedSnapshots] = useState(null);

  useEffect(() => {
    setVerifyTeamALineup(defaultTeamALineup);
  }, [defaultTeamALineup]);

  useEffect(() => {
    setVerifyTeamBLineup(defaultTeamBLineup);
  }, [defaultTeamBLineup]);

  const existingConfirmedFromApp =
    localConfirmedSnapshots ||
    confirmedLineupSnapshot ||
    confirmedLineupsByMatchNo?.[currentMatchNo] ||
    null;

  const sanitizedConfirmedSnapshots = useMemo(() => {
    if (!existingConfirmedFromApp) return null;

    return {
      ...(existingConfirmedFromApp || {}),
      ...(teamAId
        ? {
            [teamAId]: sanitizeLiveLineupToRegisteredPlayers(
              existingConfirmedFromApp?.[teamAId] || {},
              buildRegisteredFallbackPlayers(
                teamA?.players || [],
                existingConfirmedFromApp?.[teamAId] || {},
                canonicalName
              ),
              canonicalName,
              playerKeyFor,
              liveFormationsMap,
              liveDefaultFormationId
            ),
          }
        : {}),
      ...(teamBId
        ? {
            [teamBId]: sanitizeLiveLineupToRegisteredPlayers(
              existingConfirmedFromApp?.[teamBId] || {},
              buildRegisteredFallbackPlayers(
                teamB?.players || [],
                existingConfirmedFromApp?.[teamBId] || {},
                canonicalName
              ),
              canonicalName,
              playerKeyFor,
              liveFormationsMap,
              liveDefaultFormationId
            ),
          }
        : {}),
    };
  }, [
    existingConfirmedFromApp,
    teamAId,
    teamBId,
    teamA,
    teamB,
    canonicalName,
    playerKeyFor,
    liveFormationsMap,
    liveDefaultFormationId,
  ]);

  const hasVerifiedLineups = Boolean(
    sanitizedConfirmedSnapshots?.[teamAId] && sanitizedConfirmedSnapshots?.[teamBId]
  );

  const mustVerifyBeforePlay = isControllerSession;

  useEffect(() => {
    if (mustVerifyBeforePlay && !hasVerifiedLineups) {
      if (!playersReady) return;

      setVerifyTeamALineup(defaultTeamALineup);
      setVerifyTeamBLineup(defaultTeamBLineup);
      setShowVerifyModal(true);
      setShowGoalRecorder(false);
      setGoalStep("team");
      setScoringTeamId("");
      setScorerName("");
      setAssistName("");
      return;
    }

  }, [
    mustVerifyBeforePlay,
    hasVerifiedLineups,
    currentMatchNo,
    teamAId,
    teamBId,
    defaultTeamALineup,
    defaultTeamBLineup,
    playersReady,
  ]);

  useEffect(() => {
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
    setShowGoalRecorder(false);
    setGoalStep("team");
  }, [teamAId, teamBId, currentMatchNo]);

  useEffect(() => {
    if (!matchEndSound) return;

    const unlock = async () => {
      try {
        await matchEndSound.play();
        matchEndSound.pause();
        matchEndSound.currentTime = 0;
      } catch (_) {
        // ignore
      } finally {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("click", unlock);
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  useEffect(() => {
    const shouldSoundFinalWhistle =
      additionalTimeFinished ||
      (timeUp && !pendingAdditionalTimeSeconds && !additionalTimeRunning);

    if (!shouldSoundFinalWhistle) {
      stopAlarmLoop(alarmLoopRef);
      return;
    }

    (async () => {
      try {
        if (matchEndSound) {
          matchEndSound.currentTime = 0;
          await matchEndSound.play();
        }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch (_) {
        // ignore
      }
    })();

    const stopId = setTimeout(() => {
      stopAlarmLoop(alarmLoopRef);
    }, 10000);

    return () => {
      clearTimeout(stopId);
      stopAlarmLoop(alarmLoopRef);
    };
  }, [
    timeUp,
    pendingAdditionalTimeSeconds,
    additionalTimeRunning,
    additionalTimeFinished,
  ]);

  useEffect(() => {
    let mounted = true;

    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    async function requestScreenWakeLock() {
      try {
        if (!("wakeLock" in navigator)) return;
        if (wakeLockRef.current) return;

        const lock = await navigator.wakeLock.request("screen");

        if (!mounted) {
          lock.release?.().catch(() => {});
          return;
        }

        wakeLockRef.current = lock;

        lock.addEventListener?.("release", () => {
          if (mounted) wakeLockRef.current = null;
        });
      } catch (err) {
        console.warn("Screen wake lock unavailable:", err);
      }
    }

    function resetIdleTimer() {
      if (!mounted) return;

      setScreenDimmed(false);

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      idleTimerRef.current = setTimeout(() => {
        if (mounted) setScreenDimmed(true);
      }, 10000);
    }

    async function handleVisibilityChange() {
      if (document.hidden) return;
      await requestScreenWakeLock();
      resetIdleTimer();
    }

    requestScreenWakeLock();
    resetIdleTimer();

    const activityEvents = ["pointerdown", "touchstart", "mousemove", "keydown", "scroll"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });

      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!canControlMatch) return;
    if (!running) return;
    if (secondsLeft == null) return;

    const shouldPush = secondsLeft <= 5 || secondsLeft % 5 === 0;
    if (!shouldPush) return;

    const pushTimer = async () => {
      try {
        const ref = getMatchDoc(db, MATCH_DOC_ID);
        await updateDoc(ref, {
          secondsLeft: Math.max(secondsLeft, 0),
          matchSeconds: matchSeconds ?? 0,
          isFinished: false,
          lastUpdated: serverTimestamp(),
        });
      } catch (_) {
        // ignore
      }
    };

    pushTimer();
  }, [secondsLeft, running, matchSeconds, canControlMatch]);

  useEffect(() => {
    if (!isControllerSession) return;
    if (!teamA || !teamB || !standbyTeam) return;

    hardResetMatchDoc(
      {
        matchNumber: currentMatchNo,
        teamAId,
        teamBId,
        standbyId,
        teamALabel: teamA.label,
        teamBLabel: teamB.label,
        standbyLabel: standbyTeam.label,
      },
      matchSeconds
    );
  }, [
    isControllerSession,
    currentMatchNo,
    teamAId,
    teamBId,
    standbyId,
    teamA,
    teamB,
    standbyTeam,
    matchSeconds,
  ]);

  const displaySeconds = useMemo(() => {
    if (typeof secondsLeft === "number" && !Number.isNaN(secondsLeft)) {
      return secondsLeft;
    }
    return matchSeconds ?? 0;
  }, [secondsLeft, matchSeconds]);

  const formattedTime = useMemo(() => {
    const m = Math.floor(displaySeconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (displaySeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [displaySeconds]);

  const liveFormattedTime = useMemo(() => {
    if (additionalTimeRunning || additionalTimeSecondsLeft > 0) {
      return formatSeconds(additionalTimeSecondsLeft);
    }

    return formattedTime;
  }, [additionalTimeRunning, additionalTimeSecondsLeft, formattedTime]);

  const goalsA = currentEvents.filter(
    (e) => e.teamId === teamAId && e.type === "goal"
  ).length;

  const goalsB = currentEvents.filter(
    (e) => e.teamId === teamBId && e.type === "goal"
  ).length;

  const verifiedLineupA = sanitizedConfirmedSnapshots?.[teamAId] || null;
  const verifiedLineupB = sanitizedConfirmedSnapshots?.[teamBId] || null;

  const selectedSnapshot =
    scoringTeamId === teamAId ? verifiedLineupA : verifiedLineupB;

  const goalRecorderChoices = useMemo(() => {
    const snapshot =
      scoringTeamId === teamAId
        ? verifiedLineupA
        : scoringTeamId === teamBId
        ? verifiedLineupB
        : null;

    const fallbackTeam =
      scoringTeamId === teamAId
        ? teamA
        : scoringTeamId === teamBId
        ? teamB
        : null;

    return buildGoalRecorderChoices({
      snapshot,
      fallbackPlayers: fallbackTeam?.players || [],
      canonicalName,
      playerKeyFor,
      formationMap: liveFormationsMap,
      defaultFormationId: liveDefaultFormationId,
    });
  }, [
    scoringTeamId,
    verifiedLineupA,
    verifiedLineupB,
    teamA,
    teamB,
    teamAId,
    teamBId,
    canonicalName,
    playerKeyFor,
    liveFormationsMap,
    liveDefaultFormationId,
  ]);

  const assistOptions = useMemo(() => {
    return goalRecorderChoices.filter((entry) => entry.name !== scorerName);
  }, [goalRecorderChoices, scorerName]);

  const goalRecorderChoicesForTeam = (teamId) =>
    buildGoalRecorderChoices({
      snapshot: teamId === teamAId ? verifiedLineupA : verifiedLineupB,
      fallbackPlayers: teamId === teamAId ? teamA?.players || [] : teamB?.players || [],
      canonicalName,
      playerKeyFor,
      formationMap: liveFormationsMap,
      defaultFormationId: liveDefaultFormationId,
    });

  const basicSummary = {
    matchNumber: currentMatchNo,
    teamAId,
    teamBId,
    standbyId,
    teamALabel: teamA?.label || "",
    teamBLabel: teamB?.label || "",
    standbyLabel: standbyTeam?.label || "",
  };

  const teamAAccent = getTeamAccent(teamA || {});
  const teamBAccent = getTeamAccent(teamB || {});

  const handleConfirmLineups = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can confirm match lineups.");
      return;
    }

    if (lineupHasEmptyPositions(verifyTeamALineup, liveFormationsMap, liveDefaultFormationId)) {
      window.alert(
        `${teamA?.label || "Team A"} lineup is incomplete. Please fill all required positions before confirming.`
      );
      return;
    }

    if (lineupHasEmptyPositions(verifyTeamBLineup, liveFormationsMap, liveDefaultFormationId)) {
      window.alert(
        `${teamB?.label || "Team B"} lineup is incomplete. Please fill all required positions before confirming.`
      );
      return;
    }

    const confirmedByName = getIdentityDisplayName(identity);
    const confirmedByRole = role;

    const snapshotA = createVerifiedLineupSnapshot({
      teamId: teamAId,
      lineup: verifyTeamALineup,
      formationMap: liveFormationsMap,
      registeredPlayers: buildRegisteredFallbackPlayers(
        teamA?.players || [],
        verifyTeamALineup,
        canonicalName
      ),
      confirmedBy: confirmedByName,
      confirmedByRole,
      preferredCaptainNames: getTeamCaptainNames(teamA, canonicalName),
    });

    const snapshotB = createVerifiedLineupSnapshot({
      teamId: teamBId,
      lineup: verifyTeamBLineup,
      formationMap: liveFormationsMap,
      registeredPlayers: buildRegisteredFallbackPlayers(
        teamB?.players || [],
        verifyTeamBLineup,
        canonicalName
      ),
      confirmedBy: confirmedByName,
      confirmedByRole,
      preferredCaptainNames: getTeamCaptainNames(teamB, canonicalName),
    });

    const merged = {
      [teamAId]: snapshotA,
      [teamBId]: snapshotB,
    };

    setLocalConfirmedSnapshots(merged);
    onConfirmPreMatchLineups?.(merged);
    setShowVerifyModal(false);
  };

  const addAdditionalTime = (seconds) => {
    const extra = Number(seconds || 0);
    if (!extra) return;

    setAdditionalTimeTotalSeconds(extra);
    setAdditionalTimeFinished(false);

    if (timeUp || displaySeconds <= 0) {
      setAdditionalTimeSecondsLeft(extra);
      setAdditionalTimeRunning(true);
      setPendingAdditionalTimeSeconds(0);
    } else {
      setPendingAdditionalTimeSeconds(extra);
    }

    setShowAdditionalTimeModal(false);
  };

  useEffect(() => {
    if (!pendingAdditionalTimeSeconds) return;
    if (!timeUp && displaySeconds > 0) return;

    setAdditionalTimeTotalSeconds(pendingAdditionalTimeSeconds);
    setAdditionalTimeSecondsLeft(pendingAdditionalTimeSeconds);
    setAdditionalTimeRunning(true);
    setAdditionalTimeFinished(false);
    setPendingAdditionalTimeSeconds(0);
  }, [timeUp, displaySeconds, pendingAdditionalTimeSeconds]);

  useEffect(() => {
    if (!additionalTimeRunning) return;
    if (additionalTimeSecondsLeft <= 0) {
      setAdditionalTimeRunning(false);
      setAdditionalTimeFinished(true);
      return;
    }

    const id = setInterval(() => {
      setAdditionalTimeSecondsLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(id);
  }, [additionalTimeRunning, additionalTimeSecondsLeft]);

  const handleStartGoalRecord = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can record goals.");
      return;
    }
    if (!hasVerifiedLineups) {
      window.alert("Verify lineups before recording goals.");
      return;
    }

    setEditingGoalIndex(null);
    setShowGoalRecorder(true);
    setGoalStep("scorer");
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
  };

  const handleChooseScoringTeam = (teamId) => {
    setScoringTeamId(teamId);
    setScorerName("");
    setAssistName("");
    setGoalStep("scorer");
  };

  const handleCancelGoalRecord = () => {
    setShowGoalRecorder(false);
    setEditingGoalIndex(null);
    setGoalStep("scorer");
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
  };

  const handleAddEvent = async () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can record goals.");
      return;
    }

    if (!hasVerifiedLineups) {
      window.alert("Verify lineups before recording goals.");
      return;
    }

    if (!scoringTeamId) {
      window.alert("Select the team that scored first.");
      return;
    }

    if (!scorerName) return;

    const relevantSnapshot =
      scoringTeamId === teamAId ? verifiedLineupA : verifiedLineupB;

    const scorerIsGuest = isGuestPlayerInSnapshot(relevantSnapshot, scorerName);
    const assistIsGuest = assistName
      ? isGuestPlayerInSnapshot(relevantSnapshot, assistName)
      : false;

    const event = {
      id: Date.now().toString(),
      type: "goal",
      teamId: scoringTeamId,
      scorer: scorerName,
      assist: assistName ? assistName : null,
      scorerType: scorerIsGuest ? "guest" : "registered",
      assistType: assistName
        ? assistIsGuest
          ? "guest"
          : "registered"
        : null,
      timeSeconds: matchSeconds - displaySeconds,
    };

    onAddEvent(event);
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
    setShowGoalRecorder(false);
    setGoalStep("team");

    appendEventToFirestore(event, basicSummary, displaySeconds, matchSeconds);
  };

  const handleEditGoal = (index) => {
    if (!canControlMatch) return;

    const event = currentEvents[index];
    if (!event || event.type !== "goal") return;

    setEditingGoalIndex(index);
    setScoringTeamId(event.teamId || "");
    setScorerName(event.scorer || "");
    setAssistName(event.assist || "");
    setGoalStep("scorer");
    setShowGoalRecorder(true);
  };

  const handleSaveEditedGoal = async () => {
    if (!canControlMatch || editingGoalIndex === null) return;
    if (!scoringTeamId || !scorerName) return;

    const originalEvent = currentEvents[editingGoalIndex];
    if (!originalEvent || originalEvent.type !== "goal") return;

    const relevantSnapshot =
      scoringTeamId === teamAId ? verifiedLineupA : verifiedLineupB;

    const scorerIsGuest = isGuestPlayerInSnapshot(relevantSnapshot, scorerName);
    const assistIsGuest = assistName
      ? isGuestPlayerInSnapshot(relevantSnapshot, assistName)
      : false;

    const updatedEvent = {
      ...originalEvent,
      teamId: scoringTeamId,
      scorer: scorerName,
      assist: assistName || null,
      scorerType: scorerIsGuest ? "guest" : "registered",
      assistType: assistName
        ? assistIsGuest
          ? "guest"
          : "registered"
        : null,
      editedAt: new Date().toISOString(),
    };

    const updatedEvents = currentEvents.map((event, index) =>
      index === editingGoalIndex ? updatedEvent : event
    );

    overwriteEventsInFirestore(
      updatedEvents,
      basicSummary,
      displaySeconds,
      matchSeconds
    );

    setEditingGoalIndex(null);
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
    setShowGoalRecorder(false);
    setGoalStep("scorer");
  };

  const handleEndMatchClick = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can end the match.");
      return;
    }
    setShowConfirmModal(true);
    setConfirmCountdown(15);
  };

  useEffect(() => {
    if (!showConfirmModal) return;
    if (confirmCountdown <= 0) {
      handleConfirmFinal();
      return;
    }

    const id = setInterval(() => {
      setConfirmCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(id);
  }, [showConfirmModal, confirmCountdown]);

  const handleGoBackToEdit = () => {
    setShowConfirmModal(false);
    setConfirmCountdown(15);
  };

  const handleConfirmFinal = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can end the match.");
      return;
    }

    stopAlarmLoop(alarmLoopRef);

    setShowConfirmModal(false);
    setConfirmCountdown(15);

    const summary = {
      teamAId,
      teamBId,
      standbyId,
      goalsA,
      goalsB,
    };

    onConfirmEndMatch(summary);

    const finalSummary = {
      ...basicSummary,
      goalsA,
      goalsB,
      verifiedLineups: sanitizedConfirmedSnapshots || null,
    };

    writeFinalSummaryToFirestore(
      finalSummary,
      currentEvents,
      displaySeconds,
      matchSeconds
    );
  };

  const handleRequestDelete = (index) => {
    if (!canControlMatch) return;

    setDeleteIndex(index);
    setDeletePassword("");
    setDeleteError("");
    setShowDeleteModal(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteIndex(null);
    setDeletePassword("");
    setDeleteError("");
  };

  const handleConfirmDelete = () => {
    if (!canControlMatch) {
      setDeleteError("Only captains or admin can delete events.");
      return;
    }

    const password = deletePassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setDeleteError("Invalid captain password.");
      return;
    }

    if (deleteIndex !== null) {
      onDeleteEvent(deleteIndex);
      const newEvents = currentEvents.filter((_, i) => i !== deleteIndex);
      overwriteEventsInFirestore(
        newEvents,
        basicSummary,
        displaySeconds,
        matchSeconds
      );
    }

    handleCancelDelete();
  };

  const handleBackClick = () => {
    if (!canControlMatch) {
      onBackToLanding();
      return;
    }

    setShowBackModal(true);
    setBackPassword("");
    setBackError("");
  };

  const handleCancelBack = () => {
    setShowBackModal(false);
    setBackPassword("");
    setBackError("");
  };

  const handleConfirmDiscardAndBack = () => {
    if (!canControlMatch) {
      setBackError("Only captains or admin can discard a live match.");
      return;
    }

    const password = backPassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setBackError("Invalid captain password.");
      return;
    }

    stopAlarmLoop(alarmLoopRef);

    setShowBackModal(false);
    setBackPassword("");
    setBackError("");

    overwriteEventsInFirestore([], basicSummary, displaySeconds, matchSeconds);

    if (mustVerifyBeforePlay && typeof onCancelPreMatchLineups === "function") {
      onCancelPreMatchLineups();
      return;
    }

    onBackToLanding();
  };

  const handleUndoClick = () => {
    if (!canControlMatch || currentEvents.length === 0) return;

    setShowUndoModal(true);
    setUndoPassword("");
    setUndoError("");
  };

  const handleCancelUndo = () => {
    setShowUndoModal(false);
    setUndoPassword("");
    setUndoError("");
  };

  const handleConfirmUndo = () => {
    if (!canControlMatch) {
      setUndoError("Only captains or admin can undo events.");
      return;
    }

    const password = undoPassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setUndoError("Invalid captain password.");
      return;
    }

    onUndoLastEvent();
    const newEvents = currentEvents.slice(0, -1);

    overwriteEventsInFirestore(
      newEvents,
      basicSummary,
      displaySeconds,
      matchSeconds
    );

    setShowUndoModal(false);
    setUndoPassword("");
    setUndoError("");
  };

  const displayNameA = isMobile ? getShortName(teamA?.label) : teamA?.label;
  const displayNameB = isMobile ? getShortName(teamB?.label) : teamB?.label;

  return (
    <div
      className="page live-page"
      style={{
        opacity: screenDimmed ? 0.42 : 1,
        transition: "opacity 0.8s ease",
      }}
    >
      <header className="header">
        <h1>Match #{currentMatchNo}</h1>

        <p className="muted small">
          Signed in as <strong>{getIdentityDisplayName(identity)}</strong> •{" "}
          <strong>{role}</strong>
          {isCaptain ? " 👑" : ""}
          {isAdmin ? " 🛠️" : ""}
        </p>
      </header>

      <section className="card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <strong>🎮 Match Referee:</strong> {controllerName}
          </div>

          {!canControlCurrentLiveMatch ? (
            <button
              className="secondary-btn"
              type="button"
              onClick={onRequestTakeOverLiveMatch}
            >
              🥷 Request Takeover
            </button>
          ) : (
            <span className="muted small">
              You control this live match
            </span>
          )}
        </div>

        {hasPendingTakeoverRequest && canControlCurrentLiveMatch && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
            }}
          >
            <p style={{ marginBottom: 10 }}>
              <strong>{takeoverRequesterName}</strong> wants to take over
              officiating.
            </p>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="primary-btn"
                type="button"
                onClick={onAcceptTakeoverRequest}
              >
                ✅ Approve
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={onRejectTakeoverRequest}
              >
                ❌ Reject
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="timer-row">
          <div className="live-timer-main-row">
            <div className={`timer-display ${additionalTimeRunning ? "timer-display-added-time" : ""}`}>
              {liveFormattedTime}
              {additionalTimeRunning ? (
                <span className="added-time-sup">
                  +ADDED TIME
                </span>
              ) : null}
            </div>
            {canControlMatch ? (
              <button
                type="button"
                className={`secondary-btn live-add-time-btn ${(displaySeconds <= 120 || timeUp) && !additionalTimeTotalSeconds ? "is-ready" : "is-locked"}`}
                onClick={() => setShowAdditionalTimeModal(true)}
                disabled={(displaySeconds > 120 && !timeUp) || Boolean(additionalTimeTotalSeconds)}
                title={additionalTimeTotalSeconds ? "Additional time already selected" : displaySeconds > 120 && !timeUp ? "Additional time opens in the final 2 minutes" : "Add additional time"}
              >
                {additionalTimeTotalSeconds ? "✅ Time added" : "⏳ Add time"}
              </button>
            ) : null}
          </div>
          {running ? (
            <span className="muted small">
              {additionalTimeRunning
                ? "Additional time running"
                : additionalTimeFinished
                ? "Additional time complete – final whistle ready"
                : pendingAdditionalTimeSeconds
                ? `+${formatSeconds(pendingAdditionalTimeSeconds)} queued after full-time`
                : "Live timer running"}
            </span>
          ) : timeUp ? (
            <span className="timer-warning">
              {additionalTimeFinished
                ? "🏁 Final whistle – close match"
                : "⏱️ Time is up – end match!"}
            </span>
          ) : (
            <span className="muted small">Match not running yet</span>
          )}
        </div>

        <div className="score-row">
          <div className="score-team">
            <strong className="score-team-name">
              <TeamColorBadge team={teamA} short={isMobile} />
            </strong>
            <div className="score-number">{goalsA}</div>
          </div>
          <div className="score-dash">–</div>
          <div className="score-team">
            <strong className="score-team-name">
              <TeamColorBadge team={teamB} short={isMobile} />
            </strong>
            <div className="score-number">{goalsB}</div>
          </div>
        </div>

        <div className="event-input">
          <h3>Goal Recorder</h3>

          {!hasVerifiedLineups && canControlMatch && (
            <p className="muted stats-season-range">
              Verify lineups before recording goals.
            </p>
          )}

          {canControlMatch ? (
            <div className="live-inline-actions">
              <button
                className="primary-btn"
                type="button"
                onClick={handleStartGoalRecord}
                disabled={!hasVerifiedLineups}
              >
                ⚽ Record Goal
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  if (!playersReady) return;
                  setShowVerifyModal(true);
                }}
                disabled={!playersReady}
              >
                🧑 Edit Lineups
              </button>
            </div>
          ) : (
            <p className="muted stats-season-range">
              This is a live view only. Goal recording is controlled by
              captain/admin.
            </p>
          )}
        </div>

        <div className="event-log">
          <div className="event-log-header">
            <h3>Current Match Goals</h3>
          </div>

          {currentEvents.length === 0 && <p className="muted">No goals yet.</p>}

          <ul>
            {currentEvents.map((e, idx) => {
              const team =
                e.teamId === teamAId
                  ? teamA
                  : e.teamId === teamBId
                  ? teamB
                  : null;

              const teamAbbrev = getLiveTeamAbbrev(team);
              const goalTheme = getTeamAccent(team || {});

              return (
                <li
                    key={e.id}
                    className="event-item premium-goal-event"
                    style={{
                      "--goal-team-soft": goalTheme.soft,
                      "--goal-team-border": goalTheme.border,
                      "--goal-team-dot": goalTheme.dot,
                    }}
                  >
                    <div className="premium-goal-main">
                      <span className="premium-goal-icon">⚽</span>
                      <div className="premium-goal-text">
                        <div className="premium-goal-topline">
                          <span className="premium-goal-clock">
                            {formatSeconds(e.timeSeconds)}
                          </span>
                        </div>
                        <div className="premium-goal-scorer">
                          {displayCompactPlayerName(e.scorer)} <span className="premium-goal-abbrev">({teamAbbrev})</span>
                        </div>
                        {e.assist ? (
                          <div className="premium-goal-assist">
                            Assist: {displayCompactPlayerName(e.assist)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {canControlMatch && (
                      <div className="event-actions premium-goal-actions">
                        <button
                          className="link-btn premium-goal-edit"
                          type="button"
                          onClick={() => handleEditGoal(idx)}
                          title="Edit goal"
                        >
                          ✎
                        </button>
                        <button
                          className="link-btn premium-goal-delete"
                          type="button"
                          onClick={() => handleRequestDelete(idx)}
                          title="Delete goal"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </li>
              );
            })}
          </ul>
        </div>

        <div className="actions-row">

          <button
            className="secondary-btn"
            type="button"
            onClick={handleBackClick}
          >
            {canControlMatch ? "⛔ Cancel Game" : "⬅ Back"}
          </button>

          <button
            className="secondary-btn"
            type="button"
            onClick={onGoToStats}
          >
            📊 View Stats
          </button>

          {canControlMatch && (
            <button
              className="primary-btn"
              type="button"
              onClick={handleEndMatchClick}
            >
              🤝 End & Close Match
            </button>
          )}
        </div>
      </section>

      {showAdditionalTimeModal && (
        <div className="modal-backdrop" style={{ zIndex: 12000 }}>
          <div className="modal live-add-time-modal">
            <h3>Additional Time</h3>
            <p className="muted small">
              Choose league stoppage time. This starts after full-time.
            </p>

            <div className="live-add-time-options">
              <button className="secondary-btn" type="button" onClick={() => addAdditionalTime(30)}>
                +30 sec
              </button>
              <button className="primary-btn" type="button" onClick={() => addAdditionalTime(60)}>
                +1 min
              </button>
              <button className="secondary-btn" type="button" onClick={() => addAdditionalTime(90)}>
                +1.5 min
              </button>
            </div>

            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setShowAdditionalTimeModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showGoalRecorder && (
        <div className="modal-backdrop" style={{ zIndex: 12000 }}>
          <div className="modal live-goal-recorder-modal">
            <h3>{editingGoalIndex !== null ? "Edit Goal" : "Record Goal"}</h3>
              <div className="live-goal-recorder-panel">
                {goalStep === "scorer" && (
                  <>
                    <p className="muted small" style={{ marginTop: "-0.25rem" }}>
                      Pick the player who scored. Both squads are shown together.
                    </p>

                    <div className="goal-scorer-two-column">
                      <div className="goal-scorer-team-card">
                        <div className="goal-scorer-team-head">
                          <TeamColorBadge team={teamA} />
                        </div>
                        <PlayerChoiceGrid
                          title="Scorer"
                          players={goalRecorderChoicesForTeam(teamAId)}
                          selectedName={scorerName}
                          onSelect={(name) => {
                            setScoringTeamId(teamAId);
                            setScorerName(name);
                            setAssistName("");
                            if (name) setGoalStep("assist");
                          }}
                          displayCompactPlayerName={displayCompactPlayerName}
                          getPlayerPhoto={getPlayerPhoto}
                          guestSnapshotChecker={(name) =>
                            isGuestPlayerInSnapshot(verifiedLineupA, name)
                          }
                          disabled={!hasVerifiedLineups}
                        />
                      </div>

                      <div className="goal-scorer-team-card">
                        <div className="goal-scorer-team-head">
                          <TeamColorBadge team={teamB} />
                        </div>
                        <PlayerChoiceGrid
                          title="Scorer"
                          players={goalRecorderChoicesForTeam(teamBId)}
                          selectedName={scorerName}
                          onSelect={(name) => {
                            setScoringTeamId(teamBId);
                            setScorerName(name);
                            setAssistName("");
                            if (name) setGoalStep("assist");
                          }}
                          displayCompactPlayerName={displayCompactPlayerName}
                          getPlayerPhoto={getPlayerPhoto}
                          guestSnapshotChecker={(name) =>
                            isGuestPlayerInSnapshot(verifiedLineupB, name)
                          }
                          disabled={!hasVerifiedLineups}
                        />
                      </div>
                    </div>

                    <div className="live-inline-actions">
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={handleCancelGoalRecord}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}

                {goalStep === "assist" && (
                  <>
                    <p className="muted small" style={{ marginTop: "-0.25rem" }}>
                      Assist provider (optional)
                    </p>

                    <div className="goal-scorer-team-card">
                      <div className="goal-scorer-team-head">
                        <strong>
                          ⚽ Scorer: {displayCompactPlayerName(scorerName)}
                        </strong>
                      </div>

                      <div className="live-player-choice-grid">
                        {assistOptions.map((entry) => {
                          const rawName =
                            typeof entry === "string"
                              ? entry
                              : entry?.name || "";

                          const roleTag =
                            typeof entry === "string"
                              ? ""
                              : String(entry?.roleTag || "");

                          const photoData = getPlayerPhoto(rawName);

                          return (
                            <PlayerBenchChip
                              key={rawName}
                              name={displayCompactPlayerName(rawName)}
                              isSelected={assistName === rawName}
                              onClick={() =>
                                setAssistName(
                                  assistName === rawName ? "" : rawName
                                )
                              }
                              photoData={photoData}
                              roleTag={roleTag}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="live-inline-actions">
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={() => {
                          setGoalStep("scorer");
                          setAssistName("");
                        }}
                      >
                        ← Back
                      </button>
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={editingGoalIndex !== null ? handleSaveEditedGoal : handleAddEvent}
                        disabled={!hasVerifiedLineups || !scorerName}
                      >
                        {editingGoalIndex !== null ? "Save Changes" : "Save Goal"}
                      </button>
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={handleCancelGoalRecord}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
          </div>
        </div>
      )}

      {showVerifyModal && (
        <div className="modal-backdrop" style={{ zIndex: 12000 }}>
          <div className="modal live-verify-modal">
            <h3 className="live-lineups-title">Edit lineup positions</h3>
            <p className="muted live-verify-note live-verify-note-compact">
              {teamA?.label || "Team A"} vs {teamB?.label || "Team B"}
            </p>

            <div className="live-lineup-columns">
              {!playersReady ? (
                <div className="live-empty-full">
                  <p className="muted">Loading verified lineups…</p>
                </div>
              ) : (
                <>
                  <LineupBoard
                    title={teamA?.label}
                    team={teamA}
                    lineup={verifyTeamALineup}
                    setLineup={setVerifyTeamALineup}
                    registeredPlayers={buildRegisteredFallbackPlayers(
                      teamA?.players || [],
                      verifyTeamALineup,
                      canonicalName
                    )}
                    canonicalName={canonicalName}
                    displayCompactPlayerName={displayCompactPlayerName}
                    playerKeyFor={playerKeyFor}
                    getPlayerPhoto={getPlayerPhoto}
                    disabled={!canControlMatch}
                    formationMap={liveFormationsMap}
                    defaultFormationId={liveDefaultFormationId}
                  />

                  <LineupBoard
                    title={teamB?.label}
                    team={teamB}
                    lineup={verifyTeamBLineup}
                    setLineup={setVerifyTeamBLineup}
                    registeredPlayers={buildRegisteredFallbackPlayers(
                      teamB?.players || [],
                      verifyTeamBLineup,
                      canonicalName
                    )}
                    canonicalName={canonicalName}
                    displayCompactPlayerName={displayCompactPlayerName}
                    playerKeyFor={playerKeyFor}
                    getPlayerPhoto={getPlayerPhoto}
                    disabled={!canControlMatch}
                    formationMap={liveFormationsMap}
                    defaultFormationId={liveDefaultFormationId}
                  />
                </>
              )}
            </div>

            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  if (mustVerifyBeforePlay && !hasVerifiedLineups) {
                    onCancelPreMatchLineups?.();
                    return;
                  }
                  setShowVerifyModal(false);
                }}
              >
                {mustVerifyBeforePlay && !hasVerifiedLineups
                  ? "Cancel match start"
                  : "Close"}
              </button>

              {canControlMatch && (
                <button
                  className="primary-btn"
                  type="button"
                  onClick={handleConfirmLineups}
                  disabled={!playersReady}
                >
                  Confirm lineups
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="modal-backdrop" style={{ zIndex: 12000 }}>
          <div className="modal">
            <h3>Confirm End of Match</h3>
            <p>
              <TeamColorBadge team={teamA} /> {goalsA} – {goalsB}{" "}
              <TeamColorBadge team={teamB} />
            </p>
            <p>
              Are you sure everything is correct? You have{" "}
              <strong>{confirmCountdown}</strong> seconds to go back and edit.
            </p>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleGoBackToEdit}
              >
                Go back &amp; edit
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmFinal}
              >
                Confirm &amp; lock
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-backdrop" style={{ zIndex: 12000 }}>
          <div className="modal">
            <h3>Confirm Delete Event</h3>
            <p>To delete an event, enter any team captain&apos;s password.</p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteError("");
                }}
                maxLength={4}
              />
              {deleteError && <p className="error-text">{deleteError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmDelete}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackModal && (
        <div className="modal-backdrop" style={{ zIndex: 12000 }}>
          <div className="modal">
            <h3>Discard match &amp; go back?</h3>
            <p>
              This will <strong>lose all current events</strong> for this match
              and return to the main screen.
            </p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={backPassword}
                onChange={(e) => {
                  setBackPassword(e.target.value);
                  setBackError("");
                }}
                maxLength={4}
              />
              {backError && <p className="error-text">{backError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelBack}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmDiscardAndBack}
              >
                ⚠️ Don&apos;t save this game
              </button>
            </div>
          </div>
        </div>
      )}

      {showUndoModal && (
        <div className="modal-backdrop" style={{ zIndex: 12000 }}>
          <div className="modal">
            <h3>Undo last event?</h3>
            <p>To undo the last event, enter any team captain&apos;s password.</p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={undoPassword}
                onChange={(e) => {
                  setUndoPassword(e.target.value);
                  setUndoError("");
                }}
                maxLength={4}
              />
              {undoError && <p className="error-text">{undoError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelUndo}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmUndo}
              >
                Confirm undo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThreeTeamLeagueLiveMatchPage;

function formatSeconds(s) {
  const v = typeof s === "number" && !Number.isNaN(s) ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}