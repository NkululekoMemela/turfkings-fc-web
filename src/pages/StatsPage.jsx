// src/pages/StatsPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebaseConfig";
import { getDocs } from "firebase/firestore";
import {
  getPlayersCollection,
  getPlayerPhotosCollection,
} from "../core/clubFirestorePaths";

import { buildPlayerEventStats } from "../core/playerEventStats.js";
// ---------------- HELPERS ----------------
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
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function safeLower(s) {
  return String(s || "").trim().toLowerCase();
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
}

function isoDateOnly(x) {
  const s = String(x || "").trim();
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function friendlyDateFromRecord(record = {}) {
  const candidates = [
    record?._tkMatchDayId,
    record?._tkMatchDayLabel,
    record?.matchDayId,
    record?.id,
    record?.date,
    record?.createdAt,
    record?.updatedAt,
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
      return parsed.toISOString().slice(0, 10);
    }
  }

  return "";
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatFriendlyDayLabel(isoDate, indexFromNewest = 0) {
  const iso = isoDateOnly(isoDate);
  if (!iso) return "Friendly";

  const d = startOfLocalDay(`${iso}T00:00:00`);
  const now = startOfLocalDay(new Date());
  const diffDays = Math.round((now.getTime() - d.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays > 0 && diffDays <= 6) return "This week";
  if (indexFromNewest === 1 && diffDays > 6 && diffDays <= 13) {
    return "Last week";
  }

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function formatFriendlyDuplicateSuffix(duplicateIndex = 0) {
  const n = Number(duplicateIndex || 0);
  return n > 0 ? `_${n + 1}` : "";
}

function normalizeStatsGameFormatValue(value, fallback = "5_V_5") {
  const raw = String(value || fallback || "5_V_5").trim().toUpperCase();
  if (raw === "6_V_6" || raw === "6V6" || raw === "SIX_V_SIX") return "6_V_6";
  if (raw === "7_V_7" || raw === "7V7" || raw === "SEVEN_V_SEVEN") return "7_V_7";
  return "5_V_5";
}

function getStatsGameFormat(record = {}, fallback = "5_V_5") {
  return normalizeStatsGameFormatValue(
    record?.gameFormat || record?.format || record?.matchFormat || fallback,
    fallback
  );
}

function formatStatsGameFormatLabel(value) {
  const resolved = normalizeStatsGameFormatValue(value);
  if (resolved === "6_V_6") return "6v6";
  if (resolved === "7_V_7") return "7v7";
  return "5v5";
}

function formatEventTypeLabel(type, role = "") {
  if (type === "clean_sheet") {
    if (role === "gk") return "clean sheet (GK)";
    if (role === "def") return "clean sheet (DEF)";
    return "clean sheet";
  }
  return "goal";
}

function formatFootballMinute(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));

  if (!Number.isFinite(safeSeconds)) return "";

  return `${Math.floor(safeSeconds / 60)}'`;
}

function formatSecondsSafe(seconds) {
  const v = Number(seconds || 0);
  const safe = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  const m = Math.floor(safe / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}


function getForcedCanonicalName(rawName) {
  const raw = String(rawName || "").trim();
  if (!raw) return "";

  const lowered = safeLower(raw);
  const compact = lowered.replace(/[^a-z0-9]/g, "");

  // Hard merge for known renamed / typo histories that must never split in stats.
  if (
    lowered === "joshua daniel" ||
    lowered === "roshi* joshua daniel" ||
    lowered === "roshi joshua daniel" ||
    compact === "joshuadaniel" ||
    compact === "roshijoshuadaniel"
  ) {
    return "Joshua Daniel";
  }

  if (
    lowered === "humbu mlaudzii" ||
    lowered === "humbu mlaudzi" ||
    lowered === "humbulani mulaudzi" ||
    compact === "humbumlaudzii" ||
    compact === "humbumlaudzi" ||
    compact === "humbulanimulaudzi"
  ) {
    return "Humbulani Mulaudzi";
  }

  return "";
}


function resolveCanonicalNameFromMap(rawName, map) {
  if (!rawName || typeof rawName !== "string") return "";

  const forced = getForcedCanonicalName(rawName);
  if (forced) return forced;

  const tc = toTitleCase(rawName);
  if (!tc) return "";

  const direct = map[safeLower(tc)];
  if (direct) return getForcedCanonicalName(direct) || direct;

  const bySlug = map[slugFromName(tc)];
  if (bySlug) return getForcedCanonicalName(bySlug) || bySlug;

  const fn = safeLower(firstNameOf(tc));
  if (fn && map[fn]) return getForcedCanonicalName(map[fn]) || map[fn];

  return getForcedCanonicalName(tc) || tc;
}

function buildPlayersRegistry(playersSnap) {
  const mapNameToCanon = {};
  const mapCanonToShort = {};

  playersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    const rawFullName = toTitleCase(
      data.fullName ||
        data.displayName ||
        data.name ||
        data.playerName ||
        ""
    );
    const fullName = getForcedCanonicalName(rawFullName) || rawFullName;

    const rawShortName = toTitleCase(
      data.shortName ||
        data.name ||
        data.displayName ||
        firstNameOf(fullName) ||
        fullName
    );
    const shortName =
      getForcedCanonicalName(rawShortName) ||
      (fullName === "Joshua Daniel" ? "Joshua" : rawShortName);

    if (!fullName) return;

    mapCanonToShort[safeLower(fullName)] = shortName || fullName;

    const keys = new Set();

    const addKey = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return;

      const pretty = toTitleCase(raw);

      keys.add(safeLower(raw));
      keys.add(safeLower(pretty));
      keys.add(slugFromName(raw));
      keys.add(slugFromName(pretty));

      const first = safeLower(firstNameOf(pretty));
      if (first) keys.add(first);
    };

    addKey(fullName);
    addKey(shortName);
    addKey(data.fullName);
    addKey(data.shortName);
    addKey(data.displayName);
    addKey(data.name);
    addKey(data.playerName);
    addKey(docSnap.id);

    const aliases = Array.isArray(data.aliases) ? data.aliases : [];
    aliases.forEach((a) => addKey(a));

    keys.forEach((k) => {
      if (!k) return;
      if (!mapNameToCanon[k]) mapNameToCanon[k] = fullName;
    });
  });

  return { mapNameToCanon, mapCanonToShort };
}


const NAME_CANONICAL_OVERRIDES = {
  "humbu mlauzdii": "Humbulani Mulaudzi",
  "humbu mlaudzii": "Humbulani Mulaudzi",
  "joshua daniel": "Roshi* Joshua Daniel",
};

function applyCanonicalNameOverrides(rawName, resolvedName = "") {
  const rawKey = safeLower(rawName);
  const resolvedKey = safeLower(resolvedName);

  if (rawKey && NAME_CANONICAL_OVERRIDES[rawKey]) {
    return NAME_CANONICAL_OVERRIDES[rawKey];
  }

  if (resolvedKey && NAME_CANONICAL_OVERRIDES[resolvedKey]) {
    return NAME_CANONICAL_OVERRIDES[resolvedKey];
  }

  return resolvedName || toTitleCase(rawName || "");
}

function dedupeEvents(events = []) {
  const seen = new Set();
  const out = [];

  (events || []).forEach((e) => {
    if (!e) return;

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

    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  });

  return out;
}

function getPreferredStatsDisplayName(canonicalFullName, shortDisplayName = "") {
  const canon = toTitleCase(canonicalFullName || "");
  const shorty = toTitleCase(shortDisplayName || "");

  // Keep display policy consistent across the whole stats page:
  // prefer short names for everyone, and only fall back to full name
  // when no short name exists in the registry.
  return shorty || canon;
}

function normalizeStatsMatchType(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "FRIENDLY" || raw === "5_V_5" || raw === "6_V_6" || raw === "7_V_7") {
    return "FRIENDLY";
  }
  return "LEAGUE";
}

function inferStatsRecordType(record = {}) {
  const explicit =
    record?.matchType ||
    record?.matchMode ||
    record?.gameFormat ||
    record?.format ||
    "";

  if (explicit) return normalizeStatsMatchType(explicit);

  const ids = [
    record?.teamAId,
    record?.teamBId,
    record?.winnerId,
    record?.teamId,
  ]
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);

  const friendlySideIds = new Set(["BLACK", "WHITE", "DARK", "LIGHT"]);

  if (ids.length && ids.every((id) => friendlySideIds.has(id))) {
    return "FRIENDLY";
  }

  return "LEAGUE";
}

function filterStatsRecordsForView(items = [], showFriendlyStats = false) {
  const wantedType = showFriendlyStats ? "FRIENDLY" : "LEAGUE";
  return (Array.isArray(items) ? items : []).filter(
    (item) => inferStatsRecordType(item) === wantedType
  );
}

// ---------------- PAGE ----------------
export function StatsPage({
  teams = [],
  friendlyTeams = [],
  friendlyTeamsByFormat = null,
  fiveVFiveTeams = [],
  sixVSixTeams = [],
  sevenVSevenTeams = [],
  gameFormat = "5_V_5",
  results = [],
  allEvents = [],
  cameFromLive = false,
  currentMatchDay,
  onBack,
  onGoToPlayerCards,
  onGoToPeerReview,
  archivedResults = [],
  archivedEvents = [],
  members = [],
  activeSeasonId = null,
  seasons = [],
  playerPhotosByName = {},
  matchDayHistory = [],
  friendlyMatchDayHistory = [],
  onDeleteSavedMatch = null,
  onUpdateSavedEvent = null,
  onDeleteSavedEvent = null,
  onAddSavedEvent = null,
  onRedistributeFriendlyDefensiveBlocks = null,
  onDeleteCurrentEmptySeason = null,
  canPreviewPreviousSeasonUI = false,
  isAdmin = false,
  identity = null,
  matchType = "LEAGUE",
  activeClubId = "turf-kings",
  activeClub = null,
  isPracticeMode = false,
  dataScope = null,
}) {
  const safeActiveClubId = activeClubId || "turf-kings";
  const safeMembers = Array.isArray(members) ? members : [];
  const safeSeasons = Array.isArray(seasons) ? seasons : [];
  const safePlayerPhotosByName =
    playerPhotosByName && typeof playerPhotosByName === "object"
      ? playerPhotosByName
      : {};

  const safeTeamsProp = Array.isArray(teams) ? teams : [];
  const safeFriendlyTeamsProp = Array.isArray(friendlyTeams)
    ? friendlyTeams
    : [];
  const safeFiveVFiveTeamsProp = Array.isArray(fiveVFiveTeams)
    ? fiveVFiveTeams
    : [];
  const safeSixVSixTeamsProp = Array.isArray(sixVSixTeams)
    ? sixVSixTeams
    : [];
  const safeSevenVSevenTeamsProp = Array.isArray(sevenVSevenTeams)
    ? sevenVSevenTeams
    : [];
  const safeFriendlyTeamsByFormat =
    friendlyTeamsByFormat && typeof friendlyTeamsByFormat === "object"
      ? friendlyTeamsByFormat
      : {};
  const safeResultsProp = Array.isArray(results) ? results : [];
  const safeEventsProp = Array.isArray(allEvents) ? allEvents : [];
  const safeArchivedResultsProp = Array.isArray(archivedResults)
    ? archivedResults
    : [];
  const safeArchivedEventsProp = Array.isArray(archivedEvents)
    ? archivedEvents
    : [];
  const safeMatchDayHistory = Array.isArray(matchDayHistory)
    ? matchDayHistory
    : [];
  const safeFriendlyMatchDayHistory = Array.isArray(friendlyMatchDayHistory)
    ? friendlyMatchDayHistory
    : [];

  const statsIdentityEmail = String(
    identity?.email ||
    identity?.userEmail ||
    identity?.gmail ||
    identity?.googleEmail ||
    ""
  )
    .trim()
    .toLowerCase();

  const statsIdentityRoles = [
    identity?.realRole,
    identity?.role,
    identity?.actingRole,
    identity?.userRole,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  const isAdminUser = Boolean(
    isAdmin ||
    statsIdentityRoles.includes("admin") ||
    statsIdentityEmail === "nkululekolerato@gmail.com"
  );
  const normalizedMatchType = normalizeStatsMatchType(matchType);
  const isFriendlyMatchType = normalizedMatchType === "FRIENDLY";

  const friendlyTeamsForCurrentFormat = useMemo(() => {
    const resolvedFormat = normalizeStatsGameFormatValue(gameFormat);

    const fromMap = Array.isArray(safeFriendlyTeamsByFormat?.[resolvedFormat])
      ? safeFriendlyTeamsByFormat[resolvedFormat]
      : Array.isArray(safeFriendlyTeamsByFormat?.[resolvedFormat.toLowerCase()])
        ? safeFriendlyTeamsByFormat[resolvedFormat.toLowerCase()]
        : [];

    if (fromMap.length > 0) return fromMap;
    if (safeFriendlyTeamsProp.length > 0) return safeFriendlyTeamsProp;

    if (resolvedFormat === "6_V_6" && safeSixVSixTeamsProp.length > 0) {
      return safeSixVSixTeamsProp;
    }

    if (resolvedFormat === "7_V_7" && safeSevenVSevenTeamsProp.length > 0) {
      return safeSevenVSevenTeamsProp;
    }

    // Backward compatibility: current app state still stores the generic
    // Friendly squads under this older prop name. Do not treat it as
    // specifically 5v5-only here.
    return safeFiveVFiveTeamsProp;
  }, [
    gameFormat,
    safeFriendlyTeamsByFormat,
    safeFriendlyTeamsProp,
    safeFiveVFiveTeamsProp,
    safeSixVSixTeamsProp,
    safeSevenVSevenTeamsProp,
  ]);

  const [nameToCanonical, setNameToCanonical] = useState({});
  const [canonicalToShort, setCanonicalToShort] = useState({});
  const canonicalNameCacheRef = useRef({});

  useEffect(() => {
    let isMounted = true;

    async function loadPlayersRegistry() {
      try {
        const playersSnap = await getDocs(getPlayersCollection(db, safeActiveClubId));
        if (!isMounted) return;

        const { mapNameToCanon, mapCanonToShort } = buildPlayersRegistry(playersSnap);
        canonicalNameCacheRef.current = {};
        setNameToCanonical(mapNameToCanon);
        setCanonicalToShort(mapCanonToShort);
      } catch (err) {
        console.error("Failed to load players registry for StatsPage:", err);
        if (!isMounted) return;
        canonicalNameCacheRef.current = {};
        setNameToCanonical({});
        setCanonicalToShort({});
      }
    }

    loadPlayersRegistry();

    return () => {
      isMounted = false;
    };
  }, []);

  const resolveCanonicalName = useCallback(
    (rawName) => {
      const rawKey = String(rawName || "");
      if (!rawKey) return "";

      const cached = canonicalNameCacheRef.current[rawKey];
      if (cached) return cached;

      const resolved = resolveCanonicalNameFromMap(rawName, nameToCanonical);
      canonicalNameCacheRef.current[rawKey] = resolved;
      return resolved;
    },
    [nameToCanonical]
  );

  const resolveShortDisplay = useCallback(
    (canonicalFullName) => {
      const key = safeLower(canonicalFullName);
      return canonicalToShort[key] || canonicalFullName;
    },
    [canonicalToShort]
  );

  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 6);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const formatSeasonDisplayName = (season) => {
    const sid = season?.seasonId || "";
    const match = String(sid).match(/^(\d{4})-S(\d+)$/i);
    if (match) return `${match[1]} Season-${match[2]}`;
    const year =
      season?.year || (sid.match(/^(\d{4})/) ? sid.match(/^(\d{4})/)[1] : "");
    const no = season?.seasonNo ? String(season.seasonNo) : sid;
    return year ? `${year} Season-${no}` : String(sid || "Season");
  };

  const monthRangeLabel = (startISO, endISO) => {
    const toDate = (x) => {
      const d = x ? new Date(x) : null;
      return d && !Number.isNaN(d.getTime()) ? d : null;
    };
    const s = toDate(startISO);
    const e = toDate(endISO);
    if (!s || !e) return "";

    const sameYear = s.getFullYear() === e.getFullYear();
    const fmtMonth = new Intl.DateTimeFormat(undefined, { month: "short" });
    const fmtMonthYear = new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    });

    if (sameYear) {
      const sm = fmtMonth.format(s);
      const em = fmtMonth.format(e);
      if (sm === em) return `${fmtMonthYear.format(s)}`;
      return `${sm}–${em} ${s.getFullYear()}`;
    }
    return `${fmtMonthYear.format(s)} – ${fmtMonthYear.format(e)}`;
  };

  const getSeasonDateBounds = (season) => {
    const mh = Array.isArray(season?.matchDayHistory)
      ? season.matchDayHistory
      : [];
    const times = mh
      .map((d) => d?.createdAt || d?.updatedAt || null)
      .filter(Boolean)
      .map((t) => new Date(t))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (times.length >= 1) {
      return {
        startISO: times[0].toISOString(),
        endISO: times[times.length - 1].toISOString(),
      };
    }

    const startISO = season?.createdAt || season?.updatedAt || null;
    const endISO = season?.updatedAt || season?.createdAt || null;
    return { startISO, endISO };
  };

  const CURRENT_SCOPE = "__CURRENT__";
  const PREVIEW_PREVIOUS_SCOPE = "__PREVIEW_PREVIOUS__";
  const [seasonScope, setSeasonScope] = useState(CURRENT_SCOPE);

  useEffect(() => {
    setSeasonScope(CURRENT_SCOPE);
  }, [activeSeasonId]);

  const previousSeasonOptions = useMemo(() => {
    const arr = safeSeasons
      .filter((s) => s?.seasonId && s.seasonId !== activeSeasonId)
      .slice();
    arr.sort((a, b) => Number(b?.seasonNo || 0) - Number(a?.seasonNo || 0));
    return arr;
  }, [safeSeasons, activeSeasonId]);

  const selectedRealPrevSeason = useMemo(() => {
    if (
      seasonScope === CURRENT_SCOPE ||
      seasonScope === PREVIEW_PREVIOUS_SCOPE
    ) {
      return null;
    }
    return safeSeasons.find((s) => s?.seasonId === seasonScope) || null;
  }, [safeSeasons, seasonScope]);

  const selectedPreviewPrevSeason = useMemo(() => {
    if (seasonScope !== PREVIEW_PREVIOUS_SCOPE) return null;
    return safeSeasons.find((s) => s?.seasonId === activeSeasonId) || null;
  }, [safeSeasons, seasonScope, activeSeasonId]);

  const selectedPrevSeason =
    selectedPreviewPrevSeason || selectedRealPrevSeason;

  const isPreviewingPreviousSeasonUI =
    isAdminUser &&
    seasonScope === PREVIEW_PREVIOUS_SCOPE &&
    Boolean(canPreviewPreviousSeasonUI);

  const isViewingPreviousSeason = !isFriendlyMatchType && seasonScope !== CURRENT_SCOPE;
  const showFriendlyStats = isFriendlyMatchType;

  const hasCurrentSeasonMatchHistory = useMemo(() => {
    return safeMatchDayHistory.some((day) => {
      const resultsCount = Array.isArray(day?.results) ? day.results.length : 0;
      const eventsCount = Array.isArray(day?.allEvents) ? day.allEvents.length : 0;
      const appearancesCount = Array.isArray(day?.playerAppearances)
        ? day.playerAppearances.length
        : 0;
      const teamsCount = Array.isArray(day?.teamsSnapshot)
        ? day.teamsSnapshot.length
        : Array.isArray(day?.teams)
          ? day.teams.length
          : 0;

      return (
        resultsCount > 0 ||
        eventsCount > 0 ||
        appearancesCount > 0 ||
        teamsCount > 0
      );
    });
  }, [safeMatchDayHistory]);

  const isCurrentSeasonEmpty = useMemo(() => {
    const hasCurrentResults = safeResultsProp.length > 0;
    const hasCurrentEvents = safeEventsProp.length > 0;
    const hasArchivedResults = safeArchivedResultsProp.length > 0;
    const hasArchivedEvents = safeArchivedEventsProp.length > 0;

    return !(
      hasCurrentResults ||
      hasCurrentEvents ||
      hasArchivedResults ||
      hasArchivedEvents ||
      hasCurrentSeasonMatchHistory
    );
  }, [
    safeResultsProp,
    safeEventsProp,
    safeArchivedResultsProp,
    safeArchivedEventsProp,
    hasCurrentSeasonMatchHistory,
  ]);

  const canShowDeleteCurrentEmptySeason = useMemo(() => {
    return (
      isAdminUser &&
      typeof onDeleteCurrentEmptySeason === "function" &&
      !isViewingPreviousSeason &&
      previousSeasonOptions.length > 0 &&
      isCurrentSeasonEmpty
    );
  }, [
    isAdminUser,
    onDeleteCurrentEmptySeason,
    isViewingPreviousSeason,
    previousSeasonOptions,
    isCurrentSeasonEmpty,
  ]);

  const handleDeleteCurrentEmptySeason = () => {
    if (typeof onDeleteCurrentEmptySeason !== "function") return;

    if (!isCurrentSeasonEmpty) {
      window.alert(
        "Delete blocked: the current season already has records, so it cannot be deleted."
      );
      return;
    }

    const ok = window.confirm(
      "Delete the current empty season and move back to the previous season?\n\nThis is only allowed while the current season is completely empty."
    );

    if (!ok) return;

    onDeleteCurrentEmptySeason();
  };

  const scopedTeams = useMemo(() => {
    if (!isViewingPreviousSeason) {
      if (showFriendlyStats) {
        // Friendly stats must use the Friendly squads from SquadsPage for
        // the active format (5v5 / 6v6 / 7v7), not League season teams.
        return friendlyTeamsForCurrentFormat.length > 0
          ? friendlyTeamsForCurrentFormat
          : safeTeamsProp;
      }
      return safeTeamsProp;
    }

    const t = selectedPrevSeason?.teams;
    return Array.isArray(t) ? t : [];
  }, [
    isViewingPreviousSeason,
    showFriendlyStats,
    friendlyTeamsForCurrentFormat,
    safeTeamsProp,
    selectedPrevSeason,
  ]);

  const attachMatchDayMeta = (items, matchDayId) => {
    const id = matchDayId ? String(matchDayId) : "";
    const dateLabel = isoDateOnly(id) || isoDateOnly(matchDayId) || "";
    return (Array.isArray(items) ? items : []).map((x) => ({
      ...x,
      _tkMatchDayId: id || "UNKNOWN",
      _tkMatchDayLabel: dateLabel || id || "UNKNOWN",
    }));
  };

  const currentMatchDayId = useMemo(() => {
    const cm = currentMatchDay || {};
    return (
      cm.id ||
      cm.matchDayId ||
      cm.date ||
      cm.matchDay ||
      cm.day ||
      cm.currentMatchDayId ||
      ""
    );
  }, [currentMatchDay]);

  const scopedArchivedResults = useMemo(() => {
    if (showFriendlyStats) {
      const fromFriendlyHistory = safeFriendlyMatchDayHistory.flatMap((d) =>
        attachMatchDayMeta(
          d?.results,
          d?.id || d?.matchDayId || d?.date || d?.day || "FRIENDLY"
        )
      );

      return filterStatsRecordsForView(fromFriendlyHistory, true);
    }

    if (isViewingPreviousSeason) {
      const mh = Array.isArray(selectedPrevSeason?.matchDayHistory)
        ? selectedPrevSeason.matchDayHistory
        : [];
      return filterStatsRecordsForView(
        mh.flatMap((d) =>
          attachMatchDayMeta(
            d?.results,
            d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
          )
        ),
        false
      );
    }

    if (safeMatchDayHistory.length > 0) {
      return filterStatsRecordsForView(
        safeMatchDayHistory.flatMap((d) =>
          attachMatchDayMeta(
            d?.results,
            d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
          )
        ),
        false
      );
    }

    return filterStatsRecordsForView(
      attachMatchDayMeta(safeArchivedResultsProp, "UNKNOWN"),
      showFriendlyStats
    );
  }, [
    isViewingPreviousSeason,
    selectedPrevSeason,
    safeMatchDayHistory,
    safeArchivedResultsProp,
    showFriendlyStats,
    safeFriendlyMatchDayHistory,
  ]);

  const scopedArchivedEvents = useMemo(() => {
    if (showFriendlyStats) {
      const fromFriendlyHistory = safeFriendlyMatchDayHistory.flatMap((d) =>
        attachMatchDayMeta(
          d?.allEvents,
          d?.id || d?.matchDayId || d?.date || d?.day || "FRIENDLY"
        )
      );

      return filterStatsRecordsForView(fromFriendlyHistory, true);
    }

    if (isViewingPreviousSeason) {
      const mh = Array.isArray(selectedPrevSeason?.matchDayHistory)
        ? selectedPrevSeason.matchDayHistory
        : [];
      return filterStatsRecordsForView(
        mh.flatMap((d) =>
          attachMatchDayMeta(
            d?.allEvents,
            d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
          )
        ),
        false
      );
    }

    if (safeMatchDayHistory.length > 0) {
      return filterStatsRecordsForView(
        safeMatchDayHistory.flatMap((d) =>
          attachMatchDayMeta(
            d?.allEvents,
            d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
          )
        ),
        false
      );
    }

    return filterStatsRecordsForView(
      attachMatchDayMeta(safeArchivedEventsProp, "UNKNOWN"),
      showFriendlyStats
    );
  }, [
    isViewingPreviousSeason,
    selectedPrevSeason,
    safeMatchDayHistory,
    safeArchivedEventsProp,
    showFriendlyStats,
    safeFriendlyMatchDayHistory,
  ]);

  const scopedCurrentResults = useMemo(() => {
    if (!isViewingPreviousSeason) {
      return filterStatsRecordsForView(
        attachMatchDayMeta(safeResultsProp, currentMatchDayId || "CURRENT"),
        showFriendlyStats
      );
    }
    const r = selectedPrevSeason?.results;
    return filterStatsRecordsForView(
      attachMatchDayMeta(Array.isArray(r) ? r : [], "UNKNOWN"),
      false
    );
  }, [
    isViewingPreviousSeason,
    safeResultsProp,
    selectedPrevSeason,
    currentMatchDayId,
  ]);

  const scopedCurrentEvents = useMemo(() => {
    if (!isViewingPreviousSeason) {
      return filterStatsRecordsForView(
        attachMatchDayMeta(safeEventsProp, currentMatchDayId || "CURRENT"),
        showFriendlyStats
      );
    }
    const e = selectedPrevSeason?.allEvents;
    return filterStatsRecordsForView(
      attachMatchDayMeta(Array.isArray(e) ? e : [], "UNKNOWN"),
      false
    );
  }, [
    isViewingPreviousSeason,
    safeEventsProp,
    selectedPrevSeason,
    currentMatchDayId,
  ]);

  const [viewMode, setViewMode] = useState("current");
  const FRIENDLY_PREVIOUS_MONTH_SCOPE = "__FRIENDLY_PREVIOUS_MONTH__";
  const [friendlyMonthScope, setFriendlyMonthScope] = useState(CURRENT_SCOPE);

  useEffect(() => {
    if (isViewingPreviousSeason) setViewMode("season");
  }, [isViewingPreviousSeason]);

  useEffect(() => {
    if (!showFriendlyStats) {
      setFriendlyMonthScope(CURRENT_SCOPE);
    }
  }, [showFriendlyStats]);

  useEffect(() => {
    if (showFriendlyStats && friendlyMonthScope === FRIENDLY_PREVIOUS_MONTH_SCOPE) {
      setViewMode("season");
    }
  }, [showFriendlyStats, friendlyMonthScope]);


  const seasonResults = useMemo(
    () => [...scopedArchivedResults, ...scopedCurrentResults],
    [scopedArchivedResults, scopedCurrentResults]
  );

  const seasonEventsRaw = useMemo(
    () => [...scopedArchivedEvents, ...scopedCurrentEvents],
    [scopedArchivedEvents, scopedCurrentEvents]
  );

  const todayISO = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const friendlyDateWindow = useMemo(() => {
    const now = new Date();
    const today = startOfLocalDay(now);

    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 7);

    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    return {
      currentWeekStart,
      currentWeekEnd,
      currentMonthStart,
      nextMonthStart,
      previousMonthStart,
    };
  }, []);

  const isFriendlyRecordInWindow = (record, mode) => {
    const iso = friendlyDateFromRecord(record);
    if (!iso) return false;

    const d = startOfLocalDay(`${iso}T00:00:00`);
    const {
      currentWeekStart,
      currentWeekEnd,
      currentMonthStart,
      nextMonthStart,
      previousMonthStart,
    } = friendlyDateWindow;

    if (friendlyMonthScope === FRIENDLY_PREVIOUS_MONTH_SCOPE) {
      return d >= previousMonthStart && d < currentMonthStart;
    }

    if (mode === "season") {
      return d >= currentMonthStart && d < nextMonthStart;
    }

    return d >= currentWeekStart && d < currentWeekEnd;
  };

  const visibleResultsRaw = useMemo(() => {
    if (isViewingPreviousSeason) return seasonResults;

    if (showFriendlyStats) {
      return (seasonResults || []).filter((r) =>
        isFriendlyRecordInWindow(r, viewMode)
      );
    }

    return viewMode === "season" ? seasonResults : scopedCurrentResults;
  }, [
    isViewingPreviousSeason,
    showFriendlyStats,
    viewMode,
    seasonResults,
    scopedCurrentResults,
    friendlyDateWindow,
    friendlyMonthScope,
  ]);

  const visibleEventsRaw = useMemo(() => {
    if (isViewingPreviousSeason) return seasonEventsRaw;

    if (showFriendlyStats) {
      return (seasonEventsRaw || []).filter((e) =>
        isFriendlyRecordInWindow(e, viewMode)
      );
    }

    return viewMode === "season" ? seasonEventsRaw : scopedCurrentEvents;
  }, [
    isViewingPreviousSeason,
    showFriendlyStats,
    viewMode,
    seasonEventsRaw,
    scopedCurrentEvents,
    friendlyDateWindow,
    friendlyMonthScope,
  ]);

  const statsResultsRawForView = visibleResultsRaw;
  const statsEventsRawForView = visibleEventsRaw;

  const visibleEvents = useMemo(() => {
    return dedupeEvents(
      (statsEventsRawForView || [])
        .filter((e) => e?.type !== "shibobo")
        .map((e) => ({
          ...e,
          scorer: resolveCanonicalName(e?.scorer),
          assist: resolveCanonicalName(e?.assist),
          playerName: resolveCanonicalName(e?.playerName),
        }))
    );
  }, [statsEventsRawForView, resolveCanonicalName]);

  const teamById = useMemo(() => {
    const map = new Map();

    const addTeamKey = (key, team) => {
      const raw = String(key || "").trim();
      if (!raw) return;
      if (!map.has(raw)) map.set(raw, team);
      if (!map.has(raw.toUpperCase())) map.set(raw.toUpperCase(), team);
      if (!map.has(raw.toLowerCase())) map.set(raw.toLowerCase(), team);
    };

    (scopedTeams || []).forEach((t) => {
      const rawId = String(t?.id || "").trim();
      const label = String(t?.label || "").trim();
      const abbrev = String(t?.abbrev || "").trim();

      addTeamKey(rawId, t);
      addTeamKey(label, t);
      addTeamKey(abbrev, t);

      const sideKey = `${rawId} ${label} ${abbrev}`.toLowerCase();
      if (sideKey.includes("black") || sideKey.includes("dark")) {
        addTeamKey("BLACK", t);
        addTeamKey("DARK", t);
      }
      if (sideKey.includes("white") || sideKey.includes("light")) {
        addTeamKey("WHITE", t);
        addTeamKey("LIGHT", t);
      }
    });

    return map;
  }, [scopedTeams]);

  const getFriendlyTeamName = useCallback(
    (id) => {
      const raw = String(id || "").trim();
      if (!raw) return "Unknown";

      const team =
        teamById.get(raw) ||
        teamById.get(raw.toUpperCase()) ||
        teamById.get(raw.toLowerCase()) ||
        null;

      if (team?.label) return team.label;

      const upper = raw.toUpperCase();
      if (upper === "BLACK" || upper === "DARK") return "Dark";
      if (upper === "WHITE" || upper === "LIGHT") return "Light";

      return raw || "Unknown";
    },
    [teamById]
  );

  const getTeamName = useCallback(
    (id) => {
      if (showFriendlyStats) return getFriendlyTeamName(id);

      const raw = String(id || "").trim();
      if (!raw) return "Unknown";

      const team =
        teamById.get(raw) ||
        teamById.get(raw.toUpperCase()) ||
        teamById.get(raw.toLowerCase()) ||
        null;

      return team?.label || "Unknown";
    },
    [showFriendlyStats, getFriendlyTeamName, teamById]
  );

  const teamPlayersById = useMemo(() => {
    const out = {};

    const addPlayersKey = (key, players) => {
      const raw = String(key || "").trim();
      if (!raw) return;
      out[raw] = players;
      out[raw.toUpperCase()] = players;
      out[raw.toLowerCase()] = players;
    };

    (scopedTeams || []).forEach((t) => {
      const rawPlayers = Array.isArray(t?.players) ? t.players : [];
      const canonicalPlayers = rawPlayers
        .map((p) =>
          typeof p === "string" ? p : p?.name || p?.displayName || ""
        )
        .map((name) => resolveCanonicalName(name))
        .filter(Boolean);

      const rawId = String(t?.id || "").trim();
      const label = String(t?.label || "").trim();
      const abbrev = String(t?.abbrev || "").trim();
      const sideKey = `${rawId} ${label} ${abbrev}`.toLowerCase();

      addPlayersKey(rawId, canonicalPlayers);
      addPlayersKey(label, canonicalPlayers);
      addPlayersKey(abbrev, canonicalPlayers);

      if (showFriendlyStats) {
        if (sideKey.includes("black") || sideKey.includes("dark")) {
          addPlayersKey("BLACK", canonicalPlayers);
          addPlayersKey("DARK", canonicalPlayers);
        }
        if (sideKey.includes("white") || sideKey.includes("light")) {
          addPlayersKey("WHITE", canonicalPlayers);
          addPlayersKey("LIGHT", canonicalPlayers);
        }
      }
    });

    return out;
  }, [scopedTeams, showFriendlyStats, resolveCanonicalName]);

  const getPlayersForTeam = (teamId) => {
    const raw = String(teamId || "").trim();
    return (
      teamPlayersById?.[raw] ||
      teamPlayersById?.[raw.toUpperCase()] ||
      teamPlayersById?.[raw.toLowerCase()] ||
      []
    );
  };

  const playerTeamMap = useMemo(() => {
    const map = {};

    // First use the selected squad source (League teams for League mode,
    // Friendly squads for Friendly mode).
    (scopedTeams || []).forEach((t) => {
      const label = String(t?.label || "").trim();
      (t?.players || []).forEach((p) => {
        const rawName =
          typeof p === "string"
            ? p
            : p?.name || p?.displayName || p?.fullName || p?.shortName || "";
        const canon = resolveCanonicalName(rawName);
        if (canon && label && !map[canon]) map[canon] = label;
      });
    });

    // Then use the actual event teamId. This is important for Friendly stats
    // because scorer/assist events are the strongest evidence of which side
    // the player represented on that match day, even if the squad list was
    // later edited or the player was a guest.
    (visibleEvents || []).forEach((e) => {
      const teamLabel = getTeamName(e?.teamId);
      const apply = (rawName) => {
        const canon = resolveCanonicalName(rawName);
        if (!canon || !teamLabel || teamLabel === "Unknown") return;
        map[canon] = teamLabel;
      };

      if (e?.type === "goal") {
        apply(e?.scorer);
        apply(e?.assist);
      }

      if (e?.type === "clean_sheet") {
        apply(e?.playerName || e?.scorer);
      }
    });

    return map;
  }, [scopedTeams, visibleEvents, getTeamName, resolveCanonicalName]);

  const teamStats = useMemo(() => {
    const base = {};
    (scopedTeams || []).forEach((t) => {
      if (!t?.id) return;
      base[t.id] = {
        teamId: t.id,
        name: t.label || "Unknown",
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
      };
    });

    (statsResultsRawForView || []).forEach((r) => {
      const a = base[r?.teamAId];
      const b = base[r?.teamBId];
      if (!a || !b) return;

      a.played += 1;
      b.played += 1;

      a.goalsFor += Number(r?.goalsA || 0);
      a.goalsAgainst += Number(r?.goalsB || 0);
      b.goalsFor += Number(r?.goalsB || 0);
      b.goalsAgainst += Number(r?.goalsA || 0);

      if (r?.isDraw) {
        a.drawn += 1;
        b.drawn += 1;
        a.points += 1;
        b.points += 1;
      } else {
        const winnerId = r?.winnerId;
        if (winnerId === r?.teamAId) {
          a.won += 1;
          b.lost += 1;
          a.points += 3;
        } else if (winnerId === r?.teamBId) {
          b.won += 1;
          a.lost += 1;
          b.points += 3;
        }
      }
    });

    Object.values(base).forEach((t) => {
      t.goalDiff = t.goalsFor - t.goalsAgainst;
    });

    const arr = Object.values(base);
    arr.sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
      if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      return (x.name || "").localeCompare(y.name || "");
    });

    return arr;
  }, [scopedTeams, statsResultsRawForView]);

  const [cloudPhotosIndex, setCloudPhotosIndex] = useState({});

  useEffect(() => {
    async function loadPhotos() {
      try {
        const snap = await getDocs(getPlayerPhotosCollection(db, safeActiveClubId));
        const idx = {};

        const add = (k, url) => {
          const kk = safeLower(k);
          if (!kk || !url) return;
          if (!idx[kk]) idx[kk] = url;
        };

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const docId = docSnap.id;
          const name = toTitleCase(data.name || "");
          const photoData = data.photoData || null;
          if (!photoData) return;

          if (name) {
            add(name, photoData);
            add(slugFromName(name), photoData);
            const fn = safeLower(firstNameOf(name));
            if (fn) add(fn, photoData);
          }

          if (docId) add(docId, photoData);
        });

        setCloudPhotosIndex(idx);
      } catch (err) {
        console.error("Failed to load playerPhotos for StatsPage:", err);
      }
    }
    loadPhotos();
  }, []);

  const mergedPhotoIndex = useMemo(() => {
    const idx = {};

    const addPhotoKey = (key, url) => {
      const k = safeLower(key);
      if (!k || !url) return;
      if (!idx[k]) idx[k] = url;
    };

    Object.entries(safePlayerPhotosByName || {}).forEach(([k, url]) => {
      addPhotoKey(k, url);
      addPhotoKey(slugFromName(k), url);
      addPhotoKey(firstNameOf(k), url);
    });

    Object.entries(cloudPhotosIndex || {}).forEach(([k, url]) => {
      addPhotoKey(k, url);
    });

    (scopedTeams || []).forEach((t) => {
      if (t?.playerPhotos) {
        Object.entries(t.playerPhotos).forEach(([k, url]) => {
          addPhotoKey(k, url);
          addPhotoKey(slugFromName(k), url);
          addPhotoKey(firstNameOf(k), url);
        });
      }
      (t?.players || []).forEach((p) => {
        if (p && typeof p === "object") {
          const nm = p.name || p.displayName || "";
          if (nm && p.photoUrl) {
            addPhotoKey(nm, p.photoUrl);
            addPhotoKey(slugFromName(nm), p.photoUrl);
            addPhotoKey(firstNameOf(nm), p.photoUrl);
          }
        }
      });
    });

    return idx;
  }, [safePlayerPhotosByName, cloudPhotosIndex, scopedTeams]);

  const getPlayerPhotoLikeCards = (name) => {
    const raw = String(name || "").trim();
    if (!raw) return null;

    const tc = toTitleCase(raw);
    const canonical = resolveCanonicalName(raw);
    const shortDisplay = resolveShortDisplay(canonical);

    const candidates = [
      raw,
      tc,
      canonical,
      shortDisplay,
      slugFromName(raw),
      slugFromName(tc),
      slugFromName(canonical),
      slugFromName(shortDisplay),
      firstNameOf(raw),
      firstNameOf(tc),
      firstNameOf(canonical),
      firstNameOf(shortDisplay),
      slugFromName(firstNameOf(raw)),
      slugFromName(firstNameOf(tc)),
      slugFromName(firstNameOf(canonical)),
      slugFromName(firstNameOf(shortDisplay)),
    ]
      .map((x) => safeLower(x))
      .filter(Boolean);

    for (const k of candidates) {
      if (mergedPhotoIndex[k]) return mergedPhotoIndex[k];
    }

    return null;
  };

  const champion = useMemo(() => {
    if (!isViewingPreviousSeason) return null;
    if (!Array.isArray(teamStats) || teamStats.length === 0) return null;

    const winner = teamStats[0];
    const teamObj = teamById.get(winner.teamId) || null;
    const players = Array.isArray(teamObj?.players) ? teamObj.players : [];

    const playerNames = players
      .map((p) => (typeof p === "string" ? p : p?.name || p?.displayName || ""))
      .filter(Boolean);

    const captainRaw =
      teamObj?.captain ||
      teamObj?.captainName ||
      players.find((p) => p?.isCaptain)?.name ||
      players.find((p) => p?.role === "captain")?.name ||
      playerNames[0] ||
      "Captain";

    const captainName = resolveCanonicalName(captainRaw);

    let captainPhoto =
      getPlayerPhotoLikeCards(captainName) ||
      getPlayerPhotoLikeCards(captainRaw);

    if (!captainPhoto) {
      const matchedPlayerObj = players.find((p) => {
        const nm =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        return resolveCanonicalName(nm) === captainName;
      });

      if (matchedPlayerObj && typeof matchedPlayerObj === "object") {
        captainPhoto =
          matchedPlayerObj.photoUrl ||
          matchedPlayerObj.photo ||
          matchedPlayerObj.image ||
          null;
      }
    }

    const squadNamesAll = playerNames
      .map((n) => resolveCanonicalName(n))
      .filter(Boolean);

    const squadNames = squadNamesAll.filter(
      (n) => safeLower(n) !== safeLower(captainName)
    );

    return {
      teamId: winner.teamId,
      teamName: winner.name,
      captainName: captainName || "Captain",
      captainPhoto: captainPhoto || null,
      squadNames,
    };
  }, [
    isViewingPreviousSeason,
    teamStats,
    teamById,
    resolveCanonicalName,
    getPlayerPhotoLikeCards,
  ]);

  const isFriendlyStatsView =
    String(viewMode || "").toUpperCase().includes("FRIENDLY") ||
    String(matchType || "").toUpperCase().includes("FRIENDLY");

  const playerStats = useMemo(() => {
    const rows = buildPlayerEventStats({
      events: dedupeEvents(visibleEvents || []),

      resolveCanonicalName,

      resolveDisplayName: (playerName) =>
        getPreferredStatsDisplayName(
          playerName,
          resolveShortDisplay(playerName)
        ),

      resolveTeamName: (playerName) =>
        playerTeamMap[playerName] || "—",
    });

    /*
     * Preserve the existing Stats table structure:
     *
     * League:
     *   cleanSheets / gkCleanSheets / defCleanSheets
     *
     * Friendly:
     *   defensiveBlocks / gkDefensiveBlocks / defDefensiveBlocks
     *
     * The Friendly values are mapped into the existing defensive
     * table slots so the premium layout does not gain extra columns.
     */
    return rows.map((player) => {
      if (!isFriendlyStatsView) return player;

      const defensiveBlocks = Number(player.defensiveBlocks || 0);
      const gkDefensiveBlocks = Number(player.gkDefensiveBlocks || 0);
      const defDefensiveBlocks = Number(player.defDefensiveBlocks || 0);

      return {
        ...player,

        cleanSheets: defensiveBlocks,
        gkCleanSheets: gkDefensiveBlocks,
        defCleanSheets: defDefensiveBlocks,

        total:
          Number(player.goals || 0) +
          Number(player.assists || 0) +
          defensiveBlocks,
      };
    });
  }, [
    visibleEvents,
    playerTeamMap,
    resolveCanonicalName,
    resolveShortDisplay,
    isFriendlyStatsView,
  ]);

  const combinedLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => (p.total || 0) > 0).slice();
    arr.sort((x, y) => {
      if (y.total !== x.total) return y.total - x.total;
      if (y.goals !== x.goals) return y.goals - x.goals;
      if (y.assists !== x.assists) return y.assists - x.assists;
      if (y.cleanSheets !== x.cleanSheets) return y.cleanSheets - x.cleanSheets;
      return (x.name || "").localeCompare(y.name || "");
    });
    return arr;
  }, [playerStats]);

  const goalLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => (p.goals || 0) > 0).slice();
    arr.sort((x, y) => {
      if (y.goals !== x.goals) return y.goals - x.goals;
      return (x.name || "").localeCompare(y.name || "");
    });
    return arr;
  }, [playerStats]);

  const assistLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => (p.assists || 0) > 0).slice();
    arr.sort((x, y) => {
      if (y.assists !== x.assists) return y.assists - x.assists;
      return (x.name || "").localeCompare(y.name || "");
    });
    return arr;
  }, [playerStats]);

  const cleanSheetLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => (p.cleanSheets || 0) > 0).slice();
    arr.sort((x, y) => {
      if (y.cleanSheets !== x.cleanSheets) return y.cleanSheets - x.cleanSheets;
      if (y.gkCleanSheets !== x.gkCleanSheets) {
        return y.gkCleanSheets - x.gkCleanSheets;
      }
      if (y.defCleanSheets !== x.defCleanSheets) {
        return y.defCleanSheets - x.defCleanSheets;
      }
      return (x.name || "").localeCompare(y.name || "");
    });
    return arr;
  }, [playerStats]);

  const matchDayOptions = useMemo(() => {
    const map = new Map();
    (statsResultsRawForView || []).forEach((r) => {
      const id = r?._tkMatchDayId || "UNKNOWN";
      const label =
        isoDateOnly(r?._tkMatchDayLabel) ||
        isoDateOnly(id) ||
        r?._tkMatchDayLabel ||
        id;
      if (!map.has(id)) map.set(id, label);
    });

    const arr = Array.from(map.entries()).map(([id, label]) => ({ id, label }));

    const toSortable = (val) => {
      const d = isoDateOnly(val);
      if (!d) return 0;
      const dt = new Date(d);
      return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
    };

    arr.sort((a, b) => toSortable(b.id) - toSortable(a.id));
    return arr;
  }, [statsResultsRawForView]);

  const [matchDayFilter, setMatchDayFilter] = useState("ALL");

  useEffect(() => {
    setMatchDayFilter("ALL");
  }, [seasonScope, viewMode]);

  const filteredResults = useMemo(() => {
    if (matchDayFilter === "ALL") return statsResultsRawForView || [];
    return (statsResultsRawForView || []).filter(
      (r) => (r?._tkMatchDayId || "UNKNOWN") === matchDayFilter
    );
  }, [statsResultsRawForView, matchDayFilter]);

  const filteredEvents = useMemo(() => {
    if (matchDayFilter === "ALL") return visibleEvents || [];
    return (visibleEvents || []).filter(
      (e) => (e?._tkMatchDayId || "UNKNOWN") === matchDayFilter
    );
  }, [visibleEvents, matchDayFilter]);

  const friendlyDisplayResults = useMemo(() => {
    if (!showFriendlyStats) return [];

    const arr = (filteredResults || []).map((r, originalIndex) => ({
      ...r,
      _tkFriendlyDate: friendlyDateFromRecord(r),
      _tkOriginalIndex: originalIndex,
    }));

    arr.sort((a, b) => {
      const ad = a?._tkFriendlyDate ? new Date(`${a._tkFriendlyDate}T00:00:00`) : null;
      const bd = b?._tkFriendlyDate ? new Date(`${b._tkFriendlyDate}T00:00:00`) : null;
      const at = ad && !Number.isNaN(ad.getTime()) ? ad.getTime() : 0;
      const bt = bd && !Number.isNaN(bd.getTime()) ? bd.getTime() : 0;
      if (bt !== at) return bt - at;

      const bm = Number(b?.matchNo || 0);
      const am = Number(a?.matchNo || 0);
      if (bm !== am) return bm - am;

      return Number(b?._tkOriginalIndex || 0) - Number(a?._tkOriginalIndex || 0);
    });

    const uniqueDatesNewest = [];
    arr.forEach((r) => {
      const d = r?._tkFriendlyDate || "";
      if (d && !uniqueDatesNewest.includes(d)) uniqueDatesNewest.push(d);
    });

    const seenByDate = {};

    return arr.map((r) => {
      const dateKey = r?._tkFriendlyDate || "UNKNOWN";
      const duplicateIndex = seenByDate[dateKey] || 0;
      seenByDate[dateKey] = duplicateIndex + 1;

      const dateRank = uniqueDatesNewest.indexOf(dateKey);
      const label = formatFriendlyDayLabel(
        dateKey,
        dateRank >= 0 ? dateRank : duplicateIndex
      );

      return {
        ...r,
        _tkFriendlyDuplicateIndex: duplicateIndex,
        _tkFriendlyDayLabel: `${label}${formatFriendlyDuplicateSuffix(duplicateIndex)}`,
      };
    });
  }, [filteredResults, showFriendlyStats]);

  const sortedResults = useMemo(() => {
    if (showFriendlyStats) {
      return friendlyDisplayResults;
    }

    const arr = (filteredResults || []).slice();
    arr.sort((a, b) => Number(a?.matchNo || 0) - Number(b?.matchNo || 0));
    return arr;
  }, [filteredResults, friendlyDisplayResults, showFriendlyStats, viewMode]);

  const matchKeyOf = (r) =>
    `${r?._tkMatchDayId || "UNKNOWN"}::${Number(r?.matchNo || 0)}`;

  const eventsByMatchKey = useMemo(() => {
    const map = new Map();
    (filteredEvents || []).forEach((e) => {
      const m = e?.matchNo;
      if (m == null) return;
      const key = `${e?._tkMatchDayId || "UNKNOWN"}::${Number(m)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    map.forEach((list) => {
      list.sort((a, b) => Number(a?.timeSeconds || 0) - Number(b?.timeSeconds || 0));
    });
    return map;
  }, [filteredEvents]);

  const [expandedMatchKey, setExpandedMatchKey] = useState(null);

  const toggleMatchDetails = (key) => {
    setExpandedMatchKey((prev) => (prev === key ? null : key));
  };

  const canAdminEditThisView =
    isAdminUser && !isViewingPreviousSeason && viewMode === "current";

  const isCurrentFriendlyWeekView =
    showFriendlyStats &&
    friendlyMonthScope === CURRENT_SCOPE &&
    viewMode === "current" &&
    !isViewingPreviousSeason;

  /*
   * TEMPORARY AUGUST 2026 FRIENDLY CORRECTION WINDOW
   * ----------------------------------------------------------
   * Permanent/default rule:
   *   Friendly edits are current-week only.
   *
   * Temporary August 2026 exception:
   *   Admins may also correct goal records belonging to the
   *   latest Friendly DAY in the current month's history.
   *
   * This applies to Friendly mode only, for every club.
   *
   * As soon as a club plays on a newer Friendly day, its
   * previous Friendly day locks again automatically.
   *
   * From 1 September 2026 this exception evaluates false and
   * every club returns automatically to current-week-only edits.
   */
  const isAugust2026FriendlyEditExceptionActive = useMemo(() => {
    const now = new Date();

    return (
      isAdminUser &&
      showFriendlyStats &&
      now.getFullYear() === 2026 &&
      now.getMonth() === 7
    );
  }, [isAdminUser, showFriendlyStats]);

  const latestAugustFriendlyDate = useMemo(() => {
    if (!isAugust2026FriendlyEditExceptionActive) return "";

    const augustDates = (seasonResults || [])
      .map((record) => friendlyDateFromRecord(record))
      .filter((iso) => /^2026-08-\d{2}$/.test(String(iso || "")))
      .sort();

    return augustDates.length
      ? augustDates[augustDates.length - 1]
      : "";
  }, [
    isAugust2026FriendlyEditExceptionActive,
    seasonResults,
  ]);

  const isLatestAugustFriendlyRecord = useCallback(
    (record = {}) => {
      if (!isAugust2026FriendlyEditExceptionActive) return false;
      if (!latestAugustFriendlyDate) return false;

      return friendlyDateFromRecord(record) === latestAugustFriendlyDate;
    },
    [
      isAugust2026FriendlyEditExceptionActive,
      latestAugustFriendlyDate,
    ]
  );

  const isAugust2026FriendlyMonthlyEditView =
    isAugust2026FriendlyEditExceptionActive &&
    friendlyMonthScope === CURRENT_SCOPE &&
    viewMode === "season" &&
    !isViewingPreviousSeason;

  const isEditableCurrentFriendlyWeekRecord = useCallback(
    (record = {}) => {
      /*
       * Permanent path: normal current-week Friendly editing.
       */
      if (
        isCurrentFriendlyWeekView &&
        isFriendlyRecordInWindow(record, "current")
      ) {
        return true;
      }

      /*
       * Temporary path: August 2026 only, latest Friendly day
       * in This Month.
       */
      return (
        isAugust2026FriendlyMonthlyEditView &&
        isLatestAugustFriendlyRecord(record)
      );
    },
    [
      isCurrentFriendlyWeekView,
      friendlyDateWindow,
      friendlyMonthScope,
      isAugust2026FriendlyMonthlyEditView,
      isLatestAugustFriendlyRecord,
    ]
  );

  const blockNonCurrentFriendlyEdit = useCallback(() => {
    window.alert(
      "Editing is locked: only current-week friendly matches can be edited."
    );
  }, []);

  const [isManagingFriendlyDay, setIsManagingFriendlyDay] = useState(false);

  const friendlyAdminToolsActive =
    isAdminUser &&
    (
      isCurrentFriendlyWeekView ||
      isAugust2026FriendlyMonthlyEditView
    ) &&
    isManagingFriendlyDay;

  const adminEditingToolsActive = showFriendlyStats
    ? friendlyAdminToolsActive
    : canAdminEditThisView;


  // ============================================================
  // FRIENDLY DEFENSIVE BLOCK TRANSFER STUDIO
  //
  // Manual dispute-resolution tool.
  //
  // IMPORTANT:
  // - Friendly only.
  // - Never creates a Defensive Block.
  // - Never deletes a Defensive Block.
  // - Every transfer is exactly one existing DB:
  //       source -1 / recipient +1
  // - Transfers stay inside one team.
  // - Team total must remain invariant.
  // ============================================================

  const [showDbIntentPrompt, setShowDbIntentPrompt] = useState(false);
  const [showDbTransferModal, setShowDbTransferModal] = useState(false);
  const [dbCorrectionMatch, setDbCorrectionMatch] = useState(null);
  const [dbSelectedTeamId, setDbSelectedTeamId] = useState("");
  const [dbSourcePlayer, setDbSourcePlayer] = useState("");
  const [dbTargetPlayer, setDbTargetPlayer] = useState("");
  const [dbTransfers, setDbTransfers] = useState([]);
  const [dbReviewMode, setDbReviewMode] = useState(false);

  const closeDbTransferStudioCompletely = useCallback(() => {
    setShowDbIntentPrompt(false);
    setShowDbTransferModal(false);
    setDbCorrectionMatch(null);
    setDbSelectedTeamId("");
    setDbSourcePlayer("");
    setDbTargetPlayer("");
    setDbTransfers([]);
    setDbReviewMode(false);
  }, []);

  const dbCorrectionMatchKey = useMemo(() => {
    if (!dbCorrectionMatch) return "";
    return `${dbCorrectionMatch?._tkMatchDayId || "UNKNOWN"}::${Number(
      dbCorrectionMatch?.matchNo || 0
    )}`;
  }, [dbCorrectionMatch]);

  const dbCorrectionEvents = useMemo(() => {
    if (!dbCorrectionMatchKey) return [];

    return (eventsByMatchKey.get(dbCorrectionMatchKey) || []).filter(
      (event) =>
        String(event?.type || "").trim().toLowerCase() ===
        "defensive_block"
    );
  }, [eventsByMatchKey, dbCorrectionMatchKey]);

  const dbTeamOptions = useMemo(() => {
    if (!dbCorrectionMatch) return [];

    const options = [
      {
        id: dbCorrectionMatch?.teamAId || "",
        label: getTeamName(dbCorrectionMatch?.teamAId),
      },
      {
        id: dbCorrectionMatch?.teamBId || "",
        label: getTeamName(dbCorrectionMatch?.teamBId),
      },
    ];

    return options.filter((team) => team.id);
  }, [dbCorrectionMatch, getTeamName]);

  const dbOriginalDistribution = useMemo(() => {
    if (!dbSelectedTeamId) return [];

    const counts = new Map();

    /*
     * Include the current squad so a substitute with zero DB can
     * still be selected as the rightful recipient.
     */
    getPlayersForTeam(dbSelectedTeamId).forEach((name) => {
      const safeName = resolveCanonicalName(name);
      if (safeName && !counts.has(safeName)) {
        counts.set(safeName, 0);
      }
    });

    dbCorrectionEvents
      .filter(
        (event) =>
          String(event?.teamId || "") === String(dbSelectedTeamId)
      )
      .forEach((event) => {
        const name = resolveCanonicalName(
          event?.playerName || event?.scorer || ""
        );

        if (!name) return;

        counts.set(name, Number(counts.get(name) || 0) + 1);
      });

    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        displayName: resolveShortDisplay(name),
        count: Number(count || 0),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.displayName).localeCompare(String(b.displayName));
      });
  }, [
    dbSelectedTeamId,
    dbCorrectionEvents,
    getPlayersForTeam,
    resolveCanonicalName,
    resolveShortDisplay,
  ]);

  const dbWorkingDistribution = useMemo(() => {
    const counts = new Map(
      dbOriginalDistribution.map((player) => [
        player.name,
        Number(player.count || 0),
      ])
    );

    dbTransfers
      .filter(
        (transfer) =>
          String(transfer?.teamId || "") ===
          String(dbSelectedTeamId || "")
      )
      .forEach((transfer) => {
        const from = resolveCanonicalName(transfer?.from || "");
        const to = resolveCanonicalName(transfer?.to || "");

        if (!from || !to || from === to) return;

        counts.set(
          from,
          Math.max(0, Number(counts.get(from) || 0) - 1)
        );

        counts.set(
          to,
          Number(counts.get(to) || 0) + 1
        );
      });

    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        displayName: resolveShortDisplay(name),
        count: Number(count || 0),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.displayName).localeCompare(String(b.displayName));
      });
  }, [
    dbOriginalDistribution,
    dbTransfers,
    dbSelectedTeamId,
    resolveCanonicalName,
    resolveShortDisplay,
  ]);

  const dbOriginalTotal = useMemo(
    () =>
      dbOriginalDistribution.reduce(
        (sum, player) => sum + Number(player?.count || 0),
        0
      ),
    [dbOriginalDistribution]
  );

  const dbCurrentTotal = useMemo(
    () =>
      dbWorkingDistribution.reduce(
        (sum, player) => sum + Number(player?.count || 0),
        0
      ),
    [dbWorkingDistribution]
  );

  const dbInvariantSafe =
    dbOriginalTotal === dbCurrentTotal;

  const dbSelectedTeamLabel =
    dbTeamOptions.find(
      (team) =>
        String(team.id) === String(dbSelectedTeamId)
    )?.label || "Team";

  const getDbWorkingCount = useCallback(
    (playerName) => {
      const canonical = resolveCanonicalName(playerName);

      return Number(
        dbWorkingDistribution.find(
          (player) => player.name === canonical
        )?.count || 0
      );
    },
    [dbWorkingDistribution, resolveCanonicalName]
  );

  const transferOneDefensiveBlock = useCallback(() => {
    const from = resolveCanonicalName(dbSourcePlayer);
    const to = resolveCanonicalName(dbTargetPlayer);

    if (!dbSelectedTeamId) return;

    if (!from || !to) {
      window.alert(
        "Select both the player giving up the Defensive Block and the player receiving it."
      );
      return;
    }

    if (from === to) {
      window.alert(
        "The source and recipient must be different players."
      );
      return;
    }

    const sourceCount = getDbWorkingCount(from);

    if (sourceCount <= 0) {
      window.alert(
        `${resolveShortDisplay(from)} has no Defensive Blocks available to transfer.`
      );
      return;
    }

    setDbTransfers((prev) => [
      ...prev,
      {
        id: `db-transfer-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        teamId: dbSelectedTeamId,
        from,
        to,
      },
    ]);
  }, [
    dbSelectedTeamId,
    dbSourcePlayer,
    dbTargetPlayer,
    getDbWorkingCount,
    resolveCanonicalName,
    resolveShortDisplay,
  ]);

  const undoLastDbTransfer = useCallback(() => {
    setDbTransfers((prev) => prev.slice(0, -1));
  }, []);

  const resetDbTransfers = useCallback(() => {
    setDbTransfers([]);
    setDbSourcePlayer("");
    setDbTargetPlayer("");
    setDbReviewMode(false);
  }, []);

  const requestCloseDbTransferStudio = useCallback(() => {
    if (dbTransfers.length > 0) {
      setDbReviewMode(true);
      return;
    }

    closeDbTransferStudioCompletely();
  }, [
    dbTransfers.length,
    closeDbTransferStudioCompletely,
  ]);

  const saveDbRedistributionAndClose = useCallback(() => {
    if (!dbCorrectionMatch) return;

    if (!dbInvariantSafe) {
      window.alert(
        "Save blocked: the team Defensive Block total changed. No correction has been saved."
      );
      return;
    }

    if (
      typeof onRedistributeFriendlyDefensiveBlocks !==
      "function"
    ) {
      window.alert(
        "Defensive Block correction is not connected to the saved Friendly record."
      );
      return;
    }

    if (dbTransfers.length === 0) {
      closeDbTransferStudioCompletely();
      return;
    }

    onRedistributeFriendlyDefensiveBlocks({
      matchDayId:
        dbCorrectionMatch?._tkMatchDayId ||
        friendlyDateFromRecord(dbCorrectionMatch) ||
        "",
      matchNo: Number(dbCorrectionMatch?.matchNo || 0),
      matchType: "FRIENDLY",
      transfers: dbTransfers.map((transfer) => ({
        teamId: transfer.teamId,
        from: transfer.from,
        to: transfer.to,
      })),
    });

    closeDbTransferStudioCompletely();
  }, [
    dbCorrectionMatch,
    dbInvariantSafe,
    dbTransfers,
    onRedistributeFriendlyDefensiveBlocks,
    closeDbTransferStudioCompletely,
  ]);

  const openDbTransferStudio = useCallback(() => {
    /*
     * The Friendly display is newest-first. The first record is
     * therefore the latest editable Friendly match in this view.
     */
    const targetMatch = sortedResults?.[0] || null;

    if (!targetMatch) {
      window.alert(
        "No Friendly match is available for Defensive Block correction."
      );
      return;
    }

    if (!isEditableCurrentFriendlyWeekRecord(targetMatch)) {
      blockNonCurrentFriendlyEdit();
      return;
    }

    setDbCorrectionMatch(targetMatch);
    setDbSelectedTeamId("");
    setDbSourcePlayer("");
    setDbTargetPlayer("");
    setDbTransfers([]);
    setDbReviewMode(false);
    setShowDbIntentPrompt(false);
    setShowDbTransferModal(true);
  }, [
    sortedResults,
    isEditableCurrentFriendlyWeekRecord,
    blockNonCurrentFriendlyEdit,
  ]);


  const [editingEventId, setEditingEventId] = useState(null);
  const [editingEventRecord, setEditingEventRecord] = useState(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState(null);
  const [eventDraft, setEventDraft] = useState({
    scorer: "",
    assist: "",
    type: "goal",
    teamId: "",
  });

  const startEditEvent = (e) => {
    if (!adminEditingToolsActive) return;
    if (showFriendlyStats && !isEditableCurrentFriendlyWeekRecord(e)) {
      blockNonCurrentFriendlyEdit();
      return;
    }
    if (e?.type === "clean_sheet") {
      window.alert(
        "Clean-sheet events are generated from verified lineups and match result. Edit the score/result instead of editing this event directly."
      );
      return;
    }

    setEditingEventId(String(e?.id || ""));
    setEditingEventRecord(e || null);
    setEventDraft({
      scorer: e?.scorer || "",
      assist: e?.assist || "",
      type: "goal",
      teamId: e?.teamId || "",
    });
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEditingEventRecord(null);
    setEventDraft({
      scorer: "",
      assist: "",
      type: "goal",
      teamId: "",
    });
  };

  const saveEditEvent = (e = editingEventRecord) => {
    if (!adminEditingToolsActive) return;
    if (showFriendlyStats && !isEditableCurrentFriendlyWeekRecord(e)) {
      blockNonCurrentFriendlyEdit();
      return;
    }
    if (typeof onUpdateSavedEvent !== "function") return;

    const scorer = String(eventDraft?.scorer || "").trim();
    const assistRaw = String(eventDraft?.assist || "").trim();

    if (!scorer) {
      window.alert("Scorer name is required.");
      return;
    }

    onUpdateSavedEvent(e?.id, {
      scorer,
      assist: assistRaw && assistRaw !== scorer ? assistRaw : null,
      type: "goal",
      teamId: eventDraft?.teamId || e?.teamId || "",
    });

    cancelEditEvent();
  };

  const [addingForMatchKey, setAddingForMatchKey] = useState(null);
  const [addingMatchRecord, setAddingMatchRecord] = useState(null);
  const [newEventDraft, setNewEventDraft] = useState({
    scorer: "",
    assist: "",
    type: "goal",
    teamId: "",
  });

  const startAddEvent = (r, defaultTeamId = "") => {
    if (!adminEditingToolsActive) return;
    if (showFriendlyStats && !isEditableCurrentFriendlyWeekRecord(r)) {
      blockNonCurrentFriendlyEdit();
      return;
    }

    setAddingForMatchKey(matchKeyOf(r));
    setAddingMatchRecord(r || null);
    setNewEventDraft({
      scorer: "",
      assist: "",
      type: "goal",
      teamId: defaultTeamId || r?.teamAId || "",
    });
  };

  const cancelAddEvent = () => {
    setAddingForMatchKey(null);
    setAddingMatchRecord(null);
    setNewEventDraft({
      scorer: "",
      assist: "",
      type: "goal",
      teamId: "",
    });
  };

  const saveAddEvent = (r = addingMatchRecord) => {
    if (!adminEditingToolsActive) return;
    if (showFriendlyStats && !isEditableCurrentFriendlyWeekRecord(r)) {
      blockNonCurrentFriendlyEdit();
      return;
    }
    if (typeof onAddSavedEvent !== "function") return;

    const scorer = String(newEventDraft?.scorer || "").trim();
    const assistRaw = String(newEventDraft?.assist || "").trim();

    if (!scorer) {
      window.alert("Scorer name is required.");
      return;
    }

    onAddSavedEvent(r?.matchNo, {
      scorer,
      assist: assistRaw && assistRaw !== scorer ? assistRaw : null,
      type: "goal",
      teamId: newEventDraft?.teamId || r?.teamAId || "",
    });

    cancelAddEvent();
  };

  useEffect(() => {
    if (!editingEventId) return;
    if (eventDraft.assist && eventDraft.assist === eventDraft.scorer) {
      setEventDraft((prev) => ({ ...prev, assist: "" }));
    }
  }, [editingEventId, eventDraft.scorer, eventDraft.assist]);

  useEffect(() => {
    if (!addingForMatchKey) return;
    if (newEventDraft.assist && newEventDraft.assist === newEventDraft.scorer) {
      setNewEventDraft((prev) => ({ ...prev, assist: "" }));
    }
  }, [addingForMatchKey, newEventDraft.scorer, newEventDraft.assist]);

  useEffect(() => {
    if (!editingEventId) return;

    const allowedPlayers = getPlayersForTeam(eventDraft.teamId);
    if (!allowedPlayers.length) return;

    setEventDraft((prev) => ({
      ...prev,
      scorer: allowedPlayers.includes(prev.scorer) ? prev.scorer : "",
      assist:
        !prev.assist ||
        (allowedPlayers.includes(prev.assist) && prev.assist !== prev.scorer)
          ? prev.assist
          : "",
    }));
  }, [editingEventId, eventDraft.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!addingForMatchKey) return;

    const allowedPlayers = getPlayersForTeam(newEventDraft.teamId);
    if (!allowedPlayers.length) return;

    setNewEventDraft((prev) => ({
      ...prev,
      scorer: allowedPlayers.includes(prev.scorer) ? prev.scorer : "",
      assist:
        !prev.assist ||
        (allowedPlayers.includes(prev.assist) && prev.assist !== prev.scorer)
          ? prev.assist
          : "",
    }));
  }, [addingForMatchKey, newEventDraft.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canDeleteFromThisView =
    isAdminUser &&
    !isViewingPreviousSeason &&
    typeof onDeleteSavedMatch === "function" &&
    adminEditingToolsActive;

  const handleDeleteMatch = (recordOrMatchNo) => {
    if (!canDeleteFromThisView) return;

    const isRecord =
      recordOrMatchNo &&
      typeof recordOrMatchNo === "object" &&
      !Array.isArray(recordOrMatchNo);

    if (showFriendlyStats) {
      if (!isRecord || !isEditableCurrentFriendlyWeekRecord(recordOrMatchNo)) {
        blockNonCurrentFriendlyEdit();
        return;
      }
    }

    const matchNo = isRecord ? recordOrMatchNo?.matchNo : recordOrMatchNo;
    const recordMatchType = isRecord
      ? inferStatsRecordType(recordOrMatchNo)
      : showFriendlyStats
        ? "FRIENDLY"
        : "LEAGUE";

    if (showFriendlyStats && recordMatchType !== "FRIENDLY") {
      window.alert(
        "Delete blocked: this does not look like a Friendly record, so it will not be deleted from Friendlies View."
      );
      return;
    }

    if (!showFriendlyStats && recordMatchType !== "LEAGUE") {
      window.alert(
        "Delete blocked: this does not look like a League record, so it will not be deleted from League View."
      );
      return;
    }

    const formatLabel = isRecord
      ? formatStatsGameFormatLabel(getStatsGameFormat(recordOrMatchNo, gameFormat))
      : formatStatsGameFormatLabel(gameFormat);

    const friendlyLabel = isRecord
      ? recordOrMatchNo?._tkFriendlyDayLabel || friendlyDateFromRecord(recordOrMatchNo)
      : "";

    const confirmTitle = showFriendlyStats
      ? `Delete Friendly Day${friendlyLabel ? ` (${friendlyLabel})` : ""}?`
      : `Delete saved match #${matchNo} from the current week?`;

    const ok = window.confirm(
      `${confirmTitle}\n\nThis will remove the match result and all linked scorer/assist events for that match.`
    );
    if (!ok) return;

    onDeleteSavedMatch(matchNo, {
      matchType: recordMatchType,
      gameFormat: isRecord ? getStatsGameFormat(recordOrMatchNo, gameFormat) : gameFormat,
      matchDayId: isRecord ? recordOrMatchNo?._tkMatchDayId || null : null,
    });
    setExpandedMatchKey(null);
    cancelEditEvent();
    cancelAddEvent();
  };

  const handleDeleteEvent = (e) => {
    if (!adminEditingToolsActive) return;
    if (showFriendlyStats && !isEditableCurrentFriendlyWeekRecord(e)) {
      blockNonCurrentFriendlyEdit();
      return;
    }
    if (typeof onDeleteSavedEvent !== "function") return;

    if (e?.type === "clean_sheet") {
      window.alert(
        "Clean-sheet events are generated from verified lineups and match result. Edit the score/result instead of deleting this event directly."
      );
      return;
    }

    setPendingDeleteEvent(e || null);
  };

  const cancelDeleteEvent = () => {
    setPendingDeleteEvent(null);
  };

  const confirmDeleteEvent = () => {
    if (!adminEditingToolsActive) return;
    if (showFriendlyStats && !isEditableCurrentFriendlyWeekRecord(pendingDeleteEvent)) {
      blockNonCurrentFriendlyEdit();
      return;
    }
    if (typeof onDeleteSavedEvent !== "function") return;
    if (!pendingDeleteEvent?.id) return;

    onDeleteSavedEvent(pendingDeleteEvent.id);
    setPendingDeleteEvent(null);
  };

  useEffect(() => {
    if (!showFriendlyStats || isManagingFriendlyDay) return;

    setEditingEventId(null);
    setEditingEventRecord(null);
    setPendingDeleteEvent(null);
    setAddingForMatchKey(null);
    setAddingMatchRecord(null);
  }, [showFriendlyStats, isManagingFriendlyDay]);

  const inactivityTimerRef = useRef(null);

  useEffect(() => {
    if (!cameFromLive) return;

    const TIMEOUT_MS = 15000;

    const clearTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };

    const startTimer = () => {
      clearTimer();
      inactivityTimerRef.current = setTimeout(() => {
        try {
          const stay = window.confirm(
            "Return to the live match screen? (OK = go back, Cancel = stay on stats)"
          );
          if (stay) onBack();
          else startTimer();
        } catch (_) {
          onBack();
        }
      }, TIMEOUT_MS);
    };

    const handleActivity = () => startTimer();

    startTimer();
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      clearTimer();
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [cameFromLive, onBack]);

  const [activeTab, setActiveTab] = useState("teams");

  useEffect(() => {
    if (
      !showFriendlyStats ||
      friendlyMonthScope !== CURRENT_SCOPE ||
      activeTab !== "matches" ||
      (
        viewMode !== "current" &&
        !isAugust2026FriendlyMonthlyEditView
      )
    ) {
      setIsManagingFriendlyDay(false);
    }
  }, [
    showFriendlyStats,
    viewMode,
    friendlyMonthScope,
    activeTab,
    isAugust2026FriendlyMonthlyEditView,
  ]);

  useEffect(() => {
    if (showFriendlyStats && activeTab === "teams") {
      setActiveTab("combined");
    }
  }, [showFriendlyStats, activeTab]);


  useEffect(() => {
    const shouldAutoOpenCurrentWeekFriendlyTable =
      showFriendlyStats &&
      activeTab === "matches" &&
      viewMode === "current" &&
      friendlyMonthScope === CURRENT_SCOPE &&
      sortedResults.length > 0;

    if (shouldAutoOpenCurrentWeekFriendlyTable) {
      // Perfect Table 1 rule: when users land on Current Week friendlies,
      // the latest/top friendly match opens automatically to show scorers + assists.
      setExpandedMatchKey(matchKeyOf(sortedResults[0]));
      return;
    }

    setExpandedMatchKey(null);
  }, [
    matchDayFilter,
    seasonScope,
    viewMode,
    friendlyMonthScope,
    showFriendlyStats,
    activeTab,
    sortedResults,
  ]);

  const currentSeasonRange = useMemo(() => {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    });
    return fmt.format(now);
  }, []);

  const previousSeasonRange = useMemo(() => {
    if (!selectedPrevSeason) return "";
    const { startISO, endISO } = getSeasonDateBounds(selectedPrevSeason);
    return monthRangeLabel(startISO, endISO);
  }, [selectedPrevSeason]);

  const friendlyCurrentMonthLabel = useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(now);
  }, []);

  const friendlyPreviousMonthLabel = useMemo(() => {
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(previous);
  }, []);

  const friendlyMonthContextLabel =
    friendlyMonthScope === FRIENDLY_PREVIOUS_MONTH_SCOPE
      ? `Previous month • ${friendlyPreviousMonthLabel}`
      : `Current month • ${friendlyCurrentMonthLabel}`;

  const seasonContextTitle = useMemo(() => {
    if (!isViewingPreviousSeason) return "Current season";
    if (isPreviewingPreviousSeasonUI) return "Previous season preview (admin)";
    return formatSeasonDisplayName(selectedPrevSeason);
  }, [
    isViewingPreviousSeason,
    isPreviewingPreviousSeasonUI,
    selectedPrevSeason,
  ]);

  const viewContextTitle = useMemo(() => {
    if (isViewingPreviousSeason) return "Full season";
    return viewMode === "season" ? "Full season" : "Current week";
  }, [isViewingPreviousSeason, viewMode]);

  const headerRangeText = useMemo(() => {
    if (isViewingPreviousSeason) {
      return previousSeasonRange
        ? previousSeasonRange
        : "Season dates unknown";
    }
    return currentSeasonRange;
  }, [isViewingPreviousSeason, previousSeasonRange, currentSeasonRange]);

  const championSeasonLabel = useMemo(() => {
    if (!selectedPrevSeason) return "";

    const match = String(selectedPrevSeason?.seasonId || "").match(
      /^(\d{4})-S(\d+)$/i
    );

    if (match) {
      const seasonNo = match[2];
      return `Season ${seasonNo} Champions`;
    }

    return "Season Champions";
  }, [selectedPrevSeason]);

  const previousSeasonTabOrder = [
    "teams",
    "goals",
    "assists",
    "cleansheets",
    "matches",
    "combined",
  ];

  const currentPrevTabIndex = previousSeasonTabOrder.indexOf(activeTab);

  const goPrevSeasonTable = () => {
    const safeIndex = currentPrevTabIndex >= 0 ? currentPrevTabIndex : 0;
    const nextIndex =
      safeIndex === 0 ? previousSeasonTabOrder.length - 1 : safeIndex - 1;
    setActiveTab(previousSeasonTabOrder[nextIndex]);
  };

  const goNextSeasonTable = () => {
    const safeIndex = currentPrevTabIndex >= 0 ? currentPrevTabIndex : 0;
    const nextIndex =
      safeIndex === previousSeasonTabOrder.length - 1 ? 0 : safeIndex + 1;
    setActiveTab(previousSeasonTabOrder[nextIndex]);
  };

  const previousSeasonCurrentTableLabel = useMemo(() => {
    if (activeTab === "teams") return "Team Standings";
    if (activeTab === "goals") return "Top Scorers";
    if (activeTab === "assists") return "Playmakers";
    if (activeTab === "cleansheets") return isFriendlyStatsView ? "5-min Defensive Blocks" : "Clean Sheets";
    if (activeTab === "matches") return "Match Results";
    if (activeTab === "combined") return "Summary Player Stats";
    return "Team Standings";
  }, [activeTab]);

  const topActionRowStyle = isMobile
    ? {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        margin: "0.85rem 0 1rem",
        flexWrap: "nowrap",
      }
    : {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "0.75rem",
        margin: "0.85rem 0 1rem",
      };

  const rightButtonsStyle = isMobile
    ? {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        gap: "0.75rem",
      }
    : {
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
      };


  const editModalPlayers = editingEventId ? getPlayersForTeam(eventDraft.teamId) : [];
  const editModalAssistPlayers = editModalPlayers.filter(
    (name) => name !== eventDraft.scorer
  );

  const editModalTeamOptions = (() => {
    const seen = new Set();
    const options = [];

    (scopedTeams || []).forEach((team) => {
      const id = String(team?.id || team?.label || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      options.push({ id, label: team?.label || id });
    });

    const currentTeamId = String(eventDraft.teamId || editingEventRecord?.teamId || "").trim();
    if (currentTeamId && !seen.has(currentTeamId)) {
      options.unshift({ id: currentTeamId, label: getTeamName(currentTeamId) });
    }

    return options;
  })();

  const addModalPlayers = addingForMatchKey ? getPlayersForTeam(newEventDraft.teamId) : [];
  const addModalAssistPlayers = addModalPlayers.filter(
    (name) => name !== newEventDraft.scorer
  );

  const addModalTeamOptions = (() => {
    const seen = new Set();
    const options = [];

    const addOption = (id, label) => {
      const safeId = String(id || "").trim();
      if (!safeId || seen.has(safeId)) return;
      seen.add(safeId);
      options.push({ id: safeId, label: label || getTeamName(safeId) || safeId });
    };

    if (addingMatchRecord) {
      addOption(addingMatchRecord.teamAId, getTeamName(addingMatchRecord.teamAId));
      addOption(addingMatchRecord.teamBId, getTeamName(addingMatchRecord.teamBId));
    }

    (scopedTeams || []).forEach((team) => {
      const id = String(team?.id || team?.label || "").trim();
      addOption(id, team?.label || id);
    });

    const currentTeamId = String(newEventDraft.teamId || addingMatchRecord?.teamAId || "").trim();
    if (currentTeamId && !seen.has(currentTeamId)) {
      options.unshift({ id: currentTeamId, label: getTeamName(currentTeamId) });
    }

    return options;
  })();


  return (
    <div className="page stats-page">
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
              <h1 style={{ margin: 0 }}>Stats &amp; Leaderboards</h1>
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

      <div style={topActionRowStyle}>
        <div style={rightButtonsStyle}>
          <button className="secondary-btn" onClick={onGoToPeerReview}>
            Rate Player
          </button>
          <button className="secondary-btn" onClick={onGoToPlayerCards}>
            Player cards
          </button>
        </div>
      </div>


      {!showFriendlyStats && (
      <section className="card">
        <h2>Season</h2>

        <div className="muted stats-context-line" style={{ marginBottom: "0.75rem" }}>
          <strong>{seasonContextTitle}</strong> • <span>{viewContextTitle}</span> •{" "}
          <span>{headerRangeText}</span>
        </div>

        {isPreviewingPreviousSeasonUI && (
          <div className="muted stats-preview-note" style={{ marginBottom: "0.85rem" }}>
            Admin-only preview: you are viewing the current season styled as a
            previous season.
          </div>
        )}

        <div className="stats-controls stats-controls-align-center">
          <div className="stats-controls-left stats-controls-left-wide">
            <div className="segment-wrapper">
              <div className="segmented-toggle">
                <button
                  type="button"
                  className={
                    seasonScope === CURRENT_SCOPE
                      ? "segmented-option active"
                      : "segmented-option"
                  }
                  onClick={() => setSeasonScope(CURRENT_SCOPE)}
                >
                  Current
                </button>
                <button
                  type="button"
                  className={
                    seasonScope !== CURRENT_SCOPE
                      ? "segmented-option active"
                      : "segmented-option"
                  }
                  onClick={() => {
                    if (previousSeasonOptions.length > 0) {
                      setSeasonScope(previousSeasonOptions[0].seasonId);
                    } else if (isAdminUser && canPreviewPreviousSeasonUI) {
                      setSeasonScope(PREVIEW_PREVIOUS_SCOPE);
                    }
                  }}
                  disabled={
                    previousSeasonOptions.length === 0 &&
                    !(isAdminUser && canPreviewPreviousSeasonUI)
                  }
                  title={
                    previousSeasonOptions.length > 0
                      ? "Switch to a previous season"
                      : isAdminUser && canPreviewPreviousSeasonUI
                        ? "Admin preview of previous-season layout"
                        : "No previous seasons yet"
                  }
                >
                  Previous
                </button>
              </div>
            </div>

            {seasonScope !== CURRENT_SCOPE && (
              <div className="stats-season-select-block">
                <label className="muted stats-inline-label">
                  Choose a previous season
                </label>

                {isPreviewingPreviousSeasonUI ? (
                  <div className="muted">
                    Admin preview is active. This simulates how previous season
                    looks while you are still on season 1.
                  </div>
                ) : (
                  <>
                    <select
                      className="text-input"
                      value={seasonScope}
                      onChange={(e) => setSeasonScope(e.target.value)}
                    >
                      {previousSeasonOptions.map((s) => (
                        <option key={s.seasonId} value={s.seasonId}>
                          {formatSeasonDisplayName(s)}
                        </option>
                      ))}
                    </select>
                    <div className="muted stats-season-range">
                      {previousSeasonRange
                        ? `Season range: ${previousSeasonRange}`
                        : "Season range: unknown"}
                    </div>
                  </>
                )}
              </div>
            )}

            {canShowDeleteCurrentEmptySeason && (
              <div className="stats-danger-row">
                <button
                  type="button"
                  className="tk-danger-btn"
                  onClick={handleDeleteCurrentEmptySeason}
                >
                  Delete current empty season
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {showFriendlyStats && (
        <section className="card">
          <h2>Month</h2>

          <div className="muted stats-context-line" style={{ marginBottom: "0.75rem" }}>
            <strong>{friendlyMonthContextLabel}</strong> •{" "}
            <span>{viewMode === "current" && friendlyMonthScope === CURRENT_SCOPE ? "Current week" : "This Month"}</span>
          </div>

          <div className="stats-controls stats-controls-align-center">
            <div className="stats-controls-left stats-controls-left-wide">
              <div className="segment-wrapper">
                <div className="segmented-toggle">
                  <button
                    type="button"
                    className={
                      friendlyMonthScope === CURRENT_SCOPE
                        ? "segmented-option active"
                        : "segmented-option"
                    }
                    onClick={() => setFriendlyMonthScope(CURRENT_SCOPE)}
                  >
                    Current
                  </button>

                  <button
                    type="button"
                    className={
                      friendlyMonthScope === FRIENDLY_PREVIOUS_MONTH_SCOPE
                        ? "segmented-option active"
                        : "segmented-option"
                    }
                    onClick={() => setFriendlyMonthScope(FRIENDLY_PREVIOUS_MONTH_SCOPE)}
                  >
                    Previous
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {!isViewingPreviousSeason && (
        <section className="card">
          {showFriendlyStats ? (
            <div className="tk-friendly-view-header-row">
              <h2>Friendlies View</h2>

              {isAdminUser &&
                friendlyMonthScope === CURRENT_SCOPE &&
                (
                  viewMode === "current" ||
                  isAugust2026FriendlyMonthlyEditView
                ) &&
                sortedResults.length > 0 && (
                <button
                  type="button"
                  className={
                    isManagingFriendlyDay
                      ? "tk-manage-friendly-btn active"
                      : "tk-manage-friendly-btn"
                  }
                  onClick={() => {
                    if (isManagingFriendlyDay) {
                      setIsManagingFriendlyDay(false);
                      closeDbTransferStudioCompletely();
                      return;
                    }

                    setFriendlyMonthScope(CURRENT_SCOPE);

                    if (!isAugust2026FriendlyMonthlyEditView) {
                      setViewMode("current");
                    }

                    setActiveTab("matches");
                    setIsManagingFriendlyDay(true);

                    /*
                     * Keep the existing Edit Goal experience intact.
                     * This premium prompt only asks whether DB
                     * correction is also required.
                     */
                    setShowDbIntentPrompt(true);
                  }}
                >
                  {isManagingFriendlyDay
                    ? "Done Editing"
                    : "Edit Goal"}
                </button>
              )}
            </div>
          ) : (
            <h2>View</h2>
          )}
          <div className="stats-controls">
            <div className="stats-controls-left">
              <div className="segment-wrapper">
                <div className="segmented-toggle">
                  {!(showFriendlyStats && friendlyMonthScope === FRIENDLY_PREVIOUS_MONTH_SCOPE) && (
                    <button
                      type="button"
                      className={
                        viewMode === "current"
                          ? "segmented-option active"
                          : "segmented-option"
                      }
                      onClick={() => setViewMode("current")}
                    >
                      Current week
                    </button>
                  )}
                  <button
                    type="button"
                    className={
                      viewMode === "season"
                        ? "segmented-option active"
                        : "segmented-option"
                    }
                    onClick={() => setViewMode("season")}
                  >
                    {showFriendlyStats ? "This Month" : "Full season"}
                  </button>
                </div>
              </div>
            </div>

            <div className="actions-row stats-tabs">
              {!showFriendlyStats && (
              <button
                className={
                  activeTab === "teams" ? "secondary-btn active" : "secondary-btn"
                }
                onClick={() => setActiveTab("teams")}
              >
                Team Standings
              </button>
              )}
              <button
                className={
                  activeTab === "matches" ? "secondary-btn active" : "secondary-btn"
                }
                onClick={() => setActiveTab("matches")}
              >
                Match Results
              </button>
              <button
                className={
                  activeTab === "goals" ? "secondary-btn active" : "secondary-btn"
                }
                onClick={() => setActiveTab("goals")}
              >
                Top Scorers
              </button>
              <button
                className={
                  activeTab === "assists" ? "secondary-btn active" : "secondary-btn"
                }
                onClick={() => setActiveTab("assists")}
              >
                Playmakers
              </button>
              <button
                className={
                  activeTab === "cleansheets"
                    ? "secondary-btn active"
                    : "secondary-btn"
                }
                onClick={() => setActiveTab("cleansheets")}
              >
                {isFriendlyStatsView ? "5-min Defensive Blocks" : "Clean Sheets"}
              </button>
              <button
                className={
                  activeTab === "combined"
                    ? "secondary-btn active"
                    : "secondary-btn"
                }
                onClick={() => setActiveTab("combined")}
              >
                Summary Player Stats
              </button>
            </div>
          </div>
        </section>
      )}

      {isViewingPreviousSeason && champion && (
        <section className="card">
          <h2>
            {isPreviewingPreviousSeasonUI
              ? `${championSeasonLabel} (${headerRangeText}) (Preview)`
              : `${championSeasonLabel} : ${headerRangeText}`}
          </h2>

          <div className="champion-card">
            <div className="champion-card-content">
              <div className="champion-crown">🏆</div>

              <div className="champion-kicker">
                {isPreviewingPreviousSeasonUI
                  ? "Season Champions (Preview)"
                  : "Season Champions"}
              </div>

              <div className="champion-team-name">{champion.teamName}</div>

              {champion.captainPhoto ? (
                <img
                  src={champion.captainPhoto}
                  alt={champion.captainName}
                  className="champion-captain-photo"
                />
              ) : (
                <div className="champion-captain-fallback">
                  {String(champion.captainName || "?").charAt(0).toUpperCase()}
                </div>
              )}

              <div className="champion-captain-line">
                Captain: <span className="champion-captain-name">{champion.captainName}</span>
              </div>

              {champion.squadNames && champion.squadNames.length > 0 && (
                <>
                  <div className="champion-squad-title">Winning Squad</div>

                  <div className="champion-squad-chips">
                    {champion.squadNames.map((p, i) => (
                      <span key={i} className="champion-squad-chip">
                        {p}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {isViewingPreviousSeason && (
        <section className="card prev-season-nav-card">
          <div className="prev-season-nav">
            <button
              type="button"
              className="secondary-btn prev-season-nav-btn"
              onClick={goPrevSeasonTable}
              title="Previous table"
            >
              ←
            </button>

            <div className="prev-season-nav-title">
              {previousSeasonCurrentTableLabel}
            </div>

            <button
              type="button"
              className="secondary-btn prev-season-nav-btn"
              onClick={goNextSeasonTable}
              title="Next table"
            >
              →
            </button>
          </div>
        </section>
      )}

      {!showFriendlyStats && activeTab === "teams" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason
              ? isPreviewingPreviousSeasonUI
                ? "Team Standings — Previous Season Preview"
                : `Team Standings — ${formatSeasonDisplayName(selectedPrevSeason)}`
              : viewMode === "season"
                ? "Team Standings — Current Season"
                : "Team Standings — Current Week"}
          </h2>
          <div className="muted stats-subtitle-tight">{headerRangeText}</div>

          <div className="table-wrapper tk-scroll-table-wrapper tk-team-identity-table">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>Pts</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((t, idx) => (
                  <tr key={t.teamId}>
                    <td>{idx + 1}</td>
                    <td>{t.name}</td>
                    <td>{t.points}</td>
                    <td>{t.played}</td>
                    <td>{t.won}</td>
                    <td>{t.drawn}</td>
                    <td>{t.lost}</td>
                    <td>{t.goalsFor}</td>
                    <td>{t.goalsAgainst}</td>
                    <td>{t.goalDiff}</td>
                  </tr>
                ))}
                {teamStats.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted">
                      No teams loaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "combined" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason
              ? isPreviewingPreviousSeasonUI
                ? "Player Rankings — Previous Season Preview"
                : "Player Rankings — Previous Season"
              : showFriendlyStats
                ? viewMode === "season"
                  ? "Player Rankings — All Friendlies"
                  : "Player Rankings — Current Friendly Day"
                : viewMode === "season"
                  ? "Player Rankings — Current Season"
                  : "Player Rankings — Current Week"}
          </h2>
          <div className="table-wrapper tk-scroll-table-wrapper tk-player-identity-table tk-player-summary-table">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Goals</th>
                  <th>Assists</th>
                  <th>{isFriendlyStatsView ? "5-DB" : "CS"}</th>
                  <th>{isFriendlyStatsView ? "Total" : "G-A-CS"}</th>
                </tr>
              </thead>
              <tbody>
                {combinedLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No player stats recorded yet.
                    </td>
                  </tr>
                )}
                {combinedLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-combined"}>
                    <td>{idx + 1}</td>
                    <td>{p.displayName || p.name}</td>
                    <td>{p.teamName || "—"}</td>
                    <td>{p.goals}</td>
                    <td>{p.assists}</td>
                    <td>{p.cleanSheets}</td>
                    <td>{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "goals" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason
              ? isPreviewingPreviousSeasonUI
                ? "Top Scorers — Previous Season Preview"
                : "Top Scorers — Previous Season"
              : showFriendlyStats
                ? viewMode === "season"
                  ? "Top Scorers — All Friendlies"
                  : "Top Scorers — Current Friendly Day"
                : viewMode === "season"
                  ? "Top Scorers — Current Season"
                  : "Top Scorers — Current Week"}
          </h2>
          <div className="table-wrapper tk-scroll-table-wrapper tk-player-identity-table tk-player-small-table">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Goals</th>
                </tr>
              </thead>
              <tbody>
                {goalLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No goals recorded yet.
                    </td>
                  </tr>
                )}
                {goalLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-g"}>
                    <td>{idx + 1}</td>
                    <td>{p.displayName || p.name}</td>
                    <td>{p.teamName || "—"}</td>
                    <td>{p.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "assists" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason
              ? isPreviewingPreviousSeasonUI
                ? "Top Playmakers — Previous Season Preview"
                : "Top Playmakers — Previous Season"
              : showFriendlyStats
                ? viewMode === "season"
                  ? "Top Playmakers — All Friendlies"
                  : "Top Playmakers — Current Friendly Day"
                : viewMode === "season"
                  ? "Top Playmakers — Current Season"
                  : "Top Playmakers — Current Week"}
          </h2>
          <div className="table-wrapper tk-scroll-table-wrapper tk-player-identity-table tk-player-small-table">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Assists</th>
                </tr>
              </thead>
              <tbody>
                {assistLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No assists recorded yet.
                    </td>
                  </tr>
                )}
                {assistLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-a"}>
                    <td>{idx + 1}</td>
                    <td>{p.displayName || p.name}</td>
                    <td>{p.teamName || "—"}</td>
                    <td>{p.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "cleansheets" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason
              ? isPreviewingPreviousSeasonUI
                ? "Clean Sheets — Previous Season Preview"
                : "Clean Sheets — Previous Season"
              : showFriendlyStats
                ? viewMode === "season"
                  ? "5-min Defensive Blocks — All Friendlies"
                  : "5-min Defensive Blocks — Current Friendly Day"
                : viewMode === "season"
                  ? "Clean Sheets — Current Season"
                  : "Clean Sheets — Current Week"}
          </h2>
          <div className="table-wrapper tk-scroll-table-wrapper tk-defensive-stats-table-wrap">
            <table className="stats-table tk-defensive-stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>
                    {isFriendlyStatsView ? "GK 5-min DB" : "Saves CS"}
                  </th>
                  <th>
                    {isFriendlyStatsView ? "DEF 5-min DB" : "Defense CS"}
                  </th>
                  <th>
                    {isFriendlyStatsView ? "Total 5-min DB" : "Total CS"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cleanSheetLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      {isFriendlyStatsView
                        ? "No 5-min Defensive Blocks recorded yet."
                        : "No clean sheets recorded yet."}
                    </td>
                  </tr>
                )}
                {cleanSheetLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-cs"}>
                    <td>{idx + 1}</td>
                    <td>{p.displayName || p.name}</td>
                    <td>{p.teamName || "—"}</td>
                    <td>{p.gkCleanSheets}</td>
                    <td>{p.defCleanSheets}</td>
                    <td>{p.cleanSheets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "matches" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason
              ? isPreviewingPreviousSeasonUI
                ? "All Match Results — Previous Season Preview"
                : "All Match Results — Previous Season"
              : showFriendlyStats
                ? friendlyMonthScope === FRIENDLY_PREVIOUS_MONTH_SCOPE
                  ? "All Match Results — Previous Month"
                  : viewMode === "season"
                    ? "All Match Results — This Month"
                    : "All Match Results — Current Week"
                : viewMode === "season"
                  ? "All Match Results — Current Season"
                  : "All Match Results — Current Week"}
          </h2>
          <p className="muted">
            {showFriendlyStats && viewMode === "current" && friendlyMonthScope === CURRENT_SCOPE
              ? "Current week friendly scoreline and goal breakdown."
              : "Tap a match row to see goal scorers and assists for that game."}
          </p>

          {showFriendlyStats && isAdminUser && isManagingFriendlyDay && (
            <div className="tk-friendly-admin-ethics-banner tk-friendly-admin-ethics-inline" aria-label="Friendly admin editing guidance">
              <strong>Friendly admin tools</strong> are for resolving conflicts and contested outcomes only.
              Do not misuse them to doctor official scores, because that will damage team confidence.
            </div>
          )}

          {viewMode === "season" && !showFriendlyStats && (
            <div className="tk-matchday-filter-row">
              <button
                className={matchDayFilter === "ALL" ? "tk-md-btn active" : "tk-md-btn"}
                onClick={() => setMatchDayFilter("ALL")}
                type="button"
                title="Show all matchdays in this view"
              >
                <span className="tk-md-label">All</span>
              </button>

              {matchDayOptions.map((md) => {
                const label = isoDateOnly(md.label) || isoDateOnly(md.id) || md.label;
                return (
                  <button
                    key={md.id}
                    className={matchDayFilter === md.id ? "tk-md-btn active" : "tk-md-btn"}
                    onClick={() => setMatchDayFilter(md.id)}
                    type="button"
                    title={`Filter to match day: ${label}`}
                  >
                    <span className="tk-md-label">{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {false ? (
            <div className="tk-friendly-recap-wrap">
              {sortedResults.length === 0 ? (
                <p className="muted">No matches played yet.</p>
              ) : (
                <ul className="news-match-list tk-friendly-recap-list">
                  {sortedResults.map((r) => {
                    const teamAName = getTeamName(r.teamAId);
                    const teamBName = getTeamName(r.teamBId);
                    const mk = matchKeyOf(r);
                    const events = (eventsByMatchKey.get(mk) || [])
                      .filter(
                        (e) =>
                          String(e?.type || "")
                            .trim()
                            .toLowerCase() === "goal"
                      )
                      .slice()
                      .sort(
                        (a, b) =>
                          Number(a?.timeSeconds || 0) -
                          Number(b?.timeSeconds || 0)
                      );

                    const friendlyLabel = r._tkFriendlyDayLabel || "Today";

                    return (
                      <li key={mk} className="news-match-item tk-friendly-recap-item">
                        <div className="news-match-header">
                          <span className="news-match-number">
                            Friendly day — {friendlyLabel}
                          </span>
                          <span className="news-match-scoreline">
                            <span>{teamAName}</span>
                            <span className="score">
                              {r.goalsA} – {r.goalsB}
                            </span>
                            <span>{teamBName}</span>
                          </span>
                        </div>

                        {isManagingFriendlyDay && canDeleteFromThisView && (
                          <div className="tk-friendly-manage-panel">
                            <div className="tk-friendly-manage-title">
                              Admin controls
                            </div>

                            <div className="tk-friendly-manage-actions">
                              {adminEditingToolsActive && typeof onAddSavedEvent === "function" && (
                                <button
                                  type="button"
                                  className="tk-admin-compact-btn primary"
                                  onClick={() => startAddEvent(r, r.teamAId)}
                                >
                                  + Goal
                                </button>
                              )}

                              <button
                                type="button"
                                className="tk-admin-compact-btn danger"
                                onClick={() => handleDeleteMatch(r)}
                              >
                                Delete Match
                              </button>
                            </div>
                          </div>
                        )}

                        {events.length === 0 ? (
                          <p className="muted small">
                            No goal or assist breakdown recorded for this friendly.
                          </p>
                        ) : (
                          <ul className="news-event-list">
                            {events.map((e, i) => {
                              const actionLabel = formatEventTypeLabel(e.type, e.role);
                              const assistPart = e.assist
                                ? ` (assist: ${e.assist})`
                                : "";
                              const eventTeamName = getTeamName(e.teamId);
                              const teamSuffix =
                                eventTeamName && eventTeamName !== "Unknown"
                                  ? `, ${eventTeamName}`
                                  : "";
                              const isEditingThisEvent = false;
                              const editPlayers = getPlayersForTeam(eventDraft.teamId);
                              const editAssistPlayers = editPlayers.filter(
                                (name) => name !== eventDraft.scorer
                              );

                              return (
                                <li
                                  key={e.id || `${mk}-friendly-event-${i}`}
                                  className={
                                    isEditingThisEvent
                                      ? "news-event-item tk-friendly-event-editing"
                                      : "news-event-item"
                                  }
                                >
                                  <span className="news-event-time">
                                    {formatSecondsSafe(e.timeSeconds)}
                                  </span>

                                  <span className="news-event-text">
                                    <strong>
                                      {i + 1}. {actionLabel === "goal" ? "Goal" : actionLabel}
                                    </strong>{" "}
                                    – {e.scorer || e.playerName || "Unknown player"}
                                    {assistPart}
                                    {teamSuffix}

                                    {isManagingFriendlyDay && adminEditingToolsActive && !isEditingThisEvent && (
                                      <span className="tk-friendly-event-actions tk-mini-admin-actions">
                                        <button
                                          type="button"
                                          className="tk-mini-admin-btn"
                                          title="Edit goal"
                                          aria-label="Edit goal"
                                          onClick={() => startEditEvent(e)}
                                        >
                                          ✎
                                        </button>
                                        <button
                                          type="button"
                                          className="tk-mini-admin-btn danger"
                                          title="Delete goal"
                                          aria-label="Delete goal"
                                          onClick={() => handleDeleteEvent(e)}
                                        >
                                          ×
                                        </button>
                                      </span>
                                    )}

                                    {isEditingThisEvent && (
                                      <div className="tk-admin-panel tk-admin-panel-spaced tk-friendly-inline-edit">
                                        <div className="tk-admin-grid">
                                          <div>
                                            <label className="tk-small-label">Scorer</label>
                                            <select
                                              className="tk-small-select"
                                              value={eventDraft.scorer}
                                              onChange={(evt) =>
                                                setEventDraft((prev) => ({
                                                  ...prev,
                                                  scorer: evt.target.value,
                                                }))
                                              }
                                            >
                                              <option value="">Select player</option>
                                              {editPlayers.map((name) => (
                                                <option key={`friendly-edit-scorer-${name}`} value={name}>
                                                  {name}
                                                </option>
                                              ))}
                                            </select>
                                          </div>

                                          <div>
                                            <label className="tk-small-label">Assist</label>
                                            <select
                                              className="tk-small-select"
                                              value={eventDraft.assist || ""}
                                              onChange={(evt) =>
                                                setEventDraft((prev) => ({
                                                  ...prev,
                                                  assist: evt.target.value,
                                                }))
                                              }
                                            >
                                              <option value="">None</option>
                                              {editAssistPlayers.map((name) => (
                                                <option key={`friendly-edit-assist-${name}`} value={name}>
                                                  {name}
                                                </option>
                                              ))}
                                            </select>
                                          </div>

                                          <div>
                                            <label className="tk-small-label">Team</label>
                                            <select
                                              className="tk-small-select"
                                              value={eventDraft.teamId}
                                              onChange={(evt) =>
                                                setEventDraft((prev) => ({
                                                  ...prev,
                                                  teamId: evt.target.value,
                                                }))
                                              }
                                            >
                                              <option value={r.teamAId}>{teamAName}</option>
                                              <option value={r.teamBId}>{teamBName}</option>
                                            </select>
                                          </div>
                                        </div>

                                        <div className="tk-inline-actions">
                                          <button
                                            type="button"
                                            className="tk-edit-btn"
                                            onClick={() => saveEditEvent(e)}
                                          >
                                            Save event
                                          </button>
                                          <button
                                            type="button"
                                            className="secondary-btn"
                                            onClick={cancelEditEvent}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}


                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
          <div className="table-wrapper tk-scroll-table-wrapper tk-match-results-table tk-match-identity-table">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>{showFriendlyStats ? "Friendly Day" : "Match #"}</th>
                  <th>Team A</th>
                  <th>Score</th>
                  <th>Team B</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No matches played yet.
                    </td>
                  </tr>
                )}

                {sortedResults.map((r) => {
                  const teamAName = getTeamName(r.teamAId);
                  const teamBName = getTeamName(r.teamBId);

                  let resultText = "Draw";
                  if (!r.isDraw) {
                    const winnerName = getTeamName(r.winnerId);
                    resultText = `Won by ${winnerName}`;
                  }

                  const mk = matchKeyOf(r);
                  const isExpanded = expandedMatchKey === mk;
                  const isAddingEvent = addingForMatchKey === mk;

                  const events = eventsByMatchKey.get(mk) || [];

                  const scoringEventsOnly = events
                    .filter((e) => {
                      const type = String(e?.type || "")
                        .trim()
                        .toLowerCase();

                      return type === "goal";
                    })
                    .slice()
                    .sort(
                      (a, b) =>
                        Number(a?.timeSeconds || 0) -
                        Number(b?.timeSeconds || 0)
                    );

                  const teamAEvents = scoringEventsOnly.filter(
                    (e) => e.teamId === r.teamAId && e.scorer
                  );

                  const teamBEvents = scoringEventsOnly.filter(
                    (e) => e.teamId === r.teamBId && e.scorer
                  );

                  const mdLabel =
                    isoDateOnly(r?._tkMatchDayLabel) ||
                    isoDateOnly(r?._tkMatchDayId) ||
                    "";

                  const editPlayers = getPlayersForTeam(eventDraft.teamId);
                  const addPlayers = getPlayersForTeam(newEventDraft.teamId);
                  const editAssistPlayers = editPlayers.filter(
                    (name) => name !== eventDraft.scorer
                  );
                  const addAssistPlayers = addPlayers.filter(
                    (name) => name !== newEventDraft.scorer
                  );

                  const eventShortName = (name) => {
                    const canon = resolveCanonicalName(name || "");
                    const preferred =
                      getPreferredStatsDisplayName(canon, resolveShortDisplay(canon)) ||
                      toTitleCase(name || "") ||
                      "Unknown";

                    return firstNameOf(preferred) || preferred;
                  };

                  return (
                    <React.Fragment key={mk}>
                      <tr
                        className={isExpanded ? "match-row expanded" : "match-row"}
                        onClick={() => toggleMatchDetails(mk)}
                      >
                        <td className="tk-match-no-cell">
                          <div className="tk-match-no-inner">
                            <span className="match-toggle-indicator">
                              {isExpanded ? "▾" : "▸"}
                            </span>
                            <span className="tk-match-no-main">
                              {showFriendlyStats ? r._tkFriendlyDayLabel || "Friendly" : r.matchNo}
                            </span>
                          </div>
                          {!showFriendlyStats && matchDayFilter === "ALL" && mdLabel ? (
                            <span className="tk-match-date-mini">
                              {String(mdLabel).slice(5) || mdLabel}
                            </span>
                          ) : null}
                        </td>
                        <td>{teamAName}</td>
                        <td>
                          {r.goalsA} – {r.goalsB}
                        </td>
                        <td>{teamBName}</td>
                        <td>{resultText}</td>
                      </tr>

                      {isExpanded && (
                        <tr className="match-details-row">
                          <td />
                          <td>
                            {scoringEventsOnly.length === 0 ? (
                              <span className="muted">
                                No goal or assist breakdown recorded.
                              </span>
                            ) : teamAEvents.length === 0 ? null : (
                              <div className="team-scorers">
                                {teamAEvents.map((e, i) => {
                                  const actionLabel = formatEventTypeLabel(
                                    e.type,
                                    e.role
                                  );
                                  const isEditingThisEvent = false;

                                  return (
                                    <div key={(e.id || i) + "-a"} className="scorer-line">
                                      {!isEditingThisEvent ? (
                                        <div className="tk-event-line">
                                          <div className="tk-event-line-text tk-expanded-goal-line">
                                            <span className="tk-expanded-scorer">
                                              <span
                                                className="tk-expanded-goal-minute"
                                                aria-label={`Goal at ${formatFootballMinute(e.timeSeconds)}`}
                                              >
                                                {formatFootballMinute(e.timeSeconds)}
                                              </span>
                                              {eventShortName(e.scorer)}
                                            </span>
                                            {e.assist ? (
                                              <span className="tk-expanded-assist">
                                                assist: {eventShortName(e.assist)}
                                              </span>
                                            ) : null}
                                          </div>

                                          {adminEditingToolsActive && (
                                            <div className="tk-mini-admin-actions">
                                              <button
                                                type="button"
                                                className="tk-mini-admin-btn"
                                              title="Edit goal"
                                              aria-label="Edit goal"
                                              onClick={(evt) => {
                                                evt.stopPropagation();
                                                startEditEvent(e);
                                              }}
                                            >
                                              ✎
                                            </button>
                                              <button
                                                type="button"
                                                className="tk-mini-admin-btn danger"
                                              title="Delete goal"
                                              aria-label="Delete goal"
                                              onClick={(evt) => {
                                                evt.stopPropagation();
                                                handleDeleteEvent(e);
                                              }}
                                            >
                                              ×
                                            </button>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div
                                          className="tk-admin-panel"
                                          onClick={(evt) => evt.stopPropagation()}
                                        >
                                          <div className="tk-admin-grid">
                                            <div>
                                              <label className="tk-small-label">
                                                Scorer
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.scorer}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    scorer: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="">Select player</option>
                                                {editPlayers.map((name) => (
                                                  <option
                                                    key={`edit-scorer-a-${name}`}
                                                    value={name}
                                                  >
                                                    {name}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <div>
                                              <label className="tk-small-label">
                                                Assist
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.assist || ""}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    assist: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="">None</option>
                                                {editAssistPlayers.map((name) => (
                                                  <option
                                                    key={`edit-assist-a-${name}`}
                                                    value={name}
                                                  >
                                                    {name}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <div>
                                              <label className="tk-small-label">
                                                Type
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.type}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    type: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="goal">goal</option>
                                              </select>
                                            </div>
                                            <div>
                                              <label className="tk-small-label">
                                                Team
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.teamId}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    teamId: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value={r.teamAId}>{teamAName}</option>
                                                <option value={r.teamBId}>{teamBName}</option>
                                              </select>
                                            </div>
                                          </div>

                                          <div className="tk-inline-actions">
                                            <button
                                              type="button"
                                              className="tk-edit-btn"
                                              onClick={() => saveEditEvent(e)}
                                            >
                                              Save event
                                            </button>
                                            <button
                                              type="button"
                                              className="secondary-btn"
                                              onClick={cancelEditEvent}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td />
                          <td>
                            {scoringEventsOnly.length === 0 ? (
                              <span className="muted">
                                No goal or assist breakdown recorded.
                              </span>
                            ) : teamBEvents.length === 0 ? null : (
                              <div className="team-scorers">
                                {teamBEvents.map((e, i) => {
                                  const actionLabel = formatEventTypeLabel(
                                    e.type,
                                    e.role
                                  );
                                  const isEditingThisEvent = false;

                                  return (
                                    <div key={(e.id || i) + "-b"} className="scorer-line">
                                      {!isEditingThisEvent ? (
                                        <div className="tk-event-line">
                                          <div className="tk-event-line-text tk-expanded-goal-line">
                                            <span className="tk-expanded-scorer">
                                              <span
                                                className="tk-expanded-goal-minute"
                                                aria-label={`Goal at ${formatFootballMinute(e.timeSeconds)}`}
                                              >
                                                {formatFootballMinute(e.timeSeconds)}
                                              </span>
                                              {eventShortName(e.scorer)}
                                            </span>
                                            {e.assist ? (
                                              <span className="tk-expanded-assist">
                                                assist: {eventShortName(e.assist)}
                                              </span>
                                            ) : null}
                                          </div>

                                          {adminEditingToolsActive && (
                                            <div className="tk-mini-admin-actions">
                                              <button
                                                type="button"
                                                className="tk-mini-admin-btn"
                                              title="Edit goal"
                                              aria-label="Edit goal"
                                              onClick={(evt) => {
                                                evt.stopPropagation();
                                                startEditEvent(e);
                                              }}
                                            >
                                              ✎
                                            </button>
                                              <button
                                                type="button"
                                                className="tk-mini-admin-btn danger"
                                              title="Delete goal"
                                              aria-label="Delete goal"
                                              onClick={(evt) => {
                                                evt.stopPropagation();
                                                handleDeleteEvent(e);
                                              }}
                                            >
                                              ×
                                            </button>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div
                                          className="tk-admin-panel"
                                          onClick={(evt) => evt.stopPropagation()}
                                        >
                                          <div className="tk-admin-grid">
                                            <div>
                                              <label className="tk-small-label">
                                                Scorer
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.scorer}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    scorer: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="">Select player</option>
                                                {editPlayers.map((name) => (
                                                  <option
                                                    key={`edit-scorer-b-${name}`}
                                                    value={name}
                                                  >
                                                    {name}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <div>
                                              <label className="tk-small-label">
                                                Assist
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.assist || ""}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    assist: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="">None</option>
                                                {editAssistPlayers.map((name) => (
                                                  <option
                                                    key={`edit-assist-b-${name}`}
                                                    value={name}
                                                  >
                                                    {name}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <div>
                                              <label className="tk-small-label">
                                                Type
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.type}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    type: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="goal">goal</option>
                                              </select>
                                            </div>
                                            <div>
                                              <label className="tk-small-label">
                                                Team
                                              </label>
                                              <select
                                                className="tk-small-select"
                                                value={eventDraft.teamId}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    teamId: evt.target.value,
                                                  }))
                                                }
                                              >
                                                <option value={r.teamAId}>{teamAName}</option>
                                                <option value={r.teamBId}>{teamBName}</option>
                                              </select>
                                            </div>
                                          </div>

                                          <div className="tk-inline-actions">
                                            <button
                                              type="button"
                                              className="tk-edit-btn"
                                              onClick={() => saveEditEvent(e)}
                                            >
                                              Save event
                                            </button>
                                            <button
                                              type="button"
                                              className="secondary-btn"
                                              onClick={cancelEditEvent}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td>
                            {(adminEditingToolsActive || canDeleteFromThisView) && (
                              <div
                                className="tk-match-admin-box"
                                onClick={(evt) => evt.stopPropagation()}
                              >
                                <div className="tk-match-admin-title">
                                  Admin tools
                                </div>

                                <div className="tk-match-admin-row">
                                  {adminEditingToolsActive && typeof onAddSavedEvent === "function" && (
                                    <button
                                      type="button"
                                      className="tk-admin-compact-btn primary"
                                      onClick={() => startAddEvent(r, r.teamAId)}
                                    >
                                      + Goal
                                    </button>
                                  )}

                                  {canDeleteFromThisView && (
                                    <button
                                      type="button"
                                      className="tk-admin-compact-btn danger"
                                      onClick={() => handleDeleteMatch(r)}
                                    >
                                      {showFriendlyStats ? "Delete Match" : "Delete match"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}



      {showDbIntentPrompt && (
        <div
          className="tk-db-modal-backdrop"
          role="presentation"
          onClick={() => setShowDbIntentPrompt(false)}
        >
          <div
            className="tk-db-intent-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Defensive Block correction"
            onClick={(evt) => evt.stopPropagation()}
          >
            <div className="tk-db-intent-icon">🧱</div>

            <div className="tk-db-kicker">
              Friendly admin correction
            </div>

            <h3>Correct Defensive Blocks too?</h3>

            <p>
              Use this only when real substitutions happened on the
              field but were not captured in the app. Existing
              Defensive Blocks can be reassigned between players;
              no new DBs can be created.
            </p>

            <div className="tk-db-intent-actions">
              <button
                type="button"
                className="tk-db-primary-btn"
                onClick={openDbTransferStudio}
              >
                Yes — review DBs
              </button>

              <button
                type="button"
                className="tk-db-secondary-btn"
                onClick={() => setShowDbIntentPrompt(false)}
              >
                No — edit goals only
              </button>
            </div>
          </div>
        </div>
      )}

      {showDbTransferModal && dbCorrectionMatch && (
        <div
          className="tk-db-modal-backdrop"
          role="presentation"
          onClick={requestCloseDbTransferStudio}
        >
          <div
            className="tk-db-transfer-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Defensive Block Transfer Studio"
            onClick={(evt) => evt.stopPropagation()}
          >
            <div className="tk-db-modal-head">
              <div>
                <div className="tk-db-kicker">
                  🧱 Defensive Block correction
                </div>

                <h3>
                  {dbReviewMode
                    ? "Final DB Distribution"
                    : "DB Transfer Studio"}
                </h3>

                <p>
                  {friendlyDateFromRecord(dbCorrectionMatch) ||
                    dbCorrectionMatch?._tkFriendlyDayLabel ||
                    "Friendly match"}
                  {" • "}
                  {getTeamName(dbCorrectionMatch?.teamAId)}
                  {" "}
                  {dbCorrectionMatch?.goalsA ?? 0}
                  {"–"}
                  {dbCorrectionMatch?.goalsB ?? 0}
                  {" "}
                  {getTeamName(dbCorrectionMatch?.teamBId)}
                </p>
              </div>

              <button
                type="button"
                className="tk-db-close-btn"
                onClick={requestCloseDbTransferStudio}
                aria-label="Review and close Defensive Block correction"
              >
                ×
              </button>
            </div>

            {!dbReviewMode ? (
              <>
                <div className="tk-db-rule-banner">
                  <span>🔒</span>
                  <div>
                    <strong>Team total is locked.</strong>
                    <small>
                      Each click transfers exactly one existing
                      5-minute Defensive Block.
                    </small>
                  </div>
                </div>

                <section className="tk-db-section">
                  <div className="tk-db-section-title">
                    <span>1</span>
                    Select team
                  </div>

                  <div className="tk-db-team-switcher">
                    {dbTeamOptions.map((team) => (
                      <button
                        type="button"
                        key={`db-team-${team.id}`}
                        className={
                          String(dbSelectedTeamId) ===
                          String(team.id)
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          setDbSelectedTeamId(team.id);
                          setDbSourcePlayer("");
                          setDbTargetPlayer("");
                        }}
                      >
                        <span>{team.label}</span>
                        <strong>
                          {dbCorrectionEvents.filter(
                            (event) =>
                              String(event?.teamId || "") ===
                              String(team.id)
                          ).length}{" "}
                          DB
                        </strong>
                      </button>
                    ))}
                  </div>
                </section>

                {dbSelectedTeamId ? (
                  <>
                    <section className="tk-db-section">
                      <div className="tk-db-section-title">
                        <span>2</span>
                        Transfer one DB
                      </div>

                      <div className="tk-db-transfer-grid">
                        <div className="tk-db-player-panel source">
                          <div className="tk-db-panel-label">
                            FROM
                            <small>Current holder</small>
                          </div>

                          <div className="tk-db-player-list">
                            {dbWorkingDistribution.map((player) => (
                              <button
                                type="button"
                                key={`db-source-${player.name}`}
                                disabled={player.count <= 0}
                                className={
                                  dbSourcePlayer === player.name
                                    ? "selected"
                                    : ""
                                }
                                onClick={() => {
                                  setDbSourcePlayer(player.name);
                                  setDbTargetPlayer("");
                                }}
                              >
                                <span>{player.displayName}</span>
                                <strong>{player.count}</strong>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="tk-db-transfer-centre">
                          <div className="tk-db-arrow">
                            <span>
                              {dbSourcePlayer
                                ? resolveShortDisplay(dbSourcePlayer)
                                : "Select"}
                            </span>
                            <b>→</b>
                            <span>
                              {dbTargetPlayer
                                ? resolveShortDisplay(dbTargetPlayer)
                                : "Select"}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="tk-db-transfer-one-btn"
                            disabled={
                              !dbSourcePlayer ||
                              !dbTargetPlayer ||
                              dbSourcePlayer === dbTargetPlayer ||
                              getDbWorkingCount(dbSourcePlayer) <= 0
                            }
                            onClick={transferOneDefensiveBlock}
                          >
                            <span>Transfer</span>
                            <strong>1 DB</strong>
                          </button>
                        </div>

                        <div className="tk-db-player-panel target">
                          <div className="tk-db-panel-label">
                            TO
                            <small>Rightful recipient</small>
                          </div>

                          <div className="tk-db-player-list">
                            {dbWorkingDistribution
                              .filter(
                                (player) =>
                                  player.name !== dbSourcePlayer
                              )
                              .map((player) => (
                                <button
                                  type="button"
                                  key={`db-target-${player.name}`}
                                  className={
                                    dbTargetPlayer === player.name
                                      ? "selected"
                                      : ""
                                  }
                                  onClick={() =>
                                    setDbTargetPlayer(player.name)
                                  }
                                >
                                  <span>{player.displayName}</span>
                                  <strong>{player.count}</strong>
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="tk-db-distribution-card">
                      <div className="tk-db-distribution-head">
                        <div>
                          <span>Live team distribution</span>
                          <strong>{dbSelectedTeamLabel}</strong>
                        </div>

                        <div
                          className={
                            dbInvariantSafe
                              ? "tk-db-invariant good"
                              : "tk-db-invariant bad"
                          }
                        >
                          {dbCurrentTotal} / {dbOriginalTotal} DB allocated
                        </div>
                      </div>

                      <div className="tk-db-distribution-grid">
                        {dbWorkingDistribution.map((player) => (
                          <div
                            key={`db-summary-${player.name}`}
                            className="tk-db-distribution-player"
                          >
                            <span>{player.displayName}</span>
                            <strong>{player.count}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="tk-db-total-strip">
                        <div>
                          <small>Original total</small>
                          <strong>{dbOriginalTotal}</strong>
                        </div>

                        <div>
                          <small>Current total</small>
                          <strong>{dbCurrentTotal}</strong>
                        </div>

                        <div>
                          <small>Transfers</small>
                          <strong>{dbTransfers.length}</strong>
                        </div>
                      </div>
                    </section>

                    <div className="tk-db-modal-actions">
                      <button
                        type="button"
                        className="tk-db-secondary-btn"
                        disabled={dbTransfers.length === 0}
                        onClick={undoLastDbTransfer}
                      >
                        ↶ Undo last
                      </button>

                      <button
                        type="button"
                        className="tk-db-secondary-btn"
                        disabled={dbTransfers.length === 0}
                        onClick={resetDbTransfers}
                      >
                        Reset
                      </button>

                      <button
                        type="button"
                        className="tk-db-primary-btn"
                        onClick={() => {
                          if (dbTransfers.length === 0) {
                            requestCloseDbTransferStudio();
                            return;
                          }

                          setDbReviewMode(true);
                        }}
                      >
                        Review final distribution
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="tk-db-empty-state">
                    <div>⚽</div>
                    <strong>Select a team to begin</strong>
                    <span>
                      You will then see every player and the DB
                      allocation currently recorded for that team.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="tk-db-review">
                <div className="tk-db-review-shield">✓</div>

                <h4>Confirm the final distribution</h4>

                <p>
                  Review where every Defensive Block will sit before
                  closing this correction.
                </p>

                <div className="tk-db-review-team">
                  {dbTeamOptions.map((team) => {
                    const originalForTeam = (() => {
                      const counts = new Map();

                      getPlayersForTeam(team.id).forEach((name) => {
                        const canonical = resolveCanonicalName(name);
                        if (canonical && !counts.has(canonical)) {
                          counts.set(canonical, 0);
                        }
                      });

                      dbCorrectionEvents
                        .filter(
                          (event) =>
                            String(event?.teamId || "") ===
                            String(team.id)
                        )
                        .forEach((event) => {
                          const name = resolveCanonicalName(
                            event?.playerName ||
                              event?.scorer ||
                              ""
                          );
                          if (!name) return;
                          counts.set(
                            name,
                            Number(counts.get(name) || 0) + 1
                          );
                        });

                      return counts;
                    })();

                    dbTransfers
                      .filter(
                        (transfer) =>
                          String(transfer.teamId) ===
                          String(team.id)
                      )
                      .forEach((transfer) => {
                        originalForTeam.set(
                          transfer.from,
                          Math.max(
                            0,
                            Number(
                              originalForTeam.get(transfer.from) || 0
                            ) - 1
                          )
                        );
                        originalForTeam.set(
                          transfer.to,
                          Number(
                            originalForTeam.get(transfer.to) || 0
                          ) + 1
                        );
                      });

                    const rows = Array.from(
                      originalForTeam.entries()
                    )
                      .map(([name, count]) => ({
                        name,
                        displayName: resolveShortDisplay(name),
                        count,
                      }))
                      .sort((a, b) => {
                        if (b.count !== a.count) {
                          return b.count - a.count;
                        }
                        return a.displayName.localeCompare(
                          b.displayName
                        );
                      });

                    const total = rows.reduce(
                      (sum, player) =>
                        sum + Number(player.count || 0),
                      0
                    );

                    return (
                      <div
                        className="tk-db-review-team-card"
                        key={`db-review-team-${team.id}`}
                      >
                        <div className="tk-db-review-team-head">
                          <strong>{team.label}</strong>
                          <span>{total} DB total</span>
                        </div>

                        <div className="tk-db-review-roster">
                          {rows.map((player) => (
                            <div
                              key={`db-review-${team.id}-${player.name}`}
                            >
                              <span>{player.displayName}</span>
                              <strong>{player.count}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="tk-db-review-warning">
                  <strong>No Defensive Blocks will be created.</strong>
                  <span>
                    Saving only changes which player owns the existing
                    block events.
                  </span>
                </div>

                <div className="tk-db-modal-actions">
                  <button
                    type="button"
                    className="tk-db-secondary-btn"
                    onClick={() => setDbReviewMode(false)}
                  >
                    ← Keep editing
                  </button>

                  <button
                    type="button"
                    className="tk-db-danger-soft-btn"
                    onClick={resetDbTransfers}
                  >
                    Discard changes
                  </button>

                  <button
                    type="button"
                    className="tk-db-primary-btn"
                    disabled={!dbInvariantSafe}
                    onClick={saveDbRedistributionAndClose}
                  >
                    Save distribution
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editingEventId && editingEventRecord && (
        <div
          className="tk-edit-goal-modal-backdrop"
          role="presentation"
          onClick={cancelEditEvent}
        >
          <div
            className="tk-edit-goal-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit goal"
            onClick={(evt) => evt.stopPropagation()}
          >
            <div className="tk-edit-goal-modal-head">
              <div>
                <div className="tk-edit-goal-kicker">Admin edit</div>
                <h3>Edit goal</h3>
              </div>
              <button
                type="button"
                className="tk-edit-goal-modal-close"
                onClick={cancelEditEvent}
                aria-label="Close edit goal popup"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="tk-edit-goal-modal-grid">
              <div>
                <label className="tk-small-label">Team</label>
                <select
                  className="tk-small-select tk-modal-select"
                  value={eventDraft.teamId}
                  onChange={(evt) =>
                    setEventDraft((prev) => ({
                      ...prev,
                      teamId: evt.target.value,
                    }))
                  }
                >
                  {editModalTeamOptions.map((team) => (
                    <option key={`modal-edit-team-${team.id}`} value={team.id}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="tk-small-label">Scorer</label>
                <select
                  className="tk-small-select tk-modal-select"
                  value={eventDraft.scorer}
                  onChange={(evt) =>
                    setEventDraft((prev) => ({
                      ...prev,
                      scorer: evt.target.value,
                    }))
                  }
                >
                  <option value="">Select player</option>
                  {editModalPlayers.map((name) => (
                    <option key={`modal-edit-scorer-${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="tk-small-label">Assist</label>
                <select
                  className="tk-small-select tk-modal-select"
                  value={eventDraft.assist || ""}
                  onChange={(evt) =>
                    setEventDraft((prev) => ({
                      ...prev,
                      assist: evt.target.value,
                    }))
                  }
                >
                  <option value="">None</option>
                  {editModalAssistPlayers.map((name) => (
                    <option key={`modal-edit-assist-${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tk-edit-goal-modal-actions">
              <button
                type="button"
                className="tk-edit-goal-save-btn"
                onClick={() => saveEditEvent()}
              >
                Save edit
              </button>
              <button
                type="button"
                className="tk-edit-goal-cancel-btn"
                onClick={cancelEditEvent}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {addingForMatchKey && addingMatchRecord && (
        <div
          className="tk-edit-goal-modal-backdrop"
          role="presentation"
          onClick={cancelAddEvent}
        >
          <div
            className="tk-edit-goal-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add goal"
            onClick={(evt) => evt.stopPropagation()}
          >
            <div className="tk-edit-goal-modal-head">
              <div>
                <div className="tk-edit-goal-kicker">Admin add</div>
                <h3>Add goal</h3>
              </div>
              <button
                type="button"
                className="tk-edit-goal-modal-close"
                onClick={cancelAddEvent}
                aria-label="Close add goal popup"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="tk-edit-goal-modal-grid">
              <div>
                <label className="tk-small-label">Team</label>
                <select
                  className="tk-small-select tk-modal-select"
                  value={newEventDraft.teamId}
                  onChange={(evt) =>
                    setNewEventDraft((prev) => ({
                      ...prev,
                      teamId: evt.target.value,
                    }))
                  }
                >
                  {addModalTeamOptions.map((team) => (
                    <option key={`modal-add-team-${team.id}`} value={team.id}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="tk-small-label">Scorer</label>
                <select
                  className="tk-small-select tk-modal-select"
                  value={newEventDraft.scorer}
                  onChange={(evt) =>
                    setNewEventDraft((prev) => ({
                      ...prev,
                      scorer: evt.target.value,
                    }))
                  }
                >
                  <option value="">Select player</option>
                  {addModalPlayers.map((name) => (
                    <option key={`modal-add-scorer-${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="tk-small-label">Assist</label>
                <select
                  className="tk-small-select tk-modal-select"
                  value={newEventDraft.assist || ""}
                  onChange={(evt) =>
                    setNewEventDraft((prev) => ({
                      ...prev,
                      assist: evt.target.value,
                    }))
                  }
                >
                  <option value="">None</option>
                  {addModalAssistPlayers.map((name) => (
                    <option key={`modal-add-assist-${name}`} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tk-edit-goal-modal-actions">
              <button
                type="button"
                className="tk-edit-goal-save-btn"
                onClick={() => saveAddEvent()}
              >
                Save goal
              </button>
              <button
                type="button"
                className="tk-edit-goal-cancel-btn"
                onClick={cancelAddEvent}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {pendingDeleteEvent && (
        <div
          className="tk-edit-goal-modal-backdrop"
          role="presentation"
          onClick={cancelDeleteEvent}
        >
          <div
            className="tk-edit-goal-modal tk-delete-goal-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete goal"
            onClick={(evt) => evt.stopPropagation()}
          >
            <div className="tk-edit-goal-modal-head">
              <div>
                <div className="tk-edit-goal-kicker">Admin delete</div>
                <h3>Delete goal?</h3>
              </div>
              <button
                type="button"
                className="tk-edit-goal-modal-close"
                onClick={cancelDeleteEvent}
                aria-label="Close delete goal popup"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="tk-delete-goal-summary">
              <div className="tk-delete-goal-line">
                <span>Scorer</span>
                <strong>{getPreferredStatsDisplayName(
                  resolveCanonicalName(pendingDeleteEvent?.scorer || pendingDeleteEvent?.playerName || ""),
                  resolveShortDisplay(resolveCanonicalName(pendingDeleteEvent?.scorer || pendingDeleteEvent?.playerName || ""))
                ) || pendingDeleteEvent?.scorer || "Unknown"}</strong>
              </div>

              {pendingDeleteEvent?.assist && (
                <div className="tk-delete-goal-line">
                  <span>Assist</span>
                  <em>{getPreferredStatsDisplayName(
                    resolveCanonicalName(pendingDeleteEvent.assist),
                    resolveShortDisplay(resolveCanonicalName(pendingDeleteEvent.assist))
                  ) || pendingDeleteEvent.assist}</em>
                </div>
              )}

              <div className="tk-delete-goal-line">
                <span>Team</span>
                <strong>{getTeamName(pendingDeleteEvent?.teamId)}</strong>
              </div>
            </div>

            <p className="tk-delete-goal-warning">
              This tool is only for resolving conflicts or contested outcomes.
              Do not use it to doctor official scores.
            </p>

            <div className="tk-edit-goal-modal-actions">
              <button
                type="button"
                className="tk-edit-goal-cancel-btn"
                onClick={cancelDeleteEvent}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tk-delete-goal-confirm-btn"
                onClick={confirmDeleteEvent}
              >
                Delete goal
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`

        .tk-friendly-admin-ethics-banner {
          margin: 0 0 0.9rem;
          padding: 0.72rem 0.88rem;
          border-radius: 18px;
          border: 1px solid rgba(251, 191, 36, 0.42);
          background: linear-gradient(135deg, rgba(69, 26, 3, 0.48), rgba(8, 47, 73, 0.38));
          color: rgba(254, 243, 199, 0.95);
          font-size: 0.82rem;
          line-height: 1.35;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.035), 0 12px 28px rgba(2, 8, 23, 0.28);
        }

        .tk-friendly-admin-ethics-banner strong {
          color: #fde68a;
        }

        @media (max-width: 520px) {
          .tk-friendly-admin-ethics-banner {
            margin: 0.2rem 0 0.85rem;
            padding: 0.68rem 0.78rem;
            font-size: 0.76rem;
          }
        }

        .tk-edit-goal-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(2, 6, 23, 0.62);
          backdrop-filter: blur(8px);
        }

        .tk-edit-goal-modal {
          width: min(92vw, 430px);
          border-radius: 24px;
          padding: 1rem;
          border: 1px solid rgba(125, 211, 252, 0.32);
          background:
            radial-gradient(circle at 20% 0%, rgba(34, 211, 238, 0.16), transparent 35%),
            linear-gradient(180deg, #081B3A 0%, #06142F 58%, #020B1F 100%);
          box-shadow:
            0 24px 60px rgba(0, 0, 0, 0.48),
            inset 0 0 0 1px rgba(255, 255, 255, 0.045);
        }

        .tk-edit-goal-modal-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.8rem;
          margin-bottom: 0.9rem;
        }

        .tk-edit-goal-kicker {
          color: rgba(125, 211, 252, 0.92);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .tk-edit-goal-modal h3 {
          margin: 0.1rem 0 0;
          font-size: 1.25rem;
        }

        .tk-edit-goal-modal-close {
          width: 2rem;
          height: 2rem;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.32);
          background: rgba(15, 23, 42, 0.86);
          color: #e2e8f0;
          cursor: pointer;
          font-size: 1.15rem;
          line-height: 1;
        }

        .tk-edit-goal-modal-grid {
          display: grid;
          gap: 0.75rem;
        }

        .tk-edit-goal-modal .tk-small-label {
          display: block;
          margin-bottom: 0.28rem;
          font-size: 0.78rem;
          font-weight: 900;
          color: rgba(226, 232, 240, 0.86);
        }

        .tk-modal-select {
          width: 100% !important;
          min-height: 2.45rem;
          border-radius: 14px !important;
          background: rgba(15, 23, 42, 0.92) !important;
          color: #e5eefb !important;
          border: 1px solid rgba(125, 211, 252, 0.30) !important;
          padding: 0.5rem 0.65rem !important;
        }

        .tk-edit-goal-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.65rem;
          margin-top: 1rem;
          flex-wrap: wrap;
        }

        .tk-edit-goal-save-btn,
        .tk-edit-goal-cancel-btn {
          border-radius: 999px;
          padding: 0.58rem 0.9rem;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        .tk-edit-goal-save-btn {
          border: 1px solid rgba(125, 211, 252, 0.55);
          background: linear-gradient(135deg, #22c55e, #38bdf8);
          color: #02111f;
          box-shadow: 0 0 18px rgba(56, 189, 248, 0.22);
        }

        .tk-edit-goal-cancel-btn {
          border: 1px solid rgba(148, 163, 184, 0.32);
          background: rgba(15, 23, 42, 0.86);
          color: #e2e8f0;
        }



        .tk-delete-goal-modal {
          border-color: rgba(248, 113, 113, 0.38);
        }

        .tk-delete-goal-summary {
          display: grid;
          gap: 0.62rem;
          margin: 0.2rem 0 0.75rem;
          padding: 0.78rem;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(2, 8, 23, 0.28);
        }

        .tk-delete-goal-line {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.9rem;
          min-width: 0;
        }

        .tk-delete-goal-line span {
          color: rgba(203, 213, 225, 0.70);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          flex-shrink: 0;
        }

        .tk-delete-goal-line strong,
        .tk-delete-goal-line em {
          color: rgba(248, 250, 252, 0.95);
          font-size: 0.86rem;
          text-align: right;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .tk-delete-goal-line em {
          font-size: 0.78rem;
          color: rgba(203, 213, 225, 0.82);
        }

        .tk-delete-goal-warning {
          margin: 0.2rem 0 0.9rem;
          color: rgba(254, 202, 202, 0.90);
          font-size: 0.76rem;
          line-height: 1.35;
        }

        .tk-delete-goal-confirm-btn {
          flex: 1 1 0;
          min-height: 2.35rem;
          border: 1px solid rgba(248, 113, 113, 0.68);
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(127, 29, 29, 0.92), rgba(248, 113, 113, 0.76));
          color: #fff7f7;
          font-weight: 900;
          cursor: pointer;
        }

        @media (max-width: 520px) {
          .tk-edit-goal-modal-backdrop {
            align-items: center;
            justify-content: center;
            padding: 0.85rem;
          }

          .tk-edit-goal-modal {
            width: 100%;
            max-height: calc(100dvh - 7.5rem);
            overflow-y: auto;
            border-radius: 22px;
            transform: translateY(-1.2rem);
          }

          .tk-edit-goal-modal-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
        }
        .tk-friendly-recap-wrap {
          margin-top: 0.85rem;
          overflow: visible;
        }

        .tk-friendly-recap-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.95rem;
        }

        .tk-friendly-recap-item {
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          padding-bottom: 0.85rem;
        }

        .tk-friendly-recap-item:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .news-match-header {
          display: flex;
          justify-content: space-between;
          gap: 0.8rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .news-match-number {
          color: rgba(226, 232, 240, 0.86);
          font-size: 0.92rem;
        }

        .news-match-scoreline {
          display: inline-flex;
          gap: 0.45rem;
          align-items: baseline;
          flex-wrap: wrap;
          justify-content: flex-end;
          font-weight: 800;
        }

        .news-match-scoreline .score {
          font-size: 1.25rem;
          color: #f8fafc;
          white-space: nowrap;
        }

        .news-event-list {
          list-style: none;
          padding: 0;
          margin: 0.55rem 0 0;
          display: grid;
          gap: 0.35rem;
        }

        .news-event-item {
          display: grid;
          grid-template-columns: 3.3rem minmax(0, 1fr);
          gap: 0.45rem;
          align-items: start;
          line-height: 1.45;
        }

        .news-event-time {
          color: rgba(203, 213, 225, 0.78);
          font-variant-numeric: tabular-nums;
        }

        .news-event-text {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        
        .tk-friendly-view-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: nowrap;
          width: 100%;
        }

        .tk-friendly-view-header-row h2{
          margin:0;
          line-height: 1;
        }

.tk-results-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.8rem;
          flex-wrap: wrap;
        }

        .tk-results-header-row h2 {
          margin-bottom: 0;
        }

        .tk-manage-friendly-btn {
          margin: 0;
          animation: tk-dim-admin-pulse 2.8s ease-in-out infinite;
          border: 1px solid rgba(125, 211, 252, 0.7);
          background: linear-gradient(
            135deg,
            rgba(15, 23, 42, 0.9),
            rgba(14, 165, 233, 0.22)
          );
          color: #e0f2fe;
          border-radius: 999px;
          padding: 0.5rem 0.82rem;
          font-weight: 800;
          cursor: pointer;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.05),
            0 0 0 0 rgba(56, 189, 248, 0.0);
          white-space: nowrap;
          line-height: 1;
        }

        .tk-manage-friendly-btn.active {
          animation: none;
          background: linear-gradient(135deg, #22c55e, #38bdf8);
          color: #02111f;
          box-shadow: 0 0 18px rgba(56, 189, 248, 0.35);
        }

        .tk-friendly-event-actions {
          margin-left: 0.55rem;
        }

        .tk-friendly-event-editing {
          align-items: start;
        }

        .tk-friendly-inline-edit {
          margin-top: 0.5rem;
        }

        .tk-friendly-manage-panel {
          margin: 0.85rem 0 1rem;
          padding: 0.85rem;
          border: 1px solid rgba(56, 189, 248, 0.22);
          border-radius: 16px;
          background: rgba(2, 25, 40, 0.35);
        }

        .tk-friendly-manage-title {
          font-weight: 900;
          margin-bottom: 0.55rem;
          color: rgba(226, 232, 240, 0.92);
        }

        .tk-friendly-manage-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        @keyframes tk-dim-admin-pulse {
          0%, 100% {
            border-color: rgba(125, 211, 252, 0.55);
            background: linear-gradient(
              135deg,
              rgba(15, 23, 42, 0.9),
              rgba(14, 165, 233, 0.18)
            );
            box-shadow:
              inset 0 0 0 1px rgba(255, 255, 255, 0.04),
              0 0 0 0 rgba(56, 189, 248, 0.0);
            filter: brightness(1);
          }
          50% {
            border-color: rgba(186, 230, 253, 0.98);
            background: linear-gradient(
              135deg,
              rgba(8, 47, 73, 0.95),
              rgba(56, 189, 248, 0.38)
            );
            box-shadow:
              inset 0 0 16px rgba(56, 189, 248, 0.20),
              0 0 10px rgba(56, 189, 248, 0.18);
            filter: brightness(1.04);
          }
        }

        @media (max-width: 520px) {
          .tk-friendly-view-header-row{
            gap:0.75rem;
          }

          .tk-manage-friendly-btn{
            padding: 0.45rem 0.7rem;
            font-size: 0.82rem;
          }


          .tk-results-header-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .tk-manage-friendly-btn {
            align-self: flex-end;
          }

          .tk-friendly-manage-actions {
            justify-content: stretch;
          }

          .tk-friendly-manage-actions button {
            flex: 1 1 auto;
          }
        }


        /* TurfKings dark navy table skin — matches Friendly Live Match page */
        .stats-page .table-wrapper {
          border-radius: 18px;
          overflow: hidden;
          background: linear-gradient(
            180deg,
            #081B3A 0%,
            #06142F 55%,
            #020B1F 100%
          );
          box-shadow:
            inset 0 0 0 1px rgba(96, 165, 250, 0.14),
            0 8px 28px rgba(2, 12, 27, 0.45);
        }

        .stats-page .stats-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
          border-radius: 18px;
          background: linear-gradient(
            180deg,
            #081B3A 0%,
            #06142F 55%,
            #020B1F 100%
          );
          box-shadow:
            inset 0 0 0 1px rgba(96, 165, 250, 0.14),
            0 8px 28px rgba(2, 12, 27, 0.45);
        }

        .stats-page .stats-table thead th {
          background: linear-gradient(
            180deg,
            rgba(17, 65, 120, 0.92),
            rgba(10, 34, 72, 0.96)
          );
          color: #EAF4FF;
          font-weight: 900;
          border-bottom: 1px solid rgba(125, 211, 252, 0.2);
        }

        .stats-page .stats-table tbody tr {
          background: transparent;
          transition: background 0.18s ease;
        }

        .stats-page .stats-table tbody tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.018);
        }

        .stats-page .stats-table tbody tr:hover {
          background: rgba(56, 189, 248, 0.08);
        }

        .stats-page .stats-table td {
          color: #E2E8F0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }

        .stats-page .stats-table tbody tr:last-child td {
          border-bottom: none;
        }

        .stats-page .match-details-row td {
          background: rgba(2, 11, 31, 0.74);
        }

        .stats-page .match-row.expanded td,
        .stats-page .match-row:hover td {
          background: rgba(56, 189, 248, 0.08);
        }

        /* Make each goal in the friendly current-week recap easier to scan */
        .stats-page .news-event-item {
          padding-bottom: 0.7rem;
          margin-bottom: 0.7rem;
          border-bottom: 1px solid rgba(94, 234, 212, 0.18);
        }

        .stats-page .news-event-item:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .stats-page .news-event-time {
          color: rgba(186, 230, 253, 0.86);
          font-weight: 800;
        }


        /* TurfKings dark navy card skin for StatsPage sections.
           This targets the green outer cards, including the friendly recap card. */
        .stats-page > .card {
          background: linear-gradient(
            180deg,
            #081B3A 0%,
            #06142F 55%,
            #020B1F 100%
          ) !important;
          border: 1px solid rgba(96, 165, 250, 0.22) !important;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.035),
            0 12px 30px rgba(2, 12, 27, 0.48) !important;
        }

        .stats-page .tk-friendly-recap-wrap,
        .stats-page .tk-friendly-recap-list,
        .stats-page .tk-friendly-recap-item,
        .stats-page .news-match-item {
          background: transparent !important;
        }

        .stats-page .tk-friendly-recap-item {
          border-bottom: 1px solid rgba(96, 165, 250, 0.18) !important;
        }

        .stats-page .tk-friendly-recap-item:last-child {
          border-bottom: 0 !important;
        }

        .stats-page .news-match-scoreline .score {
          color: #f8fafc !important;
        }

        .stats-page .news-match-number,
        .stats-page .muted {
          color: rgba(203, 213, 225, 0.82);
        }

        .stats-page .news-event-item {
          padding-bottom: 0.7rem;
          margin-bottom: 0.7rem;
          border-bottom: 1px solid rgba(125, 211, 252, 0.16) !important;
        }

        .stats-page .news-event-item:last-child {
          border-bottom: none !important;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .stats-page .news-event-time {
          color: rgba(186, 230, 253, 0.9) !important;
          font-weight: 900;
        }


        /* Premium compact scroll tables with reliable frozen identity columns.
           This version avoids fake stretching: columns keep natural sports-table widths,
           while identity columns remain locked during horizontal scroll. */
        .stats-page .table-wrapper {
          max-width: 100%;
          border-radius: 18px;
          overflow-x: auto !important;
          overflow-y: visible !important;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
          position: relative;
          isolation: isolate;
          background: linear-gradient(
            180deg,
            #081B3A 0%,
            #06142F 55%,
            #020B1F 100%
          );
        }

        .stats-page .table-wrapper::after {
          content: "";
          position: sticky;
          right: 0;
          top: 0;
          float: right;
          width: 14px;
          height: 1px;
          pointer-events: none;
          box-shadow: -12px 0 18px rgba(2, 8, 23, 0.72);
          z-index: 12;
        }

        .stats-page .stats-table {
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          table-layout: fixed !important;
          border-collapse: separate !important;
          border-spacing: 0 !important;
          border-radius: 18px;
          overflow: visible !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        .stats-page .stats-table th,
        .stats-page .stats-table td {
          padding: 0.42rem 0.32rem !important;
          white-space: nowrap !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
          vertical-align: middle;
          line-height: 1.18;
          text-align: center;
          box-sizing: border-box;
        }

        .stats-page .stats-table th {
          font-size: 0.70rem;
          letter-spacing: 0;
        }

        .stats-page .stats-table td {
          font-size: 0.76rem;
        }

        .stats-page .tk-scroll-table-wrapper .stats-table th:first-child,
        .stats-page .tk-scroll-table-wrapper .stats-table td:first-child {
          min-width: 1.55rem !important;
          width: 1.55rem !important;
          max-width: 1.55rem !important;
          padding-left: 0.08rem !important;
          padding-right: 0.08rem !important;
          text-align: center !important;
        }

        .stats-page .tk-player-identity-table .stats-table th:nth-child(2),
        .stats-page .tk-player-identity-table .stats-table td:nth-child(2),
        .stats-page .tk-team-identity-table .stats-table th:nth-child(2),
        .stats-page .tk-team-identity-table .stats-table td:nth-child(2) {
          min-width: 5.95rem !important;
          width: 5.95rem !important;
          max-width: 5.95rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-player-identity-table .stats-table th:nth-child(3),
        .stats-page .tk-player-identity-table .stats-table td:nth-child(3) {
          min-width: 4.35rem !important;
          width: 4.35rem !important;
          max-width: 4.35rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-team-identity-table .stats-table th:nth-child(n+3),
        .stats-page .tk-team-identity-table .stats-table td:nth-child(n+3) {
          min-width: 2.55rem !important;
          width: 2.55rem !important;
          max-width: 2.55rem !important;
        }

        .stats-page .tk-player-identity-table .stats-table th:nth-child(n+4),
        .stats-page .tk-player-identity-table .stats-table td:nth-child(n+4) {
          min-width: 3.15rem !important;
          width: 3.15rem !important;
          max-width: 3.15rem !important;
        }

        .stats-page .tk-player-identity-table .stats-table th:nth-child(6),
        .stats-page .tk-player-identity-table .stats-table td:nth-child(6) {
          min-width: 2.45rem !important;
          width: 2.45rem !important;
          max-width: 2.45rem !important;
        }

        .stats-page .tk-player-identity-table .stats-table th:nth-child(7),
        .stats-page .tk-player-identity-table .stats-table td:nth-child(7) {
          min-width: 3.8rem !important;
          width: 3.8rem !important;
          max-width: 3.8rem !important;
        }



        /* Top Scorers + Playmakers: 4-column tables should fill the card,
           not leave a blank empty runway on the right. Keep the same premium
           sticky identity feel, but relax the Player column to use leftover space. */
        .stats-page .tk-player-small-table .stats-table {
          width: 100% !important;
          min-width: 100% !important;
          table-layout: fixed !important;
        }

        .stats-page .tk-player-small-table .stats-table th:first-child,
        .stats-page .tk-player-small-table .stats-table td:first-child {
          min-width: 1.55rem !important;
          width: 1.55rem !important;
          max-width: 1.55rem !important;
        }

        .stats-page .tk-player-small-table .stats-table th:nth-child(2),
        .stats-page .tk-player-small-table .stats-table td:nth-child(2) {
          min-width: 0 !important;
          width: auto !important;
          max-width: none !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-player-small-table .stats-table th:nth-child(3),
        .stats-page .tk-player-small-table .stats-table td:nth-child(3) {
          min-width: 5.1rem !important;
          width: 5.1rem !important;
          max-width: 5.1rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-player-small-table .stats-table th:nth-child(4),
        .stats-page .tk-player-small-table .stats-table td:nth-child(4) {
          min-width: 3.25rem !important;
          width: 3.25rem !important;
          max-width: 3.25rem !important;
          text-align: center !important;
          font-weight: 900;
        }

        /* Summary Player Stats: compact content-driven layout.
           This keeps desktop premium without fake-stretched gaps, while mobile
           can scroll just enough for full team names such as "Farmers Fc". */
        .stats-page .tk-player-summary-table .stats-table {
          width: max-content !important;
          min-width: 0 !important;
          table-layout: fixed !important;
        }

        .stats-page .tk-player-summary-table .stats-table th:first-child,
        .stats-page .tk-player-summary-table .stats-table td:first-child {
          min-width: 1.55rem !important;
          width: 1.55rem !important;
          max-width: 1.55rem !important;
        }

        .stats-page .tk-player-summary-table .stats-table th:nth-child(2),
        .stats-page .tk-player-summary-table .stats-table td:nth-child(2) {
          min-width: 5.95rem !important;
          width: 5.95rem !important;
          max-width: 5.95rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-player-summary-table .stats-table th:nth-child(3),
        .stats-page .tk-player-summary-table .stats-table td:nth-child(3) {
          min-width: 5.55rem !important;
          width: 5.55rem !important;
          max-width: 5.55rem !important;
          text-align: left !important;
          overflow: visible !important;
          text-overflow: clip !important;
        }

        .stats-page .tk-player-summary-table .stats-table th:nth-child(4),
        .stats-page .tk-player-summary-table .stats-table td:nth-child(4),
        .stats-page .tk-player-summary-table .stats-table th:nth-child(5),
        .stats-page .tk-player-summary-table .stats-table td:nth-child(5) {
          min-width: 3.1rem !important;
          width: 3.1rem !important;
          max-width: 3.1rem !important;
          text-align: center !important;
        }

        .stats-page .tk-player-summary-table .stats-table th:nth-child(6),
        .stats-page .tk-player-summary-table .stats-table td:nth-child(6) {
          min-width: 2.25rem !important;
          width: 2.25rem !important;
          max-width: 2.25rem !important;
          text-align: center !important;
        }

        .stats-page .tk-player-summary-table .stats-table th:nth-child(7),
        .stats-page .tk-player-summary-table .stats-table td:nth-child(7) {
          min-width: 3.45rem !important;
          width: 3.45rem !important;
          max-width: 3.45rem !important;
          text-align: center !important;
        }



        /* Desktop/tablet: Summary Player Stats should fill the card neatly.
           Mobile keeps the compact scroll widths below. */
        @media (min-width: 769px) {
          .stats-page .tk-player-summary-table .stats-table {
            width: 100% !important;
            min-width: 100% !important;
            table-layout: fixed !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:first-child,
          .stats-page .tk-player-summary-table .stats-table td:first-child {
            width: 3.5% !important;
            min-width: 0 !important;
            max-width: none !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(2),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(2) {
            width: 24% !important;
            min-width: 0 !important;
            max-width: none !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(3),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(3) {
            width: 24% !important;
            min-width: 0 !important;
            max-width: none !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(4),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(4),
          .stats-page .tk-player-summary-table .stats-table th:nth-child(5),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(5),
          .stats-page .tk-player-summary-table .stats-table th:nth-child(7),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(7) {
            width: 14% !important;
            min-width: 0 !important;
            max-width: none !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(6),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(6) {
            width: 6.5% !important;
            min-width: 0 !important;
            max-width: none !important;
          }
        }

        /* Premium compact Match Results table. */
        .stats-page .tk-match-results-table .stats-table {
          table-layout: fixed !important;
          width: 100% !important;
          min-width: 27rem !important;
        }

        .stats-page .tk-match-results-table .stats-table th,
        .stats-page .tk-match-results-table .stats-table td {
          padding: 0.44rem 0.34rem !important;
        }

        .stats-page .tk-match-results-table .stats-table th:first-child,
        .stats-page .tk-match-results-table .stats-table td:first-child {
          min-width: 3.15rem !important;
          width: 3.15rem !important;
          max-width: 3.15rem !important;
          text-align: center !important;
          white-space: nowrap !important;
          overflow: hidden !important;
        }

        .stats-page .tk-match-results-table .stats-table th:nth-child(2),
        .stats-page .tk-match-results-table .stats-table td:nth-child(2),
        .stats-page .tk-match-results-table .stats-table th:nth-child(4),
        .stats-page .tk-match-results-table .stats-table td:nth-child(4) {
          min-width: 4.9rem !important;
          width: 4.9rem !important;
          max-width: 4.9rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-match-results-table .stats-table th:nth-child(3),
        .stats-page .tk-match-results-table .stats-table td:nth-child(3) {
          min-width: 3.25rem !important;
          width: 3.25rem !important;
          max-width: 3.25rem !important;
          text-align: center !important;
          font-weight: 900;
        }

        .stats-page .tk-match-results-table .stats-table th:nth-child(5),
        .stats-page .tk-match-results-table .stats-table td:nth-child(5) {
          min-width: 5.9rem !important;
          width: 5.9rem !important;
          max-width: 5.9rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-match-no-cell {
          vertical-align: middle !important;
        }

        .stats-page .tk-match-no-inner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.16rem;
          width: 100%;
          line-height: 1;
        }

        .stats-page .tk-match-no-main {
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }

        .stats-page .tk-match-date-mini {
          display: block;
          margin-top: 0.14rem;
          font-size: 0.58rem;
          line-height: 1;
          opacity: 0.62;
          letter-spacing: -0.02em;
        }

        .stats-page .tk-player-identity-table .stats-table th:first-child,
        .stats-page .tk-player-identity-table .stats-table td:first-child,
        .stats-page .tk-team-identity-table .stats-table th:first-child,
        .stats-page .tk-team-identity-table .stats-table td:first-child {
          position: sticky !important;
          left: 0 !important;
          z-index: 30 !important;
          background: #071833 !important;
          background-clip: padding-box !important;
          box-shadow: 1px 0 0 rgba(125, 211, 252, 0.12);
        }

        .stats-page .tk-player-identity-table .stats-table th:nth-child(2),
        .stats-page .tk-player-identity-table .stats-table td:nth-child(2),
        .stats-page .tk-team-identity-table .stats-table th:nth-child(2),
        .stats-page .tk-team-identity-table .stats-table td:nth-child(2) {
          position: sticky !important;
          left: 1.55rem !important;
          z-index: 29 !important;
          background: #071833 !important;
          background-clip: padding-box !important;
          box-shadow: 7px 0 11px rgba(2, 8, 23, 0.46);
        }

        .stats-page .tk-match-identity-table .stats-table th:first-child,
        .stats-page .tk-match-identity-table .stats-table td:first-child {
          position: sticky !important;
          left: 0 !important;
          z-index: 30 !important;
          background: #071833 !important;
          background-clip: padding-box !important;
          box-shadow: 7px 0 11px rgba(2, 8, 23, 0.46);
        }

        .stats-page .tk-player-identity-table .stats-table thead th:first-child,
        .stats-page .tk-player-identity-table .stats-table thead th:nth-child(2),
        .stats-page .tk-team-identity-table .stats-table thead th:first-child,
        .stats-page .tk-team-identity-table .stats-table thead th:nth-child(2),
        .stats-page .tk-match-identity-table .stats-table thead th:first-child {
          z-index: 40 !important;
          background: linear-gradient(
            180deg,
            rgba(17, 65, 120, 1),
            rgba(10, 34, 72, 1)
          ) !important;
        }

        .stats-page .tk-player-identity-table .stats-table tbody tr:nth-child(even) td:first-child,
        .stats-page .tk-player-identity-table .stats-table tbody tr:nth-child(even) td:nth-child(2),
        .stats-page .tk-team-identity-table .stats-table tbody tr:nth-child(even) td:first-child,
        .stats-page .tk-team-identity-table .stats-table tbody tr:nth-child(even) td:nth-child(2),
        .stats-page .tk-match-identity-table .stats-table tbody tr:nth-child(even) td:first-child {
          background: #08203f !important;
        }

        @media (max-width: 520px) {
          .stats-page .card {
            padding-left: 0.68rem;
            padding-right: 0.68rem;
          }

          .stats-page .stats-table th,
          .stats-page .stats-table td {
            padding: 0.38rem 0.24rem !important;
          }

          .stats-page .stats-table th {
            font-size: 0.66rem;
          }

          .stats-page .stats-table td {
            font-size: 0.70rem;
          }

          .stats-page .tk-scroll-table-wrapper .stats-table th:first-child,
          .stats-page .tk-scroll-table-wrapper .stats-table td:first-child {
            min-width: 1.36rem !important;
            width: 1.36rem !important;
            max-width: 1.36rem !important;
          }

          .stats-page .tk-player-identity-table .stats-table th:nth-child(2),
          .stats-page .tk-player-identity-table .stats-table td:nth-child(2),
          .stats-page .tk-team-identity-table .stats-table th:nth-child(2),
          .stats-page .tk-team-identity-table .stats-table td:nth-child(2) {
            left: 1.36rem !important;
            min-width: 5.35rem !important;
            width: 5.35rem !important;
            max-width: 5.35rem !important;
          }

          .stats-page .tk-player-identity-table .stats-table th:nth-child(3),
          .stats-page .tk-player-identity-table .stats-table td:nth-child(3) {
            min-width: 4rem !important;
            width: 4rem !important;
            max-width: 4rem !important;
          }

          .stats-page .tk-team-identity-table .stats-table th:nth-child(n+3),
          .stats-page .tk-team-identity-table .stats-table td:nth-child(n+3) {
            min-width: 2.35rem !important;
            width: 2.35rem !important;
            max-width: 2.35rem !important;
          }

          .stats-page .tk-player-identity-table .stats-table th:nth-child(n+4),
          .stats-page .tk-player-identity-table .stats-table td:nth-child(n+4) {
            min-width: 2.85rem !important;
            width: 2.85rem !important;
            max-width: 2.85rem !important;
          }

          .stats-page .tk-player-identity-table .stats-table th:nth-child(6),
          .stats-page .tk-player-identity-table .stats-table td:nth-child(6) {
            min-width: 2.2rem !important;
            width: 2.2rem !important;
            max-width: 2.2rem !important;
          }

          .stats-page .tk-player-identity-table .stats-table th:nth-child(7),
          .stats-page .tk-player-identity-table .stats-table td:nth-child(7) {
            min-width: 3.45rem !important;
            width: 3.45rem !important;
            max-width: 3.45rem !important;
          }


          .stats-page .tk-player-small-table .stats-table {
            width: 100% !important;
            min-width: 100% !important;
            table-layout: fixed !important;
          }

          .stats-page .tk-player-small-table .stats-table th:first-child,
          .stats-page .tk-player-small-table .stats-table td:first-child {
            min-width: 1.36rem !important;
            width: 1.36rem !important;
            max-width: 1.36rem !important;
          }

          .stats-page .tk-player-small-table .stats-table th:nth-child(2),
          .stats-page .tk-player-small-table .stats-table td:nth-child(2) {
            left: 1.36rem !important;
            min-width: 0 !important;
            width: auto !important;
            max-width: none !important;
          }

          .stats-page .tk-player-small-table .stats-table th:nth-child(3),
          .stats-page .tk-player-small-table .stats-table td:nth-child(3) {
            min-width: 4.75rem !important;
            width: 4.75rem !important;
            max-width: 4.75rem !important;
          }

          .stats-page .tk-player-small-table .stats-table th:nth-child(4),
          .stats-page .tk-player-small-table .stats-table td:nth-child(4) {
            min-width: 3rem !important;
            width: 3rem !important;
            max-width: 3rem !important;
          }
        }

          .stats-page .tk-player-summary-table .stats-table {
            width: max-content !important;
            min-width: 0 !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:first-child,
          .stats-page .tk-player-summary-table .stats-table td:first-child {
            min-width: 1.36rem !important;
            width: 1.36rem !important;
            max-width: 1.36rem !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(2),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(2) {
            left: 1.36rem !important;
            min-width: 5.35rem !important;
            width: 5.35rem !important;
            max-width: 5.35rem !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(3),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(3) {
            min-width: 5.55rem !important;
            width: 5.55rem !important;
            max-width: 5.55rem !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(4),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(4),
          .stats-page .tk-player-summary-table .stats-table th:nth-child(5),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(5) {
            min-width: 2.75rem !important;
            width: 2.75rem !important;
            max-width: 2.75rem !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(6),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(6) {
            min-width: 2rem !important;
            width: 2rem !important;
            max-width: 2rem !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(7),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(7) {
            min-width: 3.25rem !important;
            width: 3.25rem !important;
            max-width: 3.25rem !important;
          }

        @media (max-width: 380px) {
          .stats-page .card {
            padding-left: 0.56rem;
            padding-right: 0.56rem;
          }

          .stats-page .stats-table th,
          .stats-page .stats-table td {
            padding: 0.34rem 0.2rem !important;
          }

          .stats-page .stats-table th {
            font-size: 0.62rem;
          }

          .stats-page .stats-table td {
            font-size: 0.66rem;
          }
        }




        /* Final tuned override: Match Results table only. */
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table {
          table-layout: fixed !important;
          width: 100% !important;
          min-width: 24.25rem !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th,
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td {
          padding: 0.38rem 0.32rem !important;
          white-space: nowrap !important;
          text-align: center !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:first-child,
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:first-child {
          min-width: 3.75rem !important;
          width: 3.75rem !important;
          max-width: 3.75rem !important;
          text-align: left !important;
          padding-left: 0.36rem !important;
          padding-right: 0.2rem !important;
          white-space: nowrap !important;
          overflow: hidden !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(2),
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(2),
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(4),
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(4) {
          min-width: 4.15rem !important;
          width: 4.15rem !important;
          max-width: 4.15rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(3),
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(3) {
          min-width: 3.15rem !important;
          width: 3.15rem !important;
          max-width: 3.15rem !important;
          text-align: center !important;
          font-weight: 900 !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(5),
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(5) {
          min-width: 6.7rem !important;
          width: 6.7rem !important;
          max-width: 6.7rem !important;
          text-align: left !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .tk-match-no-inner {
          justify-content: flex-start !important;
          gap: 0.18rem !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .tk-match-date-mini {
          margin-left: 1.06rem !important;
        }

        @media (max-width: 520px) {
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table {
            min-width: 23.65rem !important;
          }

          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th,
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td {
            padding: 0.36rem 0.28rem !important;
          }

          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:first-child,
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:first-child {
            min-width: 3.68rem !important;
            width: 3.68rem !important;
            max-width: 3.68rem !important;
          }

          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(2),
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(2),
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(4),
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(4) {
            min-width: 4rem !important;
            width: 4rem !important;
            max-width: 4rem !important;
          }

          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(3),
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(3) {
            min-width: 3.05rem !important;
            width: 3.05rem !important;
            max-width: 3.05rem !important;
          }

          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:nth-child(5),
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:nth-child(5) {
            min-width: 6.55rem !important;
            width: 6.55rem !important;
            max-width: 6.55rem !important;
          }
        }


        /* Final polish: Top Scorers + Playmakers must use balanced equal columns.
           Keep # compact, then give Player / Team / Goals-Assists equal breathing room. */
        .stats-page .tk-player-small-table .stats-table {
          width: 100% !important;
          min-width: 100% !important;
          table-layout: fixed !important;
        }

        .stats-page .tk-player-small-table .stats-table th:first-child,
        .stats-page .tk-player-small-table .stats-table td:first-child {
          min-width: 1.45rem !important;
          width: 1.45rem !important;
          max-width: 1.45rem !important;
          padding-left: 0.1rem !important;
          padding-right: 0.1rem !important;
          text-align: center !important;
        }

        .stats-page .tk-player-small-table .stats-table th:nth-child(2),
        .stats-page .tk-player-small-table .stats-table td:nth-child(2),
        .stats-page .tk-player-small-table .stats-table th:nth-child(3),
        .stats-page .tk-player-small-table .stats-table td:nth-child(3),
        .stats-page .tk-player-small-table .stats-table th:nth-child(4),
        .stats-page .tk-player-small-table .stats-table td:nth-child(4) {
          min-width: 0 !important;
          width: calc((100% - 1.45rem) / 3) !important;
          max-width: none !important;
          padding-left: 0.32rem !important;
          padding-right: 0.32rem !important;
          overflow: hidden !important;
          text-overflow: clip !important;
        }

        .stats-page .tk-player-small-table .stats-table th:nth-child(2),
        .stats-page .tk-player-small-table .stats-table td:nth-child(2) {
          left: 1.45rem !important;
          text-align: left !important;
        }

        .stats-page .tk-player-small-table .stats-table th:nth-child(3),
        .stats-page .tk-player-small-table .stats-table td:nth-child(3) {
          text-align: left !important;
        }

        .stats-page .tk-player-small-table .stats-table th:nth-child(4),
        .stats-page .tk-player-small-table .stats-table td:nth-child(4) {
          text-align: center !important;
          font-weight: 900 !important;
        }

        /* Match Results expanded rows: stacked scorer/assist blocks for mobile readability. */
        .stats-page .match-details-row td {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: unset !important;
          vertical-align: top;
        }

        .stats-page .match-details-row .team-scorers {
          display: grid;
          gap: 0.42rem;
          min-width: 0;
          max-width: 100%;
        }

        .stats-page .match-details-row .scorer-line {
          min-width: 0;
          max-width: 100%;
        }

        .stats-page .match-details-row .tk-event-line {
          display: block;
          min-width: 0;
          max-width: 100%;
        }

        .stats-page .tk-expanded-goal-line {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.08rem;
          min-width: 0;
          max-width: 100%;
          line-height: 1.16;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: unset !important;
        }

        .stats-page .tk-expanded-scorer {
          display: block;
          min-width: 0;
          max-width: 100%;
          font-weight: 400;
          font-size: 0.70rem;
          color: rgba(226, 232, 240, 0.94);
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: unset !important;
          overflow-wrap: anywhere;
        }

        .stats-page .tk-expanded-assist {
          display: block;
          min-width: 0;
          max-width: 100%;
          font-style: italic;
          font-weight: 400;
          font-size: 0.61rem;
          color: rgba(203, 213, 225, 0.72);
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: unset !important;
          overflow-wrap: anywhere;
        }


        /* Perfect Table 1 refinement: friendly match dropdown admin tools + first-column breathing room. */
        .stats-page .tk-match-admin-box {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          padding: 0.38rem 0.32rem;
          border-radius: 12px;
          background: rgba(2, 8, 23, 0.28);
          overflow: hidden;
        }

        .stats-page .tk-match-admin-title {
          font-size: 0.68rem;
          line-height: 1.05;
          letter-spacing: 0.06em;
          white-space: normal;
          overflow-wrap: anywhere;
          margin-bottom: 0.34rem;
        }

        .stats-page .tk-match-admin-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.35rem;
          align-items: stretch;
        }

        .stats-page .tk-match-admin-row .tk-edit-btn,
        .stats-page .tk-match-admin-row .tk-danger-btn {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          padding: 0.38rem 0.42rem;
          font-size: 0.68rem;
          line-height: 1.05;
          white-space: nowrap;
          text-align: center;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table {
          min-width: 24.95rem !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:first-child,
        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:first-child {
          min-width: 4.25rem !important;
          width: 4.25rem !important;
          max-width: 4.25rem !important;
          padding-left: 0.44rem !important;
          padding-right: 0.42rem !important;
        }

        .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:first-child {
          letter-spacing: -0.01em;
        }

        @media (max-width: 520px) {
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table {
            min-width: 24.65rem !important;
          }

          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table th:first-child,
          .stats-page .tk-scroll-table-wrapper.tk-match-results-table .stats-table td:first-child {
            min-width: 4.15rem !important;
            width: 4.15rem !important;
            max-width: 4.15rem !important;
          }
        }


        /* FINAL desktop/tablet correction for Summary Player Stats.
           Keep the mobile-friendly compact scrolling rules below 768px,
           but fill the desktop card instead of leaving empty space. */
        @media (min-width: 769px) {
          .stats-page .tk-player-summary-table {
            overflow-x: hidden !important;
          }

          .stats-page .tk-player-summary-table .stats-table {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
          }

          .stats-page .tk-player-summary-table .stats-table th,
          .stats-page .tk-player-summary-table .stats-table td {
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:first-child,
          .stats-page .tk-player-summary-table .stats-table td:first-child {
            width: 4% !important;
            min-width: 0 !important;
            max-width: none !important;
            text-align: center !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(2),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(2) {
            width: 24% !important;
            min-width: 0 !important;
            max-width: none !important;
            text-align: left !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(3),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(3) {
            width: 24% !important;
            min-width: 0 !important;
            max-width: none !important;
            text-align: left !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(4),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(4),
          .stats-page .tk-player-summary-table .stats-table th:nth-child(5),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(5) {
            width: 12% !important;
            min-width: 0 !important;
            max-width: none !important;
            text-align: center !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(6),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(6) {
            width: 7% !important;
            min-width: 0 !important;
            max-width: none !important;
            text-align: center !important;
          }

          .stats-page .tk-player-summary-table .stats-table th:nth-child(7),
          .stats-page .tk-player-summary-table .stats-table td:nth-child(7) {
            width: 17% !important;
            min-width: 0 !important;
            max-width: none !important;
            text-align: center !important;
          }
        }


        /*
         * Defensive Blocks / Clean Sheets — desktop full-canvas correction.
         *
         * The generic Stats table system above intentionally uses width:auto
         * for compact scrolling tables. Summary Player Stats already overrides
         * that behaviour on desktop; this table now does the same.
         *
         * IMPORTANT: desktop only. The approved mobile layout is untouched.
         */
        @media (min-width: 769px) {
          .stats-page .tk-defensive-stats-table-wrap {
            display: block !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
          }

          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table.tk-defensive-stats-table {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
          }

          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table.tk-defensive-stats-table
            th,
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table.tk-defensive-stats-table
            td {
            min-width: 0 !important;
            max-width: none !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          /* # */
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            th:nth-child(1),
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            td:nth-child(1) {
            width: 4% !important;
            text-align: center !important;
          }

          /* Player */
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            th:nth-child(2),
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            td:nth-child(2) {
            width: 24% !important;
            text-align: left !important;
          }

          /* Team */
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            th:nth-child(3),
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            td:nth-child(3) {
            width: 22% !important;
            text-align: left !important;
          }

          /* GK 5-min DB / Saves CS */
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            th:nth-child(4),
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            td:nth-child(4) {
            width: 16% !important;
            text-align: center !important;
          }

          /* DEF 5-min DB / Defense CS */
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            th:nth-child(5),
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            td:nth-child(5) {
            width: 16% !important;
            text-align: center !important;
          }

          /* Total */
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            th:nth-child(6),
          .stats-page
            .tk-defensive-stats-table-wrap
            .stats-table
            td:nth-child(6) {
            width: 18% !important;
            text-align: center !important;
          }
        }


        /* Compact admin tools for Perfect Table 1 expanded rows.
           Keeps table layout untouched while preventing admin controls from clipping. */
        .stats-page .tk-mini-admin-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.7rem;
          margin-top: 0.35rem;
          flex-wrap: nowrap;
        }

        .stats-page .tk-mini-admin-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.46rem;
          height: 1.46rem;
          margin: 0;
          padding: 0;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.45);
          background: rgba(15, 23, 42, 0.72);
          color: rgba(226, 232, 240, 0.94);
          font-size: 0.7rem;
          font-weight: 900;
          line-height: 1;
          cursor: pointer;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.035);
        }

        .stats-page .tk-mini-admin-btn.danger {
          border-color: rgba(248, 113, 113, 0.55);
          color: #fecaca;
          background: rgba(69, 10, 10, 0.38);
        }

        .stats-page .tk-match-admin-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.42rem;
          align-items: stretch;
        }


        /* Fill remaining desktop stats tables cleanly */
        @media (min-width: 769px) {

          .stats-page .tk-team-identity-table .stats-table,
          .stats-page .tk-player-identity-table:not(.tk-player-small-table):not(.tk-player-summary-table) .stats-table {
            width: 100% !important;
            min-width: 100% !important;
            table-layout: fixed !important;
          }

        }


        .stats-page .tk-admin-compact-btn {
          width: 100%;
          min-height: 1.55rem;
          padding: 0.34rem 0.55rem;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.01em;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          text-align: center;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.045);
        }

        .stats-page .tk-admin-compact-btn.primary {
          border: 1px solid rgba(56, 189, 248, 0.72);
          background: rgba(8, 47, 73, 0.48);
          color: #e0f2fe;
        }

        .stats-page .tk-admin-compact-btn.danger {
          border: 1px solid rgba(248, 113, 113, 0.68);
          background: rgba(69, 10, 10, 0.45);
          color: #fecaca;
        }

        @media (max-width: 520px) {
          .stats-page .tk-mini-admin-actions {
            gap: 0.78rem;
          }

          .stats-page .tk-mini-admin-btn {
            width: 1.48rem;
            height: 1.48rem;
            font-size: 0.62rem;
          }

          .stats-page .tk-admin-compact-btn {
            min-height: 1.38rem;
            padding: 0.28rem 0.42rem;
            font-size: 0.58rem;
          }

          .stats-page .tk-match-admin-title {
            font-size: 0.62rem;
            letter-spacing: 0.08em;
          }
        }


        /* Mobile: fix Clean Sheets table header width */
        @media (max-width: 768px) {
          .stats-page .clean-sheets-table .stats-table {
            width: 100% !important;
            min-width: 100% !important;
            table-layout: fixed !important;
          }
        }


      `}</style>

    </div>
  );
}