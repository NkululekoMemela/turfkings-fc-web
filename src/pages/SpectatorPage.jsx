// src/pages/SpectatorPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  FANM_NATIONAL_TEAMS,
  FANM_PRO_CLUBS,
} from "../data/fanm/fanmTeamLibrary.js";
import { db } from "../firebaseConfig.js";
import {
  getMatchDoc,
  getScopedMatchDoc,
} from "../core/clubFirestorePaths";
import { doc, onSnapshot } from "firebase/firestore";
import { subscribeToMatchHighlights } from "../storage/VideoHighlightsRepository.js";

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

function normalizeSpectatorMatchType(value = "") {
  return String(value || "").trim().toUpperCase();
}

function isSameSpectatorFixture({
  liveData = {},
  expectedMatchType = "",
}) {
  /*
   * Once the referee presses Start Match, the Firestore current-match
   * document is authoritative for teams, timer, score and events.
   *
   * Home's projected fixture can briefly differ from that document, so
   * team IDs and match numbers must not hide a legitimately live match.
   * We reject only a document explicitly belonging to the other mode.
   */
  const selectedType = normalizeSpectatorMatchType(expectedMatchType);
  const liveType = normalizeSpectatorMatchType(
    liveData?.matchType ||
      liveData?.type ||
      liveData?.matchMetadata?.matchType
  );

  if (selectedType && liveType && selectedType !== liveType) {
    return false;
  }

  return true;
}

function getSpectatorHighlightType(highlight = {}) {
  return String(
    highlight?.normalizedType ||
      highlight?.tag ||
      highlight?.type ||
      ""
  )
    .trim()
    .toLowerCase();
}

function getSpectatorHighlightPlayer(highlight = {}) {
  return displaySpectatorName(
    highlight?.goalScorerName ||
      highlight?.goalScorer ||
      highlight?.scorer ||
      highlight?.keeperName ||
      highlight?.skillPlayer ||
      highlight?.playerName ||
      highlight?.player ||
      ""
  );
}

function getSpectatorHighlightSeconds(highlight = {}) {
  const value = Number(
    highlight?.timeSeconds ??
      highlight?.matchTimeSeconds ??
      highlight?.eventTimeSeconds
  );

  return Number.isFinite(value) && value >= 0 ? value : null;
}

function getSpectatorHighlightCreatedAt(highlight = {}) {
  return (
    highlight?.createdAt?.toMillis?.() ||
    highlight?.createdAtServer?.toMillis?.() ||
    new Date(
      highlight?.createdAtISO ||
        highlight?.uploadedAtISO ||
        0
    ).getTime() ||
    0
  );
}

function getSpectatorHighlightPresentation(highlight = {}) {
  const type = getSpectatorHighlightType(highlight);

  if (type === "goal") return { icon: "⚽", label: "GOAL" };
  if (type === "save") return { icon: "🧤", label: "SAVE" };
  return { icon: "✨", label: "SKILL" };
}

function getSpectatorEventPresentation(event = {}) {
  const type = String(event?.type || "").trim().toLowerCase();

  if (type === "goal") return { icon: "⚽", label: "Goal" };
  if (type === "shibobo") return { icon: "🎯", label: "Shibobo" };
  if (type === "yellow_card") return { icon: "🟨", label: "Yellow card" };
  if (type === "red_card") return { icon: "🟥", label: "Red card" };
  if (type === "injury") return { icon: "🤕", label: "Injury" };

  return { icon: "●", label: "Match event" };
}

function getSpectatorEventPlayer(event = {}) {
  return displaySpectatorName(
    event?.scorer ||
      event?.playerName ||
      event?.player ||
      event?.targetName ||
      ""
  );
}

function SpectatorEventCard({
  event,
  team,
  align = "left",
}) {
  const presentation = getSpectatorEventPresentation(event);
  const player = getSpectatorEventPlayer(event);
  const teamLabel = getSpectatorTeamLabel(team, false);
  const teamAbbrev = getSpectatorTeamLabel(team, true);
  const theme = getSpectatorTeamAccent(teamLabel);
  const isRight = align === "right";

  return (
    <article
      style={{
        display: "flex",
        flexDirection: isRight ? "row-reverse" : "row",
        alignItems: "center",
        gap: "0.55rem",
        padding: "0.65rem",
        border: `1px solid ${theme.border}`,
        borderRadius: "0.8rem",
        background: theme.soft,
        textAlign: isRight ? "right" : "left",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          flex: "0 0 2rem",
          width: "2rem",
          height: "2rem",
          borderRadius: "999px",
          background: "rgba(2, 6, 23, 0.72)",
          fontSize: "1rem",
        }}
      >
        {presentation.icon}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="muted small"
          style={{
            display: "flex",
            flexDirection: isRight ? "row-reverse" : "row",
            gap: "0.35rem",
            flexWrap: "wrap",
          }}
        >
          <span>{formatSeconds(event?.timeSeconds)}</span>
          <span>{teamLabel}</span>
        </div>

        <div style={{ fontWeight: 800 }}>
          {player}{" "}
          <span className="muted small">
            ({teamAbbrev})
          </span>
        </div>

        <div className="small">
          {presentation.label}
          {event?.assist
            ? ` · Assist: ${displaySpectatorName(event.assist)}`
            : ""}
          {event?.reason
            ? ` · ${String(event.reason).trim()}`
            : ""}
        </div>
      </div>
    </article>
  );
}

export function SpectatorPage(props) {
  // support either prop name to be safe with your existing App.jsx
  const goBack = props.onBackToLanding || props.onBack || (() => {});

  const expectedMatch = props.currentMatch || {};
  const expectedMatchNo =
    props.currentMatchNo ??
    expectedMatch?.matchNumber ??
    expectedMatch?.matchNo ??
    null;
  const expectedMatchType = props.matchType || "";
  const activeClubId =
    String(props.activeClubId || "turf-kings").trim();
  const dataScope = props.dataScope || null;
  const highlightsMatchId =
    String(props.currentVideoHighlightsMatchId || "").trim();
  const highlightsClubId =
    String(props.videoHighlightsClubId || "turf-kings").trim();

  const [matchDoc, setMatchDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [matchHighlights, setMatchHighlights] = useState([]);
  const [matchReelOpen, setMatchReelOpen] = useState(false);
  const [matchReelIndex, setMatchReelIndex] = useState(0);

  // local countdown state for smoother timer
  const [localSecondsLeft, setLocalSecondsLeft] = useState(null);

  useEffect(() => {
    const ref = dataScope
      ? getScopedMatchDoc(db, "current", dataScope)
      : getMatchDoc(db, "current", activeClubId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};

          const isSelectedFixture = isSameSpectatorFixture({
            liveData: data,
            expectedMatchType,
          });

          if (isSelectedFixture) {
            setMatchDoc(data);

            if (
              typeof data.secondsLeft === "number" &&
              Number.isFinite(data.secondsLeft)
            ) {
              setLocalSecondsLeft(Math.max(data.secondsLeft, 0));
            } else {
              setLocalSecondsLeft(null);
            }
          } else {
            // The shared current document still belongs to the other mode.
            setMatchDoc(null);
            setLocalSecondsLeft(null);
          }
        } else {
          setMatchDoc(null);
          setLocalSecondsLeft(null);
        }

        setErrorText("");
        setLoading(false);
      },
      (err) => {
        console.error("Spectator onSnapshot error:", err);
        setErrorText("Could not connect to live match data.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [expectedMatchType, activeClubId, dataScope]);

  useEffect(() => {
    setMatchHighlights([]);

    return subscribeToMatchHighlights({
      matchId: highlightsMatchId,
      clubId: highlightsClubId,
      onChange: setMatchHighlights,
      onError: (error) => {
        console.error(
          "Spectator match-highlight listener failed:",
          error
        );
        setMatchHighlights([]);
      },
    });
  }, [highlightsMatchId, highlightsClubId]);

  const orderedMatchHighlights = useMemo(() => {
    return [...matchHighlights].sort((a, b) => {
      const aSeconds = getSpectatorHighlightSeconds(a);
      const bSeconds = getSpectatorHighlightSeconds(b);

      if (aSeconds != null && bSeconds != null) {
        return aSeconds - bSeconds;
      }

      return (
        getSpectatorHighlightCreatedAt(a) -
        getSpectatorHighlightCreatedAt(b)
      );
    });
  }, [matchHighlights]);

  useEffect(() => {
    if (!orderedMatchHighlights.length) {
      setMatchReelOpen(false);
      setMatchReelIndex(0);
      return;
    }

    setMatchReelIndex((currentIndex) =>
      Math.min(
        currentIndex,
        orderedMatchHighlights.length - 1
      )
    );
  }, [orderedMatchHighlights.length]);

  const activeMatchReelHighlight =
    orderedMatchHighlights[matchReelIndex] ||
    orderedMatchHighlights[0] ||
    null;

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

            {goalEvents.length > 0 && (
              <div
                aria-label="Goal scorers"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: "1rem",
                  marginTop: "0.65rem",
                  padding: "0.55rem 0.2rem 0.75rem",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: "0.25rem",
                    textAlign: "left",
                  }}
                >
                  {goalEvents
                    .filter((event) => event?.teamId === teamAId)
                    .map((event, index) => (
                      <div
                        key={
                          event.id ||
                          `scorer-a-${event.timeSeconds}-${index}`
                        }
                        style={{
                          fontSize: "0.82rem",
                          lineHeight: 1.25,
                        }}
                      >
                        <strong>
                          ⚽ {displaySpectatorName(event.scorer)}
                        </strong>{" "}
                        <span className="muted">
                          {formatSeconds(event.timeSeconds)}
                        </span>
                        {event.assist ? (
                          <div className="muted small">
                            Assist:{" "}
                            {displaySpectatorName(event.assist)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.25rem",
                    textAlign: "right",
                  }}
                >
                  {goalEvents
                    .filter((event) => event?.teamId === teamBId)
                    .map((event, index) => (
                      <div
                        key={
                          event.id ||
                          `scorer-b-${event.timeSeconds}-${index}`
                        }
                        style={{
                          fontSize: "0.82rem",
                          lineHeight: 1.25,
                        }}
                      >
                        <strong>
                          {displaySpectatorName(event.scorer)} ⚽
                        </strong>{" "}
                        <span className="muted">
                          {formatSeconds(event.timeSeconds)}
                        </span>
                        {event.assist ? (
                          <div className="muted small">
                            Assist:{" "}
                            {displaySpectatorName(event.assist)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {orderedMatchHighlights.length > 0 && (
              <div
                className="event-log spectator-match-highlights"
                style={{ marginTop: "1rem" }}
              >
                <div className="event-log-header spectator-feed-header">
                  <h3>🎬 Match Reel</h3>
                  <span className="muted small">
                    {orderedMatchHighlights.length}{" "}
                    {orderedMatchHighlights.length === 1
                      ? "highlight"
                      : "highlights"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!matchReelOpen) {
                      setMatchReelIndex(0);
                    }
                    setMatchReelOpen((open) => !open);
                  }}
                  aria-expanded={matchReelOpen}
                  style={{
                    position: "relative",
                    display: "block",
                    width: "100%",
                    minHeight: "108px",
                    padding: 0,
                    overflow: "hidden",
                    border: matchReelOpen
                      ? "2px solid #60a5fa"
                      : "1px solid rgba(96,165,250,0.48)",
                    borderRadius: "0.85rem",
                    background: "#020617",
                    color: "white",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <video
                    src={orderedMatchHighlights[0]?.playableUrl}
                    poster={
                      orderedMatchHighlights[0]?.thumbnailUrl ||
                      orderedMatchHighlights[0]?.posterUrl ||
                      ""
                    }
                    muted
                    playsInline
                    preload="auto"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      pointerEvents: "none",
                    }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(90deg, rgba(2,6,23,0.97) 0%, rgba(2,6,23,0.72) 52%, rgba(2,6,23,0.18) 100%)",
                    }}
                  />

                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      minHeight: "108px",
                      padding: "0.85rem",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "grid",
                        placeItems: "center",
                        flex: "0 0 2.8rem",
                        width: "2.8rem",
                        height: "2.8rem",
                        borderRadius: "999px",
                        background: "rgba(37,99,235,0.86)",
                        border:
                          "1px solid rgba(255,255,255,0.76)",
                        fontSize: "1.15rem",
                      }}
                    >
                      {matchReelOpen ? "▴" : "▶"}
                    </span>

                    <div>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: "1rem",
                        }}
                      >
                        Watch Match Highlights
                      </div>

                      <div
                        className="small"
                        style={{ marginTop: "0.18rem" }}
                      >
                        GOALS · SAVES · SKILLS
                      </div>

                      <div
                        className="muted small"
                        style={{ marginTop: "0.18rem" }}
                      >
                        Continuous live playlist
                      </div>
                    </div>
                  </div>
                </button>

                {matchReelOpen &&
                activeMatchReelHighlight ? (
                  <article
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.7rem",
                      border:
                        "1px solid rgba(96,165,250,0.52)",
                      borderRadius: "0.85rem",
                      background: "rgba(8,15,31,0.9)",
                    }}
                  >
                    <video
                      key={activeMatchReelHighlight.id}
                      src={activeMatchReelHighlight.playableUrl}
                      controls
                      autoPlay
                      playsInline
                      preload="auto"
                      onEnded={() => {
                        if (
                          matchReelIndex <
                          orderedMatchHighlights.length - 1
                        ) {
                          setMatchReelIndex(
                            (index) => index + 1
                          );
                        } else {
                          setMatchReelOpen(false);
                          setMatchReelIndex(0);
                        }
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        aspectRatio: "16 / 9",
                        maxHeight: "420px",
                        objectFit: "contain",
                        borderRadius: "0.65rem",
                        background: "#020617",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.6rem",
                        marginTop: "0.55rem",
                      }}
                    >
                      <div>
                        <strong>
                          {
                            getSpectatorHighlightPresentation(
                              activeMatchReelHighlight
                            ).icon
                          }{" "}
                          {
                            getSpectatorHighlightPresentation(
                              activeMatchReelHighlight
                            ).label
                          }
                        </strong>

                        <div className="small">
                          {getSpectatorHighlightPlayer(
                            activeMatchReelHighlight
                          )}{" "}
                          · {matchReelIndex + 1}/
                          {orderedMatchHighlights.length}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "0.35rem",
                        }}
                      >
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={matchReelIndex === 0}
                          onClick={() =>
                            setMatchReelIndex((index) =>
                              Math.max(0, index - 1)
                            )
                          }
                        >
                          ‹
                        </button>

                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={
                            matchReelIndex >=
                            orderedMatchHighlights.length - 1
                          }
                          onClick={() =>
                            setMatchReelIndex((index) =>
                              Math.min(
                                orderedMatchHighlights.length - 1,
                                index + 1
                              )
                            )
                          }
                        >
                          ›
                        </button>

                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => {
                            setMatchReelOpen(false);
                            setMatchReelIndex(0);
                          }}
                        >
                          Minimize
                        </button>
                      </div>
                    </div>
                  </article>
                ) : null}
              </div>
            )}

          </>
        )}
      </section>
    </div>
  );
}
