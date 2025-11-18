// src/pages/SpectatorPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig.js";
import { doc, onSnapshot } from "firebase/firestore";

// same helper used in LiveMatchPage (reimplemented here)
function formatSeconds(s) {
  const v = typeof s === "number" && !Number.isNaN(s) ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// Compact label for mobile
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

export function SpectatorPage(props) {
  // support either prop name to be safe with your existing App.jsx
  const goBack = props.onBackToLanding || props.onBack || (() => {});

  const [matchDoc, setMatchDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  // local countdown state for smoother timer
  const [localSecondsLeft, setLocalSecondsLeft] = useState(null);

  useEffect(() => {
    const ref = doc(db, "matches", "current");

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setMatchDoc(data);

          // sync local timer with server secondsLeft if available
          if (
            typeof data.secondsLeft === "number" &&
            Number.isFinite(data.secondsLeft)
          ) {
            setLocalSecondsLeft(Math.max(data.secondsLeft, 0));
          } else {
            setLocalSecondsLeft(null);
          }
        } else {
          setMatchDoc(null);
          setLocalSecondsLeft(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Spectator onSnapshot error:", err);
        setErrorText("Could not connect to live match data.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const {
    teamALabel,
    teamBLabel,
    standbyLabel,
    matchNumber,
    events = [],
    finalSummary,
    isFinished,
  } = matchDoc || {};

  // ✅ Always compute from events live; only fall back to finalSummary
  const computedScores = useMemo(() => {
    if (!matchDoc) return { goalsA: 0, goalsB: 0 };

    if (events && events.length > 0) {
      let gA = 0;
      let gB = 0;
      for (const e of events) {
        if (e.type === "goal") {
          if (e.teamId === matchDoc.teamAId) gA += 1;
          if (e.teamId === matchDoc.teamBId) gB += 1;
        }
      }
      return { goalsA: gA, goalsB: gB };
    }

    // fallback for old finished matches with only finalSummary stored
    if (finalSummary && typeof finalSummary.goalsA === "number") {
      return {
        goalsA: finalSummary.goalsA,
        goalsB: finalSummary.goalsB,
      };
    }

    return { goalsA: 0, goalsB: 0 };
  }, [matchDoc, events, finalSummary]);

  const { goalsA, goalsB } = computedScores;

  const displayNameA = teamALabel ? getShortName(teamALabel) : "";
  const displayNameB = teamBLabel ? getShortName(teamBLabel) : "";

  // simple sorted copy by timeSeconds, just in case
  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) => (a.timeSeconds || 0) - (b.timeSeconds || 0)
    );
  }, [events]);

  // 🔁 Local 1-second countdown for smoother timer
  useEffect(() => {
    if (!matchDoc) return;
    if (isFinished) return;
    if (
      localSecondsLeft == null ||
      !Number.isFinite(localSecondsLeft) ||
      localSecondsLeft <= 0
    ) {
      return;
    }

    const id = setInterval(() => {
      setLocalSecondsLeft((prev) => {
        if (prev == null) return prev;
        const next = prev - 1;
        return next >= 0 ? next : 0;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [matchDoc, isFinished, localSecondsLeft]);

  const hasLiveTimer =
    localSecondsLeft != null && Number.isFinite(localSecondsLeft);

  const timerText = hasLiveTimer ? formatSeconds(localSecondsLeft) : "--:--";

  return (
    <div className="page live-page">
      <header className="header">
        <button
          className="secondary-btn"
          type="button"
          onClick={goBack}
          style={{ marginBottom: "0.75rem" }}
        >
          ← Back to Home
        </button>

        <h1>Spectator View</h1>
        {matchNumber ? (
          <p>Watching match #{matchNumber}</p>
        ) : (
          <p>Live Turf Kings score tracker</p>
        )}
      </header>

      <section className="card">
        {loading && (
          <p className="muted" style={{ textAlign: "center" }}>
            Connecting to live match…
          </p>
        )}

        {!loading && !matchDoc && !errorText && (
          <p className="muted" style={{ textAlign: "center" }}>
            There is no active match yet. Once the captain starts logging
            events, the live score will appear here.
          </p>
        )}

        {errorText && (
          <p className="error-text" style={{ textAlign: "center" }}>
            {errorText}
          </p>
        )}

        {matchDoc && (
          <>
            <div className="timer-row" style={{ marginBottom: "1rem" }}>
              {isFinished ? (
                <span className="timer-warning">
                  Match finished – final score below.
                </span>
              ) : (
                <>
                  <div className="timer-display">{timerText}</div>
                  <span className="muted" style={{ marginLeft: "0.75rem" }}>
                    Match in progress – updates are live.
                  </span>
                </>
              )}
            </div>

            {/* Scoreboard */}
            <div className="score-row">
              <div className="score-team">
                <strong className="score-team-name">
                  {displayNameA || "Team A"}
                </strong>
                <div className="score-number">{goalsA}</div>
              </div>
              <div className="score-dash">–</div>
              <div className="score-team">
                <strong className="score-team-name">
                  {displayNameB || "Team B"}
                </strong>
                <div className="score-number">{goalsB}</div>
              </div>
            </div>

            {(teamALabel || teamBLabel || standbyLabel) && (
              <p className="muted" style={{ textAlign: "center" }}>
                On-field:{" "}
                <strong>{teamALabel || "Team A"}</strong> vs{" "}
                <strong>{teamBLabel || "Team B"}</strong>
                {standbyLabel && (
                  <>
                    {" "}
                    | Standby: <strong>{standbyLabel}</strong>
                  </>
                )}
              </p>
            )}

            {/* Event log */}
            <div className="event-log" style={{ marginTop: "1.5rem" }}>
              <div className="event-log-header">
                <h3>Match Events</h3>
              </div>

              {sortedEvents.length === 0 ? (
                <p className="muted">
                  No events logged yet. When the captain adds goals or shibobos,
                  they&apos;ll appear here instantly.
                </p>
              ) : (
                <ul>
                  {sortedEvents.map((e) => {
                    const typeLabel =
                      e.type === "shibobo" ? "Shibobo" : "Goal";
                    const who =
                      e.scorer ||
                      e.player ||
                      e.playerName ||
                      "Unknown player";
                    const assist =
                      e.assist && e.assist !== ""
                        ? ` (assist: ${e.assist})`
                        : "";

                    return (
                      <li key={e.id} className="event-item">
                        <span>
                          [{formatSeconds(e.timeSeconds)}]{" "}
                          <strong>{typeLabel}</strong> – {who}
                          {assist}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
