// src/pages/PlayerCardPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext.jsx";
import { toPng } from "html-to-image";
import TurfKingsLogo from "../assets/TurfKings_logo_transparent.png";

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

function safeNumber(v) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return null;
}

function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function clamp(min, val, max) {
  return Math.max(min, Math.min(max, val));
}

function round1(v) {
  return Math.round(Number(v || 0) * 10) / 10;
}

function hasPositiveNumber(v) {
  return typeof v === "number" && !Number.isNaN(v) && v > 0;
}

function blendPeerValue(adminVal, squadVal) {
  const admin = safeNumber(adminVal);
  const squad = safeNumber(squadVal);

  const hasAdmin = hasPositiveNumber(admin);
  const hasSquad = squad != null;

  if (hasAdmin && hasSquad) {
    return round1(admin * 0.2 + squad * 0.8);
  }
  if (hasAdmin) return round1(admin);
  if (hasSquad) return round1(squad);

  return null;
}

/**
 * Remap a 0–10 score into a visible 3–10 floor.
 * Used for both OVERALL and FORM.
 */
function applyScoreFloor(score10) {
  const raw = clamp(0, Number(score10 || 0), 10);
  return round1(3 + (raw / 10) * 7);
}

function makeStyleLabel(attackAvg, defenceAvg, gkAvg) {
  const vals = [
    { key: "attack", val: attackAvg ?? -1 },
    { key: "defence", val: defenceAvg ?? -1 },
    { key: "gk", val: gkAvg ?? -1 },
  ];

  const best = vals.reduce(
    (acc, cur) => (cur.val > acc.val ? cur : acc),
    { key: null, val: -1 }
  );

  if (best.val < 0) return "";

  if (best.key === "attack") {
    return "Profile: direct attacker, loves getting into scoring positions.";
  }
  if (best.key === "defence") {
    return "Profile: defensive anchor, breaks up play and protects the back.";
  }
  if (best.key === "gk") {
    return "Profile: safe hands in goal, big presence between the posts.";
  }
  return "";
}

function resolveCanonicalNameFromMap(rawName, map) {
  if (!rawName || typeof rawName !== "string") return "";

  const tc = toTitleCase(rawName);
  if (!tc) return "";

  const direct = map[safeLower(tc)];
  if (direct) return direct;

  const bySlug = map[slugFromName(tc)];
  if (bySlug) return bySlug;

  const fn = safeLower(firstNameOf(tc));
  if (fn && map[fn]) return map[fn];

  return tc;
}

function buildPlayersRegistry(playersSnap) {
  const mapNameToCanon = {};
  const mapCanonToShort = {};

  playersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    const fullName = toTitleCase(
      data.fullName ||
        data.displayName ||
        data.name ||
        data.playerName ||
        ""
    );

    const shortName = toTitleCase(
      data.shortName ||
        data.name ||
        data.displayName ||
        firstNameOf(fullName) ||
        fullName
    );

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

function buildParticipationForSeason(season, canonicalMap) {
  if (!season) return {};

  const history = Array.isArray(season.matchDayHistory)
    ? season.matchDayHistory
    : [];

  const next = {};

  const ensure = (canonName) => {
    if (!next[canonName]) {
      next[canonName] = {
        gamesPlayed: 0,
        matchDaysPresent: 0,
      };
    }
    return next[canonName];
  };

  history.forEach((day) => {
    const dayId = String(day?.id || day?.matchDayId || day?.date || "").trim();
    const appearances = Array.isArray(day?.playerAppearances)
      ? day.playerAppearances
      : [];

    const seenThisDay = new Set();

    appearances.forEach((entry) => {
      const raw =
        entry?.playerName ||
        entry?.shortName ||
        entry?.playerId ||
        "";

      const canon = resolveCanonicalNameFromMap(raw, canonicalMap);
      if (!canon) return;

      const p = ensure(canon);
      p.gamesPlayed += Number(entry?.matchesPlayed || 0);

      const key = `${dayId}|${safeLower(canon)}`;
      if (!seenThisDay.has(key)) {
        seenThisDay.add(key);
        p.matchDaysPresent += 1;
      }
    });
  });

  return next;
}

function buildParticipationFromMainDoc(mainSnap, canonicalMap, activeSeasonId) {
  if (!mainSnap.exists()) return {};

  const data = mainSnap.data() || {};
  const state = data.state || {};
  const seasons = Array.isArray(state.seasons) ? state.seasons : [];

  const targetSeason =
    seasons.find((s) => s?.seasonId === activeSeasonId) ||
    seasons[0] ||
    null;

  return buildParticipationForSeason(targetSeason, canonicalMap);
}

function buildBaselinesBySeasonFromSnap(baselinesSnap, canonicalMap) {
  const out = {};

  baselinesSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const seasonId = String(data.seasonId || "UNKNOWN_SEASON").trim();
    const canonical = resolveCanonicalNameFromMap(data.targetName || "", canonicalMap);

    if (!canonical) return;

    if (!out[seasonId]) out[seasonId] = {};

    out[seasonId][canonical] = {
      attack: hasPositiveNumber(Number(data.attack)) ? Number(data.attack) : null,
      defence: hasPositiveNumber(Number(data.defence)) ? Number(data.defence) : null,
      gk: hasPositiveNumber(Number(data.gk)) ? Number(data.gk) : null,
    };
  });

  return out;
}

function buildBaselinesFromSnap(baselinesSnap, canonicalMap, activeSeasonId) {
  const allBySeason = buildBaselinesBySeasonFromSnap(baselinesSnap, canonicalMap);
  const seasonMatches = allBySeason[String(activeSeasonId || "")] || {};
  const fallbackUnknown = allBySeason.UNKNOWN_SEASON || {};
  const next = {};

  const allNames = new Set([
    ...Object.keys(seasonMatches),
    ...Object.keys(fallbackUnknown),
  ]);

  allNames.forEach((name) => {
    next[name] = seasonMatches[name] || fallbackUnknown[name];
  });

  return next;
}

function buildCloudPhotosIndex(photoSnap) {
  const idx = {};

  photoSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const docId = docSnap.id;
    const name = toTitleCase(data.name || "");

    if (!data.photoData) return;

    const keys = new Set();

    if (name) {
      keys.add(safeLower(name));
      keys.add(slugFromName(name));
      const fn = safeLower(firstNameOf(name));
      if (fn) keys.add(fn);
    }

    if (docId) keys.add(safeLower(docId));

    keys.forEach((k) => {
      if (!k) return;
      if (!idx[k]) idx[k] = data.photoData;
    });
  });

  return idx;
}

function collectSeasonEvents(season) {
  const history = Array.isArray(season?.matchDayHistory)
    ? season.matchDayHistory
    : [];
  return history.flatMap((day) =>
    Array.isArray(day?.allEvents) ? day.allEvents : []
  );
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

function buildSeasonStatsByPlayer(events, canonicalMap) {
  const stats = {};

  const ensure = (canonName) => {
    if (!stats[canonName]) {
      stats[canonName] = {
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        gkCleanSheets: 0,
        defCleanSheets: 0,
        points: 0,
        rawStatsScore: 0,
      };
    }
    return stats[canonName];
  };

  dedupeEvents(events).forEach((e) => {
    if (!e) return;

    if (e.type === "clean_sheet") {
      const holderName = e.playerName || e.scorer || "";
      const canonHolder = resolveCanonicalNameFromMap(holderName, canonicalMap);
      if (!canonHolder) return;

      const s = ensure(canonHolder);
      s.cleanSheets += 1;
      if (e.role === "gk") s.gkCleanSheets += 1;
      if (e.role === "def") s.defCleanSheets += 1;
      return;
    }

    if (e.scorer && e.type === "goal") {
      const canonScorer = resolveCanonicalNameFromMap(e.scorer, canonicalMap);
      if (canonScorer) {
        const s = ensure(canonScorer);
        s.goals += 1;
      }
    }

    if (e.assist) {
      const canonAssist = resolveCanonicalNameFromMap(e.assist, canonicalMap);
      if (canonAssist) {
        const a = ensure(canonAssist);
        a.assists += 1;
      }
    }
  });

  Object.values(stats).forEach((p) => {
    p.points = p.goals + p.assists + p.defCleanSheets + p.gkCleanSheets;
    p.rawStatsScore = p.points;
  });

  return stats;
}

function buildPeerScore10FromBaseline(baseline) {
  if (!baseline) return null;

  const vals = [
    safeNumber(baseline.attack),
    safeNumber(baseline.defence),
    safeNumber(baseline.gk),
  ].filter((v) => v != null);

  if (!vals.length) return null;

  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return clamp(0, 2 * avg, 10);
}

function buildCarrySnapshotsForPreviousSeason(previousSeason, canonicalMap, baselinesBySeason) {
  if (!previousSeason) return {};

  const seasonId = String(previousSeason?.seasonId || "").trim();
  const events = collectSeasonEvents(previousSeason);
  const statsByPlayer = buildSeasonStatsByPlayer(events, canonicalMap);
  const participationByPlayer = buildParticipationForSeason(previousSeason, canonicalMap);
  const baselinesForSeason =
    baselinesBySeason[seasonId] || baselinesBySeason.UNKNOWN_SEASON || {};

  const allNames = new Set([
    ...Object.keys(statsByPlayer || {}),
    ...Object.keys(participationByPlayer || {}),
    ...Object.keys(baselinesForSeason || {}),
  ]);

  let maxRaw = 0;
  let maxPpg = 0;

  Object.entries(statsByPlayer || {}).forEach(([canonName, p]) => {
    if (p.rawStatsScore > maxRaw) maxRaw = p.rawStatsScore;
    const gp = Number(participationByPlayer?.[canonName]?.gamesPlayed || 0);
    const ppg = gp > 0 ? p.points / gp : 0;
    if (ppg > maxPpg) maxPpg = ppg;
  });

  if (maxRaw <= 0) maxRaw = 1;
  if (maxPpg <= 0) maxPpg = 1;

  const out = {};

  allNames.forEach((canonName) => {
    if (!canonName) return;

    const stats = statsByPlayer[canonName] || {
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      gkCleanSheets: 0,
      defCleanSheets: 0,
      points: 0,
      rawStatsScore: 0,
    };

    const participation = participationByPlayer[canonName] || {
      gamesPlayed: 0,
      matchDaysPresent: 0,
    };

    const gamesPlayed = Number(participation.gamesPlayed || 0);
    const pointsPerGame = gamesPlayed > 0 ? stats.points / gamesPlayed : 0;
    const statsScore10 = clamp(0, (stats.rawStatsScore / maxRaw) * 10, 10);
    const peerScore10 = buildPeerScore10FromBaseline(baselinesForSeason[canonName]);

    let visibleForm = null;
    let visibleOverall = 0;

    if (gamesPlayed > 0) {
      const rawForm =
        peerScore10 != null
          ? round1(pointsPerGame / maxPpg * 10 * 0.7 + peerScore10 * 0.3)
          : round1((pointsPerGame / maxPpg) * 10);

      const rawOverall =
        peerScore10 != null
          ? round1(statsScore10 * 0.4 + peerScore10 * 0.3 + rawForm * 0.3)
          : round1(statsScore10 * 0.65 + rawForm * 0.35);

      visibleForm = applyScoreFloor(rawForm);
      visibleOverall = applyScoreFloor(rawOverall);
    } else {
      visibleForm = peerScore10 != null ? applyScoreFloor(peerScore10) : null;
      visibleOverall = peerScore10 != null ? applyScoreFloor(peerScore10) : 0;
    }

    out[canonName] = {
      overall: round1(visibleOverall),
      form: visibleForm != null ? round1(visibleForm) : null,
    };
  });

  return out;
}

function buildTeamStandingsFromResults(results = [], teamsSnapshot = []) {
  const standings = {};

  (teamsSnapshot || []).forEach((t) => {
    if (!t?.id) return;
    standings[t.id] = {
      teamId: t.id,
      name: t.label || "",
      points: 0,
      goalDiff: 0,
      goalsFor: 0,
      played: 0,
    };
  });

  (results || []).forEach((r) => {
    const a = standings[r?.teamAId];
    const b = standings[r?.teamBId];
    if (!a || !b) return;

    const gA = Number(r?.goalsA || 0);
    const gB = Number(r?.goalsB || 0);

    a.played += 1;
    b.played += 1;

    a.goalsFor += gA;
    b.goalsFor += gB;

    a.goalDiff += gA - gB;
    b.goalDiff += gB - gA;

    if (r?.isDraw) {
      a.points += 1;
      b.points += 1;
    } else if (r?.winnerId === r?.teamAId) {
      a.points += 3;
    } else if (r?.winnerId === r?.teamBId) {
      b.points += 3;
    }
  });

  return Object.values(standings).sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
    if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
    return String(x.name || "").localeCompare(String(y.name || ""));
  });
}

function collectResultsFromMatchDayHistory(history = []) {
  return (history || []).flatMap((day) =>
    Array.isArray(day?.results) ? day.results : []
  );
}

function collectCurrentLiveResults(mainData = {}, activeSeason = null) {
  const state = mainData?.state || {};

  const candidates = [
    state.results,
    state.currentResults,
    state.matchResults,
    mainData.results,
    mainData.currentResults,
    mainData.matchResults,
    activeSeason?.results,
    activeSeason?.currentResults,
    state.currentMatchDay?.results,
    mainData.currentMatchDay?.results,
  ];

  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr;
    }
  }

  return [];
}

function getCurrentTeamsSnapshot(mainData = {}, activeSeason = null) {
  const state = mainData?.state || {};

  const candidates = [
    activeSeason?.teamsSnapshot,
    activeSeason?.teams,
    state.teams,
    state.currentTeams,
    mainData.teams,
    mainData.currentTeams,
  ];

  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr;
    }
  }

  return [];
}

/**
 * Prefer previous archived season when it exists.
 * If not, fall back to current live season (archived matchDayHistory + live current results).
 */
function buildChampionshipStarsByPlayer(mainSnap, canonicalMap, activeSeasonId) {
  if (!mainSnap.exists()) return {};

  const mainData = mainSnap.data() || {};
  const state = mainData.state || {};
  const seasons = Array.isArray(state.seasons) ? state.seasons : [];

  const activeIndex = seasons.findIndex(
    (s) => String(s?.seasonId || "") === String(activeSeasonId || "")
  );

  const activeSeason =
    activeIndex >= 0
      ? seasons[activeIndex]
      : seasons.find((s) => s?.seasonId === activeSeasonId) || seasons[0] || null;

  const previousSeason =
    activeIndex > 0
      ? seasons[activeIndex - 1]
      : seasons.length > 1
        ? seasons[seasons.length - 2]
        : null;

  let championTeam = null;

  if (previousSeason) {
    const prevTeams =
      Array.isArray(previousSeason?.teamsSnapshot) && previousSeason.teamsSnapshot.length > 0
        ? previousSeason.teamsSnapshot
        : Array.isArray(previousSeason?.teams)
          ? previousSeason.teams
          : [];

    const prevResults = collectResultsFromMatchDayHistory(
      Array.isArray(previousSeason?.matchDayHistory)
        ? previousSeason.matchDayHistory
        : []
    );

    const prevStandings = buildTeamStandingsFromResults(prevResults, prevTeams);
    const winner = prevStandings[0] || null;

    if (winner) {
      championTeam = prevTeams.find((t) => t?.id === winner.teamId) || null;
    }
  } else {
    const currentTeams = getCurrentTeamsSnapshot(mainData, activeSeason);
    const archivedCurrentSeasonResults = collectResultsFromMatchDayHistory(
      Array.isArray(activeSeason?.matchDayHistory)
        ? activeSeason.matchDayHistory
        : []
    );
    const liveCurrentResults = collectCurrentLiveResults(mainData, activeSeason);

    const seen = new Set();
    const combinedResults = [...archivedCurrentSeasonResults, ...liveCurrentResults].filter((r) => {
      if (!r) return false;
      const key =
        r?.id ??
        [
          r?.matchNo ?? "m?",
          r?.teamAId ?? "a?",
          r?.teamBId ?? "b?",
          r?.goalsA ?? "ga?",
          r?.goalsB ?? "gb?",
          r?.winnerId ?? "w?",
          r?.isDraw ? "d1" : "d0",
        ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const currentStandings = buildTeamStandingsFromResults(combinedResults, currentTeams);
    const winner = currentStandings[0] || null;

    if (winner) {
      championTeam = currentTeams.find((t) => t?.id === winner.teamId) || null;
    }
  }

  const stars = {};
  const players = Array.isArray(championTeam?.players) ? championTeam.players : [];

  players.forEach((p) => {
    const raw =
      typeof p === "string" ? p : p?.name || p?.displayName || "";
    const canon = resolveCanonicalNameFromMap(raw, canonicalMap);
    if (!canon) return;
    stars[canon] = Number(stars[canon] || 0) + 1;
  });

  return stars;
}

function getCarryWeights(matchDaysPresent) {
  const md = Number(matchDaysPresent || 0);

  if (md <= 0) return { prev: 1, current: 0 };
  if (md === 1) return { prev: 0.7, current: 0.3 };
  if (md === 2) return { prev: 0.35, current: 0.65 };
  return { prev: 0, current: 1 };
}

// ---------------- PAGE ----------------

export function PlayerCardPage({
  teams,
  allEvents,
  archivedEvents = [],
  peerRatingsByPlayer,
  playerPhotosByName,
  activeSeasonId = null,
  onBack,
}) {
  const { authUser } = useAuth() || {};
  const user = authUser || null;

  const authIdentityKey = useMemo(() => {
    const dn = safeLower(user?.displayName || "");
    const em = safeLower(user?.email || "");
    return dn || em || "";
  }, [user]);

  const seasonEvents = useMemo(
    () => [...(archivedEvents || []), ...(allEvents || [])],
    [archivedEvents, allEvents]
  );

  const peerRatingsRaw = peerRatingsByPlayer || {};

  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [nameToCanonical, setNameToCanonical] = useState({});
  const [canonicalToShort, setCanonicalToShort] = useState({});
  const [participationByPlayer, setParticipationByPlayer] = useState({});
  const [participationLoaded, setParticipationLoaded] = useState(false);

  const [baselineByPlayer, setBaselineByPlayer] = useState({});
  const [baselineLoaded, setBaselineLoaded] = useState(false);

  const [cloudPhotosIndex, setCloudPhotosIndex] = useState({});
  const [savingCardId, setSavingCardId] = useState("");
  const [carrySnapshotByPlayer, setCarrySnapshotByPlayer] = useState({});
  const [championshipStarsByPlayer, setChampionshipStarsByPlayer] = useState({});
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const cardRefs = useRef({});
  const longPressTimers = useRef({});
  const didHandlePhoneBackRef = useRef(false);
  const canonicalNameCacheRef = useRef({});

  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 6);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ---------------- LOAD ALL PAGE DATA ----------------
  useEffect(() => {
    let isMounted = true;

    async function loadPageData() {
      try {
        setPlayersLoaded(false);
        setParticipationLoaded(false);
        setBaselineLoaded(false);

        const [playersSnap, mainSnap, baselinesSnap, photosSnap] = await Promise.all([
          getDocs(collection(db, "players")),
          getDoc(doc(db, "appState_v2", "main")),
          getDocs(collection(db, "peerRatingBaselines")),
          getDocs(collection(db, "playerPhotos")),
        ]);

        if (!isMounted) return;

        const { mapNameToCanon, mapCanonToShort } = buildPlayersRegistry(playersSnap);
        const participation = buildParticipationFromMainDoc(
          mainSnap,
          mapNameToCanon,
          activeSeasonId
        );
        const baselines = buildBaselinesFromSnap(
          baselinesSnap,
          mapNameToCanon,
          activeSeasonId
        );
        const baselinesBySeason = buildBaselinesBySeasonFromSnap(
          baselinesSnap,
          mapNameToCanon
        );
        const cloudPhotos = buildCloudPhotosIndex(photosSnap);

        const mainData = mainSnap.exists() ? mainSnap.data() || {} : {};
        const seasons = Array.isArray(mainData?.state?.seasons)
          ? mainData.state.seasons
          : [];

        const activeIndex = seasons.findIndex(
          (s) => String(s?.seasonId || "") === String(activeSeasonId || "")
        );

        const previousSeason =
          activeIndex > 0
            ? seasons[activeIndex - 1]
            : null;

        const carrySnapshots = buildCarrySnapshotsForPreviousSeason(
          previousSeason,
          mapNameToCanon,
          baselinesBySeason
        );

        const starsByPlayer = buildChampionshipStarsByPlayer(
          mainSnap,
          mapNameToCanon,
          activeSeasonId
        );

        canonicalNameCacheRef.current = {};

        setNameToCanonical(mapNameToCanon);
        setCanonicalToShort(mapCanonToShort);
        setParticipationByPlayer(participation);
        setBaselineByPlayer(baselines);
        setCloudPhotosIndex(cloudPhotos);
        setCarrySnapshotByPlayer(carrySnapshots);
        setChampionshipStarsByPlayer(starsByPlayer);

        setPlayersLoaded(true);
        setParticipationLoaded(true);
        setBaselineLoaded(true);
      } catch (err) {
        console.error("Failed to load PlayerCardPage data:", err);

        if (!isMounted) return;

        canonicalNameCacheRef.current = {};
        setNameToCanonical({});
        setCanonicalToShort({});
        setParticipationByPlayer({});
        setBaselineByPlayer({});
        setCloudPhotosIndex({});
        setCarrySnapshotByPlayer({});
        setChampionshipStarsByPlayer({});

        setPlayersLoaded(true);
        setParticipationLoaded(true);
        setBaselineLoaded(true);
      }
    }

    loadPageData();

    return () => {
      isMounted = false;
    };
  }, [activeSeasonId]);

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

  const mergedPhotoIndex = useMemo(() => {
    const idx = {};

    const addPhotoKey = (key, url) => {
      const k = safeLower(key);
      if (!k || !url) return;
      if (!idx[k]) idx[k] = url;
    };

    Object.entries(playerPhotosByName || {}).forEach(([k, url]) => {
      addPhotoKey(k, url);
      addPhotoKey(slugFromName(k), url);
      addPhotoKey(firstNameOf(k), url);
    });

    Object.entries(cloudPhotosIndex || {}).forEach(([k, url]) => {
      addPhotoKey(k, url);
    });

    (teams || []).forEach((t) => {
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
  }, [playerPhotosByName, cloudPhotosIndex, teams]);

  const getPlayerPhoto = useCallback(
    (canonicalFullName, shortName = "") => {
      const candidates = [];

      const cn = toTitleCase(canonicalFullName || "");
      const sn = toTitleCase(shortName || "");

      if (cn) candidates.push(cn);
      if (sn && sn !== cn) candidates.push(sn);

      const fn1 = firstNameOf(cn);
      const fn2 = firstNameOf(sn);
      if (fn1) candidates.push(fn1);
      if (fn2 && fn2 !== fn1) candidates.push(fn2);

      if (cn) candidates.push(slugFromName(cn));
      if (sn) candidates.push(slugFromName(sn));

      for (const c of candidates) {
        const k = safeLower(c);
        if (k && mergedPhotoIndex[k]) return mergedPhotoIndex[k];
      }

      return null;
    },
    [mergedPhotoIndex]
  );

  // ---------------- EVENTS / STATS ----------------
  const uniqueEvents = useMemo(() => {
    return dedupeEvents(seasonEvents);
  }, [seasonEvents]);

  const peerRatingsCanon = useMemo(() => {
    const out = {};
    Object.entries(peerRatingsRaw || {}).forEach(([rawName, val]) => {
      const canon = resolveCanonicalName(rawName);
      if (!canon) return;
      if (!out[canon]) out[canon] = val;
    });
    return out;
  }, [peerRatingsRaw, resolveCanonicalName]);

  const statsByPlayer = useMemo(() => {
    return buildSeasonStatsByPlayer(uniqueEvents, nameToCanonical);
  }, [uniqueEvents, nameToCanonical]);

  const playerTeamMap = useMemo(() => {
    const map = {};

    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const raw =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        const canon = resolveCanonicalName(raw);
        if (canon && !map[canon]) {
          map[canon] = t.label;
        }
      });
    });

    return map;
  }, [teams, resolveCanonicalName]);

  const playersWithRatings = useMemo(() => {
    const allNames = new Set([
      ...Object.keys(statsByPlayer || {}),
      ...Object.keys(peerRatingsCanon || {}),
      ...Object.keys(participationByPlayer || {}),
      ...Object.keys(baselineByPlayer || {}),
      ...Object.keys(carrySnapshotByPlayer || {}),
      ...Object.keys(championshipStarsByPlayer || {}),
    ]);

    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const raw =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        const canon = resolveCanonicalName(raw);
        if (canon) allNames.add(canon);
      });
    });

    let maxRaw = 0;
    let maxPpg = 0;

    Object.entries(statsByPlayer || {}).forEach(([canonName, p]) => {
      if (p.rawStatsScore > maxRaw) maxRaw = p.rawStatsScore;

      const gp = Number(participationByPlayer?.[canonName]?.gamesPlayed || 0);
      const ppg = gp > 0 ? p.points / gp : 0;
      if (ppg > maxPpg) maxPpg = ppg;
    });

    if (maxRaw <= 0) maxRaw = 1;
    if (maxPpg <= 0) maxPpg = 1;

    const out = [];

    allNames.forEach((canonName) => {
      if (!canonName) return;

      const stats = statsByPlayer[canonName] || {
        name: canonName,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        gkCleanSheets: 0,
        defCleanSheets: 0,
        points: 0,
        rawStatsScore: 0,
      };

      const peer = peerRatingsCanon[canonName] || null;
      const baseline = baselineByPlayer[canonName] || null;
      const carry = carrySnapshotByPlayer[canonName] || null;

      const participation = participationByPlayer[canonName] || {
        gamesPlayed: 0,
        matchDaysPresent: 0,
      };

      const gamesPlayed = Number(participation.gamesPlayed || 0);
      const matchDaysPresent = Number(participation.matchDaysPresent || 0);

      const pointsPerGame = gamesPlayed > 0 ? stats.points / gamesPlayed : 0;
      const statsScore10 = clamp(0, (stats.rawStatsScore / maxRaw) * 10, 10);

      const squadAttackAvg = peer ? safeNumber(peer.attackAvg) : null;
      const squadDefenceAvg = peer ? safeNumber(peer.defenceAvg) : null;
      const squadGkAvg = peer ? safeNumber(peer.gkAvg) : null;

      const adminAttack = baseline ? safeNumber(baseline.attack) : null;
      const adminDefence = baseline ? safeNumber(baseline.defence) : null;
      const adminGk = baseline ? safeNumber(baseline.gk) : null;

      const attackAvg = blendPeerValue(adminAttack, squadAttackAvg);
      const defenceAvg = blendPeerValue(adminDefence, squadDefenceAvg);
      const gkAvg = blendPeerValue(adminGk, squadGkAvg);

      let peerScore10 = null;
      const validVals = [attackAvg, defenceAvg, gkAvg].filter((v) => v != null);

      if (validVals.length > 0) {
        const avgAttr = validVals.reduce((a, b) => a + b, 0) / validVals.length;
        peerScore10 = clamp(0, 2 * avgAttr, 10);
      }

      const ppgScore10 = clamp(0, (pointsPerGame / maxPpg) * 10, 10);

      let currentVisibleForm = null;
      let currentVisibleOverall = 0;

      if (gamesPlayed > 0) {
        const rawForm =
          peerScore10 != null
            ? round1(ppgScore10 * 0.7 + peerScore10 * 0.3)
            : round1(ppgScore10);

        const rawOverall =
          peerScore10 != null
            ? round1(
                statsScore10 * 0.4 + peerScore10 * 0.3 + rawForm * 0.3
              )
            : round1(statsScore10 * 0.65 + rawForm * 0.35);

        currentVisibleForm = applyScoreFloor(rawForm);
        currentVisibleOverall = applyScoreFloor(rawOverall);
      } else {
        currentVisibleForm = null;
        currentVisibleOverall = peerScore10 != null ? applyScoreFloor(peerScore10) : 0;
      }

      const weights = getCarryWeights(matchDaysPresent);

      let visibleForm = currentVisibleForm;
      if (carry?.form != null) {
        if (currentVisibleForm != null) {
          visibleForm = round1(carry.form * weights.prev + currentVisibleForm * weights.current);
        } else {
          visibleForm = round1(carry.form);
        }
      }

      let visibleOverall = currentVisibleOverall;
      if (carry?.overall != null) {
        if (currentVisibleOverall > 0 || matchDaysPresent > 0) {
          visibleOverall = round1(
            carry.overall * weights.prev + currentVisibleOverall * weights.current
          );
        } else {
          visibleOverall = round1(carry.overall);
        }
      }

      const styleLabel = makeStyleLabel(attackAvg, defenceAvg, gkAvg);
      const displayName = canonName;
      const shortName = resolveShortDisplay(canonName);
      const photoUrl = getPlayerPhoto(canonName, shortName);

      const isYou =
        !!authIdentityKey &&
        safeLower(resolveCanonicalName(authIdentityKey)) ===
          safeLower(canonName);

      out.push({
        id: safeLower(canonName),
        name: canonName,
        displayName,
        shortName,
        teamName: playerTeamMap[canonName] || "—",
        photoUrl,

        goals: stats.goals,
        assists: stats.assists,
        gkCleanSheets: stats.gkCleanSheets,
        defCleanSheets: stats.defCleanSheets,
        points: stats.points,

        gamesPlayed,
        matchDaysPresent,

        statsScore10: round1(statsScore10),
        formScore10: visibleForm != null ? round1(visibleForm) : null,
        peerScore10: peerScore10 != null ? round1(peerScore10) : null,
        attackAvg,
        defenceAvg,
        gkAvg,
        overall: round1(visibleOverall),
        styleLabel,
        isYou,
        championshipStars: Number(championshipStarsByPlayer[canonName] || 0),
      });
    });

    out.sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;

      const aForm = a.formScore10 == null ? -1 : a.formScore10;
      const bForm = b.formScore10 == null ? -1 : b.formScore10;
      if (bForm !== aForm) return bForm - aForm;

      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;

      return String(a.displayName || "").localeCompare(
        String(b.displayName || "")
      );
    });

    return out;
  }, [
    statsByPlayer,
    peerRatingsCanon,
    baselineByPlayer,
    participationByPlayer,
    playerTeamMap,
    teams,
    authIdentityKey,
    getPlayerPhoto,
    resolveCanonicalName,
    resolveShortDisplay,
    carrySnapshotByPlayer,
    championshipStarsByPlayer,
  ]);

  const [teamFilter, setTeamFilter] = useState("ALL");
  const [playerViewFilter, setPlayerViewFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");

  const searchLower = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredPlayers = useMemo(() => {
    return playersWithRatings.filter((p) => {
      if (playerViewFilter === "ACTIVE" && Number(p.gamesPlayed || 0) <= 0) {
        return false;
      }

      if (playerViewFilter === "OFF_SEASON" && Number(p.gamesPlayed || 0) > 0) {
        return false;
      }

      if (teamFilter !== "ALL" && p.teamName && p.teamName !== teamFilter) {
        return false;
      }

      if (!searchLower) return true;

      const dn = (p.displayName || "").toLowerCase();
      const tn = (p.teamName || "").toLowerCase();

      return dn.includes(searchLower) || tn.includes(searchLower);
    });
  }, [playersWithRatings, playerViewFilter, teamFilter, searchLower]);

  const uniqueTeams = useMemo(() => {
    const set = new Set();
    (teams || []).forEach((t) => set.add(t.label));
    return ["ALL", ...Array.from(set)];
  }, [teams]);

  // ---------------- PHONE BACK BUTTON SUPPORT ----------------
  useEffect(() => {
    if (typeof window === "undefined" || typeof onBack !== "function") return;

    didHandlePhoneBackRef.current = false;

    const stateMarker = {
      tkPage: "player-cards",
      tkTs: Date.now(),
    };

    window.history.pushState(stateMarker, "", window.location.href);

    const handlePopState = () => {
      if (didHandlePhoneBackRef.current) return;
      didHandlePhoneBackRef.current = true;
      onBack();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onBack]);

  async function saveCardImage(player) {
    try {
      const node = cardRefs.current[player.id];
      if (!node) return;

      setSavingCardId(player.id);

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 4,
        backgroundColor: "#0b1220",
      });

      const link = document.createElement("a");
      link.download = `${slugFromName(
        player.displayName || player.name
      )}_card.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to save card:", err);
      window.alert("Could not save this card as an image.");
    } finally {
      setSavingCardId("");
    }
  }

  function startLongPress(player) {
    clearLongPress(player.id);
    longPressTimers.current[player.id] = window.setTimeout(() => {
      saveCardImage(player);
    }, 650);
  }

  function clearLongPress(playerId) {
    const t = longPressTimers.current[playerId];
    if (t) {
      window.clearTimeout(t);
      delete longPressTimers.current[playerId];
    }
  }

  function getFormArrow(player) {
    if (player.formScore10 == null) {
      return { symbol: "", color: "transparent" };
    }
    if (player.formScore10 > player.overall) {
      return { symbol: "↑", color: "#22c55e" };
    }
    if (player.formScore10 < player.overall) {
      return { symbol: "↓", color: "#ef4444" };
    }
    return { symbol: "", color: "transparent" };
  }

  return (
    <div className="page player-cards-page">
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
              <h1 style={{ margin: 0 }}>Player cards</h1>
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

      <section className="card player-card-filters">
        <div className="player-card-filters-row">
          <div className="player-card-filter player-card-filter-view">
            <label>Players in</label>

            <div
              className="segmented-toggle"
              role="tablist"
              aria-label="Player card view filter"
            >
              <button
                type="button"
                className={
                  playerViewFilter === "ACTIVE"
                    ? "segmented-option active"
                    : "segmented-option"
                }
                onClick={() => setPlayerViewFilter("ACTIVE")}
                aria-pressed={playerViewFilter === "ACTIVE"}
              >
                Active season
              </button>

              <button
                type="button"
                className={
                  playerViewFilter === "OFF_SEASON"
                    ? "segmented-option active"
                    : "segmented-option"
                }
                onClick={() => setPlayerViewFilter("OFF_SEASON")}
                aria-pressed={playerViewFilter === "OFF_SEASON"}
              >
                Off-season
              </button>
            </div>
          </div>

          <div className="player-card-filter">
            <label>Team</label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              {uniqueTeams.map((t) => (
                <option key={t} value={t}>
                  {t === "ALL" ? "All teams" : t}
                </option>
              ))}
            </select>
          </div>

          <div className="player-card-filter">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search by player or team"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="card player-card-grid-card">
        {!playersLoaded || !participationLoaded || !baselineLoaded ? (
          <p className="muted">Loading player cards…</p>
        ) : filteredPlayers.length === 0 ? (
          <p className="muted">
            {playerViewFilter === "OFF_SEASON"
              ? "No off-season players found for this filter."
              : "No active season players found for this filter."}
          </p>
        ) : (
          <div className="player-card-grid">
            {filteredPlayers.map((p) => {
              const displayName = p.displayName || p.name || "";
              const formArrow = getFormArrow(p);
              const showForm = p.formScore10 != null;
              const starCount = Number(p.championshipStars || 0);

              return (
                <article
                  key={p.id}
                  ref={(el) => {
                    if (el) cardRefs.current[p.id] = el;
                  }}
                  onDoubleClick={() => saveCardImage(p)}
                  onTouchStart={() => startLongPress(p)}
                  onTouchEnd={() => clearLongPress(p.id)}
                  onTouchMove={() => clearLongPress(p.id)}
                  onTouchCancel={() => clearLongPress(p.id)}
                  className={
                    p.isYou
                      ? "player-card fifa-card player-card-you"
                      : "player-card fifa-card"
                  }
                  style={{
                    cursor: "pointer",
                    position: "relative",
                    opacity: savingCardId === p.id ? 0.88 : 1,
                    overflow: "hidden",
                  }}
                  title="Double-click to save card. On mobile, long-press to save."
                >
                  <img
                    src={TurfKingsLogo}
                    alt=""
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      right: "0.8rem",
                      bottom: "1rem",
                      width: "110px",
                      height: "110px",
                      objectFit: "contain",
                      opacity: 0.8,
                      filter: "grayscale(0.1) brightness(1.1)",
                      pointerEvents: "none",
                      userSelect: "none",
                      zIndex: 0,
                    }}
                  />

                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div className="fifa-card-top">
                      <div className="fifa-rating-block">
                        {starCount > 0 ? (
                          <div
                            title={`${starCount} championship title${starCount > 1 ? "s" : ""}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.12rem",
                              marginBottom: "0.18rem",
                              minHeight: "0.95rem",
                              flexWrap: "wrap",
                            }}
                          >
                            {Array.from({ length: starCount }).map((_, idx) => (
                              <span
                                key={`${p.id}-star-${idx}`}
                                style={{
                                  color: "#facc15",
                                  fontSize: "0.82rem",
                                  lineHeight: 1,
                                  textShadow: "0 0 8px rgba(250,204,21,0.45)",
                                }}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ minHeight: "0.95rem" }} />
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.28rem",
                          }}
                        >
                          <span className="fifa-rating-score">
                            {p.overall.toFixed(1)}
                          </span>

                          {showForm ? (
                            <sup
                              title={`Form ${p.formScore10.toFixed(1)}/10`}
                              style={{
                                fontSize: "1rem",
                                fontWeight: 900,
                                lineHeight: 1,
                                marginTop: "0.18rem",
                                display: "inline-flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: "0.08rem",
                                minWidth: "2.5rem",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.14rem",
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-block",
                                    minWidth: "0.18rem",
                                  }}
                                />
                                <span>{p.formScore10.toFixed(1)}</span>
                                {formArrow.symbol ? (
                                  <span
                                    style={{
                                      color: formArrow.color,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {formArrow.symbol}
                                  </span>
                                ) : null}
                              </span>

                              <span
                                style={{
                                  fontSize: "0.52rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                  opacity: 1.2,
                                  paddingLeft: "0.18rem",
                                }}
                              >
                                FORM
                              </span>
                            </sup>
                          ) : null}
                        </div>

                        <span className="fifa-rating-pos">OVERALL</span>
                      </div>

                      <div className="fifa-photo-wrap">
                        {p.photoUrl ? (
                          <img
                            src={p.photoUrl}
                            alt={displayName}
                            className="fifa-photo-img"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="fifa-photo-placeholder">
                            {getInitials(displayName)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="fifa-name-bar">
                      <span className="fifa-name">
                        {displayName}
                        {p.isYou && <span className="you-pill"> • You</span>}
                      </span>
                      <span className="fifa-team">{p.teamName}</span>
                    </div>

                    <div className="fifa-mid-row">
                      <div className="fifa-chip">
                        <span className="chip-label">Stats</span>
                        <span className="chip-value">
                          {p.statsScore10.toFixed(1)}/10
                        </span>
                      </div>
                      <div className="fifa-chip">
                        <span className="chip-label">Peer</span>
                        <span className="chip-value">
                          {p.peerScore10 != null
                            ? `${p.peerScore10.toFixed(1)}/10`
                            : "Not rated yet"}
                        </span>
                      </div>
                    </div>

                    <div className="fifa-attr-grid">
                      <div className="fifa-attr-cell">
                        <span className="fifa-attr-label">ATT</span>
                        {p.attackAvg != null ? (
                          <>
                            <span className="fifa-attr-value">
                              {p.attackAvg.toFixed(1)}/5
                            </span>
                            <span className="fifa-attr-desc">ATTACK</span>
                          </>
                        ) : (
                          <span className="fifa-attr-desc fifa-attr-unrated">
                            No votes yet
                          </span>
                        )}
                      </div>

                      <div className="fifa-attr-cell">
                        <span className="fifa-attr-label">DEF</span>
                        {p.defenceAvg != null ? (
                          <>
                            <span className="fifa-attr-value">
                              {p.defenceAvg.toFixed(1)}/5
                            </span>
                            <span className="fifa-attr-desc">DEFENCE</span>
                          </>
                        ) : (
                          <span className="fifa-attr-desc fifa-attr-unrated">
                            No votes yet
                          </span>
                        )}
                      </div>

                      <div className="fifa-attr-cell">
                        <span className="fifa-attr-label">GK</span>
                        {p.gkAvg != null ? (
                          <>
                            <span className="fifa-attr-value">
                              {p.gkAvg.toFixed(1)}/5
                            </span>
                            <span className="fifa-attr-desc">GOALKEEPING</span>
                          </>
                        ) : (
                          <span className="fifa-attr-desc fifa-attr-unrated">
                            No votes yet
                          </span>
                        )}
                      </div>

                      <div className="fifa-attr-cell">
                        <span className="fifa-attr-label">TOTAL</span>
                        <span className="fifa-attr-value">{p.points}</span>
                        <span className="fifa-attr-desc">
                          points in {p.gamesPlayed} matches
                        </span>
                      </div>
                    </div>

                    <div className="fifa-bottom-stats">
                      <span>⚽ {p.goals} Goals</span>
                      <span>🎯 {p.assists} Assists</span>
                      <span>🥅 {p.gkCleanSheets} Saves CS</span>
                      <span>🌀 {p.defCleanSheets} Defence CS</span>
                    </div>

                    {p.styleLabel && (
                      <p
                        className="player-card-style"
                        style={{
                          maxWidth: "65%",
                          width: "65%",
                          paddingRight: "0.35rem",
                          boxSizing: "border-box",
                          position: "relative",
                          zIndex: 1,
                        }}
                      >
                        {p.styleLabel}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}