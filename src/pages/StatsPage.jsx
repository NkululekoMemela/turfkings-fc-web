// src/pages/StatsPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

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
  onDeleteCurrentEmptySeason = null,
  canPreviewPreviousSeasonUI = false,
  isAdmin = false,
  matchType = "LEAGUE",
}) {
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

  const isAdminUser = Boolean(isAdmin);
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
        const playersSnap = await getDocs(collection(db, "players"));
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
        const snap = await getDocs(collection(db, "playerPhotos"));
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

  const playerStats = useMemo(() => {
    const stats = {};

    const getOrCreate = (playerName) => {
      if (!playerName) return null;
      if (!stats[playerName]) {
        stats[playerName] = {
          name: playerName,
          displayName: getPreferredStatsDisplayName(playerName, resolveShortDisplay(playerName)),
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          gkCleanSheets: 0,
          defCleanSheets: 0,
          total: 0,
        };
      }
      return stats[playerName];
    };

    dedupeEvents(visibleEvents || []).forEach((e) => {
      if (!e) return;

      if (e.type === "clean_sheet") {
        const cleanSheetHolder = resolveCanonicalName(
          e.playerName || e.scorer || ""
        );
        const p = getOrCreate(cleanSheetHolder);
        if (!p) return;

        p.cleanSheets += 1;
        if (e.role === "gk") p.gkCleanSheets += 1;
        if (e.role === "def") p.defCleanSheets += 1;
        return;
      }

      if (e.type === "goal" && e.scorer) {
        const scorer = resolveCanonicalName(e.scorer);
        const s = getOrCreate(scorer);
        if (s) s.goals += 1;
      }

      if (e.assist) {
        const assister = resolveCanonicalName(e.assist);
        const a = getOrCreate(assister);
        if (a) a.assists += 1;
      }
    });

    Object.values(stats).forEach((p) => {
      p.teamName = playerTeamMap[p.name] || "—";
      p.total = p.goals + p.assists + p.cleanSheets;
    });

    return Object.values(stats);
  }, [visibleEvents, playerTeamMap, resolveCanonicalName, resolveShortDisplay]);

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

  const [editingEventId, setEditingEventId] = useState(null);
  const [eventDraft, setEventDraft] = useState({
    scorer: "",
    assist: "",
    type: "goal",
    teamId: "",
  });

  const startEditEvent = (e) => {
    if (!canAdminEditThisView) return;
    if (e?.type === "clean_sheet") {
      window.alert(
        "Clean-sheet events are generated from verified lineups and match result. Edit the score/result instead of editing this event directly."
      );
      return;
    }

    setEditingEventId(String(e?.id || ""));
    setEventDraft({
      scorer: e?.scorer || "",
      assist: e?.assist || "",
      type: "goal",
      teamId: e?.teamId || "",
    });
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEventDraft({
      scorer: "",
      assist: "",
      type: "goal",
      teamId: "",
    });
  };

  const saveEditEvent = (e) => {
    if (!canAdminEditThisView) return;
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
  const [newEventDraft, setNewEventDraft] = useState({
    scorer: "",
    assist: "",
    type: "goal",
    teamId: "",
  });

  const startAddEvent = (r, defaultTeamId = "") => {
    if (!canAdminEditThisView) return;

    setAddingForMatchKey(matchKeyOf(r));
    setNewEventDraft({
      scorer: "",
      assist: "",
      type: "goal",
      teamId: defaultTeamId || r?.teamAId || "",
    });
  };

  const cancelAddEvent = () => {
    setAddingForMatchKey(null);
    setNewEventDraft({
      scorer: "",
      assist: "",
      type: "goal",
      teamId: "",
    });
  };

  const saveAddEvent = (r) => {
    if (!canAdminEditThisView) return;
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
    (canAdminEditThisView || showFriendlyStats);

  const handleDeleteMatch = (recordOrMatchNo) => {
    if (!canDeleteFromThisView) return;

    const isRecord =
      recordOrMatchNo &&
      typeof recordOrMatchNo === "object" &&
      !Array.isArray(recordOrMatchNo);

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
    if (!canAdminEditThisView) return;
    if (typeof onDeleteSavedEvent !== "function") return;

    const eventLabel =
      e?.type === "clean_sheet"
        ? `${e?.playerName || e?.scorer || "this player"} clean-sheet event`
        : `${e?.scorer || "this player"} event`;

    const ok = window.confirm(
      `Delete ${eventLabel}?\n\nThe score and standings will now update automatically from the remaining events.`
    );
    if (!ok) return;

    onDeleteSavedEvent(e?.id);
  };

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
  const [isManagingFriendlyDay, setIsManagingFriendlyDay] = useState(false);

  useEffect(() => {
    if (
      !showFriendlyStats ||
      viewMode !== "current" ||
      friendlyMonthScope !== CURRENT_SCOPE ||
      activeTab !== "matches"
    ) {
      setIsManagingFriendlyDay(false);
    }
  }, [showFriendlyStats, viewMode, friendlyMonthScope, activeTab]);

  useEffect(() => {
    if (showFriendlyStats && activeTab === "teams") {
      setActiveTab("combined");
    }
  }, [showFriendlyStats, activeTab]);


  useEffect(() => {
    if (
      showFriendlyStats &&
      activeTab === "matches" &&
      viewMode === "current" &&
      sortedResults.length > 0
    ) {
      setExpandedMatchKey(matchKeyOf(sortedResults[0]));
      return;
    }

    setExpandedMatchKey(null);
  }, [matchDayFilter, seasonScope, viewMode, showFriendlyStats, activeTab, sortedResults]);

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
    if (activeTab === "cleansheets") return "Clean Sheets";
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
            <span>{viewMode === "current" && friendlyMonthScope === CURRENT_SCOPE ? "Current week" : "Full month"}</span>
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
                viewMode === "current" &&
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
                      return;
                    }

                    setFriendlyMonthScope(CURRENT_SCOPE);
                    setViewMode("current");
                    setActiveTab("matches");
                    setIsManagingFriendlyDay(true);
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
                    {showFriendlyStats ? "Full month" : "Full season"}
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
                Clean Sheets
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

          <div className="table-wrapper">
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
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Goals</th>
                  <th>Assists</th>
                  <th>CS</th>
                  <th>G-A-CS</th>
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
          <div className="table-wrapper">
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
          <div className="table-wrapper">
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
                  ? "Clean Sheets — All Friendlies"
                  : "Clean Sheets — Current Friendly Day"
                : viewMode === "season"
                  ? "Clean Sheets — Current Season"
                  : "Clean Sheets — Current Week"}
          </h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Saves CS</th>
                  <th>Defense CS</th>
                  <th>Total CS</th>
                </tr>
              </thead>
              <tbody>
                {cleanSheetLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No clean sheets recorded yet.
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
                    ? "All Match Results — Full Month"
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

          {showFriendlyStats && viewMode === "current" && friendlyMonthScope === CURRENT_SCOPE ? (
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
                      .filter((e) => e?.type !== "clean_sheet")
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
                              {canAdminEditThisView && typeof onAddSavedEvent === "function" && (
                                <button
                                  type="button"
                                  className="tk-edit-btn"
                                  onClick={() => startAddEvent(r, r.teamAId)}
                                >
                                  Add missing goal
                                </button>
                              )}

                              <button
                                type="button"
                                className="tk-danger-btn"
                                onClick={() => handleDeleteMatch(r)}
                              >
                                Delete Friendly Day
                              </button>
                            </div>

                            {addingForMatchKey === mk && (
                              <div className="tk-admin-panel tk-admin-panel-spaced">
                                <div className="tk-admin-grid">
                                  <div>
                                    <label className="tk-small-label">Scorer</label>
                                    <select
                                      className="tk-small-select"
                                      value={newEventDraft.scorer}
                                      onChange={(evt) =>
                                        setNewEventDraft((prev) => ({
                                          ...prev,
                                          scorer: evt.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">Select player</option>
                                      {getPlayersForTeam(newEventDraft.teamId).map((name) => (
                                        <option key={`friendly-add-scorer-${name}`} value={name}>
                                          {name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <label className="tk-small-label">Assist</label>
                                    <select
                                      className="tk-small-select"
                                      value={newEventDraft.assist || ""}
                                      onChange={(evt) =>
                                        setNewEventDraft((prev) => ({
                                          ...prev,
                                          assist: evt.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">None</option>
                                      {getPlayersForTeam(newEventDraft.teamId)
                                        .filter((name) => name !== newEventDraft.scorer)
                                        .map((name) => (
                                          <option key={`friendly-add-assist-${name}`} value={name}>
                                            {name}
                                          </option>
                                        ))}
                                    </select>
                                  </div>

                                  <div>
                                    <label className="tk-small-label">Team</label>
                                    <select
                                      className="tk-small-select"
                                      value={newEventDraft.teamId}
                                      onChange={(evt) =>
                                        setNewEventDraft((prev) => ({
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
                                    onClick={() => saveAddEvent(r)}
                                  >
                                    Save new goal
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={cancelAddEvent}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
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
                              const isEditingThisEvent =
                                editingEventId === String(e?.id || "");
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

                                    {isManagingFriendlyDay && canAdminEditThisView && !isEditingThisEvent && (
                                      <span className="tk-friendly-event-actions">
                                        <button
                                          type="button"
                                          className="tk-linkish-btn"
                                          onClick={() => startEditEvent(e)}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="tk-linkish-btn"
                                          onClick={() => handleDeleteEvent(e)}
                                        >
                                          Delete
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
          <div className="table-wrapper">
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

                  const scoringEventsOnly = events.filter(
                    (e) => e?.type !== "clean_sheet"
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

                  return (
                    <React.Fragment key={mk}>
                      <tr
                        className={isExpanded ? "match-row expanded" : "match-row"}
                        onClick={() => toggleMatchDetails(mk)}
                      >
                        <td>
                          <span className="match-toggle-indicator">
                            {isExpanded ? "▾" : "▸"}
                          </span>{" "}
                          {showFriendlyStats ? r._tkFriendlyDayLabel || "Friendly" : r.matchNo}
                          {!showFriendlyStats && matchDayFilter === "ALL" && mdLabel ? (
                            <span className="tk-md-muted">{mdLabel}</span>
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
                                  const isEditingThisEvent =
                                    editingEventId === String(e?.id || "");

                                  return (
                                    <div key={(e.id || i) + "-a"} className="scorer-line">
                                      {!isEditingThisEvent ? (
                                        <div className="tk-event-line">
                                          <div className="tk-event-line-text">
                                            {e.scorer}
                                            {e.assist
                                              ? ` (assist: ${e.assist})`
                                              : ""}{" "}
                                            – {actionLabel}
                                          </div>

                                          {canAdminEditThisView && (
                                            <div>
                                              <button
                                                type="button"
                                                className="tk-linkish-btn"
                                                onClick={(evt) => {
                                                  evt.stopPropagation();
                                                  startEditEvent(e);
                                                }}
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                className="tk-linkish-btn"
                                                onClick={(evt) => {
                                                  evt.stopPropagation();
                                                  handleDeleteEvent(e);
                                                }}
                                              >
                                                Delete
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
                                  const isEditingThisEvent =
                                    editingEventId === String(e?.id || "");

                                  return (
                                    <div key={(e.id || i) + "-b"} className="scorer-line">
                                      {!isEditingThisEvent ? (
                                        <div className="tk-event-line">
                                          <div className="tk-event-line-text">
                                            {e.scorer}
                                            {e.assist
                                              ? ` (assist: ${e.assist})`
                                              : ""}{" "}
                                            – {actionLabel}
                                          </div>

                                          {canAdminEditThisView && (
                                            <div>
                                              <button
                                                type="button"
                                                className="tk-linkish-btn"
                                                onClick={(evt) => {
                                                  evt.stopPropagation();
                                                  startEditEvent(e);
                                                }}
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                className="tk-linkish-btn"
                                                onClick={(evt) => {
                                                  evt.stopPropagation();
                                                  handleDeleteEvent(e);
                                                }}
                                              >
                                                Delete
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
                            {(canAdminEditThisView || canDeleteFromThisView) && (
                              <div
                                className="tk-match-admin-box"
                                onClick={(evt) => evt.stopPropagation()}
                              >
                                <div className="tk-match-admin-title">
                                  Admin tools
                                </div>

                                <div className="tk-match-admin-row">
                                  {canAdminEditThisView && typeof onAddSavedEvent === "function" && (
                                    <button
                                      type="button"
                                      className="tk-edit-btn"
                                      onClick={() => startAddEvent(r, r.teamAId)}
                                    >
                                      Add event
                                    </button>
                                  )}

                                  {canDeleteFromThisView && (
                                    <button
                                      type="button"
                                      className="tk-danger-btn"
                                      onClick={() => handleDeleteMatch(r)}
                                    >
                                      {showFriendlyStats ? "Delete Friendly Day" : "Delete match"}
                                    </button>
                                  )}
                                </div>

                                {isAddingEvent && (
                                  <div className="tk-admin-panel tk-admin-panel-spaced">
                                    <div className="tk-admin-grid">
                                      <div>
                                        <label className="tk-small-label">
                                          Scorer
                                        </label>
                                        <select
                                          className="tk-small-select"
                                          value={newEventDraft.scorer}
                                          onChange={(evt) =>
                                            setNewEventDraft((prev) => ({
                                              ...prev,
                                              scorer: evt.target.value,
                                            }))
                                          }
                                        >
                                          <option value="">Select player</option>
                                          {addPlayers.map((name) => (
                                            <option
                                              key={`add-scorer-${name}`}
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
                                          value={newEventDraft.assist || ""}
                                          onChange={(evt) =>
                                            setNewEventDraft((prev) => ({
                                              ...prev,
                                              assist: evt.target.value,
                                            }))
                                          }
                                        >
                                          <option value="">None</option>
                                          {addAssistPlayers.map((name) => (
                                            <option
                                              key={`add-assist-${name}`}
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
                                          value={newEventDraft.type}
                                          onChange={(evt) =>
                                            setNewEventDraft((prev) => ({
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
                                          value={newEventDraft.teamId}
                                          onChange={(evt) =>
                                            setNewEventDraft((prev) => ({
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
                                        onClick={() => saveAddEvent(r)}
                                      >
                                        Save new event
                                      </button>
                                      <button
                                        type="button"
                                        className="secondary-btn"
                                        onClick={cancelAddEvent}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
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

      <style>{`
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
          display: inline-flex;
          gap: 0.45rem;
          margin-left: 0.55rem;
          flex-wrap: wrap;
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

      `}</style>

    </div>
  );
}