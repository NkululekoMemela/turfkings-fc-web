// src/pages/LiveMatchPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTeamById } from "../core/teams.js";

// 🔥 Firebase imports (Firestore only – no auth UI here)
import { db } from "../firebaseConfig.js";
import {
  doc,
  updateDoc,
  setDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";

// Treat these as captain/admin passwords
const CAPTAIN_PASSWORDS = ["11", "22", "3333"];

// Document where we mirror the current match
const MATCH_DOC_ID = "current";

// ✅ Correct URL for GitHub Pages subpath (and dev)
const SOUND_URL = `${import.meta.env.BASE_URL}alarm.mp4`;

// ✅ Single Audio instance (CAPTAIN ONLY – spectator has no audio)
const matchEndSound =
  typeof Audio !== "undefined" ? new Audio(SOUND_URL) : null;

if (matchEndSound) {
  matchEndSound.preload = "auto";
  matchEndSound.loop = false;
  matchEndSound.volume = 1;
}

// ✅ Stop alarm helper
function stopAlarmLoop(alarmLoopRef) {
  if (alarmLoopRef.current) {
    clearInterval(alarmLoopRef.current);
    alarmLoopRef.current = null;
  }
  if (matchEndSound) {
    try {
      matchEndSound.pause();
      matchEndSound.currentTime = 0;
    } catch (_) {
      /* ignore */
    }
  }
}

// ✅ Short label helper for mobile score display
function getShortName(label) {
  if (!label) return "";
  const map = {
    Barcelona: "BAR",
    Madrid: "MAD",
    Liverpool: "LIV",
  };
  if (map[label]) return map[label];

  const cleaned = label.replace(/team/gi, "").trim();
  if (!cleaned) return label;
  return cleaned.slice(0, 3).toUpperCase();
}

// ---------- Firestore helper functions ----------

// 🔁 Called whenever a **new match** starts (new rotation).
// This *completely overwrites* the previous match document so
// spectators don't see stale scores.
async function hardResetMatchDoc(summaryInfo, matchSeconds) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        matchNumber: summaryInfo.matchNumber,
        teamAId: summaryInfo.teamAId,
        teamBId: summaryInfo.teamBId,
        standbyId: summaryInfo.standbyId,
        teamALabel: summaryInfo.teamALabel,
        teamBLabel: summaryInfo.teamBLabel,
        standbyLabel: summaryInfo.standbyLabel,

        // wipe dynamic stuff from previous match
        events: [],
        goalsA: 0,
        goalsB: 0,
        finalSummary: null,
        isFinished: false,

        matchSeconds: matchSeconds ?? 0,
        secondsLeft: matchSeconds ?? 0,

        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      },
      { merge: false } // 🔥 full overwrite
    );
  } catch (err) {
    console.error("⚠️ Failed to hard reset match doc:", err);
  }
}

async function appendEventToFirestore(
  event,
  summaryInfo,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);

    const common = {
      ...summaryInfo,
      matchSeconds: matchSeconds ?? 0,
      secondsLeft:
        typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : null,
      isFinished: false,
      lastUpdated: serverTimestamp(),
    };

    try {
      await updateDoc(ref, {
        events: arrayUnion(event),
        ...common,
      });
    } catch (_) {
      await setDoc(
        ref,
        {
          events: [event],
          createdAt: serverTimestamp(),
          ...common,
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("⚠️ Failed to mirror event to Firestore:", err);
  }
}

async function overwriteEventsInFirestore(
  allEvents,
  summaryInfo,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        events: allEvents,
        matchSeconds: matchSeconds ?? 0,
        secondsLeft:
          typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : null,
        isFinished: false,
        lastUpdated: serverTimestamp(),
        ...summaryInfo,
      },
      { merge: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to overwrite events in Firestore:", err);
  }
}

async function writeFinalSummaryToFirestore(
  finalSummary,
  events,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        finalSummary,
        events,
        isFinished: true,
        finishedAt: serverTimestamp(),
        matchSeconds: matchSeconds ?? 0,
        secondsLeft:
          typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : 0,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to write final summary to Firestore:", err);
  }
}

export function LiveMatchPage({
  matchSeconds, // from App.jsx
  secondsLeft, // from App.jsx
  timeUp, // from App.jsx
  running, // from App.jsx
  teams,
  currentMatchNo,
  currentMatch,
  currentEvents,
  onAddEvent,
  onDeleteEvent,
  onUndoLastEvent,
  onConfirmEndMatch,
  onBackToLanding,
  onGoToStats,
}) {
  const { teamAId, teamBId, standbyId } = currentMatch;
  const teamA = getTeamById(teams, teamAId);
  const teamB = getTeamById(teams, teamBId);
  const standbyTeam = getTeamById(teams, standbyId);

  // 🔍 detect mobile for compact scoreboard labels
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [eventType, setEventType] = useState("goal"); // "goal" | "shibobo"
  const [scoringTeamId, setScoringTeamId] = useState(teamAId);
  const [scorerName, setScorerName] = useState("");
  const [assistName, setAssistName] = useState("");

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState(15);

  // delete confirmation (for events)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // back button protection (discard & go Landing)
  const [showBackModal, setShowBackModal] = useState(false);
  const [backPassword, setBackPassword] = useState("");
  const [backError, setBackError] = useState("");

  // undo protection
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoPassword, setUndoPassword] = useState("");
  const [undoError, setUndoError] = useState("");

  // 🔁 alarm loop ref (for repeated beeps + vibration)
  const alarmLoopRef = useRef(null);

  // ✅ Mobile autoplay unlock (captain only)
  useEffect(() => {
    if (!matchEndSound) return;
    const unlock = async () => {
      try {
        await matchEndSound.play();
        matchEndSound.pause();
        matchEndSound.currentTime = 0;
      } catch (_) {
        /* ignore */
      } finally {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("click", unlock);
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  // ⏱️ Timer is controlled in App.jsx. Here we only react to timeUp.
  useEffect(() => {
    if (!timeUp) {
      stopAlarmLoop(alarmLoopRef);
      return;
    }

    (async () => {
      try {
        if (matchEndSound) {
          matchEndSound.currentTime = 0;
          await matchEndSound.play();
        }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch (_) {
        /* ignore */
      }
    })();

    alarmLoopRef.current = setInterval(async () => {
      try {
        if (matchEndSound) {
          matchEndSound.currentTime = 0;
          await matchEndSound.play();
        }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch (_) {
        /* ignore */
      }
    }, 10000);

    return () => {
      stopAlarmLoop(alarmLoopRef);
    };
  }, [timeUp]);

  // 🔔 Push timer updates to Firestore every 5 seconds (captain -> spectators)
  useEffect(() => {
    if (!running) return;
    if (secondsLeft == null) return;

    const shouldPush = secondsLeft <= 5 || secondsLeft % 5 === 0;
    if (!shouldPush) return;

    const pushTimer = async () => {
      try {
        const ref = doc(db, "matches", MATCH_DOC_ID);
        await updateDoc(ref, {
          secondsLeft: Math.max(secondsLeft, 0),
          matchSeconds: matchSeconds ?? 0,
          isFinished: false,
          lastUpdated: serverTimestamp(),
        });
      } catch (err) {
        // ignore if doc missing – it will be created on first event/reset
      }
    };

    pushTimer();
  }, [secondsLeft, running, matchSeconds]);

  const formattedTime = useMemo(() => {
    const m = Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, "0");
    const s = (secondsLeft % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [secondsLeft]);

  const goalsA = currentEvents.filter(
    (e) => e.teamId === teamAId && e.type === "goal"
  ).length;
  const goalsB = currentEvents.filter(
    (e) => e.teamId === teamBId && e.type === "goal"
  ).length;

  const playersForSelectedTeam =
    scoringTeamId === teamAId ? teamA.players : teamB.players;

  const assistOptions = playersForSelectedTeam.filter((p) => p !== scorerName);

  const basicSummary = {
    matchNumber: currentMatchNo,
    teamAId,
    teamBId,
    standbyId,
    teamALabel: teamA.label,
    teamBLabel: teamB.label,
    standbyLabel: standbyTeam.label,
  };

  // 🧹 HARD RESET FIRESTORE WHENEVER A NEW MATCH STARTS
  // Assumption: every time we navigate to this page, it's a *new* match
  // (we're not resuming old ones).
  useEffect(() => {
    hardResetMatchDoc(
      {
        matchNumber: currentMatchNo,
        teamAId,
        teamBId,
        standbyId,
        teamALabel: teamA.label,
        teamBLabel: teamB.label,
        standbyLabel: standbyTeam.label,
      },
      matchSeconds
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentMatchNo,
    teamAId,
    teamBId,
    standbyId,
    teamA.label,
    teamB.label,
    standbyTeam.label,
  ]);

  // ---------- Event & match actions ----------

  const handleAddEvent = async () => {
    if (!scorerName) return;

    const event = {
      id: Date.now().toString(),
      type: eventType,
      teamId: scoringTeamId,
      scorer: scorerName,
      assist: eventType === "goal" && assistName ? assistName : null,
      timeSeconds: matchSeconds - secondsLeft,
    };

    onAddEvent(event);
    setAssistName("");

    appendEventToFirestore(event, basicSummary, secondsLeft, matchSeconds);
  };

  const handleEndMatchClick = () => {
    setShowConfirmModal(true);
    setConfirmCountdown(15);
  };

  // confirmation countdown for end-of-match
  useEffect(() => {
    if (!showConfirmModal) return;
    if (confirmCountdown <= 0) {
      handleConfirmFinal();
      return;
    }
    const id = setInterval(() => {
      setConfirmCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfirmModal, confirmCountdown]);

  const handleGoBackToEdit = () => {
    setShowConfirmModal(false);
    setConfirmCountdown(15);
  };

  const handleConfirmFinal = () => {
    stopAlarmLoop(alarmLoopRef);

    setShowConfirmModal(false);
    setConfirmCountdown(15);
    const summary = {
      teamAId,
      teamBId,
      standbyId,
      goalsA,
      goalsB,
    };

    onConfirmEndMatch(summary);

    const finalSummary = {
      ...basicSummary,
      goalsA,
      goalsB,
    };
    writeFinalSummaryToFirestore(
      finalSummary,
      currentEvents,
      secondsLeft,
      matchSeconds
    );
  };

  // Delete with captain password
  const handleRequestDelete = (index) => {
    setDeleteIndex(index);
    setDeletePassword("");
    setDeleteError("");
    setShowDeleteModal(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteIndex(null);
    setDeletePassword("");
    setDeleteError("");
  };

  const handleConfirmDelete = () => {
    const password = deletePassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setDeleteError("Invalid captain password.");
      return;
    }
    if (deleteIndex !== null) {
      onDeleteEvent(deleteIndex);
      const newEvents = currentEvents.filter((_, i) => i !== deleteIndex);
      overwriteEventsInFirestore(
        newEvents,
        basicSummary,
        secondsLeft,
        matchSeconds
      );
    }
    handleCancelDelete();
  };

  // Back button: require captain password, discard events, go Landing
  const handleBackClick = () => {
    setShowBackModal(true);
    setBackPassword("");
    setBackError("");
  };

  const handleCancelBack = () => {
    setShowBackModal(false);
    setBackPassword("");
    setBackError("");
  };

  const handleConfirmDiscardAndBack = () => {
    const password = backPassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setBackError("Invalid captain password.");
      return;
    }

    stopAlarmLoop(alarmLoopRef);

    setShowBackModal(false);
    setBackPassword("");
    setBackError("");

    overwriteEventsInFirestore([], basicSummary, secondsLeft, matchSeconds);
    onBackToLanding();
  };

  // Undo last: require captain password
  const handleUndoClick = () => {
    if (currentEvents.length === 0) return;
    setShowUndoModal(true);
    setUndoPassword("");
    setUndoError("");
  };

  const handleCancelUndo = () => {
    setShowUndoModal(false);
    setUndoPassword("");
    setUndoError("");
  };

  const handleConfirmUndo = () => {
    const password = undoPassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setUndoError("Invalid captain password.");
      return;
    }
    onUndoLastEvent();
    const newEvents = currentEvents.slice(0, -1);
    overwriteEventsInFirestore(
      newEvents,
      basicSummary,
      secondsLeft,
      matchSeconds
    );
    setShowUndoModal(false);
    setUndoPassword("");
    setUndoError("");
  };

  const displayNameA = isMobile ? getShortName(teamA.label) : teamA.label;
  const displayNameB = isMobile ? getShortName(teamB.label) : teamB.label;

  return (
    <div className="page live-page">
      <header className="header">
        <h1>Match #{currentMatchNo}</h1>
        <p>
          On-field: <strong>{teamA.label}</strong> (c: {teamA.captain}) vs{" "}
          <strong>{teamB.label}</strong> (c: {teamB.captain})
        </p>
        <p>
          Standby:{" "}
          <strong>{standbyTeam.label}</strong> (c: {standbyTeam.captain})
        </p>
      </header>

      <section className="card">
        <div className="timer-row">
          <div className="timer-display">{formattedTime}</div>
          {timeUp && (
            <span className="timer-warning">Time is up – end match!</span>
          )}
        </div>

        <div className="score-row">
          <div className="score-team">
            <strong className="score-team-name">{displayNameA}</strong>
            <div className="score-number">{goalsA}</div>
          </div>
          <div className="score-dash">–</div>
          <div className="score-team">
            <strong className="score-team-name">{displayNameB}</strong>
            <div className="score-number">{goalsB}</div>
          </div>
        </div>

        <div className="event-input">
          <h3>Log Event</h3>

          <div className="field-row">
            <label>Event type</label>
            <div className="team-toggle">
              <button
                className={
                  eventType === "goal" ? "toggle-btn active" : "toggle-btn"
                }
                type="button"
                onClick={() => setEventType("goal")}
              >
                Goal
              </button>
              <button
                className={
                  eventType === "shibobo" ? "toggle-btn active" : "toggle-btn"
                }
                type="button"
                onClick={() => {
                  setEventType("shibobo");
                  setAssistName("");
                }}
              >
                Shibobo
              </button>
            </div>
          </div>

          <div className="team-toggle">
            <button
              className={
                scoringTeamId === teamAId ? "toggle-btn active" : "toggle-btn"
              }
              type="button"
              onClick={() => {
                setScoringTeamId(teamAId);
                setScorerName("");
                setAssistName("");
              }}
            >
              {teamA.label}
            </button>
            <button
              className={
                scoringTeamId === teamBId ? "toggle-btn active" : "toggle-btn"
              }
              type="button"
              onClick={() => {
                setScoringTeamId(teamBId);
                setScorerName("");
                setAssistName("");
              }}
            >
              {teamB.label}
            </button>
          </div>

          {eventType === "goal" ? (
            <>
              <div className="field-row">
                <label>Scorer</label>
                <select
                  value={scorerName}
                  onChange={(e) => {
                    setScorerName(e.target.value);
                    if (e.target.value === assistName) {
                      setAssistName("");
                    }
                  }}
                >
                  <option value="">Select scorer</option>
                  {playersForSelectedTeam.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-row">
                <label>Assist (optional)</label>
                <select
                  value={assistName}
                  onChange={(e) => setAssistName(e.target.value)}
                >
                  <option value="">No assist</option>
                  {assistOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="field-row">
              <label>Player</label>
              <select
                value={scorerName}
                onChange={(e) => {
                  setScorerName(e.target.value);
                  setAssistName("");
                }}
              >
                <option value="">Select player</option>
                {playersForSelectedTeam.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            className="primary-btn"
            type="button"
            onClick={handleAddEvent}
          >
            Add Event
          </button>
        </div>

        <div className="event-log">
          <div className="event-log-header">
            <h3>Current Match Events</h3>
            <button
              className="secondary-btn"
              type="button"
              onClick={handleUndoClick}
              disabled={currentEvents.length === 0}
            >
              Undo last
            </button>
          </div>
          {currentEvents.length === 0 && (
            <p className="muted">No events yet.</p>
          )}
          <ul>
            {currentEvents.map((e, idx) => {
              const team =
                e.teamId === teamAId
                  ? teamA
                  : e.teamId === teamBId
                  ? teamB
                  : null;
              const typeLabel = e.type === "shibobo" ? "Shibobo" : "Goal";
              return (
                <li key={e.id} className="event-item">
                  <span>
                    [{formatSeconds(e.timeSeconds)}] {team?.label} –{" "}
                    <strong>{typeLabel}:</strong> {e.scorer}
                    {e.assist ? ` (assist: ${e.assist})` : ""}
                  </span>
                  <div className="event-actions">
                    <button
                      className="link-btn"
                      type="button"
                      onClick={() => handleRequestDelete(idx)}
                    >
                      delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="actions-row">
          <button
            className="secondary-btn"
            type="button"
            onClick={handleBackClick}
          >
            Cancel Game
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={onGoToStats}
          >
            View Stats
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={handleEndMatchClick}
          >
            End Match
          </button>
        </div>
      </section>

      {/* Modals: end, delete, back, undo */}
      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm End of Match</h3>
            <p>
              <strong>{teamA.label}</strong> {goalsA} – {goalsB}{" "}
              <strong>{teamB.label}</strong>
            </p>
            <p>
              Are you sure everything is correct? You have{" "}
              <strong>{confirmCountdown}</strong> seconds to go back and edit.
            </p>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleGoBackToEdit}
              >
                Go back &amp; edit
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmFinal}
              >
                Confirm &amp; lock
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm Delete Event</h3>
            <p>To delete an event, enter any team captain&apos;s password.</p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteError("");
                }}
                maxLength={4}
              />
              {deleteError && <p className="error-text">{deleteError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmDelete}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Discard match &amp; go back?</h3>
            <p>
              This will <strong>lose all current events</strong> for this match
              and return to the main screen.
            </p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={backPassword}
                onChange={(e) => {
                  setBackPassword(e.target.value);
                  setBackError("");
                }}
                maxLength={4}
              />
              {backError && <p className="error-text">{backError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelBack}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmDiscardAndBack}
              >
                Discard &amp; go back
              </button>
            </div>
          </div>
        </div>
      )}

      {showUndoModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Undo last event?</h3>
            <p>To undo the last event, enter any team captain&apos;s password.</p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={undoPassword}
                onChange={(e) => {
                  setUndoPassword(e.target.value);
                  setUndoError("");
                }}
                maxLength={4}
              />
              {undoError && <p className="error-text">{undoError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelUndo}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmUndo}
              >
                Confirm undo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSeconds(s) {
  const v = typeof s === "number" && !Number.isNaN(s) ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
