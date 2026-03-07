// src/pages/StatsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMemberNameMap } from "../core/nameMapping.js";

// ✅ Only used to pull captain photos the same way PlayerCards does
import { db } from "../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

// ---------------- HELPERS (mirrors PlayerCardPage style) ----------------
function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// For legacy photo doc ids (and your uploader)
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

  // ✅ V2: season switching context
  activeSeasonId = null,
  seasons = [],

  // ✅ photo map prop (already in your app state)
  playerPhotosByName = {},

  // ✅ NEW: pass full matchDayHistory from App.jsx (so we have dates!)
  matchDayHistory = [],

  // ✅ Admin hooks
  onDeleteSavedMatch = null,
  onUpdateSavedMatchScore = null,
  onUpdateSavedEvent = null,
  onDeleteSavedEvent = null,
  onAddSavedEvent = null,
}) {
  // ---------- Safety ----------
  const safeMembers = Array.isArray(members) ? members : [];
  const safeSeasons = Array.isArray(seasons) ? seasons : [];
  const safePlayerPhotosByName =
    playerPhotosByName && typeof playerPhotosByName === "object" ? playerPhotosByName : {};

  const safeTeamsProp = Array.isArray(teams) ? teams : [];
  const safeResultsProp = Array.isArray(results) ? results : [];
  const safeEventsProp = Array.isArray(allEvents) ? allEvents : [];
  const safeArchivedResultsProp = Array.isArray(archivedResults) ? archivedResults : [];
  const safeArchivedEventsProp = Array.isArray(archivedEvents) ? archivedEvents : [];
  const safeMatchDayHistory = Array.isArray(matchDayHistory) ? matchDayHistory : [];

  // Member-based name normalisation
  const { normalizeName } = useMemberNameMap(safeMembers);

  // ---------- Helpers: Season label + date range ----------
  const formatSeasonDisplayName = (season) => {
    const sid = season?.seasonId || "";
    const match = String(sid).match(/^(\d{4})-S(\d+)$/i);
    if (match) return `${match[1]} Season-${match[2]}`;
    const year = season?.year || (sid.match(/^(\d{4})/) ? sid.match(/^(\d{4})/)[1] : "");
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
    const fmtMonthYear = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });

    if (sameYear) {
      const sm = fmtMonth.format(s);
      const em = fmtMonth.format(e);
      if (sm === em) return `${fmtMonthYear.format(s)}`;
      return `${sm}–${em} ${s.getFullYear()}`;
    }
    return `${fmtMonthYear.format(s)} – ${fmtMonthYear.format(e)}`;
  };

  const getSeasonDateBounds = (season) => {
    const mh = Array.isArray(season?.matchDayHistory) ? season.matchDayHistory : [];
    const times = mh
      .map((d) => d?.createdAt || d?.updatedAt || null)
      .filter(Boolean)
      .map((t) => new Date(t))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (times.length >= 1) {
      return { startISO: times[0].toISOString(), endISO: times[times.length - 1].toISOString() };
    }

    const startISO = season?.createdAt || season?.updatedAt || null;
    const endISO = season?.updatedAt || season?.createdAt || null;
    return { startISO, endISO };
  };

  // ---------- Season selector ----------
  const CURRENT_SCOPE = "__CURRENT__";
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

  const selectedPrevSeason = useMemo(() => {
    if (seasonScope === CURRENT_SCOPE) return null;
    return safeSeasons.find((s) => s?.seasonId === seasonScope) || null;
  }, [safeSeasons, seasonScope]);

  const isViewingPreviousSeason = seasonScope !== CURRENT_SCOPE;

  // ---------- Pull the correct TEAMS based on selected scope ----------
  const scopedTeams = useMemo(() => {
    if (!isViewingPreviousSeason) return safeTeamsProp;
    const t = selectedPrevSeason?.teams;
    return Array.isArray(t) ? t : [];
  }, [isViewingPreviousSeason, safeTeamsProp, selectedPrevSeason]);

  // Helper: attach matchday metadata to results/events so we can filter by date cleanly
  const attachMatchDayMeta = (items, matchDayId) => {
    const id = matchDayId ? String(matchDayId) : "";
    const dateLabel = isoDateOnly(id) || isoDateOnly(matchDayId) || "";
    return (Array.isArray(items) ? items : []).map((x) => ({
      ...x,
      _tkMatchDayId: id || "UNKNOWN",
      _tkMatchDayLabel: dateLabel || (id || "UNKNOWN"),
    }));
  };

  // Determine current matchday id (best-effort)
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

  // ✅ IMPORTANT: build archived from real matchDayHistory (CURRENT season)
  const scopedArchivedResults = useMemo(() => {
    if (isViewingPreviousSeason) {
      const mh = Array.isArray(selectedPrevSeason?.matchDayHistory)
        ? selectedPrevSeason.matchDayHistory
        : [];
      return mh.flatMap((d) =>
        attachMatchDayMeta(d?.results, d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN")
      );
    }

    if (safeMatchDayHistory.length > 0) {
      return safeMatchDayHistory.flatMap((d) =>
        attachMatchDayMeta(d?.results, d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN")
      );
    }

    return attachMatchDayMeta(safeArchivedResultsProp, "UNKNOWN");
  }, [isViewingPreviousSeason, selectedPrevSeason, safeMatchDayHistory, safeArchivedResultsProp]);

  const scopedArchivedEvents = useMemo(() => {
    if (isViewingPreviousSeason) {
      const mh = Array.isArray(selectedPrevSeason?.matchDayHistory)
        ? selectedPrevSeason.matchDayHistory
        : [];
      return mh.flatMap((d) =>
        attachMatchDayMeta(d?.allEvents, d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN")
      );
    }

    if (safeMatchDayHistory.length > 0) {
      return safeMatchDayHistory.flatMap((d) =>
        attachMatchDayMeta(d?.allEvents, d?.id || d?.matchDayId || d?.date || d?.day || "UNKNOWN")
      );
    }

    return attachMatchDayMeta(safeArchivedEventsProp, "UNKNOWN");
  }, [isViewingPreviousSeason, selectedPrevSeason, safeMatchDayHistory, safeArchivedEventsProp]);

  const scopedCurrentResults = useMemo(() => {
    if (!isViewingPreviousSeason) {
      return attachMatchDayMeta(safeResultsProp, currentMatchDayId || "CURRENT");
    }
    const r = selectedPrevSeason?.results;
    return attachMatchDayMeta(Array.isArray(r) ? r : [], "UNKNOWN");
  }, [isViewingPreviousSeason, safeResultsProp, selectedPrevSeason, currentMatchDayId]);

  const scopedCurrentEvents = useMemo(() => {
    if (!isViewingPreviousSeason) {
      return attachMatchDayMeta(safeEventsProp, currentMatchDayId || "CURRENT");
    }
    const e = selectedPrevSeason?.allEvents;
    return attachMatchDayMeta(Array.isArray(e) ? e : [], "UNKNOWN");
  }, [isViewingPreviousSeason, safeEventsProp, selectedPrevSeason, currentMatchDayId]);

  // ---------- VIEW MODE ----------
  const [viewMode, setViewMode] = useState("current"); // "current" | "season"
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
  }, [isViewingPreviousSeason, viewMode, seasonResults, scopedCurrentResults]);

  const visibleEventsRaw = useMemo(() => {
    if (isViewingPreviousSeason) return seasonEventsRaw;
    return viewMode === "season" ? seasonEventsRaw : scopedCurrentEvents;
  }, [isViewingPreviousSeason, viewMode, seasonEventsRaw, scopedCurrentEvents]);

  // ---------- NORMALISED EVENTS ----------
  const visibleEvents = useMemo(() => {
    return (visibleEventsRaw || []).map((e) => ({
      ...e,
      scorer: normalizeName(e?.scorer),
      assist: normalizeName(e?.assist),
    }));
  }, [visibleEventsRaw, normalizeName]);

  // ---------- Team maps ----------
  const teamById = useMemo(() => {
    const map = new Map();
    (scopedTeams || []).forEach((t) => {
      if (t?.id) map.set(t.id, t);
    });
    return map;
  }, [scopedTeams]);

  const getTeamName = (id) => teamById.get(id)?.label || "Unknown";

  const playerTeamMap = useMemo(() => {
    const map = {};
    (scopedTeams || []).forEach((t) => {
      (t?.players || []).forEach((p) => {
        const rawName = typeof p === "string" ? p : p?.name || p?.displayName;
        const canon = normalizeName(rawName);
        if (canon && !map[canon]) map[canon] = t.label;
      });
    });
    return map;
  }, [scopedTeams, normalizeName]);

  // ---------- TEAM TABLE (Standings) ----------
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

    Object.values(base).forEach((t) => (t.goalDiff = t.goalsFor - t.goalsAgainst));

    const arr = Object.values(base);
    arr.sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
      if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      return (x.name || "").localeCompare(y.name || "");
    });

    return arr;
  }, [scopedTeams, visibleResultsRaw]);

  // ---------------- PHOTO PULLING (MATCH PlayerCardPage LOGIC) ----------------
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
    const candidates = [];
    const tc = toTitleCase(name || "");
    if (tc) candidates.push(tc);

    const fn = firstNameOf(tc);
    if (fn) candidates.push(fn);

    if (tc) candidates.push(slugFromName(tc));

    for (const c of candidates) {
      const k = safeLower(c);
      if (k && mergedPhotoIndex[k]) return mergedPhotoIndex[k];
    }
    return null;
  };

  // ---------- Champion recap (previous seasons only) ----------
  const champion = useMemo(() => {
    if (!isViewingPreviousSeason) return null;
    if (!Array.isArray(teamStats) || teamStats.length === 0) return null;

    const winner = teamStats[0];
    const teamObj = teamById.get(winner.teamId) || null;

    const players = Array.isArray(teamObj?.players) ? teamObj.players : [];

    const captainRaw =
      teamObj?.captain ||
      teamObj?.captainName ||
      players.find((p) => p?.isCaptain)?.name ||
      players.find((p) => p?.role === "captain")?.name ||
      (typeof players[0] === "string" ? players[0] : players[0]?.name);

    const captainName = normalizeName(captainRaw);
    const captainPhoto = getPlayerPhotoLikeCards(captainName || captainRaw);

    const squadNamesAll = players
      .map((p) => (typeof p === "string" ? p : p?.name || p?.displayName))
      .filter(Boolean)
      .map((n) => normalizeName(n));

    const squadNames = squadNamesAll.filter((n) => n && n !== captainName);

    return {
      teamId: winner.teamId,
      teamName: winner.name,
      captainName: captainName || "Captain",
      captainPhoto,
      squadNames,
    };
  }, [isViewingPreviousSeason, teamStats, teamById, normalizeName, getPlayerPhotoLikeCards]);

  // ---------- PLAYER STATS ----------
  const playerStats = useMemo(() => {
    const stats = {};

    const getOrCreate = (playerName) => {
      if (!playerName) return null;
      if (!stats[playerName])
        stats[playerName] = { name: playerName, goals: 0, assists: 0, shibobos: 0 };
      return stats[playerName];
    };

    (visibleEvents || []).forEach((e) => {
      if (!e) return;

      if (e.scorer) {
        const s = getOrCreate(e.scorer);
        if (!s) return;
        if (e.type === "goal") s.goals += 1;
        else if (e.type === "shibobo") s.shibobos += 1;
      }

      if (e.assist) {
        const a = getOrCreate(e.assist);
        if (!a) return;
        a.assists += 1;
      }
    });

    Object.values(stats).forEach((p) => {
      p.teamName = playerTeamMap[p.name] || "—";
      p.total = p.goals + p.assists + p.shibobos;
    });

    return Object.values(stats);
  }, [visibleEvents, playerTeamMap]);

  const combinedLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => (p.total || 0) > 0).slice();
    arr.sort((x, y) => {
      if (y.total !== x.total) return y.total - x.total;
      if (y.goals !== x.goals) return y.goals - x.goals;
      if (y.assists !== x.assists) return y.assists - x.assists;
      if (y.shibobos !== x.shibobos) return y.shibobos - x.shibobos;
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

  // ---------- Matchday filter buttons (All + date pills) ----------
  const matchDayOptions = useMemo(() => {
    const map = new Map();
    (visibleResultsRaw || []).forEach((r) => {
      const id = r?._tkMatchDayId || "UNKNOWN";
      const label = isoDateOnly(r?._tkMatchDayLabel) || isoDateOnly(id) || r?._tkMatchDayLabel || id;
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

  // ---------- FULL MATCH LIST + EVENTS BREAKDOWN ----------
  const sortedResults = useMemo(() => {
    const arr = (filteredResults || []).slice();
    arr.sort((a, b) => Number(a?.matchNo || 0) - Number(b?.matchNo || 0));
    return arr;
  }, [filteredResults]);

  const matchKeyOf = (r) => `${r?._tkMatchDayId || "UNKNOWN"}::${Number(r?.matchNo || 0)}`;

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

  // ✅ current-week/current-season only admin guard
  const canAdminEditThisView =
    !isViewingPreviousSeason && viewMode === "current";

  // ---------- SCORE EDIT ----------
  const [editingMatchKey, setEditingMatchKey] = useState(null);
  const [editScoreA, setEditScoreA] = useState("0");
  const [editScoreB, setEditScoreB] = useState("0");

  const startEditScore = (r) => {
    setEditingMatchKey(matchKeyOf(r));
    setEditScoreA(String(r?.goalsA ?? 0));
    setEditScoreB(String(r?.goalsB ?? 0));
  };

  const cancelEditScore = () => {
    setEditingMatchKey(null);
    setEditScoreA("0");
    setEditScoreB("0");
  };

  const saveEditScore = (r) => {
    if (typeof onUpdateSavedMatchScore !== "function") return;

    const nextA = Math.max(0, Number(editScoreA || 0));
    const nextB = Math.max(0, Number(editScoreB || 0));

    onUpdateSavedMatchScore(r?.matchNo, nextA, nextB);
    cancelEditScore();
  };

  // ---------- EVENT EDIT ----------
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventDraft, setEventDraft] = useState({
    scorer: "",
    assist: "",
    type: "goal",
    teamId: "",
  });

  const startEditEvent = (e) => {
    setEditingEventId(String(e?.id || ""));
    setEventDraft({
      scorer: e?.scorer || "",
      assist: e?.assist || "",
      type: e?.type === "shibobo" ? "shibobo" : "goal",
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
    if (typeof onUpdateSavedEvent !== "function") return;

    const scorer = String(eventDraft?.scorer || "").trim();
    if (!scorer) {
      window.alert("Scorer name is required.");
      return;
    }

    onUpdateSavedEvent(e?.id, {
      scorer,
      assist: String(eventDraft?.assist || "").trim() || null,
      type: eventDraft?.type === "shibobo" ? "shibobo" : "goal",
      teamId: eventDraft?.teamId || e?.teamId || "",
    });

    cancelEditEvent();
  };

  // ---------- ADD EVENT ----------
  const [addingForMatchKey, setAddingForMatchKey] = useState(null);
  const [newEventDraft, setNewEventDraft] = useState({
    scorer: "",
    assist: "",
    type: "goal",
    teamId: "",
  });

  const startAddEvent = (r, defaultTeamId = "") => {
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
    if (typeof onAddSavedEvent !== "function") return;

    const scorer = String(newEventDraft?.scorer || "").trim();
    if (!scorer) {
      window.alert("Scorer name is required.");
      return;
    }

    onAddSavedEvent(r?.matchNo, {
      scorer,
      assist: String(newEventDraft?.assist || "").trim() || null,
      type: newEventDraft?.type === "shibobo" ? "shibobo" : "goal",
      teamId: newEventDraft?.teamId || r?.teamAId || "",
    });

    cancelAddEvent();
  };

  // ---------- DELETE ----------
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
    cancelEditScore();
    cancelEditEvent();
    cancelAddEvent();
  };

  const handleDeleteEvent = (e) => {
    if (typeof onDeleteSavedEvent !== "function") return;

    const ok = window.confirm(
      `Delete this saved event for ${e?.scorer || "this player"}?\n\nIf it is a goal event, the match score and standings will also recalculate.`
    );
    if (!ok) return;

    onDeleteSavedEvent(e?.id);
  };

  // ---------- AUTO-RETURN WHEN ACCESSED FROM LIVE ----------
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

  // ---------- TABS ----------
  const [activeTab, setActiveTab] = useState("teams");

  // ---------- Headers / date ranges ----------
  const currentSeasonRange = useMemo(() => {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
    return fmt.format(now);
  }, []);

  const previousSeasonRange = useMemo(() => {
    if (!selectedPrevSeason) return "";
    const { startISO, endISO } = getSeasonDateBounds(selectedPrevSeason);
    return monthRangeLabel(startISO, endISO);
  }, [selectedPrevSeason]);

  const seasonContextTitle = useMemo(() => {
    if (!isViewingPreviousSeason) return "Current season";
    return formatSeasonDisplayName(selectedPrevSeason);
  }, [isViewingPreviousSeason, selectedPrevSeason]);

  const viewContextTitle = useMemo(() => {
    if (isViewingPreviousSeason) return "Full season";
    return viewMode === "season" ? "Full season" : "Current week";
  }, [isViewingPreviousSeason, viewMode]);

  const headerRangeText = useMemo(() => {
    if (isViewingPreviousSeason) return previousSeasonRange ? previousSeasonRange : "Season dates unknown";
    return currentSeasonRange;
  }, [isViewingPreviousSeason, previousSeasonRange, currentSeasonRange]);

  // ---------- RENDER ----------
  return (
    <div className="page stats-page">
      <header className="header">
        <div>
          <h1>Stats &amp; Leaderboards</h1>
          <div className="muted" style={{ marginTop: "0.25rem" }}>
            <strong>{seasonContextTitle}</strong> • <span>{viewContextTitle}</span> • <span>{headerRangeText}</span>
          </div>
        </div>

        <div className="stats-header-actions">
          <button className="secondary-btn" onClick={onBack}>Back</button>
          <button className="secondary-btn" onClick={onGoToPeerReview}>Rate Player</button>
          <button className="secondary-btn" onClick={onGoToPlayerCards}>Player cards</button>
        </div>
      </header>

      <style>{`
        .tk-matchday-filter-row {
          display: flex;
          justify-content: flex-end;
          gap: 0.4rem;
          flex-wrap: wrap;
          margin: 0.15rem 0 0.35rem;
        }
        .tk-md-btn {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          padding: 0.28rem 0.55rem;
          border-radius: 999px;
          font-weight: 800;
          cursor: pointer;
        }
        .tk-md-btn.active {
          border-color: rgba(34,211,238,0.55);
          box-shadow: 0 0 0 2px rgba(34,211,238,0.12);
        }
        .tk-md-label {
          opacity: 0.95;
        }
        .tk-md-muted {
          opacity: 0.6;
          font-weight: 700;
          font-size: 0.82em;
          margin-left: 0.4rem;
        }
        .tk-match-admin-box {
          margin-top: 0.9rem;
          padding-top: 0.75rem;
          border-top: 1px dashed rgba(255,255,255,0.16);
        }
        .tk-match-admin-title {
          font-size: 0.78rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          opacity: 0.8;
          margin-bottom: 0.55rem;
        }
        .tk-match-admin-row {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.75rem;
        }
        .tk-danger-btn {
          border: 1px solid rgba(239, 68, 68, 0.45);
          background: rgba(239, 68, 68, 0.12);
          color: #ffd6d6;
          padding: 0.42rem 0.7rem;
          border-radius: 999px;
          font-weight: 800;
          cursor: pointer;
        }
        .tk-danger-btn:hover {
          background: rgba(239, 68, 68, 0.18);
        }
        .tk-edit-btn {
          border: 1px solid rgba(56, 189, 248, 0.45);
          background: rgba(56, 189, 248, 0.12);
          color: #d9f6ff;
          padding: 0.42rem 0.7rem;
          border-radius: 999px;
          font-weight: 800;
          cursor: pointer;
        }
        .tk-edit-btn:hover {
          background: rgba(56, 189, 248, 0.18);
        }
        .tk-admin-panel {
          margin-top: 0.65rem;
          padding: 0.8rem;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
        }
        .tk-admin-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 0.5rem;
          margin-top: 0.55rem;
        }
        .tk-small-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 800;
          margin-bottom: 0.22rem;
          opacity: 0.88;
        }
        .tk-small-input,
        .tk-small-select {
          width: 100%;
          padding: 0.45rem 0.55rem;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: inherit;
        }
        .tk-inline-actions {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
          margin-top: 0.65rem;
        }
        .tk-linkish-btn {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: inherit;
          padding: 0.24rem 0.5rem;
          border-radius: 999px;
          font-weight: 800;
          font-size: 0.78rem;
          cursor: pointer;
          margin-left: 0.45rem;
        }
        .tk-event-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.1rem 0;
          flex-wrap: wrap;
        }
        .tk-event-line-text {
          flex: 1;
          min-width: 220px;
        }
      `}</style>

      {/* ---------- Season Picker ---------- */}
      <section className="card">
        <h2>Season</h2>

        <div className="stats-controls" style={{ alignItems: "center" }}>
          <div className="stats-controls-left" style={{ minWidth: "320px" }}>
            <div className="segment-wrapper">
              <div className="segmented-toggle">
                <button
                  type="button"
                  className={seasonScope === CURRENT_SCOPE ? "segmented-option active" : "segmented-option"}
                  onClick={() => setSeasonScope(CURRENT_SCOPE)}
                >
                  Current
                </button>
                <button
                  type="button"
                  className={seasonScope !== CURRENT_SCOPE ? "segmented-option active" : "segmented-option"}
                  onClick={() => {
                    if (previousSeasonOptions.length > 0) setSeasonScope(previousSeasonOptions[0].seasonId);
                  }}
                  disabled={previousSeasonOptions.length === 0}
                  title={previousSeasonOptions.length === 0 ? "No previous seasons yet" : "Switch to a previous season"}
                >
                  Previous
                </button>
              </div>
            </div>

            {seasonScope !== CURRENT_SCOPE && (
              <div style={{ marginTop: "0.7rem" }}>
                <label className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>
                  Choose a previous season
                </label>
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
                <div className="muted" style={{ marginTop: "0.35rem" }}>
                  {previousSeasonRange ? `Season range: ${previousSeasonRange}` : "Season range: unknown"}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900 }}>{seasonContextTitle}</div>
            <div className="muted" style={{ marginTop: "0.2rem" }}>
              {isViewingPreviousSeason
                ? "Previous seasons are always shown as full-season stats."
                : "Current season can be viewed as Current week or Full season."}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- View toggle (Current season ONLY) ---------- */}
      {!isViewingPreviousSeason && (
        <section className="card">
          <h2>View</h2>
          <div className="stats-controls">
            <div className="stats-controls-left">
              <div className="segment-wrapper">
                <div className="segmented-toggle">
                  <button
                    type="button"
                    className={viewMode === "current" ? "segmented-option active" : "segmented-option"}
                    onClick={() => setViewMode("current")}
                  >
                    Current week
                  </button>
                  <button
                    type="button"
                    className={viewMode === "season" ? "segmented-option active" : "segmented-option"}
                    onClick={() => setViewMode("season")}
                  >
                    Full season
                  </button>
                </div>
              </div>
            </div>

            <div className="actions-row stats-tabs">
              <button className={activeTab === "teams" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("teams")}>
                Team Standings
              </button>
              <button className={activeTab === "matches" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("matches")}>
                Match Results
              </button>
              <button className={activeTab === "goals" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("goals")}>
                Top Scorers
              </button>
              <button className={activeTab === "assists" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("assists")}>
                Playmakers
              </button>
              <button className={activeTab === "combined" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("combined")}>
                Summary Player Stats
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Tabs row for Previous season ---------- */}
      {isViewingPreviousSeason && (
        <section className="card">
          <h2>Previous season stats (Full season)</h2>
          <div className="actions-row stats-tabs">
            <button className={activeTab === "teams" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("teams")}>
              Team Standings
            </button>
            <button className={activeTab === "matches" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("matches")}>
              Match Results
            </button>
            <button className={activeTab === "goals" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("goals")}>
              Top Scorers
            </button>
            <button className={activeTab === "assists" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("assists")}>
              Playmakers
            </button>
            <button className={activeTab === "combined" ? "secondary-btn active" : "secondary-btn"} onClick={() => setActiveTab("combined")}>
              Summary Player Stats
            </button>
          </div>
        </section>
      )}

      {/* ---------- Team Standings ---------- */}
      {activeTab === "teams" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason
              ? `Team Standings — ${formatSeasonDisplayName(selectedPrevSeason)}`
              : viewMode === "season"
              ? "Team Standings — Current Season"
              : "Team Standings — Current Week"}
          </h2>
          <div className="muted" style={{ marginTop: "-0.25rem", marginBottom: "0.6rem" }}>{headerRangeText}</div>

          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th><th>Team</th><th>Pts</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((t, idx) => (
                  <tr key={t.teamId}>
                    <td>{idx + 1}</td><td>{t.name}</td><td>{t.points}</td><td>{t.played}</td><td>{t.won}</td><td>{t.drawn}</td>
                    <td>{t.lost}</td><td>{t.goalsFor}</td><td>{t.goalsAgainst}</td><td>{t.goalDiff}</td>
                  </tr>
                ))}
                {teamStats.length === 0 && (
                  <tr><td colSpan={10} className="muted">No teams loaded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- Player Rankings ---------- */}
      {activeTab === "combined" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason ? "Player Rankings — Previous Season" : viewMode === "season" ? "Player Rankings — Current Season" : "Player Rankings — Current Week"}
          </h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr><th>#</th><th>Player</th><th>Team</th><th>Goals</th><th>Assists</th><th>Saves</th><th>G-A-S</th></tr>
              </thead>
              <tbody>
                {combinedLeaderboard.length === 0 && (
                  <tr><td colSpan={7} className="muted">No player stats recorded yet.</td></tr>
                )}
                {combinedLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-combined"}>
                    <td>{idx + 1}</td><td>{p.name}</td><td>{p.teamName || "—"}</td>
                    <td>{p.goals}</td><td>{p.assists}</td><td>{p.shibobos}</td><td>{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- Top Scorers ---------- */}
      {activeTab === "goals" && (
        <section className="card">
          <h2>{isViewingPreviousSeason ? "Top Scorers — Previous Season" : viewMode === "season" ? "Top Scorers — Current Season" : "Top Scorers — Current Week"}</h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Goals</th></tr></thead>
              <tbody>
                {goalLeaderboard.length === 0 && (
                  <tr><td colSpan={4} className="muted">No goals recorded yet.</td></tr>
                )}
                {goalLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-g"}>
                    <td>{idx + 1}</td><td>{p.name}</td><td>{p.teamName || "—"}</td><td>{p.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- Playmakers ---------- */}
      {activeTab === "assists" && (
        <section className="card">
          <h2>{isViewingPreviousSeason ? "Top Playmakers — Previous Season" : viewMode === "season" ? "Top Playmakers — Current Season" : "Top Playmakers — Current Week"}</h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Assists</th></tr></thead>
              <tbody>
                {assistLeaderboard.length === 0 && (
                  <tr><td colSpan={4} className="muted">No assists recorded yet.</td></tr>
                )}
                {assistLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-a"}>
                    <td>{idx + 1}</td><td>{p.name}</td><td>{p.teamName || "—"}</td><td>{p.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- Match Results ---------- */}
      {activeTab === "matches" && (
        <section className="card">
          <h2>
            {isViewingPreviousSeason ? "All Match Results — Previous Season" : viewMode === "season" ? "All Match Results — Current Season" : "All Match Results — Current Week"}
          </h2>
          <p className="muted">Tap a match row to see goal scorers and assists for that game.</p>

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
                  <th>Match #</th><th>Team A</th><th>Score</th><th>Team B</th><th>Result</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 && (
                  <tr><td colSpan={5} className="muted">No matches played yet.</td></tr>
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
                  const isEditingScore = editingMatchKey === mk;
                  const isAddingEvent = addingForMatchKey === mk;

                  const events = eventsByMatchKey.get(mk) || [];

                  const teamAEvents = events.filter((e) => e.teamId === r.teamAId && e.scorer);
                  const teamBEvents = events.filter((e) => e.teamId === r.teamBId && e.scorer);

                  const mdLabel = isoDateOnly(r?._tkMatchDayLabel) || isoDateOnly(r?._tkMatchDayId) || "";

                  return (
                    <React.Fragment key={mk}>
                      <tr
                        className={isExpanded ? "match-row expanded" : "match-row"}
                        onClick={() => toggleMatchDetails(mk)}
                      >
                        <td>
                          <span className="match-toggle-indicator">{isExpanded ? "▾" : "▸"}</span>{" "}
                          {r.matchNo}
                          {matchDayFilter === "ALL" && mdLabel ? (
                            <span className="tk-md-muted">{mdLabel}</span>
                          ) : null}
                        </td>
                        <td>{teamAName}</td>
                        <td>{r.goalsA} – {r.goalsB}</td>
                        <td>{teamBName}</td>
                        <td>{resultText}</td>
                      </tr>

                      {isExpanded && (
                        <tr className="match-details-row">
                          <td />
                          <td>
                            {events.length === 0 ? (
                              <span className="muted">No event breakdown recorded.</span>
                            ) : teamAEvents.length === 0 ? null : (
                              <div className="team-scorers">
                                {teamAEvents.map((e, i) => {
                                  const actionLabel = e.type === "shibobo" ? "shibobo" : "goal";
                                  const isEditingThisEvent = editingEventId === String(e?.id || "");

                                  return (
                                    <div key={(e.id || i) + "-a"} className="scorer-line">
                                      {!isEditingThisEvent ? (
                                        <div className="tk-event-line">
                                          <div className="tk-event-line-text">
                                            {e.scorer}
                                            {e.assist ? ` (assist: ${e.assist})` : ""} – {actionLabel}
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
                                              <label className="tk-small-label">Scorer</label>
                                              <input
                                                className="tk-small-input"
                                                value={eventDraft.scorer}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    scorer: evt.target.value,
                                                  }))
                                                }
                                              />
                                            </div>
                                            <div>
                                              <label className="tk-small-label">Assist</label>
                                              <input
                                                className="tk-small-input"
                                                value={eventDraft.assist}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    assist: evt.target.value,
                                                  }))
                                                }
                                              />
                                            </div>
                                            <div>
                                              <label className="tk-small-label">Type</label>
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
                                                <option value="shibobo">shibobo</option>
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
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td />
                          <td>
                            {events.length === 0 ? (
                              <span className="muted">No event breakdown recorded.</span>
                            ) : teamBEvents.length === 0 ? null : (
                              <div className="team-scorers">
                                {teamBEvents.map((e, i) => {
                                  const actionLabel = e.type === "shibobo" ? "shibobo" : "goal";
                                  const isEditingThisEvent = editingEventId === String(e?.id || "");

                                  return (
                                    <div key={(e.id || i) + "-b"} className="scorer-line">
                                      {!isEditingThisEvent ? (
                                        <div className="tk-event-line">
                                          <div className="tk-event-line-text">
                                            {e.scorer}
                                            {e.assist ? ` (assist: ${e.assist})` : ""} – {actionLabel}
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
                                              <label className="tk-small-label">Scorer</label>
                                              <input
                                                className="tk-small-input"
                                                value={eventDraft.scorer}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    scorer: evt.target.value,
                                                  }))
                                                }
                                              />
                                            </div>
                                            <div>
                                              <label className="tk-small-label">Assist</label>
                                              <input
                                                className="tk-small-input"
                                                value={eventDraft.assist}
                                                onChange={(evt) =>
                                                  setEventDraft((prev) => ({
                                                    ...prev,
                                                    assist: evt.target.value,
                                                  }))
                                                }
                                              />
                                            </div>
                                            <div>
                                              <label className="tk-small-label">Type</label>
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
                                                <option value="shibobo">shibobo</option>
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
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td>
                            {canAdminEditThisView && (
                              <div className="tk-match-admin-box" onClick={(evt) => evt.stopPropagation()}>
                                <div className="tk-match-admin-title">Admin tools</div>

                                {!isEditingScore ? (
                                  <div className="tk-match-admin-row">
                                    {typeof onUpdateSavedMatchScore === "function" && (
                                      <button
                                        type="button"
                                        className="tk-edit-btn"
                                        onClick={() => startEditScore(r)}
                                      >
                                        Edit score
                                      </button>
                                    )}

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
                                ) : (
                                  <div className="tk-admin-panel">
                                    <div className="tk-admin-grid">
                                      <div>
                                        <label className="tk-small-label">{teamAName} goals</label>
                                        <input
                                          type="number"
                                          min="0"
                                          className="tk-small-input"
                                          value={editScoreA}
                                          onChange={(evt) => setEditScoreA(evt.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <label className="tk-small-label">{teamBName} goals</label>
                                        <input
                                          type="number"
                                          min="0"
                                          className="tk-small-input"
                                          value={editScoreB}
                                          onChange={(evt) => setEditScoreB(evt.target.value)}
                                        />
                                      </div>
                                    </div>

                                    <div className="tk-inline-actions">
                                      <button
                                        type="button"
                                        className="tk-edit-btn"
                                        onClick={() => saveEditScore(r)}
                                      >
                                        Save score
                                      </button>
                                      <button
                                        type="button"
                                        className="secondary-btn"
                                        onClick={cancelEditScore}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {isAddingEvent && (
                                  <div className="tk-admin-panel" style={{ marginTop: "0.75rem" }}>
                                    <div className="tk-admin-grid">
                                      <div>
                                        <label className="tk-small-label">Scorer</label>
                                        <input
                                          className="tk-small-input"
                                          value={newEventDraft.scorer}
                                          onChange={(evt) =>
                                            setNewEventDraft((prev) => ({
                                              ...prev,
                                              scorer: evt.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <label className="tk-small-label">Assist</label>
                                        <input
                                          className="tk-small-input"
                                          value={newEventDraft.assist}
                                          onChange={(evt) =>
                                            setNewEventDraft((prev) => ({
                                              ...prev,
                                              assist: evt.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <label className="tk-small-label">Type</label>
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
                                          <option value="shibobo">shibobo</option>
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