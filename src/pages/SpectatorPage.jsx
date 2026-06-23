// src/pages/SpectatorPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  FANM_NATIONAL_TEAMS,
  FANM_PRO_CLUBS,
} from "../data/fanm/fanmTeamLibrary.js";
import { db } from "../firebaseConfig.js";
import { getMatchDoc } from "../core/clubFirestorePaths";
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
    
    Madrid: "MAD",
    
  };
  if (map[label]) return map[label];

  const cleaned = label.replace(/team/gi, "").trim();
  if (!cleaned) return label;
  return cleaned.slice(0, 3).toUpperCase();
}

function normalizeIdentityLookup(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const FANM_TEAM_IDENTITY_LOOKUP = [
  ...(Array.isArray(FANM_NATIONAL_TEAMS) ? FANM_NATIONAL_TEAMS : []),
  ...(Array.isArray(FANM_PRO_CLUBS) ? FANM_PRO_CLUBS : []),
];

function resolveSpectatorTeamIdentity(team = {}) {
  if (team?.teamIdentity) return team.teamIdentity;

  const keys = [
    team?.abbr,
    team?.label,
    team?.name,
    team?.title,
  ]
    .map(normalizeIdentityLookup)
    .filter(Boolean);

  return (
    FANM_TEAM_IDENTITY_LOOKUP.find((identity) => {
      const identityKeys = [
        identity?.abbr,
        identity?.name,
      ]
        .map(normalizeIdentityLookup)
        .filter(Boolean);

      return keys.some((key) => identityKeys.includes(key));
    }) || null
  );
}

function getSpectatorTeamLabel(team = {}, short = false) {
  const identity = resolveSpectatorTeamIdentity(team);
  if (short && identity?.abbr) return identity.abbr;
  if (identity?.name) return identity.name;
  if (short) return team?.abbrev || getShortName(team?.label);
  return team?.label || team?.name || team?.title || "Team";
}

function SpectatorTeamBadge({ team, short = false }) {
  const identity = resolveSpectatorTeamIdentity(team);
  const label = getSpectatorTeamLabel(team, short);

  return (
    <span className="fanm-live-team-badge spectator-team-badge">
      {identity?.type === "national" && identity.flag ? (
        <span className="fanm-live-team-flag">{identity.flag}</span>
      ) : identity?.logo32 ? (
        <img
          src={identity.logo32}
          alt=""
          className="fanm-live-team-logo"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}


function getSpectatorTeamAccent(seed = "") {
  const palette = [
    {
      soft: "rgba(34, 197, 94, 0.14)",
      border: "rgba(34, 197, 94, 0.42)",
      dot: "#22c55e",
    },
    {
      soft: "rgba(59, 130, 246, 0.14)",
      border: "rgba(59, 130, 246, 0.42)",
      dot: "#3b82f6",
    },
    {
      soft: "rgba(239, 68, 68, 0.14)",
      border: "rgba(239, 68, 68, 0.42)",
      dot: "#ef4444",
    },
    {
      soft: "rgba(168, 85, 247, 0.14)",
      border: "rgba(168, 85, 247, 0.42)",
      dot: "#a855f7",
    },
    {
      soft: "rgba(250, 204, 21, 0.13)",
      border: "rgba(250, 204, 21, 0.4)",
      dot: "#facc15",
    },
  ];

  const key = String(seed || "");
  const total = key.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[total % palette.length];
}

function displaySpectatorName(name) {
  const clean = String(name || "").trim();
  if (!clean) return "Unknown player";
  return clean;
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
    const ref = getMatchDoc(db, "current");

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
    teamAId,
    teamBId,
    standbyId,
    teamASnapshot,
    teamBSnapshot,
    standbySnapshot,
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

  const teamAForDisplay = teamASnapshot || {
    id: teamAId,
    label: teamALabel,
    name: teamALabel,
  };

  const teamBForDisplay = teamBSnapshot || {
    id: teamBId,
    label: teamBLabel,
    name: teamBLabel,
  };

  const standbyForDisplay = standbySnapshot || {
    id: standbyId,
    label: standbyLabel,
    name: standbyLabel,
  };

  // simple sorted copy by timeSeconds, just in case
  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) => (a.timeSeconds || 0) - (b.timeSeconds || 0)
    );
  }, [events]);

  const goalEvents = useMemo(() => {
    return sortedEvents
      .filter((e) => e?.type === "goal")
      .slice()
      .reverse();
  }, [sortedEvents]);

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
          <p>Live score tracker</p>
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
                  <SpectatorTeamBadge team={teamAForDisplay} />
                </strong>
                <div className="score-number">{goalsA}</div>
              </div>
              <div className="score-dash">–</div>
              <div className="score-team">
                <strong className="score-team-name">
                  <SpectatorTeamBadge team={teamBForDisplay} />
                </strong>
                <div className="score-number">{goalsB}</div>
              </div>
            </div>

            {(teamALabel || teamBLabel || standbyLabel) && (
              <p className="muted" style={{ textAlign: "center" }}>
                On-field:{" "}
                <strong><SpectatorTeamBadge team={teamAForDisplay} short /></strong> vs{" "}
                <strong><SpectatorTeamBadge team={teamBForDisplay} short /></strong>
                {standbyLabel && (
                  <>
                    {" "}
                    | Standby: <strong><SpectatorTeamBadge team={standbyForDisplay} short /></strong>
                  </>
                )}
              </p>
            )}

            {/* Premium latest goals */}
            <div className="event-log spectator-goals-feed" style={{ marginTop: "1.5rem" }}>
              <div className="event-log-header spectator-feed-header">
                <h3>⚽ Latest Goals</h3>
                {goalEvents.length > 3 ? (
                  <span className="muted small">Showing latest 3</span>
                ) : null}
              </div>

              {goalEvents.length === 0 ? (
                <p className="muted">
                  No goals yet. When a goal is recorded, the scorer will appear here live.
                </p>
              ) : (
                <ul className="spectator-goals-list">
                  {goalEvents.map((e, idx) => {
                    const teamForGoal =
                      e.teamId === matchDoc.teamAId
                        ? teamAForDisplay
                        : e.teamId === matchDoc.teamBId
                        ? teamBForDisplay
                        : { label: "Team" };

                    const teamLabel = getSpectatorTeamLabel(teamForGoal, false);
                    const teamAbbrev = getSpectatorTeamLabel(teamForGoal, true);
                    const goalTheme = getSpectatorTeamAccent(teamLabel);

                    return (
                      <li
                        key={e.id || `${e.timeSeconds}-${idx}`}
                        className="event-item premium-goal-event spectator-premium-goal-event"
                        style={{
                          "--goal-team-soft": goalTheme.soft,
                          "--goal-team-border": goalTheme.border,
                          "--goal-team-dot": goalTheme.dot,
                        }}
                      >
                        <div className="premium-goal-main">
                          <span className="premium-goal-icon">⚽</span>
                          <div className="premium-goal-text">
                            <div className="premium-goal-topline">
                              <span className="premium-goal-clock">
                                {formatSeconds(e.timeSeconds)}
                              </span>
                              <span className="premium-goal-team">{teamLabel}</span>
                            </div>
                            <div className="premium-goal-scorer">
                              {displaySpectatorName(e.scorer)}
                              <span className="premium-goal-abbrev"> ({teamAbbrev})</span>
                            </div>
                            {e.assist ? (
                              <div className="premium-goal-assist">
                                Assist: {displaySpectatorName(e.assist)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Compact full event log */}
            <div className="event-log spectator-compact-events" style={{ marginTop: "1rem" }}>
              <div className="event-log-header">
                <h3>Match Events</h3>
              </div>

              {sortedEvents.length === 0 ? (
                <p className="muted">
                  No events logged yet.
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
                        ? ` · Assist: ${e.assist}`
                        : "";

                    return (
                      <li key={e.id} className="event-item spectator-compact-event-item">
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
