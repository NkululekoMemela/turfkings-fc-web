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

const MASTER_CODE = "3333";
const MATCH_SECONDS = 5 * 60;

// ✅ V2 switch
const USE_V2 = true;

// ✅ Show staging badge only when using staging mode
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

function getStoredRole(identity) {
  const role = String(
    identity?.actingRole || identity?.role || "spectator"
  )
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

  return Array.from(
    new Set(expanded.map((v) => safeLower(v)).filter(Boolean))
  );
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

  // spectator choice must stay spectator unless this person is actually a current captain/admin
  if (storedRole === "spectator" && !isDynamicCaptain) return "spectator";

  // admin preview/admin identity must stay admin
  if (storedRole === "admin") return "admin";

  // either dynamic captain from squads OR preview captain mode
  if (isDynamicCaptain || storedRole === "captain") return "captain";

  return "player";
}

/* ---------------- State helpers ---------------- */

function ensureV2StateShape(s) {
  const fallback = createDefaultStateV2();
  if (!s || typeof s !== "object") return fallback;

  const activeSeasonId =
    s.activeSeasonId || s.seasons?.[0]?.seasonId || fallback.activeSeasonId;

  const seasons =
    Array.isArray(s.seasons) && s.seasons.length
      ? s.seasons
      : fallback.seasons;

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

  // ---------- APP STATE ----------
  const [state, setState] = useState(() =>
    USE_V2 ? loadStateV2() : loadState()
  );

  const activeSeasonIdForPeerRatings = USE_V2
    ? ensureV2StateShape(state)?.activeSeasonId || null
    : null;

  const peerRatingsFromHook = usePeerRatings(activeSeasonIdForPeerRatings);
  const peerRatingsByPlayer = peerRatingsFromHook || {};

  const [statsReturnPage, setStatsReturnPage] = useState(PAGE_LANDING);

  const [secondsLeft, setSecondsLeft] = useState(MATCH_SECONDS);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [hasLiveMatch, setHasLiveMatch] = useState(false);

  // ---------- PRE-MATCH LINEUP CONFIRMATION ----------
  const [pendingMatchStartContext, setPendingMatchStartContext] = useState(
    null
  );
  const [currentConfirmedLineupSnapshot, setCurrentConfirmedLineupSnapshot] =
    useState(null);
  const [confirmedLineupsByMatchNo, setConfirmedLineupsByMatchNo] = useState(
    {}
  );

  // ---------- END MATCH DAY MODAL ----------
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState("");

  // ---------- END SEASON MODAL ----------
  const [showEndSeasonModal, setShowEndSeasonModal] = useState(false);
  const [endSeasonCode, setEndSeasonCode] = useState("");
  const [endSeasonError, setEndSeasonError] = useState("");

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

  // ---------- DERIVE ACTIVE SEASON FIELDS ----------
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

  if (USE_V2) {
    const { safeV2, activeSeason } = getActiveSeasonFromV2State(state);
    safeV2ForStats = safeV2;

    const fallbackSeason =
      safeV2?.seasons?.[0] || createDefaultStateV2().seasons[0];
    const s = activeSeason || fallbackSeason;

    teams = s?.teams || [];
    currentMatchNo = s?.currentMatchNo || 1;
    currentMatch = s?.currentMatch || null;
    currentEvents = s?.currentEvents || [];
    results = s?.results || [];
    allEvents = s?.allEvents || [];
    streaks = s?.streaks || {};
    matchDayHistory = s?.matchDayHistory || [];

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
  }

  // ✅ role logic now respects BOTH dynamic captain assignment and preview actingRole
  const activeRole = useMemo(
    () => deriveActiveRole(identity, teams || []),
    [identity, teams]
  );

  const isAdmin = activeRole === "admin";
  const isCaptain = activeRole === "captain";
  const isPlayer = activeRole === "player";
  const isSpectator = activeRole === "spectator";

  const canStartMatch = isAdmin || isCaptain;
  const canManageSquads = isAdmin;
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

  useEffect(() => {
    console.log("[TK DEBUG] Role check", {
      identity,
      activeRole,
      canStartMatch,
      isAdmin,
      isCaptain,
      isPlayer,
      isSpectator,
      teams,
    });
  }, [identity, activeRole, canStartMatch, isAdmin, isCaptain, isPlayer, isSpectator, teams]);

  useEffect(() => {
    console.log("[TK DEBUG] Archive status (NO SEEDS)", {
      mode: USE_V2 ? "V2(appState_v2/main)" : "LEGACY(appState/main)",
      hasFirebaseHistory,
      matchDayHistoryLength: (matchDayHistory || []).length,
      archivedResultsFromHistory: archivedResultsFromHistory.length,
      archivedEventsFromHistory: archivedEventsFromHistory.length,
      currentResults: (results || []).length,
      currentEvents: (allEvents || []).length,
      environment: IS_STAGING ? "staging" : "production",
      activeRole,
    });
  }, [
    hasFirebaseHistory,
    matchDayHistory,
    archivedResultsFromHistory.length,
    archivedEventsFromHistory.length,
    results,
    allEvents,
    activeRole,
  ]);

  // ---------- TIMER ----------
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

  // ---------- NAV ----------
  const handleGoToStats = (fromPage) => {
    setStatsReturnPage(fromPage);
    setPage(PAGE_STATS);
  };

  const handleBackToLanding = () => setPage(PAGE_LANDING);
  const handleBackToLive = () => setPage(PAGE_LIVE);

  // ---------- LANDING ----------
  const handleUpdatePairing = (match) => {
    if (!canStartMatch) {
      window.alert("Only captains or admin can update the pairing.");
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

  const handleStartMatch = () => {
    if (!canStartMatch) {
      window.alert("Only captains or admin can start a match.");
      return;
    }

    const startContext = {
      matchNo: currentMatchNo,
      createdAt: new Date().toISOString(),
      currentMatch,
      teams,
      identity,
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
    if (!canManageSquads) {
      window.alert("Only admin can manage squads.");
      return;
    }
    setPage(PAGE_SQUADS);
  };
  const handleGoToFormations = () => setPage(PAGE_FORMATIONS);

  // ---------- LIVE MATCH ----------
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

        return {
          ...prevSeason,
          currentMatchNo: newMatchNo,
          currentMatch: {
            teamAId: rotationResult.nextTeamAId,
            teamBId: rotationResult.nextTeamBId,
            standbyId: rotationResult.nextStandbyId,
          },
          streaks: rotationResult.updatedStreaks,
          currentEvents: [],
          allEvents: [...(prevSeason.allEvents || []), ...allCommittedEvents],
          results: [...(prevSeason.results || []), newResult],
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

  // ---------- CURRENT-WEEK SAVED MATCH DELETE ----------
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

  // ---------- CURRENT-WEEK SAVED EVENT UPDATE ----------
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

  // ---------- CURRENT-WEEK SAVED EVENT DELETE ----------
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

  // ---------- CURRENT-WEEK SAVED EVENT ADD ----------
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

  // ---------- DELETE CURRENT EMPTY TEST SEASON ----------
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

  // ---------- SQUADS ----------
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

  // ---------- BACKUP / CLEAR ----------
  const openBackupModal = () => {
    if (!isAdmin) {
      window.alert("Only admin can open save / clear tools.");
      return;
    }

    setBackupCode("");
    setBackupError("");
    setShowBackupModal(true);
  };

  const closeBackupModal = () => {
    setShowBackupModal(false);
    setBackupCode("");
    setBackupError("");
  };

  const requireAdminCode = () => {
    if (backupCode.trim() !== MASTER_CODE) {
      setBackupError("Invalid admin code.");
      return false;
    }
    return true;
  };

  const handleClearOnly = () => {
    if (!requireAdminCode()) return;

    if (USE_V2) {
      updateActiveSeason((prevSeason) => ({
        ...prevSeason,
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
      }));

      closeBackupModal();
      return;
    }

    updateState((prev) => ({
      ...prev,
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
    }));

    closeBackupModal();
  };

  const handleSaveAndClearMatchDay = () => {
    if (!requireAdminCode()) return;

    const now = new Date();
    const id =
      now.getFullYear().toString() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");

    if (USE_V2) {
      updateActiveSeason((prevSeason) => {
        const entry = {
          id,
          createdAt: now.toISOString(),
          results: prevSeason.results || [],
          allEvents: prevSeason.allEvents || [],
        };

        const newHistory = [...(prevSeason.matchDayHistory || []), entry];

        return {
          ...prevSeason,
          matchDayHistory: newHistory,
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
      };

      const newHistory = [...(prev.matchDayHistory || []), entry];

      return {
        ...prev,
        matchDayHistory: newHistory,
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
      };
    });

    closeBackupModal();
  };

  // ---------- END SEASON ----------
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
  };

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
          results={results}
          streaks={streaks}
          hasLiveMatch={hasLiveMatch}
          onUpdatePairing={handleUpdatePairing}
          onStartMatch={handleStartMatch}
          onGoToStats={() => handleGoToStats(PAGE_LANDING)}
          onGoToSquads={handleGoToSquads}
          onOpenBackupModal={openBackupModal}
          onOpenEndSeasonModal={handleRequestEndSeason}
          onGoToLiveAsSpectator={handleGoToLiveAsSpectator}
          onGoToFormations={handleGoToFormations}
          onGoToNews={() => setPage(PAGE_NEWS)}
          onGoToEntryDev={() => setPage(PAGE_ENTRY)}
          onGoToMigration={() => setPage(PAGE_MIGRATION)}
          identity={identity}
          activeRole={activeRole}
          isAdmin={isAdmin}
          isCaptain={isCaptain}
          isPlayer={isPlayer}
          isSpectator={isSpectator}
          canStartMatch={canStartMatch}
          canManageSquads={canManageSquads}
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
          currentEvents={allEvents}
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
        />
      )}

      {showBackupModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Save / Clear Turf Kings Data</h3>
            <p>
              Save this match-day to Firebase (via state sync) and start a fresh
              week, or clear the current week without saving.
            </p>
            <div className="field-row">
              <label>Admin code (Nkululeko)</label>
              <input
                type="password"
                className="text-input"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value);
                  setBackupError("");
                }}
              />
              {backupError && <p className="error-text">{backupError}</p>}
            </div>
            <div className="actions-row">
              <button className="secondary-btn" onClick={closeBackupModal}>
                Cancel
              </button>
              <button className="secondary-btn" onClick={handleClearOnly}>
                Clear only
              </button>
              <button
                className="primary-btn"
                onClick={handleSaveAndClearMatchDay}
              >
                Save to Firebase &amp; clear
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