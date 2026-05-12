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
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { getPlayersCollection, getPlayerDoc } from "../core/clubFirestorePaths.js";
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
const DEFAULT_GUEST_OPPONENT_NAME = "Canal Walk";
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

  if (key.includes("blue") || key.includes("navy")) {
    return themeFromAccent("#2563EB", "Blue");
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

function isGuestOpponentTeam(team) {
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
  ]).filter((team) => !isGuestOpponentTeam(team));

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
  challengeVenue = "Canal Walk 5s Arena",
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

function restoreNormalFriendlyTeamsFromSlots(teams = []) {
  const defaults = buildDefaultFiveVFiveTeams();
  const normalized = normalizeIncomingTeams(teams);
  const dark = normalized.find((team) => team.id === TURF_KINGS_SLOT_ID);
  const light = normalized.find((team) => team.id === GUEST_OPPONENT_SLOT_ID);

  return [
    {
      ...defaults[0],
      players: Array.isArray(dark?.players) ? dark.players : [],
      captainId: dark?.captainId || null,
      captain: dark?.captain || "",
    },
    {
      ...defaults[1],
      players: [],
      captainId: null,
      captain: "",
    },
  ];
}


/* ---------------- Component ---------------- */

export function SquadsPage({
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
  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");
  const [showUnseededPlayers, setShowUnseededPlayers] = useState(false);
  const [pendingDeletePlayerId, setPendingDeletePlayerId] = useState("");
  const [deletePlayerError, setDeletePlayerError] = useState("");
  const [acceptedChallengeCandidates, setAcceptedChallengeCandidates] = useState([]);
  const [acceptedChallengesError, setAcceptedChallengesError] = useState("");

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
    existingGuestTeam?.challengeVenue || "Canal Walk 5s Arena"
  );
  const [turfKingsChallengePlayers, setTurfKingsChallengePlayers] = useState(() =>
    Array.isArray(existingTurfKingsChallengeTeam?.players)
      ? existingTurfKingsChallengeTeam.players
      : []
  );

  const [savingCardId, setSavingCardId] = useState("");
  const cardRefs = useRef({});
  const challengeAdvertRef = useRef(null);
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

    setLocalFiveVFiveTeams(
      normalized.length === 2 ? normalized : buildDefaultFiveVFiveTeams()
    );

    setGuestOpponentEnabled(challengeIsActive);

    if (challengeIsActive && guest) {
      setGuestOpponentName(guest.label || DEFAULT_GUEST_OPPONENT_NAME);
      setGuestOpponentPlayers(Array.isArray(guest.players) ? guest.players : []);
      setGuestOpponentColorName(guest.teamColorName || "Gold");
      setChallengeDate(guest.challengeDate || todayChallengeDateText());
      setChallengeKickoff(guest.challengeKickoff || "18:30");
      setChallengeVenue(guest.challengeVenue || "Canal Walk 5s Arena");
    }

    if (challengeIsActive && turf) {
      setTurfKingsChallengePlayers(Array.isArray(turf.players) ? turf.players : []);
      setTurfKingsChallengeColorName(turf.teamColorName || "Green");
    }
  }, [fiveVFiveTeams]);


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

  const turfKingsChallengeTeam = useMemo(() => {
    const teamsForChallenge = buildSlotBasedChallengeTeams({
      baseTeams: baseFriendlyTeams,
      turfKingsPlayers: turfKingsChallengePlayers,
      guestPlayers: guestOpponentPlayers,
      guestName: guestOpponentName,
      activeClubName,
      turfKingsColorName: turfKingsChallengeColorName,
      guestColorName: guestOpponentColorName,
      challengeDate,
      challengeKickoff,
      challengeVenue,
    });
    return teamsForChallenge[0];
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

  const guestOpponentTeam = useMemo(() => {
    const teamsForChallenge = buildSlotBasedChallengeTeams({
      baseTeams: baseFriendlyTeams,
      turfKingsPlayers: turfKingsChallengePlayers,
      guestPlayers: guestOpponentPlayers,
      guestName: guestOpponentName,
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

  const sourceTeams = useMemo(() => {
    if (isFiveVFive && guestOpponentEnabled) {
      return [turfKingsChallengeTeam, guestOpponentTeam];
    }

    return isFiveVFive ? baseFriendlyTeams : localLeagueTeams;
  }, [
    isFiveVFive,
    guestOpponentEnabled,
    turfKingsChallengeTeam,
    guestOpponentTeam,
    baseFriendlyTeams,
    localLeagueTeams,
  ]);

  const setSourceTeams = (updater) => {
    if (isFiveVFive && guestOpponentEnabled) {
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
        list.push(`${pid} | ${displayNameOf(pid)}`);
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

    try {
      await updateDoc(
        doc(db, "clubs", activeClubId, "acceptedChallenges", challenge.acceptedChallengeDocId),
        {
          fixtureStatus: "created_on_squads_page",
          squadFixtureCreatedAt: serverTimestamp(),
          squadFixtureCreatedAtMs: Date.now(),
        }
      );
    } catch (err) {
      console.error("[Squads] Could not mark challenge fixture as created:", err);
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

    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            "Take down the special challenge and return to normal Dark vs Light friendly squads?"
          )
        : true;

    if (!ok) return;

    setGuestOpponentEnabled(false);
    const normalTeams = restoreNormalFriendlyTeamsFromSlots(localFiveVFiveTeams);
    setLocalFiveVFiveTeams(normalTeams);
    onUpdateFiveVFiveTeams?.(normalTeams);
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

    if (guestOpponentEnabled && teamId === TURF_KINGS_SLOT_ID) {
      setTurfKingsChallengeColorName(value);
      return;
    }

    if (guestOpponentEnabled && teamId === GUEST_OPPONENT_SLOT_ID) {
      setGuestOpponentColorName(value);
      return;
    }

    setSourceTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, teamColorName: value } : t))
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

    if (targetTeam && isGuestOpponentTeam(targetTeam)) {
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
    if (targetTeam && isGuestOpponentTeam(targetTeam)) {
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

  const handleRequestRemoveUnseeded = (playerId) => {
    if (!canEdit) return;
    if (!playersById.has(playerId)) return;

    const name = displayNameOf(playerId);
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            `Remove ${name} from this club database?\nThey will disappear from the unseeded pool.`
          )
        : true;
    if (!ok) return;


    setPendingDeletePlayerId(playerId);
    setDeletePlayerError("");
  };

  const handleCancelDeletePlayer = () => {
    setPendingDeletePlayerId("");
    setDeletePlayerError("");
  };

  const handleConfirmDeletePlayer = async () => {
    if (!canEdit) return;
    if (!pendingDeletePlayerId) return;
    if (!playersById.has(pendingDeletePlayerId)) return;


    try {
      await deleteDoc(getPlayerDoc(db, pendingDeletePlayerId, activeClubId));
      handleCancelDeletePlayer();
    } catch (err) {
      console.error("[Squads] Error deleting player from DB:", err);
      setDeletePlayerError(
        "Could not delete this player from the database. Please try again."
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
        const teamColorHex = isValidHexColor(typedHex)
          ? typedHex
          : derivedTheme?.accent || "";
        return { ...t, label, abbrev, teamColorHex, teamColorName };
      });

    const cleanedLeagueTeams = cleanOne(localLeagueTeams);
    const cleanedFiveVFiveTeams = cleanOne(
      isFiveVFive && guestOpponentEnabled
        ? buildCurrentSlotChallengeTeams({ enabled: true })
        : restoreNormalFriendlyTeamsFromSlots(localFiveVFiveTeams)
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
    const dateObj = parseChallengeDateLoose(challengeDate);
    if (!dateObj || Number.isNaN(dateObj.getTime())) {
      return challengeDate || "Match date to be confirmed";
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

  const renderCardShell = (cardId, label, theme, children) => (
    <div
      className={`squad-surface ${savingCardId === cardId ? "saving" : ""}`}
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
          </>
        )}
      </header>

      <section className="card">
        {isFiveVFive && (
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
                  Use guest opponent
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
                    style={{
                      borderColor: "rgba(248,113,113,0.45)",
                      color: "#fecaca",
                    }}
                  >
                    Take down
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
                      <GeneratedOpponentCrest
                        name={guestOpponentTeam.label || "Canal Walk"}
                        theme={getTeamTheme(guestOpponentTeam)}
                      />
                      <strong style={{ color: "#F8FAFC" }}>
                        {guestOpponentTeam.label || "Canal Walk"}
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
                      Kick Off: {challengeKickoff || "18:30"} • Venue: {challengeVenue || "Canal Walk 5s Arena"}
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
                            <h2 className="team-title">{team.label}</h2>
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

                    <ul className="player-list">
                      {(team.players || []).map((pid, idx) => {
                        const label = isGuestTeamCard ? toTitleCase(pid) : displayNameOf(pid);
                        const isCaptain =
                          !isGuestTeamCard && team.captainId && playersById.has(team.captainId)
                            ? team.captainId === pid
                            : false;

                        return (
                          <li
                            key={`${resolvedGameFormat}-${team.id}-${pid}-${idx}`}
                            className="player-row"
                          >
                            <div className="player-row-left">
                              <span className="player-number">{idx + 1}</span>
                              <span className="player-name-text">
                                {label}{" "}
                                {isCaptain ? <span className="muted">(C)</span> : null}
                              </span>
                            </div>

                            {isAdmin && (
                              <button
                                className="link-btn"
                                onClick={() => handleRemovePlayer(team.id, pid)}
                              >
                                remove
                              </button>
                            )}
                          </li>
                        );
                      })}

                      {(team.players || []).length === 0 && (
                        <li className="player-row muted small">
                          <div className="player-row-left">
                            <span className="player-number">0</span>
                            <span className="player-name-text">
                              {isGuestTeamCard
                                ? "Type opponent players below."
                                : isChallengeTeamCard
                                ? `Add ${activeClubName} players from database.`
                                : "No players yet in this squad."}
                            </span>
                          </div>
                        </li>
                      )}
                    </ul>

                    {isAdmin && (
                      <>
                        <div className="add-player-row">
                          <input
                            className="text-input"
                            placeholder={isGuestTeamCard ? "Type guest player name..." : "Add / select player..."}
                            list={isGuestTeamCard ? undefined : listId}
                            value={pendingNames[inputId] || ""}
                            onChange={(e) =>
                              handlePendingChange(inputId, e.target.value)
                            }
                          />
                          {!isGuestTeamCard && (
                            <datalist id={listId}>
                              {availableForTeams.map((val) => (
                                <option key={`${team.id}-available-${val}`} value={val} />
                              ))}
                            </datalist>
                          )}

                          <button
                            className="secondary-btn"
                            onClick={() => handleAddPlayer(inputId)}
                          >
                            Add
                          </button>
                        </div>

                        {addErrors[inputId] && (
                          <p className="error-text small">{addErrors[inputId]}</p>
                        )}
                      </>
                    )}
                  </>
                )}
              </React.Fragment>
            );
          })}

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
                      <h2 className="team-title">Unseeded Players</h2>
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
                    ? `Hide unseeded players (${unseededPlayers.length})`
                    : `Show unseeded players (${unseededPlayers.length})`}
                </button>
              </div>

              {showUnseededPlayers && (
                <>
              <ul className="player-list">
                {unseededPlayers.map((p, idx) => {
                  const name = displayNameOf(p.id);
                  const roles = p.roles || {};
                  return (
                    <li key={`${gameFormat}-unseeded-${p.id}`} className="player-row">
                      <div className="player-row-left">
                        <span className="player-number">{idx + 1}</span>
                        <span className="player-name-text">
                          {name}{" "}
                          {roles.captain ? <span className="muted">(C)</span> : null}
                          {roles.coach ? <span className="muted"> (Coach)</span> : null}
                          {roles.admin ? <span className="muted"> (Admin)</span> : null}
                        </span>
                      </div>

                      {isAdmin && (
                        <button
                          className="link-btn"
                          onClick={() => handleRequestRemoveUnseeded(p.id)}
                        >
                          ❌ delete?
                        </button>
                      )}
                    </li>
                  );
                })}

                {unseededPlayers.length === 0 && (
                  <li className="player-row muted small">
                    <div className="player-row-left">
                      <span className="player-number">0</span>
                      <span className="player-name-text">
                        No unseeded players right now.
                      </span>
                    </div>
                  </li>
                )}
              </ul>

              {isAdmin && (
                <>
                  <div className="add-player-row">
                    <input
                      className="text-input"
                      placeholder="Move from team / add manual player..."
                      list={`players-db-unseeded-${gameFormat}`}
                      value={pendingNames[UNSEEDED_ID] || ""}
                      onChange={(e) =>
                        handlePendingChange(UNSEEDED_ID, e.target.value)
                      }
                    />
                    <datalist id={`players-db-unseeded-${gameFormat}`}>
                      {availableForUnseeded.map((val) => (
                        <option key={`unseeded-available-${gameFormat}-${val}`} value={val} />
                      ))}
                    </datalist>

                    <button
                      className="secondary-btn"
                      onClick={() => handleAddPlayer(UNSEEDED_ID)}
                    >
                      Add
                    </button>
                  </div>

                  {addErrors[UNSEEDED_ID] && (
                    <p className="error-text small">{addErrors[UNSEEDED_ID]}</p>
                  )}
                </>
              )}
                </>
              )}
            </>
          )}
        </div>

        <div className="actions-row">
          <button className="secondary-btn" onClick={onBack}>
            Back
          </button>
          {isAdmin && (
            <button className="primary-btn" onClick={handleSaveClick}>
              Save Squads
            </button>
          )}
        </div>
      </section>

      {isAdmin && pendingDeletePlayerId && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Delete player from database?</h3>
            <p>
              You are about to permanently remove
              <strong> {displayNameOf(pendingDeletePlayerId)} </strong>
              from the ${activeClubName} player database.
            </p>
            <p className="error-text">
              Warning: this is not the same as moving a player to Unseeded.
              Only delete if this player was added by mistake or should no longer
              exist in the database.
            </p>

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
                Yes, delete player
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