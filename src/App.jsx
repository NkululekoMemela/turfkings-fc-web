// src/App.jsx
import React, { useEffect, useState } from "react";
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

import {
  loadState,
  saveState,
  createDefaultState,
} from "./storage/gameRepository.js";
import { computeNextFromResult } from "./core/rotation.js";
import { subscribeToState } from "./storage/firebaseRepository.js";

import { usePeerRatings } from "./hooks/usePeerRatings.js";

// 🔁 live members list from Firestore
import { useMembers } from "./hooks/useMembers.js";

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

const MASTER_CODE = "3333"; // Nkululeko admin code
const MATCH_SECONDS = 5 * 60; // 5 minutes

export default function App() {
  // ---------- PAGE & IDENTITY ----------
  const [page, setPage] = useState(PAGE_ENTRY);

  const [identity, setIdentity] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("tk_identity_v1");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const members = useMembers();

  const handleEntryComplete = (payload) => {
    setIdentity(payload);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tk_identity_v1", JSON.stringify(payload));
    }
    setPage(PAGE_LANDING);
  };

  // ---------- APP STATE ----------
  const [state, setState] = useState(() => loadState());
  const peerRatingsFromHook = usePeerRatings();
  const peerRatingsByPlayer = peerRatingsFromHook || {};

  const [statsReturnPage, setStatsReturnPage] = useState(PAGE_LANDING);

  const [secondsLeft, setSecondsLeft] = useState(MATCH_SECONDS);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [hasLiveMatch, setHasLiveMatch] = useState(false);

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState("");

  const updateState = (updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveState(next); // localStorage + Firebase mirror
      return next;
    });
  };

  // ✅ Firestore subscription
  useEffect(() => {
    const unsubscribe = subscribeToState((cloudState) => {
      if (!cloudState) return;
      setState(cloudState);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const {
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
  } = state || createDefaultState();

  // ---------- HISTORY (Firebase) ----------
  const archivedResultsFromHistory = (matchDayHistory || []).flatMap(
    (day) => day?.results || []
  );

  const archivedEventsFromHistory = (matchDayHistory || []).flatMap(
    (day) => day?.allEvents || []
  );

  const hasFirebaseHistory = (matchDayHistory || []).length > 0;

  // ---------- NEWS DATASET (NO SEEDS) ----------
  // Firebase history + current week only
  const fullResults = [...archivedResultsFromHistory, ...(results || [])];
  const fullEvents = [...archivedEventsFromHistory, ...(allEvents || [])];

  // ---------- STATS + PLAYER CARDS DATASET (NO SEEDS) ----------
  const fullSeasonResultsForStats = [...archivedResultsFromHistory, ...(results || [])];
  const fullSeasonEventsForStats = [...archivedEventsFromHistory, ...(allEvents || [])];

  // Optional debug (safe in dev + build)
  useEffect(() => {
    console.log("[TK DEBUG] Archive status (NO SEEDS)", {
      hasFirebaseHistory,
      matchDayHistoryLength: (matchDayHistory || []).length,
      archivedResultsFromHistory: archivedResultsFromHistory.length,
      archivedEventsFromHistory: archivedEventsFromHistory.length,
      currentResults: (results || []).length,
      currentEvents: (allEvents || []).length,
    });
  }, [
    hasFirebaseHistory,
    matchDayHistory,
    archivedResultsFromHistory.length,
    archivedEventsFromHistory.length,
    results,
    allEvents,
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
    updateState((prev) => ({ ...prev, currentMatch: match }));
  };

  const handleStartMatch = () => {
    setSecondsLeft(MATCH_SECONDS);
    setTimeUp(false);
    setRunning(true);
    setHasLiveMatch(true);
    setPage(PAGE_LIVE);
  };

  const handleGoToLiveAsSpectator = () => setPage(PAGE_SPECTATOR);
  const handleGoToSquads = () => setPage(PAGE_SQUADS);
  const handleGoToFormations = () => setPage(PAGE_FORMATIONS);

  // ---------- LIVE MATCH ----------
  const handleAddEvent = (event) => {
    updateState((prev) => ({
      ...prev,
      currentEvents: [...prev.currentEvents, event],
    }));
  };

  const handleDeleteEvent = (index) => {
    updateState((prev) => {
      const copy = [...prev.currentEvents];
      copy.splice(index, 1);
      return { ...prev, currentEvents: copy };
    });
  };

  const handleUndoLastEvent = () => {
    updateState((prev) => {
      if (prev.currentEvents.length === 0) return prev;
      const copy = [...prev.currentEvents];
      copy.pop();
      return { ...prev, currentEvents: copy };
    });
  };

  const handleConfirmEndMatch = (summary) => {
    updateState((prev) => {
      const { teamAId, teamBId, standbyId, goalsA, goalsB } = summary;

      const rotationResult = computeNextFromResult(prev.streaks, {
        teamAId,
        teamBId,
        standbyId,
        goalsA,
        goalsB,
      });

      const newMatchNo = prev.currentMatchNo + 1;

      const committedEvents = prev.currentEvents.map((e) => ({
        ...e,
        matchNo: prev.currentMatchNo,
      }));

      const newResult = {
        matchNo: prev.currentMatchNo,
        teamAId,
        teamBId,
        standbyId,
        goalsA,
        goalsB,
        winnerId: rotationResult.winnerId,
        isDraw: rotationResult.isDraw,
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
        allEvents: [...prev.allEvents, ...committedEvents],
        results: [...prev.results, newResult],
      };
    });

    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(MATCH_SECONDS);
    setHasLiveMatch(false);
    setPage(PAGE_LANDING);
  };

  const handleDiscardMatchAndBack = () => {
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(MATCH_SECONDS);
    setHasLiveMatch(false);

    updateState((prev) => ({ ...prev, currentEvents: [] }));
    setPage(PAGE_LANDING);
  };

  // ---------- SQUADS ----------
  const handleUpdateTeams = (updatedTeams) => {
    updateState((prev) => ({ ...prev, teams: updatedTeams }));
  };

  // ---------- BACKUP / CLEAR ----------
  const openBackupModal = () => {
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
      matchDayHistory: prev.matchDayHistory || [], // history remains
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
          ? Object.fromEntries(Object.keys(prev.streaks).map((tid) => [tid, 0]))
          : {},
        currentEvents: [],
        allEvents: [],
        results: [],
      };
    });

    closeBackupModal();
  };

  return (
    <div className="app-root">
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
          onGoToLiveAsSpectator={handleGoToLiveAsSpectator}
          onGoToFormations={handleGoToFormations}
          onGoToNews={() => setPage(PAGE_NEWS)}
          onGoToEntryDev={() => setPage(PAGE_ENTRY)}
          identity={identity}
        />
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
            statsReturnPage === PAGE_LIVE ? handleBackToLive() : handleBackToLanding()
          }
          onGoToNews={() => setPage(PAGE_NEWS)}
          onGoToPlayerCards={() => setPage(PAGE_PLAYER_CARDS)}
          onGoToPeerReview={() => setPage(PAGE_PEER_REVIEW)}
          members={members}
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
            updateState((prev) => ({ ...prev, yearEndAttendance: nextList }))
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
          onBack={() => setPage(PAGE_STATS)}
        />
      )}

      {page === PAGE_SQUADS && (
        <SquadsPage
          teams={teams}
          onUpdateTeams={handleUpdateTeams}
          onBack={() => setPage(PAGE_FORMATIONS)}
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
              <button className="primary-btn" onClick={handleSaveAndClearMatchDay}>
                Save to Firebase &amp; clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}