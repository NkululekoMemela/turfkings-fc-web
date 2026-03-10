// src/core/lineups.js

// ---------------- GAME TYPES ----------------
export const GAME_TYPE_5 = "5";
export const GAME_TYPE_11 = "11";

// ---------------- SAVE ROLES ----------------
export const LINEUP_SAVE_ROLE_CAPTAIN = "captain";
export const LINEUP_SAVE_ROLE_ADMIN = "admin";
export const LINEUP_SAVE_ROLE_GENERAL = "general";

export const LOCAL_KEY = "turfkings_lineups_v2";

// ---------------- HELPERS ----------------
export function toTitleCaseLoose(name) {
  return String(name || "")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

export function slugFromLooseName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function uniqueNames(list = []) {
  const seen = new Set();
  const out = [];

  list.forEach((x) => {
    const v = String(x || "").trim();
    if (!v) return;
    const k = safeLower(v);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  });

  return out;
}

export function normalizeLineupName(name) {
  return toTitleCaseLoose(name || "");
}

export function normalizeLineupNames(list = []) {
  return uniqueNames((list || []).map((x) => normalizeLineupName(x)).filter(Boolean));
}

export function areNamesEqual(a, b) {
  return safeLower(a) === safeLower(b);
}

// ---------------- 5-A-SIDE FORMATIONS ----------------
export const FORMATIONS_5 = {
  "2-0-2": {
    id: "2-0-2",
    label: "2-0-2",
    positions: [
      { id: "p1", label: "LW", x: 22, y: 26 },
      { id: "p2", label: "RW", x: 78, y: 26 },
      { id: "p3", label: "LB", x: 27, y: 68 },
      { id: "p4", label: "RB", x: 73, y: 68 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
  "1-2-1": {
    id: "1-2-1",
    label: "1-2-1",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 20 },
      { id: "p2", label: "LM", x: 25, y: 45 },
      { id: "p3", label: "RM", x: 75, y: 45 },
      { id: "p4", label: "CB", x: 50, y: 70 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
  "2-1-1": {
    id: "2-1-1",
    label: "2-1-1",
    positions: [
      { id: "p1", label: "LF", x: 30, y: 22 },
      { id: "p2", label: "RF", x: 70, y: 22 },
      { id: "p3", label: "CAM", x: 50, y: 45 },
      { id: "p4", label: "CB", x: 50, y: 70 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
  "1-1-2": {
    id: "1-1-2",
    label: "1-1-2",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 18 },
      { id: "p2", label: "CM", x: 50, y: 42 },
      { id: "p3", label: "LB", x: 30, y: 68 },
      { id: "p4", label: "RB", x: 70, y: 68 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
};

export const DEFAULT_FORMATION_ID_5 = "2-0-2";

// ---------------- 11-A-SIDE FORMATIONS ----------------
export const FORMATIONS_11 = {
  "4-3-3": {
    id: "4-3-3",
    label: "4-3-3",
    positions: [
      { id: "p1", label: "LW", x: 18, y: 20 },
      { id: "p2", label: "ST", x: 50, y: 18 },
      { id: "p3", label: "RW", x: 82, y: 20 },
      { id: "p4", label: "LCM", x: 35, y: 38 },
      { id: "p5", label: "CDM", x: 50, y: 45 },
      { id: "p6", label: "RCM", x: 65, y: 38 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "4-4-2": {
    id: "4-4-2",
    label: "4-4-2",
    positions: [
      { id: "p1", label: "ST", x: 40, y: 18 },
      { id: "p2", label: "ST", x: 60, y: 18 },
      { id: "p3", label: "LM", x: 20, y: 35 },
      { id: "p4", label: "LCM", x: 40, y: 40 },
      { id: "p5", label: "RCM", x: 60, y: 40 },
      { id: "p6", label: "RM", x: 80, y: 35 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "3-5-2": {
    id: "3-5-2",
    label: "3-5-2",
    positions: [
      { id: "p1", label: "ST", x: 45, y: 17 },
      { id: "p2", label: "ST", x: 55, y: 17 },
      { id: "p3", label: "LM", x: 20, y: 32 },
      { id: "p4", label: "LCM", x: 35, y: 38 },
      { id: "p5", label: "CAM", x: 50, y: 32 },
      { id: "p6", label: "RCM", x: 65, y: 38 },
      { id: "p7", label: "RM", x: 80, y: 32 },
      { id: "p8", label: "LCB", x: 32, y: 68 },
      { id: "p9", label: "CB", x: 50, y: 72 },
      { id: "p10", label: "RCB", x: 68, y: 68 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "4-2-3-1": {
    id: "4-2-3-1",
    label: "4-2-3-1",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 18 },
      { id: "p2", label: "LAM", x: 30, y: 30 },
      { id: "p3", label: "CAM", x: 50, y: 30 },
      { id: "p4", label: "RAM", x: 70, y: 30 },
      { id: "p5", label: "LDM", x: 38, y: 42 },
      { id: "p6", label: "RDM", x: 62, y: 42 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "3-4-3": {
    id: "3-4-3",
    label: "3-4-3",
    positions: [
      { id: "p1", label: "LW", x: 20, y: 20 },
      { id: "p2", label: "ST", x: 50, y: 18 },
      { id: "p3", label: "RW", x: 80, y: 20 },
      { id: "p4", label: "LCM", x: 35, y: 38 },
      { id: "p5", label: "RCM", x: 65, y: 38 },
      { id: "p6", label: "LWB", x: 25, y: 50 },
      { id: "p7", label: "RWB", x: 75, y: 50 },
      { id: "p8", label: "LCB", x: 32, y: 68 },
      { id: "p9", label: "CB", x: 50, y: 72 },
      { id: "p10", label: "RCB", x: 68, y: 68 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "4-1-4-1": {
    id: "4-1-4-1",
    label: "4-1-4-1",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 18 },
      { id: "p2", label: "LM", x: 25, y: 32 },
      { id: "p3", label: "LCM", x: 40, y: 36 },
      { id: "p4", label: "RCM", x: 60, y: 36 },
      { id: "p5", label: "RM", x: 75, y: 32 },
      { id: "p6", label: "CDM", x: 50, y: 46 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
};

export const DEFAULT_FORMATION_ID_11 = "4-3-3";

const DEFENSIVE_LABELS = new Set(["CB", "LB", "RB", "LCB", "RCB"]);
const GOALKEEPER_LABEL = "GK";

// ---------------- ROLE PRIORITY ----------------
// Captain first, then admin, then general.
// This matches your instruction that captain-saved formation gets preference
// over admin, while general users can still experiment.
export const LINEUP_ROLE_PRIORITY = [
  LINEUP_SAVE_ROLE_CAPTAIN,
  LINEUP_SAVE_ROLE_ADMIN,
  LINEUP_SAVE_ROLE_GENERAL,
];

// ---------------- LOCAL STORAGE ----------------
export function loadSavedLineups() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLineups(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

// ---------------- PLAYER PHOTO HELPERS ----------------
// These helpers let future UI files use the same lookup logic and stop us
// from re-solving photo naming every time.
export function getPlayerPhoto(playerPhotosByName = {}, playerName = "") {
  if (!playerName) return null;

  const raw = String(playerName || "").trim();
  if (!raw) return null;

  const candidates = [
    raw,
    toTitleCaseLoose(raw),
    slugFromLooseName(raw),
    raw.replace(/_/g, " "),
    toTitleCaseLoose(raw.replace(/_/g, " ")),
  ].filter(Boolean);

  for (const key of candidates) {
    if (playerPhotosByName?.[key]) return playerPhotosByName[key];
  }

  const entries = Object.entries(playerPhotosByName || {});
  const needle = safeLower(raw);
  const found = entries.find(([k]) => safeLower(k) === needle);
  return found ? found[1] : null;
}

// ---------------- DEFAULTS / RESOLUTION ----------------
export function buildDefaultLineup(playerList, formationId, formationsMap) {
  const formation =
    formationsMap[formationId] ||
    formationsMap[Object.keys(formationsMap)[0]];

  const players = normalizeLineupNames(playerList || []);
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
      savedAt: new Date().toISOString(),
    },
  };
}

function sanitizeLineupShape(
  lineup,
  formationsMap,
  defaultFormationId,
  playerPool = []
) {
  if (!lineup || typeof lineup !== "object") {
    return buildDefaultLineup(playerPool, defaultFormationId, formationsMap);
  }

  const formationId =
    lineup.formationId && formationsMap[lineup.formationId]
      ? lineup.formationId
      : defaultFormationId;

  const formation =
    formationsMap[formationId] ||
    formationsMap[Object.keys(formationsMap)[0]];

  const cleanPositions = {};
  formation.positions.forEach((pos) => {
    cleanPositions[pos.id] = lineup?.positions?.[pos.id]
      ? normalizeLineupName(lineup.positions[pos.id])
      : null;
  });

  return {
    formationId: formation.id,
    positions: cleanPositions,
    guestPlayers: normalizeLineupNames(lineup.guestPlayers || []),
    benchSnapshot: normalizeLineupNames(lineup.benchSnapshot || []),
    meta: {
      ...(lineup.meta || {}),
      savedByRole:
        lineup?.meta?.savedByRole || LINEUP_SAVE_ROLE_GENERAL,
    },
  };
}

export function getRolePriorityIndex(role) {
  const idx = LINEUP_ROLE_PRIORITY.indexOf(role);
  return idx === -1 ? 999 : idx;
}

export function isHigherPriorityRole(roleA, roleB) {
  return getRolePriorityIndex(roleA) < getRolePriorityIndex(roleB);
}

export function getLineupVariantForRole(modeEntry, role) {
  if (!modeEntry || typeof modeEntry !== "object") return null;

  if (modeEntry.formationId) {
    return role === LINEUP_SAVE_ROLE_GENERAL ? modeEntry : null;
  }

  return modeEntry?.variants?.[role] || null;
}

function pickStoredVariant(modeEntry) {
  if (!modeEntry || typeof modeEntry !== "object") return null;

  if (modeEntry.formationId) {
    return modeEntry;
  }

  const variants = modeEntry.variants || {};

  for (const role of LINEUP_ROLE_PRIORITY) {
    if (variants[role]) return variants[role];
  }

  return modeEntry.default || null;
}

export function resolvePreferredTeamLineup(
  team,
  gameType,
  lineupsByTeam,
  formationsMap,
  defaultFormationId,
  playerPool
) {
  const players = normalizeLineupNames(playerPool || []);

  if (!team) {
    return buildDefaultLineup(players, defaultFormationId, formationsMap);
  }

  const existing = lineupsByTeam?.[team.id];
  if (!existing) {
    return buildDefaultLineup(players, defaultFormationId, formationsMap);
  }

  // legacy flat shape
  if (existing.formationId) {
    if (gameType === GAME_TYPE_5 && formationsMap[existing.formationId]) {
      return sanitizeLineupShape(
        existing,
        formationsMap,
        defaultFormationId,
        players
      );
    }
    return buildDefaultLineup(players, defaultFormationId, formationsMap);
  }

  const modeEntry = existing?.[gameType];
  const chosen = pickStoredVariant(modeEntry);

  if (chosen) {
    return sanitizeLineupShape(
      chosen,
      formationsMap,
      defaultFormationId,
      players
    );
  }

  return buildDefaultLineup(players, defaultFormationId, formationsMap);
}

export function writeLineupVariant(
  prevMap,
  teamId,
  gameType,
  lineup,
  saveRole = LINEUP_SAVE_ROLE_GENERAL
) {
  const prev = prevMap || {};
  const prevEntry = prev[teamId];

  const cleanLineup = {
    ...lineup,
    formationId: lineup?.formationId || null,
    positions: Object.fromEntries(
      Object.entries(lineup?.positions || {}).map(([k, v]) => [
        k,
        v ? normalizeLineupName(v) : null,
      ])
    ),
    guestPlayers: normalizeLineupNames(lineup?.guestPlayers || []),
    benchSnapshot: normalizeLineupNames(lineup?.benchSnapshot || []),
    meta: {
      ...(lineup?.meta || {}),
      savedByRole: saveRole,
      savedAt: new Date().toISOString(),
    },
  };

  let nextEntry;

  if (!prevEntry) {
    nextEntry = {
      [gameType]: {
        variants: {
          [saveRole]: cleanLineup,
        },
        updatedAt: new Date().toISOString(),
      },
    };
  } else if (prevEntry.formationId) {
    nextEntry = {
      [GAME_TYPE_5]: {
        variants: {
          [LINEUP_SAVE_ROLE_GENERAL]: {
            ...prevEntry,
            positions: Object.fromEntries(
              Object.entries(prevEntry?.positions || {}).map(([k, v]) => [
                k,
                v ? normalizeLineupName(v) : null,
              ])
            ),
            guestPlayers: normalizeLineupNames(prevEntry?.guestPlayers || []),
            benchSnapshot: normalizeLineupNames(prevEntry?.benchSnapshot || []),
            meta: {
              ...(prevEntry?.meta || {}),
              savedByRole: LINEUP_SAVE_ROLE_GENERAL,
            },
          },
        },
        updatedAt: new Date().toISOString(),
      },
      [gameType]: {
        variants: {
          [saveRole]: cleanLineup,
        },
        updatedAt: new Date().toISOString(),
      },
    };
  } else {
    const modeEntry = prevEntry[gameType] || {};
    nextEntry = {
      ...prevEntry,
      [gameType]: {
        ...modeEntry,
        variants: {
          ...(modeEntry.variants || {}),
          [saveRole]: cleanLineup,
        },
        updatedAt: new Date().toISOString(),
      },
    };
  }

  return {
    ...prev,
    [teamId]: nextEntry,
  };
}

// Optional helper for UI pages that want to know whether a saved variant exists
export function hasSavedVariant(lineupsByTeam, teamId, gameType, role) {
  const teamEntry = lineupsByTeam?.[teamId];
  if (!teamEntry) return false;

  if (teamEntry.formationId) {
    return role === LINEUP_SAVE_ROLE_GENERAL;
  }

  return !!teamEntry?.[gameType]?.variants?.[role];
}

// ---------------- VERIFIED LINEUPS / EVENTS ----------------
export function buildBenchFromLineup(lineup, registeredPlayers = []) {
  const assigned = new Set(
    Object.values(lineup?.positions || {})
      .filter(Boolean)
      .map((x) => safeLower(x))
  );

  const registeredBench = normalizeLineupNames(registeredPlayers || []).filter(
    (p) => p && !assigned.has(safeLower(p))
  );

  const guestPlayers = normalizeLineupNames(lineup?.guestPlayers || []);
  return uniqueNames([...registeredBench, ...guestPlayers]);
}

export function createVerifiedLineupSnapshot({
  teamId,
  lineup,
  formationMap,
  registeredPlayers = [],
  confirmedBy = "",
  confirmedByRole = "",
}) {
  const formation =
    formationMap?.[lineup?.formationId] ||
    formationMap?.[Object.keys(formationMap || {})[0]] ||
    null;

  const normalizedPositions = Object.fromEntries(
    Object.entries(lineup?.positions || {}).map(([k, v]) => [
      k,
      v ? normalizeLineupName(v) : null,
    ])
  );

  const normalizedGuestPlayers = normalizeLineupNames(lineup?.guestPlayers || []);

  return {
    teamId,
    formationId: lineup?.formationId || null,
    formationLabel: formation?.label || lineup?.formationId || "",
    positions: normalizedPositions,
    guestPlayers: normalizedGuestPlayers,
    benchSnapshot: buildBenchFromLineup(
      {
        ...lineup,
        positions: normalizedPositions,
        guestPlayers: normalizedGuestPlayers,
      },
      registeredPlayers
    ),
    confirmedAt: new Date().toISOString(),
    confirmedBy: confirmedBy || "",
    confirmedByRole: confirmedByRole || "",
  };
}

export function getVerifiedPlayersForEvents(snapshot, fallbackPlayers = []) {
  const onPitch = Object.values(snapshot?.positions || {}).filter(Boolean);
  const bench = snapshot?.benchSnapshot || [];
  return uniqueNames([
    ...normalizeLineupNames(onPitch),
    ...normalizeLineupNames(bench),
    ...normalizeLineupNames(fallbackPlayers || []),
  ]);
}

export function isGuestPlayerInSnapshot(snapshot, playerName) {
  const guests = new Set(
    normalizeLineupNames(snapshot?.guestPlayers || []).map((x) => safeLower(x))
  );
  return guests.has(safeLower(playerName));
}

export function getDefensivePlayersFromSnapshot(
  snapshot,
  formationsMap = FORMATIONS_5
) {
  const formation =
    formationsMap?.[snapshot?.formationId] ||
    formationsMap?.[DEFAULT_FORMATION_ID_5] ||
    null;

  if (!formation) return [];

  return formation.positions
    .filter((pos) => DEFENSIVE_LABELS.has(pos.label))
    .map((pos) => snapshot?.positions?.[pos.id])
    .filter(Boolean);
}

export function getGoalkeeperFromSnapshot(
  snapshot,
  formationsMap = FORMATIONS_5
) {
  const formation =
    formationsMap?.[snapshot?.formationId] ||
    formationsMap?.[DEFAULT_FORMATION_ID_5] ||
    null;

  if (!formation) return null;

  const gkPos = formation.positions.find((pos) => pos.label === GOALKEEPER_LABEL);
  if (!gkPos) return null;
  return snapshot?.positions?.[gkPos.id] || null;
}

// ---------------- CLEAN SHEET EVENTS ----------------
// GK = 1.5 points
// each defender = 1 point
// guests do NOT earn player-card clean-sheet points
export function buildCleanSheetEventsForMatch({
  matchNo,
  teamAId,
  teamBId,
  goalsA,
  goalsB,
  verifiedLineups,
}) {
  const out = [];

  const tryAdd = (playerName, teamId, role, points, snapshot) => {
    if (!playerName) return;
    if (isGuestPlayerInSnapshot(snapshot, playerName)) return;

    out.push({
      id: `cs-${matchNo}-${teamId}-${role}-${slugFromLooseName(playerName)}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      type: "clean_sheet",
      matchNo,
      teamId,
      playerName: normalizeLineupName(playerName),
      scorer: normalizeLineupName(playerName), // compatibility with stat consumers that expect scorer
      assist: null,
      role,
      points,
      timeSeconds: 0,
    });
  };

  const lineupA = verifiedLineups?.[teamAId] || null;
  const lineupB = verifiedLineups?.[teamBId] || null;

  // Team A kept clean sheet
  if (Number(goalsB) === 0 && lineupA) {
    const gk = getGoalkeeperFromSnapshot(lineupA, FORMATIONS_5);
    tryAdd(gk, teamAId, "gk", 1.5, lineupA);

    getDefensivePlayersFromSnapshot(lineupA, FORMATIONS_5).forEach((name) => {
      tryAdd(name, teamAId, "def", 1, lineupA);
    });
  }

  // Team B kept clean sheet
  if (Number(goalsA) === 0 && lineupB) {
    const gk = getGoalkeeperFromSnapshot(lineupB, FORMATIONS_5);
    tryAdd(gk, teamBId, "gk", 1.5, lineupB);

    getDefensivePlayersFromSnapshot(lineupB, FORMATIONS_5).forEach((name) => {
      tryAdd(name, teamBId, "def", 1, lineupB);
    });
  }

  return out;
}