// src/App.jsx
import React, { useEffect, useState } from "react";
import { LandingPage } from "./pages/LandingPage.jsx";
import { LiveMatchPage } from "./pages/LiveMatchPage.jsx";
import { StatsPage } from "./pages/StatsPage.jsx";
import { SquadsPage } from "./pages/SquadsPage.jsx";
import { FormationsPage } from "./pages/FormationsPage.jsx";
import { SpectatorPage } from "./pages/SpectatorPage.jsx";
import {
  loadState,
  saveState,
  createDefaultState,
} from "./storage/gameRepository.js";
import { computeNextFromResult } from "./core/rotation.js";
import { loadStateFromFirebase } from "./storage/firebaseRepository.js"; // 🔥 NEW

const PAGE_LANDING = "landing";
const PAGE_LIVE = "live";
const PAGE_STATS = "stats";
const PAGE_SQUADS = "squads";
const PAGE_FORMATIONS = "formations";
const PAGE_SPECTATOR = "spectator";

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

  // 🌩 Cloud sync flags (optional, internal only for now)
  const [cloudLoaded, setCloudLoaded] = useState(false);

  // ✅ Auto-save to localStorage + Firebase whenever state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // ✅ On first mount, try to load full state from Firebase
  useEffect(() => {
    let cancelled = false;

    async function syncFromCloud() {
      try {
        const cloudState = await loadStateFromFirebase();
        if (!cloudState || cancelled) {
          setCloudLoaded(true);
          return;
        }
        // Override local state with cloud version
        setState(cloudState);
        // Ensure localStorage is in sync for offline use
        saveState(cloudState);
      } catch (err) {
        console.error("Failed to load cloud state, using local only:", err);
      } finally {
        if (!cancelled) setCloudLoaded(true);
      }
    }

    syncFromCloud();

    return () => {
      cancelled = true;
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
    setState((prev) => ({
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
    // Always allow going to spectator page.
    // SpectatorPage itself will show "no active match" if Firestore is empty.
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
    setState((prev) => ({
      ...prev,
      currentEvents: [...prev.currentEvents, event],
    }));
  };

  const handleDeleteEvent = (index) => {
    setState((prev) => {
      const copy = [...prev.currentEvents];
      copy.splice(index, 1);
      return { ...prev, currentEvents: copy };
    });
  };

  const handleUndoLastEvent = () => {
    setState((prev) => {
      if (prev.currentEvents.length === 0) return prev;
      const copy = [...prev.currentEvents];
      copy.pop();
      return { ...prev, currentEvents: copy };
    });
  };

  const handleConfirmEndMatch = (summary) => {
    setState((prev) => {
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

    setState((prev) => ({
      ...prev,
      currentEvents: [], // throw away in-progress events
    }));

    setPage(PAGE_LANDING);
  };

  // ---------- SQUADS ----------
  const handleUpdateTeams = (updatedTeams) => {
    setState((prev) => ({
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

  const downloadStateToFile = () => {
    if (typeof window === "undefined") return;
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const ts =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      "-" +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0");
    a.href = url;
    a.download = `turfkings-5aside-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleBackupSaveOnly = () => {
    if (backupCode.trim() !== MASTER_CODE) {
      setBackupError("Invalid admin code.");
      return;
    }
    downloadStateToFile();
    closeBackupModal();
  };

  const handleBackupSaveAndClear = () => {
    if (backupCode.trim() !== MASTER_CODE) {
      setBackupError("Invalid admin code.");
      return;
    }
    downloadStateToFile();
    setState(createDefaultState());
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
        <SpectatorPage onBackToLanding={handleBackToLanding} />
      )}

      {page === PAGE_STATS && (
        <StatsPage
          teams={teams}
          results={results}
          allEvents={allEvents}
          cameFromLive={statsReturnPage === PAGE_LIVE}
          onBack={() =>
            statsReturnPage === PAGE_LIVE
              ? handleBackToLive()
              : handleBackToLanding()
          }
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
              Save all matches, events and squads to a file. You can optionally
              clear the browser after saving to reclaim space.
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
              <button className="secondary-btn" onClick={handleBackupSaveOnly}>
                Save only
              </button>
              <button
                className="primary-btn"
                onClick={handleBackupSaveAndClear}
              >
                Save &amp; clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
