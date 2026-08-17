// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { EntryPage } from "./pages/EntryPage.jsx";
import { ClubChatPage } from "./pages/ClubChat/ClubChatPage.jsx";
import { ClubChatWidget } from "./components/ClubChat/ClubChatWidget.jsx";
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
import VideoHighlightsPage from "./pages/VideoHighlightsPage.jsx";
import HomePage_HUB from "./pages/HomePage_HUB.jsx";
import VideoHighlightsRepository from "./storage/VideoHighlightsRepository.js";
import BottomNav from "./components/BottomNav.jsx";
import { buildClubIdentity, DEFAULT_CLUB_ID } from "./core/clubIdentity.js";
import {
  MATCH_MODE as MATCH_TYPE,
  GAME_FORMAT,
  normalizeMatchMode,
  normalizeGameFormat,
} from "./core/matchConfig.js";


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
import {
  buildCleanSheetEventsForMatch,
  buildFriendlyDefensiveBlockEvents,
} from "./core/lineups.js";
import { buildPracticeState } from "./core/practiceSessionSeed.js";
import {
  createPracticeRuntime,
  restorePracticeRuntime,
} from "./core/practiceRuntime.js";
import {
  getActivePracticeSession,
  endPracticeSession,
} from "./storage/practiceSessionGateway.js";
import { useAuth } from "./auth/AuthContext.jsx";

import {
  buildCurrentMatchFromFixture,
  computeScheduledPlan,
  findNearestValidTarget,
  getFirstPendingFixture,
  markScheduledFixtureCompleted,
} from "./core/scheduledFixtures.js";

import { db } from "./firebaseConfig.js";
import { clubCollectionPath, clubDocPath } from "./core/clubPaths.js";
import { getPlayerPhotosCollection } from "./core/clubFirestorePaths.js";
import {
  dataScopeDocPath,
  isPracticeDataScope,
} from "./core/dataScope.js";
import { doc, writeBatch, serverTimestamp, setDoc, collection, getDocs, getDoc, deleteDoc } from "firebase/firestore";

// Page constants
const PAGE_HOME = "home";
const PAGE_ENTRY = "entry";
const PAGE_SESSION_SELECTOR = "session-selector";
const PAGE_LANDING = "landing";
const PAGE_CLUB_CHAT = "club-chat";
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
const PAGE_VIEW_HIGHLIGHTS = "view-highlights";

const CAMERA_APP_DEEP_LINK_SCHEME = "fiveasidesnearmecamera://open";
const CAMERA_APP_INSTALL_URL = "/five-asides-near-me-camera.apk";
const CAMERA_APP_INSTALL_GUIDE_URL = "/camera-app";
const CAMERA_APP_OPEN_FALLBACK_MS = 1400;

const MASTER_CODE = "3333";
const DEFAULT_LEAGUE_MATCH_SECONDS = 5 * 60;
const DEFAULT_FRIENDLY_MATCH_SECONDS = 60 * 60;
const DEFAULT_MATCH_SECONDS = DEFAULT_FRIENDLY_MATCH_SECONDS;
const MATCH_SECONDS_STORAGE_NAME = "match_seconds_by_type_v1";

const GUEST_OPPONENT_ID = "guest_opponent";
const TURF_KINGS_CHALLENGE_ID = "turf_kings_challenge";
const TURF_KINGS_SLOT_ID = "dark";
const GUEST_OPPONENT_SLOT_ID = "light";

const USE_V2 = true;

const IS_STAGING =
  String(import.meta.env.VITE_USE_STAGING || "").trim().toLowerCase() ===
  "true";

function buildClubStorageKey(name, clubId = DEFAULT_CLUB_ID) {
  const safeName = String(name || "value").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeClubId = String(clubId || DEFAULT_CLUB_ID)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "") || DEFAULT_CLUB_ID;

  return `fanm_${safeClubId}_${safeName}`;
}

function getIdentityStorageKey(clubId = DEFAULT_CLUB_ID) {
  return buildClubStorageKey("identity_v1", clubId);
}

function getRefereeDeviceStorageKey(clubId = DEFAULT_CLUB_ID) {
  return buildClubStorageKey("referee_device_id_v1", clubId);
}

function getOrCreateRefereeDeviceId(clubId = DEFAULT_CLUB_ID) {
  if (typeof window === "undefined") return "server-device";

  const key = getRefereeDeviceStorageKey(clubId);

  try {
    const existing = window.localStorage.getItem(key);

    if (existing) return existing;

    const created =
      `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    window.localStorage.setItem(key, created);

    return created;
  } catch {
    return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getSmartOffsetStorageKey(clubId = DEFAULT_CLUB_ID) {
  return buildClubStorageKey("smart_offset_v1", clubId);
}

function getMatchSecondsStorageKey(clubId = DEFAULT_CLUB_ID) {
  return buildClubStorageKey(MATCH_SECONDS_STORAGE_NAME, clubId);
}

function getPlayerCardSnapshotStorageKeys(seasonId, clubId = DEFAULT_CLUB_ID) {
  const safeClubId = String(clubId || DEFAULT_CLUB_ID).trim() || DEFAULT_CLUB_ID;
  const safeSeasonId = String(seasonId || "").trim();

  const keys = safeSeasonId
    ? [
        buildClubStorageKey(`player_card_snapshot_${safeSeasonId}`, safeClubId),
        buildClubStorageKey("player_card_snapshot_latest", safeClubId),
      ]
    : [buildClubStorageKey("player_card_snapshot_latest", safeClubId)];

  if (safeClubId === DEFAULT_CLUB_ID) {
    if (safeSeasonId) keys.push(`tk_player_card_snapshot_${safeSeasonId}`);
    keys.push("tk_player_card_snapshot_latest");
  }

  return keys;
}

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

function getRealStoredRole(identity) {
  const role = String(identity?.realRole || identity?.role || "spectator")
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

function buildDefaultFiveVFiveTeams() {
  return [
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
  ];
}

function normalizeFiveVFiveTeams(teams = []) {
  return (Array.isArray(teams) ? teams : []).map((team) => ({
    ...team,
    id: String(team?.id || "").trim(),
    label: String(team?.label || "").trim(),
    abbrev: String(team?.abbrev || "").trim(),
    teamColorName: String(team?.teamColorName || team?.colorName || "").trim(),
    teamColorHex: String(team?.teamColorHex || team?.colorHex || "").trim(),
    players: Array.isArray(team?.players) ? [...team.players] : [],
    captainId: team?.captainId || null,
    captain: String(team?.captain || "").trim(),
  }));
}

function isGuestOpponentTeam(team = {}) {
  return (
    team?.id === GUEST_OPPONENT_ID ||
    team?.isGuestOpponent === true ||
    team?.temporaryGuestOpponent === true
  );
}

function isTurfKingsChallengeTeam(team = {}) {
  return (
    team?.id === TURF_KINGS_CHALLENGE_ID ||
    team?.isTurfKingsChallengeTeam === true ||
    team?.temporaryChallengeTeam === true
  );
}

function stripFriendlyChallengeFlags(team = {}) {
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
    ...safe
  } = team || {};

  return safe;
}

function ensureFiveVFiveTeamsShape(rawTeams) {
  const incoming = normalizeFiveVFiveTeams(rawTeams);
  const defaults = buildDefaultFiveVFiveTeams();

  const byId = new Map(
    incoming
      .filter((team) => team?.id === TURF_KINGS_SLOT_ID || team?.id === GUEST_OPPONENT_SLOT_ID)
      .map((team) => [team.id, stripFriendlyChallengeFlags(team)])
  );

  return defaults.map((baseTeam) => {
    const incomingTeam = byId.get(baseTeam.id) || {};

    return {
      ...baseTeam,
      ...incomingTeam,
      id: baseTeam.id,
      label:
        String(incomingTeam.label || "").trim() ||
        baseTeam.label,
      abbrev:
        String(incomingTeam.abbrev || "").trim() ||
        baseTeam.abbrev,
      teamColorName:
        String(incomingTeam.teamColorName || incomingTeam.colorName || baseTeam.teamColorName).trim() ||
        baseTeam.teamColorName,
      teamColorHex:
        String(incomingTeam.teamColorHex || incomingTeam.colorHex || baseTeam.teamColorHex).trim() ||
        baseTeam.teamColorHex,
      players: Array.isArray(incomingTeam.players) ? [...incomingTeam.players] : [],
      captainId: incomingTeam.captainId || null,
      captain: String(incomingTeam.captain || "").trim(),
    };
  });
}

function getActiveFriendlyTeams(fiveVFiveTeams = []) {
  return ensureFiveVFiveTeamsShape(fiveVFiveTeams).slice(0, 2);
}


function repairLeagueCurrentMatch(match, teams = [], fallbackActiveTeamIds = []) {
  const safeTeams = Array.isArray(teams) ? teams.filter((team) => team?.id) : [];
  const teamIds = safeTeams.map((team) => team.id);

  if (teamIds.length < 2) {
    return {
      teamAId: teamIds[0] || null,
      teamBId: teamIds[1] || null,
      standbyId: teamIds[2] || null,
    };
  }

  const fallbackIds = Array.from(
    new Set(
      (Array.isArray(fallbackActiveTeamIds) ? fallbackActiveTeamIds : []).filter(
        (teamId) => teamIds.includes(teamId)
      )
    )
  );

  const rawA = match?.teamAId || null;
  const rawB = match?.teamBId || null;
  const rawStandby = match?.standbyId || null;

  const hasValidDistinctPair =
    rawA && rawB && rawA !== rawB && teamIds.includes(rawA) && teamIds.includes(rawB);

  if (hasValidDistinctPair) {
    return {
      teamAId: rawA,
      teamBId: rawB,
      standbyId:
        rawStandby &&
        teamIds.includes(rawStandby) &&
        rawStandby !== rawA &&
        rawStandby !== rawB
          ? rawStandby
          : teamIds.find((teamId) => teamId !== rawA && teamId !== rawB) || null,
    };
  }

  const teamAId = fallbackIds[0] || teamIds[0] || null;
  const teamBId =
    fallbackIds.find((teamId) => teamId !== teamAId) ||
    teamIds.find((teamId) => teamId !== teamAId) ||
    null;

  return {
    teamAId,
    teamBId,
    standbyId: teamIds.find((teamId) => teamId !== teamAId && teamId !== teamBId) || null,
  };
}


/* ---------------- State helpers ---------------- */

function ensureSeasonSchedulingShape(season) {
  if (!season || typeof season !== "object") return season;

  const teamIds = Array.isArray(season?.teams)
    ? season.teams.map((team) => team?.id).filter(Boolean)
    : [];

  const rawActiveTeamIds = Array.isArray(season?.activeTeamIds)
    ? season.activeTeamIds.filter(Boolean)
    : [];

  const normalizedActiveTeamIds = Array.from(
    new Set(
      (rawActiveTeamIds.length ? rawActiveTeamIds : teamIds.slice(0, 2)).filter(
        (teamId) => teamIds.includes(teamId)
      )
    )
  ).slice(0, 2);

  const legacyGameFormat = season?.gameFormat || GAME_FORMAT.FIVE_V_FIVE;
  const resolvedMatchType = normalizeMatchMode(
    season?.matchType || legacyGameFormat,
    MATCH_TYPE.FRIENDLY
  );
  const resolvedGameFormat = normalizeGameFormat(
    legacyGameFormat,
    GAME_FORMAT.FIVE_V_FIVE
  );

  return {
    ...season,
    matchType: resolvedMatchType,
    gameFormat: resolvedGameFormat,
    activeTeamIds:
      normalizedActiveTeamIds.length >= 2
        ? normalizedActiveTeamIds
        : teamIds.slice(0, 2),
    fiveVFiveTeams:
      season?.isPracticeSeason || String(season?.seasonId || "").startsWith("practice")
        ? normalizeFiveVFiveTeams(season?.fiveVFiveTeams)
        : ensureFiveVFiveTeamsShape(season?.fiveVFiveTeams),
    matchMode: season?.matchMode || "round_robin",
    scheduledTarget:
      Number.isInteger(Number(season?.scheduledTarget))
        ? Number(season.scheduledTarget)
        : null,
    scheduledFixtures: Array.isArray(season?.scheduledFixtures)
      ? season.scheduledFixtures
      : [],
    liveMatchDraft: season?.liveMatchDraft || null,
  };
}

window.__TEST_NORMALIZE__ = ensureSeasonSchedulingShape;


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



function getPeerReviewSessionTimestamp(session = {}) {
  const values = [
    session?.completedAtISO,
    session?.createdAtISO,
    session?.createdAt,
    session?.date,
    session?.matchDayId,
    session?.id,
  ];

  for (const value of values) {
    if (value?.toDate && typeof value.toDate === "function") {
      const timestamp = value.toDate().getTime();
      if (Number.isFinite(timestamp)) return timestamp;
    }

    const timestamp = new Date(value || "").getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return 0;
}

function buildPeerReviewTeamsFromCompletedSession(session = null) {
  if (!session || typeof session !== "object") return [];

  const appearances = Array.isArray(session?.playerAppearances)
    ? session.playerAppearances
    : [];

  const archivedTeams = Array.isArray(session?.teams)
    ? session.teams
    : [];

  const archivedTeamByKey = new Map();

  archivedTeams.forEach((team) => {
    const keys = [
      team?.id,
      team?.label,
      team?.name,
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);

    keys.forEach((key) => archivedTeamByKey.set(key, team));
  });

  if (appearances.length > 0) {
    const teamsByKey = new Map();

    appearances.forEach((entry, index) => {
      const playerName = toTitleCaseLoose(
        entry?.playerName ||
        entry?.fullName ||
        entry?.displayName ||
        entry?.shortName ||
        entry?.name ||
        ""
      );

      if (!playerName) return;

      const rawTeamId = String(
        entry?.teamId ||
        entry?.teamName ||
        entry?.teamLabel ||
        `team-${index + 1}`
      ).trim();

      const teamLabel = toTitleCaseLoose(
        entry?.teamName ||
        entry?.teamLabel ||
        entry?.teamId ||
        `Team ${index + 1}`
      );

      const teamKey = rawTeamId || teamLabel;
      if (!teamKey) return;

      const archivedTeam =
        archivedTeamByKey.get(rawTeamId.toLowerCase()) ||
        archivedTeamByKey.get(teamLabel.toLowerCase()) ||
        null;

      if (!teamsByKey.has(teamKey)) {
        teamsByKey.set(teamKey, {
          id: rawTeamId || teamKey,
          label:
            String(
              archivedTeam?.label ||
              archivedTeam?.name ||
              teamLabel ||
              rawTeamId ||
              "Team"
            ).trim(),
          teamColorName: String(
            archivedTeam?.teamColorName ||
            archivedTeam?.colorName ||
            ""
          ).trim(),
          teamColorHex: String(
            archivedTeam?.teamColorHex ||
            archivedTeam?.colorHex ||
            archivedTeam?.teamColor ||
            ""
          ).trim(),
          players: [],
        });
      }

      const team = teamsByKey.get(teamKey);

      const playerKey = String(
        entry?.playerId ||
        entry?.memberId ||
        playerName
      )
        .trim()
        .toLowerCase();

      const alreadyPresent = team.players.some((player) => {
        const existingKey = String(
          player?.playerId ||
          player?.id ||
          player?.name ||
          ""
        )
          .trim()
          .toLowerCase();

        return existingKey === playerKey;
      });

      if (alreadyPresent) return;

      team.players.push({
        id:
          String(entry?.playerId || entry?.memberId || "").trim() ||
          playerKey,
        playerId:
          String(entry?.playerId || "").trim() ||
          playerKey,
        memberId: entry?.memberId || null,
        name: playerName,
        displayName: playerName,
        fullName: playerName,
        shortName:
          toTitleCaseLoose(entry?.shortName || "") ||
          playerName.split(/\s+/)[0] ||
          playerName,
      });
    });

    return Array.from(teamsByKey.values()).filter(
      (team) =>
        Array.isArray(team?.players) &&
        team.players.length > 0
    );
  }

  /*
    Compatibility with older archives:
    Friendly already saved full team snapshots even when
    playerAppearances was empty.
  */
  return archivedTeams
    .map((team, index) => ({
      ...team,
      id:
        String(team?.id || "").trim() ||
        `team-${index + 1}`,
      label:
        String(team?.label || team?.name || "").trim() ||
        `Team ${index + 1}`,
      players: Array.isArray(team?.players)
        ? team.players
        : [],
    }))
    .filter(
      (team) =>
        Array.isArray(team.players) &&
        team.players.length > 0
    );
}

function readRenderedPlayerCardSnapshotFromLocalStorage(seasonId, clubId = DEFAULT_CLUB_ID) {
  if (typeof window === "undefined") return null;

  const safeSeasonId = String(seasonId || "").trim();
  const keys = getPlayerCardSnapshotStorageKeys(safeSeasonId, clubId);

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      if (!parsed.players || typeof parsed.players !== "object") continue;

      if (safeSeasonId && parsed.seasonId && String(parsed.seasonId) !== safeSeasonId) {
        continue;
      }

      return parsed;
    } catch {
      // ignore bad localStorage snapshots
    }
  }

  return null;
}

function buildFinalPlayerCardSnapshot({
  season,
  peerRatingsByPlayer = {},
  renderedPlayerCardSnapshot = null,
}) {
  if (!season || typeof season !== "object") {
    return {
      createdAt: new Date().toISOString(),
      seasonId: "",
      players: {},
    };
  }

  const history = Array.isArray(season.matchDayHistory)
    ? season.matchDayHistory
    : [];

  const events = [
    ...history.flatMap((day) =>
      Array.isArray(day?.allEvents) ? day.allEvents : []
    ),
    ...(Array.isArray(season.allEvents) ? season.allEvents : []),
    ...(Array.isArray(season.currentEvents) ? season.currentEvents : []),
  ];

  const results = [
    ...history.flatMap((day) =>
      Array.isArray(day?.results) ? day.results : []
    ),
    ...(Array.isArray(season.results) ? season.results : []),
  ];

  const playerAppearances = history.flatMap((day) =>
    Array.isArray(day?.playerAppearances)
      ? day.playerAppearances.map((entry) => ({
          ...entry,
          matchDayId:
            entry?.matchDayId ||
            day?.id ||
            day?.matchDayId ||
            day?.date ||
            "",
          matchDayCreatedAt:
            entry?.matchDayCreatedAt || day?.createdAt || "",
        }))
      : []
  );

  return {
    createdAt: new Date().toISOString(),
    seasonId: season.seasonId || "",
    seasonNo: Number(season.seasonNo || 0),
    source: renderedPlayerCardSnapshot?.players
      ? "end_season_exact_rendered_player_card_snapshot"
      : "end_season_frozen_player_card_snapshot",
    players: renderedPlayerCardSnapshot?.players || {},
    renderedSnapshotCreatedAt: renderedPlayerCardSnapshot?.createdAt || null,
    weights: {
      formStats: 0.55,
      formPeer: 0.45,
      attributeAdmin: 0.5,
      attributePeer: 0.5,
      overallStats: 0.4,
      overallPeer: 0.3,
      overallForm: 0.3,
    },
    teams: Array.isArray(season.teams) ? season.teams : [],
    events,
    results,
    playerAppearances,
    peerRatingsByPlayer: peerRatingsByPlayer || {},
  };
}

async function saveParticipationForMatchDay({
  seasonId,
  seasonNo,
  matchDayId,
  createdAtISO,
  playerAppearances,
  dataScope = null,
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
    const attendanceRef = isPracticeDataScope(dataScope)
      ? doc(
          db,
          dataScopeDocPath(
            "attendance",
            attendanceDocId,
            dataScope
          )
        )
      : doc(
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


function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeReturnedHighlight(raw, fallbackMatchNo = null, fallbackGameFormat = "5_V_5") {
  if (!raw || typeof raw !== "object") return null;

  const clipId =
    String(raw.clipId || raw.id || raw.highlightId || "").trim() ||
    `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const tag = String(raw.tag || raw.type || raw.category || "goal").trim() || "goal";
  const normalizedTag = safeLower(tag).includes("save")
    ? "save"
    : safeLower(tag).includes("skill")
    ? "skill"
    : "goal";

  const scorerLike =
    raw.goalScorerName ||
    raw.goalScorer ||
    raw.scorer ||
    raw.playerName ||
    raw.keeperName ||
    raw.skillPlayer ||
    "";

  const teamName =
    raw.teamName ||
    raw.teamLabel ||
    raw.team ||
    "";

  const mediaUrl =
    raw.videoUrl ||
    raw.downloadUrl ||
    raw.mediaUrl ||
    raw.fileUrl ||
    raw.uri ||
    raw.videoUri ||
    "";

  return {
    clipId,
    id: clipId,
    highlightId: clipId,
    tag: normalizedTag,
    type: normalizedTag,
    title: raw.title || "",
    playerName: toTitleCaseLoose(scorerLike || "Unknown"),
    goalScorerName: normalizedTag === "goal" ? toTitleCaseLoose(scorerLike || "Unknown") : "",
    scorer: normalizedTag === "goal" ? toTitleCaseLoose(scorerLike || "Unknown") : "",
    keeperName: normalizedTag === "save" ? toTitleCaseLoose(scorerLike || "Unknown") : "",
    skillPlayer: normalizedTag === "skill" ? toTitleCaseLoose(scorerLike || "Unknown") : "",
    teamId: raw.teamId || null,
    teamName: teamName ? toTitleCaseLoose(teamName) : "",
    matchId: raw.matchId || null,
    matchNo:
      Number.isFinite(Number(raw.matchNo)) && Number(raw.matchNo) > 0
        ? Number(raw.matchNo)
        : fallbackMatchNo,
    seasonId: raw.seasonId || null,
    gameFormat: raw.gameFormat || fallbackGameFormat,
    videoUrl: mediaUrl,
    downloadUrl: mediaUrl,
    mediaUrl,
    fileUrl: mediaUrl,
    uri: mediaUrl,
    createdAt: raw.createdAt || raw.timestamp || new Date().toISOString(),
    thumbnailUrl: raw.thumbnailUrl || raw.thumbnail || "",
    votes: 0,
  };
}

function parseHighlightsReturnPayloadFromUrl(urlLike) {
  if (!urlLike || typeof urlLike !== "string") return [];
  const url = String(urlLike);
  const payloadMatch = url.match(/[?&]payload=([^&]+)/);
  if (!payloadMatch) return [];
  const decoded = decodeURIComponent(payloadMatch[1] || "");
  const parsed = safeJsonParse(decoded, null);
  if (!parsed) return [];

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.highlights)) return parsed.highlights;
  if (Array.isArray(parsed.clips)) return parsed.clips;
  if (parsed.highlight || parsed.clip) return [parsed.highlight || parsed.clip];
  return [parsed];
}

function buildCurrentMatchDayId(activeSeasonId, gameFormat, currentMatchNo, matchType = null) {
  const today = new Date().toISOString().slice(0, 10);
  const resolvedType = normalizeMatchMode(matchType || gameFormat, MATCH_TYPE.FRIENDLY);

  if (resolvedType === MATCH_TYPE.LEAGUE) {
    return `${String(activeSeasonId || "season").trim() || "season"}__${today}`;
  }

  const safeFormat = normalizeGameFormat(gameFormat, GAME_FORMAT.FIVE_V_FIVE)
    .toLowerCase()
    .replace(/_/g, "");

  return `${safeFormat}__${today}`;
}

function buildVideoHighlightsMatchId({
  activeSeasonId,
  gameFormat,
  currentMatchNo,
  matchType,
  currentMatch,
} = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const resolvedType = normalizeMatchMode(matchType || gameFormat, MATCH_TYPE.FRIENDLY);
  const resolvedFormat = normalizeGameFormat(gameFormat || GAME_FORMAT.FIVE_V_FIVE)
    .toLowerCase()
    .replace(/_/g, "");

  if (resolvedType === MATCH_TYPE.LEAGUE) {
    const seasonPart = String(activeSeasonId || "season").trim() || "season";
    const matchPart = Number(currentMatchNo || 1);
    const teamA = String(currentMatch?.teamAId || "teamA")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "");
    const teamB = String(currentMatch?.teamBId || "teamB")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "");

    return `league__${seasonPart}__match_${matchPart}__${teamA}_vs_${teamB}`;
  }

  return `friendly__${resolvedFormat}__${today}`;
}


function buildRawHighlightFirebaseDoc(highlight, options = {}) {
  const {
    matchDayId,
    currentMatchNo = 1,
    activeSeasonId = null,
    matchType = MATCH_TYPE.FRIENDLY,
    gameFormat = "5_V_5",
    identity = null,
  } = options;

  const safeClipId = String(
    highlight?.clipId || highlight?.id || highlight?.highlightId || ""
  ).trim();

  if (!safeClipId) return null;

  const safeTag = String(highlight?.tag || highlight?.type || "goal").trim() || "goal";
  const createdBy =
    identity?.memberId ||
    identity?.playerId ||
    identity?.email ||
    identity?.shortName ||
    identity?.fullName ||
    identity?.displayName ||
    null;

  return {
    clipId: safeClipId,
    matchDayId: String(matchDayId || "").trim() || null,
    matchId: highlight?.matchId || null,
    matchNo:
      Number.isFinite(Number(highlight?.matchNo)) && Number(highlight?.matchNo) > 0
        ? Number(highlight.matchNo)
        : Number(currentMatchNo || 1),
    seasonId: matchType === MATCH_TYPE.FRIENDLY ? null : activeSeasonId || highlight?.seasonId || null,
    matchType: normalizeMatchMode(matchType || highlight?.matchType || gameFormat),
    gameFormat: normalizeGameFormat(gameFormat || highlight?.gameFormat || GAME_FORMAT.FIVE_V_FIVE),
    tag: safeTag,
    type: safeTag,
    playerName: highlight?.playerName || null,
    goalScorerName:
      safeLower(safeTag).includes("goal")
        ? highlight?.goalScorerName || highlight?.scorer || highlight?.playerName || null
        : null,
    scorer:
      safeLower(safeTag).includes("goal")
        ? highlight?.scorer || highlight?.goalScorerName || highlight?.playerName || null
        : null,
    keeperName:
      safeLower(safeTag).includes("save")
        ? highlight?.keeperName || highlight?.playerName || null
        : null,
    skillPlayer:
      safeLower(safeTag).includes("skill")
        ? highlight?.skillPlayer || highlight?.playerName || null
        : null,
    teamId: highlight?.teamId || null,
    teamName: highlight?.teamName || null,
    title: highlight?.title || null,
    videoUrl:
      highlight?.videoUrl ||
      highlight?.downloadUrl ||
      highlight?.mediaUrl ||
      highlight?.fileUrl ||
      highlight?.uri ||
      null,
    thumbnailUrl: highlight?.thumbnailUrl || highlight?.thumbnail || null,
    status: "raw",
    createdBy,
    createdAtISO: highlight?.createdAt || new Date().toISOString(),
    updatedAtISO: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}


async function saveHighlightVotesToFirebase({
  matchDayId,
  userId,
  userName,
  votesByUser,
  activeClubId = DEFAULT_CLUB_ID,
}) {
  const safeMatchDayId = String(matchDayId || "").trim();
  const safeUserId = String(userId || "").trim();
  if (!safeMatchDayId || !safeUserId) return;

  const userVotes = votesByUser?.[safeUserId] || {};
  const voteRef = doc(db, clubDocPath("matchdays", safeMatchDayId, activeClubId), "highlight_votes", safeUserId);

  await setDoc(
    voteRef,
    {
      userId: safeUserId,
      userName: String(userName || "").trim() || "Unknown",
      goal: userVotes.goal || null,
      skill: userVotes.skill || null,
      save: userVotes.save || null,
      updatedAtISO: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function loadHighlightVotesFromFirebase(matchDayId, activeClubId = DEFAULT_CLUB_ID) {
  const safeMatchDayId = String(matchDayId || "").trim();
  if (!safeMatchDayId) return {};

  const votesRef = collection(db, clubDocPath("matchdays", safeMatchDayId, activeClubId), "highlight_votes");
  const snapshot = await getDocs(votesRef);

  const votes = {};
  snapshot.forEach((docSnap) => {
    const raw = docSnap.data?.() || {};
    const userId = String(raw.userId || docSnap.id || "").trim();
    if (!userId) return;
    votes[userId] = {
      goal: raw.goal || null,
      skill: raw.skill || null,
      save: raw.save || null,
    };
  });

  return votes;
}


async function archiveWinningHighlightsToFirebase({
  matchDayId,
  archiveSelection,
  activeSeasonId,
  matchType = MATCH_TYPE.FRIENDLY,
  gameFormat,
  currentMatchNo,
  activeClubId = DEFAULT_CLUB_ID,
}) {
  const safeMatchDayId = String(matchDayId || "").trim();
  if (!safeMatchDayId) return;

  const selection = archiveSelection || {};
  const topGoals = Array.isArray(selection.topGoals) ? selection.topGoals : [];
  const bestSkill = selection.bestSkill || null;
  const bestSave = selection.bestSave || null;

  const winners = [
    ...topGoals.map((item, index) => ({
      ...item,
      archiveCategory: "goal",
      archiveRank: index + 1,
      goalScorerName: toTitleCaseLoose(
        item?.goalScorerName || item?.scorer || item?.playerName || "Unknown"
      ),
    })),
    ...(bestSkill
      ? [
          {
            ...bestSkill,
            archiveCategory: "skill",
            archiveRank: 1,
          },
        ]
      : []),
    ...(bestSave
      ? [
          {
            ...bestSave,
            archiveCategory: "save",
            archiveRank: 1,
          },
        ]
      : []),
  ];

  const batch = writeBatch(db);

  winners.forEach((winner, index) => {
    const clipId = String(winner?.clipId || winner?.id || `winner-${index}`).trim();
    if (!clipId) return;

    const archiveRef = doc(db, clubDocPath("matchdays", safeMatchDayId, activeClubId), "archived_highlights", clipId);

    batch.set(
      archiveRef,
      {
        ...winner,
        clipId,
        id: clipId,
        seasonId: matchType === MATCH_TYPE.FRIENDLY ? null : activeSeasonId || null,
        matchType: normalizeMatchMode(matchType || gameFormat),
        gameFormat: normalizeGameFormat(gameFormat || GAME_FORMAT.FIVE_V_FIVE),
        matchNo: Number(currentMatchNo || winner?.matchNo || 1),
        archivedAtISO: new Date().toISOString(),
        archivedAt: serverTimestamp(),
        status: "archived",
      },
      { merge: true }
    );
  });

  await batch.commit();
}

async function clearRawHighlightsFromFirebase(matchDayId, activeClubId = DEFAULT_CLUB_ID) {
  const safeMatchDayId = String(matchDayId || "").trim();
  if (!safeMatchDayId) return;

  const rawRef = collection(db, clubDocPath("matchdays", safeMatchDayId, activeClubId), "raw_highlights");
  const snapshot = await getDocs(rawRef);

  const deletions = snapshot.docs.map((docSnap) =>
    deleteDoc(doc(db, clubDocPath("matchdays", safeMatchDayId, activeClubId), "raw_highlights", docSnap.id))
  );
  await Promise.all(deletions);
}

function buildCameraPlayersFromLineupSnapshot(snapshot, teamId) {
  if (!snapshot || typeof snapshot !== "object") return [];

  const seen = new Set();
  const out = [];

  const pushPlayer = (rawName) => {
    const name = toTitleCaseLoose(rawName || "");
    if (!name) return;

    const id = slugFromLooseName(name);
    if (!id || seen.has(id)) return;

    seen.add(id);
    out.push({
      id,
      name,
      teamId: teamId || null,
    });
  };

  Object.values(snapshot.positions || {}).forEach(pushPlayer);
  (snapshot.benchSnapshot || []).forEach(pushPlayer);
  (snapshot.guestPlayers || []).forEach(pushPlayer);

  return out;
}

function buildCameraPlayersFromTeam(team = {}, teamId) {
  const seen = new Set();
  const out = [];

  (team?.players || []).forEach((entry) => {
    const rawName =
      typeof entry === "string"
        ? entry
        : entry?.name ||
          entry?.displayName ||
          entry?.fullName ||
          entry?.shortName ||
          "";

    const name = toTitleCaseLoose(rawName || "");
    if (!name) return;

    const id =
      String(
        (typeof entry === "object" &&
          (entry?.id || entry?.playerId || entry?.memberId)) ||
          slugFromLooseName(name)
      ).trim() || slugFromLooseName(name);

    if (!id || seen.has(id)) return;

    seen.add(id);
    out.push({
      id,
      name,
      teamId: teamId || null,
    });
  });

  return out;
}

function resolveCameraLaunchTeams({
  teams = [],
  currentMatch = null,
  currentConfirmedLineupSnapshot = null,
  confirmedLineupsByMatchNo = {},
  currentMatchNo = 1,
}) {
  const teamAId = currentMatch?.teamAId || null;
  const teamBId = currentMatch?.teamBId || null;

  const teamA = (teams || []).find((team) => team?.id === teamAId) || null;
  const teamB = (teams || []).find((team) => team?.id === teamBId) || null;

  const snapshotBundle =
    currentConfirmedLineupSnapshot ||
    confirmedLineupsByMatchNo?.[currentMatchNo] ||
    null;

  const snapshotA = teamAId ? snapshotBundle?.[teamAId] || null : null;
  const snapshotB = teamBId ? snapshotBundle?.[teamBId] || null : null;

  const teamAPlayers =
    buildCameraPlayersFromLineupSnapshot(snapshotA, teamAId).length > 0
      ? buildCameraPlayersFromLineupSnapshot(snapshotA, teamAId)
      : buildCameraPlayersFromTeam(teamA, teamAId);

  const teamBPlayers =
    buildCameraPlayersFromLineupSnapshot(snapshotB, teamBId).length > 0
      ? buildCameraPlayersFromLineupSnapshot(snapshotB, teamBId)
      : buildCameraPlayersFromTeam(teamB, teamBId);

  return {
    teamAId,
    teamBId,
    teamAName: teamA?.label || "Team A",
    teamBName: teamB?.label || "Team B",
    teamAPlayers,
    teamBPlayers,
    hasVerifiedSnapshots: Boolean(snapshotA && snapshotB),
  };
}

function buildCameraLiveContext({
  activeSeasonId,
  matchType = MATCH_TYPE.LEAGUE,
  gameFormat,
  currentMatchNo,
  launchTeams,
}) {
  if (!launchTeams?.teamAId || !launchTeams?.teamBId) return null;
  if (!launchTeams.teamAPlayers?.length || !launchTeams.teamBPlayers?.length) {
    return null;
  }

  return {
    matchIsLive: true,
    seasonId: activeSeasonId || null,
    matchType: normalizeMatchMode(matchType || MATCH_TYPE.LEAGUE),
    gameFormat: normalizeGameFormat(gameFormat || GAME_FORMAT.FIVE_V_FIVE),
    matchId: `tk-${activeSeasonId || "season"}-${currentMatchNo || 1}`,
    matchNo: Number(currentMatchNo || 1),
    teamAId: launchTeams.teamAId,
    teamBId: launchTeams.teamBId,
    teamAName: launchTeams.teamAName || "Team A",
    teamBName: launchTeams.teamBName || "Team B",
    teamAPlayers: Array.isArray(launchTeams.teamAPlayers)
      ? launchTeams.teamAPlayers
      : [],
    teamBPlayers: Array.isArray(launchTeams.teamBPlayers)
      ? launchTeams.teamBPlayers
      : [],
    updatedAtISO: new Date().toISOString(),
  };
}

async function writeCameraLiveContextToFirebase(cameraLiveContext, clubId = DEFAULT_CLUB_ID) {
  const safeClubId = String(clubId || DEFAULT_CLUB_ID).trim() || DEFAULT_CLUB_ID;
  const appStateRef = doc(db, "clubs", safeClubId, "state", "main");

  await setDoc(
    appStateRef,
    {
      cameraLiveContext: cameraLiveContext || null,
      updatedAt: serverTimestamp(),
      updatedAtISO: new Date().toISOString(),
    },
    { merge: true }
  );
}

function buildMatchMetadata({ matchType, gameFormat, matchMode } = {}) {
  const resolvedMatchType = normalizeMatchMode(
    matchType || gameFormat,
    MATCH_TYPE.FRIENDLY
  );
  const resolvedGameFormat = normalizeGameFormat(
    gameFormat || GAME_FORMAT.FIVE_V_FIVE,
    GAME_FORMAT.FIVE_V_FIVE
  );

  return {
    matchType: resolvedMatchType,
    gameFormat: resolvedGameFormat,
    matchMode:
      resolvedMatchType === MATCH_TYPE.LEAGUE
        ? matchMode === "scheduled_target"
          ? "scheduled_target"
          : "round_robin"
        : null,
  };
}

function isFriendlyRecord(record = {}) {
  const metaType = normalizeMatchMode(
    record?.matchType || record?.matchMode || record?.gameFormat || "",
    MATCH_TYPE.LEAGUE
  );

  return metaType === MATCH_TYPE.FRIENDLY;
}

function splitRecordsByMatchType(records = []) {
  const league = [];
  const friendly = [];

  (Array.isArray(records) ? records : []).forEach((record) => {
    if (isFriendlyRecord(record)) friendly.push(record);
    else league.push(record);
  });

  return { league, friendly };
}

function attachMatchMetadataToRecords(records = [], meta = {}) {
  return (Array.isArray(records) ? records : []).map((record) => ({
    ...record,
    ...meta,
  }));
}

function getRecordMatchType(record = {}) {
  return normalizeMatchMode(
    record?.matchType || record?.matchMode || record?.gameFormat || "",
    MATCH_TYPE.LEAGUE
  );
}

function getNextMatchNoForMatchType({
  matchType,
  currentResults = [],
}) {
  const wantedType = normalizeMatchMode(matchType, MATCH_TYPE.FRIENDLY);

  const liveResults = (Array.isArray(currentResults) ? currentResults : []).filter(
    (result) => getRecordMatchType(result) === wantedType
  );

  const maxNo = liveResults.reduce((max, result) => {
    const n = Number(result?.matchNo);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return maxNo + 1;
}

function buildFriendlyMatchArchiveId({
  gameFormat,
  matchNo,
  createdAt = new Date(),
}) {
  const datePart = createdAt.toISOString().slice(0, 10);
  const safeFormat = normalizeGameFormat(
    gameFormat || GAME_FORMAT.FIVE_V_FIVE,
    GAME_FORMAT.FIVE_V_FIVE
  )
    .toLowerCase()
    .replace(/_/g, "");

  return `${safeFormat}__${datePart}__match-${Number(matchNo || 1)}`;
}

function getDefaultMatchSecondsForType(rawMatchType) {
  const safeMatchType = normalizeMatchMode(rawMatchType, MATCH_TYPE.FRIENDLY);
  return safeMatchType === MATCH_TYPE.LEAGUE
    ? DEFAULT_LEAGUE_MATCH_SECONDS
    : DEFAULT_FRIENDLY_MATCH_SECONDS;
}

function normalizeMatchSecondsValue(value, fallbackSeconds) {
  const safeSeconds = Number(value);
  const fallback = Number(fallbackSeconds);

  if (Number.isFinite(safeSeconds) && safeSeconds >= 60) {
    return Math.round(safeSeconds);
  }

  return Number.isFinite(fallback) && fallback >= 60
    ? Math.round(fallback)
    : DEFAULT_MATCH_SECONDS;
}

function normalizeMatchSecondsByType(value = {}) {
  const raw = value && typeof value === "object" ? value : {};

  return {
    [MATCH_TYPE.LEAGUE]: normalizeMatchSecondsValue(
      raw[MATCH_TYPE.LEAGUE] ?? raw.LEAGUE ?? raw.league,
      DEFAULT_LEAGUE_MATCH_SECONDS
    ),
    [MATCH_TYPE.FRIENDLY]: normalizeMatchSecondsValue(
      raw[MATCH_TYPE.FRIENDLY] ?? raw.FRIENDLY ?? raw.friendly,
      DEFAULT_FRIENDLY_MATCH_SECONDS
    ),
  };
}

function getMatchSecondsForType(matchSecondsByType, rawMatchType) {
  const safeMatchType = normalizeMatchMode(rawMatchType, MATCH_TYPE.FRIENDLY);
  const defaults = getDefaultMatchSecondsForType(safeMatchType);
  return normalizeMatchSecondsValue(matchSecondsByType?.[safeMatchType], defaults);
}

function secondsLeftFromExpectedEnd(expectedEndAtISO) {
  const endMs = new Date(expectedEndAtISO || "").getTime();
  if (!Number.isFinite(endMs)) return null;
  return Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
}

function addSecondsToISO(startISO, seconds) {
  const startMs = new Date(startISO || Date.now()).getTime();
  const safeStart = Number.isFinite(startMs) ? startMs : Date.now();
  return new Date(safeStart + Math.max(0, Number(seconds || 0)) * 1000).toISOString();
}

function roundDateToNearestQuarterHour(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return null;

  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.round(rounded.getMinutes() / 15) * 15);

  return rounded;
}

function buildClubOfficialScheduledFinishISO(playTime, startISO) {
  const start = new Date(startISO || Date.now());
  const match = String(playTime || "").match(
    /(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\D|$)/
  );

  if (!match || !Number.isFinite(start.getTime())) return null;

  const scheduledStart = new Date(start);
  scheduledStart.setHours(Number(match[1]), Number(match[2]), 0, 0);

  const scheduledFinish = new Date(scheduledStart);
  scheduledFinish.setMinutes(scheduledFinish.getMinutes() + 60);

  return scheduledFinish.toISOString();
}

function buildClubScheduledFinishISO(playTime, startISO, fallbackSeconds) {
  const start = new Date(startISO || Date.now());

  if (!Number.isFinite(start.getTime())) {
    return addSecondsToISO(startISO, fallbackSeconds);
  }

  const officialFinishISO = buildClubOfficialScheduledFinishISO(
    playTime,
    startISO
  );

  if (!officialFinishISO) {
    const recommended = roundDateToNearestQuarterHour(
      new Date(start.getTime() + Math.max(0, Number(fallbackSeconds || 3600)) * 1000)
    );

    return recommended?.toISOString() || addSecondsToISO(startISO, fallbackSeconds);
  }

  const officialFinish = new Date(officialFinishISO);
  const scheduledStart = new Date(officialFinish);
  scheduledStart.setMinutes(scheduledStart.getMinutes() - 60);

  // Treat kickoff as part of the scheduled session when it begins
  // no more than 30 minutes before the scheduled start and no more
  // than 30 minutes after it.
  const earliestScheduledKickoff = scheduledStart.getTime() - 30 * 60 * 1000;
  const latestScheduledKickoff = scheduledStart.getTime() + 30 * 60 * 1000;
  const kickoffIsNearSchedule =
    start.getTime() >= earliestScheduledKickoff &&
    start.getTime() <= latestScheduledKickoff;

  if (kickoffIsNearSchedule && officialFinish.getTime() > start.getTime()) {
    return officialFinish.toISOString();
  }

  const recommended = roundDateToNearestQuarterHour(
    new Date(start.getTime() + 60 * 60 * 1000)
  );

  return recommended?.toISOString() || addSecondsToISO(startISO, fallbackSeconds);
}

function touchLiveMatchDraft(draft, patch = {}) {
  if (!draft || typeof draft !== "object") return draft || null;
  const secondsLeft = secondsLeftFromExpectedEnd(draft.expectedEndAtISO);
  return {
    ...draft,
    ...patch,
    lastKnownSecondsLeft:
      secondsLeft != null && Number.isFinite(Number(secondsLeft))
        ? Number(secondsLeft)
        : Number(draft.lastKnownSecondsLeft || draft.matchSeconds || 0),
    lastSavedAtISO: new Date().toISOString(),
  };
}

function buildPendingContextFromLiveDraft(draft) {
  if (!draft || typeof draft !== "object") return null;
  return {
    matchNo: Number(draft.matchNo || 1),
    createdAt: draft.startedAtISO || new Date().toISOString(),
    currentMatch: draft.currentMatch || null,
    teams: Array.isArray(draft.teams) ? draft.teams : [],
    fiveVFiveTeams: Array.isArray(draft.fiveVFiveTeams) ? draft.fiveVFiveTeams : [],
    identity: draft.startedBy || null,
    matchType: normalizeMatchMode(draft.matchType, MATCH_TYPE.FRIENDLY),
    gameFormat: normalizeGameFormat(draft.gameFormat, GAME_FORMAT.FIVE_V_FIVE),
    activeTeamIds: Array.isArray(draft.activeTeamIds) ? draft.activeTeamIds : [],
    matchMode: draft.matchMode || "round_robin",
    scheduledTarget: draft.scheduledTarget ?? null,
    recoveredFromDraft: true,
  };
}

function buildRecoveredSummaryFromLiveDraft(draft) {
  if (!draft || typeof draft !== "object") return null;
  const currentMatch = draft.currentMatch || {};
  const teamAId = currentMatch.teamAId || null;
  const teamBId = currentMatch.teamBId || null;
  if (!teamAId || !teamBId) return null;

  const teams = Array.isArray(draft.teams) && draft.teams.length
    ? draft.teams
    : Array.isArray(draft.fiveVFiveTeams)
      ? draft.fiveVFiveTeams
      : [];

  const teamA = teams.find((team) => team?.id === teamAId) || null;
  const teamB = teams.find((team) => team?.id === teamBId) || null;
  const events = Array.isArray(draft.currentEvents) ? draft.currentEvents : [];

  return {
    teamAId,
    teamBId,
    standbyId: currentMatch.standbyId || null,
    goalsA: events.filter((e) => e?.type === "goal" && e?.teamId === teamAId).length,
    goalsB: events.filter((e) => e?.type === "goal" && e?.teamId === teamBId).length,
    teamALabel: teamA?.label || teamAId || "Team A",
    teamBLabel: teamB?.label || teamBId || "Team B",
    teamASnapshot: teamA,
    teamBSnapshot: teamB,
  };
}


function parseClubWeeklyWindow(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return null;

  const dayMap = {
    sunday: 0, sundays: 0,
    monday: 1, mondays: 1,
    tuesday: 2, tuesdays: 2,
    wednesday: 3, wednesdays: 3,
    thursday: 4, thursdays: 4,
    friday: 5, fridays: 5,
    saturday: 6, saturdays: 6,
  };

  const dayKey = Object.keys(dayMap).find((key) => raw.includes(key));
  const timeMatch = raw.match(/(\d{1,2})[:h](\d{2})(?:\s*[–-]\s*(\d{1,2})[:h](\d{2}))?/);

  if (!dayKey || !timeMatch) return null;

  const [, sh, sm, rawEh, rawEm] = timeMatch;
  const eh = rawEh || String(Number(sh) + 2);
  const em = rawEm || sm;
  return {
    day: dayMap[dayKey],
    startMinutes: Number(sh) * 60 + Number(sm),
    endMinutes: Number(eh) * 60 + Number(em),
  };
}

function isInsideClubWeeklyWindow(weeklyPlayTime, now = new Date()) {
  const windowInfo = parseClubWeeklyWindow(weeklyPlayTime);
  if (!windowInfo) return false;

  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 30-minute grace before and after the official window.
  return (
    currentDay === windowInfo.day &&
    currentMinutes >= windowInfo.startMinutes - 30 &&
    currentMinutes <= windowInfo.endMinutes + 30
  );
}


const FANM_TESTING_DEPLOYMENT =
  import.meta.env.VITE_FANM_TESTING_SITE === "true";

const FANM_DEVELOPMENT_DEPLOYMENT =
  import.meta.env.VITE_FANM_DEVELOPMENT_SITE === "true";

const FANM_ENVIRONMENT_BADGE = FANM_DEVELOPMENT_DEPLOYMENT
  ? {
      className: "fanm-environment-badge fanm-environment-badge--development",
      ariaLabel: "Development version",
      icon: "🛠️",
      title: "DEV VERSION",
      subtitle: "fanm-development",
    }
  : FANM_TESTING_DEPLOYMENT
    ? {
        className: "fanm-environment-badge fanm-environment-badge--testing",
        ariaLabel: "Testing site",
        icon: "🧪",
        title: "TESTING SITE",
        subtitle: "fanm-testing",
      }
    : null;

export default function App() {
  useEffect(() => {
    if (!FANM_ENVIRONMENT_BADGE || typeof document === "undefined") {
      return undefined;
    }

    const badge = document.createElement("div");
    badge.className = FANM_ENVIRONMENT_BADGE.className;
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-label", FANM_ENVIRONMENT_BADGE.ariaLabel);
    badge.innerHTML = `
      <span class="fanm-environment-badge__icon" aria-hidden="true">${FANM_ENVIRONMENT_BADGE.icon}</span>
      <span class="fanm-environment-badge__copy">
        <strong>${FANM_ENVIRONMENT_BADGE.title}</strong>
        <small>${FANM_ENVIRONMENT_BADGE.subtitle}</small>
      </span>
    `;

    document.body.appendChild(badge);

    return () => {
      badge.remove();
    };
  }, []);

  const [entryPageIntent, setEntryPageIntent] = useState(null);
  const [page, setPage] = useState(PAGE_HOME);
  const [selectedHomeClub, setSelectedHomeClub] = useState(null);
  const [squadsAdminPreviewOpen, setSquadsAdminPreviewOpen] = useState(false);

  const {
    authUser,
    loading: authLoading,
    signInWithGoogle,
  } = useAuth();

  const [sessionMode, setSessionMode] = useState("official");
  const [practiceRuntime, setPracticeRuntime] = useState(null);
  const [practiceClockNowMs, setPracticeClockNowMs] = useState(() => Date.now());
  const [showSessionSelector, setShowSessionSelector] = useState(false);
  const [practiceRestrictionModal, setPracticeRestrictionModal] = useState(null);

  // Temporary visual cue on Choose Session:
  // after 4 seconds, alternate emphasis between Official and Practice
  // every 2 seconds for 10 seconds, then return both to normal size.
  const [sessionChoiceEmphasis, setSessionChoiceEmphasis] = useState(null);

  // Practice ribbon presentation only.
  // "open" = full persistent warning.
  // "left"/"right" = compact edge-hugging warning.
  // It can never be completely hidden.
  const [practiceRibbonPosition, setPracticeRibbonPosition] = useState("open");

  // Practice expiry lifecycle guards.
  // The wrap-up warning appears once per Practice session.
  // The 00:00 authoritative expiry is also handled only once.
  const practiceExpiryWarningAcknowledgedRef = useRef(false);
  const practiceExpiryHandledRef = useRef(false);

  const [officialStartWarning, setOfficialStartWarning] = useState(null);
  const officialStartOverrideRef = useRef(false);

  const isPracticeMode = sessionMode === "practice";

  useEffect(() => {
    if (!showSessionSelector) {
      setSessionChoiceEmphasis(null);
      return undefined;
    }

    // Initial 4-second pause, then:
    // 04s Official highlighted
    // 06s Practice highlighted
    // 08s Official highlighted
    // 10s Practice highlighted
    // 12s Official highlighted
    // 14s animation ends and both return to 100%.
    const timers = [
      window.setTimeout(
        () => setSessionChoiceEmphasis("official"),
        4000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("practice"),
        6000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("official"),
        8000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("practice"),
        10000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("official"),
        12000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis(null),
        14000
      ),
    ];

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [showSessionSelector]);

  useEffect(() => {
    if (!isPracticeMode || !practiceRuntime?.expiresAt) {
      return undefined;
    }

    // Display-only clock:
    // authoritative expiry remains the server-issued expiresAt.
    setPracticeClockNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setPracticeClockNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPracticeMode, practiceRuntime?.expiresAt]);

  const practiceRemainingSeconds = Math.max(
    0,
    Math.ceil(
      (
        Date.parse(practiceRuntime?.expiresAt || "") -
        practiceClockNowMs
      ) / 1000
    ) || 0
  );

  const practiceTimerLabel = `${String(
    Math.floor(practiceRemainingSeconds / 60)
  ).padStart(2, "0")}:${String(
    practiceRemainingSeconds % 60
  ).padStart(2, "0")}`;

  const showPracticeRestriction = (title, message, icon = "🔒") => {
    setPracticeRestrictionModal({ title, message, icon });
  };

  const closePracticeRestriction = () => {
    if (practiceRestrictionModal?.locked) return;
    setPracticeRestrictionModal(null);
  };

  const [identity, setIdentity] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const scopedRaw = window.localStorage.getItem(getIdentityStorageKey(DEFAULT_CLUB_ID));
      const legacyRaw = window.localStorage.getItem("tk_identity_v1");
      const raw = scopedRaw || legacyRaw;
      const parsed = raw ? ensureIdentityShape(JSON.parse(raw)) : null;

      if (parsed?.clubId && parsed.clubId !== DEFAULT_CLUB_ID) return null;
      return parsed ? { ...parsed, clubId: parsed.clubId || DEFAULT_CLUB_ID } : null;
    } catch {
      return null;
    }
  });

  const activeClubIdentity = useMemo(() => {
    const identityClub = identity?.clubId
      ? {
          id: identity.clubId,
          name: identity.clubName,
          shortName: identity.clubShortName,
          logoUrl: identity.clubLogoUrl,
          heroImage: identity.clubHeroImage,
        }
      : null;

    return buildClubIdentity(selectedHomeClub || identityClub || { id: DEFAULT_CLUB_ID });
  }, [
    selectedHomeClub,
    identity?.clubId,
    identity?.clubName,
    identity?.clubShortName,
    identity?.clubLogoUrl,
    identity?.clubHeroImage,
  ]);

  const activeClubId = activeClubIdentity.id;

  useEffect(() => {
    practiceExpiryWarningAcknowledgedRef.current = false;
    practiceExpiryHandledRef.current = false;
  }, [practiceRuntime?.practiceSessionId]);

  useEffect(() => {
    if (!isPracticeMode || !practiceRuntime?.expiresAt) {
      return;
    }

    // One-time wrap-up warning.
    // expiresAt remains authoritative; dismissing this notice does not
    // extend the session or alter the server-issued deadline.
    if (
      practiceRemainingSeconds > 0 &&
      practiceRemainingSeconds <= 45 &&
      !practiceExpiryWarningAcknowledgedRef.current
    ) {
      practiceExpiryWarningAcknowledgedRef.current = true;

      setPracticeRestrictionModal({
        title: "45 seconds remaining",
        message:
          "Your Practice session is almost over. Finish what you're doing now — " +
          "Practice will close automatically at 00:00.",
        icon: "⏳",
        buttonLabel: "OK",
      });

      return;
    }

    if (
      practiceRemainingSeconds !== 0 ||
      practiceExpiryHandledRef.current
    ) {
      return;
    }

    practiceExpiryHandledRef.current = true;

    // Lock the UI immediately at 00:00.
    setPracticeRestrictionModal({
      title: "Practice session ended",
      message:
        "Your 15-minute Practice session has ended. Returning you to Choose Session…",
      icon: "⏱️",
      locked: true,
    });

    let cancelled = false;

    const expirePractice = async () => {
      try {
        await endPracticeSession({
          clubId: activeClubId,
          reason: "time-expired",
        });
      } catch (err) {
        // Security does not depend on this request succeeding:
        // expired Practice writes are already rejected by the
        // authoritative Practice security boundary.
        console.error("[PRACTICE V2 EXPIRY CLEANUP ERROR]", err);
      }

      if (cancelled) return;

      setPracticeRuntime(null);
      setSessionMode("official");
      setPracticeRibbonPosition("open");
      setPracticeRestrictionModal(null);
      setShowSessionSelector(true);
      setPage(PAGE_SESSION_SELECTOR);
    };

    void expirePractice();

    return () => {
      cancelled = true;
    };
  }, [
    isPracticeMode,
    practiceRuntime?.expiresAt,
    practiceRuntime?.practiceSessionId,
    practiceRemainingSeconds,
    activeClubId,
  ]);

  const handleChangeProfile = async () => {
    if (isPracticeMode) {
      try {
        await endPracticeSession({
          clubId: activeClubId,
        });
      } catch (err) {
        console.error("[PRACTICE V2 END ERROR]", err);

        showPracticeRestriction(
          "Could not leave Practice yet",
          "We could not safely close this Practice session. Please try Change Profile again.",
          "⚠️"
        );

        return;
      }

      setPracticeRuntime(null);
      setSessionMode("official");
      setPracticeRestrictionModal(null);
      setPracticeRibbonPosition("open");
      setShowSessionSelector(false);
    }

    setPage(PAGE_ENTRY);
  };


  // Practice v2 refresh recovery:
  // recover the same authoritative session without consuming another credit.
  useEffect(() => {
    if (authLoading || !authUser || !activeClubId) return undefined;

    let cancelled = false;

    async function recoverPracticeSession() {
      try {
        const authoritativeSession =
          await getActivePracticeSession({
            clubId: activeClubId,
          });

        if (cancelled || !authoritativeSession) return;

        const runtime = await restorePracticeRuntime({
          clubId: activeClubId,
          authoritativeSession,
        });

        if (cancelled) return;

        setPracticeRuntime(runtime);
        setSessionMode("practice");
      } catch (err) {
        if (!cancelled) {
          console.warn(
            "[PRACTICE V2 RECOVERY]",
            err?.message || err
          );
        }
      }
    }

    recoverPracticeSession();

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, activeClubId]);

  // Practice v2 always preserves the real club identity.
  // Disposable football/session data is isolated exclusively by DataScope.
  const footballStateClubId = activeClubId;

  const footballDataScope =
    sessionMode === "practice"
      ? practiceRuntime?.dataScope || null
      : null;

  const activeClub = activeClubIdentity;
  const activeClubName = activeClubIdentity.name;

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const scopedRaw = window.localStorage.getItem(getIdentityStorageKey(activeClubId));
      const legacyRaw = activeClubId === DEFAULT_CLUB_ID
        ? window.localStorage.getItem("tk_identity_v1")
        : null;
      const raw = scopedRaw || legacyRaw;
      const parsed = raw ? ensureIdentityShape(JSON.parse(raw)) : null;

      if (parsed && (parsed.clubId || DEFAULT_CLUB_ID) === activeClubId) {
        setIdentity({ ...parsed, clubId: activeClubId });
      } else {
        setIdentity(null);
      }
    } catch {
      setIdentity(null);
    }
  }, [activeClubId]);

  const members = useMembers();
  const [showAdminReclaimNudge, setShowAdminReclaimNudge] = useState(true);
  const [preloadedPlayerPhotosByName, setPreloadedPlayerPhotosByName] = useState({});

  const handleEntryComplete = (payload) => {
    const safePayload = ensureIdentityShape(payload);
    setIdentity(safePayload);

    if (safePayload?.clubId) {
      setSelectedHomeClub((prev) =>
        prev?.id === safePayload.clubId
          ? prev
          : buildClubIdentity({
              id: safePayload.clubId,
              name: safePayload.clubName,
              shortName: safePayload.clubShortName,
              logoUrl: safePayload.clubLogoUrl,
              heroImage: safePayload.clubHeroImage,
            })
      );
    }

    if (typeof window !== "undefined") {
      const payloadClubId = safePayload?.clubId || activeClubId || DEFAULT_CLUB_ID;
      if (safePayload) {
        window.localStorage.setItem(
          getIdentityStorageKey(payloadClubId),
          JSON.stringify({ ...safePayload, clubId: payloadClubId })
        );
      } else {
        window.localStorage.removeItem(getIdentityStorageKey(payloadClubId));
      }
    }

    const nextRole = String(
      safePayload?.actingRole || safePayload?.role || safePayload?.realRole || ""
    ).trim().toLowerCase();

    const shouldChooseSession =
      ["admin", "captain"].includes(nextRole);

    setShowSessionSelector(shouldChooseSession);

    setPage(
      shouldChooseSession
        ? PAGE_SESSION_SELECTOR
        : PAGE_LANDING
    );
  };

  const [state, setState] = useState(() =>
    USE_V2 ? createDefaultStateV2() : loadState()
  );

  const activeSeasonIdForPeerRatings = USE_V2
    ? ensureV2StateShape(state)?.activeSeasonId || null
    : null;

  const peerRatingsFromHook = usePeerRatings(
    activeSeasonIdForPeerRatings,
    {
      activeClubId,
      isPracticeMode,
      dataScope: footballDataScope,
    }
  );
  const peerRatingsByPlayer = peerRatingsFromHook || {};

  const [statsReturnPage, setStatsReturnPage] = useState(PAGE_LANDING);
  const [paymentContext, setPaymentContext] = useState(null);
  const [smartOffset, setSmartOffset] = useState(() => {
    if (typeof window === "undefined") return 5;
    try {
      const scopedRaw = window.localStorage.getItem(getSmartOffsetStorageKey(DEFAULT_CLUB_ID));
      const legacyRaw = window.localStorage.getItem("tk_smart_offset_v1");
      const parsed = Number(scopedRaw || legacyRaw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
    } catch {
      return 5;
    }
  });

  const [matchSecondsByType, setMatchSecondsByType] = useState(() => {
    if (typeof window === "undefined") {
      return normalizeMatchSecondsByType();
    }

    try {
      const raw = window.localStorage.getItem(getMatchSecondsStorageKey(DEFAULT_CLUB_ID));
      return normalizeMatchSecondsByType(raw ? JSON.parse(raw) : null);
    } catch {
      return normalizeMatchSecondsByType();
    }
  });

  useEffect(() => {
    setRefereeDeviceId(getOrCreateRefereeDeviceId(activeClubId));
  }, [activeClubId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawSmartOffset = window.localStorage.getItem(getSmartOffsetStorageKey(activeClubId));
      const parsedSmartOffset = Number(rawSmartOffset);
      setSmartOffset(Number.isFinite(parsedSmartOffset) && parsedSmartOffset >= 0 ? parsedSmartOffset : 5);
    } catch {
      setSmartOffset(5);
    }

    try {
      const rawMatchSeconds = window.localStorage.getItem(getMatchSecondsStorageKey(activeClubId));
      setMatchSecondsByType(normalizeMatchSecondsByType(rawMatchSeconds ? JSON.parse(rawMatchSeconds) : null));
    } catch {
      setMatchSecondsByType(normalizeMatchSecondsByType());
    }
  }, [activeClubId]);

  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_MATCH_SECONDS);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [hasLiveMatch, setHasLiveMatch] = useState(false);
  const [refereeDeviceId, setRefereeDeviceId] = useState(() =>
    getOrCreateRefereeDeviceId(DEFAULT_CLUB_ID)
  );
  const [showLiveMatchRecoveryModal, setShowLiveMatchRecoveryModal] = useState(false);
  const [showTakeoverModal, setShowTakeoverModal] = useState(false);
  const [liveDraftRecoveryKey, setLiveDraftRecoveryKey] = useState("");

  const handleUpdateMatchSeconds = (nextSeconds, nextMatchType = matchType) => {
    if (running || hasLiveMatch) {
      window.alert("Finish or discard the live match before changing match length.");
      return;
    }

    const safeMatchType = normalizeMatchMode(nextMatchType, MATCH_TYPE.FRIENDLY);
    const fallbackSeconds = getDefaultMatchSecondsForType(safeMatchType);
    const safeSeconds = normalizeMatchSecondsValue(nextSeconds, fallbackSeconds);

    setMatchSecondsByType((prev) => ({
      ...normalizeMatchSecondsByType(prev),
      [safeMatchType]: safeSeconds,
    }));

    if (safeMatchType === normalizeMatchMode(matchType, MATCH_TYPE.FRIENDLY)) {
      setSecondsLeft(safeSeconds);
      setTimeUp(false);
    }
  };

  const handleUpdateLiveFinishTime = (nextFinishTime) => {
    const draftMatchType = normalizeMatchMode(
      liveMatchDraft?.matchType || matchType,
      MATCH_TYPE.FRIENDLY
    );

    if (draftMatchType !== MATCH_TYPE.FRIENDLY) {
      return;
    }

    if (!canControlCurrentLiveMatch || !liveMatchDraft) {
      window.alert("Only the current match referee can adjust the finish time.");
      return;
    }

    const match = String(nextFinishTime || "").trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);

    if (!match) {
      window.alert("Please choose a valid finish time.");
      return;
    }

    const currentEnd = new Date(liveMatchDraft.expectedEndAtISO || Date.now());
    const nextEnd = new Date(currentEnd);

    nextEnd.setHours(Number(match[1]), Number(match[2]), 0, 0);

    if (nextEnd.getTime() <= Date.now()) {
      window.alert("The finish time must be later than the current time.");
      return;
    }

    const nextExpectedEndAtISO = nextEnd.toISOString();
    const nextSecondsLeft =
      secondsLeftFromExpectedEnd(nextExpectedEndAtISO) ?? secondsLeft;

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
          expectedEndAtISO: nextExpectedEndAtISO,
          scheduledFinishSource: "referee_adjusted",
          finishTimeAdjustedAtISO: new Date().toISOString(),
          finishTimeAdjustedBy: buildCurrentRefereeController(),
        }),
      }));
    }

    setSecondsLeft(Math.max(0, nextSecondsLeft));
    setTimeUp(nextSecondsLeft <= 0);
    setRunning(nextSecondsLeft > 0);
  };

  const handleUpdateMatchTeamColorOverride = (
    teamId,
    nextColor
  ) => {
    if (
      !canControlCurrentLiveMatch ||
      !liveMatchDraft ||
      !teamId
    ) {
      window.alert(
        "Only the current match referee can change match colours."
      );
      return;
    }

    const safeColor = {
      teamColorName: String(
        nextColor?.teamColorName ||
        nextColor?.colorName ||
        ""
      ).trim(),
      colorName: String(
        nextColor?.colorName ||
        nextColor?.teamColorName ||
        ""
      ).trim(),
      teamColorHex: String(
        nextColor?.teamColorHex ||
        nextColor?.colorHex ||
        ""
      ).trim(),
      colorHex: String(
        nextColor?.colorHex ||
        nextColor?.teamColorHex ||
        ""
      ).trim(),
      updatedAtISO: new Date().toISOString(),
      updatedBy: buildCurrentRefereeController(),
    };

    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const existingOverrides =
          prevSeason?.liveMatchDraft
            ?.matchTeamColorOverrides || {};

        return {
          ...prevSeason,
          liveMatchDraft: touchLiveMatchDraft(
            prevSeason.liveMatchDraft,
            {
              matchTeamColorOverrides: {
                ...existingOverrides,
                [teamId]: safeColor,
              },
            }
          ),
        };
      });
    }
  };

  const handleResetMatchTeamColorOverrides = () => {
    if (
      !canControlCurrentLiveMatch ||
      !liveMatchDraft
    ) {
      window.alert(
        "Only the current match referee can reset match colours."
      );
      return;
    }

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(
          prevSeason.liveMatchDraft,
          {
            matchTeamColorOverrides: {},
            matchTeamColorsResetAtISO:
              new Date().toISOString(),
            matchTeamColorsResetBy:
              buildCurrentRefereeController(),
          }
        ),
      }));
    }
  };

  const handleUpdateRedCardRule = (nextRule) => {
    if (!canControlCurrentLiveMatch || !liveMatchDraft) {
      window.alert(
        "Only the current match referee can change discipline rules."
      );
      return;
    }

    const normalizedRule =
      String(nextRule || "").trim().toLowerCase() === "two_minute"
        ? "two_minute"
        : "permanent";

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(
          prevSeason.liveMatchDraft,
          {
            redCardRule: normalizedRule,
            redCardRuleUpdatedAtISO: new Date().toISOString(),
            redCardRuleUpdatedBy:
              buildCurrentRefereeController(),
          }
        ),
      }));
    }
  };

  const handleUpdateRotationReminder = (nextMode) => {
    if (!canControlCurrentLiveMatch || !liveMatchDraft) {
      window.alert(
        "Only the current match referee can adjust rotation reminders."
      );
      return;
    }

    const normalizedMode = ["time", "goals"].includes(
      String(nextMode || "").trim().toLowerCase()
    )
      ? String(nextMode).trim().toLowerCase()
      : "off";

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
          rotationReminderMode: normalizedMode,
          rotationReminderUpdatedAtISO: new Date().toISOString(),
          rotationReminderUpdatedBy: buildCurrentRefereeController(),
        }),
      }));
    }
  };

  const [pendingMatchStartContext, setPendingMatchStartContext] = useState(
    null
  );
  const [currentConfirmedLineupSnapshot, setCurrentConfirmedLineupSnapshot] =
    useState(null);
  const [currentConfirmedLineupTimeline, setCurrentConfirmedLineupTimeline] =
    useState([]);
  const [confirmedLineupsByMatchNo, setConfirmedLineupsByMatchNo] = useState(
    {}
  );

  const rawAdminName =
    identity?.displayName ||
    identity?.name ||
    "";

  const endMatchDayAdminName =
    typeof rawAdminName === "string" && rawAdminName.trim()
      ? rawAdminName
          .trim()
          .split(" ")[0]
          .replace(/[^a-zA-Z]/g, "")
      : "";

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState("");
  const [showClearOnlyConfirmModal, setShowClearOnlyConfirmModal] = useState(false);
  const [clearOnlyConfirmCode, setClearOnlyConfirmCode] = useState("");
  const [clearOnlyConfirmError, setClearOnlyConfirmError] = useState("");
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [saveConfirmCode, setSaveConfirmCode] = useState("");
  const [saveConfirmError, setSaveConfirmError] = useState("");
  const [pendingParticipationEntries, setPendingParticipationEntries] = useState(
    []
  );
  const [showAttendanceAudit, setShowAttendanceAudit] = useState(false);
  const [showAttendanceInfo, setShowAttendanceInfo] = useState(false);
  const [isBackupModalMobile, setIsBackupModalMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 520;
  });

  const [showEndSeasonModal, setShowEndSeasonModal] = useState(false);
  const [endSeasonCode, setEndSeasonCode] = useState("");
  const [endSeasonError, setEndSeasonError] = useState("");
  const [showSeasonCompleteModal, setShowSeasonCompleteModal] = useState(false);
  const [seasonCompleteDismissedKey, setSeasonCompleteDismissedKey] = useState(null);

  const [currentMatchDayHighlights, setCurrentMatchDayHighlights] = useState([]);
  const [highlightVotesByUser, setHighlightVotesByUser] = useState({});
  const [highlightArchiveSelection, setHighlightArchiveSelection] = useState(null);
  const [cameraInstallPrompt, setCameraInstallPrompt] = useState(null);


  const persistReturnedHighlightsToFirebase = async (items) => {
    // Practice v2 external-effect firewall:
    // returned camera clips belong only to Official Sessions.
    if (isPracticeMode) return;

    const safeItems = Array.isArray(items) ? items : [];
    if (!safeItems.length) return;

    const matchId = buildVideoHighlightsMatchId({
      activeSeasonId,
      gameFormat,
      currentMatchNo: activeMatchNo,
      matchType,
      currentMatch: effectiveLiveMatch,
    });

    await Promise.all(
      safeItems.map(async (item) => {
        const normalized = normalizeReturnedHighlight(
          item,
          activeMatchNo || 1,
          gameFormat || GAME_FORMAT.FIVE_V_FIVE
        );

        if (!normalized?.clipId) return;

        await VideoHighlightsRepository.importExternalHighlight({
          matchId,
          provider: normalized.source || "camera_return",
          externalClip: {
            ...normalized,
            matchId,
            seasonId: matchType === MATCH_TYPE.FRIENDLY ? null : activeSeasonId || null,
            matchType,
            gameFormat,
            matchNo: activeMatchNo,
            status: "pending",
            createdBy:
              identity?.memberId ||
              identity?.playerId ||
              identity?.email ||
              identity?.shortName ||
              "",
            createdByName:
              identity?.shortName ||
              identity?.fullName ||
              identity?.displayName ||
              identity?.email ||
              "Unknown",
          },
        });
      })
    );
  };


  const updateState = (updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (USE_V2) {
        const safe = ensureV2StateShape(next);
        saveStateV2(
          safe,
          footballStateClubId,
          footballDataScope
        );
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

        const nextSeason = { ...s, ...updated, updatedAt: new Date().toISOString() };

        if (
          isPracticeMode &&
          s?.matchType !== nextSeason?.matchType
        ) {
          console.warn("[PRACTICE MATCHTYPE WRITER TRACE]", {
            page,
            from: s?.matchType,
            to: nextSeason?.matchType,
            seasonId: s?.seasonId,
            gameFormatBefore: s?.gameFormat,
            gameFormatAfter: nextSeason?.gameFormat,
            stack: new Error().stack,
          });
        }

        return nextSeason;
      });
      return { ...safePrev, seasons, updatedAt: new Date().toISOString() };
    });
  };

  useEffect(() => {
    // Disabled localStorage bootstrap for V2.

    const unsubscribe = USE_V2
      ? subscribeToStateV2(
          (cloudState) => {
            if (!cloudState) return;

            const nextCloudState = ensureV2StateShape(cloudState);

            const cloudActiveSeason =
              nextCloudState?.seasons?.find((season) => season?.seasonId === nextCloudState?.activeSeasonId) ||
              nextCloudState?.seasons?.[0] ||
              null;

            console.warn("[CLOUD STATE DEBUG]", {
              activeClubId,
              dataScopeEnvironment: footballDataScope?.environment || "official",
              practiceSessionId: footballDataScope?.practiceSessionId || null,
              activeSeasonId: nextCloudState?.activeSeasonId,
              cloudMatchType: cloudActiveSeason?.matchType,
              cloudGameFormat: cloudActiveSeason?.gameFormat,
              cloudTeams: Array.isArray(cloudActiveSeason?.teams)
                ? cloudActiveSeason.teams.map((team) => ({
                    id: team?.id,
                    label: team?.label,
                    playersCount: Array.isArray(team?.players) ? team.players.length : 0,
                  }))
                : [],
            });
            setState((prev) => {
              try {
                if (JSON.stringify(prev) === JSON.stringify(nextCloudState)) {
                  return prev;
                }
              } catch (_) {
                // fall through to update
              }

              return nextCloudState;
            });
          },
          footballStateClubId,
          footballDataScope
        )
      : subscribeToState((cloudState) => {
          if (!cloudState) return;
          setState(cloudState);
        });

    return () => unsubscribe && unsubscribe();
  }, [
    footballStateClubId,
    footballDataScope,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function preloadClubPlayerPhotos() {
      const safeClubId = String(activeClubId || DEFAULT_CLUB_ID).trim() || DEFAULT_CLUB_ID;

      try {
        const snap = await getDocs(getPlayerPhotosCollection(db, safeClubId));
        if (cancelled) return;

        const next = {};

        const addPhotoKey = (key, photoData) => {
          const raw = String(key || "").trim();
          if (!raw || !photoData) return;

          const pretty = toTitleCaseLoose(raw);
          const slug = slugFromLooseName(raw);
          const first = pretty.split(/\s+/)[0] || "";

          [raw, pretty, safeLower(raw), safeLower(pretty), slug, first, safeLower(first)]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .forEach((candidate) => {
              if (!next[candidate]) next[candidate] = photoData;
            });
        };

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};

          const photoData =
            data.photoData ||
            data.photoUrl ||
            data.photo ||
            data.image ||
            data.imageUrl ||
            "";

          if (!photoData) return;

          [
            data.name,
            data.fullName,
            data.displayName,
            data.shortName,
            data.playerName,
            docSnap.id,
          ].forEach((key) => addPhotoKey(key, photoData));
        });

        setPreloadedPlayerPhotosByName(next);
      } catch (error) {
        console.error("[TK PHOTOS] Failed to preload club player photos:", error);
        if (!cancelled) setPreloadedPlayerPhotosByName({});
      }
    }

    preloadClubPlayerPhotos();

    return () => {
      cancelled = true;
    };
  }, [activeClubId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(getSmartOffsetStorageKey(activeClubId), String(smartOffset));
    } catch {
      // ignore localStorage failures
    }
  }, [smartOffset, activeClubId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        getMatchSecondsStorageKey(activeClubId),
        JSON.stringify(normalizeMatchSecondsByType(matchSecondsByType))
      );
    } catch {
      // ignore localStorage failures
    }
  }, [matchSecondsByType, activeClubId]);

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
    friendlyMatchDayHistory,
    playerPhotosByName,
    yearEndAttendance,
    liveMatchDraft;

  let safeV2ForStats = null;
  let activeSeasonNo = 1;
  let activeSeasonId = null;
  let matchType = MATCH_TYPE.FRIENDLY;
  let gameFormat = GAME_FORMAT.FIVE_V_FIVE;
  let activeTeamIds = [];
  let fiveVFiveTeams = buildDefaultFiveVFiveTeams();
  let matchMode = "round_robin";
  let scheduledTarget = null;
  let scheduledFixtures = [];
  liveMatchDraft = null;

  if (USE_V2) {
    const { safeV2, activeSeason } = getActiveSeasonFromV2State(state);
    safeV2ForStats = safeV2;

    const fallbackSeason =
      safeV2?.seasons?.[0] || createDefaultStateV2().seasons[0];
    activeSeasonId = safeV2?.activeSeasonId || fallbackSeason?.seasonId || null;
    const s = ensureSeasonSchedulingShape(activeSeason || fallbackSeason);
    console.log("[APP ACTIVE SEASON DEBUG]", {
      activeSeasonId,
      pickedSeasonId: s?.seasonId,
      pickedTeams: (s?.teams || []).map((t) => t?.label),
      currentMatch: s?.currentMatch,
      activeTeamIds: s?.activeTeamIds,
    });

    teams = s?.teams || [];
    currentMatchNo = s?.currentMatchNo || 1;
    currentMatch = s?.currentMatch || null;
    currentEvents = s?.currentEvents || [];
    results = s?.results || [];
    allEvents = s?.allEvents || [];
    streaks = s?.streaks || {};
    // Practice must start with its own disposable statistical history.
    // Never allow Official completed-session history to leak into Practice
    // Full Season stats. Practice-created history remains available because
    // Practice state itself is written into the isolated football DataScope.
    matchDayHistory =
      isPracticeMode && !s?.isPracticeSeason
        ? []
        : s?.matchDayHistory || [];
    friendlyMatchDayHistory =
      isPracticeMode && !s?.isPracticeSeason
        ? []
        : s?.friendlyMatchDayHistory || [];
    activeSeasonNo = Number(s?.seasonNo || 1);
    matchType = normalizeMatchMode(s?.matchType || s?.gameFormat || GAME_FORMAT.FIVE_V_FIVE);
    gameFormat = normalizeGameFormat(s?.gameFormat || GAME_FORMAT.FIVE_V_FIVE);
    activeTeamIds = Array.isArray(s?.activeTeamIds) ? s.activeTeamIds : [];
    fiveVFiveTeams =
      isPracticeMode || s?.isPracticeSeason || String(s?.seasonId || "").startsWith("practice")
        ? normalizeFiveVFiveTeams(s?.fiveVFiveTeams)
        : ensureFiveVFiveTeamsShape(s?.fiveVFiveTeams);
    matchMode = s?.matchMode || "round_robin";
    scheduledTarget =
      Number.isInteger(Number(s?.scheduledTarget)) ? Number(s.scheduledTarget) : null;
    scheduledFixtures = Array.isArray(s?.scheduledFixtures)
      ? s.scheduledFixtures
      : [];
    liveMatchDraft = s?.liveMatchDraft || null;

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
      friendlyMatchDayHistory = [],
      playerPhotosByName = {},
      yearEndAttendance = [],
    } = legacy || createDefaultState());

    matchType = normalizeMatchMode(legacy?.matchType || legacy?.gameFormat || GAME_FORMAT.FIVE_V_FIVE);
    gameFormat = normalizeGameFormat(legacy?.gameFormat || GAME_FORMAT.FIVE_V_FIVE);
    activeTeamIds = Array.isArray(legacy?.activeTeamIds)
      ? legacy.activeTeamIds
      : [];
    fiveVFiveTeams = ensureFiveVFiveTeamsShape(legacy?.fiveVFiveTeams);
    matchMode = legacy?.matchMode || "round_robin";
    scheduledTarget =
      Number.isInteger(Number(legacy?.scheduledTarget))
        ? Number(legacy.scheduledTarget)
        : null;
    scheduledFixtures = Array.isArray(legacy?.scheduledFixtures)
      ? legacy.scheduledFixtures
      : [];
  }

  const effectivePlayerPhotosByName = useMemo(
    () => ({
      ...(playerPhotosByName || {}),
      ...(preloadedPlayerPhotosByName || {}),
    }),
    [playerPhotosByName, preloadedPlayerPhotosByName]
  );

  const captainRoleTeams = useMemo(
    () =>
      matchType === MATCH_TYPE.FRIENDLY
        ? getActiveFriendlyTeams(fiveVFiveTeams)
        : teams || [],
    [matchType, fiveVFiveTeams, teams]
  );

  const activeRole = useMemo(
    () => deriveActiveRole(identity, captainRoleTeams || []),
    [identity, captainRoleTeams]
  );

  const realRole = useMemo(() => getRealStoredRole(identity), [identity]);
  const isAdminPreviewingAnotherRole = realRole === "admin" && activeRole !== "admin";

  const pageIdentity = useMemo(() => {
    if (!identity || typeof identity !== "object") return identity;

    return {
      ...identity,
      realRole,
      role: activeRole,
      actingRole: activeRole,
      isAdminPreviewingAnotherRole,
    };
  }, [identity, activeRole, realRole, isAdminPreviewingAnotherRole]);

  const isAdmin = activeRole === "admin";
  const isCaptain = activeRole === "captain";
  const canChooseSessionMode = isAdmin || isCaptain;
  const isPlayer = activeRole === "player";
  const isSpectator = activeRole === "spectator";

  const canStartMatch = isAdmin || isCaptain;

  const activeLiveController = liveMatchDraft?.controller || null;
  const liveMatchHasController = Boolean(activeLiveController?.deviceId);
  const isLiveMatchController =
    !liveMatchHasController ||
    String(activeLiveController?.deviceId || "") === String(refereeDeviceId || "");

  const canControlCurrentLiveMatch = Boolean(canStartMatch && isLiveMatchController);

  const canManageSquads = isAdmin || isCaptain;
  const canPreviewPreviousSeasonUI = IS_STAGING && isAdmin;
  const normalizedActiveTeamIds = useMemo(() => {
    const teamIds = (teams || []).map((team) => team?.id).filter(Boolean);
    const chosen = Array.from(
      new Set(
        (Array.isArray(activeTeamIds) ? activeTeamIds : []).filter((teamId) =>
          teamIds.includes(teamId)
        )
      )
    ).slice(0, 2);

    return chosen.length >= 2 ? chosen : teamIds.slice(0, 2);
  }, [teams, activeTeamIds]);

  const peerReviewTeams = useMemo(() => {
    const completedSessions = [
      ...(Array.isArray(matchDayHistory)
        ? matchDayHistory
        : []),
      ...(Array.isArray(friendlyMatchDayHistory)
        ? friendlyMatchDayHistory
        : []),
    ]
      .filter(
        (session) =>
          session &&
          typeof session === "object"
      )
      .sort(
        (left, right) =>
          getPeerReviewSessionTimestamp(right) -
          getPeerReviewSessionTimestamp(left)
      );

    for (const session of completedSessions) {
      const archivedTeams =
        buildPeerReviewTeamsFromCompletedSession(session);

      if (archivedTeams.length > 0) {
        return archivedTeams;
      }
    }

    /*
      No usable completed-session archive yet.

      Friendly:
      use the two squads currently selected in Manage Squads.

      League:
      retain every League team so a three-team match day shows
      all three teams, not only the current two-team fixture.
    */
    if (matchType === MATCH_TYPE.FRIENDLY) {
      return getActiveFriendlyTeams(fiveVFiveTeams);
    }

    return Array.isArray(teams) ? teams : [];
  }, [
    matchDayHistory,
    friendlyMatchDayHistory,
    matchType,
    fiveVFiveTeams,
    teams,
  ]);

  const effectiveLiveMatch = useMemo(() => {
    if (matchType === MATCH_TYPE.FRIENDLY) {
      const activeFriendlyTeams = getActiveFriendlyTeams(fiveVFiveTeams);
      return {
        ...(currentMatch || {}),
        matchType: MATCH_TYPE.FRIENDLY,
        matchMode: MATCH_TYPE.FRIENDLY,
        gameFormat,
        teamAId: activeFriendlyTeams[0]?.id || "dark",
        teamBId: activeFriendlyTeams[1]?.id || "light",
        standbyId: null,
      };
    }

    const repairedLeagueMatch = repairLeagueCurrentMatch(
      currentMatch,
      teams,
      normalizedActiveTeamIds
    );

    return {
      ...repairedLeagueMatch,
      matchType: MATCH_TYPE.LEAGUE,
      matchMode,
      gameFormat,
    };
  }, [
    matchType,
    gameFormat,
    fiveVFiveTeams,
    currentMatch,
    matchMode,
    teams,
    normalizedActiveTeamIds,
  ]);

  const leagueCurrentMatchNo = getNextMatchNoForMatchType({
    matchType: MATCH_TYPE.LEAGUE,
    currentResults: results,
  });

  const friendlyCurrentMatchNo = getNextMatchNoForMatchType({
    matchType: MATCH_TYPE.FRIENDLY,
    currentResults: results,
  });

  const activeMatchNo =
    matchType === MATCH_TYPE.LEAGUE ? leagueCurrentMatchNo : friendlyCurrentMatchNo;

  const defaultMatchSeconds = getDefaultMatchSecondsForType(matchType);
  const matchSeconds = getMatchSecondsForType(matchSecondsByType, matchType);

  const currentVideoHighlightsMatchId = useMemo(
    () =>
      buildVideoHighlightsMatchId({
        activeSeasonId,
        gameFormat,
        currentMatchNo: activeMatchNo,
        matchType,
        currentMatch: effectiveLiveMatch,
      }),
    [activeSeasonId, gameFormat, activeMatchNo, matchType, effectiveLiveMatch]
  );

  useEffect(() => {
    if (running || hasLiveMatch) return;
    setSecondsLeft(matchSeconds);
    setTimeUp(false);
  }, [matchType, matchSeconds, running, hasLiveMatch]);

  const currentCameraLaunchTeams = useMemo(() => {
    return resolveCameraLaunchTeams({
      teams: matchType === MATCH_TYPE.FRIENDLY ? getActiveFriendlyTeams(fiveVFiveTeams) : teams,
      currentMatch: effectiveLiveMatch,
      currentConfirmedLineupSnapshot,
      confirmedLineupsByMatchNo,
      currentMatchNo: activeMatchNo,
    });
  }, [
    teams,
    fiveVFiveTeams,
    matchType,
    effectiveLiveMatch,
    currentConfirmedLineupSnapshot,
    confirmedLineupsByMatchNo,
    activeMatchNo,
  ]);

  const currentCameraLiveContext = useMemo(() => {
    if (!(hasLiveMatch || running)) return null;
    if (matchType !== MATCH_TYPE.LEAGUE) return null;

    return buildCameraLiveContext({
      activeSeasonId,
      matchType,
      gameFormat,
      currentMatchNo: activeMatchNo,
      launchTeams: currentCameraLaunchTeams,
    });
  }, [
    hasLiveMatch,
    running,
    matchType,
    gameFormat,
    activeSeasonId,
    activeMatchNo,
    currentCameraLaunchTeams,
  ]);

    useEffect(() => {
    if (!USE_V2) return;
    if (isPracticeMode) return;

    let cancelled = false;

    (async () => {
      try {
        await writeCameraLiveContextToFirebase(currentCameraLiveContext, activeClubId);
      } catch (error) {
        if (!cancelled) {
          console.error(
            "[TK CAMERA] Failed to write club-scoped cameraLiveContext:",
            error
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentCameraLiveContext]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const applyReturnedHighlights = async (items) => {
      const normalized = (Array.isArray(items) ? items : [])
        .map((item) =>
          normalizeReturnedHighlight(item, activeMatchNo || 1, gameFormat || "5_V_5")
        )
        .filter(Boolean);

      if (!normalized.length) return;

      await persistReturnedHighlightsToFirebase(normalized);

      setCurrentMatchDayHighlights((prev) => {
        const existing = Array.isArray(prev) ? prev : [];
        const seen = new Set(
          existing.map((item) => String(item.clipId || item.id || "").trim())
        );
        const next = [...existing];

        normalized.forEach((item) => {
          const key = String(item.clipId || item.id || "").trim();
          if (!key || seen.has(key)) return;
          seen.add(key);
          next.push(item);
        });

        return next;
      });

      setPage(PAGE_VIEW_HIGHLIGHTS);
    };

    const handleIncomingUrl = (urlLike) => {
      const incoming = String(urlLike || "");
      if (!incoming.toLowerCase().startsWith("turfkings://camera-return")) return;
      const returned = parseHighlightsReturnPayloadFromUrl(incoming);
      void applyReturnedHighlights(returned);
    };

    handleIncomingUrl(window.location.href);

    const onHashChange = () => handleIncomingUrl(window.location.href);
    window.addEventListener("hashchange", onHashChange);

    const onMessage = (event) => {
      const data = event?.data;
      if (!data) return;

      if (typeof data === "string") {
        handleIncomingUrl(data);
        return;
      }

      if (data?.type === "TURFKINGS_CAMERA_RETURN") {
        void applyReturnedHighlights(
          Array.isArray(data.highlights)
            ? data.highlights
            : [data.highlight || data.clip || data]
        );
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("message", onMessage);
    };
  }, [activeMatchNo, gameFormat, matchType]);


  useEffect(() => {
    if (!isAdminPreviewingAnotherRole) return undefined;

    setShowAdminReclaimNudge(true);
    const timer = window.setTimeout(() => {
      setShowAdminReclaimNudge(false);
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [isAdminPreviewingAnotherRole, activeRole]);

  const handleReclaimAdminRole = () => {
    if (!identity || typeof identity !== "object") return;

    const nextIdentity = {
      ...identity,
      role: "admin",
      realRole: "admin",
      actingRole: "admin",
      isAdminPreviewingAnotherRole: false,
    };

    setIdentity(nextIdentity);
    setShowAdminReclaimNudge(false);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        getIdentityStorageKey(activeClubId),
        JSON.stringify({ ...nextIdentity, clubId: activeClubId })
      );
    }
  };

  const archivedResultsFromHistory = (matchDayHistory || []).flatMap(
    (day) => day?.results || []
  );
  const archivedEventsFromHistory = (matchDayHistory || []).flatMap(
    (day) => day?.allEvents || []
  );
  const archivedFriendlyResultsFromHistory = (friendlyMatchDayHistory || []).flatMap(
    (day) => day?.results || []
  );
  const archivedFriendlyEventsFromHistory = (friendlyMatchDayHistory || []).flatMap(
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
    if (!running) return undefined;

    const activeTimerMatchType = normalizeMatchMode(
      pendingMatchStartContext?.matchType ||
      liveMatchDraft?.matchType ||
      matchType,
      MATCH_TYPE.FRIENDLY
    );

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        /*
          Preserve the proven Turf Kings / older FANM League timer:
          decrement the configured duration by one second per tick.
          It must never use the Friendly nearest-hour calculation.
        */
        if (activeTimerMatchType === MATCH_TYPE.LEAGUE) {
          if (prev <= 1) {
            window.clearInterval(id);
            setRunning(false);
            setTimeUp(true);
            return 0;
          }

          return prev - 1;
        }
        const draftMatchType = normalizeMatchMode(
          liveMatchDraft?.matchType || matchType,
          MATCH_TYPE.FRIENDLY
        );

        const draftSeconds =
          draftMatchType === MATCH_TYPE.FRIENDLY
            ? secondsLeftFromExpectedEnd(
                liveMatchDraft?.expectedEndAtISO
              )
            : null;

        const next =
          draftSeconds != null && Number.isFinite(Number(draftSeconds))
            ? Number(draftSeconds)
            : prev - 1;

        if (next <= 0) {
          window.clearInterval(id);
          setRunning(false);
          setTimeUp(true);
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [
    running,
    matchType,
    pendingMatchStartContext?.matchType,
    liveMatchDraft?.matchType,
    liveMatchDraft?.expectedEndAtISO,
  ]);

  const handleGoToStats = (fromPage) => {
    setStatsReturnPage(fromPage);
    setPage(PAGE_STATS);
  };

  const handleBackToLanding = () => setPage(PAGE_LANDING);
  const handleBackToLive = () => setPage(PAGE_LIVE);
  const handleGoToViewHighlights = () => {
    if (isPracticeMode) {
      showPracticeRestriction(
        "Videos unavailable in Practice",
        "Videos and permanent highlights are disabled during Practice sessions. Switch to your Official profile to use this feature.",
        "🎥"
      );
      return;
    }

    setPage(PAGE_VIEW_HIGHLIGHTS);
  };

  const applyRecoveredLiveDraftToControls = (draft) => {
    if (!draft) return;

    const draftMatchType = normalizeMatchMode(
      draft?.matchType || matchType,
      MATCH_TYPE.FRIENDLY
    );

    const recoveredSeconds =
      draftMatchType === MATCH_TYPE.FRIENDLY
        ? secondsLeftFromExpectedEnd(draft.expectedEndAtISO)
        : null;

    const safeSeconds =
      recoveredSeconds != null &&
      Number.isFinite(Number(recoveredSeconds))
        ? Number(recoveredSeconds)
        : Number(
            draft.lastKnownSecondsLeft ||
            draft.matchSeconds ||
            matchSeconds ||
            0
          );

    setPendingMatchStartContext(buildPendingContextFromLiveDraft(draft));
    setCurrentConfirmedLineupSnapshot(draft.confirmedLineupSnapshot || null);
    setSecondsLeft(Math.max(0, safeSeconds));
    setTimeUp(safeSeconds <= 0);
    setRunning(safeSeconds > 0);
    setHasLiveMatch(true);
    setPage(PAGE_LIVE);
  };


  const buildCurrentRefereeController = () => ({
    deviceId: refereeDeviceId,
    name:
      pageIdentity?.shortName ||
      pageIdentity?.displayName ||
      pageIdentity?.fullName ||
      "Unknown",
    role: pageIdentity?.actingRole || pageIdentity?.role || "unknown",
    email: pageIdentity?.email || null,
    acquiredAtISO: new Date().toISOString(),
  });

  const buildCurrentTakeoverRequest = () => ({
    id: `takeover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    requestedAtISO: new Date().toISOString(),
    expiresAtISO: new Date(Date.now() + 15000).toISOString(),
    requester: buildCurrentRefereeController(),
    currentController: liveMatchDraft?.controller || null,
  });

  const handleTakeOverLiveMatch = () => {
    const nextController = buildCurrentRefereeController();

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
          controller: nextController,
          takeoverRequest: null,
          takeoverAtISO: new Date().toISOString(),
          takeoverBy: nextController,
        }),
      }));
    }

    setShowTakeoverModal(false);

    if (liveMatchDraft) {
      applyRecoveredLiveDraftToControls({
        ...liveMatchDraft,
        controller: nextController,
        takeoverRequest: null,
      });
    } else {
      setPage(PAGE_LIVE);
    }
  };

  const handleRequestTakeOverLiveMatch = () => {
    if (canControlCurrentLiveMatch) {
      setShowTakeoverModal(false);
      return;
    }

    const request = buildCurrentTakeoverRequest();

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
          takeoverRequest: request,
        }),
      }));
    }
  };

  const handleAcceptTakeoverRequest = () => {
    const request = liveMatchDraft?.takeoverRequest;
    const nextController = request?.requester;

    if (!nextController?.deviceId) return;

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
          controller: {
            ...nextController,
            acquiredAtISO: new Date().toISOString(),
          },
          takeoverRequest: null,
          takeoverAtISO: new Date().toISOString(),
          takeoverBy: nextController,
        }),
      }));
    }
  };

  const handleRejectTakeoverRequest = () => {
    const request = liveMatchDraft?.takeoverRequest;
    if (!request) return;

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
          takeoverRequest: {
            ...request,
            status: "rejected",
            rejectedAtISO: new Date().toISOString(),
            rejectedBy: buildCurrentRefereeController(),
          },
        }),
      }));
    }
  };

  useEffect(() => {
    const request = liveMatchDraft?.takeoverRequest;

    if (!request || request.status !== "pending") return undefined;
    if (canControlCurrentLiveMatch) return undefined;

    if (
      String(request?.requester?.deviceId || "") !==
      String(refereeDeviceId || "")
    ) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const expiresAt = new Date(request.expiresAtISO || "").getTime();

      if (!Number.isFinite(expiresAt)) return;

      if (Date.now() >= expiresAt) {
        window.clearInterval(interval);
        handleTakeOverLiveMatch();
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [
    liveMatchDraft?.takeoverRequest?.id,
    liveMatchDraft?.takeoverRequest?.status,
    canControlCurrentLiveMatch,
    refereeDeviceId,
  ]);

  const handleResumeRecoveredLiveMatch = () => {
    applyRecoveredLiveDraftToControls(liveMatchDraft);
    setShowLiveMatchRecoveryModal(false);
  };

  const handleDiscardRecoveredLiveMatch = () => {
    try {
      const draftKey = liveMatchDraft?.id || liveMatchDraft?.startedAtISO || "";
      if (draftKey) {
        window.localStorage.setItem(
          `tk_suppressed_live_recovery_${activeClubId}`,
          draftKey
        );
      }
    } catch (_) {
      // ignore localStorage failures
    }

    setShowLiveMatchRecoveryModal(false);
    setLiveDraftRecoveryKey("");
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(matchSeconds);
    setHasLiveMatch(false);
    setPendingMatchStartContext(null);
    setCurrentConfirmedLineupSnapshot(null);
    setCurrentConfirmedLineupTimeline([]);

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentEvents: [],
        liveMatchDraft: null,
      }));
    }
  };

  const handleConfirmRecoveredLiveMatch = async () => {
    const summary = buildRecoveredSummaryFromLiveDraft(liveMatchDraft);
    if (!summary) {
      window.alert("Could not build a result from this recovered match. Resume it first.");
      return;
    }

    setShowLiveMatchRecoveryModal(false);
    await handleConfirmEndMatch(summary);
  };

  useEffect(() => {
    if (!canStartMatch) return;
    if (!liveMatchDraft || liveMatchDraft.status !== "running") return;
    if (hasLiveMatch || running) return;

    const draftKey = liveMatchDraft.id || liveMatchDraft.startedAtISO || "live-draft";

    try {
      const suppressedKey = window.localStorage.getItem(
        `tk_suppressed_live_recovery_${activeClubId}`
      );
      if (suppressedKey === draftKey) return;
    } catch (_) {
      // ignore localStorage failures
    }

    if (liveDraftRecoveryKey === draftKey) return;

    setLiveDraftRecoveryKey(draftKey);
    applyRecoveredLiveDraftToControls(liveMatchDraft);
    setShowLiveMatchRecoveryModal(true);
  }, [canStartMatch, liveMatchDraft, hasLiveMatch, running, liveDraftRecoveryKey]);

  const canAccessMatchSignup = isAdmin || isCaptain || isPlayer;

  const handleGoToMatchSignup = () => {
    // Practice deliberately uses the same Match Signup -> Payment UI.
    // Financial settlement is simulated inside the disposable Practice
    // DataScope; no external payment provider is contacted.
    if (!canAccessMatchSignup) {
      window.alert(
        "Please sign in as a club player before using payments. This prevents untracked payments."
      );
      setPage(PAGE_ENTRY);
      return;
    }

    setPage(PAGE_MATCH_SIGNUP);
  };

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

    const safeMatch = repairLeagueCurrentMatch(
      match,
      teams,
      normalizedActiveTeamIds
    );

    if (!safeMatch.teamAId || !safeMatch.teamBId || safeMatch.teamAId === safeMatch.teamBId) {
      window.alert("Please choose two different teams before starting the match.");
      return;
    }

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentMatch: safeMatch,
      }));
      return;
    }

    updateState((prev) => ({ ...prev, currentMatch: safeMatch }));
  };

  const handleUpdateSmartOffset = (nextValue) => {
    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) {
      setSmartOffset(5);
      return;
    }
    setSmartOffset(Math.max(0, Math.round(numeric)));
  };

  const applyMatchTypeChange = (nextMatchType) => {
    const safeMatchType =
      normalizeMatchMode(nextMatchType, MATCH_TYPE.FRIENDLY) === MATCH_TYPE.LEAGUE
        ? MATCH_TYPE.LEAGUE
        : MATCH_TYPE.FRIENDLY;

    console.warn("[MATCH TYPE CHANGE DEBUG] requested", {
      isPracticeMode,
      nextMatchType,
      safeMatchType,
      activeSeasonId,
      currentMatchType: matchType,
      currentGameFormat: gameFormat,
      activeClubId,
      dataScopeEnvironment: footballDataScope?.environment || "official",
      practiceSessionId: footballDataScope?.practiceSessionId || null,
    });

    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const nextSeason = {
          ...prevSeason,
          matchType: safeMatchType,
          gameFormat: normalizeGameFormat(
            prevSeason?.gameFormat || gameFormat || GAME_FORMAT.FIVE_V_FIVE
          ),
          activeTeamIds:
            Array.isArray(prevSeason?.activeTeamIds) &&
            prevSeason.activeTeamIds.length >= 2
              ? prevSeason.activeTeamIds
              : (prevSeason.teams || [])
                  .map((team) => team?.id)
                  .filter(Boolean)
                  .slice(0, 2),
          fiveVFiveTeams:
            prevSeason?.isPracticeSeason ||
            String(prevSeason?.seasonId || "").startsWith("practice")
              ? normalizeFiveVFiveTeams(prevSeason?.fiveVFiveTeams)
              : ensureFiveVFiveTeamsShape(prevSeason?.fiveVFiveTeams),
        };

        if (safeMatchType === MATCH_TYPE.FRIENDLY) {
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
        matchType: safeMatchType,
        gameFormat: normalizeGameFormat(
          prev?.gameFormat || gameFormat || GAME_FORMAT.FIVE_V_FIVE
        ),
        activeTeamIds:
          Array.isArray(prev?.activeTeamIds) && prev.activeTeamIds.length >= 2
            ? prev.activeTeamIds
            : (prev.teams || [])
                .map((team) => team?.id)
                .filter(Boolean)
                .slice(0, 2),
        fiveVFiveTeams: ensureFiveVFiveTeamsShape(prev?.fiveVFiveTeams),
      };

      if (safeMatchType === MATCH_TYPE.FRIENDLY) {
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

  const applyGameFormatChange = (nextFormat) => {
    const safeFormat = normalizeGameFormat(nextFormat, GAME_FORMAT.FIVE_V_FIVE);

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        gameFormat: safeFormat,
        matchType: normalizeMatchMode(prevSeason?.matchType || matchType),
        activeTeamIds:
          Array.isArray(prevSeason?.activeTeamIds) &&
          prevSeason.activeTeamIds.length >= 2
            ? prevSeason.activeTeamIds
            : (prevSeason.teams || [])
                .map((team) => team?.id)
                .filter(Boolean)
                .slice(0, 2),
        fiveVFiveTeams: ensureFiveVFiveTeamsShape(prevSeason?.fiveVFiveTeams),
      }));
      return;
    }

    updateState((prev) => ({
      ...prev,
      gameFormat: safeFormat,
      matchType: normalizeMatchMode(prev?.matchType || matchType),
      activeTeamIds:
        Array.isArray(prev?.activeTeamIds) && prev.activeTeamIds.length >= 2
          ? prev.activeTeamIds
          : (prev.teams || [])
              .map((team) => team?.id)
              .filter(Boolean)
              .slice(0, 2),
      fiveVFiveTeams: ensureFiveVFiveTeamsShape(prev?.fiveVFiveTeams),
    }));
  };

  const handleSetMatchType = (nextMatchType) => {
    const safeMatchType =
      normalizeMatchMode(nextMatchType, MATCH_TYPE.FRIENDLY) === MATCH_TYPE.LEAGUE
        ? MATCH_TYPE.LEAGUE
        : MATCH_TYPE.FRIENDLY;

    if (hasRecordedMatchDayState) {
      window.alert(
        "Match type switching is locked once a match has started or match-day records exist. Use the override option if you really need to force the switch."
      );
      return;
    }

    applyMatchTypeChange(safeMatchType);
  };

  const handleForceSetMatchType = (nextMatchType) => {
    const safeMatchType =
      normalizeMatchMode(nextMatchType, MATCH_TYPE.FRIENDLY) === MATCH_TYPE.LEAGUE
        ? MATCH_TYPE.LEAGUE
        : MATCH_TYPE.FRIENDLY;

    applyMatchTypeChange(safeMatchType);
  };

  const handleSetGameFormat = (nextFormat) => {
    const safeFormat = normalizeGameFormat(nextFormat, GAME_FORMAT.FIVE_V_FIVE);

    if (hasRecordedMatchDayState) {
      window.alert(
        "Game format switching is locked once a match has started or match-day records exist. Use the override option if you really need to force the switch."
      );
      return;
    }

    applyGameFormatChange(safeFormat);
  };

  const handleForceSetGameFormat = (nextFormat) => {
    const safeFormat = normalizeGameFormat(nextFormat, GAME_FORMAT.FIVE_V_FIVE);
    applyGameFormatChange(safeFormat);
  };

  const handleSetMatchMode = (nextMode) => {
    if (!USE_V2) return;
    if (matchType !== MATCH_TYPE.LEAGUE) return;

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

    const weeklyPlayTime =
      activeClubIdentity?.weeklyPlayTime ||
      activeClubIdentity?.schedule?.weeklyPlayTime ||
      activeClubIdentity?.schedule?.playTime ||
      activeClubIdentity?.playTime ||
      "Wednesdays, 17:30–19:00";

    if (
      !isPracticeMode &&
      !officialStartOverrideRef.current &&
      !isInsideClubWeeklyWindow(weeklyPlayTime)
    ) {
      setOfficialStartWarning({
        weeklyPlayTime,
      });
      return;
    }

    officialStartOverrideRef.current = false;

    if (shouldLockFurtherFixtures) {
      setShowSeasonCompleteModal(true);
      window.alert(
        "This fixtured season has reached its target. Please end the season before recording more matches."
      );
      return;
    }

    const safeStartMatch =
      matchType === MATCH_TYPE.LEAGUE
        ? repairLeagueCurrentMatch(effectiveLiveMatch, teams, normalizedActiveTeamIds)
        : effectiveLiveMatch;

    if (
      matchType === MATCH_TYPE.LEAGUE &&
      (!safeStartMatch?.teamAId ||
        !safeStartMatch?.teamBId ||
        safeStartMatch.teamAId === safeStartMatch.teamBId)
    ) {
      window.alert("Please choose two different League teams before starting the match.");
      return;
    }

    const startContext = {
      matchNo: activeMatchNo,
      createdAt: new Date().toISOString(),
      currentMatch: safeStartMatch,
      teams: matchType === MATCH_TYPE.FRIENDLY ? getActiveFriendlyTeams(fiveVFiveTeams) : teams,
      fiveVFiveTeams: getActiveFriendlyTeams(fiveVFiveTeams),
      identity: pageIdentity,
      matchType,
      gameFormat,
      activeTeamIds: normalizedActiveTeamIds,
      matchMode,
      scheduledTarget,
    };

    const clubPlayTime =
      activeClubIdentity?.schedule?.playTime ||
      activeClubIdentity?.playTime ||
      activeClubIdentity?.schedule?.weeklyPlayTime ||
      activeClubIdentity?.weeklyPlayTime ||
      "";

    const usesScheduledFinish =
      matchType === MATCH_TYPE.FRIENDLY;

    const scheduledFinishAtISO = usesScheduledFinish
      ? buildClubOfficialScheduledFinishISO(
          clubPlayTime,
          startContext.createdAt
        )
      : null;

    /*
      Friendly may play until the club's smart scheduled finish.

      Three-Team League always uses its configured match duration.
      Its expected end remains kickoff + matchSeconds so recovery
      remains compatible with the proven older FANM implementation.
    */
    const expectedEndAtISO = usesScheduledFinish
      ? buildClubScheduledFinishISO(
          clubPlayTime,
          startContext.createdAt,
          matchSeconds
        )
      : addSecondsToISO(
          startContext.createdAt,
          matchSeconds
        );

    const initialSecondsLeft = usesScheduledFinish
      ? secondsLeftFromExpectedEnd(expectedEndAtISO) ?? matchSeconds
      : matchSeconds;

    const liveDraft = {
      id: `live-${activeSeasonId || "season"}-${activeMatchNo}-${Date.now()}`,
      status: "running",
      activeSeasonId,
      activeClubId,
      matchNo: activeMatchNo,
      currentMatch: safeStartMatch,
      teams: startContext.teams,
      fiveVFiveTeams: startContext.fiveVFiveTeams,
      identity: pageIdentity,
      matchType,
      gameFormat,
      activeTeamIds: normalizedActiveTeamIds,
      matchMode,
      scheduledTarget,
      startedAtISO: startContext.createdAt,
      expectedEndAtISO,
      scheduledFinishAtISO,
      scheduledFinishSource: usesScheduledFinish
        ? clubPlayTime
          ? "smart_club_schedule"
          : "match_duration"
        : null,
      matchSeconds,
      currentEvents: [],
      confirmedLineupSnapshot: null,
      controller: buildCurrentRefereeController(),

      startedBy: {
        name: pageIdentity?.shortName || pageIdentity?.displayName || pageIdentity?.fullName || "Unknown",
        role: pageIdentity?.actingRole || pageIdentity?.role || "unknown",
        email: pageIdentity?.email || null,
      },
      lastKnownSecondsLeft: initialSecondsLeft,
      lastSavedAtISO: new Date().toISOString(),
    };

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentEvents: [],
        liveMatchDraft: liveDraft,
      }));
    }

    setPendingMatchStartContext(startContext);
    setSecondsLeft(initialSecondsLeft);
    setTimeUp(initialSecondsLeft <= 0);
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
        [activeMatchNo]: safeSnapshot,
      }));

      setCurrentConfirmedLineupTimeline((previous) => {
        const safePrevious = Array.isArray(previous)
          ? previous
          : [];

        const elapsedSeconds =
          safePrevious.length === 0
            ? 0
            : Math.max(
                0,
                Number(matchSeconds || 0) -
                  Number(secondsLeft || 0)
              );

        const entry = {
          timeSeconds: elapsedSeconds,
          snapshots: safeSnapshot,
        };

        const withoutSameTimestamp = safePrevious.filter(
          (item) =>
            Number(item?.timeSeconds) !==
            Number(elapsedSeconds)
        );

        return [
          ...withoutSameTimestamp,
          entry,
        ].sort(
          (a, b) =>
            Number(a?.timeSeconds || 0) -
            Number(b?.timeSeconds || 0)
        );
      });
    }

    if (USE_V2 && safeSnapshot) {
      updateActiveSeason((prevSeason) => {
        const existingTimeline = Array.isArray(
          prevSeason?.liveMatchDraft?.lineupTimeline
        )
          ? prevSeason.liveMatchDraft.lineupTimeline
          : [];

        const elapsedSeconds =
          existingTimeline.length === 0
            ? 0
            : Math.max(
                0,
                Number(matchSeconds || 0) -
                  Number(secondsLeft || 0)
              );

        const nextTimeline = [
          ...existingTimeline.filter(
            (item) =>
              Number(item?.timeSeconds) !==
              Number(elapsedSeconds)
          ),
          {
            timeSeconds: elapsedSeconds,
            snapshots: safeSnapshot,
          },
        ].sort(
          (a, b) =>
            Number(a?.timeSeconds || 0) -
            Number(b?.timeSeconds || 0)
        );

        return {
          ...prevSeason,
          liveMatchDraft: touchLiveMatchDraft(
            prevSeason.liveMatchDraft,
            {
              confirmedLineupSnapshot: safeSnapshot,
              lineupTimeline: nextTimeline,
            }
          ),
        };
      });
    }

    setPendingMatchStartContext(null);
  };

  const handleCancelPreMatchLineups = async () => {
    setPendingMatchStartContext(null);
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(matchSeconds);
    setHasLiveMatch(false);
    setCurrentConfirmedLineupSnapshot(null);

    if (USE_V2) {
      if (!isPracticeMode) {
        writeCameraLiveContextToFirebase(null, activeClubId).catch((error) => {
          console.error("[TK CAMERA] Failed to clear cameraLiveContext:", error);
        });
      }

      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentEvents: [],
        liveMatchDraft: null,
      }));
    }

    setShowLiveMatchRecoveryModal(false);
    setLiveDraftRecoveryKey("");
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
      updateActiveSeason((prevSeason) => {
        const eventMeta = buildMatchMetadata({
          matchType: prevSeason?.matchType || matchType,
          gameFormat: prevSeason?.gameFormat || gameFormat,
          matchMode: prevSeason?.matchMode || matchMode,
        });

        const nextEvent = { ...event, ...eventMeta };
        const nextEvents = [...(prevSeason.currentEvents || []), nextEvent];

        return {
          ...prevSeason,
          currentEvents: nextEvents,
          liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
            currentEvents: nextEvents,
          }),
        };
      });
      return;
    }

    const eventMeta = buildMatchMetadata({ matchType, gameFormat, matchMode });

    updateState((prev) => ({
      ...prev,
      currentEvents: [...prev.currentEvents, { ...event, ...eventMeta }],
    }));
  };

  const handleDeleteEvent = (index) => {
    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const copy = [...(prevSeason.currentEvents || [])];
        copy.splice(index, 1);
        return {
          ...prevSeason,
          currentEvents: copy,
          liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
            currentEvents: copy,
          }),
        };
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
        return {
          ...prevSeason,
          currentEvents: copy,
          liveMatchDraft: touchLiveMatchDraft(prevSeason.liveMatchDraft, {
            currentEvents: copy,
          }),
        };
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

  const handleConfirmEndMatch = async (summary) => {
    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const {
        teamAId,
        teamBId,
        standbyId,
        goalsA,
        goalsB,
        teamALabel,
        teamBLabel,
        teamASnapshot,
        teamBSnapshot,
      } = summary;

        const matchMeta = buildMatchMetadata({
          matchType: prevSeason?.matchType || matchType,
          gameFormat: prevSeason?.gameFormat || gameFormat,
          matchMode: prevSeason?.matchMode || matchMode,
        });

        const matchNo = getNextMatchNoForMatchType({
          matchType: matchMeta.matchType,
          currentResults: prevSeason.results || [],
        });
        const isFixturedMode = prevSeason.matchMode === "scheduled_target";

        const verifiedLineups =
          currentConfirmedLineupSnapshot ||
          confirmedLineupsByMatchNo[matchNo] ||
          null;

        const committedEvents = (prevSeason.currentEvents || []).map((e) => ({
          ...e,
          ...matchMeta,
          matchNo,
        }));

        const defensiveAwardEvents =
          matchMeta.matchType === MATCH_TYPE.FRIENDLY
            ? buildFriendlyDefensiveBlockEvents({
                matchNo,
                matchKey:
                  prevSeason?.liveMatchDraft?.id ||
                  `${activeSeasonId || "season"}-${matchNo}-${Date.now()}`,
                teamAId,
                teamBId,
                events: committedEvents,
                elapsedMatchSeconds: Math.max(
                  0,
                  Number(matchSeconds || 0) -
                    Number(secondsLeft || 0)
                ),
                verifiedLineups,
                lineupTimeline:
                  currentConfirmedLineupTimeline.length
                    ? currentConfirmedLineupTimeline
                    : Array.isArray(
                        prevSeason?.liveMatchDraft?.lineupTimeline
                      )
                      ? prevSeason.liveMatchDraft.lineupTimeline
                      : [],
              }).map((event) => ({ ...event, ...matchMeta }))
            : buildCleanSheetEventsForMatch({
                matchNo,
                teamAId,
                teamBId,
                goalsA,
                goalsB,
                verifiedLineups,
              }).map((event) => ({ ...event, ...matchMeta }));

        const allCommittedEvents = [
          ...committedEvents,
          ...defensiveAwardEvents,
        ];

        const isFriendlyResult = matchMeta.matchType === MATCH_TYPE.FRIENDLY;

        const rotationResult = isFriendlyResult
          ? {
              winnerId:
                Number(goalsA || 0) === Number(goalsB || 0)
                  ? null
                  : Number(goalsA || 0) > Number(goalsB || 0)
                    ? teamAId
                    : teamBId,
              isDraw: Number(goalsA || 0) === Number(goalsB || 0),
              nextTeamAId: teamAId,
              nextTeamBId: teamBId,
              nextStandbyId: standbyId || null,
              updatedStreaks: prevSeason.streaks || {},
            }
          : computeNextFromResult(prevSeason.streaks, {
              teamAId,
              teamBId,
              standbyId,
              goalsA,
              goalsB,
            });

        const newMatchNo = Math.max(Number(prevSeason.currentMatchNo || 1), matchNo + 1);

        const friendlyTeamsSnapshot = getActiveFriendlyTeams(prevSeason?.fiveVFiveTeams);
        const teamASnapshotSafe =
          teamASnapshot ||
          friendlyTeamsSnapshot.find((team) => team?.id === teamAId) ||
          null;
        const teamBSnapshotSafe =
          teamBSnapshot ||
          friendlyTeamsSnapshot.find((team) => team?.id === teamBId) ||
          null;
        const resolvedTeamALabel =
          teamALabel || teamASnapshotSafe?.label || teamAId || "Team A";
        const resolvedTeamBLabel =
          teamBLabel || teamBSnapshotSafe?.label || teamBId || "Team B";

        const newResult = {
          ...matchMeta,
          matchNo,
          teamAId,
          teamBId,
          standbyId: standbyId || null,
          teamALabel: resolvedTeamALabel,
          teamBLabel: resolvedTeamBLabel,
          teamASnapshot: teamASnapshotSafe,
          teamBSnapshot: teamBSnapshotSafe,
          goalsA,
          goalsB,
          winnerId: rotationResult.winnerId,
          isDraw: rotationResult.isDraw,
          confirmedLineupSnapshot: verifiedLineups,
        };

        let nextScheduledFixtures = Array.isArray(prevSeason.scheduledFixtures)
          ? prevSeason.scheduledFixtures
          : [];

        let nextCurrentMatch = isFriendlyResult
          ? prevSeason.currentMatch
          : {
              teamAId: rotationResult.nextTeamAId,
              teamBId: rotationResult.nextTeamBId,
              standbyId: rotationResult.nextStandbyId,
            };

        if (!isFriendlyResult && isFixturedMode) {
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

        if (isFriendlyResult) {
          const friendlyEntry = {
            id: buildFriendlyMatchArchiveId({
              gameFormat: matchMeta.gameFormat,
              matchNo,
              createdAt: new Date(),
            }),
            createdAt: new Date().toISOString(),
            matchType: MATCH_TYPE.FRIENDLY,
            gameFormat: matchMeta.gameFormat,
            matchMode: null,
            results: [newResult],
            allEvents: allCommittedEvents,
            teams: friendlyTeamsSnapshot,
            playerAppearances: buildDefaultParticipationEntries({
              teams: friendlyTeamsSnapshot,
              results: [newResult],
              members,
            }),
          };

          return {
            ...prevSeason,
            currentMatchNo: 1,
            currentMatch: nextCurrentMatch,
            streaks: rotationResult.updatedStreaks,
            currentEvents: [],
            liveMatchDraft: prevSeason.liveMatchDraft
              ? {
                  ...prevSeason.liveMatchDraft,
                  status: "completed",
                  completedAtISO: new Date().toISOString(),
                }
              : null,
            allEvents: [],
            results: [],
            friendlyMatchDayHistory: [
              ...(prevSeason.friendlyMatchDayHistory || []),
              friendlyEntry,
            ],
            scheduledFixtures: nextScheduledFixtures,
          };
        }

        return {
          ...prevSeason,
          currentMatchNo: newMatchNo,
          currentMatch: nextCurrentMatch,
          streaks: rotationResult.updatedStreaks,
          currentEvents: [],
          liveMatchDraft: prevSeason.liveMatchDraft
            ? {
                ...prevSeason.liveMatchDraft,
                status: "completed",
                completedAtISO: new Date().toISOString(),
              }
            : null,
          allEvents: [...(prevSeason.allEvents || []), ...allCommittedEvents],
          results: [...(prevSeason.results || []), newResult],
          scheduledFixtures: nextScheduledFixtures,
        };
      });

      setRunning(false);
      setTimeUp(false);
      setSecondsLeft(matchSeconds);
      setHasLiveMatch(false);
      setPendingMatchStartContext(null);
      setCurrentConfirmedLineupSnapshot(null);
      setCurrentConfirmedLineupTimeline([]);
      if (!isPracticeMode) {
        writeCameraLiveContextToFirebase(null, activeClubId).catch((error) => {
          console.error("[TK CAMERA] Failed to clear cameraLiveContext:", error);
        });
      }
      setPage(PAGE_LANDING);
      return;
    }

    updateState((prev) => {
      const {
        teamAId,
        teamBId,
        standbyId,
        goalsA,
        goalsB,
        teamALabel,
        teamBLabel,
        teamASnapshot,
        teamBSnapshot,
      } = summary;

      const matchMeta = buildMatchMetadata({
        matchType: prev?.matchType || matchType,
        gameFormat: prev?.gameFormat || gameFormat,
        matchMode: prev?.matchMode || matchMode,
      });

      const matchNo = getNextMatchNoForMatchType({
        matchType: matchMeta.matchType,
        currentResults: prev.results || [],
      });

      const verifiedLineups =
        currentConfirmedLineupSnapshot ||
        confirmedLineupsByMatchNo[matchNo] ||
        null;

      const committedEvents = prev.currentEvents.map((e) => ({
        ...e,
        ...matchMeta,
        matchNo,
      }));

      const defensiveAwardEvents =
        matchMeta.matchType === MATCH_TYPE.FRIENDLY
          ? buildFriendlyDefensiveBlockEvents({
              matchNo,
              matchKey:
                prev?.liveMatchDraft?.id ||
                `${activeSeasonId || "season"}-${matchNo}-${Date.now()}`,
              teamAId,
              teamBId,
              events: committedEvents,
              elapsedMatchSeconds: Math.max(
                0,
                Number(matchSeconds || 0) -
                  Number(secondsLeft || 0)
              ),
              verifiedLineups,
              lineupTimeline:
                currentConfirmedLineupTimeline.length
                  ? currentConfirmedLineupTimeline
                  : Array.isArray(
                      prev?.liveMatchDraft?.lineupTimeline
                    )
                    ? prev.liveMatchDraft.lineupTimeline
                    : [],
            }).map((event) => ({ ...event, ...matchMeta }))
          : buildCleanSheetEventsForMatch({
              matchNo,
              teamAId,
              teamBId,
              goalsA,
              goalsB,
              verifiedLineups,
            }).map((event) => ({ ...event, ...matchMeta }));

      const allCommittedEvents = [
        ...committedEvents,
        ...defensiveAwardEvents,
      ];

      const rotationResult = computeNextFromResult(prev.streaks, {
        teamAId,
        teamBId,
        standbyId,
        goalsA,
        goalsB,
      });

      const newMatchNo = Math.max(Number(prev.currentMatchNo || 1), matchNo + 1);

      const friendlyTeamsSnapshot = getActiveFriendlyTeams(prev?.fiveVFiveTeams);
      const teamASnapshotSafe =
        teamASnapshot ||
        friendlyTeamsSnapshot.find((team) => team?.id === teamAId) ||
        null;
      const teamBSnapshotSafe =
        teamBSnapshot ||
        friendlyTeamsSnapshot.find((team) => team?.id === teamBId) ||
        null;
      const resolvedTeamALabel =
        teamALabel || teamASnapshotSafe?.label || teamAId || "Team A";
      const resolvedTeamBLabel =
        teamBLabel || teamBSnapshotSafe?.label || teamBId || "Team B";

      const newResult = {
        ...matchMeta,
        matchNo,
        teamAId,
        teamBId,
        standbyId,
        teamALabel: resolvedTeamALabel,
        teamBLabel: resolvedTeamBLabel,
        teamASnapshot: teamASnapshotSafe,
        teamBSnapshot: teamBSnapshotSafe,
        goalsA,
        goalsB,
        winnerId: rotationResult.winnerId,
        isDraw: rotationResult.isDraw,
        confirmedLineupSnapshot: verifiedLineups,
      };

      if (matchMeta.matchType === MATCH_TYPE.FRIENDLY) {
        const friendlyEntry = {
          id: buildFriendlyMatchArchiveId({
            gameFormat: matchMeta.gameFormat,
            matchNo,
            createdAt: new Date(),
          }),
          createdAt: new Date().toISOString(),
          matchType: MATCH_TYPE.FRIENDLY,
          gameFormat: matchMeta.gameFormat,
          matchMode: null,
          results: [newResult],
          allEvents: allCommittedEvents,
          teams: friendlyTeamsSnapshot,
          playerAppearances: buildDefaultParticipationEntries({
            teams: friendlyTeamsSnapshot,
            results: [newResult],
            members,
          }),
        };

        return {
          ...prev,
          currentMatchNo: 1,
          currentMatch: prev.currentMatch,
          streaks: rotationResult.updatedStreaks,
          currentEvents: [],
          allEvents: [],
          results: [],
          friendlyMatchDayHistory: [
            ...(prev.friendlyMatchDayHistory || []),
            friendlyEntry,
          ],
        };
      }

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
    setSecondsLeft(matchSeconds);
    setHasLiveMatch(false);
    setPendingMatchStartContext(null);
    setCurrentConfirmedLineupSnapshot(null);
    try {
      if (!isPracticeMode) {
        await writeCameraLiveContextToFirebase(null, activeClubId);
      }
    } catch (error) {
      console.error("[TK CAMERA] Failed to clear cameraLiveContext:", error);
    }

    setPage(PAGE_LANDING);
  };

  const handleDiscardMatchAndBack = async () => {
    try {
      const draftKey = liveMatchDraft?.id || liveMatchDraft?.startedAtISO || "";

      if (draftKey) {
        window.localStorage.setItem(
          `tk_suppressed_live_recovery_${activeClubId}`,
          draftKey
        );
      }
    } catch (_) {
      // ignore localStorage failures
    }

    setShowLiveMatchRecoveryModal(false);
    setLiveDraftRecoveryKey("");
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(matchSeconds);
    setHasLiveMatch(false);
    setPendingMatchStartContext(null);
    if (!isPracticeMode) {
      writeCameraLiveContextToFirebase(null, activeClubId).catch((error) => {
        console.error("[TK CAMERA] Failed to clear cameraLiveContext:", error);
      });
    }
    setCurrentConfirmedLineupSnapshot(null);

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        currentEvents: [],
        liveMatchDraft: null,
      }));

      if (!isPracticeMode) {
        writeCameraLiveContextToFirebase(null, activeClubId).catch((error) => {
          console.error("[TK CAMERA] Failed to clear cameraLiveContext:", error);
        });
      }
    } else {
      updateState((prev) => ({ ...prev, currentEvents: [] }));
    }

    setPage(PAGE_LANDING);
  };

  const handleDeleteSavedMatch = (matchNoToDelete, deleteContext = {}) => {
    if (!USE_V2) return;

    const requestedMatchType = normalizeMatchMode(
      deleteContext?.matchType || matchType,
      MATCH_TYPE.LEAGUE
    );
    const requestedMatchDayId = String(deleteContext?.matchDayId || "").trim();

    updateActiveSeason((prevSeason) => {
      if (requestedMatchType === MATCH_TYPE.FRIENDLY) {
        const safeFriendlyHistory = Array.isArray(prevSeason?.friendlyMatchDayHistory)
          ? prevSeason.friendlyMatchDayHistory
          : [];

        const nextFriendlyHistory = safeFriendlyHistory
          .map((day) => {
            const dayId = String(day?.id || day?.matchDayId || day?.date || "").trim();

            // Preferred path: one Friendly record represents one Friendly day/match.
            // Remove the whole archived friendly entry when the IDs match.
            if (requestedMatchDayId && dayId && dayId === requestedMatchDayId) {
              return null;
            }

            const dayResults = Array.isArray(day?.results) ? day.results : [];
            const dayEvents = Array.isArray(day?.allEvents) ? day.allEvents : [];

            const nextResults = dayResults.filter(
              (r) => Number(r?.matchNo) !== Number(matchNoToDelete)
            );
            const nextEvents = dayEvents.filter(
              (e) => Number(e?.matchNo) !== Number(matchNoToDelete)
            );

            if (nextResults.length === 0 && nextEvents.length === 0) {
              return null;
            }

            return {
              ...day,
              results: nextResults,
              allEvents: nextEvents,
            };
          })
          .filter(Boolean);

        return {
          ...prevSeason,
          friendlyMatchDayHistory: nextFriendlyHistory,
        };
      }

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

    const safeEventId = String(eventId || "").trim();
    if (!safeEventId) return;

    updateActiveSeason((prevSeason) => {
      /*
       * League events still live directly on season.allEvents.
       */
      const safeAllEvents = Array.isArray(prevSeason?.allEvents)
        ? prevSeason.allEvents
        : [];

      const leagueTargetEvent = safeAllEvents.find(
        (e) => String(e?.id || "") === safeEventId
      );

      if (leagueTargetEvent) {
        const nextAllEvents = safeAllEvents.map((e) =>
          String(e?.id || "") === safeEventId
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
          Number(r?.matchNo) === Number(leagueTargetEvent?.matchNo)
            ? buildUpdatedResultFromEvents(r, nextAllEvents)
            : r
        );

        return {
          ...prevSeason,
          allEvents: nextAllEvents,
          results: nextResults,
        };
      }

      /*
       * Completed Friendly events live inside
       * friendlyMatchDayHistory[].allEvents.
       */
      const safeFriendlyHistory = Array.isArray(
        prevSeason?.friendlyMatchDayHistory
      )
        ? prevSeason.friendlyMatchDayHistory
        : [];

      let friendlyEventFound = false;

      const nextFriendlyHistory = safeFriendlyHistory.map((day) => {
        const dayEvents = Array.isArray(day?.allEvents)
          ? day.allEvents
          : [];

        const targetEvent = dayEvents.find(
          (e) => String(e?.id || "") === safeEventId
        );

        if (!targetEvent) return day;

        friendlyEventFound = true;

        const nextEvents = dayEvents.map((e) =>
          String(e?.id || "") === safeEventId
            ? {
                ...e,
                ...updatedFields,
              }
            : e
        );

        const dayResults = Array.isArray(day?.results)
          ? day.results
          : [];

        const nextResults = dayResults.map((r) =>
          Number(r?.matchNo) === Number(targetEvent?.matchNo)
            ? buildUpdatedResultFromEvents(r, nextEvents)
            : r
        );

        return {
          ...day,
          allEvents: nextEvents,
          results: nextResults,
        };
      });

      if (!friendlyEventFound) {
        console.warn(
          "[TK STATS EDIT] Saved event not found:",
          safeEventId
        );
        return prevSeason;
      }

      return {
        ...prevSeason,
        friendlyMatchDayHistory: nextFriendlyHistory,
      };
    });
  };


  const handleRedistributeFriendlyDefensiveBlocks = ({
    matchDayId = "",
    matchNo = 0,
    matchType: requestedMatchType = "FRIENDLY",
    transfers = [],
  } = {}) => {
    if (!USE_V2) return;

    if (
      normalizeMatchMode(
        requestedMatchType,
        MATCH_TYPE.FRIENDLY
      ) !== MATCH_TYPE.FRIENDLY
    ) {
      console.warn(
        "[DB TRANSFER] Blocked non-Friendly redistribution request."
      );
      return;
    }

    const safeTransfers = (
      Array.isArray(transfers) ? transfers : []
    )
      .map((transfer) => ({
        teamId: String(transfer?.teamId || "").trim(),
        from: String(transfer?.from || "").trim(),
        to: String(transfer?.to || "").trim(),
      }))
      .filter(
        (transfer) =>
          transfer.teamId &&
          transfer.from &&
          transfer.to &&
          transfer.from !== transfer.to
      );

    if (!safeTransfers.length) return;

    const requestedDayId = String(matchDayId || "").trim();
    const requestedMatchNo = Number(matchNo || 0);

    const applyTransfersToEvents = (events = []) => {
      let nextEvents = Array.isArray(events)
        ? events.map((event) => ({ ...event }))
        : [];

      let appliedCount = 0;

      safeTransfers.forEach((transfer) => {
        const candidates = nextEvents
          .map((event, index) => ({ event, index }))
          .filter(({ event }) => {
            const holder = String(
              event?.playerName ||
                event?.scorer ||
                ""
            ).trim();

            return (
              String(event?.type || "")
                .trim()
                .toLowerCase() === "defensive_block" &&
              Number(event?.matchNo) ===
                requestedMatchNo &&
              String(event?.teamId || "") ===
                transfer.teamId &&
              holder === transfer.from
            );
          })
          .sort((a, b) => {
            const blockA = Number(
              a.event?.blockIndex ??
                a.event?.blockNumber ??
                999999
            );
            const blockB = Number(
              b.event?.blockIndex ??
                b.event?.blockNumber ??
                999999
            );

            if (blockA !== blockB) return blockA - blockB;

            return (
              Number(a.event?.timeSeconds || 0) -
              Number(b.event?.timeSeconds || 0)
            );
          });

        const candidate = candidates[0];

        if (!candidate) {
          return;
        }

        const oldEvent = nextEvents[candidate.index];

        nextEvents[candidate.index] = {
          ...oldEvent,

          /*
           * Preserve the original role, block number,
           * time interval and team. Only ownership moves.
           */
          playerName: transfer.to,
          scorer: transfer.to,

          manualDbCorrection: true,
          manualDbCorrectionLatestFrom: transfer.from,
          manualDbCorrectionLatestTo: transfer.to,
          manualDbCorrectionAt:
            new Date().toISOString(),

          manualDbTransferHistory: [
            ...(
              Array.isArray(
                oldEvent?.manualDbTransferHistory
              )
                ? oldEvent.manualDbTransferHistory
                : []
            ),
            {
              from: transfer.from,
              to: transfer.to,
              at: new Date().toISOString(),
            },
          ],
        };

        appliedCount += 1;
      });

      return {
        events: nextEvents,
        appliedCount,
      };
    };

    updateActiveSeason((prevSeason) => {
      const safeFriendlyHistory = Array.isArray(
        prevSeason?.friendlyMatchDayHistory
      )
        ? prevSeason.friendlyMatchDayHistory
        : [];

      let historyAppliedCount = 0;

      const nextFriendlyHistory =
        safeFriendlyHistory.map((day) => {
          const dayId = String(
            day?.id ||
              day?.matchDayId ||
              day?.date ||
              ""
          ).trim();

          if (
            requestedDayId &&
            dayId &&
            dayId !== requestedDayId
          ) {
            return day;
          }

          const result = applyTransfersToEvents(
            day?.allEvents
          );

          if (!result.appliedCount) return day;

          historyAppliedCount += result.appliedCount;

          return {
            ...day,
            allEvents: result.events,
            updatedAt: new Date().toISOString(),
          };
        });

      /*
       * Archived Friendly history is the preferred target.
       * If no archived event matched, fall back to the active
       * allEvents collection for the current Friendly week.
       */
      if (historyAppliedCount > 0) {
        if (
          historyAppliedCount !== safeTransfers.length
        ) {
          console.warn(
            "[DB TRANSFER] Not every requested archived transfer could be applied.",
            {
              requested: safeTransfers.length,
              applied: historyAppliedCount,
              matchDayId: requestedDayId,
              matchNo: requestedMatchNo,
            }
          );
        }

        return {
          ...prevSeason,
          friendlyMatchDayHistory:
            nextFriendlyHistory,
        };
      }

      const currentResult = applyTransfersToEvents(
        prevSeason?.allEvents
      );

      if (
        currentResult.appliedCount !==
        safeTransfers.length
      ) {
        console.warn(
          "[DB TRANSFER] Not every requested current transfer could be applied.",
          {
            requested: safeTransfers.length,
            applied: currentResult.appliedCount,
            matchDayId: requestedDayId,
            matchNo: requestedMatchNo,
          }
        );
      }

      return {
        ...prevSeason,
        allEvents: currentResult.events,
      };
    });
  };

  const handleDeleteSavedEvent = (eventId) => {
    if (!USE_V2) return;

    const safeEventId = String(eventId || "").trim();
    if (!safeEventId) return;

    updateActiveSeason((prevSeason) => {
      /*
       * League event deletion.
       */
      const safeAllEvents = Array.isArray(prevSeason?.allEvents)
        ? prevSeason.allEvents
        : [];

      const leagueTargetEvent = safeAllEvents.find(
        (e) => String(e?.id || "") === safeEventId
      );

      if (leagueTargetEvent) {
        const nextAllEvents = safeAllEvents.filter(
          (e) => String(e?.id || "") !== safeEventId
        );

        const safeResults = Array.isArray(prevSeason?.results)
          ? prevSeason.results
          : [];

        const nextResults = safeResults.map((r) =>
          Number(r?.matchNo) === Number(leagueTargetEvent?.matchNo)
            ? buildUpdatedResultFromEvents(r, nextAllEvents)
            : r
        );

        return {
          ...prevSeason,
          allEvents: nextAllEvents,
          results: nextResults,
        };
      }

      /*
       * Completed Friendly event deletion.
       */
      const safeFriendlyHistory = Array.isArray(
        prevSeason?.friendlyMatchDayHistory
      )
        ? prevSeason.friendlyMatchDayHistory
        : [];

      let friendlyEventFound = false;

      const nextFriendlyHistory = safeFriendlyHistory.map((day) => {
        const dayEvents = Array.isArray(day?.allEvents)
          ? day.allEvents
          : [];

        const targetEvent = dayEvents.find(
          (e) => String(e?.id || "") === safeEventId
        );

        if (!targetEvent) return day;

        friendlyEventFound = true;

        const nextEvents = dayEvents.filter(
          (e) => String(e?.id || "") !== safeEventId
        );

        const dayResults = Array.isArray(day?.results)
          ? day.results
          : [];

        const nextResults = dayResults.map((r) =>
          Number(r?.matchNo) === Number(targetEvent?.matchNo)
            ? buildUpdatedResultFromEvents(r, nextEvents)
            : r
        );

        return {
          ...day,
          allEvents: nextEvents,
          results: nextResults,
        };
      });

      if (!friendlyEventFound) {
        console.warn(
          "[TK STATS DELETE] Saved event not found:",
          safeEventId
        );
        return prevSeason;
      }

      return {
        ...prevSeason,
        friendlyMatchDayHistory: nextFriendlyHistory,
      };
    });
  };

  const handleAddSavedEvent = (matchNo, eventData) => {
    if (!USE_V2) return;

    updateActiveSeason((prevSeason) => {
      const safeAllEvents = Array.isArray(prevSeason?.allEvents)
        ? prevSeason.allEvents
        : [];
      const safeResults = Array.isArray(prevSeason?.results)
        ? prevSeason.results
        : [];
      const targetResult = safeResults.find(
        (r) => Number(r?.matchNo) === Number(matchNo)
      );
      const matchMeta = buildMatchMetadata({
        matchType: targetResult?.matchType || prevSeason?.matchType || matchType,
        gameFormat: targetResult?.gameFormat || prevSeason?.gameFormat || gameFormat,
        matchMode: targetResult?.matchMode || prevSeason?.matchMode || matchMode,
      });

      const newEvent = {
        ...matchMeta,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        matchNo: Number(matchNo),
        timeSeconds: Number(eventData?.timeSeconds ?? 0),
        scorer: eventData?.scorer ?? "",
        assist: eventData?.assist ?? null,
        type: eventData?.type ?? "goal",
        teamId: eventData?.teamId ?? null,
      };

      const nextAllEvents = [...safeAllEvents, newEvent];

      const nextResults = safeResults.map((r) =>
        Number(r?.matchNo) === Number(matchNo)
          ? { ...buildUpdatedResultFromEvents(r, nextAllEvents), ...matchMeta }
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

    const safeUpdatedTeams = Array.isArray(updatedTeams) ? updatedTeams : [];
    console.log("[APP TEAMS SAVE DEBUG]", {
      isPracticeMode,
      count: safeUpdatedTeams.length,
      teams: safeUpdatedTeams.map((team) => ({
        id: team?.id,
        label: team?.label,
        playersCount: Array.isArray(team?.players) ? team.players.length : 0,
        players: Array.isArray(team?.players) ? team.players : [],
      })),
    });
    const nextTeamIds = safeUpdatedTeams.map((team) => team?.id).filter(Boolean);
    const nextActiveTeamIds = Array.from(
      new Set(normalizedActiveTeamIds.filter((teamId) => nextTeamIds.includes(teamId)))
    ).slice(0, 2);

    const resolvedActiveTeamIds =
      nextActiveTeamIds.length >= 2 ? nextActiveTeamIds : nextTeamIds.slice(0, 2);

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        teams: safeUpdatedTeams,
        activeTeamIds: resolvedActiveTeamIds,
      }));
      return;
    }

    updateState((prev) => ({
      ...prev,
      teams: safeUpdatedTeams,
      activeTeamIds: resolvedActiveTeamIds,
    }));
  };

  const handleUpdateActiveTeamIds = (nextActiveTeamIds) => {
    const teamIds = (teams || []).map((team) => team?.id).filter(Boolean);
    const safeNext = Array.from(
      new Set(
        (Array.isArray(nextActiveTeamIds) ? nextActiveTeamIds : []).filter((teamId) =>
          teamIds.includes(teamId)
        )
      )
    ).slice(0, 2);

    const resolved = safeNext.length >= 2 ? safeNext : teamIds.slice(0, 2);

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        activeTeamIds: resolved,
      }));
      return;
    }

    updateState((prev) => ({
      ...prev,
      activeTeamIds: resolved,
    }));
  };

  const handleUpdateFiveVFiveTeams = (updatedTeams) => {
    if (!canManageSquads) {
      window.alert("Only admin can update 5 v 5 squads.");
      return;
    }

    console.log("[APP SAVE DEBUG] received fiveVFiveTeams", updatedTeams);

    const safeTeams = isPracticeMode
      ? (Array.isArray(updatedTeams) ? updatedTeams : [])
      : ensureFiveVFiveTeamsShape(updatedTeams);

    console.log("[APP SAVE DEBUG] safe fiveVFiveTeams", safeTeams);

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        fiveVFiveTeams: safeTeams,
      }));
      return;
    }

    updateState((prev) => ({
      ...prev,
      fiveVFiveTeams: safeTeams,
    }));
  };

  const openBackupModal = () => {
    if (!isAdmin) {
      window.alert("Only admin can open save / clear tools.");
      return;
    }

    const participationTeams =
      matchType === MATCH_TYPE.FRIENDLY
        ? getActiveFriendlyTeams(fiveVFiveTeams)
        : teams;

    const defaults = buildDefaultParticipationEntries({
      teams: participationTeams,
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
    setShowClearOnlyConfirmModal(false);
    setClearOnlyConfirmCode("");
    setClearOnlyConfirmError("");
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
    setClearOnlyConfirmCode("");
    setClearOnlyConfirmError("");
    setShowClearOnlyConfirmModal(true);
  };

  const closeClearOnlyConfirmModal = () => {
    setShowClearOnlyConfirmModal(false);
    setClearOnlyConfirmCode("");
    setClearOnlyConfirmError("");
  };

  const handleConfirmClearOnly = () => {
    if (clearOnlyConfirmCode.trim() !== MASTER_CODE) {
      setClearOnlyConfirmError("Invalid admin code. Nothing has been cleared.");
      return;
    }

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
        matchType: MATCH_TYPE.FRIENDLY,
        gameFormat: GAME_FORMAT.FIVE_V_FIVE,
        activeTeamIds: (prevSeason.teams || []).map((team) => team?.id).filter(Boolean).slice(0, 2),
        fiveVFiveTeams: ensureFiveVFiveTeamsShape(prevSeason?.fiveVFiveTeams),
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
        friendlyMatchDayHistory: prevSeason.friendlyMatchDayHistory || [],
        matchMode: "round_robin",
        scheduledTarget: null,
        scheduledFixtures: [],
      }));

      setCurrentMatchDayHighlights([]);
      setHighlightVotesByUser({});
      setHighlightArchiveSelection(null);
      closeBackupModal();
      return;
    }

    updateState((prev) => ({
      ...prev,
      matchType: MATCH_TYPE.FRIENDLY,
        gameFormat: GAME_FORMAT.FIVE_V_FIVE,
      activeTeamIds: (prev.teams || []).map((team) => team?.id).filter(Boolean).slice(0, 2),
      fiveVFiveTeams: ensureFiveVFiveTeamsShape(prev?.fiveVFiveTeams),
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
      friendlyMatchDayHistory: prev.friendlyMatchDayHistory || [],
      matchMode: "round_robin",
      scheduledTarget: null,
      scheduledFixtures: [],
    }));

    setCurrentMatchDayHighlights([]);
    setHighlightVotesByUser({});
    setHighlightArchiveSelection(null);
    closeBackupModal();
  };

  const handleRequestSaveAndClearMatchDay = () => {
    setSaveConfirmCode("");
    setSaveConfirmError("");
    setShowSaveConfirmModal(true);
  };

  const closeSaveConfirmModal = () => {
    setShowSaveConfirmModal(false);
    setSaveConfirmCode("");
    setSaveConfirmError("");
  };

  const handleSaveAndClearMatchDay = async () => {
    if (saveConfirmCode.trim() !== MASTER_CODE) {
      setSaveConfirmError("Invalid admin code. Nothing has been saved or cleared.");
      return;
    }

    const now = new Date();
    const id =
      now.getFullYear().toString() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");

    try {
      const highlightsArchivePayload = buildHighlightsArchivePayload();
      console.log("[TK HIGHLIGHTS] archive winners on End Match Day:", highlightsArchivePayload);

      if (
        !isPracticeMode &&
        currentVideoHighlightsMatchId &&
        highlightArchiveSelection
      ) {
        const selectedHighlights = [
          ...(Array.isArray(highlightArchiveSelection?.topGoals)
            ? highlightArchiveSelection.topGoals
            : []),
          ...(highlightArchiveSelection?.bestSkill
            ? [highlightArchiveSelection.bestSkill]
            : []),
          ...(highlightArchiveSelection?.bestSave
            ? [highlightArchiveSelection.bestSave]
            : []),
        ].filter(Boolean);

        if (selectedHighlights.length > 0) {
          await VideoHighlightsRepository.archiveWinningHighlightsToFirebase({
            matchId: currentVideoHighlightsMatchId,
            highlights: selectedHighlights,
          });
        }
      }
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
            dataScope: footballDataScope,
          });
        }

        updateActiveSeason((prevSeason) => {
          const savedMatchMeta = buildMatchMetadata({
            matchType: prevSeason?.matchType || matchType,
            gameFormat: prevSeason?.gameFormat || gameFormat,
            matchMode: prevSeason?.matchMode || matchMode,
          });

          const currentResultsWithMeta = attachMatchMetadataToRecords(
            prevSeason.results || [],
            savedMatchMeta
          );
          const currentEventsWithMeta = attachMatchMetadataToRecords(
            prevSeason.allEvents || [],
            savedMatchMeta
          );

          const splitResults = splitRecordsByMatchType(currentResultsWithMeta);
          const splitEvents = splitRecordsByMatchType(currentEventsWithMeta);

          const leagueEntry =
            splitResults.league.length > 0 || splitEvents.league.length > 0
              ? {
                  id,
                  createdAt: now.toISOString(),
                  ...savedMatchMeta,
                  matchType: MATCH_TYPE.LEAGUE,
                  results: splitResults.league,
                  allEvents: splitEvents.league,
                  teams: prevSeason.teams || [],
                  playerAppearances: safeParticipationEntries,
                }
              : null;

          const friendlyEntry =
            splitResults.friendly.length > 0 || splitEvents.friendly.length > 0
              ? {
                  id,
                  createdAt: now.toISOString(),
                  matchType: MATCH_TYPE.FRIENDLY,
                  gameFormat: savedMatchMeta.gameFormat,
                  matchMode: null,
                  results: splitResults.friendly,
                  allEvents: splitEvents.friendly,
                  teams: getActiveFriendlyTeams(prevSeason?.fiveVFiveTeams),
                  playerAppearances: safeParticipationEntries,
                }
              : null;

          const newLeagueHistory = leagueEntry
            ? [...(prevSeason.matchDayHistory || []), leagueEntry]
            : prevSeason.matchDayHistory || [];

          const newFriendlyHistory = friendlyEntry
            ? [...(prevSeason.friendlyMatchDayHistory || []), friendlyEntry]
            : prevSeason.friendlyMatchDayHistory || [];

          return {
            ...prevSeason,
            matchDayHistory: newLeagueHistory,
            friendlyMatchDayHistory: newFriendlyHistory,
            matchType: MATCH_TYPE.FRIENDLY,
            gameFormat: GAME_FORMAT.FIVE_V_FIVE,
            activeTeamIds: (prevSeason.teams || []).map((team) => team?.id).filter(Boolean).slice(0, 2),
            fiveVFiveTeams: ensureFiveVFiveTeamsShape(prevSeason?.fiveVFiveTeams),
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
            liveMatchDraft: prevSeason.liveMatchDraft
              ? {
                  ...prevSeason.liveMatchDraft,
                  status: "completed",
                  completedAtISO: new Date().toISOString(),
                }
              : null,
            allEvents: [],
            results: [],
            matchMode: "round_robin",
            scheduledTarget: null,
            scheduledFixtures: [],
          };
        });

        setCurrentMatchDayHighlights([]);
        setHighlightVotesByUser({});
        setHighlightArchiveSelection(null);
        closeBackupModal();
        return;
      }

      updateState((prev) => {
        const savedMatchMeta = buildMatchMetadata({
          matchType: prev?.matchType || matchType,
          gameFormat: prev?.gameFormat || gameFormat,
          matchMode: prev?.matchMode || matchMode,
        });

        const currentResultsWithMeta = attachMatchMetadataToRecords(
          prev.results || [],
          savedMatchMeta
        );
        const currentEventsWithMeta = attachMatchMetadataToRecords(
          prev.allEvents || [],
          savedMatchMeta
        );

        const splitResults = splitRecordsByMatchType(currentResultsWithMeta);
        const splitEvents = splitRecordsByMatchType(currentEventsWithMeta);

        const leagueEntry =
          splitResults.league.length > 0 || splitEvents.league.length > 0
            ? {
                id,
                createdAt: now.toISOString(),
                ...savedMatchMeta,
                matchType: MATCH_TYPE.LEAGUE,
                results: splitResults.league,
                allEvents: splitEvents.league,
                teams: prev.teams || [],
                playerAppearances: pendingParticipationEntries || [],
              }
            : null;

        const friendlyEntry =
          splitResults.friendly.length > 0 || splitEvents.friendly.length > 0
            ? {
                id,
                createdAt: now.toISOString(),
                matchType: MATCH_TYPE.FRIENDLY,
                gameFormat: savedMatchMeta.gameFormat,
                matchMode: null,
                results: splitResults.friendly,
                allEvents: splitEvents.friendly,
                teams: getActiveFriendlyTeams(prev?.fiveVFiveTeams),
                playerAppearances: pendingParticipationEntries || [],
              }
            : null;

        const newLeagueHistory = leagueEntry
          ? [...(prev.matchDayHistory || []), leagueEntry]
          : prev.matchDayHistory || [];

        const newFriendlyHistory = friendlyEntry
          ? [...(prev.friendlyMatchDayHistory || []), friendlyEntry]
          : prev.friendlyMatchDayHistory || [];

        return {
          ...prev,
          matchDayHistory: newLeagueHistory,
          friendlyMatchDayHistory: newFriendlyHistory,
          matchType: MATCH_TYPE.FRIENDLY,
          gameFormat: GAME_FORMAT.FIVE_V_FIVE,
          activeTeamIds: (prev.teams || []).map((team) => team?.id).filter(Boolean).slice(0, 2),
          fiveVFiveTeams: ensureFiveVFiveTeamsShape(prev?.fiveVFiveTeams),
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

      setCurrentMatchDayHighlights([]);
      setHighlightVotesByUser({});
      setHighlightArchiveSelection(null);
      closeBackupModal();
    } catch (err) {
      console.error("[TK] Failed to save participation records:", err);
      setSaveConfirmError(
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
          "Please click “🏁 End Match Day” first (Save to server & clear), then come back to “🏆 End Season”."
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
      setSecondsLeft(matchSeconds);
      setHasLiveMatch(false);
      setPendingMatchStartContext(null);
      setCurrentConfirmedLineupSnapshot(null);

      const { seasonId, seasonNo } = nextSeasonIdFromExisting(safePrev.seasons);
      const { activeSeason } = getActiveSeasonFromV2State(safePrev);
      const baseTeams = activeSeason?.teams || [];
      const renderedPlayerCardSnapshot = readRenderedPlayerCardSnapshotFromLocalStorage(
        activeSeason?.seasonId,
        activeClubId
      );
      const finalPlayerCardSnapshot = buildFinalPlayerCardSnapshot({
        season: activeSeason,
        peerRatingsByPlayer,
        renderedPlayerCardSnapshot,
      });

      const archivedActiveSeason = {
        ...activeSeason,
        finalPlayerCardSnapshot,
        finalPlayerCardSnapshotCreatedAt:
          finalPlayerCardSnapshot?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const defaultLeagueNames = ["Team A", "Team B", "Team C"];
      const defaultLeagueColours = ["Blue", "White", "Black"];

      const newSeasonTeams = (baseTeams && baseTeams.length ? baseTeams : [
        {},
        {},
        {},
      ]).slice(0, 3).map((team, index) => ({
        ...team,
        id: `${seasonId}-team-${index + 1}`,
        label: defaultLeagueNames[index] || `Team ${index + 1}`,
        abbrev: ["TMA", "TMB", "TMC"][index] || `TM${index + 1}`,
        teamColorName: defaultLeagueColours[index] || "Blue",
        teamColorHex: "",
        players: [],
        captainId: null,
        captain: "",
      }));

      const newSeasonTeamIds = newSeasonTeams
        .map((team) => team?.id)
        .filter(Boolean);

      const newSeason = {
        seasonId,
        seasonNo,
        matchType: MATCH_TYPE.FRIENDLY,
        gameFormat: GAME_FORMAT.FIVE_V_FIVE,
        activeTeamIds: newSeasonTeamIds.slice(0, 2),
        teams: newSeasonTeams,
        fiveVFiveTeams: buildDefaultFiveVFiveTeams(),
        currentMatchNo: 1,
        currentMatch: {
          teamAId: newSeasonTeamIds?.[0] ?? null,
          teamBId: newSeasonTeamIds?.[1] ?? null,
          standbyId: newSeasonTeamIds?.[2] ?? null,
        },
        streaks: Object.fromEntries(newSeasonTeamIds.map((tid) => [tid, 0])),
        currentEvents: [],
        allEvents: [],
        results: [],
        matchDayHistory: [],
        friendlyMatchDayHistory: [],
        matchMode: "round_robin",
        scheduledTarget: null,
        scheduledFixtures: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return {
        ...safePrev,
        activeSeasonId: seasonId,
        seasons: [
          ...safePrev.seasons.map((season) =>
            season?.seasonId === safePrev.activeSeasonId
              ? archivedActiveSeason
              : season
          ),
          newSeason,
        ],
        updatedAt: new Date().toISOString(),
      };
    });

    closeEndSeasonModal();
    setShowSeasonCompleteModal(false);
    setSeasonCompleteDismissedKey(null);
  };

  const handleProceedToPayment = (payload) => {
    if (isPracticeMode) {
      showPracticeRestriction(
        "Payments are for Official Sessions",
        "Practice Session does not process real payments. Click Change Profile and enter an Official Session to continue with payments.",
        "💳"
      );
      return;
    }

    const safePayload = payload || {};
    console.log("[TK PAYMENTS] proceed to payment payload:", safePayload);
    setPaymentContext(safePayload);
    setPage(PAGE_PAYMENT);
  };

  const handleBackFromPayment = () => setPage(PAGE_MATCH_SIGNUP);



  const buildHighlightsArchivePayload = () => {
    const selection = highlightArchiveSelection || {};
    const topGoals = Array.isArray(selection.topGoals) ? selection.topGoals : [];
    const bestSkill = selection.bestSkill || null;
    const bestSave = selection.bestSave || null;

    const goalsByScorer = topGoals.reduce((acc, item) => {
      const scorerName = toTitleCaseLoose(
        item?.goalScorerName || item?.scorer || item?.playerName || "Unknown"
      );
      if (!acc[scorerName]) acc[scorerName] = [];
      acc[scorerName].push(item);
      return acc;
    }, {});

    return {
      matchDayId: new Date().toISOString().slice(0, 10),
      matchNo: activeMatchNo || 1,
      seasonId: matchType === MATCH_TYPE.FRIENDLY ? null : activeSeasonId || null,
      matchType,
      gameFormat: normalizeGameFormat(gameFormat || GAME_FORMAT.FIVE_V_FIVE),
      topGoals,
      bestSkill,
      bestSave,
      goalsByScorer,
    };
  };

  const handleOpenHighlightsCamera = () => {
    if (isPracticeMode) {
      showPracticeRestriction(
        "Highlights Camera unavailable in Practice",
        "Camera recording and permanent video capture are disabled during Practice sessions. Switch to your Official profile to use this feature.",
        "📹"
      );
      return;
    }

    if (typeof window === "undefined") return;

    const isAndroid = /Android/i.test(window.navigator.userAgent || "");
    if (!isAndroid) {
      window.alert(
        "Highlights Camera currently opens from Android devices with the 5 Asides Near Me Camera app installed."
      );
      return;
    }

    const launchTeams = resolveCameraLaunchTeams({
      teams: matchType === MATCH_TYPE.FRIENDLY ? getActiveFriendlyTeams(fiveVFiveTeams) : teams,
      currentMatch: effectiveLiveMatch,
      currentConfirmedLineupSnapshot,
      confirmedLineupsByMatchNo,
      currentMatchNo: activeMatchNo,
    });

    const recordingMatchId =
      currentVideoHighlightsMatchId ||
      buildVideoHighlightsMatchId({
        activeSeasonId,
        gameFormat,
        currentMatchNo: activeMatchNo,
        matchType,
        currentMatch: effectiveLiveMatch,
      });

    // CAMERA PAYLOAD V3:
    // For this camera test, a tap on the TurfKings lens button means the user
    // is intentionally opening the official recording-device flow.
    // MainActivity.kt requires sourceApp=TurfKings + matchIsLive=true + matchId.
    // The matchId MUST be the video_highlights document id because Android listens at:
    // video_highlights/{matchId}/capture_requests
    const cameraPayloadVersion = "camera_payload_v3_force_official_recording_device";
    const hasMatchSides = Boolean(launchTeams.teamAId && launchTeams.teamBId);
    const isOfficialMatchLive = Boolean(recordingMatchId && hasMatchSides);

    const payload = {
      payloadVersion: cameraPayloadVersion,
      sourceApp: "TurfKings",
      productName: "5 Asides Near Me",
      teamName: "Turf Kings FC",
      launchPurpose: "record_live_match",
      recordingMode: "match_recording_device",
      confirmedRecordingRequired: true,
      cameraAppMode: "recording_device",
      isOfficial: true,
      officialContext: true,

      matchIsLive: isOfficialMatchLive,
      matchId: recordingMatchId,
      videoHighlightsMatchId: recordingMatchId,
      currentVideoHighlightsMatchId: recordingMatchId,
      legacyMatchId: `tk-${activeSeasonId || "season"}-${activeMatchNo || 1}`,

      canUseOutsideOfficialMatch: true,
      matchNo: Number(activeMatchNo || 1),
      seasonId: activeSeasonId || null,
      matchType: matchType || MATCH_TYPE.FRIENDLY,
      gameFormat: normalizeGameFormat(gameFormat || GAME_FORMAT.FIVE_V_FIVE),
      teamAId: launchTeams.teamAId,
      teamBId: launchTeams.teamBId,
      teamAName: launchTeams.teamAName,
      teamBName: launchTeams.teamBName,
      teamAPlayers: launchTeams.teamAPlayers,
      teamBPlayers: launchTeams.teamBPlayers,
      defaultTag: "goal",
      recordingDeviceSession: {
        collectionPath: `video_highlights/${recordingMatchId}/recording_devices`,
        requiresConfirmation: true,
        heartbeatSeconds: 15,
      },
      captureRequests: {
        collectionPath: `video_highlights/${recordingMatchId}/capture_requests`,
        listen: true,
        preRollSeconds: 15,
        postRollSeconds: 5,
      },
      returnUrl: "turfkings://camera-return",
      openedAtISO: new Date().toISOString(),
    };

    console.log("[TK CAMERA] PAYLOAD V3 opening camera:", payload);

    const launchUrl = `${CAMERA_APP_DEEP_LINK_SCHEME}?payload=${encodeURIComponent(
      JSON.stringify(payload)
    )}`;

    let appProbablyOpened = false;

    const markOpened = () => {
      appProbablyOpened = true;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) markOpened();
    };

    const cleanupListeners = () => {
      window.removeEventListener("pagehide", markOpened);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", markOpened);
    };

    window.addEventListener("pagehide", markOpened, { once: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", markOpened, { once: true });

    setCameraInstallPrompt(null);
    window.location.href = launchUrl;

    window.setTimeout(() => {
      cleanupListeners();
      if (appProbablyOpened || document.hidden) return;

      setCameraInstallPrompt({
        payload,
        launchUrl,
        installUrl: CAMERA_APP_INSTALL_URL,
        installGuideUrl: CAMERA_APP_INSTALL_GUIDE_URL,
        shownAtISO: new Date().toISOString(),
      });
    }, CAMERA_APP_OPEN_FALLBACK_MS);
  };

  const handleRetryOpenHighlightsCamera = () => {
    if (!cameraInstallPrompt?.launchUrl || typeof window === "undefined") return;
    window.location.href = cameraInstallPrompt.launchUrl;
  };

  const handleCloseCameraInstallPrompt = () => {
    setCameraInstallPrompt(null);
  };

  const handleUploadHighlight = async (payload) => {
    // Practice v2 external-effect firewall:
    // never upload video or create permanent highlight metadata.
    if (isPracticeMode) {
      throw new Error(
        "[Practice] Video highlight uploads are disabled."
      );
    }

    const matchId = currentVideoHighlightsMatchId;

    const clipId =
      String(payload?.clipId || payload?.id || "").trim() ||
      `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const savedHighlight = await VideoHighlightsRepository.uploadAndSaveRawHighlight({
      matchId,
      file: payload?.file,
      highlight: {
        ...(payload || {}),
        clipId,
        id: clipId,
        matchId,
        seasonId: matchType === MATCH_TYPE.FRIENDLY ? null : activeSeasonId || null,
        matchType,
        gameFormat,
        matchNo: activeMatchNo,
        status: "pending",
        createdAt: payload?.createdAt || new Date().toISOString(),
        createdBy:
          identity?.memberId ||
          identity?.playerId ||
          identity?.email ||
          identity?.shortName ||
          "",
        createdByName:
          identity?.shortName ||
          identity?.fullName ||
          identity?.displayName ||
          identity?.email ||
          "Unknown",
      },
    });

    setCurrentMatchDayHighlights((prev) => {
      const existing = Array.isArray(prev) ? prev : [];
      const key = String(savedHighlight?.clipId || savedHighlight?.id || "").trim();

      if (!key) return existing;

      const alreadyExists = existing.some(
        (item) => String(item?.clipId || item?.id || "").trim() === key
      );

      if (alreadyExists) return existing;

      return [...existing, savedHighlight];
    });

    return savedHighlight;
  };



  useEffect(() => {
    if (page !== PAGE_SQUADS) {
      setSquadsAdminPreviewOpen(false);
    }
  }, [page]);

  const lastPracticeTeamSnapshotRef = useRef("");

  useEffect(() => {
    if (!isPracticeMode) return;

    const snapshot = JSON.stringify(
      (Array.isArray(teams) ? teams : []).map((team) => ({
        id: team?.id,
        label: team?.label,
        players: Array.isArray(team?.players) ? team.players : [],
      }))
    );

    if (snapshot !== lastPracticeTeamSnapshotRef.current) {
      console.warn("[PRACTICE TEAMS CHANGED]", {
        page,
        activeSeasonId,
        teams: (Array.isArray(teams) ? teams : []).map((team) => ({
          id: team?.id,
          label: team?.label,
          playersCount: Array.isArray(team?.players) ? team.players.length : 0,
          players: Array.isArray(team?.players) ? team.players : [],
        })),
      });
      lastPracticeTeamSnapshotRef.current = snapshot;
    }
  }, [isPracticeMode, page, activeSeasonId, teams]);

  useEffect(() => {
    if (!isPracticeMode) return;

    console.log("[PRACTICE PAGE STATE DEBUG]", {
      page,
      activeSeasonId,
      matchType,
      teamsCount: Array.isArray(teams) ? teams.length : 0,
      teams: Array.isArray(teams)
        ? teams.map((team) => ({
            id: team?.id,
            label: team?.label,
            playersCount: Array.isArray(team?.players) ? team.players.length : 0,
            players: Array.isArray(team?.players) ? team.players : [],
          }))
        : [],
      fiveVFiveTeamsCount: Array.isArray(fiveVFiveTeams) ? fiveVFiveTeams.length : 0,
      fiveVFiveTeams: Array.isArray(fiveVFiveTeams)
        ? fiveVFiveTeams.map((team) => ({
            id: team?.id,
            label: team?.label,
            playersCount: Array.isArray(team?.players) ? team.players.length : 0,
            players: Array.isArray(team?.players) ? team.players : [],
          }))
        : [],
    });
  }, [page, isPracticeMode, activeSeasonId, matchType, teams, fiveVFiveTeams]);

  const pagesWithBottomNav = new Set([
    PAGE_LANDING,
    PAGE_MATCH_SIGNUP,
    PAGE_PAYMENT,
    PAGE_LIVE,
    PAGE_SPECTATOR,
    PAGE_STATS,
    PAGE_NEWS,
    PAGE_PLAYER_CARDS,
    PAGE_SQUADS,
    PAGE_FORMATIONS,
    PAGE_PEER_REVIEW,
    PAGE_VIEW_HIGHLIGHTS,
  ]);

  const hideBottomNavForSquadAdmin =
    page === PAGE_SQUADS && Boolean(isAdmin);

  const isLiveMatchControlLocked = Boolean(hasLiveMatch || running);
  const isRefereeStatsView = Boolean(isLiveMatchControlLocked && page === PAGE_STATS);

  const [showRefereeLockModal, setShowRefereeLockModal] = useState(false);

  const openRefereeLockModal = () => {
    setShowRefereeLockModal((prev) => (prev ? prev : true));
  };

  useEffect(() => {
    if (!isRefereeStatsView) return undefined;

    const timer = window.setTimeout(() => {
      setPage(PAGE_LIVE);
    }, 20000);

    return () => window.clearTimeout(timer);
  }, [isRefereeStatsView]);

  const showBottomNav =
    pagesWithBottomNav.has(page) &&
    !hideBottomNavForSquadAdmin &&
    page !== PAGE_LIVE;

  const handleBottomNavNavigate = (targetPage) => {
    if (!targetPage || targetPage === page) return;

    if (isLiveMatchControlLocked) {
      openRefereeLockModal();
      return;
    }


    if (targetPage === PAGE_STATS) {
      handleGoToStats(page);
      return;
    }

    if (targetPage === PAGE_LIVE) {
      handleGoToLiveAsSpectator();
      return;
    }

    if (targetPage === PAGE_LANDING) {
      handleBackToLanding();
      return;
    }

    if (targetPage === PAGE_MATCH_SIGNUP) {
      handleGoToMatchSignup();
      return;
    }

    if (targetPage === PAGE_PLAYER_CARDS) {
      setPage(PAGE_PLAYER_CARDS);
      return;
    }

    if (targetPage === PAGE_NEWS) {
      setPage(PAGE_NEWS);
      return;
    }

    if (targetPage === PAGE_VIEW_HIGHLIGHTS) {
      handleGoToViewHighlights();
      return;
    }

    if (targetPage === PAGE_SQUADS) {
      handleGoToSquads();
      return;
    }

    if (targetPage === PAGE_FORMATIONS) {
      handleGoToFormations();
      return;
    }

    if (targetPage === PAGE_PEER_REVIEW) {
      setPage(PAGE_PEER_REVIEW);
      return;
    }

    setPage(targetPage);

  };

  return (
    <div
      className={`app-root ${showBottomNav ? "has-bottom-nav" : ""} ${
        page === PAGE_LANDING ? "app-root--landing" : ""
      }`}
    >
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            right: 10,
            top: 10,
            zIndex: 13000,
            padding: "0.65rem 0.8rem",
            borderRadius: 12,
            background: "rgba(2,6,23,0.94)",
            border: "1px solid rgba(34,211,238,0.55)",
            color: "#e2e8f0",
            fontSize: "0.72rem",
            lineHeight: 1.45,
            fontFamily: "monospace",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            pointerEvents: "none",
          }}
        >
          <div><strong>Practice v2 diagnostic</strong></div>
          <div>mode: {sessionMode}</div>
          <div>runtime: {practiceRuntime ? "YES" : "NO"}</div>
          <div>session: {practiceRuntime?.practiceSessionId || "NONE"}</div>
          <div>scope: {footballDataScope?.environment || "NONE"}</div>
          <div>roster: {practiceRuntime?.roster?.length ?? "NONE"}</div>
          <div>expires: {practiceRuntime?.expiresAt || "NONE"}</div>
        </div>
      )}

      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            right: 10,
            top: 10,
            zIndex: 13000,
            padding: "0.65rem 0.8rem",
            borderRadius: 12,
            background: "rgba(2,6,23,0.94)",
            border: "1px solid rgba(34,211,238,0.55)",
            color: "#e2e8f0",
            fontSize: "0.72rem",
            lineHeight: 1.45,
            fontFamily: "monospace",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            pointerEvents: "none",
          }}
        >
          <div><strong>Practice v2 diagnostic</strong></div>
          <div>mode: {sessionMode}</div>
          <div>runtime: {practiceRuntime ? "YES" : "NO"}</div>
          <div>session: {practiceRuntime?.practiceSessionId || "NONE"}</div>
          <div>scope: {footballDataScope?.environment || "NONE"}</div>
          <div>roster: {practiceRuntime?.roster?.length ?? "NONE"}</div>
          <div>expires: {practiceRuntime?.expiresAt || "NONE"}</div>
        </div>
      )}

      {isPracticeMode && practiceRuntime?.expiresAt && (
        <div
          role="status"
          aria-label={`Practice Session ${practiceTimerLabel} remaining`}
          style={{
            position: "fixed",
            top: "4.25rem",
            left:
              practiceRibbonPosition === "left"
                ? 0
                : practiceRibbonPosition === "right"
                  ? "auto"
                  : "54%",
            right: practiceRibbonPosition === "right" ? 0 : "auto",
            transform:
              practiceRibbonPosition === "open"
                ? "translateX(-50%)"
                : "none",
            zIndex: 12000,
            display: "flex",
            alignItems: "center",
            gap: practiceRibbonPosition === "open" ? "0.5rem" : "0.35rem",
            padding:
              practiceRibbonPosition === "open"
                ? "0.62rem 0.95rem"
                : practiceRibbonPosition === "left"
                  ? "0.58rem 0.65rem 0.58rem 0.45rem"
                  : "0.58rem 0.45rem 0.58rem 0.65rem",
            borderRadius:
              practiceRibbonPosition === "open"
                ? 999
                : practiceRibbonPosition === "left"
                  ? "0 999px 999px 0"
                  : "999px 0 0 999px",
            border: "2px solid rgba(232,121,249,0.95)",
            background:
              "linear-gradient(135deg, rgba(76,29,149,0.98), rgba(88,28,135,0.98), rgba(30,12,48,0.98))",
            color: "#fff7ff",
            boxShadow:
              "0 0 0 1px rgba(250,204,255,0.28), 0 0 20px rgba(217,70,239,0.42), 0 10px 30px rgba(30,12,48,0.48)",
            backdropFilter: "blur(14px)",
            fontWeight: 850,
            fontSize: practiceRibbonPosition === "open" ? "0.9rem" : "0.82rem",
            letterSpacing: "0.01em",
            cursor: "pointer",
            userSelect: "none",
            transition:
              "left 180ms ease, right 180ms ease, transform 180ms ease, padding 180ms ease, box-shadow 180ms ease",
          }}
          title={
            practiceRibbonPosition === "open"
              ? "Tap to move the Practice Session warning to the right edge"
              : "Tap to move or expand the Practice Session warning"
          }
          onClick={() => {
            setPracticeRibbonPosition((current) => {
              if (current === "open") return "right";
              if (current === "right") return "left";
              return "open";
            });
          }}
        >
          <span aria-hidden="true">🧪</span>

          {practiceRibbonPosition === "open" && (
            <>
              <span>Practice session</span>
              <span
                style={{ opacity: 0.65 }}
                aria-hidden="true"
              >
                •
              </span>
            </>
          )}

          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              minWidth:
                practiceRibbonPosition === "open" ? "3.2rem" : "2.95rem",
              textAlign: "center",
            }}
          >
            {practiceTimerLabel}
          </span>

          {practiceRibbonPosition !== "open" && (
            <span
              aria-hidden="true"
              style={{
                fontSize: "0.72rem",
                opacity: 0.8,
              }}
            >
              {practiceRibbonPosition === "right" ? "◀" : "▶"}
            </span>
          )}
        </div>
      )}

      {officialStartWarning && (
        <div className="tk-referee-lock-backdrop" onClick={() => setOfficialStartWarning(null)}>
          <div className="tk-referee-lock-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tk-referee-lock-kicker">
              <span className="tk-live-dot" /> Official record protection
            </div>

            <h2>Outside official match time</h2>

            <p style={{ lineHeight: 1.55, marginBottom: "0.85rem" }}>
              This does not look like your club’s normal match window.
              Starting an Official Session now may affect real standings,
              player stats, attendance and match history.
            </p>

            {officialStartWarning.weeklyPlayTime && (
              <div
                style={{
                  padding: "0.8rem",
                  borderRadius: "1rem",
                  border: "1px solid rgba(148,163,184,0.28)",
                  background: "rgba(15,23,42,0.72)",
                  marginBottom: "1rem",
                }}
              >
                Normal club time: <strong>{officialStartWarning.weeklyPlayTime}</strong>
              </div>
            )}

            <div style={{ display: "grid", gap: "0.55rem" }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setOfficialStartWarning(null);
                  if (canChooseSessionMode) setShowSessionSelector(true);
                }}
              >
                Go to Practice Session
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  officialStartOverrideRef.current = true;
                  setOfficialStartWarning(null);
                  setTimeout(() => handleStartMatch(), 0);
                }}
              >
                Continue Officially for now
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => setOfficialStartWarning(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLiveMatchControlLocked && (
        <button
          type="button"
          className="tk-live-lock-badge"
          onClick={() => setPage(PAGE_LIVE)}
          title="Return to Game Controls"
        >
          <span className="tk-live-dot" /> Live
        </button>
      )}

      {showLiveMatchRecoveryModal && liveMatchDraft && (
        <div className="tk-referee-lock-backdrop" onClick={() => setShowLiveMatchRecoveryModal(false)}>
          <div className="tk-referee-lock-modal" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const summary = buildRecoveredSummaryFromLiveDraft(liveMatchDraft);
              const startedAt = liveMatchDraft?.startedAtISO
                ? new Date(liveMatchDraft.startedAtISO)
                : null;
              const lastSavedAt = liveMatchDraft?.lastSavedAtISO
                ? new Date(liveMatchDraft.lastSavedAtISO)
                : null;
              const remaining = secondsLeftFromExpectedEnd(liveMatchDraft?.expectedEndAtISO);
              const mins = Math.floor((remaining || 0) / 60);
              const secs = Math.floor((remaining || 0) % 60);

              return (
                <>
                  <div className="tk-referee-lock-kicker">
                    <span className="tk-live-dot" /> Match recovery
                  </div>
                  <h2>Unfinished match found</h2>
                  <div style={{ display: "grid", gap: "0.45rem", marginBottom: "1rem", textAlign: "left" }}>
                    <div style={{ fontWeight: 900, fontSize: "1rem" }}>
                      {summary?.teamALabel || "Team A"} vs {summary?.teamBLabel || "Team B"}
                    </div>
                    <div style={{ opacity: 0.82 }}>
                      {String(liveMatchDraft?.matchType || "Friendly").replace("_", " ").toUpperCase()} • {String(liveMatchDraft?.gameFormat || "5v5").replaceAll("_", " ")}
                    </div>
                    <div>Saved score: <strong>{summary?.goalsA ?? 0}–{summary?.goalsB ?? 0}</strong></div>
                    {startedAt && (
                      <div>Started: <strong>{startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></div>
                    )}
                    {lastSavedAt && (
                      <div>Last saved: <strong>{lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></div>
                    )}
                    <div>Time left: <strong>{mins}:{String(secs).padStart(2, "0")}</strong></div>
                    {liveMatchDraft?.startedBy?.name && (
                      <div>Started by: <strong>{liveMatchDraft.startedBy.name}</strong></div>
                    )}
                  </div>
                </>
              );
            })()}
            <div style={{ display: "grid", gap: "0.55rem" }}>
              <button type="button" className="primary-btn" onClick={handleResumeRecoveredLiveMatch}>
                Resume / edit match
              </button>
              <button type="button" className="secondary-btn" onClick={handleConfirmRecoveredLiveMatch}>
                Save current result
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ borderColor: "rgba(248,113,113,0.55)", color: "#fecaca" }}
                onClick={() => {
                  try {
                    const draftKey = liveMatchDraft?.id || liveMatchDraft?.startedAtISO || "";

                    if (draftKey) {
                      window.localStorage.setItem(
                        `tk_suppressed_live_recovery_${activeClubId}`,
                        draftKey
                      );
                    }
                  } catch (_) {
                    // ignore localStorage failures
                  }

                  setShowLiveMatchRecoveryModal(false);
                  setLiveDraftRecoveryKey("");
                  setRunning(false);
                  setHasLiveMatch(false);
                  setPendingMatchStartContext(null);
                  setPage(PAGE_LANDING);
                }}
              >
                Ignore recovery
              </button>
            </div>
          </div>
        </div>
      )}

      {showRefereeLockModal && (
        <div className="tk-referee-lock-backdrop" onClick={() => setShowRefereeLockModal(false)}>
          <div className="tk-referee-lock-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tk-referee-lock-kicker">
              <span className="tk-live-dot" /> Live match active
            </div>
            <h2>Referee mode is active</h2>
            <p>Return to Game Controls.</p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setShowRefereeLockModal(false);
                setPage(PAGE_LIVE);
              }}
            >
              Return to Game Controls
            </button>
          </div>
        </div>
      )}

      <style>{`
        .tk-live-lock-badge {
          position: fixed;
          top: 14px;
          left: 14px;
          z-index: 10020;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.85rem;
          border-radius: 999px;
          border: 1px solid rgba(248,113,113,0.5);
          background: rgba(2, 6, 23, 0.92);
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 950;
          letter-spacing: 0.03em;
          box-shadow: 0 10px 26px rgba(0,0,0,0.3);
          cursor: pointer;
        }

        .tk-live-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #ff2d2d;
          box-shadow: 0 0 0 4px rgba(255,45,45,0.18);
        }

        .tk-referee-lock-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10040;
          display: grid;
          place-items: center;
          padding: 1rem 0.75rem;
          overflow-y: auto;
          background: rgba(2, 6, 23, 0.72);
          backdrop-filter: blur(10px);
        }

        .tk-referee-lock-modal {
          width: min(350px, calc(100vw - 36px));
          max-width: calc(100vw - 36px);
          box-sizing: border-box;
          border-radius: 20px;
          padding: 0.95rem;
          border: 1px solid rgba(248, 113, 113, 0.42);
          background:
            radial-gradient(circle at top left, rgba(248,113,113,0.18), transparent 42%),
            linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98));
          box-shadow: 0 28px 70px rgba(0,0,0,0.55);
          color: #f8fafc;
        }

        .tk-referee-lock-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.65rem;
          border-radius: 999px;
          border: 1px solid rgba(248,113,113,0.35);
          color: #fecaca;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .tk-referee-lock-modal h2 {
          margin: 0.9rem 0 0.45rem;
          font-size: 1.15rem;
        }

        .tk-referee-lock-modal p {
          margin: 0 0 1rem;
          color: #cbd5e1;
          line-height: 1.35;
        }

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

        .tk-admin-reclaim-wrap {
          position: fixed;
          top: calc(78px + env(safe-area-inset-top, 0px));
          right: 10px;
          z-index: 12000;
          display: flex;
          justify-content: flex-end;
          pointer-events: none;
        }

        .tk-admin-reclaim-card,
        .tk-admin-reclaim-tab {
          pointer-events: auto;
          border: 1px solid rgba(250,204,21,0.38);
          color: #fef9c3;
          box-shadow: 0 18px 44px rgba(2,6,23,0.50), 0 0 26px rgba(250,204,21,0.13);
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        .tk-admin-reclaim-card {
          width: min(340px, calc(100vw - 24px));
          border-radius: 20px;
          padding: 0.78rem;
          background: radial-gradient(circle at 0% 0%, rgba(250,204,21,0.18), transparent 50%), radial-gradient(circle at 100% 100%, rgba(34,211,238,0.14), transparent 55%), linear-gradient(180deg, rgba(15,23,42,0.97), rgba(2,6,23,0.96));
          animation: tkReclaimIn 0.24s ease-out;
        }

        .tk-admin-reclaim-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
        }

        .tk-admin-reclaim-left {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
        }

        .tk-admin-reclaim-icon {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          background: linear-gradient(135deg, rgba(250,204,21,0.95), rgba(59,130,246,0.95));
          box-shadow: 0 0 22px rgba(250,204,21,0.20);
        }

        .tk-admin-reclaim-title {
          display: block;
          font-size: 0.86rem;
          font-weight: 950;
          letter-spacing: 0.01em;
          line-height: 1.08;
          color: #fff7ed;
        }

        .tk-admin-reclaim-subtitle {
          display: block;
          margin-top: 0.18rem;
          font-size: 0.72rem;
          color: rgba(226,232,240,0.82);
          line-height: 1.22;
        }

        .tk-admin-reclaim-minimize {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.25);
          background: rgba(15,23,42,0.76);
          color: #e2e8f0;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 900;
          line-height: 1;
          flex: 0 0 auto;
        }

        .tk-admin-reclaim-copy {
          margin: 0.72rem 0 0;
          color: rgba(226,232,240,0.86);
          font-size: 0.78rem;
          line-height: 1.38;
        }

        .tk-admin-reclaim-actions {
          margin-top: 0.72rem;
          display: flex;
          gap: 0.55rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .tk-admin-reclaim-primary,
        .tk-admin-reclaim-secondary {
          border-radius: 999px;
          padding: 0.55rem 0.78rem;
          font-size: 0.76rem;
          font-weight: 900;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.16);
          touch-action: manipulation;
        }

        .tk-admin-reclaim-primary {
          background: linear-gradient(90deg, #22d3ee, #6366f1);
          color: #020617;
          box-shadow: 0 10px 22px rgba(34,211,238,0.18);
        }

        .tk-admin-reclaim-secondary {
          background: rgba(15,23,42,0.72);
          color: #e2e8f0;
        }

        .tk-admin-reclaim-role {
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
          background: rgba(250,204,21,0.12);
          border: 1px solid rgba(250,204,21,0.24);
          color: #fde68a;
          font-size: 0.66rem;
          font-weight: 950;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .tk-admin-reclaim-tab {
          position: fixed;
          right: 0;
          top: calc(118px + env(safe-area-inset-top, 0px));
          z-index: 12000;
          min-width: 42px;
          min-height: 78px;
          border-radius: 18px 0 0 18px;
          border-right: none;
          background: radial-gradient(circle at 50% 0%, rgba(250,204,21,0.22), transparent 58%), linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.96));
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.18rem;
          cursor: pointer;
          animation: tkReclaimPulse 2.1s ease-in-out infinite;
        }

        .tk-admin-reclaim-tab-role {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          font-size: 0.58rem;
          font-weight: 950;
          letter-spacing: 0.08em;
          color: #fde68a;
          text-transform: uppercase;
        }

        @media (max-width: 520px) {
          .tk-admin-reclaim-wrap {
            top: calc(108px + env(safe-area-inset-top, 0px));
            right: 8px;
          }

          .tk-admin-reclaim-card {
            width: min(318px, calc(100vw - 18px));
          }

          .tk-admin-reclaim-tab {
            top: calc(132px + env(safe-area-inset-top, 0px));
          }
        }

        @keyframes tkReclaimIn {
          from { opacity: 0; transform: translateX(10px) scale(0.98); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }

        @keyframes tkReclaimPulse {
          0%, 100% { transform: translateX(0); box-shadow: 0 18px 44px rgba(2,6,23,0.50), 0 0 18px rgba(250,204,21,0.12); }
          50% { transform: translateX(-3px); box-shadow: 0 18px 44px rgba(2,6,23,0.50), 0 0 28px rgba(250,204,21,0.22); }
        }

        .app-root.has-bottom-nav {
          padding-bottom: 96px;
        }

        .tk-bottom-nav {
          position: fixed;
          left: 12px;
          right: 12px;
          bottom: calc(10px + env(safe-area-inset-bottom, 0px));
          z-index: 9500;
          border-radius: 26px;
          padding: 8px;
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(2, 6, 23, 0.96));
          border: 1px solid rgba(148, 163, 184, 0.28);
          box-shadow:
            0 18px 44px rgba(0, 0, 0, 0.42),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .tk-bottom-nav-scroll {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          scroll-snap-type: x proximity;
          padding: 2px;
        }

        .tk-bottom-nav-scroll::-webkit-scrollbar {
          display: none;
        }

        .tk-bottom-nav-item {
          appearance: none;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.72);
          color: rgba(226, 232, 240, 0.92);
          min-width: 72px;
          height: 58px;
          border-radius: 19px;
          padding: 7px 10px 6px;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          cursor: pointer;
          flex: 0 0 auto;
          scroll-snap-align: center;
          touch-action: manipulation;
          transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
        }

        .tk-bottom-nav-item:active {
          transform: translateY(1px) scale(0.98);
        }

        .tk-bottom-nav-item:hover {
          border-color: rgba(34, 197, 94, 0.38);
          background: rgba(15, 23, 42, 0.92);
        }

        .tk-bottom-nav-item.is-primary {
          min-width: 82px;
          border-color: rgba(34, 197, 94, 0.42);
          background:
            radial-gradient(circle at top, rgba(34, 197, 94, 0.18), rgba(15, 23, 42, 0.88));
          box-shadow: 0 0 18px rgba(34, 197, 94, 0.12);
        }

        .tk-bottom-nav-icon-wrap {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
        }

        .tk-bottom-nav-icon {
          display: block;
        }

        .tk-bottom-nav-label {
          font-size: 0.72rem;
          line-height: 1;
          font-weight: 800;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }

        @media (max-width: 420px) {
          .app-root.has-bottom-nav {
            padding-bottom: 92px;
          }

          .tk-bottom-nav {
            left: 8px;
            right: 8px;
            bottom: calc(8px + env(safe-area-inset-bottom, 0px));
            border-radius: 22px;
            padding: 7px;
          }

          .tk-bottom-nav-item {
            min-width: 64px;
            height: 54px;
            border-radius: 16px;
            padding-left: 8px;
            padding-right: 8px;
          }

          .tk-bottom-nav-item.is-primary {
            min-width: 74px;
          }

          .tk-bottom-nav-label {
            font-size: 0.68rem;
          }
        }
      `}</style>

      {IS_STAGING && <div className="tk-staging-badge">Testing Version</div>}

      {isAdminPreviewingAnotherRole && showAdminReclaimNudge && (
        <div className="tk-admin-reclaim-wrap">
          <div className="tk-admin-reclaim-card" role="status" aria-live="polite">
            <div className="tk-admin-reclaim-head">
              <div className="tk-admin-reclaim-left">
                <span className="tk-admin-reclaim-icon" aria-hidden="true">🛡️</span>
                <span style={{ minWidth: 0, textAlign: "left" }}>
                  <span className="tk-admin-reclaim-title">
                    You are viewing as {activeRole}
                  </span>
                  <span className="tk-admin-reclaim-subtitle">
                    Admin powers are hidden in this preview mode.
                  </span>
                </span>
              </div>
              <button
                type="button"
                className="tk-admin-reclaim-minimize"
                onClick={() => setShowAdminReclaimNudge(false)}
                title="Minimize admin preview reminder"
                aria-label="Minimize admin preview reminder"
              >
                –
              </button>
            </div>

            <p className="tk-admin-reclaim-copy">
              Change profile back to <strong>Admin</strong> to reclaim your full admin powers.
            </p>

            <div className="tk-admin-reclaim-actions">
              <button
                type="button"
                className="tk-admin-reclaim-primary"
                onClick={handleReclaimAdminRole}
              >
                Reclaim admin role
              </button>
              <button
                type="button"
                className="tk-admin-reclaim-secondary"
                onClick={() => setShowAdminReclaimNudge(false)}
              >
                Keep previewing
              </button>
              <span className="tk-admin-reclaim-role">{activeRole} mode</span>
            </div>
          </div>
        </div>
      )}

      {isAdminPreviewingAnotherRole && !showAdminReclaimNudge && (
        <button
          type="button"
          className="tk-admin-reclaim-tab"
          onClick={() => setShowAdminReclaimNudge(true)}
          title={`Viewing as ${activeRole}. Tap to reclaim admin role.`}
          aria-label={`Viewing as ${activeRole}. Tap to reclaim admin role.`}
        >
          <span aria-hidden="true">🛡️</span>
          <span className="tk-admin-reclaim-tab-role">{activeRole}</span>
        </button>
      )}

      {page === PAGE_HOME && (
        <HomePage_HUB
          identity={identity}
          onRegisterClub={() => {
            window.alert("Club registration wizard is coming next.");
          }}
          onFindClub={() => {
            window.alert("Club search will be connected next.");
          }}
          onViewClub={(club) => {
            setSelectedHomeClub(buildClubIdentity(club || { id: DEFAULT_CLUB_ID }));
            setPage(PAGE_ENTRY);
          }}
          onEnterTurfKings={(club) => {
            setSelectedHomeClub(buildClubIdentity(club || { id: DEFAULT_CLUB_ID }));
            setEntryPageIntent(null);
            setPage(PAGE_ENTRY);
          }}
          onNavigateToEntryPage={(payload) => {
            const club = payload?.club || payload;
            setSelectedHomeClub(buildClubIdentity(club || { id: DEFAULT_CLUB_ID }));
            setEntryPageIntent(payload?.intent || null);
            setPage(PAGE_ENTRY);
          }}
        />
      )}

      {page === PAGE_CLUB_CHAT && (
        <ClubChatPage
          onBack={() => setPage(PAGE_ENTRY)}
          activeClubId={activeClubId}
          activeClubName={activeClub?.name || activeClubIdentity?.name || "Club"}
          currentUser={null}
          selectedMember={null}
          identity={identity}
          isAdminViewer={isAdmin}
        />
      )}

      {page === PAGE_ENTRY && (
        <EntryPage
          identity={identity}
          members={members}
          activeClub={activeClub}
          activeClubId={activeClubId}
          entryPageIntent={entryPageIntent}
          selectedClub={activeClubIdentity}
          onComplete={handleEntryComplete}
          onDevSkipToLanding={() => setPage(PAGE_LANDING)}
          onGoHome={() => setPage(PAGE_HOME)}
          onOpenClubChat={() => setPage(PAGE_CLUB_CHAT)}
          onClubUpdated={(updatedClub) => {
            if (!updatedClub?.id) return;

            setSelectedHomeClub((prev) => {
              const merged = {
                ...(prev || {}),
                ...updatedClub,
              };

              return buildClubIdentity(merged);
            });
          }}
        />
      )}
      {practiceRestrictionModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(2, 6, 23, 0.78)",

          }}
        >
          <div
            style={{
              width: "min(520px, 94vw)",
              borderRadius: "26px",
              border: "1px solid rgba(217,70,239,0.55)",
              background:
                "linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,16,58,0.96))",
              boxShadow:
                "0 0 45px rgba(217,70,239,0.25), 0 0 80px rgba(14,165,233,0.16)",
              color: "white",
              padding: "1.35rem",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>
              {practiceRestrictionModal.icon}
            </div>

            <h2 style={{ margin: 0, fontSize: "1.65rem" }}>
              {practiceRestrictionModal.title}
            </h2>

            <p style={{ color: "#e5e7eb", lineHeight: 1.55, marginTop: "0.75rem" }}>
              {practiceRestrictionModal.message}
            </p>

            {!practiceRestrictionModal.locked && (
              <div style={{ display: "grid", gap: "0.7rem", marginTop: "1.1rem" }}>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={closePracticeRestriction}
                >
                  {practiceRestrictionModal.buttonLabel || "Got it"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showSessionSelector &&
        canChooseSessionMode &&
        page === PAGE_SESSION_SELECTOR && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(0.35rem, 1.2vh, 0.8rem)",
            overflowX: "hidden",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background:
              "radial-gradient(circle at top, rgba(30, 144, 255, 0.18), rgba(2, 6, 23, 0.96) 55%, rgba(0,0,0,0.98))",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              width: "min(920px, 98vw)",
              height: "auto",
              maxHeight: "none",
              overflow: "visible",
              border: "1px solid rgba(147, 197, 253, 0.55)",
              borderRadius: "28px",
              padding:
                "clamp(0.55rem, 1.25vh, 1.1rem) clamp(0.65rem, 1.6vh, 1.25rem) clamp(0.3rem, 0.65vh, 0.55rem)",
              display: "flex",
              flexDirection: "column",
              background:
                "linear-gradient(145deg, rgba(2, 8, 23, 0.98), rgba(7, 18, 38, 0.96))",
              boxShadow:
                "0 0 50px rgba(14, 165, 233, 0.25), 0 0 90px rgba(168, 85, 247, 0.18)",
              color: "white",
              position: "relative",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "clamp(0.45rem, 1vh, 1rem)", flexShrink: 0 }}>
              <div style={{ fontSize: "clamp(1.8rem, 5vh, 2.7rem)", lineHeight: 1, filter: "drop-shadow(0 0 18px rgba(251,191,36,0.8))" }}>
                👑
              </div>
              <h1 style={{ fontSize: "clamp(1.55rem, 4.5vh, 3rem)", margin: "0.2rem 0 0" }}>
                Choose Session
              </h1>
              <p style={{ color: "#dbeafe", fontSize: "clamp(0.78rem, 2vh, 1.05rem)", margin: "0.25rem 0 0" }}>
                Choose how you want to enter the platform.
              </p>
              <div
                style={{
                  width: 110,
                  height: 5,
                  margin: "clamp(0.35rem, 0.8vh, 0.7rem) auto 0",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #0ea5e9, #d946ef)",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gridAutoRows: "auto",
                gap: "clamp(0.25rem, 0.55vh, 0.55rem)",
                flex: "0 0 auto",
                minHeight: 0,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setPracticeRuntime(null);
                  setSessionMode("official");
                  setShowSessionSelector(false);
                  setPage(PAGE_LANDING);
                }}
                style={{
                  border: "1px solid #0ea5e9",
                  borderRadius: "24px",
                  padding: "clamp(0.65rem, 1.4vh, 1.1rem)",
                  minHeight: 0,
                  overflow: "hidden",
                  background:
                    "linear-gradient(180deg, rgba(2,6,23,0.35), rgba(2,6,23,0.96)), url('/session/official-session-bg.png'), radial-gradient(circle at top, rgba(14,165,233,0.42), rgba(2,6,23,0.96) 58%)",
                  backgroundSize: "cover, cover, cover",
                  backgroundPosition: "center, center, center",
                  backgroundRepeat: "no-repeat",
                  color: "white",
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow: "0 0 35px rgba(14,165,233,0.35)",
                  transform:
                    sessionChoiceEmphasis === "practice"
                      ? "scale(0.85)"
                      : "scale(0.90)",
                  transformOrigin: "center",
                  transition:
                    "transform 420ms ease, opacity 420ms ease, box-shadow 420ms ease",
                  opacity:
                    sessionChoiceEmphasis === "practice"
                      ? 0.92
                      : 1,
                }}
              >
                <div style={{ textAlign: "center", fontSize: "clamp(2rem, 5vh, 3.2rem)", marginBottom: "0.25rem", lineHeight: 1 }}>🏃‍♂️⚽</div>
                <h2 style={{ fontSize: "clamp(1.35rem, 3.5vh, 1.9rem)", textAlign: "center", margin: 0, lineHeight: 1.05 }}>Official<br />Session</h2>
                <hr style={{ borderColor: "rgba(14,165,233,0.55)", margin: "1rem 0" }} />
                <p>📊 Real standings & records</p>
                <p>🎥 Videos & highlights enabled</p>
                <p>🏅 Official stats & club history</p>
                <p>🔒 Permanent club records</p>
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "0.9rem",
                    borderRadius: "14px",
                    textAlign: "center",
                    background: "linear-gradient(90deg, #0f52ba, #0284c7)",
                    fontWeight: 800,
                  }}
                >
                  Continue Officially ›
                </div>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const weeklyPlayTime =
                    activeClubIdentity?.weeklyPlayTime ||
                    activeClubIdentity?.schedule?.weeklyPlayTime ||
                    activeClubIdentity?.schedule?.playTime ||
                    activeClubIdentity?.playTime ||
                    "Wednesdays, 17:30–19:00";

                  if (isInsideClubWeeklyWindow(weeklyPlayTime)) {
                    setOfficialStartWarning({
                      weeklyPlayTime,
                      mode: "practice-during-official",
                    });
                    return;
                  }

                  try {
                    // Practice v2 requires Firebase authentication because
                    // the server owns session authorization, credits and
                    // authoritative Practice identity.
                    //
                    // IMPORTANT:
                    // This authentication gate belongs ONLY to Practice.
                    // Official Session behaviour is deliberately untouched.
                    // Practice authentication:
                    // If Firebase Auth has no current user, complete the existing
                    // Google sign-in flow first. The Practice gateway remains the
                    // authoritative security boundary: it reads auth.currentUser,
                    // obtains a fresh Firebase ID token, and the server verifies it.
                    //
                    // Do not depend on React AuthContext propagation here because
                    // AuthContext enrichment may complete after Firebase Auth itself.
                    if (!authUser?.firebaseUser) {
                      await signInWithGoogle();
                    }

                    const runtime = await createPracticeRuntime({
                      clubId: activeClubId,
                    });

                    setCurrentConfirmedLineupSnapshot(null);
                    setConfirmedLineupsByMatchNo({});

                    // Practice v2:
                    // authoritative session + real Official roster +
                    // explicit disposable Practice DataScope.
                    setPracticeRuntime(runtime);
                    setSessionMode("practice");
                    setShowSessionSelector(false);
                    setPage(PAGE_LANDING);
                  } catch (err) {
                    console.error("[PRACTICE V2 START ERROR]", err);

                    if (err?.code === "practice/no-credits") {
                      showPracticeRestriction(
                        "Practice sessions used for this week",
                        "You have used all 3 Practice sessions available this week. Your allowance refreshes automatically next week. You can continue using your Official Session normally.",
                        "⏳"
                      );
                    } else {
                      showPracticeRestriction(
                        "Practice Session unavailable",
                        err?.message ||
                          "Practice Session could not be started right now. Your Official Session has not been affected.",
                        "⚠️"
                      );
                    }
                  }
                }}
                style={{
                  border: "1px solid #d946ef",
                  borderRadius: "24px",
                  padding: "clamp(0.65rem, 1.4vh, 1.1rem)",
                  minHeight: 0,
                  overflow: "hidden",
                  background:
                    "linear-gradient(180deg, rgba(2,6,23,0.35), rgba(2,6,23,0.96)), url('/session/practice-session-bg.png'), radial-gradient(circle at top, rgba(168,85,247,0.48), rgba(2,6,23,0.96) 58%)",
                  backgroundSize: "cover, cover, cover",
                  backgroundPosition: "center, center, center",
                  backgroundRepeat: "no-repeat",
                  color: "white",
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow: "0 0 35px rgba(217,70,239,0.35)",
                  transform:
                    sessionChoiceEmphasis === "official"
                      ? "scale(0.85)"
                      : "scale(0.90)",
                  transformOrigin: "center",
                  transition:
                    "transform 420ms ease, opacity 420ms ease, box-shadow 420ms ease",
                  opacity:
                    sessionChoiceEmphasis === "official"
                      ? 0.92
                      : 1,
                }}
              >
                <div style={{ textAlign: "center", fontSize: "clamp(2rem, 5vh, 3.2rem)", marginBottom: "0.25rem", lineHeight: 1 }}>🎮</div>
                <h2 style={{ fontSize: "clamp(1.35rem, 3.5vh, 1.9rem)", textAlign: "center", margin: 0, lineHeight: 1.05 }}>Practice<br />Session</h2>
                <hr style={{ borderColor: "rgba(217,70,239,0.55)", margin: "1rem 0" }} />
                <p>🎯 For learning the app purposes</p>
                <p>🧱 Isolated practice database</p>
                <p>🛡️ Never affects official club records</p>
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "0.9rem",
                    borderRadius: "14px",
                    textAlign: "center",
                    background: "linear-gradient(90deg, #7e22ce, #c026d3)",
                    fontWeight: 800,
                  }}
                >
                  Enter Practice Mode ›
                </div>
              </button>
            </div>


          </div>
        </div>
      )}

      {page === PAGE_LANDING && (
        <LandingPage
          activeClub={activeClubIdentity}
          activeClubId={activeClubId}
          activeClubName={activeClubName}
          clubIdentity={activeClubIdentity}
          teams={teams}
          currentMatchNo={activeMatchNo}
          currentMatch={effectiveLiveMatch}
          results={fullResults}
          streaks={streaks}
          hasLiveMatch={hasLiveMatch}
          matchType={matchType}
          gameFormat={gameFormat}
          matchSeconds={matchSeconds}
          defaultMatchSeconds={defaultMatchSeconds}
          onUpdateMatchSeconds={handleUpdateMatchSeconds}
          durationSwitchLocked={hasLiveMatch || running}
          activeTeamIds={normalizedActiveTeamIds}
          matchMode={matchMode}
          scheduledTarget={scheduledTarget}
          scheduledFixtures={scheduledFixtures}
          smartOffset={smartOffset}
          smartTarget={smartTarget}
          onUpdatePairing={handleUpdatePairing}
          onStartMatch={handleStartMatch}
          onSetMatchType={handleSetMatchType}
          onForceSetMatchType={handleForceSetMatchType}
          onSetGameFormat={handleSetGameFormat}
          onForceSetGameFormat={handleForceSetGameFormat}
          formatSwitchLocked={hasRecordedMatchDayState}
          onSetMatchMode={handleSetMatchMode}
          onGenerateScheduledPlan={handleGenerateScheduledPlan}
          onUpdateSmartOffset={handleUpdateSmartOffset}
          onGoToStats={() => handleGoToStats(PAGE_LANDING)}
          onOpenBackupModal={openBackupModal}
          onOpenEndSeasonModal={handleRequestEndSeason}
          onGoToLiveAsSpectator={handleGoToLiveAsSpectator}
          onGoToFormations={handleGoToFormations}
          onGoToNews={() => setPage(PAGE_NEWS)}
          onGoToHighlights={handleGoToViewHighlights}
          onOpenHighlightsCamera={handleOpenHighlightsCamera}
          onGoToEntryDev={handleChangeProfile}
          onGoToPayments={handleGoToMatchSignup}
          identity={pageIdentity}
          activeRole={activeRole}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          isPlayer={isPlayer}
          isSpectator={isSpectator}
          canStartMatch={canStartMatch}
          hasRecordedMatchDayState={hasRecordedMatchDayState}
        />
      )}

      {page === PAGE_MATCH_SIGNUP && canAccessMatchSignup && (
        <MatchSignupPage
          identity={pageIdentity}
          activeRole={activeRole}
          currentUser={null}
          teams={teams}
          activeSeasonId={activeSeasonId}
          activeClub={activeClub}
          activeClubId={activeClubId}
          isPracticeMode={isPracticeMode}
          practiceSessionId={practiceRuntime?.practiceSessionId || null}
          dataScope={footballDataScope}
          playerPhotosByName={effectivePlayerPhotosByName}
          onBack={() => setPage(PAGE_LANDING)}
          onProceedToPayment={handleProceedToPayment}
        />
      )}

      {page === PAGE_MATCH_SIGNUP && !canAccessMatchSignup && (
        <EntryPage
          identity={identity}
          members={members}
          selectedClub={activeClubIdentity}
          onComplete={handleEntryComplete}
          onDevSkipToLanding={() => setPage(PAGE_LANDING)}
          onGoHome={() => setPage(PAGE_HOME)}
        />
      )}

      {page === PAGE_PAYMENT && (
        <PaymentPage
          identity={pageIdentity}
          activeRole={activeRole}
          activeSeasonId={activeSeasonId}
          paymentContext={paymentContext}
          activeClubId={activeClubId}
          isPracticeMode={isPracticeMode}
          practiceSessionId={practiceRuntime?.practiceSessionId || null}
          dataScope={footballDataScope}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          onBack={handleBackFromPayment}
          onDone={() => setPage(PAGE_MATCH_SIGNUP)}
        />
      )}

      {page === PAGE_MIGRATION && (
        <MigrationPage onBack={() => setPage(PAGE_LANDING)} />
      )}

      {page === PAGE_LIVE && (
        <LiveMatchPage
          matchSeconds={matchSeconds}
          secondsLeft={secondsLeft}
          timeUp={timeUp}
          running={running}
          teams={pendingMatchStartContext?.teams || teams}
          fiveVFiveTeams={pendingMatchStartContext?.fiveVFiveTeams || getActiveFriendlyTeams(fiveVFiveTeams)}
          currentMatchNo={pendingMatchStartContext?.matchNo || activeMatchNo}
          currentMatch={pendingMatchStartContext?.currentMatch || effectiveLiveMatch}
          currentEvents={currentEvents}
          identity={pageIdentity}
          activeRole={activeRole}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          canControlMatch={canControlCurrentLiveMatch}
          refereeDeviceId={refereeDeviceId}
          liveMatchController={activeLiveController}
          liveMatchTakeoverRequest={liveMatchDraft?.takeoverRequest || null}
          canControlCurrentLiveMatch={canControlCurrentLiveMatch}
          onTakeOverLiveMatch={handleTakeOverLiveMatch}
          onRequestTakeOverLiveMatch={handleRequestTakeOverLiveMatch}
          onAcceptTakeoverRequest={handleAcceptTakeoverRequest}
          onRejectTakeoverRequest={handleRejectTakeoverRequest}
          pendingMatchStartContext={pendingMatchStartContext}
          matchType={pendingMatchStartContext?.matchType || matchType}
          gameFormat={pendingMatchStartContext?.gameFormat || gameFormat}
          onUpdateMatchSeconds={handleUpdateMatchSeconds}
          expectedEndAtISO={
            (pendingMatchStartContext?.matchType || matchType) ===
            MATCH_TYPE.FRIENDLY
              ? liveMatchDraft?.expectedEndAtISO || null
              : null
          }
          scheduledFinishAtISO={
            (pendingMatchStartContext?.matchType || matchType) ===
            MATCH_TYPE.FRIENDLY
              ? liveMatchDraft?.scheduledFinishAtISO || null
              : null
          }
          onUpdateExpectedEndTime={
            (pendingMatchStartContext?.matchType || matchType) ===
            MATCH_TYPE.FRIENDLY
              ? handleUpdateLiveFinishTime
              : null
          }
          rotationReminderMode={liveMatchDraft?.rotationReminderMode || "off"}
          onUpdateRotationReminder={handleUpdateRotationReminder}
          redCardRule={liveMatchDraft?.redCardRule || "permanent"}
          onUpdateRedCardRule={handleUpdateRedCardRule}
          matchTeamColorOverrides={
            liveMatchDraft?.matchTeamColorOverrides || {}
          }
          onUpdateMatchTeamColorOverride={
            handleUpdateMatchTeamColorOverride
          }
          onResetMatchTeamColorOverrides={
            handleResetMatchTeamColorOverrides
          }
          confirmedLineupSnapshot={currentConfirmedLineupSnapshot}
          confirmedLineupsByMatchNo={confirmedLineupsByMatchNo}
          playerPhotosByName={effectivePlayerPhotosByName}
          activeClubId={footballStateClubId}
          dataScope={footballDataScope}
          activeClub={activeClub}
          onConfirmPreMatchLineups={handleConfirmPreMatchLineups}
          onCancelPreMatchLineups={handleCancelPreMatchLineups}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
          onUndoLastEvent={handleUndoLastEvent}
          onConfirmEndMatch={handleConfirmEndMatch}
          onBackToLanding={handleDiscardMatchAndBack}
          onGoToStats={() => handleGoToStats(PAGE_LIVE)}
          onOpenHighlightsCamera={handleOpenHighlightsCamera}
        />
      )}

      {page === PAGE_SPECTATOR && (
        <SpectatorPage
          teams={matchType === MATCH_TYPE.FRIENDLY ? getActiveFriendlyTeams(fiveVFiveTeams) : teams}
          currentMatchNo={activeMatchNo}
          currentMatch={effectiveLiveMatch}
          currentEvents={currentEvents}
          results={results}
          onBackToLanding={handleBackToLanding}
        />
      )}

      {page === PAGE_STATS && (
        <StatsPage
          teams={teams}
          friendlyTeams={
            isPracticeMode ? teams : getActiveFriendlyTeams(fiveVFiveTeams)
          }
          fiveVFiveTeams={getActiveFriendlyTeams(fiveVFiveTeams)}
          gameFormat={gameFormat}
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
          onGoToPlayerCards={() => {
            if (isRefereeStatsView) {
              openRefereeLockModal();
              return;
            }
            setPage(PAGE_PLAYER_CARDS);
          }}
          onGoToPeerReview={() => {
            if (isRefereeStatsView) {
              openRefereeLockModal();
              return;
            }
            setPage(PAGE_PEER_REVIEW);
          }}
          members={members}
          activeSeasonId={USE_V2 ? safeV2ForStats?.activeSeasonId : null}
          seasons={USE_V2 ? safeV2ForStats?.seasons || [] : []}
          playerPhotosByName={effectivePlayerPhotosByName}
          matchDayHistory={matchDayHistory || []}
          friendlyMatchDayHistory={friendlyMatchDayHistory || []}
          onDeleteSavedMatch={handleDeleteSavedMatch}
          onUpdateSavedEvent={handleUpdateSavedEvent}
          onDeleteSavedEvent={handleDeleteSavedEvent}
          onAddSavedEvent={handleAddSavedEvent}
          onRedistributeFriendlyDefensiveBlocks={
            handleRedistributeFriendlyDefensiveBlocks
          }
          onDeleteCurrentEmptySeason={handleDeleteCurrentEmptySeason}
          canPreviewPreviousSeasonUI={canPreviewPreviousSeasonUI}
          isAdmin={Boolean(
            isAdmin ||
            realRole === "admin"
          )}
          identity={pageIdentity}
          matchType={matchType}
          isPracticeMode={isPracticeMode}
          dataScope={footballDataScope}
        />
      )}

      {page === PAGE_VIEW_HIGHLIGHTS && (
        <VideoHighlightsPage
          matchId={currentVideoHighlightsMatchId}
          activeClubId={activeClubId}
          identity={pageIdentity}
          activeRole={activeRole}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          isPlayer={isPlayer}
          members={members}
          teams={matchType === MATCH_TYPE.FRIENDLY ? getActiveFriendlyTeams(fiveVFiveTeams) : teams}
          friendlyTeams={
            isPracticeMode ? teams : getActiveFriendlyTeams(fiveVFiveTeams)
          }
          currentMatch={effectiveLiveMatch}
          matchType={matchType}
          gameFormat={gameFormat}
          activeSeasonId={activeSeasonId}
          currentMatchNo={activeMatchNo}
          currentMatchDayHighlights={currentMatchDayHighlights}
          votesByUser={highlightVotesByUser}
          onUploadHighlight={handleUploadHighlight}
          onVotesChange={async (nextVotes) => {
            setHighlightVotesByUser(nextVotes);

            const userId =
              String(
                pageIdentity?.memberId ||
                  pageIdentity?.playerId ||
                  pageIdentity?.email ||
                  pageIdentity?.shortName ||
                  pageIdentity?.fullName ||
                  pageIdentity?.displayName ||
                  ""
              )
                .trim()
                .toLowerCase();

            if (
              !isPracticeMode &&
              userId &&
              currentVideoHighlightsMatchId
            ) {
              try {
                await VideoHighlightsRepository.saveHighlightVotesToFirebase({
                  matchId: currentVideoHighlightsMatchId,
                  userId,
                  votes: nextVotes?.[userId] || {},
                });
              } catch (error) {
                console.error("[TK HIGHLIGHTS] Failed to save highlight votes:", error);
              }
            }
          }}
          onHighlightsSelectionChange={setHighlightArchiveSelection}
          onBack={handleBackToLanding}
          onAttachHighlightToClubChat={(highlight) => {
            window.dispatchEvent(new CustomEvent("fanm_attach_highlight_to_chat", {
              detail: {
                id: highlight.id || highlight.clipId || highlight.highlightId || "",
                title: highlight.title || "Club highlight",
                label: highlight.label || highlight.title || "Goal clip",
                playerName: highlight.playerName || highlight.goalScorer || highlight.scorer || "",
                scorerName: highlight.scorerName || highlight.playerName || highlight.goalScorer || highlight.scorer || "",
                teamName: highlight.teamName || "",
                matchDayId: highlight.matchDayId || highlight.matchdayId || "",
                mediaUrl: highlight.mediaUrl || highlight.videoUrl || highlight.downloadUrl || highlight.fileUrl || "",
                type: highlight.normalizedType || highlight.type || highlight.tag || "highlight",
              },
            }));
          }}
        />
      )}


      {page === PAGE_NEWS && (
        <NewsPage
          matchType={matchType}
          teams={teams}
          results={fullResults}
          allEvents={fullEvents}
          currentResults={results}
          currentEvents={currentEvents}
          matchDayHistory={matchDayHistory}
          playerPhotosByName={effectivePlayerPhotosByName}
          identity={pageIdentity}
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
          activeClub={activeClub}
          activeClubId={activeClubId}
          isPracticeMode={isPracticeMode}
          practiceSessionId={practiceRuntime?.practiceSessionId || null}
          dataScope={footballDataScope}
        />
      )}

      {page === PAGE_PLAYER_CARDS && (
        <PlayerCardPage
          teams={matchType === MATCH_TYPE.FRIENDLY ? getActiveFriendlyTeams(fiveVFiveTeams) : teams}
          allEvents={
            matchType === MATCH_TYPE.FRIENDLY
              ? archivedFriendlyEventsFromHistory
              : fullSeasonEventsForStats
          }
          archivedEvents={
            matchType === MATCH_TYPE.FRIENDLY
              ? currentEvents
              : []
          }
          peerRatingsByPlayer={peerRatingsByPlayer}
          playerPhotosByName={effectivePlayerPhotosByName}
          activeSeasonId={USE_V2 ? safeV2ForStats?.activeSeasonId : null}
          activeMatchType={matchType}
          matchType={matchType}
          gameFormat={gameFormat}
          activeSeasonNo={USE_V2 ? activeSeasonNo : null}
          activeClub={activeClub}
          activeClubId={activeClubId}
          isPracticeMode={isPracticeMode}
          dataScope={footballDataScope}
          finalPlayerCardSnapshot={
            USE_V2
              ? (() => {
                  const seasons = Array.isArray(safeV2ForStats?.seasons)
                    ? safeV2ForStats.seasons
                    : [];
                  const activeIndex = seasons.findIndex(
                    (season) =>
                      String(season?.seasonId || "") ===
                      String(safeV2ForStats?.activeSeasonId || "")
                  );

                  return activeIndex > 0
                    ? seasons[activeIndex - 1]?.finalPlayerCardSnapshot || null
                    : null;
                })()
              : null
          }
          onBack={() => setPage(PAGE_STATS)}
        />
      )}

      {page === PAGE_PEER_REVIEW && (
        <PeerReviewPage
          teams={peerReviewTeams}
          playerPhotosByName={effectivePlayerPhotosByName}
          identity={pageIdentity}
          activeSeasonId={USE_V2 ? safeV2ForStats?.activeSeasonId : null}
          activeClub={activeClub}
          activeClubId={activeClubId}
          isPracticeMode={isPracticeMode}
          dataScope={footballDataScope}
          onBack={() => setPage(PAGE_STATS)}
        />
      )}

      {page === PAGE_SQUADS && (
        <SquadsPage
          teams={teams}
          fiveVFiveTeams={ensureFiveVFiveTeamsShape(fiveVFiveTeams)}
          onUpdateTeams={handleUpdateTeams}
          onUpdateFiveVFiveTeams={handleUpdateFiveVFiveTeams}
          onBack={() => setPage(PAGE_FORMATIONS)}
          identity={pageIdentity}
          isAdmin={isAdmin}
          activeRole={activeRole}
          matchType={matchType}
          gameFormat={gameFormat}
          activeClub={activeClub}
          activeClubId={activeClubId}
          isPracticeMode={isPracticeMode}
          dataScope={footballDataScope}
          activeTeamIds={normalizedActiveTeamIds}
          onUpdateActiveTeamIds={handleUpdateActiveTeamIds}
          activeSeasonId={USE_V2 ? safeV2ForStats?.activeSeasonId : null}
          seasonNo={USE_V2 ? activeSeasonNo : null}
          matchDayHistory={matchDayHistory || []}
          onSquadPreviewEditingChange={setSquadsAdminPreviewOpen}
        />
      )}

      {page === PAGE_FORMATIONS && (
        <FormationsPage
          teams={teams}
          fiveVFiveTeams={getActiveFriendlyTeams(fiveVFiveTeams)}
          currentMatch={effectiveLiveMatch}
          currentEvents={currentEvents}
          allEvents={allEvents}
          results={results}
          friendlyMatchDayHistory={friendlyMatchDayHistory || []}
          playerPhotosByName={effectivePlayerPhotosByName}
          identity={pageIdentity}
          activeClub={activeClub}
          activeClubId={activeClubId}
          isPracticeMode={isPracticeMode}
          practiceSessionId={practiceRuntime?.practiceSessionId || null}
          onBack={handleBackToLanding}
          onGoToSquads={handleGoToSquads}
          matchType={matchType}
          gameFormat={gameFormat}
          activeTeamIds={normalizedActiveTeamIds}
        />
      )}

      {cameraInstallPrompt && (
        <div className="modal-backdrop" style={{ zIndex: 10080 }}>
          <div
            className="modal"
            style={{
              maxWidth: "520px",
              width: "92vw",
              padding: isBackupModalMobile ? "1.05rem" : "1.25rem",
              border: "1px solid rgba(56,189,248,0.38)",
              background:
                "radial-gradient(circle at top, rgba(56,189,248,0.18), rgba(2,6,23,0.98) 58%)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.55), 0 0 34px rgba(56,189,248,0.12)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "0.85rem" }}>
              <div
                style={{
                  width: "76px",
                  height: "76px",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2.65rem",
                  background: "rgba(56,189,248,0.14)",
                  border: "1px solid rgba(125,211,252,0.34)",
                  boxShadow: "0 0 24px rgba(56,189,248,0.18)",
                }}
              >
                📹
              </div>
              <h3 style={{ margin: "0.65rem 0 0.25rem", color: "#bae6fd" }}>
                Install Camera App
              </h3>
              <p style={{ margin: 0, fontWeight: 800 }}>
                Record this live match as a 5-Asides Near Me recording device.
              </p>
            </div>

            <div
              style={{
                padding: "0.9rem",
                borderRadius: "1rem",
                border: "1px solid rgba(56,189,248,0.24)",
                background: "rgba(15,23,42,0.58)",
                marginBottom: "1rem",
                lineHeight: 1.5,
              }}
            >
              <p style={{ marginTop: 0, fontWeight: 900 }}>
                The camera app did not open automatically.
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                Install it once, then tap the lens button again. The app will open directly into this match and ask you to confirm that your phone is recording.
              </p>
              <p style={{ margin: "0.65rem 0 0", color: "#bae6fd" }}>
                Match link prepared: <strong>{cameraInstallPrompt.payload?.currentVideoHighlightsMatchId || "current match"}</strong>
              </p>
            </div>

            <div
              className="actions-row"
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.75rem",
                alignItems: "center",
                marginTop: "1rem",
              }}
            >
              <button className="secondary-btn" type="button" onClick={handleCloseCameraInstallPrompt}>
                Not now
              </button>
              <button className="secondary-btn" type="button" onClick={handleRetryOpenHighlightsCamera}>
                Try open again
              </button>
              <a
                className="primary-btn"
                href={cameraInstallPrompt.installUrl}
                download
                style={{
                  gridColumn: isBackupModalMobile ? "auto" : "1 / -1",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                  background:
                    "linear-gradient(135deg, rgba(14,165,233,0.98), rgba(56,189,248,0.92))",
                  border: "1px solid rgba(125,211,252,0.42)",
                  color: "#020617",
                  fontWeight: 950,
                }}
              >
                Download Camera App APK
              </a>
            </div>
          </div>
        </div>
      )}

      {showBackupModal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            style={{
              maxWidth: "780px",
              width: isBackupModalMobile ? "94vw" : "95vw",
              maxHeight: "92vh",
              padding: 0,
              boxSizing: "border-box",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: isBackupModalMobile ? "1rem 1rem 0.75rem" : "1.25rem 1.35rem 0.85rem",
                flexShrink: 0,
              }}
            >
              <h3 style={{ marginBottom: "0.45rem" }}>End Match Day</h3>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: 0,
                  maxWidth: "560px",
                  lineHeight: 1.45,
                }}
              >
                Save the match day to the server and clear the live board. Attendance is auto-filled; review it only when needed.
              </p>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  marginTop: "0.75rem",
                }}
              >
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setShowAttendanceAudit((prev) => !prev);
                    setShowAttendanceInfo(false);
                  }}
                  style={{
                    width: "fit-content",
                    padding: "0.45rem 0.85rem",
                    borderRadius: "999px",
                    borderColor: "rgba(56,189,248,0.42)",
                    color: "#bae6fd",
                    fontWeight: 850,
                  }}
                >
                  {showAttendanceAudit ? "Hide attendance" : "Attendance"}
                </button>

                {showAttendanceAudit && (
                  <button
                    type="button"
                    onClick={() => setShowAttendanceInfo((prev) => !prev)}
                    aria-label="Explain attendance"
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "999px",
                      border: "1px solid rgba(56,189,248,0.62)",
                      background: "rgba(14,165,233,0.12)",
                      color: "#7dd3fc",
                      fontWeight: 950,
                      cursor: "pointer",
                    }}
                  >
                    i
                  </button>
                )}
              </div>

              {showAttendanceAudit && showAttendanceInfo && (
                <div
                  style={{
                    position: "absolute",
                    zIndex: 30,
                    marginTop: "0.65rem",
                    width: isBackupModalMobile ? "min(78vw, 330px)" : "390px",
                    padding: "1rem",
                    borderRadius: "18px",
                    border: "1px solid rgba(148,163,184,0.36)",
                    background:
                      "linear-gradient(180deg, rgba(15,23,42,0.985), rgba(2,6,23,0.99))",
                    boxShadow: "0 22px 50px rgba(0,0,0,0.55)",
                    color: "rgba(255,255,255,0.92)",
                    lineHeight: 1.5,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "1rem",
                    }}
                  >
                    <strong style={{ fontSize: "1.02rem" }}>
                      About attendance
                    </strong>

                    <button
                      type="button"
                      onClick={() => setShowAttendanceInfo(false)}
                      style={{
                        border: 0,
                        background: "transparent",
                        color: "rgba(226,232,240,0.78)",
                        fontSize: "1.35rem",
                        cursor: "pointer",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "0.9rem",
                      marginTop: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "34px 1fr",
                        gap: "0.75rem",
                        alignItems: "start",
                      }}
                    >
                      <span
                        style={{
                          color: "#22c55e",
                          fontWeight: 950,
                          fontSize: "1.15rem",
                        }}
                      >
                        ✓
                      </span>

                      <div>
                        <strong>Games played are estimated automatically from today’s match activity.</strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "34px 1fr",
                        gap: "0.75rem",
                        alignItems: "start",
                      }}
                    >
                      <span
                        style={{
                          color: "#facc15",
                          fontWeight: 950,
                          fontSize: "1.15rem",
                        }}
                      >
                        ⟳
                      </span>

                      <div>
                        When teams have substitutes, the system assumes players shared game time fairly across the 5-minute matches.
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "34px 1fr",
                        gap: "0.75rem",
                        alignItems: "start",
                      }}
                    >
                      <span
                        style={{
                          color: "#38bdf8",
                          fontWeight: 950,
                          fontSize: "1.15rem",
                        }}
                      >
                        ±
                      </span>

                      <div>
                        Use + or − to adjust a player’s games played if they missed matches, arrived late, or were injured early.
                      </div>
                    </div>
                  </div>

                  <p
                    style={{
                      margin: "1rem 0 0",
                      paddingTop: "0.85rem",
                      borderTop: "1px solid rgba(148,163,184,0.18)",
                      color: "rgba(226,232,240,0.78)",
                    }}
                  >
                    These records are saved to the club’s statistics history.
                  </p>
                </div>
              )}
            </div>

            <div
              style={{
                display: showAttendanceAudit ? "flex" : "none",
                flexDirection: "column",
                gap: isBackupModalMobile ? "0.7rem" : "0.85rem",
                flex: "1 1 auto",
                minHeight: 0,
                overflowY: "auto",
                padding: isBackupModalMobile ? "0 1rem 0.75rem" : "0 1.35rem 0.85rem",
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

            <div
              className="actions-row"
              style={{
                display: "grid",
                gridTemplateColumns: isBackupModalMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.65rem",
                alignItems: "stretch",
                padding: isBackupModalMobile ? "0.85rem 1rem 1rem" : "0.9rem 1.35rem 1.2rem",
                background: "rgba(2,6,23,0.94)",
                borderTop: "1px solid rgba(148,163,184,0.16)",
                boxShadow: "0 -14px 30px rgba(0,0,0,0.22)",
                flexShrink: 0,
              }}
            >
              <button
                className="secondary-btn"
                onClick={handleClearOnly}
                style={{
                  borderColor: "rgba(248,113,113,0.62)",
                  background: "linear-gradient(135deg, rgba(127,29,29,0.96), rgba(220,38,38,0.9))",
                  color: "#ffffff",
                  fontWeight: 950,
                }}
              >
                Delete day's games
              </button>

              <div style={{ textAlign: "center", color: "rgba(226,232,240,0.55)", fontWeight: 900 }}>
                OR
              </div>

              <button className="secondary-btn" onClick={closeBackupModal}>
                Cancel
              </button>

              <div style={{ textAlign: "center", color: "rgba(226,232,240,0.55)", fontWeight: 900 }}>
                OR
              </div>
              <button
                className="primary-btn"
                type="button"
                onClick={handleRequestSaveAndClearMatchDay}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(22,163,74,0.98), rgba(34,197,94,0.92))",
                  border: "1px solid rgba(134,239,172,0.42)",
                  boxShadow: "0 0 22px rgba(34,197,94,0.22)",
                  color: "#ffffff",
                  fontWeight: 900,
                }}
              >
                Save to server &amp; clear
              </button>
            </div>
          </div>
        </div>
      )}


      {showSaveConfirmModal && (
        <div
          className="modal-backdrop"
          style={{
            zIndex: 10050,
            paddingLeft: "1rem",
            paddingRight: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            className="modal"
            style={{
              maxWidth: "540px",
              width: "92vw",
              padding: isBackupModalMobile ? "1.05rem" : "1.35rem",
              border: "1px solid rgba(34,197,94,0.44)",
              background:
                "radial-gradient(circle at top, rgba(34,197,94,0.18), rgba(2,6,23,0.98) 58%)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.55), 0 0 34px rgba(34,197,94,0.16)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "0.9rem" }}>
              <div
                style={{
                  width: "82px",
                  height: "82px",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "3rem",
                  background: "rgba(34,197,94,0.16)",
                  border: "1px solid rgba(134,239,172,0.35)",
                  boxShadow: "0 0 24px rgba(34,197,94,0.22)",
                }}
              >
                😄
              </div>
              <h3 style={{ margin: "0.65rem 0 0.25rem", color: "#86efac" }}>
                Well done!
              </h3>
              <p style={{ margin: 0, fontWeight: 800 }}>Great official match day.</p>
            </div>

            <div
              style={{
                padding: "0.9rem",
                borderRadius: "1rem",
                border: "1px solid rgba(34,197,94,0.28)",
                background: "rgba(15,23,42,0.58)",
                marginBottom: "1rem",
                lineHeight: 1.5,
              }}
            >
              <p style={{ marginTop: 0, fontWeight: 900 }}>
                You are about to save an official match day.
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                ✅ Save all participation and stats to the server.
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                ✅ Clear the live board for the next match day.
              </p>
              <p style={{ margin: "0.65rem 0 0", color: "#bbf7d0" }}>
                If this was a practice run or dummy data, cancel and use <strong>Delete day's games</strong> instead.
              </p>
            </div>

            <div className="field-row">
              <label>
  Admin code {endMatchDayAdminName ? `(${endMatchDayAdminName})` : ""}
</label>
              <input
                type="password"
                className="text-input"
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                }}
                value={saveConfirmCode}
                onChange={(e) => {
                  setSaveConfirmCode(e.target.value);
                  setSaveConfirmError("");
                }}
                autoFocus
              />
              {saveConfirmError && <p className="error-text">{saveConfirmError}</p>}
            </div>

            <div
              className="actions-row"
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.75rem",
                alignItems: "center",
                marginTop: "1rem",
              }}
            >
              <button
                type="button"
                onClick={closeSaveConfirmModal}
                aria-label="Go back"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "999px",
                  border: "1px solid rgba(148,163,184,0.24)",
                  background: "rgba(15,23,42,0.72)",
                  color: "#e2e8f0",
                  fontSize: "1.15rem",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ←
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleSaveAndClearMatchDay}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(22,163,74,0.98), rgba(34,197,94,0.92))",
                  border: "1px solid rgba(134,239,172,0.42)",
                  color: "#ffffff",
                  fontWeight: 900,
                }}
              >
                Confirm &amp; Save to server
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearOnlyConfirmModal && (
        <div
          className="modal-backdrop"
          style={{
            zIndex: 10050,
            paddingLeft: "1rem",
            paddingRight: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            className="modal"
            style={{
              maxWidth: "520px",
              width: "92vw",
              padding: isBackupModalMobile ? "1.05rem" : "1.25rem",
              border: "1px solid rgba(248,113,113,0.36)",
              background:
                "radial-gradient(circle at top, rgba(239,68,68,0.18), rgba(2,6,23,0.98) 58%)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.55)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#fecaca" }}>⚠️ Delete day’s games</h3>
            <p style={{ lineHeight: 1.5, marginBottom: "0.75rem" }}>
              <strong>Delete day’s games will remove this match-day data without saving it to the server.</strong>
            </p>
            <p style={{ lineHeight: 1.5, marginTop: 0, color: "rgba(255,255,255,0.86)" }}>
              Only continue if this was a practice run or dummy data. If this was a real match day,
              go back and use <strong>Save to server &amp; clear</strong> instead.
            </p>
            <p style={{ lineHeight: 1.5, color: "#fde68a", fontWeight: 800 }}>
              Do not enter the code unless you are intentionally deleting test data.
            </p>

            <div className="field-row">
              <label>
  Re-enter admin code {endMatchDayAdminName ? `(${endMatchDayAdminName})` : ""} to confirm discard
</label>
              <input
                type="password"
                className="text-input"
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                }}
                value={clearOnlyConfirmCode}
                onChange={(e) => {
                  setClearOnlyConfirmCode(e.target.value);
                  setClearOnlyConfirmError("");
                }}
              />
              {clearOnlyConfirmError && (
                <p className="error-text">{clearOnlyConfirmError}</p>
              )}
            </div>

            <div
              className="actions-row"
              style={{
                display: "grid",
                gridTemplateColumns: isBackupModalMobile ? "1fr" : "1fr 1fr",
                gap: "0.65rem",
                marginTop: "1rem",
              }}
            >
              <button
                type="button"
                onClick={closeClearOnlyConfirmModal}
                aria-label="Go back"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "999px",
                  border: "1px solid rgba(248,113,113,0.22)",
                  background: "rgba(15,23,42,0.72)",
                  color: "#fecaca",
                  fontSize: "1.15rem",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ←
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={handleConfirmClearOnly}
                style={{ borderColor: "rgba(248,113,113,0.5)", color: "#fecaca" }}
              >
                Delete day’s games
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
        <div
          className="modal-backdrop"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            className="modal"
            style={{
              width: "100%",
              maxWidth: "390px",
              borderRadius: "24px",
              padding: "1.15rem",
            }}
          >
            <h3>End Season</h3>
            <p>
              This will create a <strong>new season</strong> and make it active.
              The current season’s history remains saved on the server. (End
              Match Day is separate.)
            </p>
            <div className="field-row">
              <label>Admin code {endMatchDayAdminName ? `(${endMatchDayAdminName})` : ""}</label>
              <input
                type="password"
                className="text-input"
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                }}
                value={endSeasonCode}
                onChange={(e) => {
                  setEndSeasonCode(e.target.value);
                  setEndSeasonError("");
                }}
              />
              {endSeasonError && <p className="error-text">{endSeasonError}</p>}
            </div>
            <div className="actions-row">
              <button
                type="button"
                onClick={closeEndSeasonModal}
                aria-label="Go back"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "999px",
                  border: "1px solid rgba(148,163,184,0.24)",
                  background: "rgba(15,23,42,0.72)",
                  color: "#e2e8f0",
                  fontSize: "1.15rem",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ←
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

      {[
        PAGE_LANDING,
        PAGE_MATCH_SIGNUP,
        PAGE_PAYMENT,
        PAGE_LIVE,
        PAGE_STATS,
        PAGE_VIEW_HIGHLIGHTS,
        PAGE_NEWS,
        PAGE_PLAYER_CARDS,
        PAGE_PEER_REVIEW,
        PAGE_SQUADS,
        PAGE_FORMATIONS,
      ].includes(page) &&
      !(
        page === PAGE_LIVE &&
        normalizeMatchMode(matchType, MATCH_TYPE.FRIENDLY) ===
          MATCH_TYPE.FRIENDLY
      ) &&
      (
        isAdmin ||
        isCaptain ||
        Boolean(identity?.memberId || identity?.playerId)
      ) ? (
        <ClubChatWidget
          activeClubId={activeClubId}
          activeClubName={activeClubName}
          currentUser={{
            uid: identity?.uid || identity?.email || "",
            email: identity?.email || "",
            displayName: identity?.fullName || identity?.shortName || "",
          }}
          selectedMember={identity?.memberId ? {
            id: identity.memberId,
            fullName: identity.fullName || "",
            shortName: identity.shortName || "",
            email: identity.email || "",
            role: identity.role || identity.actingRole || "player",
          } : null}
          identity={identity}
          isAdminViewer={isAdmin}
          activeSeasonId={activeSeasonId}
          currentMatchNo={currentMatchNo}
          matchType={matchType}
          gameFormat={gameFormat}
          members={members}
          onOpenHighlight={handleGoToViewHighlights}
          variant="launcher"
        />
      ) : null}

      {showBottomNav && !showBackupModal && !showSessionSelector ? (
        <BottomNav
          currentPage={page}
          activeClub={activeClubIdentity}
          activeClubName={activeClubName}
          onNavigate={handleBottomNavNavigate}
          hasLiveMatch={hasLiveMatch || running}
          canAccessLive={Boolean(canStartMatch || hasLiveMatch || running)}
          canManageSquads={canManageSquads}
          canAccessPayments={canAccessMatchSignup}
          locked={isRefereeStatsView}
          lockedMessage="You Are A Referee, have you forgotten? Return to the Game Controls"
        />
      ) : null}

    </div>
  );
}
