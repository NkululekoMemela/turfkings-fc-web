// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { EntryPage } from "./pages/EntryPage.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { LiveMatchPage } from "./pages/LiveMatchPage.jsx";
import { StatsPage } from "./pages/StatsPage.jsx";
import { SquadsPage } from "./pages/SquadsPage.jsx";
import { FormationsPage } from "./pages/FormationsPage.jsx";
import { SpectatorPage } from "./pages/SpectatorPage.jsx";
import { NewsPage } from "./pages/NewsPage.jsx";
import { PlayerCardPage } from "./pages/PlayerCardPage.jsx";
import { PeerReviewPage } from "./pages/PeerReviewPage.jsx";
import { MigrationPage } from "./pages/MigrationPage.jsx";
import MatchSignupPage from "./pages/MatchSignupPage.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";

import {
  loadState,
  saveState,
  createDefaultState,
  loadStateV2,
  saveStateV2,
  createDefaultStateV2,
} from "./storage/gameRepository.js";

import { computeNextFromResult } from "./core/rotation.js";
import {
  subscribeToState,
  subscribeToStateV2,
} from "./storage/firebaseRepository.js";
import { usePeerRatings } from "./hooks/usePeerRatings.js";
import { useMembers } from "./hooks/useMembers.js";
import { buildCleanSheetEventsForMatch } from "./core/lineups.js";

import {
  buildCurrentMatchFromFixture,
  computeScheduledPlan,
  findNearestValidTarget,
  getFirstPendingFixture,
  markScheduledFixtureCompleted,
} from "./core/scheduledFixtures.js";

import { db } from "./firebaseConfig.js";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";

// Page constants
const PAGE_ENTRY = "entry";
const PAGE_LANDING = "landing";
const PAGE_LIVE = "live";
const PAGE_STATS = "stats";
const PAGE_SQUADS = "squads";
const PAGE_FORMATIONS = "formations";
const PAGE_SPECTATOR = "spectator";
const PAGE_NEWS = "news";
const PAGE_PLAYER_CARDS = "player-cards";
const PAGE_PEER_REVIEW = "peer-review";
const PAGE_MIGRATION = "migration";
const PAGE_MATCH_SIGNUP = "match-signup";
const PAGE_PAYMENT = "payment";

const MASTER_CODE = "3333";
const MATCH_SECONDS = 5 * 60;

const USE_V2 = true;

const IS_STAGING =
  String(import.meta.env.VITE_USE_STAGING || "").trim().toLowerCase() ===
  "true";

/* ---------------- Identity helpers ---------------- */

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
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
  const explicitName = toTitleCaseLoose(
    team.teamColorName || team.colorName || ""
  );

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

  if (
    key.includes("man u") ||
    key.includes("manu") ||
    key.includes("man united") ||
    key.includes("manchester united")
  ) {
    return themeFromAccent("#DC2626", "Red Shirt", "#FECACA");
  }

  if (key.includes("madrid") || key.includes("real madrid")) {
    return themeFromAccent("#F8FAFC", "White Shirt", "#F8FAFC");
  }

  if (key.includes("psg") || key.includes("paris")) {
    return themeFromAccent("#0F172A", "Black Shirt", "#CBD5E1");
  }

  return themeFromAccent("#22C55E", "Green", "#BBF7D0");
}

function getParticipationTeamTheme(team, teamIndex) {
  const baseTheme = getTeamTheme(team);
  if (baseTheme) {
    const normalizedAccent = normalizeHexColor(baseTheme.accent || "");
    const isBlack =
      safeLower(baseTheme.colorName || "").includes("black") ||
      normalizedAccent === "#0F172A" ||
      normalizedAccent === "#000000";

    return {
      accent: baseTheme.accent,
      border: hexToRgba(baseTheme.accent, 0.34),
      background: `linear-gradient(180deg, ${hexToRgba(baseTheme.accent, 0.10)}, rgba(15,23,42,0.86))`,
      soft: hexToRgba(baseTheme.accent, 0.14),
      glow: baseTheme.glow,
      text: baseTheme.text,
      colorName: baseTheme.colorName || "",
      isBlack,
    };
  }

  const fallbackThemes = [
    {
      accent: "#38bdf8",
      border: "rgba(56,189,248,0.34)",
      background:
        "linear-gradient(180deg, rgba(56,189,248,0.10), rgba(15,23,42,0.86))",
      soft: "rgba(56,189,248,0.14)",
      glow: "rgba(56,189,248,0.24)",
      text: "#E5E7EB",
    },
    {
      accent: "#22c55e",
      border: "rgba(34,197,94,0.34)",
      background:
        "linear-gradient(180deg, rgba(34,197,94,0.10), rgba(15,23,42,0.86))",
      soft: "rgba(34,197,94,0.14)",
      glow: "rgba(34,197,94,0.24)",
      text: "#BBF7D0",
    },
    {
      accent: "#facc15",
      border: "rgba(250,204,21,0.34)",
      background:
        "linear-gradient(180deg, rgba(250,204,21,0.10), rgba(15,23,42,0.86))",
      soft: "rgba(250,204,21,0.14)",
      glow: "rgba(250,204,21,0.24)",
      text: "#FDE68A",
    },
  ];

  return {
    ...fallbackThemes[teamIndex % fallbackThemes.length],
    colorName: "",
    isBlack: false,
  };
}


function getStoredRole(identity) {
  const role = String(identity?.actingRole || identity?.role || "spectator")
    .trim()
    .toLowerCase();

  if (
    role === "admin" ||
    role === "captain" ||
    role === "player" ||
    role === "spectator"
  ) {
    return role;
  }

  return "spectator";
}

function ensureIdentityShape(identity) {
  if (!identity || typeof identity !== "object") return null;

  const storedRole = getStoredRole(identity);

  return {
    ...identity,
    role: identity.role || storedRole,
    actingRole: identity.actingRole || storedRole,
  };
}

function getIdentityCandidateStrings(identity) {
  if (!identity || typeof identity !== "object") return [];

  const values = [
    identity.memberId,
    identity.playerId,
    identity.shortName,
    identity.fullName,
    identity.displayName,
    identity.name,
    identity.playerName,
    identity.email,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const expanded = [];

  values.forEach((value) => {
    expanded.push(value);
    expanded.push(toTitleCaseLoose(value));

    const first = String(value).trim().split(/\s+/)[0] || "";
    if (first) expanded.push(first);
  });

  return Array.from(new Set(expanded.map((v) => safeLower(v)).filter(Boolean)));
}

function getTeamCaptainCandidateStrings(team = {}) {
  const values = [
    team?.captainId,
    team?.captain,
    team?.captainName,
    team?.captainEmail,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      values
        .flatMap((value) => {
          const first = String(value).trim().split(/\s+/)[0] || "";
          return [value, toTitleCaseLoose(value), first];
        })
        .map((v) => safeLower(v))
        .filter(Boolean)
    )
  );
}

function isCaptainFromTeams(identity, teams = []) {
  const identityKeys = getIdentityCandidateStrings(identity);
  if (identityKeys.length === 0) return false;

  return (teams || []).some((team) => {
    const captainKeys = getTeamCaptainCandidateStrings(team);
    if (captainKeys.length === 0) return false;

    return captainKeys.some((key) => identityKeys.includes(key));
  });
}

function deriveActiveRole(identity, teams = []) {
  const storedRole = getStoredRole(identity);
  const isDynamicCaptain = isCaptainFromTeams(identity, teams);

  if (storedRole === "spectator" && !isDynamicCaptain) return "spectator";
  if (storedRole === "admin") return "admin";
  if (isDynamicCaptain || storedRole === "captain") return "captain";

  return "player";
}

/* ---------------- State helpers ---------------- */

function ensureSeasonSchedulingShape(season) {
  if (!season || typeof season !== "object") return season;

  return {
    ...season,
    gameFormat: season?.gameFormat || "5_V_5",
    matchMode: season?.matchMode || "round_robin",
    scheduledTarget:
      Number.isInteger(Number(season?.scheduledTarget))
        ? Number(season.scheduledTarget)
        : null,
    scheduledFixtures: Array.isArray(season?.scheduledFixtures)
      ? season.scheduledFixtures
      : [],
  };
}

function ensureV2StateShape(s) {
  const fallback = createDefaultStateV2();
  if (!s || typeof s !== "object") return fallback;

  const activeSeasonId =
    s.activeSeasonId || s.seasons?.[0]?.seasonId || fallback.activeSeasonId;

  const seasons =
    Array.isArray(s.seasons) && s.seasons.length
      ? s.seasons.map(ensureSeasonSchedulingShape)
      : fallback.seasons.map(ensureSeasonSchedulingShape);

  return {
    ...fallback,
    ...s,
    activeSeasonId,
    seasons,
    playerPhotosByName: s.playerPhotosByName || {},
    yearEndAttendance: s.yearEndAttendance || [],
  };
}

function getActiveSeasonFromV2State(v2State) {
  const safe = ensureV2StateShape(v2State);
  const season =
    safe.seasons.find((x) => x?.seasonId === safe.activeSeasonId) ||
    safe.seasons[0];
  return { safeV2: safe, activeSeason: season };
}

function nextSeasonIdFromExisting(seasons) {
  const safe = Array.isArray(seasons) ? seasons : [];
  const maxNo = safe.reduce((acc, s) => {
    const n = Number(s?.seasonNo);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);

  const newSeasonNo = maxNo + 1;
  return { seasonId: `2026-S${newSeasonNo}`, seasonNo: newSeasonNo };
}

function buildUpdatedResultFromEvents(result, eventsForSeason) {
  if (!result) return result;

  const matchNo = Number(result?.matchNo);
  const safeEvents = Array.isArray(eventsForSeason) ? eventsForSeason : [];

  const goalsA = safeEvents.filter(
    (e) =>
      Number(e?.matchNo) === matchNo &&
      e?.type === "goal" &&
      e?.teamId === result?.teamAId
  ).length;

  const goalsB = safeEvents.filter(
    (e) =>
      Number(e?.matchNo) === matchNo &&
      e?.type === "goal" &&
      e?.teamId === result?.teamBId
  ).length;

  let winnerId = null;
  let isDraw = false;

  if (goalsA === goalsB) {
    isDraw = true;
  } else if (goalsA > goalsB) {
    winnerId = result?.teamAId ?? null;
  } else {
    winnerId = result?.teamBId ?? null;
  }

  return {
    ...result,
    goalsA,
    goalsB,
    winnerId,
    isDraw,
  };
}

/* ---------------- Participation helpers ---------------- */

function getPlayerDisplayNameFromTeamEntry(entry) {
  if (typeof entry === "string") return toTitleCaseLoose(entry);
  if (!entry || typeof entry !== "object") return "";
  return toTitleCaseLoose(
    entry.fullName ||
      entry.displayName ||
      entry.shortName ||
      entry.name ||
      entry.playerName ||
      ""
  );
}

function getPlayerShortNameFromTeamEntry(entry) {
  if (typeof entry === "string") {
    const pretty = toTitleCaseLoose(entry);
    return pretty.split(/\s+/)[0] || pretty;
  }
  if (!entry || typeof entry !== "object") return "";
  return toTitleCaseLoose(
    entry.shortName ||
      entry.name ||
      entry.displayName ||
      entry.fullName ||
      entry.playerName ||
      ""
  );
}

function getPlayerIdFromTeamEntry(entry) {
  if (typeof entry === "string") {
    const pretty = toTitleCaseLoose(entry);
    return slugFromLooseName(pretty);
  }

  if (!entry || typeof entry !== "object") return "";

  const direct = entry.playerId || entry.memberId || entry.id || entry.uid || "";
  if (String(direct || "").trim()) return String(direct).trim();

  const fallbackName = getPlayerDisplayNameFromTeamEntry(entry);
  return fallbackName ? slugFromLooseName(fallbackName) : "";
}

function buildMemberLookup(members = []) {
  const lookup = new Map();

  const add = (key, member) => {
    const k = safeLower(key);
    if (!k) return;
    if (!lookup.has(k)) lookup.set(k, member);
  };

  (Array.isArray(members) ? members : []).forEach((member) => {
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

      const first = String(v).trim().split(/\s+/)[0] || "";
      if (first) add(first, member);
    });
  });

  return lookup;
}

function resolveMemberFromEntry(entry, memberLookup) {
  if (!memberLookup || !(memberLookup instanceof Map)) return null;

  const candidates = [];

  if (typeof entry === "string") {
    const pretty = toTitleCaseLoose(entry);
    candidates.push(entry, pretty, slugFromLooseName(pretty));
    const first = pretty.split(/\s+/)[0] || "";
    if (first) candidates.push(first);
  } else if (entry && typeof entry === "object") {
    const values = [
      entry.playerId,
      entry.memberId,
      entry.id,
      entry.uid,
      entry.fullName,
      entry.shortName,
      entry.displayName,
      entry.name,
      entry.playerName,
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);

    values.forEach((v) => {
      candidates.push(v, toTitleCaseLoose(v), slugFromLooseName(v));
      const first = v.split(/\s+/)[0] || "";
      if (first) candidates.push(first);
    });
  }

  for (const candidate of candidates) {
    const hit = memberLookup.get(safeLower(candidate));
    if (hit) return hit;
  }

  return null;
}

function normalizeTeamPlayersForParticipation(team, memberLookup) {
  const rawPlayers = Array.isArray(team?.players) ? team.players : [];
  const seen = new Set();
  const out = [];

  rawPlayers.forEach((entry) => {
    const matchedMember = resolveMemberFromEntry(entry, memberLookup);

    const playerId = matchedMember
      ? String(
          matchedMember.id ||
            matchedMember.memberId ||
            matchedMember.playerId ||
            getPlayerIdFromTeamEntry(entry)
        ).trim()
      : getPlayerIdFromTeamEntry(entry);

    const playerName = matchedMember
      ? toTitleCaseLoose(
          matchedMember.fullName ||
            matchedMember.displayName ||
            matchedMember.shortName ||
            matchedMember.name ||
            matchedMember.playerName ||
            ""
        )
      : getPlayerDisplayNameFromTeamEntry(entry);

    const shortName = matchedMember
      ? toTitleCaseLoose(
          matchedMember.shortName ||
            matchedMember.name ||
            matchedMember.displayName ||
            matchedMember.fullName ||
            ""
        )
      : getPlayerShortNameFromTeamEntry(entry);

    if (!playerId || !playerName) return;
    if (seen.has(playerId)) return;
    seen.add(playerId);

    out.push({
      playerId,
      playerName,
      shortName: shortName || playerName,
    });
  });

  return out;
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

function buildParticipationEntryKey(teamId, playerId) {
  return `${String(teamId || "").trim()}__${String(playerId || "").trim()}`;
}

function buildDefaultParticipationEntries({
  teams = [],
  results = [],
  members = [],
}) {
  const safeTeams = Array.isArray(teams) ? teams : [];
  const safeResults = Array.isArray(results) ? results : [];
  const memberLookup = buildMemberLookup(members);
  const matchCounts = countTeamMatches(safeResults);

  const out = [];

  safeTeams.forEach((team) => {
    const teamId = team?.id || "";
    if (!teamId) return;

    const teamName = team?.label || teamId;
    const players = normalizeTeamPlayersForParticipation(team, memberLookup);
    const squadSize = players.length;
    const teamMatches = matchCounts[teamId] || 0;
    const expectedFullMatches = computeExpectedFullMatches(teamMatches, squadSize);

    players.forEach((player) => {
      out.push({
        key: buildParticipationEntryKey(teamId, player.playerId),
        playerId: player.playerId,
        playerName: player.playerName,
        shortName: player.shortName || player.playerName,
        teamId,
        teamName,
        squadSize,
        teamMatches,
        expectedFullMatches,
        matchesPlayed: expectedFullMatches,
      });
    });
  });

  return out;
}

async function saveParticipationForMatchDay({
  seasonId,
  seasonNo,
  matchDayId,
  createdAtISO,
  playerAppearances,
}) {
  const safeSeasonId = String(seasonId || "").trim();
  const safeMatchDayId = String(matchDayId || "").trim();

  if (!safeSeasonId || !safeMatchDayId) return;

  const safeAppearances = Array.isArray(playerAppearances)
    ? playerAppearances
    : [];

  const batch = writeBatch(db);

  safeAppearances.forEach((entry) => {
    const attendanceDocId = `${safeMatchDayId}__${entry.playerId}`;
    const attendanceRef = doc(
      db,
      "seasons",
      safeSeasonId,
      "attendance",
      attendanceDocId
    );

    const teamMatches = Number(entry.teamMatches || 0);
    const expectedFullMatches = Number(entry.expectedFullMatches || 0);
    const matchesPlayed = Number(entry.matchesPlayed || 0);

    batch.set(
      attendanceRef,
      {
        seasonId: safeSeasonId,
        seasonNo: Number(seasonNo || 1),
        matchDayId: safeMatchDayId,
        playerId: entry.playerId,
        playerName: entry.playerName,
        shortName: entry.shortName || entry.playerName,
        teamId: entry.teamId,
        teamName: entry.teamName,
        squadSize: Number(entry.squadSize || 0),
        teamMatches,
        expectedFullMatches,
        matchesPlayed,
        participationRate:
          expectedFullMatches > 0 ? matchesPlayed / expectedFullMatches : 0,
        source: "end_match_day_confirmed_participation",
        createdAtISO,
        updatedAtISO: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();
}

export default function App() {
  const [page, setPage] = useState(PAGE_ENTRY);

  const [identity, setIdentity] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("tk_identity_v1");
      return raw ? ensureIdentityShape(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });

  const members = useMembers();

  const handleEntryComplete = (payload) => {
    const safePayload = ensureIdentityShape(payload);
    setIdentity(safePayload);

    if (typeof window !== "undefined") {
      if (safePayload) {
        window.localStorage.setItem(
          "tk_identity_v1",
          JSON.stringify(safePayload)
        );
      } else {
        window.localStorage.removeItem("tk_identity_v1");
      }
    }

    setPage(PAGE_LANDING);
  };

  const [state, setState] = useState(() =>
    USE_V2 ? loadStateV2() : loadState()
  );

  const activeSeasonIdForPeerRatings = USE_V2
    ? ensureV2StateShape(state)?.activeSeasonId || null
    : null;

  const peerRatingsFromHook = usePeerRatings(activeSeasonIdForPeerRatings);
  const peerRatingsByPlayer = peerRatingsFromHook || {};

  const [statsReturnPage, setStatsReturnPage] = useState(PAGE_LANDING);
  const [paymentContext, setPaymentContext] = useState(null);
  const [smartOffset, setSmartOffset] = useState(() => {
    if (typeof window === "undefined") return 5;
    try {
      const raw = window.localStorage.getItem("tk_smart_offset_v1");
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
    } catch {
      return 5;
    }
  });

  const [secondsLeft, setSecondsLeft] = useState(MATCH_SECONDS);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [hasLiveMatch, setHasLiveMatch] = useState(false);

  const [pendingMatchStartContext, setPendingMatchStartContext] = useState(
    null
  );
  const [currentConfirmedLineupSnapshot, setCurrentConfirmedLineupSnapshot] =
    useState(null);
  const [confirmedLineupsByMatchNo, setConfirmedLineupsByMatchNo] = useState(
    {}
  );

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState("");
  const [pendingParticipationEntries, setPendingParticipationEntries] = useState(
    []
  );
  const [isBackupModalMobile, setIsBackupModalMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 520;
  });

  const [showEndSeasonModal, setShowEndSeasonModal] = useState(false);
  const [endSeasonCode, setEndSeasonCode] = useState("");
  const [endSeasonError, setEndSeasonError] = useState("");
  const [showSeasonCompleteModal, setShowSeasonCompleteModal] = useState(false);
  const [seasonCompleteDismissedKey, setSeasonCompleteDismissedKey] = useState(null);

  const updateState = (updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (USE_V2) {
        const safe = ensureV2StateShape(next);
        saveStateV2(safe);
        return safe;
      }
      saveState(next);
      return next;
    });
  };

  const updateActiveSeason = (seasonUpdater) => {
    updateState((prev) => {
      const safePrev = ensureV2StateShape(prev);
      const seasons = safePrev.seasons.map((s) => {
        if (!s) return s;
        if (s.seasonId !== safePrev.activeSeasonId) return s;
        const updated =
          typeof seasonUpdater === "function" ? seasonUpdater(s) : seasonUpdater;
        return { ...s, ...updated, updatedAt: new Date().toISOString() };
      });
      return { ...safePrev, seasons, updatedAt: new Date().toISOString() };
    });
  };

  useEffect(() => {
    const unsubscribe = (USE_V2 ? subscribeToStateV2 : subscribeToState)(
      (cloudState) => {
        if (!cloudState) return;
        if (USE_V2) setState(ensureV2StateShape(cloudState));
        else setState(cloudState);
      }
    );
    return () => unsubscribe && unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("tk_smart_offset_v1", String(smartOffset));
    } catch {
      // ignore localStorage failures
    }
  }, [smartOffset]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleResize = () => {
      setIsBackupModalMobile(window.innerWidth <= 520);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  let teams,
    currentMatchNo,
    currentMatch,
    currentEvents,
    results,
    allEvents,
    streaks,
    matchDayHistory,
    playerPhotosByName,
    yearEndAttendance;

  let safeV2ForStats = null;
  let activeSeasonNo = 1;
  let activeSeasonId = null;
  let gameFormat = "5_V_5";
  let matchMode = "round_robin";
  let scheduledTarget = null;
  let scheduledFixtures = [];

  if (USE_V2) {
    const { safeV2, activeSeason } = getActiveSeasonFromV2State(state);
    safeV2ForStats = safeV2;

    const fallbackSeason =
      safeV2?.seasons?.[0] || createDefaultStateV2().seasons[0];
    activeSeasonId = safeV2?.activeSeasonId || fallbackSeason?.seasonId || null;
    const s = ensureSeasonSchedulingShape(activeSeason || fallbackSeason);

    teams = s?.teams || [];
    currentMatchNo = s?.currentMatchNo || 1;
    currentMatch = s?.currentMatch || null;
    currentEvents = s?.currentEvents || [];
    results = s?.results || [];
    allEvents = s?.allEvents || [];
    streaks = s?.streaks || {};
    matchDayHistory = s?.matchDayHistory || [];
    activeSeasonNo = Number(s?.seasonNo || 1);
    gameFormat = s?.gameFormat || "5_V_5";
    matchMode = s?.matchMode || "round_robin";
    scheduledTarget =
      Number.isInteger(Number(s?.scheduledTarget)) ? Number(s.scheduledTarget) : null;
    scheduledFixtures = Array.isArray(s?.scheduledFixtures)
      ? s.scheduledFixtures
      : [];

    playerPhotosByName = safeV2.playerPhotosByName || {};
    yearEndAttendance = safeV2.yearEndAttendance || [];
  } else {
    const legacy = state || createDefaultState();

    ({
      teams,
      currentMatchNo,
      currentMatch,
      currentEvents,
      results,
      allEvents,
      streaks,
      matchDayHistory = [],
      playerPhotosByName = {},
      yearEndAttendance = [],
    } = legacy || createDefaultState());

    gameFormat = legacy?.gameFormat || "5_V_5";
    matchMode = legacy?.matchMode || "round_robin";
    scheduledTarget =
      Number.isInteger(Number(legacy?.scheduledTarget))
        ? Number(legacy.scheduledTarget)
        : null;
    scheduledFixtures = Array.isArray(legacy?.scheduledFixtures)
      ? legacy.scheduledFixtures
      : [];
  }

  const activeRole = useMemo(
    () => deriveActiveRole(identity, teams || []),
    [identity, teams]
  );

  const isAdmin = activeRole === "admin";
  const isCaptain = activeRole === "captain";
  const isPlayer = activeRole === "player";
  const isSpectator = activeRole === "spectator";

  const canStartMatch = isAdmin || isCaptain;
  const canManageSquads = true;
  const canPreviewPreviousSeasonUI = IS_STAGING && isAdmin;

  const archivedResultsFromHistory = (matchDayHistory || []).flatMap(
    (day) => day?.results || []
  );
  const archivedEventsFromHistory = (matchDayHistory || []).flatMap(
    (day) => day?.allEvents || []
  );
  const hasFirebaseHistory = (matchDayHistory || []).length > 0;

  const fullResults = [...archivedResultsFromHistory, ...(results || [])];
  const fullEvents = [...archivedEventsFromHistory, ...(allEvents || [])];

  const fullSeasonEventsForStats = [
    ...archivedEventsFromHistory,
    ...(allEvents || []),
  ];

  const teamPlayedCounts = useMemo(() => {
    const counts = Object.fromEntries((teams || []).map((team) => [team.id, 0]));

    (fullResults || []).forEach((result) => {
      if (result?.teamAId && counts[result.teamAId] != null) {
        counts[result.teamAId] += 1;
      }
      if (result?.teamBId && counts[result.teamBId] != null) {
        counts[result.teamBId] += 1;
      }
    });

    return counts;
  }, [teams, fullResults]);

  const currentMaxP = useMemo(() => {
    const values = Object.values(teamPlayedCounts || {});
    return values.length ? Math.max(...values) : 0;
  }, [teamPlayedCounts]);

  const normalizedSmartOffset = useMemo(() => {
    const n = Number(smartOffset);
    return Number.isFinite(n) && n >= 0 ? n : 5;
  }, [smartOffset]);

  const smartStartTarget = useMemo(() => {
    return currentMaxP + normalizedSmartOffset;
  }, [currentMaxP, normalizedSmartOffset]);

  const smartTargetResult = useMemo(() => {
    if (!Array.isArray(teams) || teams.length !== 3) {
      return { target: null, plan: null };
    }

    return findNearestValidTarget({
      teams,
      results: fullResults,
      minTarget: smartStartTarget,
      maxLookAhead: 40,
    });
  }, [teams, fullResults, smartStartTarget]);

  const smartTarget = smartTargetResult?.target ?? null;

  const hasPendingScheduledFixture = useMemo(() => {
    return (scheduledFixtures || []).some((fixture) => !fixture?.completed);
  }, [scheduledFixtures]);

  const hasRecordedMatchDayState = useMemo(() => {
    return (
      hasLiveMatch ||
      running ||
      (Array.isArray(currentEvents) && currentEvents.length > 0) ||
      (Array.isArray(results) && results.length > 0) ||
      (Array.isArray(allEvents) && allEvents.length > 0)
    );
  }, [hasLiveMatch, running, currentEvents, results, allEvents]);

  const isSeasonTargetReached = useMemo(() => {
    if (matchMode !== "scheduled_target") return false;
    if (!Number.isFinite(Number(scheduledTarget))) return false;

    const values = Object.values(teamPlayedCounts || {});
    if (!values.length) return false;

    return values.every((value) => Number(value) >= Number(scheduledTarget));
  }, [matchMode, scheduledTarget, teamPlayedCounts]);

  const seasonCompletionKey = useMemo(() => {
    return `${activeSeasonId || "legacy"}::${scheduledTarget || "none"}`;
  }, [activeSeasonId, scheduledTarget]);

  const shouldLockFurtherFixtures =
    isSeasonTargetReached && !hasPendingScheduledFixture;

  useEffect(() => {
    if (!shouldLockFurtherFixtures) return;
    if (hasLiveMatch || running) return;
    if (seasonCompleteDismissedKey === seasonCompletionKey) return;
    setShowSeasonCompleteModal(true);
  }, [
    shouldLockFurtherFixtures,
    hasLiveMatch,
    running,
    seasonCompleteDismissedKey,
    seasonCompletionKey,
  ]);

  useEffect(() => {
    console.log("[TK DEBUG] Match mode state", {
      matchMode,
      scheduledTarget,
      scheduledFixturesCount: scheduledFixtures.length,
      currentResultsCount: (results || []).length,
      archivedResultsCount: archivedResultsFromHistory.length,
      fullResultsCount: fullResults.length,
    });
  }, [
    matchMode,
    scheduledTarget,
    scheduledFixtures.length,
    results,
    archivedResultsFromHistory.length,
    fullResults.length,
  ]);

  useEffect(() => {
    if (!running) return;
    if (secondsLeft <= 0) return;

    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          setTimeUp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [running, secondsLeft]);

  const handleGoToStats = (fromPage) => {
    setStatsReturnPage(fromPage);
    setPage(PAGE_STATS);
  };

  const handleBackToLanding = () => setPage(PAGE_LANDING);
  const handleBackToLive = () => setPage(PAGE_LIVE);
  const handleGoToMatchSignup = () => setPage(PAGE_MATCH_SIGNUP);

  const handleUpdatePairing = (match) => {
    if (!canStartMatch) {
      window.alert("Only captains or admin can update the pairing.");
      return;
    }

    if (matchMode === "scheduled_target") {
      window.alert(
        "Manual pairing changes are locked while Fixtured mode is active."
      );
      return;
    }

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentMatch: match,
      }));
      return;
    }

    updateState((prev) => ({ ...prev, currentMatch: match }));
  };

  const handleUpdateSmartOffset = (nextValue) => {
    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) {
      setSmartOffset(5);
      return;
    }
    setSmartOffset(Math.max(0, Math.round(numeric)));
  };

  const handleSetGameFormat = (nextFormat) => {
    const safeFormat =
      nextFormat === "3_TEAM_LEAGUE" ? "3_TEAM_LEAGUE" : "5_V_5";

    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const nextSeason = {
          ...prevSeason,
          gameFormat: safeFormat,
        };

        if (safeFormat === "5_V_5") {
          return {
            ...nextSeason,
            matchMode: "round_robin",
            scheduledTarget: null,
            scheduledFixtures: [],
          };
        }

        return nextSeason;
      });
      return;
    }

    updateState((prev) => {
      const nextState = {
        ...prev,
        gameFormat: safeFormat,
      };

      if (safeFormat === "5_V_5") {
        return {
          ...nextState,
          matchMode: "round_robin",
          scheduledTarget: null,
          scheduledFixtures: [],
        };
      }

      return nextState;
    });
  };

  const handleSetMatchMode = (nextMode) => {
    if (!USE_V2) return;
    if (gameFormat !== "3_TEAM_LEAGUE") return;

    if (running || hasLiveMatch) {
      window.alert("Finish or discard the live match before changing mode.");
      return;
    }

    const safeMode =
      nextMode === "scheduled_target" ? "scheduled_target" : "round_robin";

    updateActiveSeason((prevSeason) => {
      if (safeMode === "round_robin") {
        return {
          ...prevSeason,
          matchMode: "round_robin",
          scheduledTarget: null,
          scheduledFixtures: [],
        };
      }

      const seasonResults = [
        ...((prevSeason.matchDayHistory || []).flatMap((day) => day?.results || [])),
        ...(prevSeason.results || []),
      ];

      const counts = Object.fromEntries(
        (prevSeason.teams || []).map((team) => [team.id, 0])
      );

      seasonResults.forEach((r) => {
        if (r?.teamAId && counts[r.teamAId] != null) counts[r.teamAId] += 1;
        if (r?.teamBId && counts[r.teamBId] != null) counts[r.teamBId] += 1;
      });

      const maxP = Math.max(0, ...Object.values(counts));
      const desiredStart = maxP + normalizedSmartOffset;

      const nearest = findNearestValidTarget({
        teams: prevSeason.teams || [],
        results: seasonResults,
        minTarget: desiredStart,
        maxLookAhead: 40,
      });

      console.log("[FIXTURE DEBUG] handleSetMatchMode -> maxP =", maxP);
      console.log(
        "[FIXTURE DEBUG] handleSetMatchMode -> smart offset =",
        normalizedSmartOffset
      );
      console.log(
        "[FIXTURE DEBUG] handleSetMatchMode -> desired start target =",
        desiredStart
      );
      console.log(
        "[FIXTURE DEBUG] handleSetMatchMode -> nearest valid target =",
        nearest?.target ?? null
      );
      console.log(
        "[FIXTURE DEBUG] handleSetMatchMode -> team P counts =",
        (prevSeason.teams || []).map((team) => ({
          team: team.label,
          played: seasonResults.filter(
            (r) => r.teamAId === team.id || r.teamBId === team.id
          ).length,
        }))
      );

      if (!nearest?.plan?.ok || nearest?.target == null) {
        window.alert(
          "Could not find a reachable fixtured target from the current standings."
        );
        return {
          ...prevSeason,
          matchMode: "scheduled_target",
          scheduledTarget: null,
          scheduledFixtures: [],
        };
      }

      const firstFixture = getFirstPendingFixture(nearest.plan.fixtures);
      const nextCurrentMatch = buildCurrentMatchFromFixture(
        firstFixture,
        prevSeason.teams || []
      );

      return {
        ...prevSeason,
        matchMode: "scheduled_target",
        scheduledTarget: Number(nearest.target),
        scheduledFixtures: nearest.plan.fixtures,
        currentMatch: nextCurrentMatch || prevSeason.currentMatch,
      };
    });
  };

  const handleGenerateScheduledPlan = (target) => {
    if (!USE_V2) return;

    if (running || hasLiveMatch) {
      window.alert("Finish or discard the live match before generating fixtures.");
      return;
    }

    const safeTarget = Number(target);

    if (!Number.isFinite(safeTarget) || safeTarget <= 0) {
      window.alert("Please enter a valid target.");
      return;
    }

    const plan = computeScheduledPlan({
      teams,
      results: fullResults,
      target: safeTarget,
    });

    console.log("[FIXTURE DEBUG] target =", safeTarget);
    console.log("[FIXTURE DEBUG] fullResults length =", fullResults.length);
    console.log(
      "[FIXTURE DEBUG] team P counts from fullResults =",
      teams.map((team) => ({
        team: team.label,
        played: fullResults.filter(
          (r) => r.teamAId === team.id || r.teamBId === team.id
        ).length,
      }))
    );
    console.log("[FIXTURE DEBUG] pairCounts =", plan?.pairCounts || null);
    console.log("[FIXTURE DEBUG] generated fixtures =", plan?.fixtures || []);
    console.log(
      "[FIXTURE DEBUG] generated fixtures length =",
      plan?.fixtures?.length || 0
    );
    console.log(
      "[FIXTURE DEBUG] generated fixture labels =",
      (plan?.fixtures || []).map(
        (f, i) => `${i + 1}. ${f.teamALabel} vs ${f.teamBLabel}`
      )
    );

    if (!plan.ok) {
      window.alert(plan.reason || "Could not generate fixtured schedule.");
      return;
    }

    const firstFixture = getFirstPendingFixture(plan.fixtures);
    const nextCurrentMatch = buildCurrentMatchFromFixture(firstFixture, teams);

    updateActiveSeason((prevSeason) => ({
      ...prevSeason,
      matchMode: "scheduled_target",
      scheduledTarget: Number(safeTarget),
      scheduledFixtures: plan.fixtures,
      currentMatch: nextCurrentMatch || prevSeason.currentMatch,
    }));
  };

  const handleStartMatch = () => {
    if (!canStartMatch) {
      window.alert("Only captains or admin can start a match.");
      return;
    }

    if (shouldLockFurtherFixtures) {
      setShowSeasonCompleteModal(true);
      window.alert(
        "This fixtured season has reached its target. Please end the season before recording more matches."
      );
      return;
    }

    const startContext = {
      matchNo: currentMatchNo,
      createdAt: new Date().toISOString(),
      currentMatch,
      teams,
      identity,
      gameFormat,
      matchMode,
      scheduledTarget,
    };

    setPendingMatchStartContext(startContext);
    setSecondsLeft(MATCH_SECONDS);
    setTimeUp(false);
    setRunning(true);
    setHasLiveMatch(true);
    setPage(PAGE_LIVE);
  };

  const handleConfirmPreMatchLineups = (snapshot) => {
    const safeSnapshot = snapshot || null;
    setCurrentConfirmedLineupSnapshot(safeSnapshot);

    if (safeSnapshot) {
      setConfirmedLineupsByMatchNo((prev) => ({
        ...prev,
        [currentMatchNo]: safeSnapshot,
      }));
    }

    setPendingMatchStartContext(null);
  };

  const handleCancelPreMatchLineups = () => {
    setPendingMatchStartContext(null);
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(MATCH_SECONDS);
    setHasLiveMatch(false);
    setPage(PAGE_LANDING);
  };

  const handleGoToLiveAsSpectator = () => {
    if (canStartMatch) {
      setPage(PAGE_LIVE);
      return;
    }
    setPage(PAGE_SPECTATOR);
  };

  const handleGoToSquads = () => {
    setPage(PAGE_SQUADS);
  };

  const handleGoToFormations = () => setPage(PAGE_FORMATIONS);

  const handleAddEvent = (event) => {
    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentEvents: [...(prevSeason.currentEvents || []), event],
      }));
      return;
    }

    updateState((prev) => ({
      ...prev,
      currentEvents: [...prev.currentEvents, event],
    }));
  };

  const handleDeleteEvent = (index) => {
    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const copy = [...(prevSeason.currentEvents || [])];
        copy.splice(index, 1);
        return { ...prevSeason, currentEvents: copy };
      });
      return;
    }

    updateState((prev) => {
      const copy = [...prev.currentEvents];
      copy.splice(index, 1);
      return { ...prev, currentEvents: copy };
    });
  };

  const handleUndoLastEvent = () => {
    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const ev = prevSeason.currentEvents || [];
        if (ev.length === 0) return prevSeason;
        const copy = [...ev];
        copy.pop();
        return { ...prevSeason, currentEvents: copy };
      });
      return;
    }

    updateState((prev) => {
      if (prev.currentEvents.length === 0) return prev;
      const copy = [...prev.currentEvents];
      copy.pop();
      return { ...prev, currentEvents: copy };
    });
  };

  const handleConfirmEndMatch = (summary) => {
    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const { teamAId, teamBId, standbyId, goalsA, goalsB } = summary;

        const matchNo = prevSeason.currentMatchNo || 1;
        const isFixturedMode = prevSeason.matchMode === "scheduled_target";

        const verifiedLineups =
          currentConfirmedLineupSnapshot ||
          confirmedLineupsByMatchNo[matchNo] ||
          null;

        const committedEvents = (prevSeason.currentEvents || []).map((e) => ({
          ...e,
          matchNo,
        }));

        const cleanSheetEvents = buildCleanSheetEventsForMatch({
          matchNo,
          teamAId,
          teamBId,
          goalsA,
          goalsB,
          verifiedLineups,
        });

        const allCommittedEvents = [...committedEvents, ...cleanSheetEvents];

        const rotationResult = computeNextFromResult(prevSeason.streaks, {
          teamAId,
          teamBId,
          standbyId,
          goalsA,
          goalsB,
        });

        const newMatchNo = matchNo + 1;

        const newResult = {
          matchNo,
          teamAId,
          teamBId,
          standbyId,
          goalsA,
          goalsB,
          winnerId: rotationResult.winnerId,
          isDraw: rotationResult.isDraw,
          confirmedLineupSnapshot: verifiedLineups,
        };

        let nextScheduledFixtures = Array.isArray(prevSeason.scheduledFixtures)
          ? prevSeason.scheduledFixtures
          : [];

        let nextCurrentMatch = {
          teamAId: rotationResult.nextTeamAId,
          teamBId: rotationResult.nextTeamBId,
          standbyId: rotationResult.nextStandbyId,
        };

        if (isFixturedMode) {
          nextScheduledFixtures = markScheduledFixtureCompleted({
            fixtures: nextScheduledFixtures,
            teamAId,
            teamBId,
            matchNo,
            goalsA,
            goalsB,
          });

          console.log("[FIXTURE DEBUG] completed fixture", {
            matchNo,
            teamAId,
            teamBId,
            goalsA,
            goalsB,
          });
          console.log(
            "[FIXTURE DEBUG] nextScheduledFixtures after completion =",
            nextScheduledFixtures
          );

          const nextFixture = getFirstPendingFixture(nextScheduledFixtures);
          nextCurrentMatch =
            buildCurrentMatchFromFixture(nextFixture, prevSeason.teams) ||
            nextCurrentMatch;
        }

        return {
          ...prevSeason,
          currentMatchNo: newMatchNo,
          currentMatch: nextCurrentMatch,
          streaks: rotationResult.updatedStreaks,
          currentEvents: [],
          allEvents: [...(prevSeason.allEvents || []), ...allCommittedEvents],
          results: [...(prevSeason.results || []), newResult],
          scheduledFixtures: nextScheduledFixtures,
        };
      });

      setRunning(false);
      setTimeUp(false);
      setSecondsLeft(MATCH_SECONDS);
      setHasLiveMatch(false);
      setPendingMatchStartContext(null);
      setCurrentConfirmedLineupSnapshot(null);
      setPage(PAGE_LANDING);
      return;
    }

    updateState((prev) => {
      const { teamAId, teamBId, standbyId, goalsA, goalsB } = summary;

      const matchNo = prev.currentMatchNo;

      const verifiedLineups =
        currentConfirmedLineupSnapshot ||
        confirmedLineupsByMatchNo[matchNo] ||
        null;

      const committedEvents = prev.currentEvents.map((e) => ({
        ...e,
        matchNo,
      }));

      const cleanSheetEvents = buildCleanSheetEventsForMatch({
        matchNo,
        teamAId,
        teamBId,
        goalsA,
        goalsB,
        verifiedLineups,
      });

      const allCommittedEvents = [...committedEvents, ...cleanSheetEvents];

      const rotationResult = computeNextFromResult(prev.streaks, {
        teamAId,
        teamBId,
        standbyId,
        goalsA,
        goalsB,
      });

      const newMatchNo = prev.currentMatchNo + 1;

      const newResult = {
        matchNo,
        teamAId,
        teamBId,
        standbyId,
        goalsA,
        goalsB,
        winnerId: rotationResult.winnerId,
        isDraw: rotationResult.isDraw,
        confirmedLineupSnapshot: verifiedLineups,
      };

      return {
        ...prev,
        currentMatchNo: newMatchNo,
        currentMatch: {
          teamAId: rotationResult.nextTeamAId,
          teamBId: rotationResult.nextTeamBId,
          standbyId: rotationResult.nextStandbyId,
        },
        streaks: rotationResult.updatedStreaks,
        currentEvents: [],
        allEvents: [...prev.allEvents, ...allCommittedEvents],
        results: [...prev.results, newResult],
      };
    });

    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(MATCH_SECONDS);
    setHasLiveMatch(false);
    setPendingMatchStartContext(null);
    setCurrentConfirmedLineupSnapshot(null);
    setPage(PAGE_LANDING);
  };

  const handleDiscardMatchAndBack = () => {
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(MATCH_SECONDS);
    setHasLiveMatch(false);
    setPendingMatchStartContext(null);
    setCurrentConfirmedLineupSnapshot(null);

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentEvents: [],
      }));
    } else {
      updateState((prev) => ({ ...prev, currentEvents: [] }));
    }
    setPage(PAGE_LANDING);
  };

  const handleDeleteSavedMatch = (matchNoToDelete) => {
    if (!USE_V2) return;

    updateActiveSeason((prevSeason) => {
      const safeResults = Array.isArray(prevSeason?.results)
        ? prevSeason.results
        : [];
      const safeAllEvents = Array.isArray(prevSeason?.allEvents)
        ? prevSeason.allEvents
        : [];

      return {
        ...prevSeason,
        results: safeResults.filter(
          (r) => Number(r?.matchNo) !== Number(matchNoToDelete)
        ),
        allEvents: safeAllEvents.filter(
          (e) => Number(e?.matchNo) !== Number(matchNoToDelete)
        ),
      };
    });
  };

  const handleUpdateSavedEvent = (eventId, updatedFields) => {
    if (!USE_V2) return;

    updateActiveSeason((prevSeason) => {
      const safeAllEvents = Array.isArray(prevSeason?.allEvents)
        ? prevSeason.allEvents
        : [];
      const targetEvent = safeAllEvents.find(
        (e) => String(e?.id) === String(eventId)
      );
      if (!targetEvent) return prevSeason;

      const nextAllEvents = safeAllEvents.map((e) =>
        String(e?.id) === String(eventId)
          ? {
              ...e,
              ...updatedFields,
            }
          : e
      );

      const safeResults = Array.isArray(prevSeason?.results)
        ? prevSeason.results
        : [];
      const nextResults = safeResults.map((r) =>
        Number(r?.matchNo) === Number(targetEvent?.matchNo)
          ? buildUpdatedResultFromEvents(r, nextAllEvents)
          : r
      );

      return {
        ...prevSeason,
        allEvents: nextAllEvents,
        results: nextResults,
      };
    });
  };

  const handleDeleteSavedEvent = (eventId) => {
    if (!USE_V2) return;

    updateActiveSeason((prevSeason) => {
      const safeAllEvents = Array.isArray(prevSeason?.allEvents)
        ? prevSeason.allEvents
        : [];
      const targetEvent = safeAllEvents.find(
        (e) => String(e?.id) === String(eventId)
      );
      if (!targetEvent) return prevSeason;

      const nextAllEvents = safeAllEvents.filter(
        (e) => String(e?.id) !== String(eventId)
      );

      const safeResults = Array.isArray(prevSeason?.results)
        ? prevSeason.results
        : [];
      const nextResults = safeResults.map((r) =>
        Number(r?.matchNo) === Number(targetEvent?.matchNo)
          ? buildUpdatedResultFromEvents(r, nextAllEvents)
          : r
      );

      return {
        ...prevSeason,
        allEvents: nextAllEvents,
        results: nextResults,
      };
    });
  };

  const handleAddSavedEvent = (matchNo, eventData) => {
    if (!USE_V2) return;

    updateActiveSeason((prevSeason) => {
      const safeAllEvents = Array.isArray(prevSeason?.allEvents)
        ? prevSeason.allEvents
        : [];

      const newEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        matchNo: Number(matchNo),
        timeSeconds: Number(eventData?.timeSeconds ?? 0),
        scorer: eventData?.scorer ?? "",
        assist: eventData?.assist ?? null,
        type: eventData?.type ?? "goal",
        teamId: eventData?.teamId ?? null,
      };

      const nextAllEvents = [...safeAllEvents, newEvent];

      const safeResults = Array.isArray(prevSeason?.results)
        ? prevSeason.results
        : [];
      const nextResults = safeResults.map((r) =>
        Number(r?.matchNo) === Number(matchNo)
          ? buildUpdatedResultFromEvents(r, nextAllEvents)
          : r
      );

      return {
        ...prevSeason,
        allEvents: nextAllEvents,
        results: nextResults,
      };
    });
  };

  const handleDeleteCurrentEmptySeason = () => {
    if (!USE_V2) return;

    updateState((prev) => {
      const safePrev = ensureV2StateShape(prev);
      const { activeSeason } = getActiveSeasonFromV2State(safePrev);

      if (!activeSeason) return safePrev;

      const safeCurrentEvents = Array.isArray(activeSeason?.currentEvents)
        ? activeSeason.currentEvents
        : [];
      const safeResults = Array.isArray(activeSeason?.results)
        ? activeSeason.results
        : [];
      const safeAllEvents = Array.isArray(activeSeason?.allEvents)
        ? activeSeason.allEvents
        : [];
      const safeHistory = Array.isArray(activeSeason?.matchDayHistory)
        ? activeSeason.matchDayHistory
        : [];

      const isEmptySeason =
        safeCurrentEvents.length === 0 &&
        safeResults.length === 0 &&
        safeAllEvents.length === 0 &&
        safeHistory.length === 0;

      if (!isEmptySeason) {
        window.alert(
          "Only an empty test season can be deleted. This active season already has data."
        );
        return safePrev;
      }

      if ((safePrev.seasons || []).length <= 1) {
        window.alert("You cannot delete the only remaining season.");
        return safePrev;
      }

      const remainingSeasons = safePrev.seasons.filter(
        (s) => s?.seasonId !== safePrev.activeSeasonId
      );

      if (!remainingSeasons.length) {
        window.alert("No other season is available to switch back to.");
        return safePrev;
      }

      const sorted = [...remainingSeasons].sort(
        (a, b) => Number(a?.seasonNo || 0) - Number(b?.seasonNo || 0)
      );
      const fallbackSeason = sorted[sorted.length - 1];

      return {
        ...safePrev,
        activeSeasonId: fallbackSeason?.seasonId || safePrev.activeSeasonId,
        seasons: remainingSeasons,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleUpdateTeams = (updatedTeams) => {
    if (!canManageSquads) {
      window.alert("Only admin can update squads.");
      return;
    }

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        teams: updatedTeams,
      }));
      return;
    }

    updateState((prev) => ({ ...prev, teams: updatedTeams }));
  };

  const openBackupModal = () => {
    if (!isAdmin) {
      window.alert("Only admin can open save / clear tools.");
      return;
    }

    const defaults = buildDefaultParticipationEntries({
      teams,
      results,
      members,
    });

    setPendingParticipationEntries(defaults);
    setBackupCode("");
    setBackupError("");
    setShowBackupModal(true);
  };

  const closeBackupModal = () => {
    setShowBackupModal(false);
    setBackupCode("");
    setBackupError("");
    setPendingParticipationEntries([]);
  };

  const requireAdminCode = () => {
    if (backupCode.trim() !== MASTER_CODE) {
      setBackupError("Invalid admin code.");
      return false;
    }
    return true;
  };

  const handleParticipationChange = (entryKey, rawValue) => {
    const numeric = Number(rawValue);

    setPendingParticipationEntries((prev) =>
      prev.map((entry) => {
        if (entry.key !== entryKey) return entry;

        const capped = Math.max(
          0,
          Math.min(
            Number(entry.teamMatches || 0),
            Number.isFinite(numeric) ? numeric : 0
          )
        );

        return {
          ...entry,
          matchesPlayed: capped,
        };
      })
    );
  };

  const handleParticipationStep = (entryKey, delta) => {
    setPendingParticipationEntries((prev) =>
      prev.map((entry) => {
        if (entry.key !== entryKey) return entry;
        const nextValue = Number(entry.matchesPlayed || 0) + Number(delta || 0);
        const capped = Math.max(
          0,
          Math.min(Number(entry.teamMatches || 0), nextValue)
        );
        return {
          ...entry,
          matchesPlayed: capped,
        };
      })
    );
  };

  const handleClearOnly = () => {
    if (!requireAdminCode()) return;

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        gameFormat: "5_V_5",
        currentMatchNo: 1,
        currentMatch: {
          teamAId: prevSeason.teams?.[0]?.id ?? null,
          teamBId: prevSeason.teams?.[1]?.id ?? null,
          standbyId: prevSeason.teams?.[2]?.id ?? null,
        },
        streaks: prevSeason.streaks
          ? Object.fromEntries(
              Object.keys(prevSeason.streaks).map((tid) => [tid, 0])
            )
          : {},
        currentEvents: [],
        allEvents: [],
        results: [],
        matchDayHistory: prevSeason.matchDayHistory || [],
        matchMode: "round_robin",
        scheduledTarget: null,
        scheduledFixtures: [],
      }));

      closeBackupModal();
      return;
    }

    updateState((prev) => ({
      ...prev,
      gameFormat: "5_V_5",
      currentMatchNo: 1,
      currentMatch: {
        teamAId: prev.teams?.[0]?.id ?? null,
        teamBId: prev.teams?.[1]?.id ?? null,
        standbyId: prev.teams?.[2]?.id ?? null,
      },
      streaks: prev.streaks
        ? Object.fromEntries(Object.keys(prev.streaks).map((tid) => [tid, 0]))
        : {},
      currentEvents: [],
      allEvents: [],
      results: [],
      matchDayHistory: prev.matchDayHistory || [],
      matchMode: "round_robin",
      scheduledTarget: null,
      scheduledFixtures: [],
    }));

    closeBackupModal();
  };

  const handleSaveAndClearMatchDay = async () => {
    if (!requireAdminCode()) return;

    const now = new Date();
    const id =
      now.getFullYear().toString() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");

    try {
      if (USE_V2) {
        const activeSeasonId = safeV2ForStats?.activeSeasonId || "";
        const safeParticipationEntries = Array.isArray(pendingParticipationEntries)
          ? pendingParticipationEntries
          : [];

        if (activeSeasonId) {
          await saveParticipationForMatchDay({
            seasonId: activeSeasonId,
            seasonNo: activeSeasonNo,
            matchDayId: id,
            createdAtISO: now.toISOString(),
            playerAppearances: safeParticipationEntries,
          });
        }

        updateActiveSeason((prevSeason) => {
          const entry = {
            id,
            createdAt: now.toISOString(),
            results: prevSeason.results || [],
            allEvents: prevSeason.allEvents || [],
            teams: prevSeason.teams || [],
            playerAppearances: safeParticipationEntries,
          };

          const newHistory = [...(prevSeason.matchDayHistory || []), entry];

          return {
            ...prevSeason,
            matchDayHistory: newHistory,
            gameFormat: "5_V_5",
            currentMatchNo: 1,
            currentMatch: {
              teamAId: prevSeason.teams?.[0]?.id ?? null,
              teamBId: prevSeason.teams?.[1]?.id ?? null,
              standbyId: prevSeason.teams?.[2]?.id ?? null,
            },
            streaks: prevSeason.streaks
              ? Object.fromEntries(
                  Object.keys(prevSeason.streaks).map((tid) => [tid, 0])
                )
              : {},
            currentEvents: [],
            allEvents: [],
            results: [],
            matchMode: "round_robin",
            scheduledTarget: null,
            scheduledFixtures: [],
          };
        });

        closeBackupModal();
        return;
      }

      updateState((prev) => {
        const entry = {
          id,
          createdAt: now.toISOString(),
          results: prev.results || [],
          allEvents: prev.allEvents || [],
          teams: prev.teams || [],
          playerAppearances: pendingParticipationEntries || [],
        };

        const newHistory = [...(prev.matchDayHistory || []), entry];

        return {
          ...prev,
          matchDayHistory: newHistory,
          gameFormat: "5_V_5",
          currentMatchNo: 1,
          currentMatch: {
            teamAId: prev.teams?.[0]?.id ?? null,
            teamBId: prev.teams?.[1]?.id ?? null,
            standbyId: prev.teams?.[2]?.id ?? null,
          },
          streaks: prev.streaks
            ? Object.fromEntries(
                Object.keys(prev.streaks).map((tid) => [tid, 0])
              )
            : {},
          currentEvents: [],
          allEvents: [],
          results: [],
          matchMode: "round_robin",
          scheduledTarget: null,
          scheduledFixtures: [],
        };
      });

      closeBackupModal();
    } catch (err) {
      console.error("[TK] Failed to save participation records:", err);
      setBackupError(
        "Failed to save participation records. Nothing was cleared."
      );
    }
  };

  const openEndSeasonModal = () => {
    if (!isAdmin) {
      window.alert("Only admin can end the season.");
      return;
    }

    setEndSeasonCode("");
    setEndSeasonError("");
    setShowEndSeasonModal(true);
  };

  const closeEndSeasonModal = () => {
    setShowEndSeasonModal(false);
    setEndSeasonCode("");
    setEndSeasonError("");
  };

  const closeSeasonCompleteModal = () => {
    setShowSeasonCompleteModal(false);
    setSeasonCompleteDismissedKey(seasonCompletionKey);
  };

  const handleOpenEndSeasonFromCongrats = () => {
    setShowSeasonCompleteModal(false);
    handleRequestEndSeason();
  };

  const handleRequestEndSeason = () => {
    if (!USE_V2) return;
    if (!isAdmin) {
      window.alert("Only admin can end the season.");
      return;
    }

    const hasUnendedMatchDay =
      (Array.isArray(results) && results.length > 0) ||
      (Array.isArray(allEvents) && allEvents.length > 0) ||
      (Array.isArray(currentEvents) && currentEvents.length > 0) ||
      hasLiveMatch ||
      running;

    if (hasUnendedMatchDay) {
      window.alert(
        "⚠️ You still have an active match day that has not been ended.\n\n" +
          "Please click “🏁 End Match Day” first (Save to Firebase & clear), then come back to “🏆 End Season”."
      );
      return;
    }

    openEndSeasonModal();
  };

  const requireAdminCodeEndSeason = () => {
    if (endSeasonCode.trim() !== MASTER_CODE) {
      setEndSeasonError("Invalid admin code.");
      return false;
    }
    return true;
  };

  const handleEndSeasonAndCreateNew = () => {
    if (!USE_V2) return;
    if (!requireAdminCodeEndSeason()) return;

    updateState((prev) => {
      const safePrev = ensureV2StateShape(prev);

      setRunning(false);
      setTimeUp(false);
      setSecondsLeft(MATCH_SECONDS);
      setHasLiveMatch(false);
      setPendingMatchStartContext(null);
      setCurrentConfirmedLineupSnapshot(null);

      const { seasonId, seasonNo } = nextSeasonIdFromExisting(safePrev.seasons);
      const { activeSeason } = getActiveSeasonFromV2State(safePrev);
      const baseTeams = activeSeason?.teams || [];

      const newSeason = {
        seasonId,
        seasonNo,
        gameFormat: "5_V_5",
        teams: baseTeams,
        currentMatchNo: 1,
        currentMatch: {
          teamAId: baseTeams?.[0]?.id ?? null,
          teamBId: baseTeams?.[1]?.id ?? null,
          standbyId: baseTeams?.[2]?.id ?? null,
        },
        streaks: activeSeason?.streaks
          ? Object.fromEntries(
              Object.keys(activeSeason.streaks).map((tid) => [tid, 0])
            )
          : {},
        currentEvents: [],
        allEvents: [],
        results: [],
        matchDayHistory: [],
        matchMode: "round_robin",
        scheduledTarget: null,
        scheduledFixtures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return {
        ...safePrev,
        activeSeasonId: seasonId,
        seasons: [...safePrev.seasons, newSeason],
        updatedAt: new Date().toISOString(),
      };
    });

    closeEndSeasonModal();
    setShowSeasonCompleteModal(false);
    setSeasonCompleteDismissedKey(null);
  };

  const handleProceedToPayment = (payload) => {
    const safePayload = payload || {};
    console.log("[TK PAYMENTS] proceed to payment payload:", safePayload);
    setPaymentContext(safePayload);
    setPage(PAGE_PAYMENT);
  };

  const handleBackFromPayment = () => setPage(PAGE_MATCH_SIGNUP);


  return (
    <div className="app-root">
      <style>{`
        .tk-staging-badge {
          position: fixed;
          top: 14px;
          right: 14px;
          z-index: 9999;
          padding: 0.55rem 0.9rem;
          border-radius: 999px;
          background: rgba(220, 38, 38, 0.95);
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.18);
          pointer-events: none;
          user-select: none;
        }
      `}</style>

      {IS_STAGING && <div className="tk-staging-badge">Testing Version</div>}

      {page === PAGE_ENTRY && (
        <EntryPage
          identity={identity}
          members={members}
          onComplete={handleEntryComplete}
          onDevSkipToLanding={() => setPage(PAGE_LANDING)}
        />
      )}

      {page === PAGE_LANDING && (
        <LandingPage
          teams={teams}
          currentMatchNo={currentMatchNo}
          currentMatch={currentMatch}
          results={fullResults}
          streaks={streaks}
          hasLiveMatch={hasLiveMatch}
          gameFormat={gameFormat}
          matchMode={matchMode}
          scheduledTarget={scheduledTarget}
          scheduledFixtures={scheduledFixtures}
          smartOffset={smartOffset}
          smartTarget={smartTarget}
          onUpdatePairing={handleUpdatePairing}
          onStartMatch={handleStartMatch}
          onSetGameFormat={handleSetGameFormat}
          onSetMatchMode={handleSetMatchMode}
          onGenerateScheduledPlan={handleGenerateScheduledPlan}
          onUpdateSmartOffset={handleUpdateSmartOffset}
          onGoToStats={() => handleGoToStats(PAGE_LANDING)}
          onOpenBackupModal={openBackupModal}
          onOpenEndSeasonModal={handleRequestEndSeason}
          onGoToLiveAsSpectator={handleGoToLiveAsSpectator}
          onGoToFormations={handleGoToFormations}
          onGoToNews={() => setPage(PAGE_NEWS)}
          onGoToEntryDev={() => setPage(PAGE_ENTRY)}
          onGoToPayments={handleGoToMatchSignup}
          identity={identity}
          activeRole={activeRole}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          isPlayer={isPlayer}
          isSpectator={isSpectator}
          canStartMatch={canStartMatch}
          hasRecordedMatchDayState={hasRecordedMatchDayState}
        />
      )}

      {page === PAGE_MATCH_SIGNUP && (
        <MatchSignupPage
          identity={identity}
          currentUser={null}
          teams={teams}
          activeSeasonId={activeSeasonId}
          playerPhotosByName={playerPhotosByName}
          onBack={() => setPage(PAGE_LANDING)}
          onProceedToPayment={handleProceedToPayment}
        />
      )}

      {page === PAGE_PAYMENT && (
        <PaymentPage
          identity={identity}
          activeRole={activeRole}
          activeSeasonId={activeSeasonId}
          paymentContext={paymentContext}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          onBack={handleBackFromPayment}
          onDone={() => setPage(PAGE_LANDING)}
        />
      )}

      {page === PAGE_MIGRATION && (
        <MigrationPage onBack={() => setPage(PAGE_LANDING)} />
      )}

      {page === PAGE_LIVE && (
        <LiveMatchPage
          matchSeconds={MATCH_SECONDS}
          secondsLeft={secondsLeft}
          timeUp={timeUp}
          running={running}
          teams={teams}
          currentMatchNo={currentMatchNo}
          currentMatch={currentMatch}
          currentEvents={currentEvents}
          identity={identity}
          activeRole={activeRole}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          canControlMatch={canStartMatch}
          pendingMatchStartContext={pendingMatchStartContext}
          gameFormat={gameFormat}
          confirmedLineupSnapshot={currentConfirmedLineupSnapshot}
          confirmedLineupsByMatchNo={confirmedLineupsByMatchNo}
          playerPhotosByName={playerPhotosByName}
          onConfirmPreMatchLineups={handleConfirmPreMatchLineups}
          onCancelPreMatchLineups={handleCancelPreMatchLineups}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
          onUndoLastEvent={handleUndoLastEvent}
          onConfirmEndMatch={handleConfirmEndMatch}
          onBackToLanding={handleDiscardMatchAndBack}
          onGoToStats={() => handleGoToStats(PAGE_LIVE)}
        />
      )}

      {page === PAGE_SPECTATOR && (
        <SpectatorPage
          teams={teams}
          currentMatchNo={currentMatchNo}
          currentMatch={currentMatch}
          currentEvents={currentEvents}
          results={results}
          onBackToLanding={handleBackToLanding}
        />
      )}

      {page === PAGE_STATS && (
        <StatsPage
          teams={teams}
          results={results}
          allEvents={allEvents}
          archivedResults={archivedResultsFromHistory}
          archivedEvents={archivedEventsFromHistory}
          cameFromLive={statsReturnPage === PAGE_LIVE}
          onBack={() =>
            statsReturnPage === PAGE_LIVE
              ? handleBackToLive()
              : handleBackToLanding()
          }
          onGoToPlayerCards={() => setPage(PAGE_PLAYER_CARDS)}
          onGoToPeerReview={() => setPage(PAGE_PEER_REVIEW)}
          members={members}
          activeSeasonId={USE_V2 ? safeV2ForStats?.activeSeasonId : null}
          seasons={USE_V2 ? safeV2ForStats?.seasons || [] : []}
          playerPhotosByName={playerPhotosByName}
          matchDayHistory={matchDayHistory || []}
          onDeleteSavedMatch={handleDeleteSavedMatch}
          onUpdateSavedEvent={handleUpdateSavedEvent}
          onDeleteSavedEvent={handleDeleteSavedEvent}
          onAddSavedEvent={handleAddSavedEvent}
          onDeleteCurrentEmptySeason={handleDeleteCurrentEmptySeason}
          canPreviewPreviousSeasonUI={canPreviewPreviousSeasonUI}
          isAdmin={isAdmin}
        />
      )}

      {page === PAGE_NEWS && (
        <NewsPage
          teams={teams}
          results={fullResults}
          allEvents={fullEvents}
          currentResults={results}
          currentEvents={currentEvents}
          matchDayHistory={matchDayHistory}
          playerPhotosByName={playerPhotosByName}
          identity={identity}
          yearEndAttendance={yearEndAttendance}
          onUpdateYearEndAttendance={(nextList) =>
            updateState((prev) => {
              if (USE_V2) {
                const safePrev = ensureV2StateShape(prev);
                return { ...safePrev, yearEndAttendance: nextList };
              }
              return { ...prev, yearEndAttendance: nextList };
            })
          }
          onGoToSignIn={() => setPage(PAGE_ENTRY)}
          onBack={handleBackToLanding}
          members={members}
        />
      )}

      {page === PAGE_PLAYER_CARDS && (
        <PlayerCardPage
          teams={teams}
          allEvents={fullSeasonEventsForStats}
          peerRatingsByPlayer={peerRatingsByPlayer}
          playerPhotosByName={playerPhotosByName}
          activeSeasonId={USE_V2 ? safeV2ForStats?.activeSeasonId : null}
          onBack={() => setPage(PAGE_STATS)}
        />
      )}

      {page === PAGE_PEER_REVIEW && (
        <PeerReviewPage
          teams={teams}
          playerPhotosByName={playerPhotosByName}
          identity={identity}
          activeSeasonId={USE_V2 ? safeV2ForStats?.activeSeasonId : null}
          onBack={() => setPage(PAGE_STATS)}
        />
      )}

      {page === PAGE_SQUADS && (
        <SquadsPage
          teams={teams}
          onUpdateTeams={handleUpdateTeams}
          onBack={() => setPage(PAGE_FORMATIONS)}
          identity={identity}
          isAdmin={isAdmin}
          activeRole={activeRole}
          gameFormat={gameFormat}
        />
      )}

      {page === PAGE_FORMATIONS && (
        <FormationsPage
          teams={teams}
          currentMatch={currentMatch}
          playerPhotosByName={playerPhotosByName}
          identity={identity}
          onBack={handleBackToLanding}
          onGoToSquads={handleGoToSquads}
          gameFormat={gameFormat}
        />
      )}

      {showBackupModal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            style={{
              maxWidth: "780px",
              width: isBackupModalMobile ? "94%" : "95%",
              padding: isBackupModalMobile ? "1.15rem" : "1.4rem",
              boxSizing: "border-box",
            }}
          >
            <h3 style={{ marginBottom: "0.45rem" }}>End Match Day</h3>
            <p
              style={{
                marginTop: 0,
                marginBottom: "0.9rem",
                maxWidth: "560px",
                lineHeight: 1.45,
              }}
            >
              Confirm player participation, then save the match day to Firebase and clear the live board.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: isBackupModalMobile ? "0.7rem" : "0.85rem",
                maxHeight: isBackupModalMobile ? "45vh" : "48vh",
                overflowY: "auto",
                marginTop: "0.2rem",
                marginBottom: "1rem",
                paddingRight: "0.2rem",
              }}
            >
              {teams.map((team, teamIndex) => {
                const rows = pendingParticipationEntries.filter(
                  (entry) => entry.teamId === team.id
                );

                if (!rows.length) return null;

                const teamMatches = rows[0]?.teamMatches ?? 0;
                const squadSize = rows[0]?.squadSize ?? 0;
                const expectedFullMatches = rows[0]?.expectedFullMatches ?? 0;
                const theme = getParticipationTeamTheme(team, teamIndex);
                const isBlackTeamTheme = Boolean(theme.isBlack);

                return (
                  <div
                    key={team.id}
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderLeft: `4px solid ${theme.accent}`,
                      borderRadius: "14px",
                      padding: isBackupModalMobile ? "0.8rem" : "0.9rem",
                      background: theme.background,
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: isBackupModalMobile ? "flex-start" : "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <h4
                        style={{
                          margin: 0,
                          color: isBlackTeamTheme ? "#000000" : theme.accent,
                          padding: isBlackTeamTheme ? "0.22rem 0.65rem" : 0,
                          background: isBlackTeamTheme
                            ? "rgba(255,255,255,0.95)"
                            : "transparent",
                          borderRadius: isBlackTeamTheme ? "9px" : 0,
                          display: "inline-block",
                        }}
                      >
                        {team.label}
                      </h4>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.45rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        {[
                          `Matches ${teamMatches}`,
                          `Squad ${squadSize}`,
                          `Expected ${expectedFullMatches}`,
                        ].map((label, idx) => (
                          <span
                            key={label}
                            style={{
                              padding: "0.26rem 0.6rem",
                              borderRadius: "999px",
                              background:
                                idx === 2
                                  ? isBlackTeamTheme
                                    ? "rgba(255,255,255,0.95)"
                                    : theme.soft
                                  : "rgba(255,255,255,0.06)",
                              border: `1px solid ${
                                idx === 2
                                  ? isBlackTeamTheme
                                    ? "rgba(148,163,184,0.34)"
                                    : theme.border
                                  : "rgba(255,255,255,0.1)"
                              }`,
                              color:
                                idx === 2
                                  ? isBlackTeamTheme
                                    ? "#000000"
                                    : theme.accent
                                  : "#e5e7eb",
                              opacity:
                                idx === 2 && isBlackTeamTheme ? 1 : undefined,
                              fontWeight:
                                idx === 2 && isBlackTeamTheme ? 700 : undefined,
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: isBackupModalMobile ? "0.6rem" : "0.55rem",
                      }}
                    >
                      {rows.map((entry) => {
                        const expectedLabel = Number(entry.expectedFullMatches || 0);
                        const playedValue = Number(entry.matchesPlayed || 0);
                        const maxValue = Number(entry.teamMatches || 0);

                        return (
                          <div
                            key={entry.key}
                            style={{
                              display: "grid",
                              gridTemplateColumns: isBackupModalMobile
                                ? "1fr"
                                : "minmax(0,1fr) auto",
                              gap: isBackupModalMobile ? "0.55rem" : "0.7rem",
                              alignItems: "center",
                              padding: isBackupModalMobile ? "0.65rem 0.7rem" : "0.6rem 0.7rem",
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              boxSizing: "border-box",
                            }}
                          >
                            <div style={{ minWidth: 0, paddingRight: isBackupModalMobile ? 0 : "0.25rem" }}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  lineHeight: 1.25,
                                  wordBreak: "break-word",
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {entry.playerName}
                              </div>
                              <div
                                className="muted small"
                                style={{
                                  padding: isBlackTeamTheme ? "0.16rem 0.46rem" : 0,
                                  background: isBlackTeamTheme
                                    ? "rgba(148,163,184,0.14)"
                                    : "transparent",
                                  borderRadius: isBlackTeamTheme ? "7px" : 0,
                                  display: "inline-block",
                                  width: "fit-content",
                                  marginTop: "0.16rem",
                                }}
                              >
                                Expected: {expectedLabel}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: isBackupModalMobile ? "0.38rem" : "0.45rem",
                                justifySelf: isBackupModalMobile ? "stretch" : "end",
                                width: isBackupModalMobile ? "100%" : "auto",
                                justifyContent: isBackupModalMobile ? "space-between" : "flex-end",
                              }}
                            >
                              <button
                                type="button"
                                className="secondary-btn"
                                style={{
                                  minWidth: isBackupModalMobile ? "34px" : "38px",
                                  width: isBackupModalMobile ? "34px" : "38px",
                                  height: isBackupModalMobile ? "34px" : "38px",
                                  padding: 0,
                                  borderColor: theme.border,
                                }}
                                onClick={() => handleParticipationStep(entry.key, -1)}
                              >
                                −
                              </button>

                              <input
                                type="number"
                                min={0}
                                max={maxValue}
                                className="text-input"
                                style={{
                                  width: isBackupModalMobile ? "64px" : "68px",
                                  minWidth: 0,
                                  textAlign: "center",
                                  paddingLeft: "0.35rem",
                                  paddingRight: "0.35rem",
                                  boxSizing: "border-box",
                                  borderColor: theme.border,
                                  flexShrink: 0,
                                }}
                                value={playedValue}
                                onChange={(e) =>
                                  handleParticipationChange(entry.key, e.target.value)
                                }
                              />

                              <button
                                type="button"
                                className="secondary-btn"
                                style={{
                                  minWidth: isBackupModalMobile ? "34px" : "38px",
                                  width: isBackupModalMobile ? "34px" : "38px",
                                  height: isBackupModalMobile ? "34px" : "38px",
                                  padding: 0,
                                  borderColor: theme.border,
                                }}
                                onClick={() => handleParticipationStep(entry.key, 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gap: "0.45rem", marginBottom: "0.9rem" }}>
              <label style={{ fontWeight: 600 }}>Admin code (Nkululeko)</label>
              <input
                type="password"
                className="text-input"
                style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value);
                  setBackupError("");
                }}
              />
              {backupError && <p className="error-text">{backupError}</p>}
            </div>

            <div
              className="actions-row"
              style={{
                display: "grid",
                gridTemplateColumns: isBackupModalMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "0.75rem",
                alignItems: "stretch",
              }}
            >
              <button className="secondary-btn" onClick={closeBackupModal}>
                Cancel
              </button>
              <button className="secondary-btn" onClick={handleClearOnly}>
                Clear only
              </button>
              <button className="primary-btn" onClick={handleSaveAndClearMatchDay}>
                Save to Firebase &amp; clear
              </button>
            </div>
          </div>
        </div>
      )}

{USE_V2 && showSeasonCompleteModal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            style={{
              maxWidth: "760px",
              width: "94%",
              textAlign: "center",
              padding: "2rem 1.5rem",
              background:
                "radial-gradient(circle at top, rgba(250,204,21,0.18), rgba(10,18,36,0.96) 58%)",
              border: "1px solid rgba(250, 204, 21, 0.32)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
            }}
          >
            <div style={{ fontSize: "3.2rem", marginBottom: "0.4rem" }}>🏆</div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.9rem",
                lineHeight: 1.15,
                color: "#facc15",
              }}
            >
              Congratulations! Season target reached
            </h2>
            <p
              style={{
                margin: "0.9rem auto 0.35rem",
                maxWidth: "560px",
                fontSize: "1.05rem",
              }}
            >
              All teams have now reached the fixtured season limit of{" "}
              <strong>{scheduledTarget ?? "-"}</strong> games played.
            </p>
            <p
              style={{
                margin: "0 auto 1rem",
                maxWidth: "620px",
                color: "rgba(255,255,255,0.82)",
              }}
            >
              No more matches should be recorded for this fixtured season. You can now end the season and create a fresh one.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
                marginTop: "1.1rem",
              }}
            >
              <button
                className="secondary-btn"
                type="button"
                onClick={closeSeasonCompleteModal}
              >
                Close
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleOpenEndSeasonFromCongrats}
              >
                🏆 End Season
              </button>
            </div>
          </div>
        </div>
      )}

      {USE_V2 && showEndSeasonModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>End Season</h3>
            <p>
              This will create a <strong>new season</strong> and make it active.
              The current season’s history remains saved in Firestore. (End
              Match Day is separate.)
            </p>
            <div className="field-row">
              <label>Admin code (Nkululeko)</label>
              <input
                type="password"
                className="text-input"
                value={endSeasonCode}
                onChange={(e) => {
                  setEndSeasonCode(e.target.value);
                  setEndSeasonError("");
                }}
              />
              {endSeasonError && <p className="error-text">{endSeasonError}</p>}
            </div>
            <div className="actions-row">
              <button className="secondary-btn" onClick={closeEndSeasonModal}>
                Cancel
              </button>
              <button
                className="primary-btn"
                onClick={handleEndSeasonAndCreateNew}
              >
                Create new season
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}