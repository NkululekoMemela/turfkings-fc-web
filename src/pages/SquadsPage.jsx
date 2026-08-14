// src/pages/SquadsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  where,
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  getPlayersCollection,
  getPlayerDoc,
  getPendingSignupsCollection,
  getMatchSignupsCollection,
  getScopedPendingSignupsCollection,
  getScopedMatchSignupsCollection,
} from "../core/clubFirestorePaths.js";
import {
  MATCH_MODE,
  GAME_FORMAT,
  getGameFormatConfig,
  normalizeMatchMode,
  normalizeGameFormat,
} from "../core/matchConfig.js";
import { buildPracticePlayers } from "../core/practiceSessionSeed.js";
import { buildClubIdentity } from "../core/clubIdentity.js";
import {
  isCaptainCode,
  isAdminCode,
} from "../core/accessCodes.js";

import {
  FANM_NATIONAL_TEAMS,
  FANM_PRO_CLUBS,
} from "../data/fanm/fanmTeamLibrary.js";
import TeamIdentityPicker from "../components/TeamIdentityPicker/TeamIdentityPicker.jsx";


import TeamIdentityEditor from "../components/TeamIdentityEditor";
const MASTER_CODE = "3333"; // Platform admin fallback
const UNSEEDED_ID = "__unseeded__";
const GUEST_OPPONENT_ID = "guest_opponent";
const TURF_KINGS_CHALLENGE_ID = "turf_kings_challenge";
const DEFAULT_GUEST_OPPONENT_NAME = "Opponent";
const TURF_KINGS_SLOT_ID = "dark";
const GUEST_OPPONENT_SLOT_ID = "light";
const TURF_KINGS_LOGO_URL = `${import.meta.env.BASE_URL}turfkings-share.jpeg`;
const PLAYERS_COLLECTION = "players";
const ADMIN_EMAILS = ["nkululekolerato@gmail.com"];
const LONG_PRESS_MS = 650;

/* ---------------- Helpers ---------------- */

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugFromName(name) {
  return toTitleCase(name)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeAbbrev(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
}

function isValidAbbrev(value) {
  const clean = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3,4}$/.test(clean);
}

function normalizeHexColor(v) {
  const raw = String(v || "").trim().replace(/[^#a-fA-F0-9]/g, "");
  if (!raw) return "";
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return raw.toUpperCase();
}

function isValidHexColor(v) {
  return /^#[0-9A-F]{6}$/.test(String(v || "").trim().toUpperCase());
}

function isAdminIdentity(identity) {
  if (!identity || typeof identity !== "object") return false;

  const emailCandidates = [
    identity.email,
    identity.userEmail,
    identity.gmail,
    identity.googleEmail,
  ]
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);

  if (emailCandidates.some((email) => ADMIN_EMAILS.includes(email))) {
    return true;
  }

  const roleCandidates = [
    identity.role,
    identity.userRole,
    identity.accountType,
    identity.actingRole,
  ]
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);

  if (roleCandidates.includes("admin")) {
    return true;
  }

  const nameCandidates = [
    identity.name,
    identity.displayName,
    identity.fullName,
    identity.playerName,
    identity.shortName,
  ]
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);

  return nameCandidates.some(
    (name) =>
      name === "nkululeko" ||
      name === "nkululeko memela" ||
      name === "nk"
  );
}

function bestFullDisplayFromPlayer(p) {
  if (!p) return "";
  const fullName = toTitleCase(p.fullName || "");
  if (fullName) return fullName;

  const aliasesArr = Array.isArray(p.aliases) ? p.aliases : [];
  const aliasCandidates = aliasesArr
    .map((a) => toTitleCase(a))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (aliasCandidates.length) return aliasCandidates[0];

  const shortName = toTitleCase(p.shortName || "");
  if (shortName) return shortName;

  const name = toTitleCase(p.name || "");
  if (name) return name;

  return toTitleCase(p.id || "");
}

function bestShortDisplayFromPlayer(p) {
  if (!p) return "";
  const shortName = toTitleCase(p.shortName || "");
  if (shortName) return shortName;

  const name = toTitleCase(p.name || "");
  if (name) return name;

  const fullName = toTitleCase(p.fullName || "");
  if (fullName) return fullName;

  return toTitleCase(p.id || "");
}

function buildIdentityStrings(playerDoc) {
  const id = String(playerDoc.id || "").trim();
  const name = toTitleCase(playerDoc.name || "");
  const fullName = toTitleCase(playerDoc.fullName || "");
  const shortName = toTitleCase(playerDoc.shortName || "");
  const aliasesArr = Array.isArray(playerDoc.aliases) ? playerDoc.aliases : [];
  const aliases = aliasesArr.map((a) => toTitleCase(a));

  const strings = [id, name, fullName, shortName, ...aliases].filter(Boolean);
  return Array.from(new Set(strings.map((s) => s.toLowerCase())));
}

function resolvePlayerIdFromString(allPlayers, raw) {
  const needle = toTitleCase(raw).toLowerCase();
  if (!needle) return null;

  const direct = allPlayers.find((p) => String(p.id).toLowerCase() === needle);
  if (direct) return direct.id;

  for (const p of allPlayers) {
    const candidates = buildIdentityStrings(p);
    if (candidates.includes(needle)) return p.id;
  }
  return null;
}

function parseChoiceToPlayerId(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const parts = v.split("|").map((x) => x.trim());
  if (parts.length >= 2 && parts[0]) return parts[0];
  return v;
}

function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return `rgba(34, 197, 94, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function themeFromAccent(accent, colorName, text = "#E5E7EB") {
  return {
    accent,
    accentSoft: hexToRgba(accent, 0.18),
    glow: hexToRgba(accent, 0.24),
    text,
    colorName,
  };
}

function todayChallengeDateText() {
  const d = new Date();
  return d.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function parseChallengeDateLoose(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const numeric = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (numeric) {
    const [, d, m, y] = numeric;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function getInitialsFromName(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "FC";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();

  return parts
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function TeamShirtIcon({ color = "#22C55E", size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M9 4 12 6 15 4l4 2 2 5-3 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7l-3-2 2-5 4-2Z"
        fill={color}
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GeneratedOpponentCrest({ name = "Opponent", theme = {} }) {
  const accent = theme.accent || "#D97706";
  const initials = getInitialsFromName(name);

  return (
    <div
      style={{
        width: "82px",
        height: "82px",
        borderRadius: "24px",
        margin: "0 auto",
        background: `radial-gradient(circle at top, ${hexToRgba(accent, 0.42)}, rgba(15,23,42,0.94) 62%)`,
        border: `2px solid ${hexToRgba(accent, 0.9)}`,
        boxShadow: `0 14px 30px ${hexToRgba(accent, 0.2)}`,
        display: "grid",
        placeItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "9px",
          borderRadius: "20px",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      />
      <div style={{ textAlign: "center", lineHeight: 1 }}>
        <div
          style={{
            fontSize: "1.35rem",
            fontWeight: 950,
            color: "#FDE68A",
            letterSpacing: "0.04em",
          }}
        >
          {initials}
        </div>

      </div>
    </div>
  );
}

function getThemeFromColorName(rawColorName = "") {
  const key = String(rawColorName || "").trim().toLowerCase();
  if (!key) return null;

  if (
    key.includes("red") ||
    key.includes("maroon") ||
    key.includes("crimson") ||
    key.includes("burgundy")
  ) {
    return themeFromAccent("#DC2626", "Red");
  }

  if (key.includes("white") || key.includes("cream") || key.includes("ivory")) {
    return themeFromAccent("#F8FAFC", "White", "#F8FAFC");
  }

  if (key.includes("black") || key.includes("dark") || key.includes("charcoal")) {
    return themeFromAccent("#0F172A", "Black", "#CBD5E1");
  }

  if (key.includes("blue")) {
    return themeFromAccent("#38BDF8", "Blue", "#E0F2FE");
  }

  if (key.includes("navy")) {
    return themeFromAccent("#1E3A8A", "Navy", "#BFDBFE");
  }

  if (key.includes("sky") || key.includes("cyan") || key.includes("teal")) {
    return themeFromAccent("#06B6D4", "Sky Blue");
  }

  if (key.includes("green") || key.includes("lime")) {
    return themeFromAccent("#22C55E", "Green", "#BBF7D0");
  }

  if (key.includes("yellow") || key.includes("gold") || key.includes("amber")) {
    return themeFromAccent("#D97706", "Gold", "#FDE68A");
  }

  if (key.includes("orange")) {
    return themeFromAccent("#EA580C", "Orange", "#FED7AA");
  }

  if (key.includes("purple") || key.includes("violet")) {
    return themeFromAccent("#7C3AED", "Purple", "#DDD6FE");
  }

  if (key.includes("pink") || key.includes("magenta")) {
    return themeFromAccent("#DB2777", "Pink", "#FBCFE8");
  }

  if (
    key.includes("slate") ||
    key.includes("grey") ||
    key.includes("gray") ||
    key.includes("silver")
  ) {
    return themeFromAccent("#64748B", "Slate", "#CBD5E1");
  }

  return null;
}

function getTeamTheme(team = {}) {
  const explicitHex = normalizeHexColor(
    team.teamColorHex || team.colorHex || team.teamColor || ""
  );
  const explicitName = toTitleCase(team.teamColorName || team.colorName || "");

  // UI default: keep the premium green/gold look for normal Black vs White games.
  // Wear colour remains Black/White on the teamsheet.
  if (team.id === TURF_KINGS_SLOT_ID && (!explicitName || explicitName === "Black")) {
    return themeFromAccent("#0F172A", "Black", "#CBD5E1");
  }

  if (team.id === GUEST_OPPONENT_SLOT_ID && (!explicitName || explicitName === "White")) {
    return themeFromAccent("#F8FAFC", "White", "#0F172A");
  }

  const nameTheme = getThemeFromColorName(explicitName);
  if (nameTheme) {
    return {
      ...nameTheme,
      colorName: explicitName || nameTheme.colorName,
    };
  }

  if (isValidHexColor(explicitHex)) {
    return {
      accent: explicitHex,
      accentSoft: hexToRgba(explicitHex, 0.18),
      glow: hexToRgba(explicitHex, 0.24),
      text: "#E5E7EB",
      colorName: explicitName || "Team Color",
    };
  }

  const key = String(team.label || "").trim().toLowerCase();

  if (key === "dark") {
    return themeFromAccent("#0F172A", "Black", "#CBD5E1");
  }

  if (key === "light") {
    return themeFromAccent("#F8FAFC", "White", "#F8FAFC");
  }

  return themeFromAccent("#22C55E", "Green", "#BBF7D0");
}

function normalizeIncomingTeams(teams = []) {
  return (teams || []).map((t) => ({
    ...t,
    label: t.label || "",
    abbrev: normalizeAbbrev(t.abbrev || ""),
    teamColorHex: normalizeHexColor(t.teamColorHex || t.colorHex || ""),
    teamColorName: toTitleCase(t.teamColorName || t.colorName || ""),
    teamIdentity: t.teamIdentity || null,
    players: [...(t.players || [])],
    captainId: t.captainId || null,
    captain: t.captain || "",
  }));
}

function buildDefaultFiveVFiveTeams() {
  return normalizeIncomingTeams([
    {
      id: "dark",
      label: "Dark",
      abbrev: "DARK",
      teamColorName: "Black",
      teamColorHex: "#0F172A",
      players: [],
      captainId: null,
      captain: "",
    },
    {
      id: "light",
      label: "Light",
      abbrev: "LIGT",
      teamColorName: "White",
      teamColorHex: "#F8FAFC",
      players: [],
      captainId: null,
      captain: "",
    },
  ]);
}

function buildGuestOpponentTeam({
  name = DEFAULT_GUEST_OPPONENT_NAME,
  players = [],
  teamColorName = "Gold",
  disabledFriendlyTeamId = "light",
  disabledFriendlyTeamSnapshot = null,
} = {}) {
  const label = toTitleCase(name) || DEFAULT_GUEST_OPPONENT_NAME;

  return {
    id: GUEST_OPPONENT_ID,
    label,
    abbrev: normalizeAbbrev(label) || "GST",
    teamColorName: toTitleCase(teamColorName || "Gold"),
    teamColorHex: getThemeFromColorName(teamColorName || "Gold")?.accent || "#D97706",
    players: Array.from(
      new Set(
        (players || [])
          .map((p) =>
            toTitleCase(typeof p === "string" ? p : p?.name || p?.displayName || "")
          )
          .filter(Boolean)
      )
    ),
    captainId: null,
    captain: "",
    isGuestOpponent: true,
    temporaryGuestOpponent: true,
    disabledFriendlyTeamId,
    disabledFriendlyTeamSnapshot,
  };
}

function buildTurfKingsChallengeTeam({ players = [], teamColorName = "Green" } = {}) {
  return {
    id: TURF_KINGS_CHALLENGE_ID,
    label: toTitleCase(activeClubName) || "Turf Kings",
    abbrev: normalizeAbbrev(activeClubName) || "TKG",
    teamColorName: toTitleCase(teamColorName || "Green"),
    teamColorHex: getThemeFromColorName(teamColorName || "Green")?.accent || "#22C55E",
    players: Array.from(new Set((players || []).filter(Boolean))),
    captainId: null,
    captain: "",
    isTurfKingsChallengeTeam: true,
    temporaryChallengeTeam: true,
  };
}

function isTurfKingsChallengeTeam(team) {
  return Boolean(team?.isTurfKingsChallengeTeam || team?.id === TURF_KINGS_CHALLENGE_ID);
}

function isCurrentGuestOpponentTeam(team) {
  return Boolean(team?.isGuestOpponent || team?.id === GUEST_OPPONENT_ID);
}

function ensureTwoBaseFriendlyTeams(inputTeams = [], guestTeam = null) {
  const defaults = buildDefaultFiveVFiveTeams();
  const fromGuestSnapshot = guestTeam?.disabledFriendlyTeamSnapshot
    ? [guestTeam.disabledFriendlyTeamSnapshot]
    : [];

  const candidates = normalizeIncomingTeams([
    ...(inputTeams || []),
    ...fromGuestSnapshot,
  ]).filter((team) => !isCurrentGuestOpponentTeam(team));

  const byId = new Map(candidates.map((team) => [team.id, team]));

  const mergedDefaults = defaults.map((team) => byId.get(team.id) || team);
  const extras = candidates.filter(
    (team) => !mergedDefaults.some((base) => base.id === team.id)
  );

  return [...mergedDefaults, ...extras].slice(0, 2);
}


function isGuestChallengeSlotMode(teams = []) {
  const safeTeams = Array.isArray(teams) ? teams : [];
  const turf = safeTeams.find((team) => team?.id === TURF_KINGS_SLOT_ID);
  const guest = safeTeams.find((team) => team?.id === GUEST_OPPONENT_SLOT_ID);

  return Boolean(
    turf?.guestChallengeActive === true &&
      guest?.guestChallengeActive === true &&
      guest?.isGuestOpponent === true
  );
}

function buildSlotBasedChallengeTeams({
  baseTeams = [],
  turfKingsPlayers = [],
  guestPlayers = [],
  activeClubName = "Turf Kings",
  guestName = DEFAULT_GUEST_OPPONENT_NAME,
  turfKingsColorName = "Green",
  guestColorName = "Gold",
  challengeDate = "",
  challengeKickoff = "18:30",
  challengeVenue = "Venue to be confirmed",
} = {}) {
  const defaults = buildDefaultFiveVFiveTeams();
  const normalizedBase = normalizeIncomingTeams(baseTeams);
  const darkBase = normalizedBase.find((team) => team.id === TURF_KINGS_SLOT_ID) || defaults[0];
  const lightBase = normalizedBase.find((team) => team.id === GUEST_OPPONENT_SLOT_ID) || defaults[1];

  const cleanGuestName = toTitleCase(guestName) || DEFAULT_GUEST_OPPONENT_NAME;
  const cleanTurfColor = toTitleCase(turfKingsColorName || "Green");
  const cleanGuestColor = toTitleCase(guestColorName || "Gold");

  const turfTheme = getThemeFromColorName(cleanTurfColor);
  const guestTheme = getThemeFromColorName(cleanGuestColor);

  const turfTeam = {
    ...darkBase,
    id: TURF_KINGS_SLOT_ID,
    originalFriendlySlotId: TURF_KINGS_SLOT_ID,
    label: "Turf Kings",
    abbrev: "TKG",
    teamColorName: cleanTurfColor,
    teamColorHex: turfTheme?.accent || darkBase.teamColorHex || "#22C55E",
    players: Array.from(new Set((turfKingsPlayers || []).filter(Boolean))),
    captainId: darkBase.captainId || null,
    captain: darkBase.captain || "",
    guestChallengeActive: true,
    isTurfKingsChallengeTeam: true,
    challengeRole: "home",
    challengeDate,
    challengeKickoff,
    challengeVenue,
  };

  const guestTeam = {
    ...lightBase,
    id: GUEST_OPPONENT_SLOT_ID,
    originalFriendlySlotId: GUEST_OPPONENT_SLOT_ID,
    label: cleanGuestName,
    abbrev: normalizeAbbrev(cleanGuestName) || "GST",
    teamColorName: cleanGuestColor,
    teamColorHex: guestTheme?.accent || lightBase.teamColorHex || "#D97706",
    players: Array.from(
      new Set(
        (guestPlayers || [])
          .map((p) => toTitleCase(typeof p === "string" ? p : p?.name || p?.displayName || ""))
          .filter(Boolean)
      )
    ),
    captainId: null,
    captain: "",
    guestChallengeActive: true,
    isGuestOpponent: true,
    temporaryGuestOpponent: true,
    challengeRole: "guest",
    challengeDate,
    challengeKickoff,
    challengeVenue,
  };

  return [turfTeam, guestTeam];
}

function stripNormalFriendlyFlags(team = {}) {
  const {
    guestChallengeActive,
    isGuestOpponent,
    temporaryGuestOpponent,
    temporaryChallengeTeam,
    isTurfKingsChallengeTeam,
    challengeRole,
    originalFriendlySlotId,
    challengeDate,
    challengeKickoff,
    challengeVenue,
    disabledFriendlyTeamId,
    disabledFriendlyTeamSnapshot,
    ...safe
  } = team || {};

  return safe;
}

function restoreNormalFriendlyTeamsFromSlots(teams = []) {
  const defaults = buildDefaultFiveVFiveTeams();
  const normalized = normalizeIncomingTeams(teams);

  const dark = stripNormalFriendlyFlags(
    normalized.find((team) => team.id === TURF_KINGS_SLOT_ID) || {}
  );

  const light = stripNormalFriendlyFlags(
    normalized.find((team) => team.id === GUEST_OPPONENT_SLOT_ID) || {}
  );

  return [
    {
      ...defaults[0],
      ...dark,
      id: TURF_KINGS_SLOT_ID,
      label: "Dark",
      abbrev: "DARK",
      teamColorName: dark.teamColorName || defaults[0].teamColorName || "Black",
      teamColorHex:
        getThemeFromColorName(dark.teamColorName || "Black")?.accent ||
        dark.teamColorHex ||
        defaults[0].teamColorHex,
      players: Array.isArray(dark.players) ? dark.players : [],
      captainId: dark.captainId || null,
      captain: dark.captain || "",
    },
    {
      ...defaults[1],
      ...light,
      id: GUEST_OPPONENT_SLOT_ID,
      label: "Light",
      abbrev: "LIGT",
      teamColorName: light.teamColorName || defaults[1].teamColorName || "White",
      teamColorHex:
        getThemeFromColorName(light.teamColorName || "White")?.accent ||
        light.teamColorHex ||
        defaults[1].teamColorHex,
      players: Array.isArray(light.players) ? light.players : [],
      captainId: light.captainId || null,
      captain: light.captain || "",
    },
  ];
}


/* ---------------- Component ---------------- */

export function SquadsPage({
  onSquadPreviewEditingChange,
  teams = [],
  fiveVFiveTeams = [],
  onUpdateTeams,
  onUpdateFiveVFiveTeams,
  onBack,
  identity = null,
  activeRole = "",
  isAdmin: isAdminProp = false,
  matchType = MATCH_MODE.FRIENDLY,
  gameFormat = GAME_FORMAT.FIVE_V_FIVE,
  activeClubId = "turf-kings",
  dataScope = null,
  activeClub = null,
  isPracticeMode = false,
  activeSeasonId = null,
  seasonNo = null,
  matchDayHistory = [],
}) {
  const resolvedActiveClubIdentity = useMemo(
    () =>
      buildClubIdentity({
        id: activeClub?.id || activeClub?.clubId || activeClubId,
        ...(activeClub || {}),
      }),
    [activeClub, activeClubId]
  );

  const activeClubName = String(
    resolvedActiveClubIdentity.shortName ||
      resolvedActiveClubIdentity.name ||
      "This club"
  ).trim();

  const activeClubLogo = resolvedActiveClubIdentity.logoUrl;

  const effectiveRole = String(
    activeRole || identity?.actingRole || identity?.role || ""
  )
    .trim()
    .toLowerCase();

  const isAdmin = effectiveRole
    ? effectiveRole === "admin"
    : Boolean(isAdminProp) || isAdminIdentity(identity);


  const isCaptain =
    effectiveRole === "captain";

  const resolvedMatchType = normalizeMatchMode(
    matchType || gameFormat,
    MATCH_MODE.FRIENDLY
  );
  const resolvedGameFormat = normalizeGameFormat(
    gameFormat,
    GAME_FORMAT.FIVE_V_FIVE
  );
  const formatConfig = getGameFormatConfig(resolvedGameFormat);
  const playersPerSide = Number(formatConfig?.playersPerSide || 5);
  const gameFormatLabel = formatConfig?.label || "5 v 5";
  const isFriendly = resolvedMatchType === MATCH_MODE.FRIENDLY;
  const isLeague = resolvedMatchType === MATCH_MODE.LEAGUE;
  const matchTypeLabel = isLeague ? "League" : "Friendly";

  // Legacy naming kept locally to avoid disturbing the rest of this file.
  // It now means: use the Friendly squads section.
  const isFiveVFive = isFriendly;

  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [localLeagueTeams, setLocalLeagueTeams] = useState(() =>
    normalizeIncomingTeams(teams)
  );
  const [localFiveVFiveTeams, setLocalFiveVFiveTeams] = useState(() => {
    const normalized = normalizeIncomingTeams(fiveVFiveTeams);

    if (isPracticeMode && normalized.length >= 2) {
      return normalized;
    }

    return normalized.length === 2 ? normalized : buildDefaultFiveVFiveTeams();
  });

  const [allPlayers, setAllPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");
  const [pendingNames, setPendingNames] = useState({});
  const [addErrors, setAddErrors] = useState({});
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSquadPreview, setShowSquadPreview] = useState(() => Boolean(isAdmin));
  const [previewPickTarget, setPreviewPickTarget] = useState(null);
  const [teamIdentityTarget, setTeamIdentityTarget] = useState(null);

  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");

  const [captainEditLocked, setCaptainEditLocked] = useState(true);
  const [showCaptainLockHelp, setShowCaptainLockHelp] = useState(false);

  const [lastSquadEditor, setLastSquadEditor] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("tk_last_squad_editor") || "null");
    } catch {
      return null;
    }
  });

  const canEdit = isAdmin || (isCaptain && !captainEditLocked);
  const [showUnseededPlayers, setShowUnseededPlayers] = useState(false);
  const [pendingDeletePlayerId, setPendingDeletePlayerId] = useState("");
  const [deletePlayerError, setDeletePlayerError] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [acceptedChallengeCandidates, setAcceptedChallengeCandidates] = useState([]);
  const [acceptedChallengesError, setAcceptedChallengesError] = useState("");
  const [signupRecords, setSignupRecords] = useState([]);

  const [activeChallengeFixture, setActiveChallengeFixture] = useState(null);
  const [challengeChangeModalOpen, setChallengeChangeModalOpen] = useState(false);
  const [challengeChangeDraft, setChallengeChangeDraft] = useState({
    proposedDate: "",
    proposedKickoff: "",
    venue: "",
    format: "5v5",
    reason: "",
  });

  const existingGuestTeam = useMemo(
    () =>
      (fiveVFiveTeams || []).find(
        (team) => team?.id === GUEST_OPPONENT_SLOT_ID && team?.guestChallengeActive === true
      ) || null,
    [fiveVFiveTeams]
  );

  const existingTurfKingsChallengeTeam = useMemo(
    () =>
      (fiveVFiveTeams || []).find(
        (team) => team?.id === TURF_KINGS_SLOT_ID && team?.guestChallengeActive === true
      ) || null,
    [fiveVFiveTeams]
  );

  const [guestOpponentEnabled, setGuestOpponentEnabled] = useState(false);
  const [guestOpponentName, setGuestOpponentName] = useState(() =>
    existingGuestTeam?.label || DEFAULT_GUEST_OPPONENT_NAME
  );

  const resolvedHomeClubName =
    activeChallengeFixture?.homeClubName ||
    activeClubName ||
    "Home Club";

  const resolvedAwayClubName =
    activeChallengeFixture?.awayClubName ||
    guestOpponentName ||
    "Opponent";

  const resolvedHomeClubLogo =
    activeChallengeFixture?.homeClubLogo || "";

  const resolvedAwayClubLogo =
    activeChallengeFixture?.awayClubLogo || "";
  const [disabledFriendlyTeamId, setDisabledFriendlyTeamId] = useState(() =>
    existingGuestTeam?.disabledFriendlyTeamId || "light"
  );
  const [guestOpponentPlayers, setGuestOpponentPlayers] = useState(() =>
    Array.isArray(existingGuestTeam?.players) ? existingGuestTeam.players : []
  );
  const [guestOpponentColorName, setGuestOpponentColorName] = useState(() =>
    existingGuestTeam?.teamColorName || "Gold"
  );
  const [turfKingsChallengeColorName, setTurfKingsChallengeColorName] = useState(() =>
    existingTurfKingsChallengeTeam?.teamColorName || "Green"
  );
  const [challengeDate, setChallengeDate] = useState(() =>
    existingGuestTeam?.challengeDate || todayChallengeDateText()
  );
  const [challengeKickoff, setChallengeKickoff] = useState(() =>
    existingGuestTeam?.challengeKickoff || "18:30"
  );
  const [challengeVenue, setChallengeVenue] = useState(() =>
    existingGuestTeam?.challengeVenue || "Venue to be confirmed"
  );
  const [turfKingsChallengePlayers, setTurfKingsChallengePlayers] = useState(() =>
    Array.isArray(existingTurfKingsChallengeTeam?.players)
      ? existingTurfKingsChallengeTeam.players
      : []
  );

  const [savingCardId, setSavingCardId] = useState("");
  const [showFixtureChangeValidation, setShowFixtureChangeValidation] = useState(false);
  const [showFixtureChangeSuccess, setShowFixtureChangeSuccess] = useState(false);
  const [premiumAlert, setPremiumAlert] = useState(null);
  const [cancelChallengeModalOpen, setCancelChallengeModalOpen] = useState(false);
  const [cancelChallengeReason, setCancelChallengeReason] = useState("");

  const showPremiumAlert = ({ title = "Notice", message = "", icon = "ℹ️" }) => {
    setPremiumAlert({ title, message, icon });
  };
  const cardRefs = useRef({});
  const challengeAdvertRef = useRef(null);
  const teamsheetCardRef = useRef(null);
  const longPressTimersRef = useRef({});
  const leagueIdentityConfirmRef = useRef({});

  useEffect(() => {
    const handleScroll = () => setHeaderScrolled(window.scrollY > 6);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Practice v2 keeps this administrative control session-local.
    // Do not bind Practice to the real club's operational setting.
    if (isPracticeMode) return undefined;
    if (!activeClubId) return undefined;

    const ref = doc(db, "clubs", activeClubId, "settings", "squadControls");

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() || {} : {};
        setCaptainEditLocked(data.captainEditLocked !== false);
      },
      (err) => {
        console.error("[Squads] Failed to read squad controls:", err);
      }
    );

    return () => unsub();
  }, [activeClubId, isPracticeMode]);

  const handleToggleCaptainEditLock = async () => {
    if (!isAdmin || !activeClubId) return;

    const nextLocked = !captainEditLocked;

    setCaptainEditLocked(nextLocked);

    // Practice may exercise the control in-memory, but must never mutate
    // the real club's settings/squadControls document.
    if (isPracticeMode) {
      return;
    }

    try {
      await setDoc(
        doc(db, "clubs", activeClubId, "settings", "squadControls"),
        {
          captainEditLocked: nextLocked,
          updatedAt: serverTimestamp(),
          updatedAtMs: Date.now(),
          updatedByName:
            identity?.fullName ||
            identity?.shortName ||
            identity?.displayName ||
            identity?.email ||
            "Admin",
          updatedByRole: "admin",
        },
        { merge: true }
      );
    } catch (err) {
      console.error("[Squads] Failed to update captain lock:", err);
      setCaptainEditLocked(!nextLocked);
      showPremiumAlert({ title: "Could not update control", message: "Captain editing control could not be updated right now.", icon: "⚠️" });
    }
  };


  useEffect(() => {
    if (typeof window === "undefined") return;
    const stateMarker = { tkSquadsPage: true, ts: Date.now() };
    window.history.pushState(stateMarker, "");
    const handlePopState = () => onBack?.();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onBack]);

  useEffect(() => {
    // Practice squads are local-first after save.
    // Avoid immediately overwriting freshly saved local squads
    // with transient subscription refresh state.
    if (isPracticeMode) return;

    setLocalLeagueTeams(normalizeIncomingTeams(teams));
  }, [teams, isPracticeMode]);

  // IMPORTANT:
  // Friendly squad editing is now fully local-first.
  // We intentionally do NOT continuously rehydrate from fiveVFiveTeams props,
  // because that was overwriting freshly edited preview state after save.




  useEffect(() => {
    if (!activeClubId) {
      setActiveChallengeFixture(null);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "fixtures"),
      orderBy("createdAtMs", "desc"),
      limit(5)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const fixtures = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
        .filter((fixture) => {
          const status = String(
            fixture?.fixtureStatus ||
              fixture?.status ||
              fixture?.challengeStatus ||
              ""
          ).trim().toLowerCase();

          const isClosed =
            status.includes("cancel") ||
            status.includes("closed") ||
            status.includes("declined") ||
            status.includes("rejected") ||
            status.includes("complete") ||
            status.includes("completed");

          return fixture?.source === "club_challenge" && !isClosed;
        });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sortedFixtures = fixtures
        .filter((fixture) => fixture?.proposedDate)
        .sort((a, b) => {
          const aTime = new Date(`${a.proposedDate}T12:00:00`).getTime();
          const bTime = new Date(`${b.proposedDate}T12:00:00`).getTime();
          return aTime - bTime;
        });

      const upcomingFixture =
        sortedFixtures.find((fixture) => {
          const fixtureDate = new Date(`${fixture.proposedDate}T12:00:00`);
          return !Number.isNaN(fixtureDate.getTime()) && fixtureDate >= today;
        }) || null;


      let hydratedFixture = upcomingFixture;

      if (hydratedFixture) {
        const pickLogo = (clubData = {}) =>
          clubData.logoUrl ||
          clubData?.branding?.uploadedLogoUrl ||
          clubData?.media?.logoOriginalUrl ||
          clubData?.media?.logoTransparentUrl ||
          clubData.image ||
          "";

        let homeClubLogo = hydratedFixture.homeClubLogo || "";
        let awayClubLogo = hydratedFixture.awayClubLogo || "";

        if (!homeClubLogo && hydratedFixture.homeClubId) {
          const homeSnap = await getDoc(doc(db, "clubs", hydratedFixture.homeClubId));
          if (homeSnap.exists()) homeClubLogo = pickLogo(homeSnap.data() || {});
        }

        if (!awayClubLogo && hydratedFixture.awayClubId) {
          const awaySnap = await getDoc(doc(db, "clubs", hydratedFixture.awayClubId));
          if (awaySnap.exists()) awayClubLogo = pickLogo(awaySnap.data() || {});
        }

        hydratedFixture = {
          ...hydratedFixture,
          homeClubLogo,
          awayClubLogo,
        };
      }

      setActiveChallengeFixture(hydratedFixture);
    });

    return () => unsub();
  }, [activeClubId]);


  useEffect(() => {
    if (!canEdit || !activeClubId) {
      setAcceptedChallengeCandidates([]);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "acceptedChallenges"),
      orderBy("acceptedAtMs", "desc"),
      limit(10)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data() || {};
            return {
              acceptedChallengeDocId: d.id,
              ...data,
            };
          })
          .filter((item) => {
            const status = String(item.fixtureStatus || "").trim().toLowerCase();
            const hasFixture = Boolean(item.fixtureId);

            return (
              status === "awaiting_fixture_creation" ||
              (!hasFixture && status === "accepted")
            );
          });

        setAcceptedChallengeCandidates(list);
        setAcceptedChallengesError("");
      },
      (err) => {
        console.error("[Squads] Could not load accepted challenges:", err);
        setAcceptedChallengesError("Could not load accepted challenges.");
      }
    );

    return () => unsub();
  }, [activeClubId, canEdit]);


  useEffect(() => {
    setPlayersLoading(true);
    setPlayersError("");
    const colRef = getPlayersCollection(db, activeClubId);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setAllPlayers(list);
        setPlayersLoading(false);
      },
      (err) => {
        console.error("[Squads] Error loading players:", err);
        setPlayersError("Could not load players from database.");
        setPlayersLoading(false);
      }
    );
    return () => unsub();
  }, [activeClubId]);

  const playersById = useMemo(() => {
    const m = new Map();
    allPlayers.forEach((p) => m.set(p.id, p));
    return m;
  }, [allPlayers]);

  const displayNameOf = (playerIdOrLegacy) => {
    const p = playersById.get(playerIdOrLegacy);
    if (!p) return toTitleCase(playerIdOrLegacy);
    return bestFullDisplayFromPlayer({ ...p, id: p.id });
  };

  const displayShortOf = (playerIdOrLegacy) => {
    const p = playersById.get(playerIdOrLegacy);
    if (!p) return toTitleCase(playerIdOrLegacy);
    return bestShortDisplayFromPlayer({ ...p, id: p.id });
  };


  useEffect(() => {
    if (!activeClubId) {
      setSignupRecords([]);
      return undefined;
    }

    let pendingDocs = [];
    let paidDocs = [];

    const rebuild = () => {
      const byDoc = new Map();

      const addDocs = (items, source) => {
        items.forEach((item) => {
          const previous = byDoc.get(item.docId) || {};
          byDoc.set(item.docId, {
            ...previous,
            ...(item.data || {}),
            docId: item.docId,
            sourceCollections: Array.from(
              new Set([...(previous.sourceCollections || []), source])
            ),
          });
        });
      };

      addDocs(pendingDocs, "pendingSignups");
      addDocs(paidDocs, "matchSignups");

      setSignupRecords(Array.from(byDoc.values()));
    };

    const pendingCollection = isPracticeMode
      ? getScopedPendingSignupsCollection(db, dataScope)
      : getPendingSignupsCollection(db, activeClubId);

    const paidCollection = isPracticeMode
      ? getScopedMatchSignupsCollection(db, dataScope)
      : getMatchSignupsCollection(db, activeClubId);

    const unsubPending = onSnapshot(
      pendingCollection,
      (snap) => {
        pendingDocs = snap.docs.map((d) => ({
          docId: d.id,
          data: d.data() || {},
        }));
        rebuild();
      },
      (err) => console.error("[Squads] Failed to read pending signups:", err)
    );

    const unsubPaid = onSnapshot(
      paidCollection,
      (snap) => {
        paidDocs = snap.docs.map((d) => ({
          docId: d.id,
          data: d.data() || {},
        }));
        rebuild();
      },
      (err) => console.error("[Squads] Failed to read match signups:", err)
    );

    return () => {
      unsubPending();
      unsubPaid();
    };
  }, [activeClubId, isPracticeMode, dataScope]);

  const nextTeamsheetWeekId = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ids = new Set();

    signupRecords.forEach((record) => {
      [
        ...(Array.isArray(record.selectedWeeks) ? record.selectedWeeks : []),
        ...(Array.isArray(record.paidWeeks) ? record.paidWeeks : []),
        ...(Array.isArray(record.primaryPaidWeeks) ? record.primaryPaidWeeks : []),
      ].forEach((weekId) => {
        const text = String(weekId || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) ids.add(text);
      });
    });

    return (
      Array.from(ids)
        .filter((weekId) => {
          const d = new Date(`${weekId}T12:00:00`);
          return !Number.isNaN(d.getTime()) && d >= today;
        })
        .sort()[0] || ""
    );
  }, [signupRecords]);

  const paidTeamSheetPlayers = useMemo(() => {
    if (!nextTeamsheetWeekId) {
      return [];
    }

    const byId = new Map();

    signupRecords.forEach((record) => {
      const paidWeeks = Array.from(
        new Set([
          ...(Array.isArray(record.paidWeeks) ? record.paidWeeks : []),
          ...(Array.isArray(record.primaryPaidWeeks) ? record.primaryPaidWeeks : []),
        ])
      );

      if (!paidWeeks.includes(nextTeamsheetWeekId)) return;

      const playerId = String(
        record.beneficiaryPlayerId ||
          record.playerId ||
          record.userId ||
          record.docId ||
          ""
      ).trim();

      const playerName = toTitleCase(
        record.beneficiaryName ||
          record.playerName ||
          record.displayName ||
          record.shortName ||
          playerId
      );

      const resolvedId =
        playersById.has(playerId)
          ? playerId
          : resolvePlayerIdFromString(allPlayers, playerName);

      // Never expose orphaned signup document IDs such as
      // General___player___082026 as selectable footballers.
      if (!resolvedId || !playersById.has(resolvedId)) return;

      byId.set(resolvedId, {
        id: resolvedId,
        fullName: playerName || displayNameOf(resolvedId),
        paymentStatus: "paid",
        weekId: nextTeamsheetWeekId,
      });
    });

    return Array.from(byId.values()).sort((a, b) =>
      String(a.fullName || "").localeCompare(String(b.fullName || ""))
    );
  }, [isPracticeMode, signupRecords, nextTeamsheetWeekId, playersById, allPlayers]);


  const activePlayers = useMemo(
    () => allPlayers.filter((p) => (p.status || "active") === "active"),
    [allPlayers]
  );

  const seasonPlayerTeamIdByPlayerId = useMemo(() => {
    if (!isLeague) return new Map();

    const teamLookup = new Map();
    (localLeagueTeams || []).forEach((team) => {
      const id = String(team?.id || "").trim();
      const label = String(team?.label || "").trim().toLowerCase();
      const abbrev = String(team?.abbrev || "").trim().toLowerCase();

      if (id) teamLookup.set(id.toLowerCase(), id);
      if (label) teamLookup.set(label, id);
      if (abbrev) teamLookup.set(abbrev, id);
    });

    const out = new Map();

    (Array.isArray(matchDayHistory) ? matchDayHistory : []).forEach((day) => {
      const entries = Array.isArray(day?.playerAppearances)
        ? day.playerAppearances
        : [];

      entries.forEach((entry) => {
        const rawPlayer =
          entry?.playerId ||
          entry?.id ||
          entry?.player ||
          entry?.playerName ||
          entry?.name ||
          "";

        const playerId = playersById.has(rawPlayer)
          ? rawPlayer
          : resolvePlayerIdFromString(allPlayers, rawPlayer);

        if (!playerId || out.has(playerId)) return;

        const rawTeam =
          entry?.teamId ||
          entry?.team ||
          entry?.teamName ||
          entry?.teamLabel ||
          entry?.side ||
          "";

        const resolvedTeamId =
          teamLookup.get(String(rawTeam || "").trim().toLowerCase()) ||
          String(rawTeam || "").trim();

        if (resolvedTeamId && teamLookup.has(String(resolvedTeamId).toLowerCase())) {
          out.set(playerId, resolvedTeamId);
        }
      });
    });

    return out;
  }, [isLeague, matchDayHistory, localLeagueTeams, playersById, allPlayers]);

  useEffect(() => {
    if (!isLeague) return;
    if (!seasonPlayerTeamIdByPlayerId.size) return;

    setLocalLeagueTeams((prevTeams) => {
      const alreadyAssigned = new Set(
        (prevTeams || []).flatMap((team) =>
          Array.isArray(team?.players) ? team.players : []
        )
      );

      const playersToRestore = Array.from(seasonPlayerTeamIdByPlayerId.entries())
        .filter(([playerId]) => playersById.has(playerId) && !alreadyAssigned.has(playerId));

      if (!playersToRestore.length) return prevTeams;

      return (prevTeams || []).map((team) => {
        const addHere = playersToRestore
          .filter(([, teamId]) => teamId === team.id)
          .map(([playerId]) => playerId);

        if (!addHere.length) return team;

        return {
          ...team,
          players: Array.from(new Set([...(team.players || []), ...addHere])),
        };
      });
    });
  }, [isLeague, seasonPlayerTeamIdByPlayerId, playersById]);


  useEffect(() => {
    if (!allPlayers.length) return;

    const normalizeTeamsAgainstPlayers = (prevTeams) =>
      prevTeams.map((t) => {
        const nextPlayers = (t.players || []).map((entry) => {
          if (playersById.has(entry)) return entry;
          const resolved = resolvePlayerIdFromString(allPlayers, entry);
          return resolved || entry;
        });

        const seen = new Set();
        const deduped = [];
        for (const x of nextPlayers) {
          if (!x) continue;
          if (seen.has(x)) continue;
          seen.add(x);
          deduped.push(x);
        }

        let captainId = t.captainId || null;
        if (!captainId && t.captain) {
          const resolvedCaptain = resolvePlayerIdFromString(allPlayers, t.captain);
          if (resolvedCaptain) captainId = resolvedCaptain;
        }

        return { ...t, players: deduped, captainId };
      });

    setLocalLeagueTeams((prev) => normalizeTeamsAgainstPlayers(prev));
    setLocalFiveVFiveTeams((prev) => normalizeTeamsAgainstPlayers(prev));
  }, [allPlayers, playersById]);

  const baseFriendlyTeams = useMemo(() => {
    const normalized = normalizeIncomingTeams(localFiveVFiveTeams);

    if (isPracticeMode) {
      return normalized;
    }

    return normalized.length === 2 ? normalized : buildDefaultFiveVFiveTeams();
  }, [localFiveVFiveTeams, isPracticeMode]);

  useEffect(() => {
    // Challenge squads are intentionally isolated from normal friendly squads.
    // Future challenge squad setup should use challengeSquadsByFixtureId, not fiveVFiveTeams.
  }, [activeChallengeFixture]);

  const turfKingsChallengeTeam = useMemo(() => {
    const teamsForChallenge = buildSlotBasedChallengeTeams({
      baseTeams: baseFriendlyTeams,
      turfKingsPlayers: turfKingsChallengePlayers,
      guestPlayers: guestOpponentPlayers,
      guestName: resolvedAwayClubName,
      activeClubName,
      turfKingsColorName: turfKingsChallengeColorName,
      guestColorName: guestOpponentColorName,
      challengeDate,
      challengeKickoff,
      challengeVenue,
    });
    return teamsForChallenge[0];
  }, [
    localFiveVFiveTeams,
    turfKingsChallengePlayers,
    guestOpponentPlayers,
    guestOpponentName,
    turfKingsChallengeColorName,
    guestOpponentColorName,
    challengeDate,
    challengeKickoff,
    challengeVenue,
  ]);

  const guestOpponentTeam = useMemo(() => {
    const teamsForChallenge = buildSlotBasedChallengeTeams({
      baseTeams: baseFriendlyTeams,
      turfKingsPlayers: turfKingsChallengePlayers,
      guestPlayers: guestOpponentPlayers,
      guestName: resolvedAwayClubName,
      activeClubName,
      turfKingsColorName: turfKingsChallengeColorName,
      guestColorName: guestOpponentColorName,
      challengeDate,
      challengeKickoff,
      challengeVenue,
    });
    return teamsForChallenge[1];
  }, [
    baseFriendlyTeams,
    turfKingsChallengePlayers,
    guestOpponentPlayers,
    guestOpponentName,
    turfKingsChallengeColorName,
    guestOpponentColorName,
    challengeDate,
    challengeKickoff,
    challengeVenue,
  ]);

  const hasActiveGuestChallenge = false;

  const sourceTeams = useMemo(() => {
    if (hasActiveGuestChallenge) {
      return [turfKingsChallengeTeam, guestOpponentTeam];
    }

    return isFiveVFive ? localFiveVFiveTeams : localLeagueTeams;
  }, [
    isFiveVFive,
    guestOpponentEnabled,
    turfKingsChallengeTeam,
    guestOpponentTeam,
    baseFriendlyTeams,
    localFiveVFiveTeams,
    localLeagueTeams,
  ]);

  useEffect(() => {
    if (!activeClubId) return;

    const cleanupKey =
      `fanm_deleted_player_cleanup_${activeClubId}`;

    let cleanup = null;

    try {
      const raw = window.localStorage.getItem(cleanupKey);
      cleanup = raw ? JSON.parse(raw) : null;
    } catch {
      cleanup = null;
    }

    const deletedPlayerId = String(
      cleanup?.playerId || ""
    ).trim();

    if (!deletedPlayerId) return;

    const scrubTeams = (teams = []) =>
      (Array.isArray(teams) ? teams : []).map((team) => ({
        ...team,
        players: (Array.isArray(team?.players) ? team.players : [])
          .filter(
            (id) =>
              String(id || "").trim() !== deletedPlayerId
          ),
        captainId:
          String(team?.captainId || "").trim() === deletedPlayerId
            ? ""
            : team?.captainId,
      }));

    const cleanedLeagueTeams = scrubTeams(localLeagueTeams);
    const cleanedFiveVFiveTeams = scrubTeams(localFiveVFiveTeams);

    setLocalLeagueTeams(cleanedLeagueTeams);
    setLocalFiveVFiveTeams(cleanedFiveVFiveTeams);

    onUpdateLeagueTeams?.(cleanedLeagueTeams);
    onUpdateFiveVFiveTeams?.(cleanedFiveVFiveTeams);

    setTurfKingsChallengePlayers((current) =>
      (Array.isArray(current) ? current : []).filter(
        (id) => String(id || "").trim() !== deletedPlayerId
      )
    );

    setGuestOpponentPlayers((current) =>
      (Array.isArray(current) ? current : []).filter(
        (id) => String(id || "").trim() !== deletedPlayerId
      )
    );

    setPreviewPickTarget(null);

    try {
      window.localStorage.removeItem(cleanupKey);
    } catch {
      // The repaired squads are already in state.
    }
  }, [activeClubId]);

  const setSourceTeams = (updater) => {
    if (hasActiveGuestChallenge) {
      const current = [turfKingsChallengeTeam, guestOpponentTeam];
      const nextTeams = typeof updater === "function" ? updater(current) : updater;
      const nextTurf = (nextTeams || []).find((team) => team.id === TURF_KINGS_SLOT_ID);
      const nextGuest = (nextTeams || []).find((team) => team.id === GUEST_OPPONENT_SLOT_ID);

      if (nextTurf) {
        setTurfKingsChallengePlayers(Array.isArray(nextTurf.players) ? nextTurf.players : []);
        setTurfKingsChallengeColorName(nextTurf.teamColorName || "Green");
      }

      if (nextGuest) {
        setGuestOpponentName(nextGuest.label || DEFAULT_GUEST_OPPONENT_NAME);
        setGuestOpponentPlayers(Array.isArray(nextGuest.players) ? nextGuest.players : []);
        setGuestOpponentColorName(nextGuest.teamColorName || "Gold");
      }

      return;
    }

    if (isFiveVFive) {
      setLocalFiveVFiveTeams(updater);
    } else {
      setLocalLeagueTeams(updater);
    }
  };

  const assignedIds = useMemo(() => {
    const s = new Set();
    sourceTeams.forEach((t) => {
      (t.players || []).forEach((pid) => {
        if (playersById.has(pid)) s.add(pid);
      });
    });
    return s;
  }, [sourceTeams, playersById]);

  const unseededPlayers = useMemo(
    () => activePlayers.filter((p) => !assignedIds.has(p.id)),
    [activePlayers, assignedIds]
  );

  const availableForTeams = useMemo(
    () =>
      unseededPlayers
        .map((p) => `${p.id} | ${bestFullDisplayFromPlayer({ ...p, id: p.id })}`)
        .sort((a, b) => a.localeCompare(b)),
    [unseededPlayers]
  );

  const availableForUnseeded = useMemo(() => {
    const list = [];
    sourceTeams.forEach((t) => {
      (t.players || []).forEach((pid) => {
        if (!playersById.has(pid)) return;
        list.push(`${pid} | ${(displayShortOf(pid) || '').split(' ')[0]}`);
      });
    });
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [sourceTeams, playersById]);

  const handlePendingChange = (id, value) => {
    if (!canEdit) return;
    setPendingNames((prev) => ({ ...prev, [id]: value }));
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const buildCurrentSlotChallengeTeams = ({
    enabled = guestOpponentEnabled,
    nextTurfKingsPlayers = turfKingsChallengePlayers,
    nextGuestPlayers = guestOpponentPlayers,
    nextGuestName = guestOpponentName,
    nextGuestColorName = guestOpponentColorName,
    nextTurfKingsColorName = turfKingsChallengeColorName,
    nextChallengeDate = challengeDate,
    nextChallengeKickoff = challengeKickoff,
    nextChallengeVenue = challengeVenue,
  } = {}) => {
    if (!enabled) {
      return restoreNormalFriendlyTeamsFromSlots(localFiveVFiveTeams);
    }

    return buildSlotBasedChallengeTeams({
      baseTeams: localFiveVFiveTeams,
      turfKingsPlayers: nextTurfKingsPlayers,
      guestPlayers: nextGuestPlayers,
      guestName: nextGuestName,
      turfKingsColorName: nextTurfKingsColorName,
      guestColorName: nextGuestColorName,
      challengeDate: nextChallengeDate,
      challengeKickoff: nextChallengeKickoff,
      challengeVenue: nextChallengeVenue,
    });
  };

  const persistSlotChallengeState = (options = {}) => {
    if (!canEdit) return;
    const nextTeams = buildCurrentSlotChallengeTeams(options);
    setLocalFiveVFiveTeams(nextTeams);
    onUpdateFiveVFiveTeams?.(nextTeams);
  };


  const getOpponentNameFromAcceptedChallenge = (challenge) => {
    const activeId = String(activeClubId || "").trim().toLowerCase();
    const targetId = String(challenge?.targetClubId || "").trim().toLowerCase();
    const challengerId = String(challenge?.challengerClubId || "").trim().toLowerCase();

    if (activeId && targetId && activeId === targetId) {
      return toTitleCase(challenge?.challengerClubName || "Opponent");
    }

    if (activeId && challengerId && activeId === challengerId) {
      return toTitleCase(challenge?.targetClubName || "Opponent");
    }

    return toTitleCase(challenge?.challengerClubName || challenge?.targetClubName || "Opponent");
  };

  const handleCreateSquadsFixtureFromChallenge = async (challenge) => {
    if (!canEdit || !challenge) return;

    const opponentName = getOpponentNameFromAcceptedChallenge(challenge);
    const nextDate = challenge.proposedDate || todayChallengeDateText();
    const nextKickoff = challenge.proposedKickoff || "18:30";
    const nextVenue = challenge.venue || challenge.proposedVenue || "Venue to be confirmed";

    setGuestOpponentEnabled(true);
    setGuestOpponentName(opponentName);
    setChallengeDate(nextDate);
    setChallengeKickoff(nextKickoff);
    setChallengeVenue(nextVenue);
    setGuestOpponentPlayers([]);
    setTurfKingsChallengePlayers([]);

    const nextTeams = buildSlotBasedChallengeTeams({
      baseTeams: localFiveVFiveTeams,
      turfKingsPlayers: [],
      guestPlayers: [],
      guestName: opponentName,
      activeClubName,
      turfKingsColorName: turfKingsChallengeColorName || "Green",
      guestColorName: guestOpponentColorName || "Gold",
      challengeDate: nextDate,
      challengeKickoff: nextKickoff,
      challengeVenue: nextVenue,
    });

    setLocalFiveVFiveTeams(nextTeams);
    onUpdateFiveVFiveTeams?.(nextTeams);

    const fixtureId =
      challenge.fixtureId ||
      `challenge_${String(challenge.challengeId || challenge.acceptedChallengeDocId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    const participatingClubIds = Array.from(
      new Set(
        [
          challenge.challengerClubId,
          challenge.targetClubId,
          activeClubId,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );

    const fixturePayload = {
      fixtureId,
      source: "club_challenge",
      challengeId: challenge.challengeId || "",
      acceptedChallengeDocId: challenge.acceptedChallengeDocId || "",
      status: "squads_provisional",
      signupStatus: "not_open_yet",

      homeClubId: challenge.challengerClubId || activeClubId,
      homeClubName: challenge.challengerClubName || activeClubName,
      awayClubId: challenge.targetClubId || "",
      awayClubName: challenge.targetClubName || opponentName,

      activeClubId,
      activeClubName,
      opponentName,

      participatingClubIds,
      format: challenge.format || "5v5",
      proposedDate: nextDate,
      proposedKickoff: nextKickoff,
      venue: nextVenue,

      provisionalTeams: nextTeams,
      finalTeamsSource: "pending_paid_signups",

      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    };

    // Practice v2 safety boundary:
    // Club Challenge fixtures are real inter-club operational records.
    // Practice may exercise squad football state, but must never create
    // a real shared challenge fixture or mutate participating clubs.
    if (isPracticeMode) {
      showPremiumAlert({
        title: "Practice simulation",
        message:
          "Club Challenge fixture creation is disabled in Practice. No Official club or challenge record was changed.",
        icon: "🛡️",
      });
      return;
    }

    try {
      const batch = writeBatch(db);

      batch.set(doc(db, "clubChallengeFixtures", fixtureId), fixturePayload, { merge: true });

      participatingClubIds.forEach((clubId) => {
        batch.set(
          doc(db, "clubs", clubId, "fixtures", fixtureId),
          fixturePayload,
          { merge: true }
        );
      });

      batch.update(
        doc(db, "clubs", activeClubId, "acceptedChallenges", challenge.acceptedChallengeDocId),
        {
          fixtureId,
          fixtureStatus: "created_on_squads_page",
          squadFixtureCreatedAt: serverTimestamp(),
          squadFixtureCreatedAtMs: Date.now(),
        }
      );

      await batch.commit();
    } catch (err) {
      console.error("[Squads] Could not create shared challenge fixture:", err);
      showPremiumAlert({ title: "Fixture not fully saved", message: "The fixture appeared on screen, but could not be saved to the database.", icon: "⚠️" });
    }
  };


  const handleTurnChallengeOn = () => {
    if (!canEdit) return;

    const nextTeams = buildCurrentSlotChallengeTeams({ enabled: true });
    setGuestOpponentEnabled(true);
    setLocalFiveVFiveTeams(nextTeams);
    onUpdateFiveVFiveTeams?.(nextTeams);
  };

  const handleTakeChallengeDown = () => {
    if (!canEdit) return;

    setGuestOpponentEnabled(false);
    const normalTeams = restoreNormalFriendlyTeamsFromSlots(localFiveVFiveTeams);
    setLocalFiveVFiveTeams(normalTeams);
    onUpdateFiveVFiveTeams?.(normalTeams);
  };

  const openChallengeChangeModal = () => {
    if (!canEdit || !activeChallengeFixture?.fixtureId) return;

    setChallengeChangeDraft({
      proposedDate: activeChallengeFixture.proposedDate || "",
      proposedKickoff: activeChallengeFixture.proposedKickoff || "",
      venue: activeChallengeFixture.venue || "",
      format: activeChallengeFixture.format || "5v5",
      reason: "",
    });

    setChallengeChangeModalOpen(true);
  };

  const handleSubmitChallengeChangeRequest = async () => {
    if (!canEdit || !activeChallengeFixture?.fixtureId) return;

    // Practice v2 safety boundary:
    // a challenge change request mutates real shared fixture records and
    // can create a real notice for another club.
    if (isPracticeMode) {
      showPremiumAlert({
        title: "Practice simulation",
        message:
          "Club Challenge change requests are disabled in Practice. No Official fixture or club notice was changed.",
        icon: "🛡️",
      });
      return;
    }

    const nextDate = String(challengeChangeDraft.proposedDate || "").trim();
    const nextKickoff = String(challengeChangeDraft.proposedKickoff || "").trim();
    const nextVenue = String(challengeChangeDraft.venue || "").trim();
    const nextFormat = String(challengeChangeDraft.format || "5v5").trim();
    const cleanReason = String(challengeChangeDraft.reason || "").trim();

    if (!nextDate || !nextKickoff || !nextVenue || !nextFormat) {
      showPremiumAlert({ title: "Fixture details needed", message: "Please complete the date, kickoff time, venue and game format before sending the update.", icon: "📝" });
      return;
    }

    if (!cleanReason) {
      setShowFixtureChangeValidation(true);
      return;
    }

    try {
      const fixtureId = activeChallengeFixture.fixtureId;
      const participatingClubIds = Array.from(
        new Set(
          [
            activeChallengeFixture.homeClubId,
            activeChallengeFixture.awayClubId,
            activeClubId,
            ...(activeChallengeFixture.participatingClubIds || []),
          ].map((value) => String(value || "").trim()).filter(Boolean)
        )
      );

      const opponentClubId = participatingClubIds.find(
        (clubId) => String(clubId) !== String(activeClubId)
      );

      const noticeId = `change_request_${fixtureId}_${Date.now()}`;

      const fixturePatch = {
        status: "change_requested",
        proposedDate: nextDate,
        proposedKickoff: nextKickoff,
        venue: nextVenue,
        format: nextFormat,
        changeRequestedByClubId: activeClubId,
        changeRequestedByClubName: activeClubName,
        changeReason: cleanReason,
        changeNoticeId: noticeId,
        changeRequestedAt: serverTimestamp(),
        changeRequestedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      };

      const noticePayload = {
        noticeId,
        type: "challenge_change_requested",
        fixtureId,
        challengeId: activeChallengeFixture.challengeId || "",
        fromClubId: activeClubId,
        fromClubName: activeClubName,
        toClubId: opponentClubId || "",
        homeClubId: activeChallengeFixture.homeClubId || "",
        homeClubName: resolvedHomeClubName,
        awayClubId: activeChallengeFixture.awayClubId || "",
        awayClubName: resolvedAwayClubName,
        proposedDate: nextDate,
        proposedKickoff: nextKickoff,
        venue: nextVenue,
        format: nextFormat,
        reason: cleanReason,
        status: "open",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      };

      const batch = writeBatch(db);

      batch.set(doc(db, "clubChallengeFixtures", fixtureId), fixturePatch, { merge: true });

      participatingClubIds.forEach((clubId) => {
        batch.set(doc(db, "clubs", clubId, "fixtures", fixtureId), fixturePatch, { merge: true });
      });

      if (opponentClubId) {
        batch.set(
          doc(db, "clubs", opponentClubId, "challengeNotices", noticeId),
          noticePayload,
          { merge: true }
        );
      }

      await batch.commit();

      setActiveChallengeFixture((current) =>
        current ? { ...current, ...fixturePatch } : current
      );

      setShowFixtureChangeSuccess(true);
    } catch (err) {
      console.error("[Squads] Could not request fixture change:", err);
      showPremiumAlert({ title: "Update request failed", message: "Could not send this fixture update request right now.", icon: "⚠️" });
    }
  };

  const handleCancelChallenge = async () => {
    if (!canEdit || !activeChallengeFixture?.fixtureId) return;

    // Practice v2 safety boundary:
    // cancellation deletes real shared fixture records and creates real
    // cancellation notices for participating clubs.
    if (isPracticeMode) {
      showPremiumAlert({
        title: "Practice simulation",
        message:
          "Club Challenge cancellation is disabled in Practice. No Official fixture or club notice was changed.",
        icon: "🛡️",
      });
      return;
    }

    const reason = String(cancelChallengeReason || "").trim();

    if (!reason) {
      showPremiumAlert({
        title: "Reason required",
        message: "Please give the other club a short reason before requesting cancellation.",
        icon: "📝",
      });
      return;
    }

    try {
      const fixtureId = activeChallengeFixture.fixtureId;
      const participatingClubIds = Array.from(
        new Set(
          [
            activeChallengeFixture.homeClubId,
            activeChallengeFixture.awayClubId,
            activeClubId,
            ...(activeChallengeFixture.participatingClubIds || []),
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      const noticeId = `cancelled_${fixtureId}_${Date.now()}`;

      const noticePayload = {
        noticeId,
        type: "challenge_cancelled",
        fixtureId,
        challengeId: activeChallengeFixture.challengeId || "",
        fromClubId: activeClubId,
        fromClubName: activeClubName,
        homeClubId: activeChallengeFixture.homeClubId || "",
        homeClubName: resolvedHomeClubName,
        awayClubId: activeChallengeFixture.awayClubId || "",
        awayClubName: resolvedAwayClubName,
        reason: String(reason || "").trim(),
        status: "open",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      };

      const batch = writeBatch(db);

      batch.delete(doc(db, "clubChallengeFixtures", fixtureId));

      participatingClubIds.forEach((clubId) => {
        batch.delete(doc(db, "clubs", clubId, "fixtures", fixtureId));
        batch.set(
          doc(db, "clubs", clubId, "challengeNotices", noticeId),
          noticePayload,
          { merge: true }
        );
      });

      await batch.commit();

      setCancelChallengeModalOpen(false);
      setCancelChallengeReason("");
      setActiveChallengeFixture(null);
      setGuestOpponentEnabled(false);

      const normalTeams = restoreNormalFriendlyTeamsFromSlots(localFiveVFiveTeams);
      setLocalFiveVFiveTeams(normalTeams);
      onUpdateFiveVFiveTeams?.(normalTeams);
    } catch (err) {
      console.error("[Squads] Could not cancel challenge:", err);
      showPremiumAlert({ title: "Cancellation failed", message: "Could not cancel this club challenge right now.", icon: "⚠️" });
    }
  };

  const confirmLeagueIdentityChange = (teamId, fieldLabel) => {
    if (!isLeague) return true;

    const key = `${teamId}:${fieldLabel}`;
    if (leagueIdentityConfirmRef.current[key]) return true;

    const ok = window.confirm(
      `You are changing the ${fieldLabel} during an active League season. ` +
      `This should normally be set once per season. Continue?`
    );

    if (ok) {
      leagueIdentityConfirmRef.current[key] = true;
    }

    return ok;
  };

  const baseAbbrevFromName = (name) => {
    const cleanName = String(name || "").trim();
    const upper = cleanName.toUpperCase();
    const words = upper.replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

    if (!words.length) return "";

    const compact = words.join("");

    if (/^DARK/.test(compact)) return "DARK";
    if (/^LIGHT/.test(compact)) return "LIGT";

    if (words[0] === "MAN" || words[0] === "MANCHESTER") {
      const second = words[1] || "";
      if (second.startsWith("C")) return "MCI";
      if (second.startsWith("U")) return "MUN";
    }

    if (compact.startsWith("MADRID")) return "MAD";
    if (compact.startsWith("BARCELONA")) return "BAR";
    if (compact.startsWith("AJAX")) return "AJA";

    if (words.length >= 2) {
      const initials = words.map((word) => word[0]).join("");
      if (initials.length >= 3) return initials.slice(0, 4);
    }

    return compact.slice(0, compact.length >= 4 ? 4 : 3);
  };

  const makeUniqueTeamAbbrev = (teamId, nextName, teamsList = sourceTeams) => {
    const preferred = normalizeAbbrev(baseAbbrevFromName(nextName));
    if (!preferred) return "";

    const taken = new Set(
      (teamsList || [])
        .filter((team) => team.id !== teamId)
        .map((team) => normalizeAbbrev(team.abbrev || baseAbbrevFromName(team.label)))
        .filter(Boolean)
    );

    if (!taken.has(preferred)) return preferred;

    const compact = String(nextName || "").toUpperCase().replace(/[^A-Z]/g, "");
    const candidates = [
      compact.slice(0, 4),
      compact.slice(0, 3),
      ...compact.split("").map((_, index) => `${preferred.slice(0, 3)}${compact[index] || ""}`),
    ]
      .map(normalizeAbbrev)
      .filter((value) => value.length >= 3 && value.length <= 4);

    return candidates.find((candidate) => candidate && !taken.has(candidate)) || preferred;
  };

  const applyTeamIdentity = (teamId, identity) => {
    if (!canEdit || !identity) return;
    if (!confirmLeagueIdentityChange(teamId, "team identity")) return;

    setSourceTeams((prev) =>
      prev.map((team) =>
        team.id === teamId
          ? {
              ...team,
              label: identity.name,
              abbrev: identity.abbr,
              teamIdentity: identity,
            }
          : team
      )
    );
  };

  const getTeamIdentityVisual = (team) => {
    const identity = team?.teamIdentity;
    if (!identity) return null;

    if (identity.type === "national") {
      return <span className="squad-team-identity-flag">{identity.flag}</span>;
    }

    return (
      <img
        src={identity.logo32}
        alt=""
        className="squad-team-identity-logo"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  };

  const handleTeamLabelChange = (teamId, value) => {
    if (!canEdit) return;
    if (!confirmLeagueIdentityChange(teamId, "team name")) return;

    setSourceTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;

        return {
          ...t,
          label: value,
          abbrev: makeUniqueTeamAbbrev(teamId, value, prev),
        };
      })
    );
  };

  const handleTeamAbbrevChange = (teamId, value) => {
    if (!canEdit) return;
    const next = normalizeAbbrev(value);
    setSourceTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, abbrev: next } : t))
    );
  };

  const isLockedClubChallengeTeam = (teamId, teamsList = sourceTeams) => {
    if (!activeChallengeFixture) return false;

    const activeId = String(activeClubId || "").trim();
    const homeId = String(activeChallengeFixture?.homeClubId || "").trim();
    const awayId = String(activeChallengeFixture?.awayClubId || "").trim();

    const index = (teamsList || []).findIndex(
      (team) => String(team?.id || "") === String(teamId || "")
    );

    const teamClubId = index === 0 ? homeId : index === 1 ? awayId : "";

    return Boolean(activeId && teamClubId && activeId !== teamClubId);
  };

  const handleTeamColorNameChange = (teamId, value) => {
    if (!canEdit || isLockedClubChallengeTeam(teamId)) return;
    if (!confirmLeagueIdentityChange(teamId, "team colour")) return;

    const cleanValue = toTitleCase(value || "");
    const nextTheme = getThemeFromColorName(cleanValue);
    const nextHex = nextTheme?.accent || "";

    if (hasActiveGuestChallenge && teamId === TURF_KINGS_SLOT_ID) {
      setTurfKingsChallengeColorName(cleanValue);
      persistSlotChallengeState({ nextTurfKingsColorName: cleanValue });
      return;
    }

    if (hasActiveGuestChallenge && teamId === GUEST_OPPONENT_SLOT_ID) {
      setGuestOpponentColorName(cleanValue);
      persistSlotChallengeState({ nextGuestColorName: cleanValue });
      return;
    }

    if (isFiveVFive) {
      setLocalFiveVFiveTeams((prev) =>
        normalizeIncomingTeams(prev).map((team) =>
          team.id === teamId
            ? {
                ...team,
                teamColorName: cleanValue,
                teamColorHex: nextHex,
              }
            : team
        )
      );
      return;
    }

    setLocalLeagueTeams((prev) =>
      normalizeIncomingTeams(prev).map((team) =>
        team.id === teamId
          ? {
              ...team,
              teamColorName: cleanValue,
              teamColorHex: nextHex,
            }
          : team
      )
    );
  };

  const handleCaptainChange = (teamId, captainId) => {
    if (!canEdit || isLockedClubChallengeTeam(teamId)) return;
    if (!confirmLeagueIdentityChange(teamId, "team captain")) return;
    setSourceTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const nextPlayers = [...(t.players || [])];
        if (captainId && playersById.has(captainId) && !nextPlayers.includes(captainId)) {
          nextPlayers.push(captainId);
        }
        return {
          ...t,
          captainId: captainId || null,
          captain: captainId ? displayShortOf(captainId) : t.captain || "",
          players: nextPlayers,
        };
      })
    );
  };

  const handleAddPlayer = async (id) => {
    if (!canEdit) return;
    const raw = pendingNames[id] || "";
    const trimmed = raw.trim();
    if (!trimmed) return;

    const targetTeam = sourceTeams.find((team) => team.id === id);

    if (targetTeam && isCurrentGuestOpponentTeam(targetTeam)) {
      const selectedId = parseChoiceToPlayerId(trimmed);
      const selectedName = playersById.has(selectedId)
        ? displayNameOf(selectedId)
        : toTitleCase(
            trimmed.includes("|")
              ? trimmed.split("|").slice(1).join("|")
              : selectedId
          );

      if (!selectedName) return;

      setGuestOpponentPlayers((prev) => {
        const existing = new Set((prev || []).map((p) => toTitleCase(p).toLowerCase()));
        if (existing.has(selectedName.toLowerCase())) return prev;
        return [...(prev || []), selectedName];
      });

      setPendingNames((prev) => ({ ...prev, [id]: "" }));
      setAddErrors((prev) => ({ ...prev, [id]: "" }));
      return;
    }

    let chosenId = parseChoiceToPlayerId(trimmed);
    if (!playersById.has(chosenId)) {
      const resolved = resolvePlayerIdFromString(allPlayers, chosenId);
      if (resolved) {
        chosenId = resolved;
      } else {
        setAddErrors((prev) => ({
          ...prev,
          [id]: "Select an existing club player. New players must join the club first.",
        }));
        return;
      }
    }

    const teamIndex = sourceTeams.findIndex((t) =>
      (t.players || []).some((pid) => pid === chosenId)
    );
    const inAnyTeam = teamIndex >= 0;

    if (id === UNSEEDED_ID) {
      if (!inAnyTeam) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${displayNameOf(chosenId)} is already unseeded.`,
        }));
        return;
      }

      setSourceTeams((prev) =>
        prev.map((t, idx) => {
          if (idx !== teamIndex) return t;
          const nextPlayers = (t.players || []).filter((pid) => pid !== chosenId);
          const nextCaptainId = t.captainId === chosenId ? null : t.captainId;
          return { ...t, players: nextPlayers, captainId: nextCaptainId };
        })
      );
    } else {
      const targetIndex = sourceTeams.findIndex((t) => t.id === id);
      if (targetIndex === -1) {
        setAddErrors((prev) => ({ ...prev, [id]: "Unknown team." }));
        return;
      }

      const targetTeam = sourceTeams[targetIndex];
      if ((targetTeam.players || []).includes(chosenId)) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${displayNameOf(chosenId)} is already in this team.`,
        }));
        return;
      }

      if (inAnyTeam && teamIndex !== targetIndex) {
        const existingTeam = sourceTeams[teamIndex];
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${displayNameOf(chosenId)} is already in ${existingTeam.label}. Move them to Unseeded first, then assign to this team.`,
        }));
        return;
      }

      setSourceTeams((prev) =>
        prev.map((t, idx) =>
          idx === targetIndex ? { ...t, players: [...(t.players || []), chosenId] } : t
        )
      );
    }

    setPendingNames((prev) => ({ ...prev, [id]: "" }));
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const handleRemovePlayer = async (teamId, playerIdOrLegacy) => {
    if (!canEdit) return;

    const targetTeam = sourceTeams.find((team) => team.id === teamId);
    if (targetTeam && isCurrentGuestOpponentTeam(targetTeam)) {
      setGuestOpponentPlayers((prev) =>
        (prev || []).filter(
          (name) => toTitleCase(name).toLowerCase() !== toTitleCase(playerIdOrLegacy).toLowerCase()
        )
      );
      return;
    }

    if (playersById.has(playerIdOrLegacy)) {
      setSourceTeams((prev) =>
        prev.map((t) => {
          if (t.id !== teamId) return t;
          const nextPlayers = (t.players || []).filter((pid) => pid !== playerIdOrLegacy);
          const nextCaptainId = t.captainId === playerIdOrLegacy ? null : t.captainId;
          return { ...t, players: nextPlayers, captainId: nextCaptainId };
        })
      );
      return;
    }

    setSourceTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const nextPlayers = (t.players || []).filter((pid) => pid !== playerIdOrLegacy);
        return { ...t, players: nextPlayers };
      })
    );
  };

  const currentViewerPlayerIds = useMemo(() => {
    const values = [
      identity?.playerId,
      identity?.memberId,
      identity?.id,
      identity?.uid,
      identity?.shortName,
      identity?.fullName,
      identity?.displayName,
      identity?.name,
      identity?.email,
    ]
      .map((v) => String(v || "").trim().toLowerCase())
      .filter(Boolean);

    const ids = new Set(values);

    allPlayers.forEach((player) => {
      const playerStrings = buildIdentityStrings({ ...player, id: player.id });
      if (playerStrings.some((value) => values.includes(value))) {
        ids.add(String(player.id || "").trim().toLowerCase());
      }
    });

    return ids;
  }, [identity, allPlayers]);

  const handleRequestRemoveUnseeded = (playerId) => {
    if (!canEdit) return;
    if (!playersById.has(playerId)) return;

    if (currentViewerPlayerIds.has(String(playerId || "").trim().toLowerCase())) {
      showPremiumAlert({ title: "Action blocked", message: "You cannot terminate your own club membership from this page.", icon: "🛡️" });
      return;
    }

    setPendingDeletePlayerId(playerId);
    setDeletePlayerError("");
    setDeleteCode("");
  };

  const handleCancelDeletePlayer = () => {
    setPendingDeletePlayerId("");
    setDeletePlayerError("");
    setDeleteCode("");
  };

  const handleConfirmDeletePlayer = async () => {
    if (!canEdit) return;

    // Practice v2 safety boundary:
    // terminating membership is an Official club mutation and must never
    // be performed from a disposable Practice session.
    if (isPracticeMode) {
      setDeletePlayerError(
        "Membership changes are disabled in Practice. No Official player or member record was changed."
      );
      return;
    }
    if (!pendingDeletePlayerId) return;
    if (!playersById.has(pendingDeletePlayerId)) return;

    if (currentViewerPlayerIds.has(String(pendingDeletePlayerId || "").trim().toLowerCase())) {
      setDeletePlayerError("You cannot terminate your own membership from this page.");
      return;
    }

    if (deleteCode.trim() !== MASTER_CODE) {
      setDeletePlayerError("Invalid admin code. Membership was not terminated.");
      return;
    }

    try {
      const batch = writeBatch(db);

      batch.delete(getPlayerDoc(db, pendingDeletePlayerId, activeClubId));
      batch.delete(doc(db, "clubs", activeClubId, "members", pendingDeletePlayerId));

      const membersByPlayerId = await getDocs(
        query(
          collection(db, "clubs", activeClubId, "members"),
          where("playerId", "==", pendingDeletePlayerId)
        )
      );

      membersByPlayerId.forEach((memberDoc) => {
        batch.delete(memberDoc.ref);
      });

      await batch.commit();
      handleCancelDeletePlayer();
    } catch (err) {
      console.error("[Squads] Error terminating membership:", err);
      setDeletePlayerError(
        "Could not terminate this membership. Please try again."
      );
    }
  };


  const handleSaveClick = () => {
    if (!canEdit) return;

    if (captainEditLocked && isCaptain && !isAdmin) {
      setSaveError("Captain editing is currently locked by admin.");
      return;
    }
    setSaveCode("");
    setSaveError("");
    setShowSaveModal(true);
  };

  const handleCancelSave = () => {
    setShowSaveModal(false);
    setSaveCode("");
    setSaveError("");
  };

  const validateTeams = (candidateTeams) => {
    const badAbbrev = candidateTeams.find((t) => t.abbrev && !isValidAbbrev(t.abbrev));
    if (badAbbrev) {
      return `Invalid abbreviation for "${badAbbrev.label || badAbbrev.id}". Use 3 or 4 letters (A–Z).`;
    }

    const badColor = candidateTeams.find((t) => t.teamColorHex && !isValidHexColor(t.teamColorHex));
    if (badColor) {
      return `Invalid team color for "${badColor.label || badColor.id}". Use hex like #DC2626`;
    }

    const abbrevs = candidateTeams.map((t) => t.abbrev).filter(Boolean);
    const dup = abbrevs.find((a, i) => abbrevs.indexOf(a) !== i);
    if (dup) return `Duplicate team abbreviation: ${dup}`;
    return "";
  };


  const handleConfirmSave = async () => {
    if (!canEdit) return;

    const trimmedCode = String(saveCode || "").trim();

    const validAdmin = isAdminCode(trimmedCode, MASTER_CODE);
    const validCaptain = isCaptainCode(trimmedCode);

    if (!validAdmin && !validCaptain) {
      setSaveError("Invalid access code.");
      return;
    }

    if (captainEditLocked && validCaptain && !validAdmin) {
      setSaveError("Captain changes are locked by admin.");
      return;
    }

    const editorName =
      identity?.fullName ||
      identity?.shortName ||
      identity?.displayName ||
      identity?.email ||
      (validAdmin ? "Admin" : "Captain");

    const editorPayload = {
      name: editorName,
      role: validAdmin ? "Admin" : "Captain",
      time: new Date().toISOString(),
    };

    setLastSquadEditor(editorPayload);

    try {
      localStorage.setItem(
        "tk_last_squad_editor",
        JSON.stringify(editorPayload)
      );
    } catch {}

    const cleanOne = (list) =>
      list.map((t) => {
        const label = String(t.label || "").trim();
        const identityAbbrev = normalizeAbbrev(t.teamIdentity?.abbr || "");
        const smartAbbrev = identityAbbrev || makeUniqueTeamAbbrev(t.id, label || t.label, list);
        const abbrev = normalizeAbbrev(smartAbbrev || t.abbrev || "");
        const teamColorName = toTitleCase(t.teamColorName || "");
        const typedHex = normalizeHexColor(t.teamColorHex || "");
        const derivedTheme = getThemeFromColorName(teamColorName);
        const teamColorHex = derivedTheme?.accent || (isValidHexColor(typedHex) ? typedHex : "");
        return { ...t, label, abbrev, teamColorHex, teamColorName };
      });

    // Save from the exact teams currently shown in Squad Shape Preview.
    // This prevents stale hidden/local state from overwriting preview edits.
    const cleanedLeagueTeams = cleanOne(
      isFiveVFive ? localLeagueTeams : sourceTeams
    );

    const cleanedFiveVFiveTeams = cleanOne(
      isFiveVFive ? sourceTeams : localFiveVFiveTeams
    );

    const validationError =
      validateTeams(cleanedLeagueTeams) || validateTeams(cleanedFiveVFiveTeams);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    const newCaptainIds = new Set(
      [...cleanedLeagueTeams, ...cleanedFiveVFiveTeams]
        .map((t) => t.captainId)
        .filter(Boolean)
    );

    const currentCaptainIds = new Set(
      allPlayers.filter((p) => p.roles?.captain === true).map((p) => p.id)
    );

    const toMakeCaptain = [...newCaptainIds].filter((id) => !currentCaptainIds.has(id));
    const toRemoveCaptain = [...currentCaptainIds].filter((id) => !newCaptainIds.has(id));

    // Captain-role persistence changes Official player records.
    // Practice may still change the disposable squad configuration below,
    // but it must never promote/demote real club players.
    if (!isPracticeMode) {
      try {
        const batch = writeBatch(db);
        for (const pid of toMakeCaptain) {
        batch.set(
          getPlayerDoc(db, pid, activeClubId),
          {
            "roles.captain": true,
            "roles.player": true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      for (const pid of toRemoveCaptain) {
        batch.set(
          getPlayerDoc(db, pid, activeClubId),
          {
            "roles.captain": false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

        await batch.commit();
      } catch (err) {
        console.error("[Squads] Error updating captain roles:", err);
        setSaveError("Could not update captain roles in the database.");
        return;
      }
    }

    onUpdateTeams?.(
      cleanedLeagueTeams.map((t) => ({
        ...t,
        captain: t.captainId ? displayShortOf(t.captainId) : t.captain || "",
      }))
    );

    const outgoingFiveVFiveTeams = cleanedFiveVFiveTeams.map((t) => ({
      ...t,
      captain: t.captainId ? displayShortOf(t.captainId) : t.captain || "",
    }));

    setLocalFiveVFiveTeams(outgoingFiveVFiveTeams);

    console.log("[SQUADS SAVE DEBUG] mode", {
      isPracticeMode,
      isFiveVFive,
      resolvedMatchType,
      resolvedGameFormat,
    });
    console.log("[SQUADS SAVE DEBUG] cleanedLeagueTeams", cleanedLeagueTeams);
    console.log("[SQUADS SAVE DEBUG] cleanedFiveVFiveTeams", cleanedFiveVFiveTeams);
    console.log("[SQUADS SAVE DEBUG] outgoingFiveVFiveTeams", outgoingFiveVFiveTeams);
    const outgoingLeagueTeams = cleanedLeagueTeams.map((t) => ({
      ...t,
      captain: t.captainId ? displayShortOf(t.captainId) : t.captain || "",
    }));

    setLocalLeagueTeams(outgoingLeagueTeams);
    setLocalFiveVFiveTeams(outgoingFiveVFiveTeams);

    const activeOutgoingTeams = isFiveVFive
      ? outgoingFiveVFiveTeams
      : outgoingLeagueTeams;

    if (isFiveVFive) {
      onUpdateFiveVFiveTeams?.(outgoingFiveVFiveTeams);
    } else {
      onUpdateTeams?.(outgoingLeagueTeams);
    }

    handleCancelSave();
  };

  const handleSaveCardAsImage = async (cardId, label) => {
    const node = cardRefs.current[cardId];
    if (!node) return;

    try {
      setSavingCardId(cardId);
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#071226",
        imagePlaceholder:
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        skipFonts: true,
      });

      const link = document.createElement("a");
      link.download = `${slugFromName(label || "squad_card")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[Squads] Failed to save squad card image:", err);
      if (typeof window !== "undefined") {
        showPremiumAlert({ title: "Image save failed", message: "Could not save this squad card as an image.", icon: "⚠️" });
      }
    } finally {
      setSavingCardId("");
    }
  };

  const handleSaveChallengeAdvert = async () => {
    const node = challengeAdvertRef.current;
    if (!node) return;

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#071226",
      });

      const link = document.createElement("a");
      link.download = `${slugFromName(`${slugFromName(activeClubName)}_vs_${guestOpponentTeam.label || "opponent"}`)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[Squads] Failed to save challenge advert:", err);
      if (typeof window !== "undefined") {
        showPremiumAlert({ title: "Advert save failed", message: "Could not save the challenge advert image.", icon: "⚠️" });
      }
    }
  };

  const formattedChallengeDate = useMemo(() => {
    const dateObj = parseChallengeDateLoose(
      activeChallengeFixture?.proposedDate || challengeDate
    );
    if (!dateObj || Number.isNaN(dateObj.getTime())) {
      return (
      activeChallengeFixture?.proposedDate ||
      challengeDate ||
      "Match date to be confirmed"
    );
    }

    return dateObj.toLocaleDateString("en-ZA", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [challengeDate]);

  const startLongPressSave = (cardId, label) => {
    clearLongPress(cardId);
    longPressTimersRef.current[cardId] = window.setTimeout(() => {
      handleSaveCardAsImage(cardId, label);
    }, LONG_PRESS_MS);
  };

  const clearLongPress = (cardId) => {
    const timer = longPressTimersRef.current[cardId];
    if (timer) {
      window.clearTimeout(timer);
      delete longPressTimersRef.current[cardId];
    }
  };

  useEffect(() => {
    return () => {
      Object.keys(longPressTimersRef.current).forEach((key) => {
        window.clearTimeout(longPressTimersRef.current[key]);
      });
      longPressTimersRef.current = {};
    };
  }, []);

  const captainTagText = (team) => {
    if (team.captainId && playersById.has(team.captainId)) {
      return displayShortOf(team.captainId);
    }
    return toTitleCase(team.captain || "");
  };

  const captainOptionsForTeam = (team) => {
    const ids = (team.players || []).filter((pid) => playersById.has(pid));
    const unique = Array.from(new Set(ids));
    unique.sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)));
    return unique;
  };

  const assignRegisteredPlayerToTeam = (playerId, targetTeamId) => {
    if (!canEdit || !playersById.has(playerId)) return;

    setSourceTeams((prev) =>
      prev.map((team) => {
        const withoutPlayer = (team.players || []).filter((pid) => pid !== playerId);
        const isTarget = team.id === targetTeamId;
        const nextPlayers = isTarget ? [...withoutPlayer, playerId] : withoutPlayer;

        return {
          ...team,
          players: nextPlayers,
          captainId: team.captainId === playerId && !isTarget ? null : team.captainId,
        };
      })
    );
  };

  const moveRegisteredPlayerToUnseeded = (playerId) => {
    if (!canEdit || !playersById.has(playerId)) return;

    setSourceTeams((prev) =>
      prev.map((team) => ({
        ...team,
        players: (team.players || []).filter((pid) => pid !== playerId),
        captainId: team.captainId === playerId ? null : team.captainId,
      }))
    );
  };

  const setRegisteredPlayerAsCaptain = (teamId, playerId) => {
    if (!canEdit || !playersById.has(playerId)) return;

    setSourceTeams((prev) =>
      prev.map((team) =>
        team.id === teamId
          ? {
              ...team,
              captainId: playerId,
              captain: displayShortOf(playerId),
            }
          : team
      )
    );
  };


  const getSquadPreviewSlots = () => {
    if (playersPerSide === 7) {
      return [
        { label: "GK", x: 50, y: 88 },
        { label: "DEF", x: 25, y: 68 },
        { label: "DEF", x: 50, y: 72 },
        { label: "DEF", x: 75, y: 68 },
        { label: "MID", x: 38, y: 43 },
        { label: "MID", x: 62, y: 43 },
        { label: "ST", x: 50, y: 20 },
      ];
    }

    if (playersPerSide === 6) {
      return [
        { label: "GK", x: 50, y: 88 },
        { label: "DEF", x: 34, y: 68 },
        { label: "DEF", x: 66, y: 68 },
        { label: "MID", x: 35, y: 43 },
        { label: "MID", x: 65, y: 43 },
        { label: "ST", x: 50, y: 20 },
      ];
    }

    return [
      { label: "GK", x: 50, y: 88 },
      { label: "DEF", x: 34, y: 65 },
      { label: "DEF", x: 66, y: 65 },
      { label: "MID", x: 50, y: 42 },
      { label: "ST", x: 50, y: 20 },
    ];
  };


  const handlePreviewSlotClick = (teamId, slotIndex) => {
    if (!canEdit || isLockedClubChallengeTeam(teamId)) return;
    setPreviewPickTarget({ teamId, slotIndex });
  };

  const handlePreviewPickPlayer = (playerId) => {
    if (!canEdit || !previewPickTarget || !playersById.has(playerId)) return;

    const { teamId, slotIndex } = previewPickTarget;
    if (isLockedClubChallengeTeam(teamId)) return;

    setSourceTeams((prev) =>
      prev.map((team) => {
        if (isLockedClubChallengeTeam(team.id, prev)) return team;

        const withoutPicked = (team.players || []).filter((pid) => pid !== playerId);

        if (team.id !== teamId) {
          return {
            ...team,
            players: withoutPicked,
            captainId: team.captainId === playerId ? null : team.captainId,
          };
        }

        const nextPlayers = [...withoutPicked];
        nextPlayers[slotIndex] = playerId;

        return {
          ...team,
          players: nextPlayers.filter(Boolean),
        };
      })
    );

    setPreviewPickTarget(null);
  };


  const handlePreviewRemovePlayer = (teamId, playerId) => {
    if (!canEdit || !playersById.has(playerId) || isLockedClubChallengeTeam(teamId)) return;

    setSourceTeams((prev) =>
      prev.map((team) =>
        team.id === teamId
          ? {
              ...team,
              players: (team.players || []).filter((pid) => pid !== playerId),
              captainId: team.captainId === playerId ? null : team.captainId,
            }
          : team
      )
    );
  };

  const handlePreviewMovePlayer = (fromTeamId, playerId) => {
    if (!canEdit || !playersById.has(playerId)) return;

    setSourceTeams((prev) => {
      const targetTeam = prev.find((team) => team.id !== fromTeamId && !isCurrentGuestOpponentTeam(team));
      if (!targetTeam) return prev;

      return prev.map((team) => {
        const withoutPlayer = (team.players || []).filter((pid) => pid !== playerId);

        if (team.id === targetTeam.id) {
          return {
            ...team,
            players: [...withoutPlayer, playerId],
          };
        }

        return {
          ...team,
          players: withoutPlayer,
          captainId: team.captainId === playerId ? null : team.captainId,
        };
      });
    });
  };


  const handleAutoFillSquads = () => {
    if (!canEdit) return;

    const eligibleIds = Array.from(
      new Set(
        paidTeamSheetPlayers
          .map((p) => String(p?.id || "").trim())
          .filter(Boolean)
      )
    );

    if (!eligibleIds.length) {
      window.alert(
        isPracticeMode
          ? "No practice players are available for auto fill."
          : "No paid players are available for the upcoming game yet."
      );
      return;
    }

    setSourceTeams((prevTeams) => {
      let cursor = 0;

      return (prevTeams || []).map((team) => {
        const existing = Array.isArray(team.players) ? team.players.filter(Boolean) : [];
        const keep = existing.filter((pid) => eligibleIds.includes(pid)).slice(0, playersPerSide);

        const nextPlayers = [...keep];

        while (nextPlayers.length < playersPerSide && cursor < eligibleIds.length) {
          const candidate = eligibleIds[cursor];
          cursor += 1;

          const alreadyUsed = (prevTeams || []).some((t) =>
            Array.isArray(t.players) && t.players.includes(candidate)
          );

          if (nextPlayers.includes(candidate)) continue;
          if (alreadyUsed && !existing.includes(candidate)) continue;

          nextPlayers.push(candidate);
        }

        return {
          ...team,
          players: nextPlayers,
          captainId: nextPlayers.includes(team.captainId) ? team.captainId : null,
        };
      });
    });
  };

  const handleClearSquads = () => {
    if (!canEdit) return;

    setSourceTeams((prevTeams) =>
      (prevTeams || []).map((team) => ({
        ...team,
        players: [],
        captainId: null,
        captain: "",
      }))
    );
  };



  const isActiveGuestChallenge = Boolean(guestOpponentEnabled && activeChallengeFixture);

  const isCurrentGuestOpponentTeam = (team = {}) => {
    if (!isActiveGuestChallenge) return false;
    return Boolean(team?.isGuestOpponent || team?.id === GUEST_OPPONENT_SLOT_ID);
  };

  const getPreviewTeamName = (team) => {
    const challengeIsActive = Boolean(guestOpponentEnabled || activeChallengeFixture);

    if (challengeIsActive && team.id === TURF_KINGS_SLOT_ID) {
      return resolvedHomeClubName || "Home Club";
    }

    if (challengeIsActive && team.id === GUEST_OPPONENT_SLOT_ID) {
      return resolvedAwayClubName || "Opponent Club";
    }

    if (team.id === TURF_KINGS_SLOT_ID) return team.label || "Dark";
    if (team.id === GUEST_OPPONENT_SLOT_ID) return team.label || "Light";

    return team.label || "Team";
  };


  const buildShareableTeamsheetText = () => {
    const lines = ["5 Asides Near Me - Team Sheet", ""];

    sourceTeams.forEach((team) => {
      const name = getPreviewTeamName(team);
      const color = team.teamColorName || team.colorName || "";
      lines.push(`${name}${color ? ` (${color})` : ""}`);
      lines.push("-".repeat(Math.max(10, name.length)));

      const players = Array.isArray(team.players) ? team.players : [];
      if (!players.length) {
        lines.push("No players selected");
      } else {
        players.forEach((pid, index) => {
          lines.push(`${index + 1}. ${displayNameOf(pid)}`);
        });
      }

      lines.push("");
    });

    return lines.join("\\n");
  };

  const handleDownloadTeamsheet = () => {
    const text = buildShareableTeamsheetText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team-sheet.txt";
    a.click();
    URL.revokeObjectURL(url);
  };


  const handleSaveTeamsheetCardAsImage = async () => {
    const node = teamsheetCardRef.current;
    if (!node) return;

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#071226",
      });

      const link = document.createElement("a");
      link.download = `teamsheet-${nextTeamsheetWeekId || "upcoming-game"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[Squads] Failed to save teamsheet image:", err);
      showPremiumAlert({ title: "Teamsheet save failed", message: "Could not save the teamsheet card as an image.", icon: "⚠️" });
    }
  };



  const handleSaveAvailablePaidPlayersCardAsImage = async () => {
    const node = cardRefs.current["available-paid-players-card"];
    if (!node) return;

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#071226",
        imagePlaceholder:
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        skipFonts: true,
      });

      const link = document.createElement("a");
      link.download = `available-paid-players-${nextTeamsheetWeekId || "upcoming-game"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[Squads] Failed to save available players card:", err);
      showPremiumAlert({ title: "Paid players card save failed", message: "Could not save the available paid players card as an image.", icon: "⚠️" });
    }
  };


  const teamsheetDisplayDateParts = useMemo(() => {
    if (!nextTeamsheetWeekId) {
      return { dateLabel: "Upcoming game", scheduleLabel: "" };
    }

    const d = new Date(`${nextTeamsheetWeekId}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      return { dateLabel: nextTeamsheetWeekId, scheduleLabel: "" };
    }

    const dateLabel = d.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const ymd = (date) => date.toISOString().slice(0, 10);
    const gameYmd = ymd(d);

    let dayLabel = d.toLocaleDateString("en-ZA", { weekday: "long" });
    if (gameYmd === ymd(today)) dayLabel = "Today";
    if (gameYmd === ymd(tomorrow)) dayLabel = "Tomorrow";

    const rawTime =
      activeClub?.weeklyPlayTime ||
      activeClub?.schedule?.weeklyPlayTime ||
      activeClub?.schedule?.playTime ||
      activeClub?.playTime ||
      "";

    const cleanedTime = String(rawTime || "")
      .replace(
        /^(?:Monday|Mondays|Tuesday|Tuesdays|Wednesday|Wednesdays|Thursday|Thursdays|Friday|Fridays|Saturday|Saturdays|Sunday|Sundays)\s*:?\s*/i,
        ""
      )
      .trim();

    const prettyTime = cleanedTime.replace(/\b(\d{1,2}):(\d{2})\b/, (_, h, m) => {
      const hour = Number(h);
      if (!Number.isFinite(hour)) return `${h}:${m}`;
      const suffix = hour >= 12 ? "pm" : "am";
      const hour12 = hour % 12 || 12;
      return `${hour12}:${m} ${suffix}`;
    });

    return {
      dateLabel,
      scheduleLabel: prettyTime ? `${dayLabel} ${prettyTime}` : dayLabel,
    };
  }, [nextTeamsheetWeekId, activeClub]);


  useEffect(() => {
    const adminIsEditingPreview = Boolean(showSquadPreview) && Boolean(isAdmin);
    onSquadPreviewEditingChange?.(adminIsEditingPreview);

    return () => {
      onSquadPreviewEditingChange?.(false);
    };
  }, [showSquadPreview, isAdmin, onSquadPreviewEditingChange]);

  const renderAvailablePaidPlayersCard = () => {
    const remainingPaidPlayers = paidTeamSheetPlayers.filter((p) => !assignedIds.has(p.id));

    if (!remainingPaidPlayers.length) {
      return (
        <div className="teamsheet-export-wrap available-paid-card-wrap">
          <div className="teamsheet-card available-paid-card">
            <div className="teamsheet-card-head">
              <div className="teamsheet-card-club">
                <img src={activeClubLogo || TURF_KINGS_LOGO_URL} alt="" />
                <div>
                  <span>{activeClubName || "Club"}</span>
                  <small>Available paid players</small>
                </div>
              </div>
            </div>

            <p className="muted small" style={{ margin: 0 }}>
              No paid players found for the upcoming game yet.
              Players must appear here after paying or being verified on Match Signup.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="teamsheet-export-wrap available-paid-card-wrap">
        <div className="teamsheet-export-actions">
          <div>
            <h3>Available paid players</h3>
            <p className="muted small">Paid players still available for team placement.</p>
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={handleSaveAvailablePaidPlayersCardAsImage}
          >
            Download Paid & Booked List
          </button>
        </div>

        <div
          ref={(el) => {
            cardRefs.current["available-paid-players-card"] = el;
          }}
          className="teamsheet-card available-paid-card"
        >
          <div className="teamsheet-card-head">
            <div className="teamsheet-card-club">
              <img src={activeClubLogo || TURF_KINGS_LOGO_URL} alt="" />
              <div>
                <span>{activeClubName || "Club"}</span>
                <small>Available paid players</small>
              </div>
            </div>

            <div className="teamsheet-card-date">
              <strong>{teamsheetDisplayDateParts.dateLabel}</strong>
              {teamsheetDisplayDateParts.scheduleLabel && (
                <small>{teamsheetDisplayDateParts.scheduleLabel}</small>
              )}
            </div>
          </div>

          <ol className="available-paid-card-list">
            {remainingPaidPlayers.length ? (
              remainingPaidPlayers.map((p) => (
                <li key={`available-paid-${p.id}`}>{displayNameOf(p.id)}</li>
              ))
            ) : (
              <li>All paid players have been placed into teams.</li>
            )}
          </ol>
        </div>
      </div>
    );
  };

  const renderTeamsheetCard = () => {
    const matchTeams = isLeague ? sourceTeams.slice(0, 3) : sourceTeams.slice(0, 2);
    const isClubChallengeTeamsheet = Boolean(guestOpponentEnabled && activeChallengeFixture);

    const getChallengeTeamLogo = (team, index) => {
      if (!isClubChallengeTeamsheet) return "";

      const name = String(getPreviewTeamName(team) || "").trim().toLowerCase();
      const homeName = String(resolvedHomeClubName || "").trim().toLowerCase();
      const awayName = String(resolvedAwayClubName || "").trim().toLowerCase();

      if (name && homeName && name === homeName) return resolvedHomeClubLogo || "";
      if (name && awayName && name === awayName) return resolvedAwayClubLogo || "";

      return index === 0 ? resolvedHomeClubLogo || "" : resolvedAwayClubLogo || "";
    };

    return (
      <div className="teamsheet-export-wrap">
        <div className="teamsheet-export-actions">
          <div>
            <h3>Upcoming game teamsheet</h3>
            <p className="muted small">
              Share this with the group after saving squads.
            </p>
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={handleSaveTeamsheetCardAsImage}
          >
            Download team-sheet
          </button>
        </div>

        <div
          ref={teamsheetCardRef}
          className={`teamsheet-card${isClubChallengeTeamsheet ? " teamsheet-card--club-challenge" : ""}`}
        >
          <div className="teamsheet-card-head">
            <div className="teamsheet-card-club">
              <img
                src={isClubChallengeTeamsheet ? "/pwa/icon-192.png" : activeClubLogo || TURF_KINGS_LOGO_URL}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <div>
                <span>{isClubChallengeTeamsheet ? "5 Asides Near Me" : activeClubName || "Club"}</span>
                <small>{isClubChallengeTeamsheet ? "Exhibition Fixture Only" : "5 Asides Near Me"}</small>
              </div>
            </div>

            <div className="teamsheet-card-date">
              <strong>{teamsheetDisplayDateParts.dateLabel}</strong>
              {teamsheetDisplayDateParts.scheduleLabel && (
                <small>{teamsheetDisplayDateParts.scheduleLabel}</small>
              )}
            </div>
          </div>

          <div className="teamsheet-card-grid">
            {matchTeams.map((team, index) => {
              const theme = getTeamTheme(team);
              const players = Array.isArray(team.players) ? team.players : [];
              const challengeLogo = getChallengeTeamLogo(team, index);

              return (
                <div
                  key={`teamsheet-card-${team.id}`}
                  className="teamsheet-card-team"
                  style={{
                    "--team-accent": theme.accent,
                    "--team-glow": theme.glow,
                  }}
                >
                  <div className="teamsheet-card-team-head">
                    <div className="teamsheet-card-team-title">
                      {challengeLogo ? (
                        <img
                          src={challengeLogo}
                          alt=""
                          className="teamsheet-card-team-logo"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                      <div>
                        <h4 className="teamsheet-card-team-name-with-identity">
                          {getTeamIdentityVisual(team)}
                          <span className="teamsheet-card-team-name-stack">
                            <span>{getPreviewTeamName(team)}</span>
                            {team.teamIdentity ? <small>Fantasy 5s</small> : null}
                          </span>
                        </h4>
                        <p>
                          Wear: <strong>{team.teamColorName || theme.colorName || "Team colour"}</strong>
                        </p>
                      </div>
                    </div>
                    <span className="teamsheet-card-team-abbrev">{team.teamIdentity?.abbr || team.abbrev || ""}</span>
                  </div>

                  <ol>
                    {players.length ? (
                      players.map((pid) => (
                        <li key={`teamsheet-${team.id}-${pid}`}>
                          {displayNameOf(pid)}
                          {team.captainId === pid ? " (C)" : ""}
                        </li>
                      ))
                    ) : (
                      <li className="muted">No players selected</li>
                    )}
                  </ol>
                </div>
              );
            })}
          </div>        </div>
      </div>
    );
  };

  const renderSquadShapePreview = () => {
    const slots = getSquadPreviewSlots();
    const isClubChallengePreview = Boolean(activeChallengeFixture);

    const getChallengePreviewMeta = (team) => {
      const originalIndex = sourceTeams.findIndex(
        (item) => String(item?.id || "") === String(team?.id || "")
      );

      if (originalIndex === 0) {
        return {
          clubId: activeChallengeFixture?.homeClubId || "",
          clubName: resolvedHomeClubName,
          clubLogo: resolvedHomeClubLogo,
        };
      }

      return {
        clubId: activeChallengeFixture?.awayClubId || "",
        clubName: resolvedAwayClubName,
        clubLogo: resolvedAwayClubLogo,
      };
    };

    const previewTeams = isClubChallengePreview
      ? [...sourceTeams].sort((a, b) => {
          const aLocked = isLockedClubChallengeTeam(a.id) ? 1 : 0;
          const bLocked = isLockedClubChallengeTeam(b.id) ? 1 : 0;
          return aLocked - bLocked;
        })
      : sourceTeams;

    return (
      <div className="squad-preview-grid">
        {previewTeams.map((team) => {
          const theme = getTeamTheme(team);
          const players = Array.isArray(team.players) ? team.players : [];
          const challengeMeta = getChallengePreviewMeta(team);
          const challengeClubName = challengeMeta.clubName;
          const challengeClubLogo = challengeMeta.clubLogo;
          const isLockedOpponentPreview = isLockedClubChallengeTeam(team.id);

          return (
            <div
              key={`preview-${team.id}`}
              className={`squad-preview-pitch-card${isLockedOpponentPreview ? " squad-preview-pitch-card--locked-opponent" : ""}`}
              style={{
                "--team-accent": theme.accent,
                "--team-accent-soft": theme.accentSoft,
                "--team-glow": theme.glow,
              }}
            >
              <div className="squad-preview-team-head">
                <span className="squad-preview-team-dot" />
                <div
                  style={{
                    width: "100%",
                    minWidth: 0,
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 150px)",
                    gap: "0.55rem",
                    alignItems: "start",
                  }}
                >
                  <div>
                    {isClubChallengePreview ? (
                      <div className="squad-preview-club-challenge-title">
                        {challengeClubLogo ? (
                          <img
                            src={challengeClubLogo}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                        <h4>{challengeClubName || getPreviewTeamName(team)}</h4>
                      </div>
                    ) : canEdit ? (
                      <button
                        type="button"
                        className="text-input squad-team-identity-button"
                        onClick={() => setTeamIdentityTarget(team.id)}
                        disabled={isCurrentGuestOpponentTeam(team)}
                      >
                        {getTeamIdentityVisual(team)}
                        <span>{team.label || "Choose team"}</span>
                      </button>
                    ) : (
                      <h4>{getPreviewTeamName(team)}</h4>
                    )}

                    <p style={{ marginTop: "0.35rem" }}>
                      {players.length}/{playersPerSide} selected
                    </p>
                  </div>

                  {canEdit ? (
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      <select
                        className="text-input"
                        value={
                          team.captainId && playersById.has(team.captainId)
                            ? team.captainId
                            : ""
                        }
                        onChange={(event) =>
                          handleCaptainChange(team.id, event.target.value)
                        }
                        disabled={isLockedOpponentPreview || captainOptionsForTeam(team).length === 0}
                        title="Select captain"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      >
                        <option value="">Captain</option>
                        {captainOptionsForTeam(team).map((pid) => (
                          <option key={`preview-captain-${team.id}-${pid}`} value={pid}>
                            ⭐ {displayNameOf(pid)}
                          </option>
                        ))}
                      </select>

                      <TeamIdentityEditor
                        team={team}
                        colourName={
                          team.teamColorName ||
                          (team.id === TURF_KINGS_SLOT_ID
                            ? "Black"
                            : "White")
                        }
                        showName={false}
                        showAbbreviation={false}
                        showColour
                        compact
                        disabled={isLockedOpponentPreview}
                        onColourChange={(nextColour) =>
                          handleTeamColorNameChange(
                            team.id,
                            nextColour.teamColorName
                          )
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="squad-preview-mini-pitch">
                <div className="squad-preview-centre-circle" />
                <div className="squad-preview-half-line" />
                <div className="squad-preview-box top" />
                <div className="squad-preview-box bottom" />

                {slots.map((slot, index) => {
                  const pid = players[index];
                  const label = pid
                    ? isCurrentGuestOpponentTeam(team)
                      ? toTitleCase(pid)
                      : (displayShortOf(pid) || '').split(' ')[0]
                    : "Empty";

                  const isCaptain =
                    pid &&
                    team.captainId &&
                    playersById.has(team.captainId) &&
                    team.captainId === pid;

                  return (
                    <button
                      type="button"
                      key={`preview-slot-${team.id}-${index}`}
                      className={`squad-preview-position ${pid ? "has-player" : "is-empty"}`}
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      onClick={() => handlePreviewSlotClick(team.id, index)}
                      title={
                        isLockedOpponentPreview
                          ? "Opponent lineup is controlled by the other club"
                          : canEdit
                            ? "Tap to assign player"
                            : "Read-only preview"
                      }
                    >
                      <div className="squad-preview-shirt">
                        {pid ? String(label || "?").charAt(0).toUpperCase() : "+"}
                      </div>
                      <div className="squad-preview-label">
                        <strong>{label}{isCaptain ? " ⭐" : ""}</strong>
                        <span>{slot.label}</span>
                      </div>

                      {canEdit && pid && !isLockedOpponentPreview ? (
                        <div className="squad-preview-mini-actions">
                          <span
                            role="button"
                            tabIndex={0}
                            title="Remove player"
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePreviewRemovePlayer(team.id, pid);
                            }}
                          >
                            ×
                          </span>
                        </div>
                      ) : null}
                    </button>
                  );
                })}

                {players.length > slots.length && (
                  <div className="squad-preview-extra-list">

                    {players.slice(slots.length).map((pid, extraIndex) => (
                      <button
                        type="button"
                        key={`preview-extra-${team.id}-${pid}-${extraIndex}`}
                        className="squad-preview-extra-player"
                        onClick={() => handlePreviewSlotClick(team.id, slots.length + extraIndex)}
                        disabled={isLockedOpponentPreview}
                      >
                        {String(displayShortOf(pid) || displayNameOf(pid) || '').split(' ')[0]}
                      </button>
                    ))}
                  </div>
                )}

                {canEdit && players.length >= playersPerSide && (
                  <button
                    type="button"
                    className="squad-preview-add-extra-btn"
                    onClick={() => handlePreviewSlotClick(team.id, players.length)}
                  >
                    + Extra\nplayer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCardShell = (cardId, label, theme, children) => (
    <div
      className={`squad-surface ${cardId.includes(UNSEEDED_ID) ? "squad-pool-surface" : "squad-team-surface"} ${savingCardId === cardId ? "saving" : ""}`}
      style={{
        "--team-accent": theme.accent,
        "--team-accent-soft": theme.accentSoft,
        "--team-glow": theme.glow,
        "--team-text": theme.text,
      }}
    >
      <div
        ref={(el) => {
          cardRefs.current[cardId] = el;
        }}
        className="squad-surface-inner squad-column"
        onDoubleClick={() => handleSaveCardAsImage(cardId, label)}
        onTouchStart={() => startLongPressSave(cardId, label)}
        onTouchEnd={() => clearLongPress(cardId)}
        onTouchMove={() => clearLongPress(cardId)}
        onTouchCancel={() => clearLongPress(cardId)}
        title="Double-click to save. On mobile, long-press to save."
      >
        {children}
      </div>
    </div>
  );

  return (
    <div className="page squads-page">
      <div
        className={`landing-header-sticky ${
          headerScrolled ? "is-scrolled" : ""
        }`}
      >
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
              <h1 style={{ margin: 0 }}>Manage Squads</h1>
            </div>

            <button
              className="secondary-btn"
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

      {canEdit && (
        <div
          className="squad-admin-compact-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.55rem",
            flexWrap: "wrap",
            margin: "0.25rem 0 0.75rem",
            position: "relative",
          }}
        >
          <button
            type="button"
            className="secondary-btn set-squad-pulse-btn"
            onClick={() => setShowSquadPreview(true)}
          >
            Set Squad ✏️
          </button>

          <button className="primary-btn" onClick={handleSaveClick}>
            Save Squads
          </button>

          {isAdmin && (
            <span style={{ position: "relative", display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={handleToggleCaptainEditLock}
              >
                {captainEditLocked ? "Unlock Captains" : "Lock Captains"}
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowCaptainLockHelp((current) => !current)}
                title="What does this do?"
                style={{
                  width: "32px",
                  height: "32px",
                  minWidth: "32px",
                  padding: 0,
                  borderRadius: "999px",
                  fontWeight: 900,
                }}
              >
                ✎
              </button>

              {showCaptainLockHelp && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 0.55rem)",
                    right: "50%",
                    transform: "translateX(50%)",
                    zIndex: 99999,
                    width: "min(280px, calc(100vw - 1.25rem))",
                    maxWidth: "280px",
                    padding: "0.75rem 0.85rem",
                    borderRadius: "16px",
                    background: "rgba(15,23,42,0.98)",
                    border: "1px solid rgba(148,163,184,0.28)",
                    boxShadow: "0 18px 44px rgba(2,6,23,0.42)",
                    color: "#e5e7eb",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "-8px",
                      right: "50%",
                      marginRight: "-7px",
                      width: "14px",
                      height: "14px",
                      background: "rgba(15,23,42,0.98)",
                      borderLeft: "1px solid rgba(148,163,184,0.28)",
                      borderTop: "1px solid rgba(148,163,184,0.28)",
                      transform: "rotate(45deg)",
                    }}
                  />

                  <div
                    style={{
                      position: "relative",
                      zIndex: 2,
                      color: "#e5e7eb",
                    fontSize: "0.78rem",
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: "#ffffff" }}>Captain edit control</strong>
                  <div style={{ marginTop: "0.25rem" }}>
                    This is your admin control. Keep captains locked when you do not want them changing squads.
                    Unlock captains when you want them to help set teams, edit squads, and save using a captain code.
                  </div>
                  </div>
                </div>
              )}
            </span>
          )}

          {lastSquadEditor && (
            <span className="muted small" style={{ width: "100%", textAlign: "center" }}>
              Last changed by <strong>{lastSquadEditor.name}</strong> · {lastSquadEditor.role}
            </span>
          )}

        </div>
      )}

      <section className="card">
        {isFiveVFive && activeChallengeFixture && (
          <div
            className="closed-club-challenge-card"
            style={{
              marginBottom: "1.25rem",
              borderRadius: "24px",
              border: "1px solid rgba(250, 204, 21, 0.38)",
              background:
                "radial-gradient(circle at top left, rgba(250,204,21,0.20), transparent 34%), radial-gradient(circle at bottom right, rgba(34,197,94,0.18), transparent 35%), linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.94))",
              boxShadow:
                "0 22px 60px rgba(0,0,0,0.28), 0 0 44px rgba(250,204,21,0.12)",
              padding: "1.15rem",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "1rem",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#FDE68A",
                    fontWeight: 1000,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontSize: "0.78rem",
                  }}
                >
                  🏆 External Club Challenge
                </div>
                <div className="muted small">
                  Closed FANM fixture. Only registered clubs can appear here.
                </div>
              </div>

              <div className="club-challenge-fixture-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleSaveChallengeAdvert}
                >
                  Save advert
                </button>

                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="secondary-btn club-challenge-edit-btn"
                      onClick={openChallengeChangeModal}
                    >
                      Request change
                    </button>

                    <button
                      type="button"
                      className="secondary-btn club-challenge-cancel-btn"
                      onClick={() => { setCancelChallengeReason(""); setCancelChallengeModalOpen(true); }}
                    >
                      Request cancellation
                    </button>
                  </>
                )}
              </div>
            </div>

            <div
              ref={challengeAdvertRef}
              className="closed-club-challenge-poster"
              style={{
                borderRadius: "22px",
                border: "1px solid rgba(255,255,255,0.14)",
                background:
                  "radial-gradient(circle at 16% 18%, rgba(250,204,21,0.20), transparent 28%), radial-gradient(circle at 86% 82%, rgba(34,197,94,0.20), transparent 30%), linear-gradient(135deg, #06122A, #0F172A 58%, #14532D)",
                padding: "1.25rem",
                display: "grid",
                gap: "1rem",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  color: "#BBF7D0",
                  fontSize: "0.82rem",
                  fontWeight: 1000,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                FANM Club Challenge Match
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: "1rem",
                  alignItems: "center",
                }}
              >
                <div style={{ textAlign: "center", display: "grid", gap: "0.5rem" }}>
                  {resolvedHomeClubLogo ? (
                    <img
                      src={resolvedHomeClubLogo}
                      alt={`${resolvedHomeClubName} logo`}
                      style={{
                        width: "5rem",
                        height: "5rem",
                        objectFit: "contain",
                        margin: "0 auto",
                        borderRadius: "20px",
                        background: "rgba(255,255,255,0.94)",
                        padding: "0.4rem",
                      }}
                    />
                  ) : (
                    <GeneratedOpponentCrest
                      name={resolvedHomeClubName || "Home Club"}
                      theme={getTeamTheme(turfKingsChallengeTeam)}
                    />
                  )}
                  <strong style={{ color: "#F8FAFC", fontSize: "1.05rem" }}>
                    {resolvedHomeClubName || "Home Club"}
                  </strong>
                </div>

                <div
                  style={{
                    color: "#FDE68A",
                    fontSize: "2rem",
                    fontWeight: 1000,
                    textShadow: "0 0 22px rgba(250,204,21,0.35)",
                  }}
                >
                  VS
                </div>

                <div style={{ textAlign: "center", display: "grid", gap: "0.5rem" }}>
                  {resolvedAwayClubLogo ? (
                    <img
                      src={resolvedAwayClubLogo}
                      alt={`${resolvedAwayClubName} logo`}
                      style={{
                        width: "5rem",
                        height: "5rem",
                        objectFit: "contain",
                        margin: "0 auto",
                        borderRadius: "20px",
                        background: "rgba(255,255,255,0.94)",
                        padding: "0.4rem",
                      }}
                    />
                  ) : (
                    <GeneratedOpponentCrest
                      name={resolvedAwayClubName || "Away Club"}
                      theme={getTeamTheme(guestOpponentTeam)}
                    />
                  )}
                  <strong style={{ color: "#F8FAFC", fontSize: "1.05rem" }}>
                    {resolvedAwayClubName || "Away Club"}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  textAlign: "center",
                  color: "#CBD5E1",
                  fontWeight: 800,
                  lineHeight: 1.55,
                }}
              >
                <div>{String(activeChallengeFixture?.format || "5v5").toUpperCase()} • Club-vs-club fixture</div>
                <div style={{ color: "#FDE68A", fontSize: "1.05rem", marginTop: "0.25rem" }}>
                  {formattedChallengeDate}
                </div>
                <div>
                  Kick Off: {activeChallengeFixture?.proposedKickoff || "Kickoff TBC"}
                  {" "}• Venue: {activeChallengeFixture?.venue || "Venue TBC"}
                </div>
              </div>
            </div>
          </div>
        )}

        {renderTeamsheetCard()}

        {renderAvailablePaidPlayersCard()}


      </section>

      {canEdit && showSquadPreview && (
        <div className="modal-backdrop squad-preview-backdrop">
          <div className="modal squad-preview-modal">
            <div className="squad-preview-modal-head">
              <div>
                <h3>Squad Shape Preview</h3>
                <p className="muted small">
                  Read-only team view while building squads. Final positions and tactics are still managed in Lineups & Formations.
                </p>
              </div>

              <div className="squad-preview-modal-actions">
                <button
                  type="button"
                  className="secondary-btn squad-preview-close-btn"
                  onClick={() => setShowSquadPreview(false)}
                >
                  View teamsheet
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={
                    sourceTeams.some((team) => Array.isArray(team.players) && team.players.length > 0)
                      ? handleClearSquads
                      : handleAutoFillSquads
                  }
                >
                  {sourceTeams.some((team) => Array.isArray(team.players) && team.players.length > 0)
                    ? "Clear squads"
                    : "Auto fill squads"}
                </button>
<button
                  type="button"
                  className="primary-btn squad-preview-save-btn"
                  onClick={() => {
                    setShowSquadPreview(false);
                    handleSaveClick();
                  }}
                >
                  Save Squads
                </button>
              </div>
            </div>

            {renderSquadShapePreview()}

            {previewPickTarget && (
              <div className="squad-preview-picker squad-preview-floating-picker">
                <div>
                  <h4>
                    Pick from This Game&apos;s Paid Teamsheet
                    {nextTeamsheetWeekId ? ` · ${nextTeamsheetWeekId}` : ""}
                  </h4>
                  <p className="muted small">
                    Player will be placed directly into the selected preview slot.
                  </p>
                </div>

                <div className="squad-preview-picker-list">
                  {paidTeamSheetPlayers.length ? (
                    paidTeamSheetPlayers
                      .filter((p) => !assignedIds.has(p.id))
                      .map((p) => (
                        <button
                          type="button"
                          key={`preview-paid-pick-${p.id}`}
                          className="squad-preview-picker-player squad-preview-picker-player-paid"
                          onClick={() => handlePreviewPickPlayer(p.id)}
                        >
                          ✅ {displayNameOf(p.id)}
                        </button>
                      ))
                  ) : (
                    <p className="muted small">
                      No paid players found for the next game yet. Players must appear here after paying/being verified on Match Signup.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setPreviewPickTarget(null)}
                >
                  Cancel pick
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {challengeChangeModalOpen && (
        <div className={`modal-backdrop ${showFixtureChangeSuccess ? "modal-backdrop--nested-dim" : ""}`}>
          <div className={`modal challenge-change-modal ${showFixtureChangeSuccess ? "modal--under-nested-popup" : ""}`}>
            <h3>Make fixture changes</h3>
            <p className="muted small">
              Update the fixture details below. The game against{" "}
              <span
                style={{
                  color: "#F59E0B",
                  fontWeight: 800,
                }}
              >
                {(() => {
                  const clubName =
                    activeClubId === activeChallengeFixture?.homeClubId
                      ? resolvedAwayClubName
                      : resolvedHomeClubName;

                  return /\bfc\b/i.test(clubName || "")
                    ? clubName
                    : `${clubName} FC`;
                })()}
              </span>{" "}
              will be notified and can respond.
            </p>

            <div className="field-row">
              <label>Date</label>
              <input
                type="date"
                className="text-input"
                value={challengeChangeDraft.proposedDate}
                onChange={(event) =>
                  setChallengeChangeDraft((current) => ({
                    ...current,
                    proposedDate: event.target.value,
                  }))
                }
                placeholder="12 June 2026"
              />
            </div>

            <div className="field-row">
              <label>Kickoff time</label>
              <input
                type="time"
                className="text-input"
                value={challengeChangeDraft.proposedKickoff}
                onChange={(event) =>
                  setChallengeChangeDraft((current) => ({
                    ...current,
                    proposedKickoff: event.target.value,
                  }))
                }
              />
            </div>

            <div className="field-row">
              <label>Venue</label>
              <input
                className="text-input"
                value={challengeChangeDraft.venue}
                onChange={(event) =>
                  setChallengeChangeDraft((current) => ({
                    ...current,
                    venue: event.target.value,
                  }))
                }
                placeholder="Venue"
              />
            </div>

            <div className="field-row">
              <label>Game format</label>
              <select
                className="text-input"
                value={challengeChangeDraft.format}
                onChange={(event) =>
                  setChallengeChangeDraft((current) => ({
                    ...current,
                    format: event.target.value,
                  }))
                }
              >
                <option value="5v5">5 v 5</option>
                <option value="6v6">6 v 6</option>
                <option value="7v7">7 v 7</option>
                <option value="11aside">11 aside</option>
              </select>
            </div>

            <div className="field-row">
              <label>Message to opponent</label>
              <textarea
                className="text-input"
                value={challengeChangeDraft.reason}
                onChange={(event) =>
                  setChallengeChangeDraft((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Explain why these changes are needed."
                rows={3}
              />
            </div>

            <div className="actions-row">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setChallengeChangeModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSubmitChallengeChangeRequest}
              >
                Update fixture info
              </button>
            </div>
          </div>
        </div>
      )}

      {showFixtureChangeSuccess && (
        <div className="modal-backdrop modal-backdrop--nested-popup">
          <div className="modal fixture-success-modal">
            <div className="fixture-success-icon">✅</div>

            <h3>Fixture update sent</h3>

            <p className="muted small">
              Your fixture update request has been sent to{" "}
              <strong>
                {activeClubId === activeChallengeFixture?.homeClubId
                  ? resolvedAwayClubName
                  : resolvedHomeClubName}
              </strong>
              . They will be notified and can respond.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setShowFixtureChangeSuccess(false);
                setChallengeChangeModalOpen(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {cancelChallengeModalOpen && (
        <div className="modal-backdrop">
          <div className="modal challenge-cancel-modal">
            <div className="challenge-cancel-icon">⚠️</div>

            <h3>Request fixture cancellation</h3>

            <p className="muted small">
              You are asking to cancel the fixture between{" "}
              <strong>{resolvedHomeClubName}</strong> and{" "}
              <strong>{resolvedAwayClubName}</strong>. The other club will be notified
              and may suggest one alternative before final cancellation.
            </p>

            <textarea
              className="text-input"
              rows={4}
              value={cancelChallengeReason}
              onChange={(event) => setCancelChallengeReason(event.target.value)}
              placeholder="Example: We no longer have enough players available for this fixture."
            />

            <div className="challenge-cancel-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setCancelChallengeModalOpen(false);
                  setCancelChallengeReason("");
                }}
              >
                Keep fixture
              </button>

              <button
                type="button"
                className="secondary-btn challenge-cancel-danger-btn"
                onClick={handleCancelChallenge}
              >
                Send cancellation request
              </button>
            </div>
          </div>
        </div>
      )}

      {premiumAlert && (
        <div className="modal-backdrop modal-backdrop--nested-popup">
          <div className="modal premium-alert-modal">
            <div className="premium-alert-icon">{premiumAlert.icon || "ℹ️"}</div>

            <h3>{premiumAlert.title}</h3>

            <p className="muted small">
              {premiumAlert.message}
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={() => setPremiumAlert(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showFixtureChangeValidation && (
        <div className="modal-backdrop">
          <div className="modal challenge-validation-modal">
            <div className="challenge-validation-icon">⚠️</div>

            <h3>Message Required</h3>

            <p>
              <strong>
                {activeClubId === activeChallengeFixture?.homeClubId
                  ? `${resolvedAwayClubName || "Opponent Club"} FC`
                  : `${resolvedHomeClubName || "Opponent Club"} FC`}
              </strong>{" "}
              needs a short explanation for the fixture update.
            </p>

            <p className="muted small">
              Example: Venue changed due to maintenance, weather concerns,
              scheduling conflict or player availability.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={() => setShowFixtureChangeValidation(false)}
            >
              Continue Editing
            </button>
          </div>
        </div>
      )}


      {isAdmin && pendingDeletePlayerId && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Terminate club membership?</h3>
            <p>
              You are about to permanently remove
              <strong> {displayNameOf(pendingDeletePlayerId)} </strong>
              from the ${activeClubName} club membership list.
            </p>
            <p className="error-text">
              This will remove the player from the club player pool and club members list.
              They will no longer appear for squad selection or club access. If this is a mistake,
              the player must be added again manually.
            </p>

            <div className="field-row">
              <label>Admin code</label>
              <input
                type="password"
                className="text-input"
                value={deleteCode}
                onChange={(e) => {
                  setDeleteCode(e.target.value);
                  setDeletePlayerError("");
                }}
                placeholder="Enter admin code to confirm"
              />
            </div>

            {deletePlayerError && <p className="error-text">{deletePlayerError}</p>}

            <div className="actions-row">
              <button className="secondary-btn" onClick={handleCancelDeletePlayer}>
                Cancel
              </button>
              <button
                className="primary-btn"
                onClick={handleConfirmDeletePlayer}
                style={{
                  background:
                    "linear-gradient(180deg, rgba(220,38,38,0.96), rgba(127,29,29,0.98))",
                  borderColor: "rgba(248,113,113,0.65)",
                }}
              >
                Yes, terminate membership
              </button>
            </div>
          </div>
        </div>
      )}

      <TeamIdentityPicker
        open={Boolean(teamIdentityTarget)}
        selectedIdentity={sourceTeams.find((t) => t.id === teamIdentityTarget)?.teamIdentity}
        onClose={() => setTeamIdentityTarget(null)}
        onSelect={(identity) => {
          applyTeamIdentity(teamIdentityTarget, identity);
          setTeamIdentityTarget(null);
        }}
      />

      {canEdit && showSaveModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm Squad Changes</h3>
            <p>Enter the ${activeClubName} admin code to apply squad changes.</p>

            <div className="field-row">
              <label>Admin code</label>
              <input
                type="password"
                className="text-input"
                value={saveCode}
                onChange={(e) => {
                  setSaveCode(e.target.value);
                  setSaveError("");
                }}
              />
              {saveError && <p className="error-text">{saveError}</p>}
            </div>

            <div className="actions-row">
              <button className="secondary-btn" onClick={handleCancelSave}>
                Cancel
              </button>
              <button className="primary-btn" onClick={handleConfirmSave}>
                Confirm &amp; save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
