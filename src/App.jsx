// src/App.jsx
import React, { useEffect, useState } from "react";
import { LandingPage } from "./pages/LandingPage.jsx";
import { LiveMatchPage } from "./pages/LiveMatchPage.jsx";
import { StatsPage } from "./pages/StatsPage.jsx";
import { SquadsPage } from "./pages/SquadsPage.jsx";
import { FormationsPage } from "./pages/FormationsPage.jsx";
import { SpectatorPage } from "./pages/SpectatorPage.jsx";
import { NewsPage } from "./pages/NewsPage.jsx";

import {
  loadState,
  saveState,
  createDefaultState,
} from "./storage/gameRepository.js";
import { computeNextFromResult } from "./core/rotation.js";
import { subscribeToState } from "./storage/firebaseRepository.js";

import { week1Results, week1Events } from "./seed/week1Data.js";
// ❌ REMOVE this line – we don't need captainAuth in App
// import { resolveRoleForUser, isCaptainEmail } from "./core/captainAuth.js";

const PAGE_LANDING = "landing";
const PAGE_LIVE = "live";
const PAGE_STATS = "stats";
const PAGE_SQUADS = "squads";
const PAGE_FORMATIONS = "formations";
const PAGE_SPECTATOR = "spectator";
const PAGE_NEWS = "news";

const MASTER_CODE = "3333"; // Nkululeko admin code

// ⏱️ Match duration in seconds (change here only)
const MATCH_SECONDS = 5 * 60; // use 1 * 10 for testing

export default function App() {
  const [page, setPage] = useState(PAGE_LANDING);
  const [state, setState] = useState(() => loadState());

  // where to go back from Stats: landing or live
  const [statsReturnPage, setStatsReturnPage] = useState(PAGE_LANDING);

  // 🔁 TIMER STATE LIVES IN APP (so it survives page switches)
  const [secondsLeft, setSecondsLeft] = useState(MATCH_SECONDS);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  // Is there currently a live match in progress (on this device)?
  const [hasLiveMatch, setHasLiveMatch] = useState(false);

  // backup / clear modal
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState("");

  // 🌩 Helper: centralised state update for local edits
  const updateState = (updater) => {
    setState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : updater;
      saveState(next); // localStorage + Firebase mirror
      return next;
    });
  };

  // ✅ Realtime subscription to Firestore full app state.
  useEffect(() => {
    const unsubscribe = subscribeToState((cloudState) => {
      if (!cloudState) return;
      // Use raw setState so we do NOT call saveState again.
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
  } = state;

  // 🔁 Main countdown timer – runs regardless of which "page" is showing
  useEffect(() => {
    if (!running) return;
    if (secondsLeft <= 0) return;

    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // hit zero
          setRunning(false);
          setTimeUp(true); // LiveMatchPage will react and ring alarm
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [running, secondsLeft]);

  // ---------- LANDING HANDLERS ----------
  const handleUpdatePairing = (match) => {
    updateState((prev) => ({
      ...prev,
      currentMatch: match,
    }));
  };

  const handleStartMatch = () => {
    // Captain starts a new match
    setSecondsLeft(MATCH_SECONDS);
    setTimeUp(false);
    setRunning(true);
    setHasLiveMatch(true);
    setPage(PAGE_LIVE);
  };

  // Spectator wants to view an ongoing match
  const handleGoToLiveAsSpectator = () => {
    setPage(PAGE_SPECTATOR);
  };

  // Stats: remember where we came from
  const handleGoToStats = (fromPage) => {
    setStatsReturnPage(fromPage);
    setPage(PAGE_STATS);
  };

  const handleGoToSquads = () => {
    setPage(PAGE_SQUADS);
  };

  const handleGoToFormations = () => {
    setPage(PAGE_FORMATIONS);
  };

  const handleBackToLanding = () => {
    setPage(PAGE_LANDING);
  };

  const handleBackToLive = () => {
    setPage(PAGE_LIVE);
  };

  // ---------- LIVE MATCH HANDLERS ----------
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

    // after match is ended, reset timer ready for next game
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(MATCH_SECONDS);
    setHasLiveMatch(false);

    setPage(PAGE_LANDING);
  };

  // Discard current match (Cancel Game as captain) and go to landing
  const handleDiscardMatchAndBack = () => {
    setRunning(false);
    setTimeUp(false);
    setSecondsLeft(MATCH_SECONDS);
    setHasLiveMatch(false);

    updateState((prev) => ({
      ...prev,
      currentEvents: [], // throw away in-progress events
    }));

    setPage(PAGE_LANDING);
  };

  // ---------- SQUADS ----------
  const handleUpdateTeams = (updatedTeams) => {
    updateState((prev) => ({
      ...prev,
      teams: updatedTeams,
    }));
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

  // Clear current week ONLY (no saving)
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
      // keep teams and matchDayHistory
      matchDayHistory: prev.matchDayHistory || [],
    }));

    closeBackupModal();
  };

  // Save match-day to Firebase (via state mirror) and clear current week
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
          ? Object.fromEntries(
              Object.keys(prev.streaks).map((tid) => [tid, 0])
            )
          : {},
        currentEvents: [],
        allEvents: [],
        results: [],
      };
    });

    // updateState already mirrored to Firebase via saveState
    closeBackupModal();
  };

  return (
    <div className="app-root">
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
          archivedResults={week1Results}
          archivedEvents={week1Events}
          cameFromLive={statsReturnPage === PAGE_LIVE}
          onBack={() =>
            statsReturnPage === PAGE_LIVE
              ? handleBackToLive()
              : handleBackToLanding()
          }
          onGoToNews={() => setPage(PAGE_NEWS)}
        />
      )}

      {page === PAGE_NEWS && (
        <NewsPage
          teams={teams}
          results={results}
          allEvents={allEvents}
          onBack={() => setPage(PAGE_STATS)}
        />
      )}

      {page === PAGE_SQUADS && (
        <SquadsPage
          teams={teams}
          onUpdateTeams={handleUpdateTeams}
          onBack={handleBackToLanding}
        />
      )}

      {page === PAGE_FORMATIONS && (
        <FormationsPage teams={teams} onBack={handleBackToLanding} />
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
    </div>
  );
}
