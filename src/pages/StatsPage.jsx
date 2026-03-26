import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMemberNameMap } from "../core/nameMapping.js";
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
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function formatEventTypeLabel(type, role = "") {
  if (type === "clean_sheet") {
    if (role === "gk") return "clean sheet (GK)";
    if (role === "def") return "clean sheet (DEF)";
    return "clean sheet";
  }
  return "goal";
}

// ---------------- PAGE ----------------
export function StatsPage({
  teams = [],
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
  onDeleteSavedMatch = null,
  onUpdateSavedEvent = null,
  onDeleteSavedEvent = null,
  onAddSavedEvent = null,
  onDeleteCurrentEmptySeason = null,
  canPreviewPreviousSeasonUI = false,
  isAdmin = false,
}) {
  const safeMembers = Array.isArray(members) ? members : [];
  const safeSeasons = Array.isArray(seasons) ? seasons : [];
  const safePlayerPhotosByName =
    playerPhotosByName && typeof playerPhotosByName === "object"
      ? playerPhotosByName
      : {};

  const safeTeamsProp = Array.isArray(teams) ? teams : [];
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

  const isAdminUser = Boolean(isAdmin);
  const { normalizeName } = useMemberNameMap(safeMembers);

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

  const isViewingPreviousSeason = seasonScope !== CURRENT_SCOPE;

  const canShowDeleteCurrentEmptySeason = useMemo(() => {
    return (
      isAdminUser &&
      typeof onDeleteCurrentEmptySeason === "function" &&
      !isViewingPreviousSeason &&
      previousSeasonOptions.length > 0
    );
  }, [
    isAdminUser,
    onDeleteCurrentEmptySeason,
    isViewingPreviousSeason,
    previousSeasonOptions,
  ]);

  const scopedTeams = useMemo(() => {
    if (!isViewingPreviousSeason) return safeTeamsProp;
    const t = selectedPrevSeason?.teams;
    return Array.isArray(t) ? t : [];
  }, [isViewingPreviousSeason, safeTeamsProp, selectedPrevSeason]);

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
    if (isViewingPreviousSeason) {
      const mh = Array.isArray(selectedPrevSeason?.matchDayHistory)
        ? selectedPrevSeason.matchDayHistory
        : [];
      return mh.flatMap((d) =>
        attachMatchDayMeta(
          d?.results,
          d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
        )
      );
    }

    if (safeMatchDayHistory.length > 0) {
      return safeMatchDayHistory.flatMap((d) =>
        attachMatchDayMeta(
          d?.results,
          d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
        )
      );
    }

    return attachMatchDayMeta(safeArchivedResultsProp, "UNKNOWN");
  }, [
    isViewingPreviousSeason,
    selectedPrevSeason,
    safeMatchDayHistory,
    safeArchivedResultsProp,
  ]);

  const scopedArchivedEvents = useMemo(() => {
    if (isViewingPreviousSeason) {
      const mh = Array.isArray(selectedPrevSeason?.matchDayHistory)
        ? selectedPrevSeason.matchDayHistory
        : [];
      return mh.flatMap((d) =>
        attachMatchDayMeta(
          d?.allEvents,
          d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
        )
      );
    }

    if (safeMatchDayHistory.length > 0) {
      return safeMatchDayHistory.flatMap((d) =>
        attachMatchDayMeta(
          d?.allEvents,
          d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN"
        )
      );
    }

    return attachMatchDayMeta(safeArchivedEventsProp, "UNKNOWN");
  }, [
    isViewingPreviousSeason,
    selectedPrevSeason,
    safeMatchDayHistory,
    safeArchivedEventsProp,
  ]);

  const scopedCurrentResults = useMemo(() => {
    if (!isViewingPreviousSeason) {
      return attachMatchDayMeta(safeResultsProp, currentMatchDayId || "CURRENT");
    }
    const r = selectedPrevSeason?.results;
    return attachMatchDayMeta(Array.isArray(r) ? r : [], "UNKNOWN");
  }, [
    isViewingPreviousSeason,
    safeResultsProp,
    selectedPrevSeason,
    currentMatchDayId,
  ]);

  const scopedCurrentEvents = useMemo(() => {
    if (!isViewingPreviousSeason) {
      return attachMatchDayMeta(safeEventsProp, currentMatchDayId || "CURRENT");
    }
    const e = selectedPrevSeason?.allEvents;
    return attachMatchDayMeta(Array.isArray(e) ? e : [], "UNKNOWN");
  }, [
    isViewingPreviousSeason,
    safeEventsProp,
    selectedPrevSeason,
    currentMatchDayId,
  ]);

  const [viewMode, setViewMode] = useState("current");
  useEffect(() => {
    if (isViewingPreviousSeason) setViewMode("season");
  }, [isViewingPreviousSeason]);

  const seasonResults = useMemo(
    () => [...scopedArchivedResults, ...scopedCurrentResults],
    [scopedArchivedResults, scopedCurrentResults]
  );

  const seasonEventsRaw = useMemo(
    () => [...scopedArchivedEvents, ...scopedCurrentEvents],
    [scopedArchivedEvents, scopedCurrentEvents]
  );

  const visibleResultsRaw = useMemo(() => {
    if (isViewingPreviousSeason) return seasonResults;
    return viewMode === "season" ? seasonResults : scopedCurrentResults;
  }, [
    isViewingPreviousSeason,
    viewMode,
    seasonResults,
    scopedCurrentResults,
  ]);

  const visibleEventsRaw = useMemo(() => {
    if (isViewingPreviousSeason) return seasonEventsRaw;
    return viewMode === "season" ? seasonEventsRaw : scopedCurrentEvents;
  }, [
    isViewingPreviousSeason,
    viewMode,
    seasonEventsRaw,
    scopedCurrentEvents,
  ]);

  const visibleEvents = useMemo(() => {
    return (visibleEventsRaw || [])
      .filter((e) => e?.type !== "shibobo")
      .map((e) => ({
        ...e,
        scorer: normalizeName(e?.scorer),
        assist: normalizeName(e?.assist),
        playerName: normalizeName(e?.playerName),
      }));
  }, [visibleEventsRaw, normalizeName]);

  const teamById = useMemo(() => {
    const map = new Map();
    (scopedTeams || []).forEach((t) => {
      if (t?.id) map.set(t.id, t);
    });
    return map;
  }, [scopedTeams]);

  const getTeamName = (id) => teamById.get(id)?.label || "Unknown";

  const teamPlayersById = useMemo(() => {
    const out = {};
    (scopedTeams || []).forEach((t) => {
      const rawPlayers = Array.isArray(t?.players) ? t.players : [];
      const normalizedPlayers = rawPlayers
        .map((p) =>
          typeof p === "string" ? p : p?.name || p?.displayName || ""
        )
        .map((name) => normalizeName(name))
        .filter(Boolean);

      out[t?.id] = normalizedPlayers;
    });
    return out;
  }, [scopedTeams, normalizeName]);

  const getPlayersForTeam = (teamId) => {
    return Array.isArray(teamPlayersById?.[teamId])
      ? teamPlayersById[teamId]
      : [];
  };

  const playerTeamMap = useMemo(() => {
    const map = {};
    (scopedTeams || []).forEach((t) => {
      (t?.players || []).forEach((p) => {
        const rawName =
          typeof p === "string" ? p : p?.name || p?.displayName;
        const canon = normalizeName(rawName);
        if (canon && !map[canon]) map[canon] = t.label;
      });
    });
    return map;
  }, [scopedTeams, normalizeName]);

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

    (visibleResultsRaw || []).forEach((r) => {
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
  }, [scopedTeams, visibleResultsRaw]);

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
    const normalized = normalizeName(raw);
    const firstRaw = firstNameOf(raw);
    const firstTc = firstNameOf(tc);
    const firstNormalized = firstNameOf(normalized);

    const candidates = [
      raw,
      tc,
      normalized,
      slugFromName(raw),
      slugFromName(tc),
      slugFromName(normalized),
      firstRaw,
      firstTc,
      firstNormalized,
      slugFromName(firstRaw),
      slugFromName(firstTc),
      slugFromName(firstNormalized),
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

    const captainName = normalizeName(captainRaw);

    let captainPhoto =
      getPlayerPhotoLikeCards(captainName) ||
      getPlayerPhotoLikeCards(captainRaw);

    if (!captainPhoto) {
      const matchedPlayerObj = players.find((p) => {
        const nm =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        return normalizeName(nm) === captainName;
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
      .map((n) => normalizeName(n))
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
    normalizeName,
    getPlayerPhotoLikeCards,
  ]);

  const playerStats = useMemo(() => {
    const stats = {};

    const getOrCreate = (playerName) => {
      if (!playerName) return null;
      if (!stats[playerName]) {
        stats[playerName] = {
          name: playerName,
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

    (visibleEvents || []).forEach((e) => {
      if (!e) return;

      if (e.type === "clean_sheet") {
        const cleanSheetHolder = e.playerName || e.scorer || "";
        const holder = normalizeName(cleanSheetHolder);
        const p = getOrCreate(holder);
        if (!p) return;

        p.cleanSheets += 1;
        if (e.role === "gk") p.gkCleanSheets += 1;
        if (e.role === "def") p.defCleanSheets += 1;
        return;
      }

      if (e.scorer) {
        const s = getOrCreate(e.scorer);
        if (!s) return;
        if (e.type === "goal") s.goals += 1;
      }

      if (e.assist) {
        const a = getOrCreate(e.assist);
        if (!a) return;
        a.assists += 1;
      }
    });

    Object.values(stats).forEach((p) => {
      p.teamName = playerTeamMap[p.name] || "—";
      p.total = p.goals + p.assists + p.cleanSheets;
    });

    return Object.values(stats);
  }, [visibleEvents, playerTeamMap, normalizeName]);

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
    (visibleResultsRaw || []).forEach((r) => {
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
  }, [visibleResultsRaw]);

  const [matchDayFilter, setMatchDayFilter] = useState("ALL");

  useEffect(() => {
    setMatchDayFilter("ALL");
  }, [seasonScope, viewMode]);

  const filteredResults = useMemo(() => {
    if (matchDayFilter === "ALL") return visibleResultsRaw || [];
    return (visibleResultsRaw || []).filter(
      (r) => (r?._tkMatchDayId || "UNKNOWN") === matchDayFilter
    );
  }, [visibleResultsRaw, matchDayFilter]);

  const filteredEvents = useMemo(() => {
    if (matchDayFilter === "ALL") return visibleEvents || [];
    return (visibleEvents || []).filter(
      (e) => (e?._tkMatchDayId || "UNKNOWN") === matchDayFilter
    );
  }, [visibleEvents, matchDayFilter]);

  const sortedResults = useMemo(() => {
    const arr = (filteredResults || []).slice();
    arr.sort((a, b) => Number(a?.matchNo || 0) - Number(b?.matchNo || 0));
    return arr;
  }, [filteredResults]);

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

  useEffect(() => {
    setExpandedMatchKey(null);
  }, [matchDayFilter, seasonScope, viewMode]);

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
    canAdminEditThisView && typeof onDeleteSavedMatch === "function";

  const handleDeleteMatch = (matchNo) => {
    if (!canDeleteFromThisView) return;

    const ok = window.confirm(
      `Delete saved match #${matchNo} from the current week?\n\nThis will remove the match result and all linked scorer/assist events for that match.`
    );
    if (!ok) return;

    onDeleteSavedMatch(matchNo);
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
                  onClick={() => {
                    const ok = window.confirm(
                      "Delete the current empty season and move back to the previous season?"
                    );
                    if (ok) onDeleteCurrentEmptySeason();
                  }}
                >
                  Delete current empty season
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {!isViewingPreviousSeason && (
        <section className="card">
          <h2>View</h2>
          <div className="stats-controls">
            <div className="stats-controls-left">
              <div className="segment-wrapper">
                <div className="segmented-toggle">
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
                  <button
                    type="button"
                    className={
                      viewMode === "season"
                        ? "segmented-option active"
                        : "segmented-option"
                    }
                    onClick={() => setViewMode("season")}
                  >
                    Full season
                  </button>
                </div>
              </div>
            </div>

            <div className="actions-row stats-tabs">
              <button
                className={
                  activeTab === "teams" ? "secondary-btn active" : "secondary-btn"
                }
                onClick={() => setActiveTab("teams")}
              >
                Team Standings
              </button>
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

      {activeTab === "teams" && (
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
                    <td>{p.name}</td>
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
                    <td>{p.name}</td>
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
                    <td>{p.name}</td>
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
                    <td>{p.name}</td>
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
              : viewMode === "season"
                ? "All Match Results — Current Season"
                : "All Match Results — Current Week"}
          </h2>
          <p className="muted">
            Tap a match row to see goal scorers and assists for that game.
          </p>

          {viewMode === "season" && (
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

          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Match #</th>
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
                          {r.matchNo}
                          {matchDayFilter === "ALL" && mdLabel ? (
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
                            {canAdminEditThisView && (
                              <div
                                className="tk-match-admin-box"
                                onClick={(evt) => evt.stopPropagation()}
                              >
                                <div className="tk-match-admin-title">
                                  Admin tools
                                </div>

                                <div className="tk-match-admin-row">
                                  {typeof onAddSavedEvent === "function" && (
                                    <button
                                      type="button"
                                      className="tk-edit-btn"
                                      onClick={() => startAddEvent(r, r.teamAId)}
                                    >
                                      Add event
                                    </button>
                                  )}

                                  {typeof onDeleteSavedMatch === "function" && (
                                    <button
                                      type="button"
                                      className="tk-danger-btn"
                                      onClick={() => handleDeleteMatch(r.matchNo)}
                                    >
                                      Delete match
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
        </section>
      )}
    </div>
  );
}