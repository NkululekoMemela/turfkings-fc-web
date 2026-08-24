// src/pages/Friendly_LiveMatchPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTeamById } from "../core/teams.js";
import { db } from "../firebaseConfig.js";
import {
  getMatchDoc,
  getScopedMatchDoc,
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
  FORMATIONS_6,
  FORMATIONS_7,
  DEFAULT_FORMATION_ID_5,
  DEFAULT_FORMATION_ID_6,
  DEFAULT_FORMATION_ID_7,
  loadSavedLineups,
  resolveLineupStorageKey,
  LINEUPS_CHANGED_EVENT,
  resolvePreferredTeamLineup,
  createVerifiedLineupSnapshot,
  isGuestPlayerInSnapshot,
  toTitleCaseLoose,
  uniqueNames,
} from "../core/lineups.js";
import { getGameFormatConfig } from "../core/matchConfig.js";
import {
  buildBestOutfieldAssignment,
} from "../core/playerPositioning.js";
import {
  buildFriendlyInMatchRotation,
} from "../core/playerRotation.js";
import VideoHighlightsRepository from "../storage/VideoHighlightsRepository.js";
import TeamIdentityEditor from "../components/TeamIdentityEditor";
import {
  FANM_NATIONAL_TEAMS,
  FANM_PRO_CLUBS,
} from "../data/fanm/fanmTeamLibrary.js";

const CAPTAIN_PASSWORDS = ["11", "22", "3333"];
const MATCH_DOC_ID = "current";

function resolveLiveMatchDoc(dataScope = null) {
  return dataScope
    ? getScopedMatchDoc(db, MATCH_DOC_ID, dataScope)
    : getMatchDoc(db, MATCH_DOC_ID);
}
const SOUND_URL = `${import.meta.env.BASE_URL}alarm.mp4`;
const ROTATION_SOUND_URL = `${import.meta.env.BASE_URL}Player_Change.mp4`;
const PLAYERS_COLLECTION = "players";
const ROTATION_INTERVAL_SECONDS = 5 * 60;

function normalizeRotationReminderMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["time", "goals"].includes(mode) ? mode : "off";
}

function normalizeRedCardRule(value) {
  return String(value || "").trim().toLowerCase() === "two_minute"
    ? "two_minute"
    : "permanent";
}

const FANM_TEAM_LIBRARY = [
  ...FANM_NATIONAL_TEAMS,
  ...FANM_PRO_CLUBS,
];

function normalizeTeamLibraryKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function resolveFanmTeamIdentity(team = {}) {
  if (team?.teamIdentity?.abbr) {
    return team.teamIdentity;
  }

  const candidates = [
    team?.abbr,
    team?.abbrev,
    team?.label,
    team?.name,
    team?.title,
    team?.teamName,
    team?.teamIdentity?.abbr,
    team?.teamIdentity?.name,
  ]
    .map(normalizeTeamLibraryKey)
    .filter(Boolean);

  return (
    FANM_TEAM_LIBRARY.find((entry) => {
      const libraryKeys = [
        entry?.abbr,
        entry?.name,
      ]
        .map(normalizeTeamLibraryKey)
        .filter(Boolean);

      return candidates.some((candidate) =>
        libraryKeys.includes(candidate)
      );
    }) || team?.teamIdentity || null
  );
}


function getFriendlyFormationTools(gameFormat) {
  const playersPerSide = getGameFormatConfig(gameFormat).playersPerSide;

  if (playersPerSide === 7) {
    return {
      playersPerSide,
      formatLabel: "7 v 7",
      shortLabel: "7v7",
      formationMap: FORMATIONS_7,
      defaultFormationId: DEFAULT_FORMATION_ID_7,
      lineupStorageKey: "7",
    };
  }

  if (playersPerSide === 6) {
    return {
      playersPerSide,
      formatLabel: "6 v 6",
      shortLabel: "6v6",
      formationMap: FORMATIONS_6,
      defaultFormationId: DEFAULT_FORMATION_ID_6,
      lineupStorageKey: "6",
    };
  }

  return {
    playersPerSide: 5,
    formatLabel: "5 v 5",
    shortLabel: "5v5",
    formationMap: FORMATIONS_5,
    defaultFormationId: DEFAULT_FORMATION_ID_5,
    lineupStorageKey: "5",
  };
}

const matchEndSound =
  typeof Audio !== "undefined" ? new Audio(SOUND_URL) : null;

const rotationAlertSound =
  typeof Audio !== "undefined" ? new Audio(ROTATION_SOUND_URL) : null;

if (rotationAlertSound) {
  rotationAlertSound.preload = "auto";
  rotationAlertSound.loop = false;
  rotationAlertSound.volume = 1;
}

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

function sanitizeLiveLineupToRegisteredPlayers(
  lineup,
  registeredPlayers = [],
  canonicalName,
  playerKeyFor,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5,
  options = {}
) {
  const preservePositions =
    Boolean(options?.preservePositions);

  /*
   * Confirmed/live snapshots normally preserve their exact positions,
   * because a genuine dismissal may intentionally leave the team short.
   *
   * repairUnprotectedVacancies gives us the safer middle ground:
   * repair accidental ordinary holes while preserving only positions
   * explicitly protected by match events.
   */
  const repairUnprotectedVacancies =
    Boolean(options?.repairUnprotectedVacancies);

  const preservePositionIds = new Set(
    Array.isArray(options?.preservePositionIds)
      ? options.preservePositionIds
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : []
  );

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

  if (!preservePositions || repairUnprotectedVacancies) {
    (formation.positions || []).forEach((pos) => {
      const positionId = String(pos?.id || "").trim();

      /*
       * Never auto-fill a position deliberately vacated by a
       * disciplinary event. This covers both an active penalty and
       * a two-minute penalty whose replacement is now allowed.
       *
       * The referee remains responsible for choosing that replacement.
       */
      if (
        preservePositions &&
        preservePositionIds.has(positionId)
      ) {
        return;
      }

      if (
        !cleanPositions[pos.id] &&
        remainingRegistered.length > 0
      ) {
        const next = remainingRegistered.shift();
        cleanPositions[pos.id] = next;
        usedKeys.add(playerKeyFor(next));
      }
    });
  }

  const cleanGuests = uniquePlayersNormalized(
    lineup?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  ).filter(
    (name) => !usedKeys.has(playerKeyFor(name))
  );

  const preservedBench = uniquePlayersNormalized(
    lineup?.benchSnapshot || [],
    canonicalName,
    playerKeyFor
  ).filter(
    (name) =>
      validKeys.has(playerKeyFor(name)) &&
      !usedKeys.has(playerKeyFor(name))
  );

  const preservedBenchKeys = new Set(
    preservedBench.map((name) =>
      playerKeyFor(name)
    )
  );

  const missingRegisteredBench =
    remainingRegistered.filter(
      (name) =>
        !preservedBenchKeys.has(
          playerKeyFor(name)
        )
    );

  return {
    ...lineup,
    formationId: formation.id,
    positions: cleanPositions,
    guestPlayers: cleanGuests,
    benchSnapshot: preservePositions
      ? uniquePlayersNormalized(
          [
            ...preservedBench,
            ...missingRegisteredBench,
          ],
          canonicalName,
          playerKeyFor
        ).filter(
          (name) =>
            !usedKeys.has(playerKeyFor(name))
        )
      : remainingRegistered,
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
    defaultFormationId,
    {
      preservePositions: true,
    }
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
    defaultFormationId,
    {
      preservePositions: true,
    }
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
      disabled: false,
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

function createFriendlyVerifiedLineupSnapshot({
  teamId,
  lineup,
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5,
  registeredPlayers = [],
  canonicalName,
  playerKeyFor,
  playersPerSide = 5,
  confirmedBy = "",
  confirmedByRole = "",
}) {
  const formation =
    formationMap?.[lineup?.formationId] ||
    formationMap?.[defaultFormationId] ||
    Object.values(formationMap || {})[0] ||
    null;

  const positionIds = (formation?.positions || [])
    .slice(0, Number(playersPerSide || 5))
    .map((pos) => pos.id);

  const normalizedPositions = {};
  const usedKeys = new Set();

  positionIds.forEach((posId) => {
    const canonical = canonicalName(lineup?.positions?.[posId] || "");
    const key = playerKeyFor(canonical);

    if (canonical && key && !usedKeys.has(key)) {
      normalizedPositions[posId] = canonical;
      usedKeys.add(key);
    } else {
      normalizedPositions[posId] = null;
    }
  });

  const normalizedGuests = uniquePlayersNormalized(
    lineup?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  ).filter((name) => !usedKeys.has(playerKeyFor(name)));

  const registeredBench = uniquePlayersNormalized(
    registeredPlayers || [],
    canonicalName,
    playerKeyFor
  ).filter((name) => !usedKeys.has(playerKeyFor(name)));

  const benchSnapshot = uniquePlayersNormalized(
    [...normalizedGuests, ...registeredBench],
    canonicalName,
    playerKeyFor
  ).filter((name) => !usedKeys.has(playerKeyFor(name)));

  const baseSnapshot = createVerifiedLineupSnapshot({
    teamId,
    lineup: {
      ...lineup,
      formationId: formation?.id || lineup?.formationId || defaultFormationId,
      positions: normalizedPositions,
      guestPlayers: normalizedGuests,
      benchSnapshot,
    },
    formationMap,
    registeredPlayers,
    confirmedBy,
    confirmedByRole,
    preferredCaptainNames: [],
  });

  return {
    ...baseSnapshot,
    formationId: formation?.id || baseSnapshot.formationId,
    formationLabel: formation?.label || baseSnapshot.formationLabel,
    positions: normalizedPositions,
    guestPlayers: normalizedGuests,
    benchSnapshot,
    playersPerSide: Number(playersPerSide || positionIds.length || 5),
    onFieldPlayerCount: Object.values(normalizedPositions).filter(Boolean).length,
  };
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

  return {
    dot: "#38bdf8",
    soft: "rgba(56, 189, 248, 0.16)",
    border: "rgba(56, 189, 248, 0.35)",
    text: "#e5e7eb",
  };
}

function getShortLabel(team = {}, fallback = "LIGHT") {
  const label = String(team?.label || "").trim();
  const explicit = String(team?.teamColorName || team?.colorName || "").trim();

  // Friendly challenge teams should be shown by team name, not by shirt colour.
  // Example: Turf Kings vs Farmers FC, not Red vs Blue.
  if (label) return label.toUpperCase();
  if (explicit) return explicit.toUpperCase();

  return fallback;
}

function getTeamDisplayName(team = {}, fallback = "TEAM") {
  return String(team?.label || team?.name || team?.title || fallback || "TEAM").trim();
}

function TeamColorBadge({ team, fallback = "LIGHT", iconPosition = "before", compact = false }) {
  const accent = getTeamAccent(team);
  const label = compact
    ? String(team?.teamIdentity?.abbr || team?.abbrev || getShortLabel(team, fallback)).toUpperCase()
    : getShortLabel(team, fallback);
  const identity = team?.teamIdentity || null;

  const identityIcon =
    identity?.type === "national" && identity.flag ? (
      <span style={{ fontSize: "1.05em", lineHeight: 1 }}>{identity.flag}</span>
    ) : identity?.logo32 ? (
      <img
        src={identity.logo32}
        alt=""
        style={{ width: "1.15em", height: "1.15em", objectFit: "contain", flexShrink: 0 }}
      />
    ) : (
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "999px",
          background: accent.dot,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
    );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.42rem",
        padding: compact
          ? "0.2rem 0.58rem"
          : "0.16rem 0.5rem",
        borderRadius: "999px",
        background: compact
          ? `linear-gradient(
              135deg,
              ${hexToRgba(accent.dot, 0.26)},
              ${hexToRgba(accent.dot, 0.12)}
            )`
          : accent.soft,
        border: compact
          ? `1.5px solid ${hexToRgba(accent.dot, 0.72)}`
          : `1px solid ${accent.border}`,
        color: accent.text,
        boxShadow: compact
          ? `
              inset 0 1px 0 rgba(255, 255, 255, 0.1),
              0 0 0 1px ${hexToRgba(accent.dot, 0.08)},
              0 6px 18px ${hexToRgba(accent.dot, 0.18)}
            `
          : "none",
        fontWeight: compact ? 900 : 800,
        whiteSpace: "nowrap",
      }}
    >
      {iconPosition === "before" ? identityIcon : null}
      <span>{label}</span>
      {iconPosition === "after" ? identityIcon : null}
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

async function hardReset5v5MatchDoc(summaryInfo, matchSeconds) {
  try {
    const ref = resolveLiveMatchDoc(dataScope);
    await setDoc(
      ref,
      {
        matchMode: summaryInfo.matchMode || "5_V_5",
        gameFormat: summaryInfo.gameFormat || "5_V_5",
        playersPerSide: summaryInfo.playersPerSide || 5,
        matchNumber: summaryInfo.matchNumber,
        teamAId: summaryInfo.teamAId,
        teamBId: summaryInfo.teamBId,
        teamALabel: summaryInfo.teamALabel,
        teamBLabel: summaryInfo.teamBLabel,
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
    console.error("⚠️ Failed to hard reset 5v5 match doc:", err);
  }
}

async function appendEventToFirestore(
  event,
  summaryInfo,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = resolveLiveMatchDoc(dataScope);

    const common = {
      ...summaryInfo,
      matchMode: summaryInfo.matchMode || "5_V_5",
      gameFormat: summaryInfo.gameFormat || "5_V_5",
      playersPerSide: summaryInfo.playersPerSide || 5,
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
    const ref = resolveLiveMatchDoc(dataScope);
    await setDoc(
      ref,
      {
        matchMode: summaryInfo.matchMode || "5_V_5",
        gameFormat: summaryInfo.gameFormat || "5_V_5",
        playersPerSide: summaryInfo.playersPerSide || 5,
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
    const ref = resolveLiveMatchDoc(dataScope);
    await setDoc(
      ref,
      {
        matchMode: finalSummary?.matchMode || "5_V_5",
        gameFormat: finalSummary?.gameFormat || "5_V_5",
        playersPerSide: finalSummary?.playersPerSide || 5,
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
      aria-pressed={Boolean(isSelected)}
      title={
        isSelected
          ? `${name} selected`
          : isSub
          ? "This player is currently a sub and cannot be selected."
          : `Select ${name}`
      }
    >
      {isSelected ? (
        <span
          className="live-chip-selected-badge"
          aria-hidden="true"
        >
          ✓
        </span>
      ) : null}
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
  team = null,
  guestSnapshotChecker = null,
  disabled = false,
}) {

  const accent = team ? getTeamAccent(team) : null;

  return (
    <div
      className={`field-row ${
        accent ? "fanm-team-player-choice" : ""
      }`}
      style={
        accent
          ? {
              "--player-team-color": accent.dot,
              "--player-team-soft": accent.soft,
              "--player-team-border": accent.border,
              "--player-team-text": accent.text,
            }
          : undefined
      }
    >
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

            return (
              <PlayerBenchChip
                key={`${rawName}-${isSub ? "sub" : "field"}-${
                  roleTag || "norole"
                }`}
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
  formationMap = FORMATIONS_5,
  defaultFormationId = DEFAULT_FORMATION_ID_5,
  protectedVacancies = {},
  disabled = false,
  onAutomaticBenchRotation = null,
}) {
  const formation =
    formationMap[lineup?.formationId] || formationMap[defaultFormationId] || Object.values(formationMap)[0];
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [guestName, setGuestName] = useState("");

  useEffect(() => {
    setSelectedPlayer(null);
  }, [lineup?.formationId]);

  const allRegistered = uniquePlayersNormalized(
    registeredPlayers || [],
    canonicalName,
    playerKeyFor
  );

  const sanitizedLineup = useMemo(() => {
    const nextLineup =
      sanitizeLiveLineupToRegisteredPlayers(
        lineup,
        allRegistered,
        canonicalName,
        playerKeyFor,
        formationMap,
        defaultFormationId,
        {
          preservePositions: true,
        }
      );

    /*
     * The sanitizer may clean player and bench data, but it must
     * never decide who enters the pitch during a live match.
     *
     * Preserve the referee's exact position assignments, including
     * deliberately empty positions.
     */
    const allowedPlayerKeys = new Set(
      [
        ...(allRegistered || []),
        ...(lineup?.guestPlayers || []),
      ]
        .map((name) => canonicalName(name))
        .filter(Boolean)
        .map((name) => playerKeyFor(name))
    );

    const nextPositions = {};

    formation.positions.forEach((position) => {
      const rawAssignedName = canonicalName(
        lineup?.positions?.[position.id] || ""
      );

      nextPositions[position.id] =
        rawAssignedName &&
        allowedPlayerKeys.has(
          playerKeyFor(rawAssignedName)
        )
          ? rawAssignedName
          : null;
    });

    Object.entries(protectedVacancies || {}).forEach(
      ([positionId, vacancy]) => {
        const manuallyAssignedName =
          canonicalName(
            lineup?.positions?.[positionId] || ""
          );

        /*
         * Permanent and active temporary vacancies stay locked.
         *
         * An expired temporary vacancy stays empty until the referee
         * manually selects a bench player and taps that green slot.
         */
        if (
          vacancy?.locked ||
          (
            vacancy?.replacementAllowed &&
            !manuallyAssignedName
          )
        ) {
          nextPositions[positionId] = null;
        }
      }
    );

    const assignedKeys = new Set(
      Object.values(nextPositions)
        .filter(Boolean)
        .map((name) => playerKeyFor(name))
    );

    const nextBenchSnapshot =
      uniquePlayersNormalized(
        [
          ...(lineup?.benchSnapshot || []),
          ...(nextLineup?.benchSnapshot || []),
        ],
        canonicalName,
        playerKeyFor
      ).filter(
        (name) =>
          !assignedKeys.has(playerKeyFor(name))
      );

    return {
      ...nextLineup,
      positions: nextPositions,
      benchSnapshot: nextBenchSnapshot,
      onFieldPlayerCount: Object.values(
        nextPositions
      ).filter(Boolean).length,
    };
  }, [
    lineup,
    allRegistered,
    canonicalName,
    playerKeyFor,
    formation,
    formationMap,
    defaultFormationId,
    protectedVacancies,
  ]);


  const assignedNames = Object.values(lineup?.positions || {})
    .map((name) => canonicalName(name))
    .filter(Boolean);

  const assignedKeys = new Set(assignedNames.map((name) => playerKeyFor(name)));

  const guestPlayers = uniquePlayersNormalized(
    lineup?.guestPlayers || [],
    canonicalName,
    playerKeyFor
  );

  const sanitizedBenchRegistered = uniquePlayersNormalized(
    lineup?.benchSnapshot || [],
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

    const vacancy =
      protectedVacancies?.[posId] || null;

    if (vacancy?.locked) {
      setSelectedPlayer(null);
      return;
    }

    const currentAtPos =
      lineup?.positions?.[posId] || null;

    if (!selectedPlayer) {
      if (!currentAtPos) return;
      setSelectedPlayer({ from: "pitch", name: currentAtPos, posId });
      return;
    }

    const newPositions = { ...(lineup?.positions || {}) };
    let nextBenchSnapshot = [...sanitizedBenchRegistered];

    if (selectedPlayer.from === "bench") {
      const incoming = canonicalName(selectedPlayer.name);
      const outgoing = canonicalName(currentAtPos);

      /*
       * During a confirmed live Friendly, selecting a substitute and
       * tapping an OCCUPIED pitch position means "rotate now".
       *
       * The referee chooses who leaves. The shared football engine
       * decides the resulting positions:
       *
       * incoming sub -> GK
       * previous GK  -> outfield
       * tapped player -> back of bench queue
       *
       * Empty replacement-ready disciplinary vacancies deliberately
       * retain the existing direct replacement behaviour below.
       */
      if (
        outgoing &&
        typeof onAutomaticBenchRotation === "function"
      ) {
        const handled = onAutomaticBenchRotation({
          incomingPlayer: incoming,
          outgoingPlayer: outgoing,
          outgoingPositionId: posId,
          currentLineup: lineup,
          formation,
        });

        if (handled) {
          setSelectedPlayer(null);
          return;
        }
      }

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
        <TeamColorBadge team={team || { label: title }} fallback={title || "OTHER TEAM"} />
      </h3>

      <div className="pitch-wrapper">
        <div className="pitch" style={{ maxWidth: "100%" }}>
          <div className="pitch-centre-circle" />
          <div className="pitch-half-line" />
          <div className="pitch-box pitch-box-top" />
          <div className="pitch-box pitch-box-bottom" />

          {formation.positions.map((pos) => {
            const name =
              lineup?.positions?.[pos.id] || "";

            const vacancy =
              protectedVacancies?.[pos.id] || null;

            const isLockedVacancy =
              Boolean(vacancy?.locked);

            const isReplacementReady =
              Boolean(
                vacancy?.replacementAllowed &&
                !name
              );

            const isSelected =
              selectedPlayer &&
              selectedPlayer.from === "pitch" &&
              selectedPlayer.posId === pos.id;

            const photoData = getPlayerPhoto(name);

            return (
              <div
                key={pos.id}
                className={`pitch-position ${
                  name ? "has-player" : ""
                } ${
                  isSelected ? "selected" : ""
                } ${
                  isLockedVacancy
                    ? "is-protected-vacancy"
                    : ""
                } ${
                  isReplacementReady
                    ? "is-replacement-ready"
                    : ""
                }`}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                }}
                onClick={() =>
                  handlePitchClick(pos.id)
                }
                title={
                  isLockedVacancy
                    ? vacancy?.dismissalRule ===
                      "permanent"
                      ? "Permanent dismissal — this position remains empty"
                      : `Two-minute penalty — ${
                          vacancy?.remainingLabel ||
                          "team must play short"
                        }`
                    : isReplacementReady
                    ? "Select a substitute and then tap this position"
                    : undefined
                }
              >
                <div className="player-token">
                  {isLockedVacancy ? (
                    <>
                      <div
                        className="fanm-vacancy-token is-red-card"
                        aria-hidden="true"
                      >
                        🟥
                      </div>

                      <div className="live-player-meta">
                        <span className="player-name">
                          Sent off
                        </span>

                        <span className="position-tag">
                          {vacancy?.dismissalRule ===
                          "permanent"
                            ? "Permanent"
                            : vacancy?.remainingLabel ||
                              "Penalty active"}
                        </span>
                      </div>
                    </>
                  ) : isReplacementReady ? (
                    <>
                      <div
                        className="fanm-vacancy-token is-ready"
                        aria-hidden="true"
                      >
                        ✓
                      </div>

                      <div className="live-player-meta">
                        <span className="player-name">
                          Replacement
                        </span>

                        <span className="position-tag">
                          Select substitute
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={`player-shirt ${
                          photoData
                            ? "with-photo"
                            : ""
                        }`}
                        style={
                          photoData
                            ? {
                                backgroundImage:
                                  `url(${photoData})`,
                              }
                            : {}
                        }
                      />

                      <div className="live-player-meta">
                        <span className="player-name">
                          {name
                            ? displayCompactPlayerName(
                                name
                              )
                            : "Empty"}
                        </span>

                        <span className="position-tag">
                          {pos.label}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bench-wrapper live-bench-wrapper">
        <h4 className="live-bench-title">Bench / Subs</h4>

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
            <label className="muted small live-guest-label">
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

function formatSeconds(s) {
  const v = typeof s === "number" && !Number.isNaN(s) ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function formatEventClock(totalMatchSeconds, secondsLeft, eventTimeSeconds) {
  const elapsed =
    typeof eventTimeSeconds === "number"
      ? eventTimeSeconds
      : (totalMatchSeconds || 0) - (secondsLeft || 0);
  return formatSeconds(elapsed);
}

function getRotationDue(matchSeconds, secondsLeft) {
  const elapsed = Math.max((matchSeconds || 0) - (secondsLeft || 0), 0);
  const nextBoundary =
    Math.floor(elapsed / ROTATION_INTERVAL_SECONDS) * ROTATION_INTERVAL_SECONDS +
    ROTATION_INTERVAL_SECONDS;
  const remaining = Math.max(nextBoundary - elapsed, 0);

  return {
    elapsed,
    remaining,
    nextBoundary,
  };
}

function getLocalDateKey(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, "0");
  const day = String(safe.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeFormatKey(gameFormat = "5_V_5") {
  const raw = String(gameFormat || "5_V_5").trim().toLowerCase();
  if (raw.includes("7")) return "7v7";
  if (raw.includes("6")) return "6v6";
  return "5v5";
}

function buildFriendlyVideoHighlightsMatchId(gameFormat = "5_V_5") {
  return `friendly__${normalizeFormatKey(gameFormat)}__${getLocalDateKey()}`;
}

function getIdentityKey(identity) {
  return String(
    identity?.uid ||
      identity?.memberId ||
      identity?.playerId ||
      identity?.email ||
      identity?.shortName ||
      identity?.fullName ||
      identity?.displayName ||
      ""
  ).trim();
}

function eventLabel(teamId, teamAId, teamBId, teamA, teamB) {
  if (teamId === teamAId) return getShortLabel(teamA, "TEAM A");
  if (teamId === teamBId) return getShortLabel(teamB, "TEAM B");
  return "TEAM";
}

export function FriendlyLiveMatchPage({
  activeClubId = "turf-kings",
  dataScope = null,
  activeClub = null,
  matchSeconds,
  secondsLeft,
  timeUp,
  running,
  teams,
  fiveVFiveTeams = [],
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
  gameFormat = "5_V_5",
  onUpdateMatchSeconds = null,
  expectedEndAtISO = null,
  scheduledFinishAtISO = null,
  onUpdateExpectedEndTime = null,
  rotationReminderMode = "off",
  onUpdateRotationReminder = null,
  redCardRule = "permanent",
  onUpdateRedCardRule = null,
  matchTeamColorOverrides = {},
  onUpdateMatchTeamColorOverride = null,
  onResetMatchTeamColorOverrides = null,
  confirmedLineupSnapshot = null,
  confirmedLineupsByMatchNo = {},
  playerPhotosByName = {},
  onConfirmPreMatchLineups,
  onCancelPreMatchLineups,
  onAddEvent,
  onDeleteEvent,
  onUndoLastEvent,
  onConfirmEndMatch,
  onBackToLanding,
  onGoToStats,
  matchId = "",
  videoHighlightsMatchId = "",
  currentVideoHighlightsMatchId = "",
}) {
  const safeActiveClubId = activeClubId || "turf-kings";

  // Referee-only operational VAR state.
  // VAR must never enter ordinary player-facing highlight surfaces.
  const [refereeVarHighlights, setRefereeVarHighlights] = useState([]);
  const [activeRefereeVar, setActiveRefereeVar] = useState(null);
  const [dismissedRefereeVarIds, setDismissedRefereeVarIds] = useState(
    () => new Set()
  );
  const { teamAId, teamBId } = currentMatch || {};
  const role = String(activeRole || "spectator").trim().toLowerCase();
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

  const friendlyFormat = getFriendlyFormationTools(gameFormat);
  const {
    playersPerSide,
    formatLabel,
    shortLabel: formatShortLabel,
    formationMap,
    defaultFormationId,
    lineupStorageKey,
  } = friendlyFormat;

  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  const [showGoalRecorder, setShowGoalRecorder] = useState(false);
  const [showCardRecorder, setShowCardRecorder] = useState(false);
  const [selectedDisciplinePlayer, setSelectedDisciplinePlayer] = useState(null);
  const [showAdditionalTimeModal, setShowAdditionalTimeModal] = useState(false);
  const [pendingAdditionalTimeSeconds, setPendingAdditionalTimeSeconds] = useState(0);
  const [additionalTimeTotalSeconds, setAdditionalTimeTotalSeconds] = useState(0);
  const [additionalTimeSecondsLeft, setAdditionalTimeSecondsLeft] = useState(0);
  const [additionalTimeRunning, setAdditionalTimeRunning] = useState(false);
  const [additionalTimeFinished, setAdditionalTimeFinished] = useState(false);
  const [goalStep, setGoalStep] = useState("team");
  const [scoringTeamId, setScoringTeamId] = useState("");
  const [scorerName, setScorerName] = useState("");
  const [assistName, setAssistName] = useState("");
  const [editingGoalIndex, setEditingGoalIndex] = useState(null);

  const [rotationDue, setRotationDue] = useState(null);
  const [rotationToastVisible, setRotationToastVisible] = useState(false);

  const rotationToastTimerRef = useRef(null);
  const rotationDueTimerRef = useRef(null);
  const lastRotationTimeBucketRef = useRef(0);
  const lastRotationGoalBucketRef = useRef(0);

  const [showShiboboRecorder, setShowShiboboRecorder] = useState(false);
  const [shiboboTeamId, setShiboboTeamId] = useState("");
  const [shiboboPlayerName, setShiboboPlayerName] = useState("");
  const [shiboboVictimName, setShiboboVictimName] = useState("");

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

  const [activeGoalCaptureRequest, setActiveGoalCaptureRequest] = useState(null);
  const [showGoalCancelDecision, setShowGoalCancelDecision] = useState(false);

  const alarmLoopRef = useRef(null);

  // Keep the referee/captain scoring screen awake and ready during the match.
  // This is intentionally silent: being on this page is already the "ref mode".
  const wakeLockRef = useRef(null);
  const idleTimerRef = useRef(null);
  const [screenDimmed, setScreenDimmed] = useState(false);

  const lineupStorageOptions = useMemo(
    () => ({
      isPracticeMode:
        dataScope?.environment === "practice",
      practiceSessionId:
        dataScope?.practiceSessionId || null,
    }),
    [
      dataScope?.environment,
      dataScope?.practiceSessionId,
    ]
  );

  const activeLineupStorageKey = useMemo(
    () =>
      resolveLineupStorageKey({
        activeClubId,
        ...lineupStorageOptions,
      }),
    [
      activeClubId,
      lineupStorageOptions,
    ]
  );

  const [savedLineups, setSavedLineups] = useState(
    () =>
      loadSavedLineups(
        activeClubId,
        lineupStorageOptions
      )
  );

  /*
   * FormationsPage is the master lineup source.
   *
   * Reload whenever:
   * - club / Official-Practice scope changes;
   * - FormationsPage saves in this same browser window;
   * - another tab/window changes the same lineup storage key.
   *
   * Practice follows the identical code path but listens only to
   * its own session-scoped storage key.
   */
  useEffect(() => {
    const reloadSavedLineups = () => {
      setSavedLineups(
        loadSavedLineups(
          activeClubId,
          lineupStorageOptions
        )
      );
    };

    reloadSavedLineups();

    const handleLineupsChanged = (event) => {
      if (
        event?.detail?.storageKey &&
        event.detail.storageKey !==
          activeLineupStorageKey
      ) {
        return;
      }

      reloadSavedLineups();
    };

    const handleStorage = (event) => {
      if (event?.key !== activeLineupStorageKey) {
        return;
      }

      reloadSavedLineups();
    };

    window.addEventListener(
      LINEUPS_CHANGED_EVENT,
      handleLineupsChanged
    );

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        LINEUPS_CHANGED_EVENT,
        handleLineupsChanged
      );

      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, [
    activeClubId,
    lineupStorageOptions,
    activeLineupStorageKey,
  ]);

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

            /*
             * Match-day positional intelligence.
             *
             * Friendly rotations use the same canonical player-profile
             * attributes as ThreeTeamLeague. Validation/defaulting remains
             * centralized in core/playerPositioning.js.
             *
             * Official and Practice deliberately share these football
             * attributes; Practice isolation concerns session/match state,
             * not a duplicate player football profile.
             */
            mentality: data.mentality,
            shooting: data.shooting,
          };
        });

        const active = list.filter(
          (p) => String(p.status || "active").toLowerCase() === "active"
        );

        active.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setPlayers(active);
      } catch (err) {
        console.error("Failed to load players in 5v5LiveMatchPage:", err);
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
    const safeTeams = (
      Array.isArray(fiveVFiveTeams) && fiveVFiveTeams.length
        ? fiveVFiveTeams
        : teams || []
    ).slice(0, 2);

    return safeTeams.map((t) => ({
      ...t,
      teamIdentity: resolveFanmTeamIdentity(t),
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
  }, [teams, fiveVFiveTeams, canonicalName]);

  const teamA = getTeamById(canonicalTeams, teamAId);
  const teamB = getTeamById(canonicalTeams, teamBId);

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

    setLocalMatchTeamColorOverrides((previous) => ({
      ...(previous || {}),
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
        const snap = await getDocs(getPlayerPhotosCollection(db, safeActiveClubId));
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
        console.error("Failed to load player photos in 5v5LiveMatchPage:", err);
      }
    }

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [canonicalName, displayCompactPlayerName]);

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
          return mergedPlayerPhotos[matchedKey];
        }
      }

      return null;
    };
  }, [mergedPlayerPhotos, canonicalName, displayCompactPlayerName]);

  const defaultTeamALineup = useMemo(
    () =>
      sanitizeLiveLineupToRegisteredPlayers(
        resolvePreferredTeamLineup(
          teamA,
          lineupStorageKey,
          savedLineups,
          formationMap,
          defaultFormationId,
          teamA?.players || []
        ),
        teamA?.players || [],
        canonicalName,
        playerKeyFor,
        formationMap,
        defaultFormationId
      ),
    [teamA, savedLineups, canonicalName, playerKeyFor, formationMap, defaultFormationId, lineupStorageKey]
  );

  const defaultTeamBLineup = useMemo(
    () =>
      sanitizeLiveLineupToRegisteredPlayers(
        resolvePreferredTeamLineup(
          teamB,
          lineupStorageKey,
          savedLineups,
          formationMap,
          defaultFormationId,
          teamB?.players || []
        ),
        teamB?.players || [],
        canonicalName,
        playerKeyFor,
        formationMap,
        defaultFormationId
      ),
    [teamB, savedLineups, canonicalName, playerKeyFor, formationMap, defaultFormationId, lineupStorageKey]
  );

  const [verifyTeamALineup, setVerifyTeamALineup] =
    useState(defaultTeamALineup);
  const [verifyTeamBLineup, setVerifyTeamBLineup] =
    useState(defaultTeamBLineup);
  const [localConfirmedSnapshots, setLocalConfirmedSnapshots] = useState(null);

  const existingConfirmedFromApp =
    localConfirmedSnapshots ||
    confirmedLineupSnapshot ||
    confirmedLineupsByMatchNo?.[currentMatchNo] ||
    null;

  const sanitizedConfirmedSnapshots = useMemo(() => {
    if (!existingConfirmedFromApp) return null;

    /*
     * Red-card events are the authoritative explanation for a live
     * team deliberately having fewer players than its formation.
     *
     * Any other empty position, while an eligible registered player
     * is available, is treated as lineup corruption and repaired.
     */
    const protectedPositionIdsForTeam = (teamId) =>
      (Array.isArray(currentEvents) ? currentEvents : [])
        .filter(
          (event) =>
            event?.type === "red_card" &&
            event?.teamId === teamId &&
            !event?.wasSubstitute
        )
        .map(
          (event) =>
            event?.removedPositionId ||
            event?.positionId ||
            null
        )
        .map((value) => String(value || "").trim())
        .filter(Boolean);

    return {
      ...(existingConfirmedFromApp || {}),
      ...(teamAId
        ? {
            [teamAId]: sanitizeLiveLineupToRegisteredPlayers(
              existingConfirmedFromApp?.[teamAId] || {},
              teamA?.players || [],
              canonicalName,
              playerKeyFor,
              formationMap,
              defaultFormationId,
              {
                preservePositions: true,
                repairUnprotectedVacancies: true,
                preservePositionIds:
                  protectedPositionIdsForTeam(teamAId),
              }
            ),
          }
        : {}),
      ...(teamBId
        ? {
            [teamBId]: sanitizeLiveLineupToRegisteredPlayers(
              existingConfirmedFromApp?.[teamBId] || {},
              teamB?.players || [],
              canonicalName,
              playerKeyFor,
              formationMap,
              defaultFormationId,
              {
                preservePositions: true,
                repairUnprotectedVacancies: true,
                preservePositionIds:
                  protectedPositionIdsForTeam(teamBId),
              }
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
    formationMap,
    defaultFormationId,
    currentEvents,
  ]);

  const hasVerifiedLineups = Boolean(
    sanitizedConfirmedSnapshots?.[teamAId] && sanitizedConfirmedSnapshots?.[teamBId]
  );

  /*
   * Synchronize the editor only when its AUTHORITATIVE SOURCE changes.
   *
   * Before confirmation:
   *   Formation-page/master lineup is authoritative.
   *
   * After confirmation:
   *   confirmed match snapshot is the starting authoritative snapshot.
   *
   * IMPORTANT:
   * Once that snapshot has been loaded into the live editor, ordinary
   * referee edits must remain local working state until the referee
   * confirms them. We must not continuously copy the old confirmed
   * snapshot back over verifyTeamALineup / verifyTeamBLineup, otherwise
   * a perfectly valid manual position swap appears "locked".
   *
   * The source key deliberately describes SOURCE IDENTITY rather than
   * object identity. This prevents sanitization/rerender churn from
   * resetting referee work.
   *
   * Official and Practice use this same behaviour. Practice isolation
   * remains provided by its session-scoped data/storage source.
   */
  const lineupEditorSourceKey = [
    currentMatchNo,
    teamAId || "",
    teamBId || "",
    hasVerifiedLineups ? "confirmed" : "master",
  ].join("::");

  const lastLoadedLineupSourceKeyRef = useRef("");

  useEffect(() => {
    if (!teamAId || !teamBId) return;

    if (
      lastLoadedLineupSourceKeyRef.current ===
      lineupEditorSourceKey
    ) {
      return;
    }

    lastLoadedLineupSourceKeyRef.current =
      lineupEditorSourceKey;

    setVerifyTeamALineup(
      sanitizedConfirmedSnapshots?.[teamAId] ||
        defaultTeamALineup
    );

    setVerifyTeamBLineup(
      sanitizedConfirmedSnapshots?.[teamBId] ||
        defaultTeamBLineup
    );
  }, [
    lineupEditorSourceKey,
    teamAId,
    teamBId,
    sanitizedConfirmedSnapshots,
    defaultTeamALineup,
    defaultTeamBLineup,
  ]);

  const mustVerifyBeforePlay = isControllerSession;

  useEffect(() => {
    if (mustVerifyBeforePlay && !hasVerifiedLineups) {
      if (!playersReady) return;

      setVerifyTeamALineup(defaultTeamALineup);
      setVerifyTeamBLineup(defaultTeamBLineup);
      setShowVerifyModal(true);
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
    if (!canControlMatch) return;
    if (!running) return;
    if (secondsLeft == null) return;

    const shouldPush = secondsLeft <= 5 || secondsLeft % 5 === 0;
    if (!shouldPush) return;

    const pushTimer = async () => {
      try {
        const ref = resolveLiveMatchDoc(dataScope);
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
    if (!running) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [running]);

  useEffect(() => {
    let mounted = true;

    const canUseWindow = typeof window !== "undefined";
    const canUseDocument = typeof document !== "undefined";
    if (!canUseWindow || !canUseDocument) return undefined;

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
        // Some browsers/devices do not support wake lock. Silent fallback is fine.
        console.warn("Screen wake lock unavailable:", err);
      }
    }

    function resetIdleTimer() {
      if (!mounted) return;

      setScreenDimmed(false);

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      idleTimerRef.current = setTimeout(() => {
        if (mounted) setScreenDimmed(true);
      }, 10000);
    }

    async function handleVisibilityChange() {
      if (document.hidden) return;
      await requestScreenWakeLock();
      resetIdleTimer();
    }

    async function tryPortraitLock() {
      try {
        // Most browsers only allow orientation lock in fullscreen/PWA contexts.
        // We attempt it silently and keep the app working if blocked.
        if (window.screen?.orientation?.lock) {
          await window.screen.orientation.lock("portrait");
        }
      } catch (_) {
        // ignore portrait-lock failures
      }
    }

    requestScreenWakeLock();
    tryPortraitLock();
    resetIdleTimer();

    const activityEvents = [
      "touchstart",
      "touchmove",
      "pointerdown",
      "mousemove",
      "keydown",
      "click",
    ];

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

      try {
        window.screen?.orientation?.unlock?.();
      } catch (_) {
        // ignore orientation unlock failures
      }
    };
  }, []);

  useEffect(() => {
    if (!isControllerSession) return;
    if (!teamA || !teamB) return;

    hardReset5v5MatchDoc(
      {
        matchMode: gameFormat || "5_V_5",
        gameFormat: gameFormat || "5_V_5",
        playersPerSide,
        matchNumber: currentMatchNo,
        teamAId,
        teamBId,
        teamALabel: getTeamDisplayName(teamA, "Turf Kings"),
        teamBLabel: getTeamDisplayName(teamB, "Opponent"),
        teamAColorName: effectiveTeamA?.teamColorName || effectiveTeamA?.colorName || "",
        teamBColorName: effectiveTeamB?.teamColorName || effectiveTeamB?.colorName || "",
      },
      matchSeconds
    );
  }, [
    isControllerSession,
    currentMatchNo,
    teamAId,
    teamBId,
    teamA,
    teamB,
    matchSeconds,
    gameFormat,
    playersPerSide,
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

  const buildDisciplinePlayers = (teamId, snapshot) => {
    if (!snapshot) {
      return {
        onField: [],
        substitutes: [],
      };
    }

    const onField = Object.entries(snapshot.positions || {})
      .map(([positionId, rawName]) => ({
        teamId,
        name: canonicalName(rawName),
        positionId,
        roleLabel: roleTagFromPosition(positionId) || "On field",
        isSubstitute: false,
      }))
      .filter((player) => Boolean(player.name));

    const onFieldKeys = new Set(
      onField.map((player) => playerKeyFor(player.name))
    );

    const substitutes = uniquePlayersNormalized(
      snapshot.benchSnapshot || [],
      canonicalName,
      playerKeyFor
    )
      .filter((name) => !onFieldKeys.has(playerKeyFor(name)))
      .map((name) => ({
        teamId,
        name: canonicalName(name),
        positionId: null,
        roleLabel: "Substitute",
        isSubstitute: true,
      }))
      .filter((player) => Boolean(player.name));

    return {
      onField,
      substitutes,
    };
  };

  const disciplinePlayersA = buildDisciplinePlayers(
    teamAId,
    verifiedLineupA
  );

  const disciplinePlayersB = buildDisciplinePlayers(
    teamBId,
    verifiedLineupB
  );

  const disciplinePlayerKey = (player) =>
    `${String(player?.teamId || "")}::${playerKeyFor(player?.name)}`;

  const disciplineCardEvents = currentEvents.filter(
    (event) =>
      event?.type === "yellow_card" ||
      event?.type === "red_card"
  );

  const getDisciplineStatus = (player) => {
    const playerKey = disciplinePlayerKey(player);

    const matchingEvents = disciplineCardEvents
      .map((event) => ({
        ...event,
        eventIndex: currentEvents.findIndex(
          (currentEvent) =>
            currentEvent?.id === event?.id
        ),
      }))
      .filter(
        (event) =>
          `${String(event?.teamId || "")}::${playerKeyFor(
            event?.playerName
          )}` === playerKey
      );

    return {
      yellowEvents: matchingEvents.filter(
        (event) => event.type === "yellow_card"
      ),
      redEvents: matchingEvents.filter(
        (event) => event.type === "red_card"
      ),
    };
  };

  const persistDisciplineLineups = (nextSnapshots) => {
    setLocalConfirmedSnapshots(nextSnapshots);

    if (nextSnapshots?.[teamAId]) {
      setVerifyTeamALineup(nextSnapshots[teamAId]);
    }

    if (nextSnapshots?.[teamBId]) {
      setVerifyTeamBLineup(nextSnapshots[teamBId]);
    }

    onConfirmPreMatchLineups?.(nextSnapshots);
  };

  const applyFriendlyAutomaticRotation = ({
    teamId,
    incomingPlayer,
    outgoingPlayer,
    currentLineup,
    formation,
    registeredPlayers = [],
  }) => {
    /*
     * Automatic player rotation is meaningful only after the match
     * lineups have become the confirmed live-match truth.
     *
     * Before confirmation, LineupBoard retains its normal manual
     * formation-editing behaviour.
     */
    if (!hasVerifiedLineups) {
      return false;
    }

    const result = buildFriendlyInMatchRotation({
      currentLineup,
      incomingPlayer,
      outgoingPlayer,
      formation,
      registeredPlayers,
      buildBestOutfieldAssignment,
      protectedVacancies:
        teamId === teamAId
          ? protectedVacanciesA
          : teamId === teamBId
          ? protectedVacanciesB
          : {},
    });

    if (!result?.resolved) {
      if (
        result?.reason ===
        "current_goalkeeper_must_rotate_outfield"
      ) {
        /*
         * The automatic rule is a DEFAULT, never a referee blocker.
         *
         * Returning false deliberately hands control back to
         * LineupBoard's ordinary manual substitution path:
         *
         * incoming player -> tapped GK position
         * current GK      -> bench
         *
         * The referee may therefore overrule the normal rotation
         * whenever real match circumstances require it.
         */
        return false;
      }

      console.warn(
        "Friendly automatic rotation was not resolved:",
        result
      );
      return false;
    }

    const currentSnapshots = {
      ...(sanitizedConfirmedSnapshots || {}),
    };

    const currentSnapshot =
      currentSnapshots?.[teamId] || currentLineup || {};

    const nextSnapshot = {
      ...currentSnapshot,
      formationId:
        result.formationId ||
        currentSnapshot?.formationId ||
        formation?.id ||
        null,
      positions: {
        ...(result.positions || {}),
      },
      benchSnapshot: [
        ...(result.benchPlayers || []),
      ],
      onFieldPlayerCount: Object.values(
        result.positions || {}
      ).filter(Boolean).length,
    };

    persistDisciplineLineups({
      ...currentSnapshots,
      [teamId]: nextSnapshot,
    });

    return true;
  };

  const removeDismissedPlayerFromLineup = (player) => {
    const teamId = player?.teamId;
    const playerName = canonicalName(player?.name);

    if (!teamId || !playerName) {
      return {
        removedPositionId: null,
        wasSubstitute: Boolean(player?.isSubstitute),
      };
    }

    const currentSnapshots = {
      ...(sanitizedConfirmedSnapshots || {}),
    };

    const currentSnapshot = currentSnapshots?.[teamId];

    if (!currentSnapshot) {
      return {
        removedPositionId: player?.positionId || null,
        wasSubstitute: Boolean(player?.isSubstitute),
      };
    }

    const targetKey = playerKeyFor(playerName);
    const nextPositions = {
      ...(currentSnapshot.positions || {}),
    };

    let removedPositionId = null;

    Object.entries(nextPositions).forEach(
      ([positionId, assignedName]) => {
        if (
          assignedName &&
          playerKeyFor(assignedName) === targetKey
        ) {
          removedPositionId = positionId;
          nextPositions[positionId] = null;
        }
      }
    );

    const currentBench = Array.isArray(
      currentSnapshot.benchSnapshot
    )
      ? currentSnapshot.benchSnapshot
      : [];

    const wasSubstitute = currentBench.some(
      (name) => playerKeyFor(name) === targetKey
    );

    const nextBench = currentBench.filter(
      (name) => playerKeyFor(name) !== targetKey
    );

    const nextSnapshots = {
      ...currentSnapshots,
      [teamId]: {
        ...currentSnapshot,
        positions: nextPositions,
        benchSnapshot: nextBench,
        onFieldPlayerCount: Object.values(
          nextPositions
        ).filter(Boolean).length,
      },
    };

    persistDisciplineLineups(nextSnapshots);

    return {
      removedPositionId:
        removedPositionId || player?.positionId || null,
      wasSubstitute:
        wasSubstitute || Boolean(player?.isSubstitute),
    };
  };

  const restoreDismissedPlayerToLineup = (cardEvent) => {
    const teamId = cardEvent?.teamId;
    const playerName = canonicalName(
      cardEvent?.playerName
    );

    if (!teamId || !playerName) return;

    const currentSnapshots = {
      ...(sanitizedConfirmedSnapshots || {}),
    };

    const currentSnapshot = currentSnapshots?.[teamId];

    if (!currentSnapshot) return;

    const nextPositions = {
      ...(currentSnapshot.positions || {}),
    };

    const nextBench = Array.isArray(
      currentSnapshot.benchSnapshot
    )
      ? [...currentSnapshot.benchSnapshot]
      : [];

    const targetKey = playerKeyFor(playerName);

    const alreadyOnField = Object.values(
      nextPositions
    ).some(
      (name) =>
        name && playerKeyFor(name) === targetKey
    );

    const alreadyOnBench = nextBench.some(
      (name) => playerKeyFor(name) === targetKey
    );

    if (alreadyOnField || alreadyOnBench) return;

    const formerPositionId =
      cardEvent?.removedPositionId || null;

    if (
      formerPositionId &&
      !nextPositions[formerPositionId]
    ) {
      nextPositions[formerPositionId] = playerName;
    } else {
      nextBench.unshift(playerName);
    }

    const nextSnapshots = {
      ...currentSnapshots,
      [teamId]: {
        ...currentSnapshot,
        positions: nextPositions,
        benchSnapshot: uniquePlayersNormalized(
          nextBench,
          canonicalName,
          playerKeyFor
        ),
        onFieldPlayerCount: Object.values(
          nextPositions
        ).filter(Boolean).length,
      },
    };

    persistDisciplineLineups(nextSnapshots);
  };

  const issueDisciplineCard = (cardType, player) => {
    if (!canControlMatch || !player?.name || !player?.teamId) {
      return;
    }

    const normalizedType =
      cardType === "red_card"
        ? "red_card"
        : "yellow_card";

    const status = getDisciplineStatus(player);

    if (
      normalizedType === "yellow_card" &&
      status.yellowEvents.length > 0
    ) {
      return;
    }

    if (
      normalizedType === "red_card" &&
      status.redEvents.length > 0
    ) {
      return;
    }

    const cardTeam =
      player.teamId === teamAId
        ? effectiveTeamA
        : effectiveTeamB;

    let dismissalDetails = {
      removedPositionId: null,
      wasSubstitute: Boolean(player.isSubstitute),
    };

    if (normalizedType === "red_card") {
      dismissalDetails =
        removeDismissedPlayerFromLineup(player);
    }

    const event = {
      id: `discipline-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      type: normalizedType,
      teamId: player.teamId,
      teamLabel: getTeamDisplayName(
        cardTeam,
        player.teamId === teamAId
          ? "TEAM A"
          : "TEAM B"
      ),
      playerName: canonicalName(player.name),
      playerType: isGuestPlayerInSnapshot(
        player.teamId === teamAId
          ? verifiedLineupA
          : verifiedLineupB,
        player.name
      )
        ? "guest"
        : "registered",
      positionId: player.positionId || null,
      removedPositionId:
        dismissalDetails.removedPositionId || null,
      wasSubstitute:
        dismissalDetails.wasSubstitute,
      timeSeconds: Math.max(
        Number(matchSeconds || 0) -
          Number(displaySeconds || 0),
        0
      ),
      issuedBy:
        getIdentityDisplayName(identity),
      issuedById:
        getIdentityKey(identity) || null,
      dismissalRule:
        normalizedType === "red_card"
          ? normalizedActiveRedCardRule
          : null,
      teamPenaltySeconds:
        normalizedType === "red_card" &&
        normalizedActiveRedCardRule === "two_minute"
          ? 2 * 60
          : null,
    };

    onAddEvent?.(event);
    setSelectedDisciplinePlayer(null);
  };

  const reverseDisciplineCard = (cardEvent) => {
    if (
      !canControlMatch ||
      typeof cardEvent?.eventIndex !== "number" ||
      cardEvent.eventIndex < 0
    ) {
      return;
    }

    if (cardEvent?.type === "red_card") {
      restoreDismissedPlayerToLineup(cardEvent);
    }

    onDeleteEvent?.(cardEvent.eventIndex);
    setSelectedDisciplinePlayer(null);
  };

  const dismissedPlayersForTeam = (teamId) => {
    const seen = new Set();

    return disciplineCardEvents
      .filter(
        (event) =>
          event?.type === "red_card" &&
          event?.teamId === teamId
      )
      .map((event) => {
        const name = canonicalName(
          event?.playerName
        );

        if (!name) return null;

        const key = playerKeyFor(name);

        if (seen.has(key)) return null;
        seen.add(key);

        return {
          teamId,
          name,
          positionId:
            event?.removedPositionId ||
            event?.positionId ||
            null,
          roleLabel: "Dismissed",
          isSubstitute:
            Boolean(event?.wasSubstitute),
          isDismissed: true,
        };
      })
      .filter(Boolean);
  };

  const dismissedPlayersA =
    dismissedPlayersForTeam(teamAId);

  const dismissedPlayersB =
    dismissedPlayersForTeam(teamBId);

  const currentDisciplineMatchSeconds = Math.max(
    Number(matchSeconds || 0) -
      Number(displaySeconds || 0),
    0
  );

  const protectedVacanciesForTeam = (teamId) => {
    const vacancies = {};

    disciplineCardEvents
      .filter(
        (event) =>
          event?.type === "red_card" &&
          event?.teamId === teamId
      )
      .forEach((event) => {
        const positionId =
          event?.removedPositionId ||
          event?.positionId ||
          null;

        /*
         * A bench player can be dismissed without creating
         * an empty pitch position.
         */
        if (!positionId || event?.wasSubstitute) {
          return;
        }

        const isTwoMinuteRule =
          event?.dismissalRule ===
          "two_minute";

        const penaltySeconds = Math.max(
          Number(
            event?.teamPenaltySeconds ||
            (isTwoMinuteRule ? 120 : 0)
          ),
          0
        );

        const startedAtSeconds = Math.max(
          Number(event?.timeSeconds || 0),
          0
        );

        const elapsedSinceCard = Math.max(
          currentDisciplineMatchSeconds -
            startedAtSeconds,
          0
        );

        const remainingSeconds =
          isTwoMinuteRule
            ? Math.max(
                penaltySeconds -
                  elapsedSinceCard,
                0
              )
            : null;

        const expired =
          isTwoMinuteRule &&
          remainingSeconds <= 0;

        vacancies[positionId] = {
          eventId: event?.id || null,
          reason: "red_card",
          playerName:
            event?.playerName ||
            "Sent-off player",
          dismissalRule:
            isTwoMinuteRule
              ? "two_minute"
              : "permanent",
          locked:
            !isTwoMinuteRule ||
            !expired,
          replacementAllowed:
            isTwoMinuteRule &&
            expired,
          remainingSeconds,
          remainingLabel:
            isTwoMinuteRule &&
            !expired
              ? `${formatSeconds(
                  remainingSeconds
                )} remaining`
              : isTwoMinuteRule
              ? "Replacement allowed"
              : "Permanent",
        };
      });

    return vacancies;
  };

  const protectedVacanciesA =
    protectedVacanciesForTeam(teamAId);

  const protectedVacanciesB =
    protectedVacanciesForTeam(teamBId);

  const dismissedPlayerKeysForTeam = (teamId) =>
    new Set(
      dismissedPlayersForTeam(teamId).map((player) =>
        playerKeyFor(player?.name)
      )
    );

  const isDismissedPlayer = (teamId, playerName) =>
    dismissedPlayerKeysForTeam(teamId).has(
      playerKeyFor(playerName)
    );

  const eligibleTeamAPlayers = (teamA?.players || []).filter(
    (name) => !isDismissedPlayer(teamAId, name)
  );

  const eligibleTeamBPlayers = (teamB?.players || []).filter(
    (name) => !isDismissedPlayer(teamBId, name)
  );

  const toggleDisciplinePlayer = (player) => {
    const nextKey = disciplinePlayerKey(player);
    const currentKey = disciplinePlayerKey(selectedDisciplinePlayer);

    setSelectedDisciplinePlayer(
      currentKey === nextKey ? null : player
    );
  };

  const closeCardRecorder = () => {
    setSelectedDisciplinePlayer(null);
    setShowCardRecorder(false);
  };

  const normalizedActiveRotationMode =
    normalizeRotationReminderMode(rotationReminderMode);

  const normalizedActiveRedCardRule =
    normalizeRedCardRule(redCardRule);

  const handleSelectRedCardRule = (nextRule) => {
    if (
      !canControlMatch ||
      typeof onUpdateRedCardRule !== "function"
    ) {
      return;
    }

    onUpdateRedCardRule(
      normalizeRedCardRule(nextRule)
    );
  };

  const totalGoals = goalsA + goalsB;

  const hasRotationBench = [verifiedLineupA, verifiedLineupB].some(
    (snapshot) =>
      Array.isArray(snapshot?.benchSnapshot) &&
      snapshot.benchSnapshot.length > 0
  );

  const clearRotationReminder = () => {
    setRotationToastVisible(false);
    setRotationDue(null);

    if (rotationToastTimerRef.current) {
      window.clearTimeout(rotationToastTimerRef.current);
      rotationToastTimerRef.current = null;
    }

    if (rotationDueTimerRef.current) {
      window.clearTimeout(rotationDueTimerRef.current);
      rotationDueTimerRef.current = null;
    }
  };

  const openLiveLineupEditor = () => {
    if (!playersReady) return;

    /*
     * Reopening after confirmation loads the latest confirmed
     * referee snapshot. During an unconfirmed editing session,
     * preserve the current working lineup exactly as it is.
     */
    if (sanitizedConfirmedSnapshots?.[teamAId]) {
      setVerifyTeamALineup(
        sanitizedConfirmedSnapshots[teamAId]
      );
    }

    if (sanitizedConfirmedSnapshots?.[teamBId]) {
      setVerifyTeamBLineup(
        sanitizedConfirmedSnapshots[teamBId]
      );
    }

    clearRotationReminder();
    setShowVerifyModal(true);
  };

  const triggerRotationReminder = (reason) => {
    if (!canControlMatch || !hasRotationBench) return;

    if (rotationToastTimerRef.current) {
      window.clearTimeout(rotationToastTimerRef.current);
    }

    if (rotationDueTimerRef.current) {
      window.clearTimeout(rotationDueTimerRef.current);
    }

    setRotationDue({
      reason,
      triggeredAt: Date.now(),
    });
    setRotationToastVisible(true);

    if (rotationAlertSound) {
      try {
        rotationAlertSound.pause();
        rotationAlertSound.currentTime = 0;

        const playPromise = rotationAlertSound.play();

        if (playPromise?.catch) {
          playPromise.catch((error) => {
            console.warn(
              "Rotation alert sound could not play:",
              error?.message || error
            );
          });
        }
      } catch (error) {
        console.warn(
          "Rotation alert sound failed:",
          error?.message || error
        );
      }
    }

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate([180, 100, 180]);
    }

    rotationToastTimerRef.current = window.setTimeout(() => {
      setRotationToastVisible(false);
      rotationToastTimerRef.current = null;

      rotationDueTimerRef.current = window.setTimeout(() => {
        setRotationDue(null);
        rotationDueTimerRef.current = null;
      }, 20000);
    }, 8000);
  };

  useEffect(() => {
    const elapsedSeconds = Math.max(
      0,
      Number(matchSeconds || 0) - Number(displaySeconds || 0)
    );

    lastRotationTimeBucketRef.current = Math.floor(
      elapsedSeconds / ROTATION_INTERVAL_SECONDS
    );

    lastRotationGoalBucketRef.current = Math.floor(totalGoals / 2);

    if (
      normalizedActiveRotationMode === "off" ||
      !canControlMatch ||
      !hasRotationBench
    ) {
      clearRotationReminder();
    }
  }, [
    normalizedActiveRotationMode,
    canControlMatch,
    hasRotationBench,
  ]);

  useEffect(() => {
    if (
      normalizedActiveRotationMode !== "time" ||
      !running ||
      !canControlMatch ||
      !hasRotationBench
    ) {
      return;
    }

    const elapsedSeconds = Math.max(
      0,
      Number(matchSeconds || 0) - Number(displaySeconds || 0)
    );

    const currentBucket = Math.floor(
      elapsedSeconds / ROTATION_INTERVAL_SECONDS
    );

    if (
      currentBucket > 0 &&
      currentBucket > lastRotationTimeBucketRef.current
    ) {
      lastRotationTimeBucketRef.current = currentBucket;

      triggerRotationReminder(
        `${currentBucket * 5}-minute rotation point`
      );
    }
  }, [
    displaySeconds,
    matchSeconds,
    running,
    normalizedActiveRotationMode,
    canControlMatch,
    hasRotationBench,
  ]);

  useEffect(() => {
    if (
      normalizedActiveRotationMode !== "goals" ||
      !canControlMatch ||
      !hasRotationBench
    ) {
      return;
    }

    const currentGoalBucket = Math.floor(totalGoals / 2);

    if (
      currentGoalBucket > 0 &&
      currentGoalBucket > lastRotationGoalBucketRef.current
    ) {
      lastRotationGoalBucketRef.current = currentGoalBucket;

      triggerRotationReminder(
        `${currentGoalBucket * 2} total goals reached`
      );
    }
  }, [
    totalGoals,
    normalizedActiveRotationMode,
    canControlMatch,
    hasRotationBench,
  ]);

  useEffect(() => {
    return () => {
      if (rotationToastTimerRef.current) {
        window.clearTimeout(rotationToastTimerRef.current);
      }

      if (rotationDueTimerRef.current) {
        window.clearTimeout(rotationDueTimerRef.current);
      }

      if (rotationAlertSound) {
        try {
          rotationAlertSound.pause();
          rotationAlertSound.currentTime = 0;
        } catch {
          // Ignore media cleanup errors.
        }
      }
    };
  }, []);

  const selectedSnapshot =
    scoringTeamId === teamAId
      ? verifiedLineupA
      : scoringTeamId === teamBId
      ? verifiedLineupB
      : null;

  const selectedShiboboSnapshot =
    shiboboTeamId === teamAId
      ? verifiedLineupA
      : shiboboTeamId === teamBId
      ? verifiedLineupB
      : null;

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
      formationMap,
      defaultFormationId,
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
    formationMap,
    defaultFormationId,
  ]);

  const shiboboChoices = useMemo(() => {
    const snapshot =
      shiboboTeamId === teamAId
        ? verifiedLineupA
        : shiboboTeamId === teamBId
        ? verifiedLineupB
        : null;

    const fallbackTeam =
      shiboboTeamId === teamAId
        ? teamA
        : shiboboTeamId === teamBId
        ? teamB
        : null;

    return buildGoalRecorderChoices({
      snapshot,
      fallbackPlayers: fallbackTeam?.players || [],
      canonicalName,
      playerKeyFor,
      formationMap,
      defaultFormationId,
    });
  }, [
    shiboboTeamId,
    verifiedLineupA,
    verifiedLineupB,
    teamA,
    teamB,
    teamAId,
    teamBId,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId,
  ]);

  const assistOptions = useMemo(() => {
    const dismissedKeys =
      dismissedPlayerKeysForTeam(scoringTeamId);

    return goalRecorderChoices.filter(
      (entry) =>
        entry.name !== scorerName &&
        !dismissedKeys.has(playerKeyFor(entry.name))
    );
  }, [
    goalRecorderChoices,
    scorerName,
    scoringTeamId,
    currentEvents,
  ]);

  const goalRecorderChoicesForTeam = (teamId) => {
    const dismissed = new Set(
      dismissedPlayersForTeam(teamId).map((p) => playerKeyFor(p.name))
    );

    return buildGoalRecorderChoices({
      snapshot: teamId === teamAId ? verifiedLineupA : verifiedLineupB,
      fallbackPlayers: teamId === teamAId ? teamA?.players || [] : teamB?.players || [],
      canonicalName,
      playerKeyFor,
      formationMap,
      defaultFormationId,
    }).filter(
      (player) => !dismissed.has(playerKeyFor(player.name))
    );
  };

  const victimOptions = useMemo(() => {
    return shiboboChoices.filter((entry) => entry.name !== shiboboPlayerName);
  }, [shiboboChoices, shiboboPlayerName]);

  const basicSummary = {
    matchMode: gameFormat || "5_V_5",
    gameFormat: gameFormat || "5_V_5",
    playersPerSide,
    matchNumber: currentMatchNo,
    teamAId,
    teamBId,
    teamALabel: getTeamDisplayName(teamA, "Turf Kings"),
    teamBLabel: getTeamDisplayName(teamB, "Opponent"),
    teamAColorName: effectiveTeamA?.teamColorName || effectiveTeamA?.colorName || "",
    teamBColorName: effectiveTeamB?.teamColorName || effectiveTeamB?.colorName || "",
  };


  const resolvedVideoHighlightsMatchId = useMemo(() => {
    return (
      String(currentVideoHighlightsMatchId || "").trim() ||
      String(videoHighlightsMatchId || "").trim() ||
      String(matchId || "").trim() ||
      buildFriendlyVideoHighlightsMatchId(gameFormat)
    );
  }, [currentVideoHighlightsMatchId, videoHighlightsMatchId, matchId, gameFormat]);

  const rotationInfo = getRotationDue(matchSeconds || 0, displaySeconds || 0);

  const teamABenchCount = useMemo(() => {
    return getBenchPlayersFromSnapshot(
      verifiedLineupA,
      teamA?.players || [],
      canonicalName,
      playerKeyFor,
      formationMap,
      defaultFormationId
    ).length;
  }, [
    verifiedLineupA,
    teamA,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId,
  ]);

  const teamBBenchCount = useMemo(() => {
    return getBenchPlayersFromSnapshot(
      verifiedLineupB,
      teamB?.players || [],
      canonicalName,
      playerKeyFor,
      formationMap,
      defaultFormationId
    ).length;
  }, [
    verifiedLineupB,
    teamB,
    canonicalName,
    playerKeyFor,
    formationMap,
    defaultFormationId,
  ]);

  const handleConfirmLineups = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can confirm match lineups.");
      return;
    }

    if (lineupHasEmptyPositions(verifyTeamALineup, formationMap, defaultFormationId)) {
      window.alert(
        `${getShortLabel(effectiveTeamA, "Team A")} lineup is incomplete. Please fill all ${playersPerSide} positions before confirming.`
      );
      return;
    }

    if (lineupHasEmptyPositions(verifyTeamBLineup, formationMap, defaultFormationId)) {
      window.alert(
        `${getShortLabel(effectiveTeamB, "Team B")} lineup is incomplete. Please fill all ${playersPerSide} positions before confirming.`
      );
      return;
    }

    const confirmedByName = getIdentityDisplayName(identity);
    const confirmedByRole = role;

    const snapshotA = createFriendlyVerifiedLineupSnapshot({
      teamId: teamAId,
      lineup: verifyTeamALineup,
      formationMap,
      defaultFormationId,
      registeredPlayers: teamA?.players || [],
      canonicalName,
      playerKeyFor,
      playersPerSide,
      confirmedBy: confirmedByName,
      confirmedByRole,
    });

    const snapshotB = createFriendlyVerifiedLineupSnapshot({
      teamId: teamBId,
      lineup: verifyTeamBLineup,
      formationMap,
      defaultFormationId,
      registeredPlayers: teamB?.players || [],
      canonicalName,
      playerKeyFor,
      playersPerSide,
      confirmedBy: confirmedByName,
      confirmedByRole,
    });

    const merged = {
      [teamAId]: snapshotA,
      [teamBId]: snapshotB,
    };

    setLocalConfirmedSnapshots(merged);
    onConfirmPreMatchLineups?.(merged);
    setShowVerifyModal(false);
  };

  const closeGoalRecorderCleanly = ({ clearCapture = false } = {}) => {
    setShowGoalRecorder(false);
    setGoalStep("scorer");
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
    setShowGoalCancelDecision(false);

    if (clearCapture) {
      setActiveGoalCaptureRequest(null);
    }
  };

  const createImmediateGoalCaptureRequest = () => {
    if (!resolvedVideoHighlightsMatchId) return null;

    const requestId = `friendly_goal_${Date.now()}`;
    const elapsedSeconds = Math.max((matchSeconds || 0) - (displaySeconds || 0), 0);
    const scoreBefore = {
      goalsA,
      goalsB,
      [teamAId || "teamA"]: goalsA,
      [teamBId || "teamB"]: goalsB,
    };

    const optimisticRequest = {
      requestId,
      eventId: requestId,
      matchId: resolvedVideoHighlightsMatchId,
      type: "goal",
      status: "requested",
      captureLifecycleStatus: "requested",
      timeSeconds: elapsedSeconds,
    };

    setActiveGoalCaptureRequest(optimisticRequest);

    // [TK_CAMERA_TRIGGER]
    // Send the capture request directly to the exact Firestore path the Android camera listens to.
    // This fires immediately when Record Goal is clicked, before scorer/assist metadata is collected.
    const captureRef = doc(
      db,
      "video_highlights",
      resolvedVideoHighlightsMatchId,
      "capture_requests",
      requestId
    );

    setDoc(
      captureRef,
      {
        requestId,
        eventId: requestId,
        matchId: resolvedVideoHighlightsMatchId,
        type: "goal",
        tag: "goal",
        status: "requested",
        captureLifecycleStatus: "requested",
        captureSource: "turfkings_live_match_page",
        captureStage: "record_goal_clicked",
        metadataStatus: "pending",
        requestedBy: getIdentityKey(identity) || "unknown",
        requestedByName: getIdentityDisplayName(identity),
        requestedAt: serverTimestamp(),
        requestedAtMillis: Date.now(),
        preRollSeconds: 15,
        postRollSeconds: 5,
        event: {
          id: requestId,
          eventId: requestId,
          type: "goal",
          tag: "goal",
          status: "requested",
          captureLifecycleStatus: "requested",
          captureStage: "record_goal_clicked",
          metadataStatus: "pending",
          matchNo: currentMatchNo,
          matchType: "FRIENDLY",
          gameFormat: gameFormat || "5_V_5",
          timeSeconds: elapsedSeconds,
          scoreBefore,
        },
        metadata: {
          metadataStatus: "pending",
          trigger: "record_goal_clicked",
          scorer: null,
          assist: null,
          teamId: null,
          teamName: null,
        },
        matchContext: {
          ...basicSummary,
          matchId: resolvedVideoHighlightsMatchId,
          scoreBefore,
        },
      },
      { merge: true }
    )
      .then(() => {
        console.log("[TK_CAMERA_TRIGGER] capture request created", {
          matchId: resolvedVideoHighlightsMatchId,
          requestId,
        });
      })
      .catch((err) => {
        console.warn("[TK_CAMERA_TRIGGER] Failed to create immediate goal capture request:", err);
      });

    return optimisticRequest;
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

    createImmediateGoalCaptureRequest();

    setShowGoalRecorder(true);
    setGoalStep("scorer");
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
  };

  useEffect(() => {
    /*
     * Live VAR belongs to the controlling referee only.
     *
     * Admin disposal/review at End Match Day is a separate workflow.
     * Captains, players and spectators must never receive this listener.
     */
    if (
      !canControlCurrentLiveMatch ||
      !resolvedVideoHighlightsMatchId
    ) {
      setRefereeVarHighlights([]);
      setActiveRefereeVar(null);
      return undefined;
    }

    const unsubscribe =
      VideoHighlightsRepository.subscribeToVarHighlights({
        matchId: resolvedVideoHighlightsMatchId,
        clubId: safeActiveClubId,

        onChange: (items) => {
          const incoming = Array.isArray(items) ? items : [];

          setRefereeVarHighlights(incoming);

          setActiveRefereeVar((current) => {
            if (
              current &&
              incoming.some((item) => item.id === current.id)
            ) {
              return current;
            }

            const next = incoming.find(
              (item) => !dismissedRefereeVarIds.has(item.id)
            );

            return next || null;
          });
        },

        onError: (error) => {
          console.warn(
            "[FANM VAR] Referee VAR subscription failed:",
            error
          );
        },
      });

    return () => {
      unsubscribe?.();
    };
  }, [
    canControlCurrentLiveMatch,
    resolvedVideoHighlightsMatchId,
    safeActiveClubId,
    dismissedRefereeVarIds,
  ]);

  const dismissActiveRefereeVar = () => {
    const id = activeRefereeVar?.id;

    if (id) {
      setDismissedRefereeVarIds((previous) => {
        const next = new Set(previous);
        next.add(id);
        return next;
      });
    }

    setActiveRefereeVar(null);
  };

  const handleChooseScoringTeam = (teamId) => {
    setScoringTeamId(teamId);
    setScorerName("");
    setAssistName("");
    setGoalStep("scorer");
  };

  const handleCancelGoalRecord = () => {
    if (activeGoalCaptureRequest?.requestId && activeGoalCaptureRequest?.matchId) {
      setShowGoalCancelDecision(true);
      return;
    }

    setEditingGoalIndex(null);
    closeGoalRecorderCleanly({ clearCapture: true });
  };

  const handleMarkGoalCaptureDisputed = async () => {
    const request = activeGoalCaptureRequest;
    closeGoalRecorderCleanly({ clearCapture: false });

    if (!request?.matchId || !request?.requestId) {
      setActiveGoalCaptureRequest(null);
      return;
    }

    try {
      await VideoHighlightsRepository.markCaptureRequestDisputed({
        matchId: request.matchId,
        requestId: request.requestId,
        type: "goal",
        reason: "goal_recording_cancelled_as_disputed_before_metadata_completed",
        event: {
          id: request.eventId || request.requestId,
          eventId: request.eventId || request.requestId,
          type: "goal",
          status: "disputed",
          metadataStatus: "disputed_pending_review",
          captureStage: "record_goal_cancelled_disputed",
          timeSeconds: request.timeSeconds ?? Math.max((matchSeconds || 0) - (displaySeconds || 0), 0),
        },
        metadata: {
          metadataStatus: "disputed_pending_review",
          scorer: null,
          assist: null,
          teamId: null,
          teamName: null,
        },
        matchContext: {
          ...basicSummary,
          scoreBefore: {
            goalsA,
            goalsB,
          },
        },
      });
    } catch (err) {
      console.warn("[TK AUTO-CAPTURE] Failed to mark disputed capture:", err);
    } finally {
      setActiveGoalCaptureRequest(null);
    }
  };

  const handleDeleteMistakeGoalCapture = async () => {
    const request = activeGoalCaptureRequest;
    closeGoalRecorderCleanly({ clearCapture: false });

    if (!request?.matchId || !request?.requestId) {
      setActiveGoalCaptureRequest(null);
      return;
    }

    try {
      await VideoHighlightsRepository.deleteCaptureRequest({
        matchId: request.matchId,
        requestId: request.requestId,
      });
    } catch (err) {
      console.warn("[TK AUTO-CAPTURE] Failed to delete mistaken capture request:", err);
    } finally {
      setActiveGoalCaptureRequest(null);
    }
  };

  const handleAddGoalEvent = async () => {
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

    if (isDismissedPlayer(scoringTeamId, scorerName)) {
      window.alert(
        "This player has been sent off and cannot score."
      );
      setScorerName("");
      setAssistName("");
      return;
    }

    if (
      assistName &&
      isDismissedPlayer(scoringTeamId, assistName)
    ) {
      window.alert(
        "This player has been sent off and cannot provide an assist."
      );
      setAssistName("");
      return;
    }

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
      teamLabel:
        scoringTeamId === teamAId
          ? getTeamDisplayName(teamA, "Turf Kings")
          : getTeamDisplayName(teamB, "Opponent"),
      scorer: scorerName,
      assist: assistName || null,
      scorerType: scorerIsGuest ? "guest" : "registered",
      assistType: assistName
        ? assistIsGuest
          ? "guest"
          : "registered"
        : null,
      timeSeconds: (matchSeconds || 0) - (displaySeconds || 0),
      captureRequestId: activeGoalCaptureRequest?.requestId || null,
      videoHighlightsMatchId: activeGoalCaptureRequest?.matchId || resolvedVideoHighlightsMatchId || null,
    };

    onAddEvent?.(event);

    if (activeGoalCaptureRequest?.matchId && activeGoalCaptureRequest?.requestId) {
      const scoreAfter = {
        goalsA: scoringTeamId === teamAId ? goalsA + 1 : goalsA,
        goalsB: scoringTeamId === teamBId ? goalsB + 1 : goalsB,
        [teamAId || "teamA"]: scoringTeamId === teamAId ? goalsA + 1 : goalsA,
        [teamBId || "teamB"]: scoringTeamId === teamBId ? goalsB + 1 : goalsB,
      };

      VideoHighlightsRepository.updateCaptureRequestMetadata({
        matchId: activeGoalCaptureRequest.matchId,
        requestId: activeGoalCaptureRequest.requestId,
        status: "metadata_completed",
        type: "goal",
        event: {
          ...event,
          eventId: activeGoalCaptureRequest.eventId || activeGoalCaptureRequest.requestId,
          metadataStatus: "completed",
          captureStage: "goal_metadata_completed",
          scoreAfter,
        },
        metadata: {
          metadataStatus: "completed",
          eventId: event.id,
          scorer: scorerName,
          assist: assistName || null,
          teamId: scoringTeamId,
          teamName: event.teamLabel,
          matchNo: currentMatchNo,
          matchType: "FRIENDLY",
          gameFormat: gameFormat || "5_V_5",
          scoreAfter,
        },
        matchContext: {
          ...basicSummary,
          scoreAfter,
        },
      }).catch((err) => {
        console.warn("[TK AUTO-CAPTURE] Failed to update goal capture metadata:", err);
      });
    }

    setActiveGoalCaptureRequest(null);
    setScoringTeamId("");
    setScorerName("");
    setAssistName("");
    setShowGoalRecorder(false);
    setEditingGoalIndex(null);
    setGoalStep("team");

    appendEventToFirestore(event, basicSummary, displaySeconds, matchSeconds);
  };

  const handleStartShiboboRecord = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can record shibobo.");
      return;
    }
    if (!hasVerifiedLineups) {
      window.alert("Verify lineups before recording shibobo.");
      return;
    }

    setShowShiboboRecorder(true);
    setShiboboTeamId("");
    setShiboboPlayerName("");
    setShiboboVictimName("");
  };

  const handleAddShiboboEvent = async () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can record shibobo.");
      return;
    }

    if (!shiboboTeamId || !shiboboPlayerName) {
      window.alert("Select a team and player first.");
      return;
    }

    const event = {
      id: Date.now().toString(),
      type: "shibobo",
      teamId: shiboboTeamId,
      teamLabel:
        shiboboTeamId === teamAId
          ? getTeamDisplayName(teamA, "Turf Kings")
          : getTeamDisplayName(teamB, "Opponent"),
      playerName: shiboboPlayerName,
      victimName: shiboboVictimName || null,
      timeSeconds: (matchSeconds || 0) - (displaySeconds || 0),
    };

    onAddEvent?.(event);

    setShowShiboboRecorder(false);
    setShiboboTeamId("");
    setShiboboPlayerName("");
    setShiboboVictimName("");

    appendEventToFirestore(event, basicSummary, displaySeconds, matchSeconds);
  };

  const handleMarkRotationDone = async () => {
    if (!canControlMatch) return;

    const event = {
      id: Date.now().toString(),
      type: "rotation",
      teamId: null,
      timeSeconds: (matchSeconds || 0) - (displaySeconds || 0),
      note: "Rotation completed",
    };

    onAddEvent?.(event);
    appendEventToFirestore(event, basicSummary, displaySeconds, matchSeconds);
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
      teamALabel: getTeamDisplayName(teamA, "Turf Kings"),
      teamBLabel: getTeamDisplayName(teamB, "Opponent"),
      teamAColorName: effectiveTeamA?.teamColorName || effectiveTeamA?.colorName || "",
      teamBColorName: effectiveTeamB?.teamColorName || effectiveTeamB?.colorName || "",
      teamASnapshot: teamA || null,
      teamBSnapshot: teamB || null,
      goalsA,
      goalsB,
      matchMode: gameFormat || "5_V_5",
      gameFormat: gameFormat || "5_V_5",
      playersPerSide,
    };

    onConfirmEndMatch?.(summary);

    const finalSummary = {
      ...basicSummary,
      teamASnapshot: teamA || null,
      teamBSnapshot: teamB || null,
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

    if (isDismissedPlayer(scoringTeamId, scorerName)) {
      window.alert(
        "This player has been sent off and cannot score."
      );
      return;
    }

    if (
      assistName &&
      isDismissedPlayer(scoringTeamId, assistName)
    ) {
      window.alert(
        "This player has been sent off and cannot provide an assist."
      );
      setAssistName("");
      return;
    }

    const relevantSnapshot =
      scoringTeamId === teamAId ? verifiedLineupA : verifiedLineupB;

    const scorerIsGuest = isGuestPlayerInSnapshot(relevantSnapshot, scorerName);
    const assistIsGuest = assistName
      ? isGuestPlayerInSnapshot(relevantSnapshot, assistName)
      : false;

    const updatedEvent = {
      ...originalEvent,
      teamId: scoringTeamId,
      teamLabel:
        scoringTeamId === teamAId
          ? getTeamDisplayName(teamA, "Turf Kings")
          : getTeamDisplayName(teamB, "Opponent"),
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

  const deleteLinkedCaptureRequestForEvent = (event) => {
    const requestId = event?.captureRequestId;
    const captureMatchId = event?.videoHighlightsMatchId || resolvedVideoHighlightsMatchId;

    if (!requestId || !captureMatchId) return;

    VideoHighlightsRepository.deleteCaptureRequest({
      matchId: captureMatchId,
      requestId,
    }).catch((err) => {
      console.warn("[TK AUTO-CAPTURE] Failed to delete linked capture request:", err);
    });
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
      const deletedEvent = currentEvents[deleteIndex] || null;
      deleteLinkedCaptureRequestForEvent(deletedEvent);
      onDeleteEvent?.(deleteIndex);
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
      onBackToLanding?.();
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

    onBackToLanding?.();
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

    const undoneEvent = currentEvents[currentEvents.length - 1] || null;
    deleteLinkedCaptureRequestForEvent(undoneEvent);
    onUndoLastEvent?.();
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

  const [showFinishTimeModal, setShowFinishTimeModal] = useState(false);
  const [selectedFinishTime, setSelectedFinishTime] = useState("");
  const [customFinishTime, setCustomFinishTime] = useState("");

  const [showRotationModal, setShowRotationModal] = useState(false);
  const [selectedRotationMode, setSelectedRotationMode] = useState(
    normalizeRotationReminderMode(rotationReminderMode)
  );

  useEffect(() => {
    setSelectedRotationMode(
      normalizeRotationReminderMode(rotationReminderMode)
    );
  }, [rotationReminderMode]);

  const openRotationModal = () => {
    if (
      !canControlMatch ||
      typeof onUpdateRotationReminder !== "function"
    ) {
      return;
    }

    setSelectedRotationMode(
      normalizeRotationReminderMode(rotationReminderMode)
    );
    setShowRotationModal(true);
  };

  const closeRotationModal = () => {
    setShowRotationModal(false);
  };

  const handleSaveRotation = () => {
    if (typeof onUpdateRotationReminder !== "function") return;

    onUpdateRotationReminder(
      normalizeRotationReminderMode(selectedRotationMode)
    );
    closeRotationModal();
  };

  const formatClockTime = (value) => {
    const date = value instanceof Date ? value : new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
  };

  const addMinutesToClock = (value, minutes) => {
    const date = new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) return "";
    date.setMinutes(date.getMinutes() + minutes);
    return formatClockTime(date);
  };

  const recommendedFinish =
    formatClockTime(expectedEndAtISO) || formatClockTime(new Date());

  const officialScheduledFinish =
    formatClockTime(scheduledFinishAtISO) || recommendedFinish;

  const displayedScheduledFinishDate = scheduledFinishAtISO
    ? new Date(scheduledFinishAtISO)
    : expectedEndAtISO
      ? new Date(expectedEndAtISO)
      : new Date();

  const scheduledStartDate = new Date(displayedScheduledFinishDate);
  scheduledStartDate.setMinutes(scheduledStartDate.getMinutes() - 60);

  const scheduledSessionLabel =
    `${formatClockTime(scheduledStartDate)} → ${officialScheduledFinish}`;

  const recommendationDiffersFromSchedule =
    Boolean(officialScheduledFinish) &&
    officialScheduledFinish !== recommendedFinish;

  const finishTimeOptions = Array.from(
    new Set([
      addMinutesToClock(expectedEndAtISO, -15),
      recommendedFinish,
      addMinutesToClock(expectedEndAtISO, 15),
      officialScheduledFinish,
    ].filter(Boolean))
  );

  const openFinishTimeModal = () => {
    if (!canControlMatch || typeof onUpdateExpectedEndTime !== "function") return;
    setSelectedFinishTime(recommendedFinish);
    setCustomFinishTime("");
    setShowFinishTimeModal(true);
  };

  const closeFinishTimeModal = () => {
    setShowFinishTimeModal(false);
    setCustomFinishTime("");
  };

  const handleSaveFinishTime = () => {
    const nextFinishTime =
      selectedFinishTime === "custom"
        ? String(customFinishTime || "").trim()
        : selectedFinishTime;

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(nextFinishTime || "")) {
      window.alert("Please choose a valid finish time.");
      return;
    }

    onUpdateExpectedEndTime(nextFinishTime);
    closeFinishTimeModal();
  };

  return (
    <div
      className="page live-page"
      style={{
        opacity: screenDimmed ? 0.42 : 1,
        transition: "opacity 0.8s ease",
      }}
    >
      {showRotationModal && (
        <div
          className="fanm-finish-time-backdrop fanm-rotation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRotationModal();
          }}
        >
          <section
            className="fanm-finish-time-modal fanm-rotation-modal fanm-friendly-control-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rotation-modal-title"
          >
            <button
              type="button"
              className="fanm-finish-time-close"
              onClick={closeRotationModal}
              aria-label="Close rotation settings"
            >
              ×
            </button>

            <div className="fanm-finish-time-heading fanm-rotation-heading">
              <span
                className="fanm-finish-time-icon fanm-rotation-heading-icon"
                aria-hidden="true"
              >
                🔄
              </span>

              <div>
                <h2 id="rotation-modal-title">Set Rotation</h2>
                <p>Substitution alert &amp; keeper change:</p>
              </div>
            </div>

            <div className="fanm-finish-time-options fanm-rotation-options">
              {[
                { value: "time", icon: "◷", label: "Every 5 min" },
                { value: "goals", icon: "⚽", label: "Every 2 goals" },
                { value: "off", icon: "🔕", label: "Off" },
              ].map((option) => {
                const selected = selectedRotationMode === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`fanm-finish-time-option fanm-rotation-option ${
                      selected ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedRotationMode(option.value)}
                  >
                    <span
                      className="fanm-finish-time-radio"
                      aria-hidden="true"
                    />

                    <span
                      className="fanm-rotation-option-icon"
                      aria-hidden="true"
                    >
                      {option.icon}
                    </span>

                    <strong>{option.label}</strong>
                  </button>
                );
              })}
            </div>

            <div className="fanm-finish-time-actions fanm-rotation-actions">
              <button
                type="button"
                className="primary-btn fanm-rotation-save-btn"
                onClick={handleSaveRotation}
              >
                Save
              </button>
            </div>
          </section>
        </div>
      )}

      {showFinishTimeModal && (
        <div
          className="fanm-finish-time-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeFinishTimeModal();
          }}
        >
          <section
            className="fanm-finish-time-modal fanm-friendly-control-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-time-modal-title"
          >
            <button
              type="button"
              className="fanm-finish-time-close"
              onClick={closeFinishTimeModal}
              aria-label="Close finish time settings"
            >
              ×
            </button>

            <div className="fanm-finish-time-heading">
              <span className="fanm-finish-time-icon">◷</span>
              <div>
                <h2 id="finish-time-modal-title">Finish time</h2>
                <p>Choose when this match should end.</p>
              </div>
            </div>

            <div className="fanm-finish-time-current">
              <span>Scheduled session</span>

              <strong>{scheduledSessionLabel}</strong>
            </div>

            <div className="fanm-finish-time-options">
              {finishTimeOptions.map((option) => {
                const selected = selectedFinishTime === option;

                return (
                  <button
                    key={option}
                    type="button"
                    className={`fanm-finish-time-option ${
                      selected ? "is-selected" : ""
                    }`}
                    onClick={() => {
                      setSelectedFinishTime(option);
                      setCustomFinishTime("");
                    }}
                  >
                    <span
                      className="fanm-finish-time-radio"
                      aria-hidden="true"
                    />
                    <strong>{option}</strong>

                    {option === recommendedFinish ? (
                      <small>
                        {recommendationDiffersFromSchedule
                          ? "Recommended"
                          : "Default"}
                      </small>
                    ) : option === officialScheduledFinish ? (
                      <small>Scheduled session</small>
                    ) : null}
                  </button>
                );
              })}

              <button
                type="button"
                className={`fanm-finish-time-option ${
                  selectedFinishTime === "custom" ? "is-selected" : ""
                }`}
                onClick={() => setSelectedFinishTime("custom")}
              >
                <span
                  className="fanm-finish-time-radio"
                  aria-hidden="true"
                />
                <strong>Custom…</strong>
              </button>
            </div>

            {selectedFinishTime === "custom" && (
              <label className="fanm-finish-time-custom">
                <span>Custom finish time</span>

                <span className="fanm-finish-time-custom-picker">
                  <span
                    className="fanm-finish-time-custom-picker-display"
                    aria-hidden="true"
                  >
                    <span className="fanm-finish-time-custom-clock">◷</span>
                    <strong>{customFinishTime || "Choose a time"}</strong>
                  </span>

                  <input
                    type="time"
                    value={customFinishTime}
                    onChange={(event) =>
                      setCustomFinishTime(event.target.value)
                    }
                    aria-label="Choose a custom finish time"
                    autoFocus
                  />
                </span>
              </label>
            )}

            <div className="fanm-finish-time-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={closeFinishTimeModal}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveFinishTime}
              >
                Save finish time
              </button>
            </div>
          </section>
        </div>
      )}

      {rotationDue ? (
        <div
          className={`fanm-rotation-due-notice ${
            rotationToastVisible ? "is-toast" : "is-pill"
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="fanm-rotation-due-icon" aria-hidden="true">
            🔄
          </span>

          <span className="fanm-rotation-due-copy">
            <strong>Rotation due</strong>
            <small>
              {rotationToastVisible
                ? rotationDue.reason
                : "Substitution or keeper change"}
            </small>
          </span>

          <button
            type="button"
            className="fanm-rotation-due-action"
            onClick={openLiveLineupEditor}
          >
            Edit lineups
          </button>

          {!rotationToastVisible ? (
            <button
              type="button"
              className="fanm-rotation-due-close"
              onClick={clearRotationReminder}
              aria-label="Dismiss rotation reminder"
              title="Dismiss"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      <header className="header">
        <h1>Friendly {formatLabel}</h1>
        <p>
          <TeamColorBadge team={effectiveTeamA} fallback="DARK" iconPosition="after" compact /> vs{" "}
          <TeamColorBadge team={effectiveTeamB} fallback="LIGHT" iconPosition="before" compact />
        </p>
        <p className="muted small">
          Signed in as <strong>{getIdentityDisplayName(identity)}</strong> •{" "}
          <strong>{role}</strong>
          {isCaptain ? " 👑" : ""}
          {isAdmin ? " 🛠️" : ""}
        </p>
      </header>

      <section className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div><strong>🎮 Match Referee:</strong> {controllerName}</div>

          {!canControlCurrentLiveMatch ? (
            <button className="secondary-btn" type="button" onClick={onRequestTakeOverLiveMatch}>
              🥷 Request Takeover
            </button>
          ) : (
            <span className="muted small">You control this live match</span>
          )}
        </div>

        {hasPendingTakeoverRequest && canControlCurrentLiveMatch && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.35)" }}>
            <p style={{ marginBottom: 10 }}>
              <strong>{takeoverRequesterName}</strong> wants to take over officiating.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="primary-btn" type="button" onClick={onAcceptTakeoverRequest}>✅ Approve</button>
              <button className="secondary-btn" type="button" onClick={onRejectTakeoverRequest}>❌ Reject</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="timer-row">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
            <div className={`timer-display ${additionalTimeRunning ? "timer-display-added-time" : ""}`}>
              {liveFormattedTime}
              {additionalTimeRunning ? (
                <span className="added-time-sup">
                  +ADDED TIME
                </span>
              ) : null}
            </div>
            {canControlMatch && typeof onUpdateMatchSeconds === "function" ? (
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
            {canControlMatch && typeof onUpdateExpectedEndTime === "function" && (
              <button
                type="button"
                className="link-btn live-finish-time-settings-btn"
                onClick={openFinishTimeModal}
                title="Adjust scheduled finish time"
                aria-label="Adjust scheduled finish time"
                style={{
                  opacity: 0.56,
                  fontSize: "0.92rem",
                  padding: "0.1rem 0.25rem",
                  lineHeight: 1,
                }}
              >
                ⚙
              </button>
            )}

            {canControlMatch &&
            typeof onUpdateRotationReminder === "function" ? (
              <button
                type="button"
                className={`secondary-btn live-rotation-settings-btn ${
                  normalizeRotationReminderMode(rotationReminderMode) !== "off"
                    ? "is-active"
                    : ""
                }`}
                style={{ marginLeft: "0.18rem" }}
                onClick={openRotationModal}
                title="Set substitution and goalkeeper rotation reminders"
                aria-label="Set rotation reminders"
              >
                <span aria-hidden="true">🔄</span>
              </button>
            ) : null}

            {canControlMatch ? (
              <button
                type="button"
                className="secondary-btn live-card-settings-btn"
                onClick={() => setShowCardRecorder(true)}
                title="Open match discipline"
                aria-label="Open match discipline"
              >
                <span aria-hidden="true">🟨</span>
              </button>
            ) : null}
          </div>
          <div className="live-timer-status-row">
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
        </div>

        <div
          className="score-row"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <div className="score-team">
            <strong className="score-team-name">
              <TeamColorBadge
                team={effectiveTeamA}
                fallback="DARK"
                compact
              />
            </strong>
            <div className="score-number">{goalsA}</div>
          </div>

          <div className="score-dash">–</div>

          <div className="score-team">
            <strong className="score-team-name">
              <TeamColorBadge
                team={effectiveTeamB}
                fallback="LIGHT"
                compact
              />
            </strong>
            <div className="score-number">{goalsB}</div>
          </div>
        </div>

        <div className="event-input">
          <h3>Live Actions</h3>

          {!hasVerifiedLineups && canControlMatch && (
            <p className="muted stats-season-range">
              Verify lineups before recording live events.
            </p>
          )}

          <div className="live-inline-actions" style={{ flexWrap: "wrap" }}>
            <button
              className="primary-btn"
              type="button"
              onClick={handleStartGoalRecord}
              disabled={!canControlMatch || !hasVerifiedLineups}
            >
              ⚽ Record Goal
            </button>



            <button
              className="secondary-btn"
              type="button"
              onClick={openLiveLineupEditor}
              disabled={!playersReady}
            >
              🧑 Edit Lineups
            </button>
          </div>
        </div>

        <div className="event-log">
          <div className="event-log-header">
            <h3>Live Event Feed</h3>
          </div>

          {currentEvents.length === 0 && (
            <p className="muted">No live events yet.</p>
          )}

          <ul>
            {currentEvents.map((e, idx) => {
              if (
                e.type === "yellow_card" ||
                e.type === "red_card"
              ) {
                const isRed =
                  e.type === "red_card";

                return (
                  <li
                    key={e.id || idx}
                    className={`event-item fanm-discipline-event ${
                      isRed
                        ? "is-red"
                        : "is-yellow"
                    }`}
                  >
                    <span
                      className="fanm-discipline-event-card"
                      aria-hidden="true"
                    >
                      {isRed ? "🟥" : "🟨"}
                    </span>

                    <span className="fanm-discipline-event-copy">
                      <strong>
                        {e.playerName ||
                          "Unknown player"}
                      </strong>

                      <small>
                        {formatSeconds(
                          Number(e.timeSeconds || 0)
                        )}{" "}
                        · {e.teamLabel || "TEAM"}
                      </small>
                    </span>

                    {canControlMatch ? (
                      <button
                        type="button"
                        className="fanm-discipline-event-undo"
                        onClick={() =>
                          reverseDisciplineCard({
                            ...e,
                            eventIndex: idx,
                          })
                        }
                      >
                        Undo
                      </button>
                    ) : null}
                  </li>
                );
              }

              if (e.type === "goal") {
                const teamForEvent =
                  e.teamId === teamAId
                    ? effectiveTeamA
                    : e.teamId === teamBId
                    ? effectiveTeamB
                    : null;
                const label = eventLabel(e.teamId, teamAId, teamBId, teamA, teamB);
                const teamAbbrev =
                  teamForEvent?.teamIdentity?.abbr || teamForEvent?.abbrev || label;
                const goalTheme = getTeamAccent(teamForEvent || {});
                return (
                  <li
                    key={e.id || idx}
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
                            {formatEventClock(matchSeconds, displaySeconds, e.timeSeconds)}
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
              }

              return null;
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

      {showCardRecorder && (
        <div
          className="modal-backdrop fanm-discipline-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCardRecorder();
            }
          }}
        >
          <section
            className="modal fanm-discipline-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-discipline-title"
          >
            <button
              type="button"
              className="fanm-card-placeholder-close"
              onClick={closeCardRecorder}
              aria-label="Close match discipline"
            >
              ×
            </button>

            <div className="fanm-card-placeholder-heading fanm-discipline-heading">
              <span aria-hidden="true">🟨</span>

              <div>
                <h2 id="match-discipline-title">Match Discipline</h2>
                <p>Select a player to issue a caution or dismissal.</p>
              </div>
            </div>

            <section className="fanm-discipline-rules">
              <div className="fanm-discipline-rules-heading">
                <span aria-hidden="true">⚖️</span>
                <div>
                  <strong>Competition Rules</strong>
                  <small>Red-card consequence for this match</small>
                </div>
              </div>

              <div className="fanm-discipline-rule-options">
                <button
                  type="button"
                  className={`fanm-discipline-rule-option ${
                    normalizedActiveRedCardRule === "permanent"
                      ? "is-selected"
                      : ""
                  }`}
                  onClick={() =>
                    handleSelectRedCardRule("permanent")
                  }
                  disabled={
                    typeof onUpdateRedCardRule !== "function"
                  }
                >
                  <span
                    className="fanm-discipline-rule-radio"
                    aria-hidden="true"
                  />
                  <span aria-hidden="true">🚫</span>
                  <span>
                    <strong>Send off for remainder of match</strong>
                    <small>Player cannot return and the team stays short.</small>
                  </span>
                </button>

                <button
                  type="button"
                  className={`fanm-discipline-rule-option ${
                    normalizedActiveRedCardRule === "two_minute"
                      ? "is-selected"
                      : ""
                  }`}
                  onClick={() =>
                    handleSelectRedCardRule("two_minute")
                  }
                  disabled={
                    typeof onUpdateRedCardRule !== "function"
                  }
                >
                  <span
                    className="fanm-discipline-rule-radio"
                    aria-hidden="true"
                  />
                  <span aria-hidden="true">⏱️</span>
                  <span>
                    <strong>Team plays short for 2 minutes</strong>
                    <small>
                      Sent-off player cannot return, but another substitute may
                      restore the team after the penalty.
                    </small>
                  </span>
                </button>
              </div>

              <p className="fanm-discipline-rules-default">
                Permanent dismissal is the default unless changed.
              </p>
            </section>

            <div className="fanm-discipline-teams">
              {[
                {
                  teamId: teamAId,
                  team: effectiveTeamA,
                  fallback: "TEAM A",
                  groups: disciplinePlayersA,
                  dismissed: dismissedPlayersA,
                },
                {
                  teamId: teamBId,
                  team: effectiveTeamB,
                  fallback: "TEAM B",
                  groups: disciplinePlayersB,
                  dismissed: dismissedPlayersB,
                },
              ].map(
                ({
                  teamId,
                  team,
                  fallback,
                  groups,
                  dismissed,
                }) => (
                <section
                  key={teamId || fallback}
                  className="fanm-discipline-team"
                >
                  <div className="fanm-discipline-team-heading">
                    <TeamColorBadge
                      team={team}
                      fallback={fallback}
                    />
                  </div>

                  {[
                    {
                      label: "On field",
                      players: groups.onField,
                    },
                    {
                      label: "Substitutes",
                      players: groups.substitutes,
                    },
                    {
                      label: "Dismissed",
                      players: dismissed || [],
                    },
                  ].map((group) => (
                    <div
                      key={group.label}
                      className="fanm-discipline-group"
                    >
                      <h3>{group.label}</h3>

                      {group.players.length === 0 ? (
                        <p className="muted small fanm-discipline-empty">
                          No players available
                        </p>
                      ) : (
                        <div className="fanm-discipline-player-list">
                          {group.players.map((player) => {
                            const selected =
                              disciplinePlayerKey(selectedDisciplinePlayer) ===
                              disciplinePlayerKey(player);

                            const cardStatus =
                              getDisciplineStatus(player);

                            const yellowEvent =
                              cardStatus.yellowEvents[
                                cardStatus.yellowEvents.length - 1
                              ] || null;

                            const redEvent =
                              cardStatus.redEvents[
                                cardStatus.redEvents.length - 1
                              ] || null;

                            const initials = String(player.name || "?")
                              .trim()
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part.charAt(0).toUpperCase())
                              .join("");

                            const playerPhoto = getPlayerPhoto(player.name);

                            return (
                              <article
                                key={`${teamId}-${player.positionId || "bench"}-${playerKeyFor(player.name)}`}
                                className={`fanm-discipline-player ${
                                  selected ? "is-selected" : ""
                                } ${
                                  player.isDismissed
                                    ? "is-dismissed"
                                    : ""
                                }`}
                              >
                                <button
                                  type="button"
                                  className="fanm-discipline-player-main"
                                  onClick={() => toggleDisciplinePlayer(player)}
                                  aria-expanded={selected}
                                >
                                  <span
                                    className={`fanm-discipline-player-avatar ${
                                      playerPhoto ? "has-photo" : ""
                                    }`}
                                    aria-hidden="true"
                                  >
                                    {playerPhoto ? (
                                      <img
                                        src={playerPhoto}
                                        alt=""
                                        loading="lazy"
                                      />
                                    ) : (
                                      initials || "?"
                                    )}
                                  </span>

                                  <span className="fanm-discipline-player-copy">
                                    <strong>{player.name}</strong>
                                    <small>{player.roleLabel}</small>
                                  </span>

                                  <span className="fanm-discipline-booking-status">
                                    {yellowEvent ? (
                                      <span
                                        className="is-yellow"
                                        title="Yellow card"
                                      >
                                        🟨{" "}
                                        {Math.max(
                                          1,
                                          Math.ceil(
                                            Number(
                                              yellowEvent.timeSeconds || 0
                                            ) / 60
                                          )
                                        )}
                                        '
                                      </span>
                                    ) : null}

                                    {redEvent ? (
                                      <span
                                        className="is-red"
                                        title="Red card"
                                      >
                                        🟥{" "}
                                        {Math.max(
                                          1,
                                          Math.ceil(
                                            Number(
                                              redEvent.timeSeconds || 0
                                            ) / 60
                                          )
                                        )}
                                        '
                                      </span>
                                    ) : null}
                                  </span>

                                  <span
                                    className="fanm-discipline-player-chevron"
                                    aria-hidden="true"
                                  >
                                    {selected ? "⌃" : "›"}
                                  </span>
                                </button>

                                {selected ? (
                                  <div className="fanm-discipline-actions">
                                    {!yellowEvent && !redEvent ? (
                                      <button
                                        type="button"
                                        className="fanm-discipline-yellow"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          issueDisciplineCard(
                                            "yellow_card",
                                            player
                                          );
                                        }}
                                      >
                                        <span aria-hidden="true">🟨</span>
                                        Yellow card
                                      </button>
                                    ) : null}

                                    {!redEvent ? (
                                      <button
                                        type="button"
                                        className="fanm-discipline-red"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          issueDisciplineCard(
                                            "red_card",
                                            player
                                          );
                                        }}
                                      >
                                        <span aria-hidden="true">🟥</span>
                                        Red card
                                      </button>
                                    ) : null}

                                    {yellowEvent ? (
                                      <button
                                        type="button"
                                        className="fanm-discipline-undo"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          reverseDisciplineCard(
                                            yellowEvent
                                          );
                                        }}
                                      >
                                        Undo 🟨
                                      </button>
                                    ) : null}

                                    {redEvent ? (
                                      <button
                                        type="button"
                                        className="fanm-discipline-undo"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          reverseDisciplineCard(
                                            redEvent
                                          );
                                        }}
                                      >
                                        Undo 🟥
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
                )
              )}
            </div>

            <div className="fanm-discipline-note">
              <span aria-hidden="true">ⓘ</span>
              <p>
                <strong>Yellow card</strong> means caution.
                <span aria-hidden="true"> · </span>
                <strong>Red card</strong> means dismissal.
              </p>
            </div>
          </section>
        </div>
      )}

      {showVerifyModal && (
        <div className="modal-backdrop">
          <div className="modal live-verify-modal">
            <h3>Edit lineup positions</h3>
            <p className="muted live-verify-note">______________________</p>

            {(dismissedPlayersA.length > 0 ||
              dismissedPlayersB.length > 0) && (
              <div className="fanm-dismissed-lineup-locks">
                <div className="fanm-dismissed-lineup-locks-heading">
                  <span aria-hidden="true">🟥</span>
                  <div>
                    <strong>Sent-off players</strong>
                    <small>
                      Locked out and unavailable for lineup selection
                    </small>
                  </div>
                </div>

                <div className="fanm-dismissed-lineup-lock-list">
                  {[
                    ...dismissedPlayersA.map((player) => ({
                      ...player,
                      teamLabel: getShortLabel(effectiveTeamA, "TEAM A"),
                    })),
                    ...dismissedPlayersB.map((player) => ({
                      ...player,
                      teamLabel: getShortLabel(effectiveTeamB, "TEAM B"),
                    })),
                  ].map((player) => (
                    <span
                      key={`${player.teamId}-${playerKeyFor(player.name)}`}
                      className="fanm-dismissed-lineup-lock"
                    >
                      <span aria-hidden="true">🟥</span>
                      <strong>{player.name}</strong>
                      <small>{player.teamLabel} · Sent off</small>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <section className="fanm-match-colours-panel">
              <div className="fanm-match-colours-heading">
                <div>
                  <span aria-hidden="true">🎨</span>
                  <div>
                    <strong>Match Colours</strong>
                    <small>
                      Override squad colours for this match only
                    </small>
                  </div>
                </div>

                {Object.keys(localMatchTeamColorOverrides || {}).length > 0 ? (
                  <button
                    type="button"
                    className="fanm-match-colours-reset"
                    onClick={resetMatchTeamColourOverrides}
                  >
                    Reset to squad colours
                  </button>
                ) : (
                  <span className="fanm-match-colours-default">
                    Using squad defaults
                  </span>
                )}
              </div>

              <div className="fanm-match-colours-grid">
                {[
                  {
                    teamId: teamAId,
                    team: teamA,
                    effectiveTeam: effectiveTeamA,
                    fallback: "TEAM A",
                  },
                  {
                    teamId: teamBId,
                    team: teamB,
                    effectiveTeam: effectiveTeamB,
                    fallback: "TEAM B",
                  },
                ].map(
                  ({
                    teamId,
                    team,
                    effectiveTeam,
                    fallback,
                  }) => {
                    const hasOverride = Boolean(
                      localMatchTeamColorOverrides?.[teamId]
                    );

                    return (
                      <article
                        key={teamId || fallback}
                        className="fanm-match-colour-card"
                        style={{
                          "--match-colour-accent":
                            getTeamAccent(
                              effectiveTeam || team || {}
                            ).dot,
                          "--match-colour-soft":
                            getTeamAccent(
                              effectiveTeam || team || {}
                            ).soft,
                          "--match-colour-border":
                            getTeamAccent(
                              effectiveTeam || team || {}
                            ).border,
                        }}
                      >
                        <div className="fanm-match-colour-card-head">
                          <TeamColorBadge
                            team={effectiveTeam || team}
                            fallback={fallback}
                          />

                          <span
                            className={`fanm-match-colour-source ${
                              hasOverride
                                ? "is-override"
                                : ""
                            }`}
                          >
                            {hasOverride
                              ? "Match override"
                              : "Squad default"}
                          </span>
                        </div>

                        <TeamIdentityEditor
                          team={effectiveTeam || team}
                          colourName={
                            effectiveTeam?.teamColorName ||
                            effectiveTeam?.colorName ||
                            ""
                          }
                          showName={false}
                          showAbbreviation={false}
                          showColour
                          compact
                          disabled={
                            !canControlMatch ||
                            typeof onUpdateMatchTeamColorOverride !==
                              "function"
                          }
                          onColourChange={(nextColour) =>
                            applyMatchTeamColorOverride(
                              teamId,
                              nextColour
                            )
                          }
                        />
                      </article>
                    );
                  }
                )}
              </div>
            </section>

            <div className="live-lineup-columns fanm-colour-coded-lineups">
              {!playersReady ? (
                <div className="live-empty-full">
                  <p className="muted">Loading verified lineups…</p>
                </div>
              ) : (
                <>
                  <LineupBoard
                    title={getShortLabel(effectiveTeamA, "TEAM A")}
                    team={effectiveTeamA}
                    lineup={verifyTeamALineup}
                    setLineup={setVerifyTeamALineup}
                    protectedVacancies={
                      protectedVacanciesA
                    }
                    registeredPlayers={eligibleTeamAPlayers}
                    canonicalName={canonicalName}
                    displayCompactPlayerName={displayCompactPlayerName}
                    playerKeyFor={playerKeyFor}
                    getPlayerPhoto={getPlayerPhoto}
                    formationMap={formationMap}
                    defaultFormationId={defaultFormationId}
                    disabled={!canControlMatch}
                    onAutomaticBenchRotation={(rotation) =>
                      applyFriendlyAutomaticRotation({
                        ...rotation,
                        teamId: teamAId,
                        registeredPlayers: eligibleTeamAPlayers,
                      })
                    }
                  />

                  <LineupBoard
                    title={getShortLabel(effectiveTeamB, "OTHER TEAM")}
                    team={effectiveTeamB}
                    lineup={verifyTeamBLineup}
                    setLineup={setVerifyTeamBLineup}
                    protectedVacancies={
                      protectedVacanciesB
                    }
                    registeredPlayers={eligibleTeamBPlayers}
                    canonicalName={canonicalName}
                    displayCompactPlayerName={displayCompactPlayerName}
                    playerKeyFor={playerKeyFor}
                    getPlayerPhoto={getPlayerPhoto}
                    formationMap={formationMap}
                    defaultFormationId={defaultFormationId}
                    disabled={!canControlMatch}
                    onAutomaticBenchRotation={(rotation) =>
                      applyFriendlyAutomaticRotation({
                        ...rotation,
                        teamId: teamBId,
                        registeredPlayers: eligibleTeamBPlayers,
                      })
                    }
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

      {showAdditionalTimeModal && (
        <div className="modal-backdrop">
          <div className="modal live-add-time-modal">
            <h3>Additional Time</h3>
            <p className="muted small">
              Choose how much time to add to this friendly match.
            </p>

            <div className="live-add-time-options">
              <button className="secondary-btn" type="button" onClick={() => addAdditionalTime(60)}>
                +1 min
              </button>
              <button className="primary-btn" type="button" onClick={() => addAdditionalTime(180)}>
                +3 min
              </button>
              <button className="secondary-btn" type="button" onClick={() => addAdditionalTime(300)}>
                +5 min
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
        <div className="modal-backdrop">
          <div className="modal live-goal-recorder-modal">
            <h3>{editingGoalIndex !== null ? "Edit Goal" : "Record Goal"}</h3>

            {goalStep === "scorer" && (
              <>
                <p className="muted small" style={{ marginTop: "-0.25rem" }}>
                  Pick the player who scored. Both squads are shown together.
                </p>

                <div className="goal-scorer-two-column">
                  <div className="goal-scorer-team-card">
                    <div className="goal-scorer-team-head">
                      <TeamColorBadge team={effectiveTeamA} fallback="DARK" />
                    </div>
                    <PlayerChoiceGrid
                      title="Scorer"
                      players={goalRecorderChoicesForTeam(teamAId)}
                      team={effectiveTeamA}
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
                      <TeamColorBadge team={effectiveTeamB} fallback="LIGHT" />
                    </div>
                    <PlayerChoiceGrid
                      title="Scorer"
                      players={goalRecorderChoicesForTeam(teamBId)}
                      team={effectiveTeamB}
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

                <div className="actions-row">
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

                  <PlayerChoiceGrid
                    title="Assist"
                    players={assistOptions}
                    team={
                      scoringTeamId === teamAId
                        ? effectiveTeamA
                        : scoringTeamId === teamBId
                        ? effectiveTeamB
                        : null
                    }
                    selectedName={assistName}
                    onSelect={(name) =>
                      setAssistName(
                        assistName === name ? "" : name
                      )
                    }
                    displayCompactPlayerName={
                      displayCompactPlayerName
                    }
                    getPlayerPhoto={getPlayerPhoto}
                    guestSnapshotChecker={(name) =>
                      isGuestPlayerInSnapshot(
                        scoringTeamId === teamAId
                          ? verifiedLineupA
                          : verifiedLineupB,
                        name
                      )
                    }
                    disabled={!hasVerifiedLineups}
                  />
                </div>

                <div
                  className={`fanm-assist-selection-status ${
                    assistName ? "has-selection" : ""
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {assistName ? (
                    <>
                      <span aria-hidden="true">✓</span>
                      <strong>
                        Assist selected:{" "}
                        {displayCompactPlayerName(assistName)}
                      </strong>
                    </>
                  ) : (
                    <span>
                      No assist selected — saving will record the goal
                      without an assist.
                    </span>
                  )}
                </div>

                <div className="actions-row">
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
                    onClick={editingGoalIndex !== null ? handleSaveEditedGoal : handleAddGoalEvent}
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
      )}


      {showGoalCancelDecision && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Keep this captured moment?</h3>
            <p>
              The camera trigger was already sent when you clicked Record Goal.
              Choose whether this was a disputed moment worth keeping or a mistake that must be deleted.
            </p>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setShowGoalCancelDecision(false)}
              >
                Go back
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleMarkGoalCaptureDisputed}
              >
                Keep as disputed
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={handleDeleteMistakeGoalCapture}
              >
                Mistake — delete
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm End of {formatLabel} Match</h3>
            <p>
              <TeamColorBadge team={effectiveTeamA} fallback="DARK" /> {goalsA} – {goalsB}{" "}
              <TeamColorBadge team={effectiveTeamB} fallback="LIGHT" />
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
        <div className="modal-backdrop">
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
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Discard match &amp; go back?</h3>
            <p>
              This will <strong>permanently lose the current match</strong>,
              including goals and recorded events, and return to the main screen.
              Only leave if you intend to discard this game.
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

      {activeRefereeVar && canControlCurrentLiveMatch && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Private referee VAR review"
          style={{ zIndex: 10000 }}
        >
          <div
            className="modal"
            style={{
              width: "min(94vw, 760px)",
              maxHeight: "94vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                marginBottom: "0.75rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>
                  VAR READY
                </h3>

                <p
                  className="muted small"
                  style={{ margin: "0.25rem 0 0" }}
                >
                  Private referee review • 20-second replay
                </p>
              </div>

              <span
                style={{
                  fontWeight: 800,
                  fontSize: "0.78rem",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                REFEREE ONLY
              </span>
            </div>

            {(
              activeRefereeVar.downloadUrl ||
              activeRefereeVar.videoUrl ||
              activeRefereeVar.url
            ) ? (
              <video
                key={activeRefereeVar.id}
                src={
                  activeRefereeVar.downloadUrl ||
                  activeRefereeVar.videoUrl ||
                  activeRefereeVar.url
                }
                controls
                autoPlay
                playsInline
                preload="auto"
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "62vh",
                  background: "#000",
                  borderRadius: "12px",
                }}
              />
            ) : (
              <div
                style={{
                  padding: "1.25rem",
                  textAlign: "center",
                }}
              >
                <strong>VAR video is preparing…</strong>
                <p className="muted small">
                  The referee review will become available as soon as
                  the camera upload finishes.
                </p>
              </div>
            )}

            <p
              className="muted small"
              style={{ marginTop: "0.8rem" }}
            >
              This replay is an operational refereeing aid. It is not
              published to players or ordinary Video Highlights.
            </p>

            <div className="actions-row">
              <button
                className="primary-btn"
                type="button"
                onClick={dismissActiveRefereeVar}
              >
                Review complete
              </button>
            </div>
          </div>
        </div>
      )}

      {showUndoModal && (
        <div className="modal-backdrop">
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

export default FriendlyLiveMatchPage;