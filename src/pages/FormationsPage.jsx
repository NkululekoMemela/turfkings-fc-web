// src/pages/FormationsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import {
  GAME_TYPE_5,
  GAME_TYPE_11,
  FORMATIONS_5,
  FORMATIONS_11,
  DEFAULT_FORMATION_ID_5,
  DEFAULT_FORMATION_ID_11,
  loadSavedLineups,
  saveLineups,
  writeLineupVariant,
  LINEUP_SAVE_ROLE_CAPTAIN,
  LINEUP_SAVE_ROLE_ADMIN,
  LINEUP_SAVE_ROLE_GENERAL,
} from "../core/lineups.js";
import { buildFormationDecorations } from "../core/matchDayFormationRatings.js";


const GAME_TYPE_6 = "6_aside";
const DEFAULT_FORMATION_ID_6 = "6_2_2_1";

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
  "6_2_3_0": {
    id: "6_2_3_0",
    label: "2-3-0",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 32, y: 68 },
      { id: "def_r", label: "DEF", x: 68, y: 68 },
      { id: "mid_l", label: "MID", x: 24, y: 38 },
      { id: "mid_c", label: "MID", x: 50, y: 33 },
      { id: "mid_r", label: "MID", x: 76, y: 38 },
    ],
  },
  "6_3_2_0": {
    id: "6_3_2_0",
    label: "3-2-0",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 25, y: 68 },
      { id: "def_c", label: "DEF", x: 50, y: 72 },
      { id: "def_r", label: "DEF", x: 75, y: 68 },
      { id: "mid_l", label: "MID", x: 38, y: 43 },
      { id: "mid_r", label: "MID", x: 62, y: 43 },
    ],
  },
};


const GAME_TYPE_7 = "7_aside";
const DEFAULT_FORMATION_ID_7 = "7_3_2_1";

const FORMATIONS_7 = {
  "7_3_2_1": {
    id: "7_3_2_1",
    label: "3-2-1",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 25, y: 68 },
      { id: "def_c", label: "DEF", x: 50, y: 72 },
      { id: "def_r", label: "DEF", x: 75, y: 68 },
      { id: "mid_l", label: "MID", x: 38, y: 43 },
      { id: "mid_r", label: "MID", x: 62, y: 43 },
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
      { id: "mid_c", label: "MID", x: 50, y: 39 },
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
      { id: "fwd_l", label: "ST", x: 38, y: 20 },
      { id: "fwd_r", label: "ST", x: 62, y: 20 },
    ],
  },
  "7_3_1_2": {
    id: "7_3_1_2",
    label: "3-1-2",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def_l", label: "DEF", x: 25, y: 68 },
      { id: "def_c", label: "DEF", x: 50, y: 72 },
      { id: "def_r", label: "DEF", x: 75, y: 68 },
      { id: "mid", label: "MID", x: 50, y: 44 },
      { id: "fwd_l", label: "ST", x: 38, y: 20 },
      { id: "fwd_r", label: "ST", x: 62, y: 20 },
    ],
  },
  "7_1_3_2": {
    id: "7_1_3_2",
    label: "1-3-2",
    positions: [
      { id: "gk", label: "GK", x: 50, y: 88 },
      { id: "def", label: "DEF", x: 50, y: 68 },
      { id: "mid_l", label: "MID", x: 28, y: 45 },
      { id: "mid_c", label: "MID", x: 50, y: 40 },
      { id: "mid_r", label: "MID", x: 72, y: 45 },
      { id: "fwd_l", label: "ST", x: 38, y: 20 },
      { id: "fwd_r", label: "ST", x: 62, y: 20 },
    ],
  },
};

const FORMATIONS_11_WITH_ULTRA_DEFENSIVE = (() => {
  const adjusted = {};

  Object.entries(FORMATIONS_11 || {}).forEach(([key, formation]) => {
    const idText = String(formation?.id || key || "").toLowerCase();
    const labelText = String(formation?.label || "").toLowerCase();
    const isThreeFiveTwo =
      idText.includes("3_5_2") ||
      idText.includes("352") ||
      labelText.includes("3-5-2") ||
      labelText.includes("352");

    if (!isThreeFiveTwo) {
      adjusted[key] = formation;
      return;
    }

    const forwardIndexes = [];
    const positions = (formation?.positions || []).map((pos, index) => {
      const posText = `${pos?.id || ""} ${pos?.label || ""}`.toLowerCase();
      const isForward =
        posText.includes("st") ||
        posText.includes("striker") ||
        posText.includes("cf") ||
        posText.includes("forward") ||
        posText.includes("fwd") ||
        posText.includes("ls") ||
        posText.includes("rs");

      if (isForward) forwardIndexes.push(index);
      return { ...pos };
    });

    if (forwardIndexes.length >= 2) {
      const first = forwardIndexes[0];
      const second = forwardIndexes[1];
      positions[first] = { ...positions[first], x: 34, y: positions[first].y ?? 18 };
      positions[second] = { ...positions[second], x: 66, y: positions[second].y ?? 18 };
    }

    adjusted[key] = {
      ...formation,
      label: "3-5-2",
      positions,
    };
  });

  return {
    ...adjusted,
    "11_5_4_1": {
      id: "11_5_4_1",
      label: "5-4-1",
      positions: [
        { id: "gk", label: "GK", x: 50, y: 91 },
        { id: "lb", label: "LB", x: 17, y: 73 },
        { id: "lcb", label: "LCB", x: 34, y: 76 },
        { id: "cb", label: "CB", x: 50, y: 78 },
        { id: "rcb", label: "RCB", x: 66, y: 76 },
        { id: "rb", label: "RB", x: 83, y: 73 },
        { id: "lm", label: "LM", x: 22, y: 47 },
        { id: "lcm", label: "CM", x: 40, y: 44 },
        { id: "rcm", label: "CM", x: 60, y: 44 },
        { id: "rm", label: "RM", x: 78, y: 47 },
        { id: "st", label: "ST", x: 50, y: 18 },
      ],
    },
  };
})();

function isSmallSidedGameType(type) {
  return type === GAME_TYPE_5 || type === GAME_TYPE_6 || type === GAME_TYPE_7;
}

function getFormationsMapForGameType(type) {
  if (type === GAME_TYPE_11) return FORMATIONS_11_WITH_ULTRA_DEFENSIVE;
  if (type === GAME_TYPE_7) return FORMATIONS_7;
  if (type === GAME_TYPE_6) return FORMATIONS_6;
  return FORMATIONS_5;
}

function getDefaultFormationIdForGameType(type) {
  if (type === GAME_TYPE_11) return DEFAULT_FORMATION_ID_11;
  if (type === GAME_TYPE_7) return DEFAULT_FORMATION_ID_7;
  if (type === GAME_TYPE_6) return DEFAULT_FORMATION_ID_6;
  return DEFAULT_FORMATION_ID_5;
}

function getGameTypeFilenameLabel(type) {
  if (type === GAME_TYPE_11) return "11aside";
  if (type === GAME_TYPE_7) return "7aside";
  if (type === GAME_TYPE_6) return "6aside";
  return "5aside";
}

function getGameTypeLabel(type) {
  if (type === GAME_TYPE_11) return "11-a-side";
  if (type === GAME_TYPE_7) return "7-a-side";
  if (type === GAME_TYPE_6) return "6-a-side";
  return "5-a-side";
}

function gameFormatToFormationGameType(format) {
  const value = String(format || "").trim().toUpperCase();
  if (value === "7_V_7" || value === "7V7" || value === "7_ASIDE") return GAME_TYPE_7;
  if (value === "6_V_6" || value === "6V6" || value === "6_ASIDE") return GAME_TYPE_6;
  return GAME_TYPE_5;
}


function getFormationTacticalLabel(formation, gameType) {
  const id = String(formation?.id || "").toLowerCase();
  const label = String(formation?.label || "").toLowerCase();
  const text = `${id} ${label}`;

  if (gameType === GAME_TYPE_7) {
    if (id === "7_3_2_1" || text.includes("3-2-1")) return "Balanced";
    if (id === "7_2_3_1" || text.includes("2-3-1")) return "Control";
    if (id === "7_2_2_2" || text.includes("2-2-2")) return "Attacking";
    if (id === "7_3_1_2" || text.includes("3-1-2")) return "Counter Attack";
    if (id === "7_1_3_2" || text.includes("1-3-2")) return "High Press";
    return "Balanced";
  }

  if (gameType === GAME_TYPE_6) {
    if (id === "6_3_2_0" || text.includes("3-2-0") || text.includes("3-2")) return "Ultra Defensive";
    if (id === "6_2_3_0" || text.includes("2-3-0")) return "Pressing";
    if (id === "6_2_1_2" || text.includes("2-1-2")) return "Attacking";
    if (id === "6_1_3_1" || text.includes("1-3-1")) return "Control";
    return "Balanced";
  }

  if (gameType === GAME_TYPE_11) {
    if (text.includes("3-5-2") || text.includes("352")) return "Dominance";
    if (text.includes("5-4-1") || text.includes("541") || text.includes("5_4_1")) return "Ultra Defensive";
    if (text.includes("5-") || text.includes("5_")) return "Ultra Defensive";
    if (text.includes("4-5-1") || text.includes("451")) return "Defensive";
    if (text.includes("4-2-3-1") || text.includes("4231")) return "Control";
    if (text.includes("4-3-3") || text.includes("433") || text.includes("3-4-3") || text.includes("343")) return "Attacking";
    if (text.includes("4-4-2") || text.includes("442")) return "Balanced";
    return "Tactical";
  }

  if (text.includes("3-") || text.includes("3_")) return "Ultra Defensive";
  if (text.includes("2-2") || text.includes("22") || text.includes("box")) return "Pressing";
  if (text.includes("1-2-1") || text.includes("121") || text.includes("diamond")) return "Control";
  if (text.includes("1-1-2") || text.includes("112") || text.includes("attack")) return "Attacking";
  if (text.includes("2-1-1") || text.includes("211")) return "Balanced";
  return "Balanced";
}

function getFormationDisplayLabel(formation, gameType) {
  const id = String(formation?.id || "").toLowerCase();
  const label = String(formation?.label || formation?.id || "Formation").trim();
  const text = `${id} ${label}`.toLowerCase();
  const tacticalLabel = getFormationTacticalLabel(formation, gameType);

  const pickShape = () => {
    if (gameType === GAME_TYPE_7) {
      if (id === "7_3_2_1" || text.includes("3-2-1")) return "3-2-1";
      if (id === "7_2_3_1" || text.includes("2-3-1")) return "2-3-1";
      if (id === "7_2_2_2" || text.includes("2-2-2")) return "2-2-2";
      if (id === "7_3_1_2" || text.includes("3-1-2")) return "3-1-2";
      if (id === "7_1_3_2" || text.includes("1-3-2")) return "1-3-2";
    }

    if (gameType === GAME_TYPE_6) {
      if (id === "6_2_2_1" || text.includes("2-2-1")) return "2-2-1";
      if (id === "6_1_3_1" || text.includes("1-3-1")) return "1-3-1";
      if (id === "6_2_1_2" || text.includes("2-1-2")) return "2-1-2";
      if (id === "6_2_3_0" || text.includes("2-3-0")) return "2-3-0";
      if (id === "6_3_2_0" || text.includes("3-2-0") || text.includes("3-2")) return "3-2-0";
    }

    if (gameType === GAME_TYPE_11) {
      if (text.includes("3-5-2") || text.includes("352")) return "3-5-2";
      if (text.includes("5-4-1") || text.includes("541") || text.includes("5_4_1")) return "5-4-1";
      if (text.includes("4-3-3") || text.includes("433")) return "4-3-3";
      if (text.includes("4-4-2") || text.includes("442")) return "4-4-2";
      if (text.includes("4-2-3-1") || text.includes("4231")) return "4-2-3-1";
      if (text.includes("3-4-3") || text.includes("343")) return "3-4-3";
      if (text.includes("4-1-4-1") || text.includes("4141")) return "4-1-4-1";
      if (text.includes("4-5-1") || text.includes("451")) return "4-5-1";
    }

    if (text.includes("2-1-1") || text.includes("211")) return "2-1-1";
    if (text.includes("1-2-1") || text.includes("121")) return "1-2-1";
    if (text.includes("1-1-2") || text.includes("112")) return "1-1-2";
    if (text.includes("2-2-0") || text.includes("220") || text.includes("box")) return "2-2-0";
    if (text.includes("3-1-0") || text.includes("310")) return "3-1-0";

    const match = label.match(/\b\d-\d(?:-\d)?(?:-\d)?\b/);
    if (match) return match[0];

    return label
      .replace(/\b(ultra defensive|defensive|dominance|attacking|balanced|control|pressing|tactical)\b/gi, "")
      .replace(/^\s*[-–—:]\s*/, "")
      .replace(/\s*[-–—:]\s*$/, "")
      .trim() || label;
  };

  return `${pickShape()} - ${tacticalLabel}`;
}

// ---------------- HELPERS ----------------

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normKey(x) {
  return String(x || "").trim().toLowerCase();
}

function slugFromName(name) {
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

function getLocalDateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateOnly(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function getFriendlyHistoryDateKey(day = {}) {
  const candidates = [
    day?.id,
    day?.matchDayId,
    day?.date,
    day?.day,
    day?.createdAt,
    day?.updatedAt,
  ];

  for (const value of candidates) {
    const iso = isoDateOnly(value);
    if (iso) return iso;
  }

  for (const value of candidates) {
    const raw = String(value || "").trim();
    if (!raw || raw.toUpperCase() === "FRIENDLY" || raw === "UNKNOWN") continue;

    const parsed = new Date(raw);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      return getLocalDateKey(parsed);
    }
  }

  return "";
}

function isTodayFriendlyHistoryDay(day = {}) {
  const todayKey = getLocalDateKey(new Date());
  const dayKey = getFriendlyHistoryDateKey(day);
  return Boolean(todayKey && dayKey && todayKey === dayKey);
}

function uniqueByLower(list = []) {
  const seen = new Set();
  const out = [];

  list.forEach((item) => {
    const value = String(item || "").trim();
    if (!value) return;
    const key = normKey(value);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });

  return out;
}

function removeNameFromList(list = [], name = "") {
  const target = normKey(name);
  return (list || []).filter((item) => normKey(item) !== target);
}

function moveNameToFront(list = [], name = "") {
  const clean = String(name || "").trim();
  if (!clean) return uniqueByLower(list);
  return uniqueByLower([clean, ...removeNameFromList(list, clean)]);
}

function swapNamesInList(list = [], a = "", b = "") {
  const aKey = normKey(a);
  const bKey = normKey(b);

  const swapped = (list || []).map((item) => {
    const key = normKey(item);
    if (key === aKey) return b;
    if (key === bKey) return a;
    return item;
  });

  return uniqueByLower(swapped);
}

function buildOrderedBenchPool(unassignedPlayers = [], benchSnapshot = []) {
  const current = uniqueByLower(unassignedPlayers || []);
  const snapshot = uniqueByLower(benchSnapshot || []);
  const currentSet = new Set(current.map(normKey));

  const orderedFromSnapshot = snapshot.filter((name) =>
    currentSet.has(normKey(name))
  );

  const alreadyUsed = new Set(orderedFromSnapshot.map(normKey));
  const remaining = current.filter((name) => !alreadyUsed.has(normKey(name)));

  return [...orderedFromSnapshot, ...remaining];
}

function buildDefaultLineupLocal(playerList, formationId, formationsMap) {
  const formation =
    formationsMap[formationId] ||
    formationsMap[Object.keys(formationsMap)[0]];

  const players = playerList || [];
  const positions = {};

  formation.positions.forEach((pos, idx) => {
    positions[pos.id] = players[idx] || null;
  });

  return {
    formationId: formation.id,
    positions,
    guestPlayers: [],
    benchSnapshot: [],
    meta: {
      savedByRole: LINEUP_SAVE_ROLE_GENERAL,
      savedByEmail: null,
      savedByName: null,
      savedAt: null,
      teamCaptainPreferred: false,
    },
  };
}

function sanitizeLineupShapeLocal(
  lineup,
  formationsMap,
  defaultFormationId,
  playerPool = []
) {
  if (!lineup || typeof lineup !== "object") {
    return buildDefaultLineupLocal(playerPool, defaultFormationId, formationsMap);
  }

  const formationId =
    lineup.formationId && formationsMap[lineup.formationId]
      ? lineup.formationId
      : defaultFormationId;

  const formation =
    formationsMap[formationId] ||
    formationsMap[Object.keys(formationsMap)[0]];

  const validPlayers = uniqueByLower(
    (playerPool || []).map((p) => toTitleCase(p))
  );
  const validSet = new Set(validPlayers.map(normKey));

  const cleanPositions = {};
  const used = new Set();

  formation.positions.forEach((pos) => {
    const raw = lineup?.positions?.[pos.id];
    const name = raw ? toTitleCase(raw) : null;
    const key = normKey(name);

    if (name && validSet.has(key) && !used.has(key)) {
      cleanPositions[pos.id] = name;
      used.add(key);
    } else {
      cleanPositions[pos.id] = null;
    }
  });

  const remaining = validPlayers.filter((p) => !used.has(normKey(p)));

  formation.positions.forEach((pos) => {
    if (!cleanPositions[pos.id] && remaining.length > 0) {
      const next = remaining.shift();
      cleanPositions[pos.id] = next;
      used.add(normKey(next));
    }
  });

  return {
    formationId: formation.id,
    positions: cleanPositions,
    guestPlayers: uniqueByLower(lineup.guestPlayers || []),
    benchSnapshot: buildOrderedBenchPool(remaining, lineup?.benchSnapshot || []),
    meta: {
      savedByRole: lineup?.meta?.savedByRole || LINEUP_SAVE_ROLE_GENERAL,
      savedByEmail: lineup?.meta?.savedByEmail || null,
      savedByName: lineup?.meta?.savedByName || null,
      savedAt: lineup?.meta?.savedAt || null,
      teamCaptainPreferred: !!lineup?.meta?.teamCaptainPreferred,
    },
  };
}

function getSavedAtMs(lineup) {
  const raw = lineup?.meta?.savedAt || "";
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function getRoleTieBreaker(role) {
  if (role === LINEUP_SAVE_ROLE_CAPTAIN) return 3;
  if (role === LINEUP_SAVE_ROLE_ADMIN) return 2;
  if (role === LINEUP_SAVE_ROLE_GENERAL) return 1;
  return 0;
}

function pickLatestStoredVariant(modeEntry) {
  if (!modeEntry || typeof modeEntry !== "object") return null;

  if (modeEntry.formationId) {
    return modeEntry;
  }

  const variants = modeEntry.variants || {};
  const candidates = Object.entries(variants)
    .map(([role, lineup]) => ({
      role,
      lineup,
      savedAtMs: getSavedAtMs(lineup),
      tieBreaker: getRoleTieBreaker(role),
    }))
    .filter((x) => x.lineup);

  if (candidates.length === 0) {
    return modeEntry.default || null;
  }

  candidates.sort((a, b) => {
    if (b.savedAtMs !== a.savedAtMs) return b.savedAtMs - a.savedAtMs;
    return b.tieBreaker - a.tieBreaker;
  });

  return candidates[0].lineup;
}

function getCurrentDefaultVariantInfoLocal(lineupsByTeam, teamId, gameType) {
  const teamEntry = lineupsByTeam?.[teamId];
  if (!teamEntry) return null;

  if (teamEntry.formationId) {
    return {
      role: LINEUP_SAVE_ROLE_GENERAL,
      lineup: teamEntry,
    };
  }

  const modeEntry = teamEntry?.[gameType];
  if (!modeEntry) return null;

  const variants = modeEntry.variants || {};
  const candidates = Object.entries(variants)
    .map(([role, lineup]) => ({
      role,
      lineup,
      savedAtMs: lineup?.meta?.savedAt
        ? new Date(lineup.meta.savedAt).getTime()
        : 0,
      tieBreaker: getRoleTieBreaker(role),
    }))
    .filter((x) => x.lineup);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.savedAtMs !== a.savedAtMs) return b.savedAtMs - a.savedAtMs;
    return b.tieBreaker - a.tieBreaker;
  });

  return {
    role: candidates[0].role,
    lineup: candidates[0].lineup,
  };
}

function resolveLatestPreferredTeamLineup(
  team,
  gameType,
  lineupsByTeam,
  formationsMap,
  defaultFormationId,
  playerPool
) {
  const players = playerPool || [];
  if (!team) {
    return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
  }

  const existing = lineupsByTeam?.[team.id];
  if (!existing) {
    return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
  }

  if (existing.formationId) {
    if (isSmallSidedGameType(gameType) && formationsMap[existing.formationId]) {
      return sanitizeLineupShapeLocal(
        existing,
        formationsMap,
        defaultFormationId,
        players
      );
    }
    return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
  }

  const modeEntry = existing?.[gameType];
  const chosen = pickLatestStoredVariant(modeEntry);

  if (chosen) {
    return sanitizeLineupShapeLocal(
      chosen,
      formationsMap,
      defaultFormationId,
      players
    );
  }

  return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
}

function getSaveRole(
  identity,
  authUser,
  selectedTeamCanonical,
  gameType,
  canonicalName
) {
  const playerId = String(
    authUser?.playerId ||
      authUser?.memberId ||
      identity?.playerId ||
      identity?.memberId ||
      ""
  )
    .trim()
    .toLowerCase();

  const teamCaptainId = String(selectedTeamCanonical?.captainId || "")
    .trim()
    .toLowerCase();

  const explicitRole = String(authUser?.role || identity?.role || "")
    .trim()
    .toLowerCase();

  const displayName =
    authUser?.fullName ||
    identity?.fullName ||
    identity?.displayName ||
    identity?.shortName ||
    identity?.name ||
    null;

  const canonicalDisplayName = displayName ? canonicalName(displayName) : null;

  if (gameType === GAME_TYPE_11 && explicitRole === "admin") {
    return {
      savedByRole: LINEUP_SAVE_ROLE_CAPTAIN,
      teamCaptainPreferred: true,
      savedByEmail: String(authUser?.email || identity?.email || "").trim() || null,
      savedByName: canonicalDisplayName || displayName || null,
    };
  }

  if (
    isSmallSidedGameType(gameType) &&
    teamCaptainId &&
    playerId &&
    playerId === teamCaptainId
  ) {
    return {
      savedByRole: LINEUP_SAVE_ROLE_CAPTAIN,
      teamCaptainPreferred: true,
      savedByEmail: String(authUser?.email || identity?.email || "").trim() || null,
      savedByName: canonicalDisplayName || displayName || null,
    };
  }

  if (explicitRole === "admin") {
    return {
      savedByRole: LINEUP_SAVE_ROLE_ADMIN,
      teamCaptainPreferred: false,
      savedByEmail: String(authUser?.email || identity?.email || "").trim() || null,
      savedByName: canonicalDisplayName || displayName || null,
    };
  }

  return {
    savedByRole: LINEUP_SAVE_ROLE_GENERAL,
    teamCaptainPreferred: false,
    savedByEmail: String(authUser?.email || identity?.email || "").trim() || null,
    savedByName: canonicalDisplayName || displayName || null,
  };
}

function makeSavedLineup(
  updatedLineup,
  canonicalName,
  identity,
  authUser,
  selectedTeamCanonical,
  gameType
) {
  const canonPositions = {};
  Object.keys(updatedLineup.positions || {}).forEach((posId) => {
    const v = updatedLineup.positions[posId];
    canonPositions[posId] = v ? canonicalName(v) : null;
  });

  const metaBits = getSaveRole(
    identity,
    authUser,
    selectedTeamCanonical,
    gameType,
    canonicalName
  );

  return {
    ...updatedLineup,
    positions: canonPositions,
    guestPlayers: updatedLineup.guestPlayers || [],
    benchSnapshot: updatedLineup.benchSnapshot || [],
    meta: {
      savedByRole: metaBits.savedByRole,
      savedByEmail: metaBits.savedByEmail,
      savedByName: metaBits.savedByName,
      savedAt: new Date().toISOString(),
      teamCaptainPreferred: metaBits.teamCaptainPreferred,
    },
  };
}

function StatCornerBadge({ icon, count }) {
  if (!count || count <= 0) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "1px",
        color: "#ffffff",
        fontWeight: 900,
        fontSize: "0.68rem",
        lineHeight: 1,
        textShadow:
          "0 1px 2px rgba(2,6,23,0.95), 0 0 4px rgba(2,6,23,0.85)",
        pointerEvents: "none",
        minHeight: "10px",
      }}
      title={`${count} ${icon === "⚽" ? "goal" : "assist"}${count > 1 ? "s" : ""}`}
    >
      <span style={{ lineHeight: 1 }}>{icon}</span>
      {count > 1 ? (
        <sup
          style={{
            fontSize: "0.5rem",
            lineHeight: 1,
            fontWeight: 900,
            color: "#ffffff",
            marginTop: "-5px",
            textShadow:
              "0 1px 2px rgba(2,6,23,1), 0 0 4px rgba(2,6,23,0.95)",
          }}
        >
          {count}
        </sup>
      ) : null}
    </div>
  );
}

function PlayerBenchChip({
  name,
  isSelected,
  onClick,
  photoData,
  disabled = false,
  decor = null,
}) {
  const rating = decor?.rating != null ? Number(decor.rating || 0) : null;
  const goals = Number(decor?.icons?.goals || 0);
  const assists = Number(decor?.icons?.assists || 0);

  return (
    <button
      type="button"
      className={`bench-player ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.42rem",
        padding: "0.34rem 0.62rem",
      }}
    >
      <span
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "999px",
          overflow: "hidden",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: photoData
            ? "transparent"
            : "radial-gradient(circle at 30% 20%, #38bdf8, #0f172a)",
          border: "1px solid rgba(255,255,255,0.35)",
        }}
      >
        {photoData ? (
          <img
            src={photoData}
            alt={name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              color: "#e5e7eb",
            }}
          >
            {String(name || "?").charAt(0).toUpperCase()}
          </span>
        )}
      </span>

      <span>{name}</span>

      {rating != null ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "28px",
            padding: "0.12rem 0.34rem",
            borderRadius: "999px",
            background: "rgba(34,197,94,0.16)",
            border: "1px solid rgba(34,197,94,0.32)",
            color: "#86efac",
            fontWeight: 900,
            fontSize: "0.76rem",
            lineHeight: 1,
          }}
        >
          {rating.toFixed(1)}
        </span>
      ) : null}

      {(goals > 0 || assists > 0) ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.18rem",
            marginLeft: "-0.1rem",
          }}
        >
          <StatCornerBadge icon="⚽" count={goals} />
          <StatCornerBadge icon="👟" count={assists} />
        </span>
      ) : null}
    </button>
  );
}

const PLAYERS_COLLECTION = "players";
const LONG_PRESS_MS = 650;
const MAX_SUBS = 6;

export function FormationsPage({
  teams = [],
  fiveVFiveTeams = [],
  currentMatch,
  currentEvents = [],
  allEvents = [],
  results = [],
  friendlyMatchDayHistory = [],
  playerPhotosByName = {},
  identity = null,
  authUser = null,
  onBack,
  onGoToSquads,
  matchType = "FRIENDLY",
  gameFormat = "5_V_5",
}) {
  const canEditLineups = true;
  const isFriendlyMatch = String(matchType || "FRIENDLY").toUpperCase() !== "LEAGUE";

  const [lineupsByTeam, setLineupsByTeam] = useState(() => loadSavedLineups());

  const sourceTeams = useMemo(() => {
    if (!isFriendlyMatch) return teams || [];
    return Array.isArray(fiveVFiveTeams) && fiveVFiveTeams.length
      ? fiveVFiveTeams
      : [];
  }, [isFriendlyMatch, teams, fiveVFiveTeams]);

  const initialTeamId =
    currentMatch?.teamAId || (sourceTeams[0] ? sourceTeams[0].id : null);

  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);

  const [gameType, setGameType] = useState(() => gameFormatToFormationGameType(gameFormat));

  const selectedSmallSidedGameType = useMemo(
    () => gameFormatToFormationGameType(gameFormat),
    [gameFormat]
  );

  const visibleGameTypeOptions = useMemo(
    () => [selectedSmallSidedGameType, GAME_TYPE_11],
    [selectedSmallSidedGameType]
  );

  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [savingFormationImage, setSavingFormationImage] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const exportRef = useRef(null);
  const longPressTimerRef = useRef(null);

  useEffect(() => {
    const nextGameType = gameFormatToFormationGameType(gameFormat);
    if (isSmallSidedGameType(nextGameType)) {
      setGameType(nextGameType);
    }
  }, [gameFormat]);

  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 6);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const safeTeamIds = new Set((sourceTeams || []).map((t) => t.id));
    if (!selectedTeamId || !safeTeamIds.has(selectedTeamId)) {
      setSelectedTeamId(sourceTeams[0]?.id || null);
    }
  }, [sourceTeams, selectedTeamId]);

  useEffect(() => {
    const colRef = collection(db, PLAYERS_COLLECTION);

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};

          const fullName = toTitleCase(
            data.fullName || data.displayName || data.name || data.playerName || ""
          );

          const shortName = toTitleCase(
            data.shortName ||
              data.name ||
              data.displayName ||
              firstNameOf(fullName) ||
              fullName
          );

          const aliases = Array.isArray(data.aliases)
            ? data.aliases.map((a) => toTitleCase(a)).filter(Boolean)
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
      },
      (err) => {
        console.error("Error loading players for formations:", err);
      }
    );

    return () => unsub();
  }, []);

  const playerResolver = useMemo(() => {
    const byAny = new Map();
    const firstNameCounts = new Map();

    players.forEach((p) => {
      const keys = new Set();

      const addKey = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return;

        const pretty = toTitleCase(raw);

        keys.add(normKey(raw));
        keys.add(normKey(pretty));
        keys.add(normKey(slugFromName(raw)));
        keys.add(normKey(slugFromName(pretty)));

        const first = normKey(firstNameOf(pretty));
        if (first) {
          firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
          keys.add(first);
        }
      };

      addKey(p.id);
      addKey(p.fullName);
      addKey(p.shortName);
      (p.aliases || []).forEach((a) => addKey(a));

      keys.forEach((k) => {
        if (k && !byAny.has(k)) {
          byAny.set(k, p);
        }
      });
    });

    function resolve(rawLabel) {
      const raw = toTitleCase(rawLabel || "");
      const k = normKey(raw);
      if (!k) return { display: "", player: null };

      const exact = byAny.get(k);
      if (exact) return { display: exact.fullName || raw, player: exact };

      const slug = normKey(slugFromName(raw));
      const bySlug = byAny.get(slug);
      if (bySlug) return { display: bySlug.fullName || raw, player: bySlug };

      const first = normKey(firstNameOf(raw));
      if (first && firstNameCounts.get(first) === 1) {
        const candidate = byAny.get(first);
        if (candidate) {
          return { display: candidate.fullName || raw, player: candidate };
        }
      }

      return { display: raw, player: null };
    }

    return { resolve };
  }, [players]);

  const canonicalName = (raw) => playerResolver.resolve(raw).display;

  const displayCompactName = (raw) => {
    if (!raw) return "";
    const resolved = playerResolver.resolve(raw);

    const p = resolved?.player;
    const full = resolved?.display || toTitleCase(raw);

    if (p) {
      const sn = String(p.shortName || "").trim();
      if (sn) return sn;
      return String(p.fullName || full).split(/\s+/)[0] || full;
    }

    return String(full).split(/\s+/)[0] || full;
  };

  const [playerPhotos, setPlayerPhotos] = useState(playerPhotosByName || {});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [showPhotoPanel, setShowPhotoPanel] = useState(false);

  useEffect(() => {
    if (!playerPhotosByName) return;
    setPlayerPhotos((prev) => ({
      ...prev,
      ...playerPhotosByName,
    }));
  }, [playerPhotosByName]);

  useEffect(() => {
    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        const rawPhotos = [];

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (data?.photoData) {
            rawPhotos.push({
              docId: docSnap.id,
              name: data.name || "",
              photoData: data.photoData,
            });
          }
        });

        setPlayerPhotos((prev) => {
          const next = { ...prev };

          rawPhotos.forEach((p) => {
            const candidates = [
              p.name,
              toTitleCase(p.name),
              p.docId,
              toTitleCase(String(p.docId || "").replace(/_/g, " ")),
              firstNameOf(p.name),
            ].filter(Boolean);

            let assignedKey = null;

            for (const c of candidates) {
              const resolved = playerResolver.resolve(c);
              if (resolved?.display) {
                assignedKey = resolved.display;
                break;
              }
            }

            const fallbackKey = toTitleCase(p.name || p.docId || "Unknown");
            next[assignedKey || fallbackKey] = p.photoData;
          });

          return next;
        });
      } catch (err) {
        console.error("Failed to load player photos:", err);
      }
    }

    loadPhotos();
  }, [playerResolver]);

  const getPlayerPhoto = (name) => {
    if (!name) return null;

    const canon = canonicalName(name);
    const compact = displayCompactName(name);

    const candidates = [
      canon,
      compact,
      firstNameOf(canon),
      firstNameOf(compact),
      slugFromName(canon),
      slugFromName(compact),
      name,
      toTitleCase(name),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (playerPhotos[candidate]) return playerPhotos[candidate];
      const key = Object.keys(playerPhotos).find(
        (k) => normKey(k) === normKey(candidate)
      );
      if (key && playerPhotos[key]) return playerPhotos[key];
    }

    return null;
  };

  const verifiedPlayerName = useMemo(() => {
    const role = identity?.role || authUser?.role || null;
    const isRealPlayer = role === "player" || role === "captain" || role === "admin";

    if (!isRealPlayer) return null;

    const rawName =
      authUser?.fullName ||
      identity?.fullName ||
      identity?.shortName ||
      identity?.displayName ||
      identity?.name ||
      null;

    if (!rawName) return null;
    return canonicalName(rawName);
  }, [identity, authUser, playerResolver]);

  const isVerifiedPlayer = !!verifiedPlayerName;
  const photoPlayer = verifiedPlayerName;

  const handlePhotoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isVerifiedPlayer || !photoPlayer) {
      setPhotoMessage(
        "We can't tell which player you are. Please verify your player identity on the home screen first."
      );
      e.target.value = "";
      return;
    }

    setPhotoMessage("");
    setUploadingPhoto(true);

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const docId = slugFromName(photoPlayer);

      await setDoc(
        doc(db, "playerPhotos", docId),
        {
          name: photoPlayer,
          teamId: selectedTeamCanonical ? selectedTeamCanonical.id : "turf_kings",
          photoData: dataUrl,
          updatedAt: serverTimestamp(),
          uploadedByEmail: authUser?.email || identity?.email || null,
        },
        { merge: true }
      );

      setPlayerPhotos((prev) => ({
        ...prev,
        [photoPlayer]: dataUrl,
      }));

      setPhotoMessage(`Photo saved for ${photoPlayer} ✅`);
    } catch (err) {
      console.error("Failed to upload player photo:", err);
      setPhotoMessage("Could not save photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const activeDbPlayers = useMemo(() => {
    return players
      .filter((p) => String(p.status || "active").toLowerCase() === "active")
      .map((p) => canonicalName(p.fullName || p.shortName || p.id || ""))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [players, playerResolver]);

  const turfKingsPlayers = useMemo(() => {
    return uniqueByLower(activeDbPlayers);
  }, [activeDbPlayers]);

  const canonicalTeams = useMemo(() => {
    return (sourceTeams || []).map((t) => ({
      ...t,
      players: (t.players || [])
        .map((p) => {
          const raw = typeof p === "string" ? p : p?.name || p?.displayName || "";
          return canonicalName(raw);
        })
        .filter(Boolean),
      captain: canonicalName(t.captain || ""),
      captainId: t.captainId || null,
    }));
  }, [sourceTeams, playerResolver]);

  const selectedTeamCanonical =
    canonicalTeams.find((t) => t.id === selectedTeamId) || canonicalTeams[0] || null;

  const loggedInCanonicalName = useMemo(() => {
    const rawName =
      authUser?.fullName ||
      identity?.fullName ||
      identity?.displayName ||
      identity?.shortName ||
      identity?.name ||
      "";
    return rawName ? canonicalName(rawName) : "";
  }, [authUser, identity, canonicalName]);

  const effectiveCaptainName = useMemo(() => {
    const explicitRole = String(authUser?.role || identity?.role || "")
      .trim()
      .toLowerCase();

    if (gameType === GAME_TYPE_11 && explicitRole === "admin") {
      return loggedInCanonicalName || "";
    }

    if (isSmallSidedGameType(gameType)) {
      return selectedTeamCanonical?.captain || "";
    }

    return "";
  }, [authUser, identity, gameType, loggedInCanonicalName, selectedTeamCanonical]);

  const isCaptainPlayer = (name) => {
    return normKey(name) === normKey(effectiveCaptainName);
  };

  const withCaptainTag = (name) => {
    const label = displayCompactName(name);
    return isCaptainPlayer(name) ? `${label} (C)` : label;
  };

  const formationsMap = getFormationsMapForGameType(gameType);

  const defaultFormationId = getDefaultFormationIdForGameType(gameType);

  const buildResolvedLineup = (teamId, targetGameType) => {
    const targetTeam =
      canonicalTeams.find((t) => t.id === teamId) || canonicalTeams[0] || null;

    const targetFormationsMap = getFormationsMapForGameType(targetGameType);

    const targetDefaultFormationId = getDefaultFormationIdForGameType(targetGameType);

    const targetPlayerPool =
      targetGameType === GAME_TYPE_11 ? turfKingsPlayers : targetTeam?.players || [];

    const next = resolveLatestPreferredTeamLineup(
      targetTeam,
      targetGameType,
      lineupsByTeam,
      targetFormationsMap,
      targetDefaultFormationId,
      targetPlayerPool
    );

    const canonPositions = {};
    Object.keys(next.positions || {}).forEach((posId) => {
      const v = next.positions[posId];
      canonPositions[posId] = v ? canonicalName(v) : null;
    });

    return {
      ...next,
      positions: canonPositions,
      guestPlayers: next.guestPlayers || [],
      benchSnapshot: next.benchSnapshot || [],
      meta: next.meta || {
        savedByRole: LINEUP_SAVE_ROLE_GENERAL,
        savedByEmail: null,
        savedByName: null,
        savedAt: null,
        teamCaptainPreferred: false,
      },
    };
  };

  const [lineup, setLineup] = useState(() =>
    buildResolvedLineup(selectedTeamId, gameType)
  );

  useEffect(() => {
    if (!selectedTeamCanonical) return;
    setLineup(buildResolvedLineup(selectedTeamId, gameType));
    setSelectedPlayer(null);
  }, [
    selectedTeamId,
    gameType,
    lineupsByTeam,
    selectedTeamCanonical,
    turfKingsPlayers,
    canonicalTeams,
  ]);

  const formation =
    formationsMap[lineup.formationId] ||
    formationsMap[defaultFormationId] ||
    Object.values(formationsMap)[0];

  const currentMatchDayEvents = useMemo(() => {
    const combined = [...(allEvents || []), ...(currentEvents || [])];

    const seen = new Set();
    return combined.filter((e) => {
      if (!e) return false;

      const key =
        e.id ??
        [
          e.matchNo ?? "m?",
          e.timeSeconds ?? "t?",
          e.type ?? "type?",
          e.teamId ?? "team?",
          e.scorer ?? e.playerName ?? "p?",
          e.assist ?? "a?",
          e.role ?? "role?",
        ].join("|");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allEvents, currentEvents]);

  const todayFriendlyHistory = useMemo(() => {
    if (!isFriendlyMatch) return [];
    return (Array.isArray(friendlyMatchDayHistory) ? friendlyMatchDayHistory : [])
      .filter(isTodayFriendlyHistoryDay);
  }, [isFriendlyMatch, friendlyMatchDayHistory]);

  const todayFriendlyEvents = useMemo(() => {
    if (!isFriendlyMatch) return [];

    return todayFriendlyHistory.flatMap((day) => {
      const events = Array.isArray(day?.allEvents)
        ? day.allEvents
        : Array.isArray(day?.events)
          ? day.events
          : [];

      const matchDayId =
        day?.id ||
        day?.matchDayId ||
        day?.date ||
        day?.day ||
        getFriendlyHistoryDateKey(day) ||
        "FRIENDLY";

      return events.map((event) => ({
        ...event,
        _tkMatchDayId: event?._tkMatchDayId || matchDayId,
      }));
    });
  }, [isFriendlyMatch, todayFriendlyHistory]);

  const todayFriendlyResults = useMemo(() => {
    if (!isFriendlyMatch) return [];

    return todayFriendlyHistory.flatMap((day) => {
      const dayResults = Array.isArray(day?.results) ? day.results : [];
      const matchDayId =
        day?.id ||
        day?.matchDayId ||
        day?.date ||
        day?.day ||
        getFriendlyHistoryDateKey(day) ||
        "FRIENDLY";

      return dayResults.map((result) => ({
        ...result,
        _tkMatchDayId: result?._tkMatchDayId || matchDayId,
      }));
    });
  }, [isFriendlyMatch, todayFriendlyHistory]);

  const formationEventsForDecorations = useMemo(() => {
    const combined = [
      ...(currentMatchDayEvents || []),
      ...(todayFriendlyEvents || []),
    ];

    const seen = new Set();
    return combined.filter((e) => {
      if (!e) return false;

      const key =
        e.id ??
        [
          e._tkMatchDayId ?? "d?",
          e.matchNo ?? "m?",
          e.timeSeconds ?? "t?",
          e.type ?? "type?",
          e.teamId ?? "team?",
          e.scorer ?? e.playerName ?? "p?",
          e.assist ?? "a?",
          e.role ?? "role?",
        ].join("|");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [currentMatchDayEvents, todayFriendlyEvents]);

  const formationResultsForDecorations = useMemo(() => {
    return [...(results || []), ...(todayFriendlyResults || [])];
  }, [results, todayFriendlyResults]);

  const matchDayDecorations = useMemo(() => {
    if (!isSmallSidedGameType(gameType)) return {};
    if (!selectedTeamCanonical?.id) return {};

    // Use the whole selected team, not only the 5 players on the pitch,
    // so substitutes also show rating / goals / assists after the match day.
    const teamPlayers = selectedTeamCanonical?.players || [];

    return buildFormationDecorations({
      teamId: selectedTeamCanonical.id,
      players: teamPlayers,
      events: formationEventsForDecorations,
      results: formationResultsForDecorations,
      resolveCanonicalName: canonicalName,
    });
  }, [
    gameType,
    selectedTeamCanonical,
    formationEventsForDecorations,
    formationResultsForDecorations,
    canonicalName,
  ]);

  const benchPoolPlayers =
    gameType === GAME_TYPE_11 ? turfKingsPlayers : selectedTeamCanonical?.players || [];

  const assignedKeys = new Set(
    Object.values(lineup.positions)
      .filter(Boolean)
      .map((name) => normKey(name))
  );

  const rawUnassignedPlayers = benchPoolPlayers.filter(
    (p) => !assignedKeys.has(normKey(p))
  );

  const orderedBenchPool = useMemo(
    () => buildOrderedBenchPool(rawUnassignedPlayers, lineup.benchSnapshot || []),
    [rawUnassignedPlayers, lineup.benchSnapshot]
  );

  const subsPlayers = orderedBenchPool.slice(0, MAX_SUBS);
  const reservePlayers = gameType === GAME_TYPE_11 ? orderedBenchPool.slice(MAX_SUBS) : [];

  const handleTeamClick = (teamId) => {
    const nextLineup = buildResolvedLineup(teamId, gameType);
    setSelectedTeamId(teamId);
    setLineup(nextLineup);
    setSelectedPlayer(null);
    setPhotoMessage("");
  };

  const handleGameTypeClick = (type) => {
    const nextLineup = buildResolvedLineup(selectedTeamId, type);
    setGameType(type);
    setLineup(nextLineup);
    setSelectedPlayer(null);
    setPhotoMessage("");
  };

  const saveTeamLineup = (teamId, updatedLineup) => {
    if (!teamId) return;

    const previewLineup = makeSavedLineup(
      {
        ...lineup,
        ...updatedLineup,
        guestPlayers: updatedLineup.guestPlayers || lineup.guestPlayers || [],
        benchSnapshot:
          updatedLineup.benchSnapshot !== undefined
            ? updatedLineup.benchSnapshot
            : lineup.benchSnapshot || [],
      },
      canonicalName,
      identity,
      authUser,
      selectedTeamCanonical,
      gameType
    );

    const saveRole = previewLineup?.meta?.savedByRole || LINEUP_SAVE_ROLE_GENERAL;

    const currentDefaultInfo = getCurrentDefaultVariantInfoLocal(
      lineupsByTeam,
      teamId,
      gameType
    );

    const currentDefaultRole = currentDefaultInfo?.role || "";
    const currentDefaultName = currentDefaultInfo?.lineup?.meta?.savedByName || "captain";
    const currentDefaultTime = currentDefaultInfo?.lineup?.meta?.savedAt || "";

    const isAdminTryingToOverrideCaptain =
      saveRole === LINEUP_SAVE_ROLE_ADMIN &&
      currentDefaultRole === LINEUP_SAVE_ROLE_CAPTAIN;

    if (isAdminTryingToOverrideCaptain) {
      const ok = window.confirm(
        `The current default squad was last set by ${currentDefaultName}${
          currentDefaultTime ? ` on ${new Date(currentDefaultTime).toLocaleString()}` : ""
        }.\n\nHave you agreed with the captain to change his default squad?`
      );

      if (!ok) return;
    }

    setLineupsByTeam((prev) => {
      const updatedMap = writeLineupVariant(
        prev,
        teamId,
        gameType,
        previewLineup,
        saveRole
      );
      saveLineups(updatedMap);
      return updatedMap;
    });
  };

  const handleFormationChange = (e) => {
    if (!canEditLineups) return;

    const newFormationId = e.target.value;
    const formationsForType = getFormationsMapForGameType(gameType);
    const newFormation =
      formationsForType[newFormationId] || formationsForType[Object.keys(formationsForType)[0]];

    const currentPlayersInOrder = formation.positions
      .map((pos) => lineup.positions[pos.id])
      .filter(Boolean);

    const newPositions = {};
    newFormation.positions.forEach((pos, idx) => {
      newPositions[pos.id] = currentPlayersInOrder[idx] || null;
    });

    const updated = {
      ...lineup,
      formationId: newFormation.id,
      positions: newPositions,
    };

    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }

    setSelectedPlayer(null);
  };

  const handleSubClick = (playerName) => {
    if (!canEditLineups) return;

    if (selectedPlayer && selectedPlayer.from === "sub" && selectedPlayer.name === playerName) {
      setSelectedPlayer(null);
      return;
    }

    if (selectedPlayer && selectedPlayer.from === "reserve" && selectedPlayer.name) {
      const swappedBench = swapNamesInList(orderedBenchPool, playerName, selectedPlayer.name);

      const updated = {
        ...lineup,
        benchSnapshot: swappedBench,
      };

      setLineup(updated);

      if (selectedTeamCanonical) {
        saveTeamLineup(selectedTeamCanonical.id, updated);
      }

      setSelectedPlayer(null);
      return;
    }

    setSelectedPlayer({ from: "sub", name: playerName });
  };

  const handleReserveClick = (playerName) => {
    if (!canEditLineups) return;

    if (selectedPlayer && selectedPlayer.from === "reserve" && selectedPlayer.name === playerName) {
      setSelectedPlayer(null);
      return;
    }

    if (selectedPlayer && selectedPlayer.from === "sub" && selectedPlayer.name) {
      const swappedBench = swapNamesInList(orderedBenchPool, selectedPlayer.name, playerName);

      const updated = {
        ...lineup,
        benchSnapshot: swappedBench,
      };

      setLineup(updated);

      if (selectedTeamCanonical) {
        saveTeamLineup(selectedTeamCanonical.id, updated);
      }

      setSelectedPlayer(null);
      return;
    }

    setSelectedPlayer({ from: "reserve", name: playerName });
  };

  const handlePitchClick = (posId) => {
    if (!canEditLineups) return;

    const currentAtPos = lineup.positions[posId] || null;

    if (!selectedPlayer) {
      if (!currentAtPos) return;
      setSelectedPlayer({ from: "pitch", name: currentAtPos, posId });
      return;
    }

    if (selectedPlayer.from === "reserve") {
      window.alert("A reserve must first swap with a sub before entering the lineup.");
      return;
    }

    const newPositions = { ...lineup.positions };
    let nextBenchSnapshot = [...orderedBenchPool];

    if (selectedPlayer.from === "sub") {
      const incoming = selectedPlayer.name;
      const outgoing = currentAtPos;

      Object.keys(newPositions).forEach((key) => {
        if (newPositions[key] === incoming) newPositions[key] = null;
      });

      newPositions[posId] = incoming;
      nextBenchSnapshot = removeNameFromList(nextBenchSnapshot, incoming);

      if (outgoing) {
        nextBenchSnapshot = moveNameToFront(nextBenchSnapshot, outgoing);
      }
    } else if (selectedPlayer.from === "pitch") {
      const fromPos = selectedPlayer.posId;
      const fromName = selectedPlayer.name;
      const toName = currentAtPos;

      newPositions[fromPos] = toName || null;
      newPositions[posId] = fromName;
    }

    const updated = {
      ...lineup,
      positions: newPositions,
      benchSnapshot: nextBenchSnapshot,
    };

    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }

    setSelectedPlayer(null);
  };

  const handleClearSpot = (posId) => {
    if (!canEditLineups) return;

    const clearedName = lineup.positions[posId] || null;
    const newPositions = { ...lineup.positions, [posId]: null };

    const updated = {
      ...lineup,
      positions: newPositions,
      benchSnapshot: clearedName
        ? moveNameToFront(orderedBenchPool, clearedName)
        : orderedBenchPool,
    };

    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }

    setSelectedPlayer(null);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const saveFormationImage = async () => {
    try {
      if (!exportRef.current) return;

      setSavingFormationImage(true);

      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#0f172a",
      });

      const filename = `${slugFromName(selectedTeamCanonical?.label || "team")}_${getGameTypeFilenameLabel(gameType)}_${formation?.id || "formation"}.png`;

      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to save formation image:", err);
      window.alert("Could not save this formation as an image.");
    } finally {
      setSavingFormationImage(false);
    }
  };

  const startLongPressSave = () => {
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      saveFormationImage();
    }, LONG_PRESS_MS);
  };

  useEffect(() => {
    return () => clearLongPress();
  }, []);

  const saveMeta = lineup?.meta || null;

  const saveMetaText = useMemo(() => {
    if (!saveMeta) return "";
    const role = saveMeta.savedByRole || "general";
    const who = saveMeta.savedByName || saveMeta.savedByEmail || "unknown";
    const captainBit = saveMeta.teamCaptainPreferred ? " • team captain preferred" : "";
    return `Saved by ${who} (${role})${captainBit}`;
  }, [saveMeta]);

  const renderTopHeader = (isEmpty = false) => (
    <>
      <div className={`landing-header-sticky ${headerScrolled ? "is-scrolled" : ""}`}>
        <header className="header">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              width: "100%",
            }}
          >
            <div className="header-title" style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>Lineups &amp; Formations</h1>
            </div>

            <button
              className="secondary-btn"
              type="button"
              onClick={onBack}
              aria-label="Home"
              title="Home"
              style={{
                minWidth: "46px",
                width: "46px",
                height: "46px",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.05rem",
                flexShrink: 0,
              }}
            >
              🏠
            </button>
          </div>
        </header>
      </div>

      <header className="header" style={{ marginBottom: isEmpty ? undefined : "0.35rem" }}>
        <div className="header-top-row">
          <button
            className="secondary-btn"
            type="button"
            onClick={onGoToSquads}
            style={{
              background:
                "linear-gradient(180deg, rgba(20, 35, 63, 0.98), rgba(11, 23, 48, 0.98))",
              color: "#f8fafc",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              boxShadow: "0 10px 24px rgba(2, 6, 23, 0.35)",
            }}
          >
            Manage Squads
          </button>
        </div>
        <p className="muted small" style={{ marginTop: "0.65rem" }}>
          Match day format: <strong>{isFriendlyMatch ? `Friendly ${getGameTypeLabel(gameType)}` : `League ${getGameTypeLabel(gameType)}`}</strong>
        </p>
      </header>
    </>
  );

  if (!selectedTeamCanonical) {
    return (
      <div className="page lineups-page">
        {renderTopHeader(true)}
        <section className="card">
          <p>No teams found yet.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page lineups-page">
      {renderTopHeader()}

      <section
        ref={exportRef}
        className="card lineups-card"
        onDoubleClick={saveFormationImage}
        onTouchStart={startLongPressSave}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
        style={{
          position: "relative",
          opacity: savingFormationImage ? 0.92 : 1,
          paddingBottom: "0.8rem",
        }}
        title="Double-click to save. On mobile, long-press to save."
      >
        <div className="lineups-controls">
          <div className="field-row inline-field">
            <label>Game type</label>
            <div className="segmented-toggle">
              {visibleGameTypeOptions.map((type) => (
                <button
                  key={`game-type-${type}`}
                  type="button"
                  className={`segmented-option ${gameType === type ? "active" : ""}`}
                  onClick={() => handleGameTypeClick(type)}
                >
                  {getGameTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>

          {isSmallSidedGameType(gameType) ? (
            <div className="field-row inline-field">
              <label>Team ({getGameTypeLabel(gameType)})</label>
              <div className="team-pill-row">
                {canonicalTeams.map((t) => (
                  <button
                    key={`team-pill-${gameFormat}-${t.id}`}
                    type="button"
                    className={`team-pill-btn ${t.id === selectedTeamCanonical.id ? "active" : ""}`}
                    onClick={() => handleTeamClick(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="field-row inline-field">
              <label>11-a-side squad</label>
              <p className="muted small">
                Using full Turf Kings player pool <strong>({turfKingsPlayers.length} players)</strong>.
              </p>
            </div>
          )}

          <div className="field-row inline-field">
            <label>Formation</label>
            <select
              value={formation.id}
              onChange={handleFormationChange}
              className="lineups-select"
              disabled={!canEditLineups}
            >
              {Object.values(formationsMap).map((f) => (
                <option key={f.id} value={f.id}>
                  {getFormationDisplayLabel(f, gameType)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {saveMetaText ? (
          <p className="muted small" style={{ marginTop: "-0.35rem", marginBottom: "0.55rem" }}>
            {saveMetaText}
          </p>
        ) : null}

        <div className="lineups-layout" style={{ gap: "0.55rem" }}>
          <div className="pitch-wrapper" style={{ marginBottom: 0 }}>
            <div className="pitch">
              <div className="pitch-centre-circle" />
              <div className="pitch-half-line" />
              <div className="pitch-box pitch-box-top" />
              <div className="pitch-box pitch-box-bottom" />
              <div
                style={{
                  position: "absolute",
                  top: "4px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 2,
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                  background: "rgba(7, 18, 38, 0.58)",
                  border: "1px solid rgba(148, 163, 184, 0.22)",
                  color: "#e5e7eb",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  boxShadow: "0 6px 14px rgba(2, 6, 23, 0.18)",
                }}
              >
                {isSmallSidedGameType(gameType) ? selectedTeamCanonical?.label || getGameTypeLabel(gameType) : "TurfKings FC"}
              </div>

              {formation.positions.map((pos) => {
                const name = lineup.positions[pos.id] || "";
                const decor = matchDayDecorations[name] || matchDayDecorations[canonicalName(name)] || null;
                const isSelected =
                  selectedPlayer && selectedPlayer.from === "pitch" && selectedPlayer.posId === pos.id;

                const photoData = name ? getPlayerPhoto(name) : null;
                const goalsCount = Number(decor?.icons?.goals || 0);
                const assistsCount = Number(decor?.icons?.assists || 0);

                return (
                  <div
                    key={pos.id}
                    className={`pitch-position ${name ? "has-player" : ""} ${isSelected ? "selected" : ""}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onClick={() => handlePitchClick(pos.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleClearSpot(pos.id);
                    }}
                  >
                    <div className="player-token" style={{ position: "relative", overflow: "visible" }}>
                      {decor?.rating != null && isSmallSidedGameType(gameType) ? (
                        <div
                          style={{
                            position: "absolute",
                            top: "-10px",
                            right: "-10px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "2px",
                            zIndex: 7,
                            pointerEvents: "none",
                          }}
                        >
                          <div
                            style={{
                              background: "linear-gradient(180deg, #22c55e, #16a34a)",
                              color: "#ffffff",
                              fontSize: "0.68rem",
                              fontWeight: 900,
                              padding: "2px 6px",
                              borderRadius: "999px",
                              boxShadow: "0 4px 10px rgba(0,0,0,0.42)",
                              border: "1px solid rgba(255,255,255,0.28)",
                              lineHeight: 1,
                            }}
                          >
                            {Number(decor.rating || 0).toFixed(1)}
                          </div>

                          {goalsCount > 0 || assistsCount > 0 ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                justifyContent: "center",
                                gap: "1px",
                                minHeight: "18px",
                                marginTop: "1px",
                              }}
                            >
                              <StatCornerBadge icon="⚽" count={goalsCount} />
                              <StatCornerBadge icon="👟" count={assistsCount} />
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div
                        style={{
                          position: "relative",
                          width: "54px",
                          height: "54px",
                          margin: "0 auto",
                          overflow: "visible",
                        }}
                      >
                        <div
                          className={`player-shirt ${photoData ? "with-photo" : ""}`}
                          style={photoData ? { backgroundImage: `url(${photoData})` } : {}}
                        />
                      </div>

                      <div className="player-label">
                        <span className="player-name">{name ? withCaptainTag(name) : "Empty"}</span>
                        <span className="position-tag">{pos.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="muted helper-text" style={{ margin: "0.35rem 0 0.35rem" }}>
              {gameType === GAME_TYPE_11
                ? "Tap a sub, then tap a reserve to swap them."
                : "Tap a sub, then tap a player on the pitch to swap them."}
            </p>
          </div>

          <div className="bench-wrapper" style={{ marginTop: 0, paddingTop: 0 }}>
            <h3 style={{ marginTop: "0.2rem", marginBottom: "0.5rem" }}>Subs</h3>
            {subsPlayers.length === 0 ? (
              <p className="muted">No substitutes available.</p>
            ) : (
              <ul
                className="bench-list"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.45rem",
                  alignItems: "flex-start",
                  marginTop: 0,
                  marginBottom: "0.7rem",
                  paddingTop: 0,
                }}
              >
                {subsPlayers.map((p) => {
                  const isSelected = selectedPlayer && selectedPlayer.from === "sub" && selectedPlayer.name === p;
                  const photoData = getPlayerPhoto(p);
                  const decor = matchDayDecorations[p] || matchDayDecorations[canonicalName(p)] || null;

                  return (
                    <li key={`${gameFormat}-sub-${p}`}>
                      <PlayerBenchChip
                        name={withCaptainTag(p)}
                        isSelected={isSelected}
                        onClick={() => handleSubClick(p)}
                        photoData={photoData}
                        disabled={!canEditLineups}
                        decor={decor}
                      />
                    </li>
                  );
                })}
              </ul>
            )}

            {gameType === GAME_TYPE_11 ? (
              <>
                <h3 style={{ marginTop: "0.8rem" }}>Reserves</h3>
                {reservePlayers.length === 0 ? (
                  <p className="muted">No reserves available.</p>
                ) : (
                  <ul className="bench-list">
                    {reservePlayers.map((p) => {
                      const isSelected =
                        selectedPlayer && selectedPlayer.from === "reserve" && selectedPlayer.name === p;

                      return (
                        <li key={`${gameFormat}-reserve-${p}`}>
                          <button
                            type="button"
                            className={`bench-player ${isSelected ? "selected" : ""}`}
                            onClick={() => handleReserveClick(p)}
                            disabled={!canEditLineups}
                          >
                            {withCaptainTag(p)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : null}

            <div className="photo-toggle-row" style={{ marginTop: "0.25rem" }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowPhotoPanel((v) => !v)}
              >
                {showPhotoPanel ? "Hide player photos" : "Show player photos"}
              </button>
            </div>

            {showPhotoPanel && (
              <div className="photo-upload-block">
                <h4>Player photo</h4>
                <p className="muted small">
                  Upload a profile picture for your card. Photos are stored in the TurfKings database for future awards and player cards.
                </p>

                <div className="field-row">
                  {isVerifiedPlayer ? (
                    <p className="muted small">
                      Uploading as <strong>{verifiedPlayerName}</strong>.
                    </p>
                  ) : (
                    <p className="error-text small">
                      We can&apos;t tell which player you are. Please verify your player identity on the home screen before uploading a photo.
                    </p>
                  )}
                </div>

                <div className="field-row">
                  <label>Upload image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFileChange}
                    disabled={uploadingPhoto || !isVerifiedPlayer}
                  />
                </div>

                {uploadingPhoto && <p className="muted small">Uploading photo…</p>}
                {photoMessage && <p className="muted small">{photoMessage}</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default FormationsPage;