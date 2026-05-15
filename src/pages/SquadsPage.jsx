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
} from "../core/clubFirestorePaths.js";
import {
  MATCH_MODE,
  GAME_FORMAT,
  getGameFormatConfig,
  normalizeMatchMode,
  normalizeGameFormat,
} from "../core/matchConfig.js";

const MASTER_CODE = "3333"; // Nkululeko only
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

function normalizeAbbrev(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function isValidAbbrev(v) {
  return /^[A-Z]{3}$/.test(String(v || ""));
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
      abbrev: "DRK",
      teamColorName: "Black",
      teamColorHex: "#0F172A",
      players: [],
      captainId: null,
      captain: "",
    },
    {
      id: "light",
      label: "Light",
      abbrev: "LGT",
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
      abbrev: "DRK",
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
      abbrev: "LGT",
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
  activeClub = null,
}) {
  const activeClubName = String(activeClub?.name || activeClub?.clubName || activeClubId || "This club").trim();
  const effectiveRole = String(
    activeRole || identity?.actingRole || identity?.role || ""
  )
    .trim()
    .toLowerCase();

  const isAdmin = effectiveRole
    ? effectiveRole === "admin"
    : Boolean(isAdminProp) || isAdminIdentity(identity);

  const canEdit = isAdmin;

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
  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");
  const [showUnseededPlayers, setShowUnseededPlayers] = useState(false);
  const [pendingDeletePlayerId, setPendingDeletePlayerId] = useState("");
  const [deletePlayerError, setDeletePlayerError] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [acceptedChallengeCandidates, setAcceptedChallengeCandidates] = useState([]);
  const [acceptedChallengesError, setAcceptedChallengesError] = useState("");
  const [signupRecords, setSignupRecords] = useState([]);

  const [activeChallengeFixture, setActiveChallengeFixture] = useState(null);

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

  const [guestOpponentEnabled, setGuestOpponentEnabled] = useState(() =>
    isGuestChallengeSlotMode(fiveVFiveTeams)
  );
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
  const cardRefs = useRef({});
  const challengeAdvertRef = useRef(null);
  const teamsheetCardRef = useRef(null);
  const longPressTimersRef = useRef({});

  useEffect(() => {
    const handleScroll = () => setHeaderScrolled(window.scrollY > 6);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stateMarker = { tkSquadsPage: true, ts: Date.now() };
    window.history.pushState(stateMarker, "");
    const handlePopState = () => onBack?.();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onBack]);

  useEffect(() => {
    setLocalLeagueTeams(normalizeIncomingTeams(teams));
  }, [teams]);

  useEffect(() => {
    const normalized = normalizeIncomingTeams(fiveVFiveTeams);
    const challengeIsActive = isGuestChallengeSlotMode(normalized);
    const guest = normalized.find((team) => team.id === GUEST_OPPONENT_SLOT_ID);
    const turf = normalized.find((team) => team.id === TURF_KINGS_SLOT_ID);

    setLocalFiveVFiveTeams((prev) => {
      if (!normalized.length) {
        return prev?.length ? prev : buildDefaultFiveVFiveTeams();
      }

      return normalized;
    });

    setGuestOpponentEnabled(challengeIsActive);

    if (challengeIsActive && guest) {
      setGuestOpponentName(guest.label || DEFAULT_GUEST_OPPONENT_NAME);
      setGuestOpponentPlayers(Array.isArray(guest.players) ? guest.players : []);
      setGuestOpponentColorName(guest.teamColorName || "Gold");
      setChallengeDate(guest.challengeDate || todayChallengeDateText());
      setChallengeKickoff(guest.challengeKickoff || "18:30");
      setChallengeVenue(guest.challengeVenue || "Venue to be confirmed");
    }

    if (challengeIsActive && turf) {
      setTurfKingsChallengePlayers(Array.isArray(turf.players) ? turf.players : []);
      setTurfKingsChallengeColorName(turf.teamColorName || "Green");
    }
  }, [fiveVFiveTeams]);



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
        .filter(
          (fixture) =>
            fixture?.source === "club_challenge"
        );

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
        }) ||
        sortedFixtures[0] ||
        fixtures[0] ||
        null;

      
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
          .filter((item) => item.fixtureStatus === "awaiting_fixture_creation");

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

    const unsubPending = onSnapshot(
      getPendingSignupsCollection(db, activeClubId),
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
      getMatchSignupsCollection(db, activeClubId),
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
  }, [activeClubId]);

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
    if (!nextTeamsheetWeekId) return [];

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
          : resolvePlayerIdFromString(allPlayers, playerName) || playerId;

      if (!resolvedId) return;

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
  }, [signupRecords, nextTeamsheetWeekId, playersById, allPlayers]);


  const activePlayers = useMemo(
    () => allPlayers.filter((p) => (p.status || "active") === "active"),
    [allPlayers]
  );

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
    return normalized.length === 2 ? normalized : buildDefaultFiveVFiveTeams();
  }, [localFiveVFiveTeams]);

  useEffect(() => {
    if (!activeChallengeFixture) return;

    setGuestOpponentEnabled(true);
    setGuestOpponentName(activeChallengeFixture.awayClubName || "Opponent");
    setChallengeDate(activeChallengeFixture.proposedDate || todayChallengeDateText());
    setChallengeKickoff(activeChallengeFixture.proposedKickoff || "18:30");
    setChallengeVenue(activeChallengeFixture.venue || "Venue to be confirmed");
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

  const hasActiveGuestChallenge = Boolean(
    isFiveVFive && guestOpponentEnabled && activeChallengeFixture
  );

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
    localLeagueTeams,
  ]);

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
      window.alert("Fixture was created visually, but could not be saved to Firebase.");
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

  const handleCancelChallenge = async () => {
    if (!canEdit || !activeChallengeFixture?.fixtureId) return;

    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            `Cancel the challenge between ${resolvedHomeClubName} and ${resolvedAwayClubName}? The opponent club will be notified.`
          )
        : true;

    if (!ok) return;

    const reason =
      typeof window !== "undefined"
        ? window.prompt("Reason for cancelling the challenge:", "")
        : "";

    if (reason === null) return;

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

      setActiveChallengeFixture(null);
      setGuestOpponentEnabled(false);

      const normalTeams = restoreNormalFriendlyTeamsFromSlots(localFiveVFiveTeams);
      setLocalFiveVFiveTeams(normalTeams);
      onUpdateFiveVFiveTeams?.(normalTeams);
    } catch (err) {
      console.error("[Squads] Could not cancel challenge:", err);
      window.alert("Could not cancel this challenge.");
    }
  };

  const handleTeamLabelChange = (teamId, value) => {
    if (!canEdit) return;
    setSourceTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, label: value } : t))
    );
  };

  const handleTeamAbbrevChange = (teamId, value) => {
    if (!canEdit) return;
    const next = normalizeAbbrev(value);
    setSourceTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, abbrev: next } : t))
    );
  };

  const handleTeamColorNameChange = (teamId, value) => {
    if (!canEdit) return;

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
    if (!canEdit) return;
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

  const ensurePlayerInDb = async (canonicalFullNameOrName) => {
    const fullName = toTitleCase(canonicalFullNameOrName);
    if (!fullName) return null;

    const existing = allPlayers.find((p) => {
      const candidates = buildIdentityStrings({ ...p, id: p.id });
      return candidates.includes(fullName.toLowerCase());
    });
    if (existing) return existing.id;

    const newId = slugFromName(fullName);
    await setDoc(
      getPlayerDoc(db, newId, activeClubId),
      {
        fullName,
        name: fullName.split(" ")[0] || fullName,
        shortName: fullName.split(" ")[0] || fullName,
        aliases: [fullName],
        status: "active",
        roles: { player: true, captain: false, admin: false, coach: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return newId;
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
        const createdId = await ensurePlayerInDb(chosenId);
        if (!createdId) return;
        chosenId = createdId;
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

    const legacyLabel = toTitleCase(playerIdOrLegacy);
    const createdId = await ensurePlayerInDb(legacyLabel);

    setSourceTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const nextPlayers = (t.players || []).filter((pid) => pid !== playerIdOrLegacy);
        return { ...t, players: nextPlayers };
      })
    );

    if (!createdId) {
      console.warn("[Squads] Could not create player doc for:", legacyLabel);
    }
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
      window.alert("You cannot terminate your own membership from this page.");
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
      return `Invalid abbreviation for "${badAbbrev.label || badAbbrev.id}". Use exactly 3 letters (A–Z).`;
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
    if (saveCode.trim() !== MASTER_CODE) {
      setSaveError("Invalid admin code.");
      return;
    }

    const cleanOne = (list) =>
      list.map((t) => {
        const label = String(t.label || "").trim();
        const abbrev = normalizeAbbrev(t.abbrev || "");
        const teamColorName = toTitleCase(t.teamColorName || "");
        const typedHex = normalizeHexColor(t.teamColorHex || "");
        const derivedTheme = getThemeFromColorName(teamColorName);
        const teamColorHex = derivedTheme?.accent || (isValidHexColor(typedHex) ? typedHex : "");
        return { ...t, label, abbrev, teamColorHex, teamColorName };
      });

    const cleanedLeagueTeams = cleanOne(localLeagueTeams);
    const cleanedFiveVFiveTeams = cleanOne(
      hasActiveGuestChallenge
        ? buildCurrentSlotChallengeTeams({ enabled: true })
        : localFiveVFiveTeams
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

    onUpdateTeams?.(
      cleanedLeagueTeams.map((t) => ({
        ...t,
        captain: t.captainId ? displayShortOf(t.captainId) : t.captain || "",
      }))
    );

    onUpdateFiveVFiveTeams?.(
      cleanedFiveVFiveTeams.map((t) => ({
        ...t,
        captain: t.captainId ? displayShortOf(t.captainId) : t.captain || "",
      }))
    );

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
        window.alert("Could not save this squad card as an image.");
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
        window.alert("Could not save the challenge advert.");
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
    if (!canEdit) return;
    setPreviewPickTarget({ teamId, slotIndex });
  };

  const handlePreviewPickPlayer = (playerId) => {
    if (!canEdit || !previewPickTarget || !playersById.has(playerId)) return;

    const { teamId, slotIndex } = previewPickTarget;

    setSourceTeams((prev) =>
      prev.map((team) => {
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
    if (!canEdit || !playersById.has(playerId)) return;

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

    if (team.id === TURF_KINGS_SLOT_ID) return "Dark";
    if (team.id === GUEST_OPPONENT_SLOT_ID) return "Light";

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
      window.alert("Could not save the teamsheet card as an image.");
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
      window.alert("Could not save the available paid players card as an image.");
    }
  };


  const teamsheetDisplayDate = useMemo(() => {
    if (!nextTeamsheetWeekId) return "Upcoming game";

    const d = new Date(`${nextTeamsheetWeekId}T12:00:00`);
    if (Number.isNaN(d.getTime())) return nextTeamsheetWeekId;

    return d.toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, [nextTeamsheetWeekId]);


  useEffect(() => {
    const adminIsEditingPreview = Boolean(showSquadPreview) && Boolean(isAdmin);
    onSquadPreviewEditingChange?.(adminIsEditingPreview);

    return () => {
      onSquadPreviewEditingChange?.(false);
    };
  }, [showSquadPreview, isAdmin, onSquadPreviewEditingChange]);

  const renderAvailablePaidPlayersCard = () => {
    const remainingPaidPlayers = paidTeamSheetPlayers.filter((p) => !assignedIds.has(p.id));

    if (!remainingPaidPlayers.length) return null;

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
              <img src={activeClub?.logoUrl || TURF_KINGS_LOGO_URL} alt="" />
              <div>
                <span>{activeClubName || "Club"}</span>
                <small>Available paid players</small>
              </div>
            </div>

            <strong>{teamsheetDisplayDate}</strong>
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
    const matchTeams = sourceTeams.slice(0, 2);

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

        <div ref={teamsheetCardRef} className="teamsheet-card">
          <div className="teamsheet-card-head">
            <div className="teamsheet-card-club">
              <img
                src={activeClub?.logoUrl || TURF_KINGS_LOGO_URL}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <div>
                <span>{activeClubName || "Club"}</span>
                <small>5 Asides Near Me</small>
              </div>
            </div>

            <strong>{teamsheetDisplayDate}</strong>
          </div>

          <div className="teamsheet-card-grid">
            {matchTeams.map((team) => {
              const theme = getTeamTheme(team);
              const players = Array.isArray(team.players) ? team.players : [];

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
                    <div>
                      <h4>{getPreviewTeamName(team)}</h4>
                      <p>
                        Wear: <strong>{team.teamColorName || theme.colorName || "Team colour"}</strong>
                      </p>
                    </div>
                    <span>{team.abbrev || ""}</span>
                  </div>

                  <ol>
                    {players.length ? (
                      players.map((pid) => (
                        <li key={`teamsheet-${team.id}-${pid}`}>
                          {displayNameOf(pid)}
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

    return (
      <div className="squad-preview-grid">
        {sourceTeams.map((team) => {
          const theme = getTeamTheme(team);
          const players = Array.isArray(team.players) ? team.players : [];

          return (
            <div
              key={`preview-${team.id}`}
              className="squad-preview-pitch-card"
              style={{
                "--team-accent": theme.accent,
                "--team-accent-soft": theme.accentSoft,
                "--team-glow": theme.glow,
              }}
            >
              <div className="squad-preview-team-head">
                <span className="squad-preview-team-dot" />
                <div>
                  <h4>{getPreviewTeamName(team)}</h4>
                  <p>{players.length}/{playersPerSide} selected</p>

                  {canEdit ? (
                    <select
                      className="squad-preview-colour-select"
                      value={team.teamColorName || (team.id === TURF_KINGS_SLOT_ID ? "Black" : "White")}
                      onChange={(event) => handleTeamColorNameChange(team.id, event.target.value)}
                      title="Shirt colour to wear"
                    >
                      <option value="Black">⚫ Wear black</option>
                      <option value="White">⚪ Wear white</option>
                      <option value="Red">🔴 Wear red</option>
                      <option value="Blue">🔵 Wear blue</option>
                      <option value="Green">🟢 Wear green</option>
                      <option value="Yellow">🟡 Wear yellow</option>
                    </select>
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
                      title={canEdit ? "Tap to assign player" : "Read-only preview"}
                    >
                      <div className="squad-preview-shirt">
                        {pid ? String(label || "?").charAt(0).toUpperCase() : "+"}
                      </div>
                      <div className="squad-preview-label">
                        <strong>{label}{isCaptain ? " ⭐" : ""}</strong>
                        <span>{slot.label}</span>
                      </div>

                      {canEdit && pid ? (
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

      <header className="header">
        {playersLoading && (
          <p className="muted small">Loading players from database…</p>
        )}
        {playersError && <p className="error-text">{playersError}</p>}
        {!playersLoading && (
          <>
            <p className="muted small" style={{ marginBottom: "0.55rem" }}>
              Match setup: <strong>{matchTypeLabel} • {gameFormatLabel}</strong>
            </p>
            <p className="muted small">
              {isAdmin
                ? isFriendly
                  ? `Admin mode: edit Friendly ${gameFormatLabel} squads.`
                  : `Admin mode: edit League ${gameFormatLabel} squads.`
                : "View mode: squads are visible to everyone."}
            </p>

            {isAdmin && (
              <div className="squad-preview-launch-row">
                <button
                  type="button"
                  className="secondary-btn squad-preview-launch-btn"
                  onClick={() => setShowSquadPreview(true)}
                >
                  👁 Squad Shape Preview
                </button>
                <span className="muted small">
                  Quick visual check only. Final tactics stay in Lineups.
                </span>
              </div>
            )}
          </>
        )}
      </header>

      <section className="card">
        {isFiveVFive && guestOpponentEnabled && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.8rem",
              borderRadius: "16px",
              border: guestOpponentEnabled
                ? "1px solid rgba(34,197,94,0.32)"
                : "1px solid rgba(255,255,255,0.08)",
              background: guestOpponentEnabled
                ? "transparent"
                : "rgba(15,23,42,0.45)",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div className="muted small" style={{ fontWeight: 800 }}>
                Guest challenge
              </div>

              {isAdmin && !guestOpponentEnabled && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleTurnChallengeOn}
                >
                  Enable external opponent
                </button>
              )}

              {isAdmin && guestOpponentEnabled && (
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="primary-btn"
                    style={{
                      pointerEvents: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    Challenge on
                  </span>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={handleTakeChallengeDown}
                    title="Minimize challenge panel"
                    style={{
                      width: "2.4rem",
                      height: "2.4rem",
                      padding: 0,
                      borderRadius: "999px",
                    }}
                  >
                    ˄
                  </button>

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleCancelChallenge}
                    style={{
                      background: "linear-gradient(135deg, #dc2626, #991b1b)",
                      color: "#fff",
                      borderColor: "rgba(254,202,202,0.45)",
                    }}
                  >
                    Cancel challenge
                  </button>
                </div>
              )}
            </div>


            {isAdmin && acceptedChallengeCandidates.length > 0 && !guestOpponentEnabled && (
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid rgba(34,197,94,0.22)",
                  background:
                    "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(15,23,42,0.38))",
                  padding: "0.85rem",
                  display: "grid",
                  gap: "0.65rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: "#BBF7D0", fontWeight: 950, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.72rem" }}>
                      Accepted challenge ready
                    </div>
                    <div className="muted small">
                      Create a guest fixture here, then build both team sheets.
                    </div>
                  </div>
                </div>

                {acceptedChallengeCandidates.slice(0, 3).map((challenge) => {
                  const opponentName = getOpponentNameFromAcceptedChallenge(challenge);
                  return (
                    <div
                      key={challenge.acceptedChallengeDocId}
                      style={{
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(2,6,23,0.48)",
                        padding: "0.75rem",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <strong style={{ color: "#F8FAFC" }}>{opponentName}</strong>
                        <div className="muted small">
                          {(challenge.format || "5v5").toUpperCase()} • {challenge.proposedDate || "Date TBC"} • {challenge.proposedKickoff || "Kickoff TBC"}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => handleCreateSquadsFixtureFromChallenge(challenge)}
                      >
                        Create fixture
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {acceptedChallengesError && (
              <p className="error-text small">{acceptedChallengesError}</p>
            )}


            {guestOpponentEnabled && (
              <>
                {isAdmin && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: "0.65rem",
                      minWidth: 0,
                      width: "100%",
                    }}
                  >
                    <input
                      className="text-input"
                      value={guestOpponentName}
                      onChange={(e) => setGuestOpponentName(e.target.value)}
                      onBlur={() => persistSlotChallengeState({ nextGuestName: guestOpponentName })}
                      disabled={!canEdit}
                      placeholder="Opponent name"
                      style={{ width: "100%", boxSizing: "border-box", minWidth: 0 }}
                    />
                    <input
                      type="text"
                      className="text-input"
                      value={challengeDate}
                      onChange={(e) => setChallengeDate(e.target.value)}
                      onBlur={() => persistSlotChallengeState({ nextChallengeDate: challengeDate })}
                      disabled={!canEdit}
                      placeholder="17 May 2026"
                      title="Use a date like 17 May 2026"
                      style={{ width: "100%", boxSizing: "border-box", minWidth: 0 }}
                    />
                    <input
                      type="time"
                      className="text-input"
                      value={challengeKickoff}
                      onChange={(e) => setChallengeKickoff(e.target.value)}
                      onBlur={() => persistSlotChallengeState({ nextChallengeKickoff: challengeKickoff })}
                      disabled={!canEdit}
                      style={{ width: "100%", boxSizing: "border-box", minWidth: 0 }}
                    />
                    <input
                      className="text-input"
                      value={challengeVenue}
                      onChange={(e) => setChallengeVenue(e.target.value)}
                      onBlur={() => persistSlotChallengeState({ nextChallengeVenue: challengeVenue })}
                      disabled={!canEdit}
                      placeholder="Venue"
                      style={{ width: "100%", boxSizing: "border-box", minWidth: 0 }}
                    />
                  </div>
                )}

                <div
                  ref={challengeAdvertRef}
                  style={{
                    borderRadius: "20px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background:
                      `radial-gradient(circle at top left, ${getTeamTheme(turfKingsChallengeTeam).glow}, transparent 35%), radial-gradient(circle at bottom right, ${getTeamTheme(guestOpponentTeam).glow}, transparent 38%), linear-gradient(135deg, #06122A, #0F172A 55%, #14532D)`,
                    padding: "1rem",
                    display: "grid",
                    gap: "0.8rem",
                  }}
                >
                  <div
                    style={{
                      textAlign: "center",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#BBF7D0",
                      fontSize: "0.82rem",
                    }}
                  >
                    Friendly Challenge Match
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr",
                      gap: "0.75rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ textAlign: "center", display: "grid", gap: "0.45rem" }}>
                      <div
                        style={{
                          width: "74px",
                          height: "74px",
                          borderRadius: "22px",
                          margin: "0 auto",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.18)",
                          display: "grid",
                          placeItems: "center",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={TURF_KINGS_LOGO_URL}
                          alt={activeClubName}
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      </div>
                      <strong style={{ color: "#F8FAFC" }}>{activeClubName}</strong>
                    </div>

                    <div
                      style={{
                        fontSize: "1.7rem",
                        fontWeight: 950,
                        color: "#FDE68A",
                      }}
                    >
                      VS
                    </div>

                    <div style={{ textAlign: "center", display: "grid", gap: "0.45rem" }}>
                      {resolvedAwayClubLogo ? (
                        <img
                          src={resolvedAwayClubLogo}
                          alt={`${resolvedAwayClubName || "Opponent"} logo`}
                          style={{
                            width: "4.2rem",
                            height: "4.2rem",
                            objectFit: "contain",
                            display: "block",
                            margin: "0 auto",
                            borderRadius: "18px",
                            background: "rgba(255,255,255,0.92)",
                            padding: "0.35rem",
                            boxShadow: "0 14px 34px rgba(0,0,0,0.28)",
                          }}
                        />
                      ) : (
                        <GeneratedOpponentCrest
                          name={resolvedAwayClubName || "Opponent"}
                          theme={getTeamTheme(guestOpponentTeam)}
                        />
                      )}
                      <strong style={{ color: "#F8FAFC" }}>
                        {resolvedAwayClubName || "Opponent"}
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: "center",
                      color: "#CBD5E1",
                      fontWeight: 700,
                      fontSize: "0.92rem",
                    }}
                  >
                    <div>{gameFormatLabel} • One-off Friendly</div>
                    <div style={{ color: "#FDE68A", fontSize: "1rem", marginTop: "0.25rem" }}>
                      {formattedChallengeDate}
                    </div>
                    <div style={{ fontSize: "0.88rem", marginTop: "0.2rem" }}>
                      Kick Off: {
                        activeChallengeFixture?.proposedKickoff ||
                        challengeKickoff ||
                        "18:30"
                      }
                      • Venue: {
                        activeChallengeFixture?.venue ||
                        challengeVenue ||
                        "Venue TBD"
                      }
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={handleSaveChallengeAdvert}
                    style={{ width: "100%" }}
                  >
                    Save advert
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="squads-grid">
          {sourceTeams.map((team) => {
            const inputId = team.id;
            const listId = `players-db-${resolvedGameFormat}-${inputId}`;
            const capOptions = captainOptionsForTeam(team);
            const currentCapId =
              team.captainId && playersById.has(team.captainId)
                ? team.captainId
                : "";
            const cardId = `team-${resolvedGameFormat}-${team.id}`;
            const theme = getTeamTheme(team);
            const playerCount = Array.isArray(team.players) ? team.players.length : 0;
            const teamReady = playerCount >= playersPerSide;
            const playerCountText = `${playerCount}/${playersPerSide}`;
            const isGuestTeamCard = guestOpponentEnabled && team.id === GUEST_OPPONENT_SLOT_ID;
            const isChallengeTeamCard = guestOpponentEnabled && team.id === TURF_KINGS_SLOT_ID;

            return (
              <React.Fragment key={`team-fragment-${resolvedGameFormat}-${team.id}`}>
                {renderCardShell(
                  cardId,
                  team.label,
                  theme,
                  <>
                    <div className="squad-card-topbar">
                      <div className="team-name-wrap">
                        <span className="team-color-pill" />
                        <div>
                          <div className="team-title-row">
                            <h2 className="team-title">
                              {getPreviewTeamName(team)}
                            </h2>
                            {team.abbrev ? (
                              <span className="team-abbrev-badge">{team.abbrev}</span>
                            ) : null}
                          </div>
                          {isAdmin && (
                            <div className="team-subtitle">
                              {isGuestTeamCard
                                ? "Temporary opponent"
                                : isChallengeTeamCard
                                ? "Database players"
                                : <>Captain: {captainTagText(team) || "—"}</>}
                            </div>
                          )}
                          <div className="team-color-name" style={{ display: "inline-flex", alignItems: "center", gap: "0.38rem" }}>
                            <TeamShirtIcon color={theme.accent} size={18} />
                            <span className="team-color-dot" />
                            {theme.colorName}
                          </div>
                          <div
                            className="muted small"
                            style={{
                              marginTop: "0.25rem",
                              fontWeight: 800,
                              color: teamReady ? "#86efac" : "#fde68a",
                            }}
                          >
                            Players: {playerCountText} • {teamReady ? "Ready" : "Needs players"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (isGuestTeamCard || isChallengeTeamCard) && (
                      <div className="team-config">
                        <div className="field-row-top-spaced">
                          <input
                            className="text-input"
                            value={
                              isChallengeTeamCard
                                ? turfKingsChallengeColorName
                                : isGuestTeamCard
                                ? guestOpponentColorName
                                : team.teamColorName || ""
                            }
                            placeholder="Team color name"
                            onChange={(e) =>
                              handleTeamColorNameChange(team.id, e.target.value)
                            }
                            onBlur={() => {
                              if (guestOpponentEnabled && team.id === TURF_KINGS_SLOT_ID) {
                                persistSlotChallengeState({
                                  nextTurfKingsColorName: turfKingsChallengeColorName,
                                });
                              }

                              if (guestOpponentEnabled && team.id === GUEST_OPPONENT_SLOT_ID) {
                                persistSlotChallengeState({
                                  nextGuestColorName: guestOpponentColorName,
                                });
                              }
                            }}
                            disabled={!canEdit}
                          />
                        </div>
                      </div>
                    )}

                    {isAdmin && !isGuestTeamCard && !isChallengeTeamCard && (
                      <div className="team-config">
                        <div className="field-row-inline">
                          <input
                            className="text-input"
                            value={team.label || ""}
                            placeholder="Team name"
                            onChange={(e) =>
                              handleTeamLabelChange(team.id, e.target.value)
                            }
                            disabled={!canEdit}
                          />
                          <input
                            className="text-input team-abbrev-input"
                            value={team.abbrev || ""}
                            placeholder="ABC"
                            title="3-letter abbreviation (A–Z)"
                            onChange={(e) =>
                              handleTeamAbbrevChange(team.id, e.target.value)
                            }
                            disabled={!canEdit}
                          />
                        </div>

                        <div className="field-row-top-spaced">
                          <input
                            className="text-input"
                            value={team.teamColorName || ""}
                            placeholder="Team color name e.g. Black or White"
                            onChange={(e) =>
                              handleTeamColorNameChange(team.id, e.target.value)
                            }
                            disabled={!canEdit}
                          />
                        </div>

                        {team.abbrev && !isValidAbbrev(team.abbrev) && canEdit && (
                          <p className="muted small squad-note">
                            Abbrev must be exactly 3 letters (A–Z), e.g. DRK / LGT / LIV
                          </p>
                        )}

                        {team.teamColorName && canEdit && (
                          <p className="muted small squad-note">
                            Enter a simple color name like Black, White, Red, Blue, Gold, Green, Purple or Pink.
                          </p>
                        )}

                        <div className="field-row field-row-top-spaced">
                          <label className="muted small field-label-tight">
                            Captain
                          </label>
                          <select
                            className="text-input"
                            value={currentCapId}
                            onChange={(e) =>
                              handleCaptainChange(team.id, e.target.value)
                            }
                            disabled={!canEdit || capOptions.length === 0}
                          >
                            <option value="">
                              {capOptions.length === 0
                                ? "Add players to pick a captain"
                                : "Select captain…"}
                            </option>
                            {capOptions.map((pid) => (
                              <option key={`${team.id}-captain-${pid}`} value={pid}>
                                {displayNameOf(pid)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    
<div className="club-pool-clean-list">
  {unseededPlayers.length ? (
    unseededPlayers.map((pid, index) => {
      const playerName = displayNameOf(pid);
      const canDelete =
        isAdmin &&
        pid !== identity?.playerId &&
        pid !== identity?.uid;

      return (
        <div
          key={`pool-clean-${pid}`}
          className="club-pool-clean-row"
        >
          <div className="club-pool-clean-left">
            <span className="club-pool-clean-number">
              {index + 1}
            </span>

            <span className="club-pool-clean-name">
              {playerName}
            </span>
          </div>

          {canDelete ? (
            <button
              type="button"
              className="club-pool-remove-btn"
              onClick={() => handleDeletePlayerRequest(pid)}
            >
              Remove
            </button>
          ) : null}
        </div>
      );
    })
  ) : (
    <div className="club-pool-empty">
      No remaining registered players.
    </div>
  )}
</div>


                    {isAdmin && (
                      <div className="squad-safe-hint">
                        Build this team from the player pool above. No manual typing for registered club players.
                      </div>
                    )}
                  </>
                )}
              </React.Fragment>
            );
          })}

        </div>

        {renderTeamsheetCard()}

        {renderAvailablePaidPlayersCard()}


          {renderCardShell(
            `${gameFormat}-${UNSEEDED_ID}`,
            "unseeded_players",
            {
              accent: "#64748B",
              accentSoft: "rgba(100,116,139,0.16)",
              glow: "rgba(100,116,139,0.18)",
              text: "#CBD5E1",
              colorName: "Slate",
            },
            <>
              <div className="squad-card-topbar">
                <div className="team-name-wrap">
                  <span className="team-color-pill" />
                  <div>
                    <div className="team-title-row">
                      <h2 className="team-title">Club player pool</h2>
                      <span className="team-abbrev-badge">POOL</span>
                    </div>
                    <div className="team-subtitle">
                      {unseededPlayers.length} not currently assigned
                    </div>
                    <div className="team-color-name" style={{ display: "inline-flex", alignItems: "center", gap: "0.38rem" }}>
                      <TeamShirtIcon color="#64748B" size={18} />
                      <span className="team-color-dot" />
                      Slate
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: "0.75rem",
                  marginBottom: showUnseededPlayers ? "0.75rem" : 0,
                }}
              >
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowUnseededPlayers((current) => !current)}
                  style={{
                    width: "100%",
                    maxWidth: "260px",
                    borderRadius: "999px",
                  }}
                >
                  {showUnseededPlayers
                    ? `Hide player pool (${unseededPlayers.length})`
                    : `Show player pool (${unseededPlayers.length})`}
                </button>
              </div>

              {showUnseededPlayers && (
                <>
              
<div className="club-pool-clean-list">
  {unseededPlayers.length ? (
    unseededPlayers.map((p, index) => {
      const isSelf =
        String(p.id || "").toLowerCase() === String(identity?.playerId || "").toLowerCase() ||
        String(p.id || "").toLowerCase() === String(identity?.memberId || "").toLowerCase();

      return (
        <div key={`club-pool-${p.id}`} className="club-pool-clean-row">
          <div className="club-pool-clean-left">
            <span className="club-pool-clean-number">{index + 1}</span>
            <span className="club-pool-clean-name">{displayNameOf(p.id)}</span>
          </div>

          {isAdmin && !isSelf ? (
            <button
              type="button"
              className="club-pool-remove-btn"
              onClick={() => handleRequestRemoveUnseeded(p.id)}
            >
              Remove
            </button>
          ) : null}
        </div>
      );
    })
  ) : (
    <div className="club-pool-empty">No remaining registered players.</div>
  )}
</div>


              {isAdmin && (
                <div className="squad-safe-hint">
                  Backup club member list. Use only for late walk-ins or membership cleanup.
                </div>
              )}
                </>
              )}
            </>
          )}

        <div className="actions-row">
          <button
            className="secondary-btn set-squad-pulse-btn"
            onClick={() => setShowSquadPreview(true)}
          >
            Set Squad
          </button>
          {isAdmin && (
            <button className="primary-btn" onClick={handleSaveClick}>
              Save Squads
            </button>
          )}
        </div>
      </section>

      {isAdmin && showSquadPreview && (
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

      {isAdmin && showSaveModal && (
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