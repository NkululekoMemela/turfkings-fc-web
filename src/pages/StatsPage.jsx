// src/pages/StatsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMemberNameMap } from "../core/nameMapping.js";

export function StatsPage({
  teams,
  results,
  allEvents,
  cameFromLive,
  currentMatchDay, // still accepted but no longer used – safe to keep
  onBack,
  onGoToPlayerCards, // navigate to Player Cards page
  onGoToPeerReview,  // navigate to Peer Review page
  // archived “previous weeks” data:
  archivedResults = [],
  archivedEvents = [],
  // NEW: members from Firestore
  members = [],
}) {
  // ---------- Helpers ----------
  const teamById = useMemo(() => {
    const map = new Map();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const getTeamName = (id) => teamById.get(id)?.label || "Unknown";

  // Member-based name normalisation
  const { normalizeName } = useMemberNameMap(members);

  // Map player -> team label (first team that contains the player)
  const playerTeamMap = useMemo(() => {
    const map = {};
    teams.forEach((t) => {
      (t.players || []).forEach((p) => {
        const rawName = typeof p === "string" ? p : p?.name || p?.displayName;
        const name = normalizeName(rawName);
        if (name && !map[name]) {
          map[name] = t.label;
        }
      });
    });
    return map;
  }, [teams, normalizeName]);

  // ---------- VIEW MODE: CURRENT WEEK vs FULL SEASON ----------
  const [viewMode, setViewMode] = useState("current"); // "current" | "season"

  const currentResults = results || [];
  const currentEvents = allEvents || [];

  const seasonResults = useMemo(
    () => [...(archivedResults || []), ...currentResults],
    [archivedResults, currentResults]
  );

  const seasonEvents = useMemo(
    () => [...(archivedEvents || []), ...currentEvents],
    [archivedEvents, currentEvents]
  );

  const visibleResults =
    viewMode === "season" ? seasonResults : currentResults;
  const visibleEventsRaw =
    viewMode === "season" ? seasonEvents : currentEvents;

  // ---------- NORMALISED EVENTS (names mapped to members) ----------
  const visibleEvents = useMemo(
    () =>
      (visibleEventsRaw || []).map((e) => ({
        ...e,
        scorer: normalizeName(e.scorer),
        assist: normalizeName(e.assist),
      })),
    [visibleEventsRaw, normalizeName]
  );

  // ---------- TEAM TABLE (points, GD, etc.) ----------
  const teamStats = useMemo(() => {
    const base = {};
    teams.forEach((t) => {
      base[t.id] = {
        teamId: t.id,
        name: t.label,
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

    (visibleResults || []).forEach((r) => {
      const a = base[r.teamAId];
      const b = base[r.teamBId];
      if (!a || !b) return;

      a.played += 1;
      b.played += 1;

      a.goalsFor += r.goalsA;
      a.goalsAgainst += r.goalsB;
      b.goalsFor += r.goalsB;
      b.goalsAgainst += r.goalsA;

      if (r.isDraw) {
        a.drawn += 1;
        b.drawn += 1;
        a.points += 1;
        b.points += 1;
      } else {
        const winnerId = r.winnerId;
        if (winnerId === r.teamAId) {
          a.won += 1;
          b.lost += 1;
          a.points += 3;
        } else if (winnerId === r.teamBId) {
          b.won += 1;
          a.lost += 1;
          b.points += 3;
        }
      }
    });

    Object.values(base).forEach((t) => {
      t.goalDiff = t.goalsFor - t.goalsAgainst;
    });

    const arr = Object.values(base);
    arr.sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
      if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      return x.name.localeCompare(y.name);
    });

    return arr;
  }, [teams, visibleResults]);

  // ---------- PLAYER STATS (goals, assists, shibobos) ----------
  const playerStats = useMemo(() => {
    const stats = {};

    const getOrCreate = (playerName) => {
      if (!stats[playerName]) {
        stats[playerName] = {
          name: playerName,
          goals: 0,
          assists: 0,
          shibobos: 0,
        };
      }
      return stats[playerName];
    };

    (visibleEvents || []).forEach((e) => {
      if (!e.scorer && !e.assist) return;

      if (e.scorer) {
        const s = getOrCreate(e.scorer);
        if (e.type === "goal") {
          s.goals += 1;
        } else if (e.type === "shibobo") {
          s.shibobos += 1;
        }
      }
      if (e.assist) {
        const a = getOrCreate(e.assist);
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
    const arr = playerStats
      .filter((p) => (p.total || 0) > 0)
      .slice();
    arr.sort((x, y) => {
      if (y.total !== x.total) return y.total - x.total;
      if (y.goals !== x.goals) return y.goals - x.goals;
      if (y.assists !== x.assists) return y.assists - x.assists;
      if (y.shibobos !== x.shibobos) return y.shibobos - x.shibobos;
      return x.name.localeCompare(y.name);
    });
    return arr;
  }, [playerStats]);

  const goalLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => p.goals > 0).slice();
    arr.sort((x, y) => {
      if (y.goals !== x.goals) return y.goals - x.goals;
      return x.name.localeCompare(y.name);
    });
    return arr;
  }, [playerStats]);

  const assistLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => p.assists > 0).slice();
    arr.sort((x, y) => {
      if (y.assists !== x.assists) return y.assists - x.assists;
      return x.name.localeCompare(y.name);
    });
    return arr;
  }, [playerStats]);

  // ---------- FULL MATCH LIST + EVENTS BREAKDOWN ----------
  const sortedResults = useMemo(() => {
    const arr = (visibleResults || []).slice();
    arr.sort((a, b) => a.matchNo - b.matchNo);
    return arr;
  }, [visibleResults]);

  const eventsByMatch = useMemo(() => {
    const map = new Map();
    (visibleEvents || []).forEach((e) => {
      if (e.matchNo == null) return;
      if (!map.has(e.matchNo)) map.set(e.matchNo, []);
      map.get(e.matchNo).push(e);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const ta = a.timeSeconds ?? 0;
        const tb = b.timeSeconds ?? 0;
        return ta - tb;
      });
    });
    return map;
  }, [visibleEvents]);

  const [expandedMatchNo, setExpandedMatchNo] = useState(null);

  const toggleMatchDetails = (matchNo) => {
    setExpandedMatchNo((prev) => (prev === matchNo ? null : matchNo));
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
          if (stay) {
            onBack();
          } else {
            startTimer();
          }
        } catch (_) {
          onBack();
        }
      }, TIMEOUT_MS);
    };

    const handleActivity = () => {
      startTimer();
    };

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

  // ---------- RENDER ----------
  return (
    <div className="page stats-page">
      <header className="header">
        <h1>Stats &amp; Leaderboards</h1>
        <div className="stats-header-actions">
          <button className="secondary-btn" onClick={onBack}>
            Back
          </button>
          {/* swapped order: Rate Player first, then Player cards */}
          <button
            className="secondary-btn"
            onClick={onGoToPeerReview}
          >
            Rate Player
          </button>
          <button
            className="secondary-btn"
            onClick={onGoToPlayerCards}
          >
            Player cards
          </button>
        </div>
      </header>

      {/* Controls: view mode + tab buttons */}
      <section className="card">
        <h2>View</h2>

        <div className="stats-controls">
          <div className="stats-controls-left">
            <div className="segment-wrapper">
              <div className="segmented-toggle">
                <button
                  type="button"
                  className={
                    viewMode === "current"
                      ? "segmented-option active"
                      : "segmented-option"
                  }
                  onClick={() => setViewMode("current")}
                >
                  Current week
                </button>
                <button
                  type="button"
                  className={
                    viewMode === "season"
                      ? "segmented-option active"
                      : "segmented-option"
                  }
                  onClick={() => setViewMode("season")}
                >
                  Full season
                </button>
              </div>
            </div>
          </div>

          <div className="actions-row stats-tabs">
            <button
              className={
                activeTab === "teams"
                  ? "secondary-btn active"
                  : "secondary-btn"
              }
              onClick={() => setActiveTab("teams")}
            >
              Team Standings
            </button>
            <button
              className={
                activeTab === "matches"
                  ? "secondary-btn active"
                  : "secondary-btn"
              }
              onClick={() => setActiveTab("matches")}
            >
              Match Results
            </button>
            <button
              className={
                activeTab === "goals"
                  ? "secondary-btn active"
                  : "secondary-btn"
              }
              onClick={() => setActiveTab("goals")}
            >
              Top Scorers
            </button>
            <button
              className={
                activeTab === "assists"
                  ? "secondary-btn active"
                  : "secondary-btn"
              }
              onClick={() => setActiveTab("assists")}
            >
              Playmakers
            </button>
            <button
              className={
                activeTab === "combined"
                  ? "secondary-btn active"
                  : "secondary-btn"
              }
              onClick={() => setActiveTab("combined")}
            >
              Summary Player Stats
            </button>
          </div>
        </div>
      </section>

      {/* TEAM TABLE */}
      {activeTab === "teams" && (
        <section className="card">
          <h2>Team Standings</h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>Pts</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((t, idx) => (
                  <tr key={t.teamId}>
                    <td>{idx + 1}</td>
                    <td>{t.name}</td>
                    <td>{t.points}</td>
                    <td>{t.played}</td>
                    <td>{t.won}</td>
                    <td>{t.drawn}</td>
                    <td>{t.lost}</td>
                    <td>{t.goalsFor}</td>
                    <td>{t.goalsAgainst}</td>
                    <td>{t.goalDiff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MAIN COMBINED PLAYER TABLE */}
      {activeTab === "combined" && (
        <section className="card">
          <h2>Player Rankings (Total = Goals + Assists + Saves)</h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Goals</th>
                  <th>Assists</th>
                  <th>Saves</th>
                  <th>G-A-S</th>
                </tr>
              </thead>
              <tbody>
                {combinedLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No player stats recorded yet.
                    </td>
                  </tr>
                )}
                {combinedLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-combined"}>
                    <td>{idx + 1}</td>
                    <td>{p.name}</td>
                    <td>{p.teamName || "—"}</td>
                    <td>{p.goals}</td>
                    <td>{p.assists}</td>
                    <td>{p.shibobos}</td>
                    <td>{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TOP SCORERS */}
      {activeTab === "goals" && (
        <section className="card">
          <h2>Top Scorers</h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Goals</th>
                </tr>
              </thead>
              <tbody>
                {goalLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No goals recorded yet.
                    </td>
                  </tr>
                )}
                {goalLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-g"}>
                    <td>{idx + 1}</td>
                    <td>{p.name}</td>
                    <td>{p.teamName || "—"}</td>
                    <td>{p.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PLAYMAKERS */}
      {activeTab === "assists" && (
        <section className="card">
          <h2>Top Playmakers (Assists)</h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Assists</th>
                </tr>
              </thead>
              <tbody>
                {assistLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No assists recorded yet.
                    </td>
                  </tr>
                )}
                {assistLeaderboard.map((p, idx) => (
                  <tr key={p.name + "-a"}>
                    <td>{idx + 1}</td>
                    <td>{p.name}</td>
                    <td>{p.teamName || "—"}</td>
                    <td>{p.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MATCH RESULTS */}
      {activeTab === "matches" && (
        <section className="card">
          <h2>All Match Results</h2>
          <p className="muted">
            Tap a match row to see goal scorers and assists for that game.
          </p>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Match #</th>
                  <th>Team A</th>
                  <th>Score</th>
                  <th>Team B</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No matches played yet.
                    </td>
                  </tr>
                )}
                {sortedResults.map((r) => {
                  const teamAName = getTeamName(r.teamAId);
                  const teamBName = getTeamName(r.teamBId);
                  let resultText = "Draw";
                  if (!r.isDraw) {
                    const winnerName = getTeamName(r.winnerId);
                    resultText = `Won by ${winnerName}`;
                  }

                  const isExpanded = expandedMatchNo === r.matchNo;
                  const events = eventsByMatch.get(r.matchNo) || [];

                  const teamAEvents = events.filter(
                    (e) => e.teamId === r.teamAId && e.scorer
                  );
                  const teamBEvents = events.filter(
                    (e) => e.teamId === r.teamBId && e.scorer
                  );

                  return (
                    <React.Fragment key={r.matchNo}>
                      <tr
                        className={
                          isExpanded ? "match-row expanded" : "match-row"
                        }
                        onClick={() => toggleMatchDetails(r.matchNo)}
                      >
                        <td>
                          <span className="match-toggle-indicator">
                            {isExpanded ? "▾" : "▸"}
                          </span>{" "}
                          {r.matchNo}
                        </td>
                        <td>{teamAName}</td>
                        <td>
                          {r.goalsA} – {r.goalsB}
                        </td>
                        <td>{teamBName}</td>
                        <td>{resultText}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="match-details-row">
                          <td />
                          <td>
                            {events.length === 0 ? (
                              <span className="muted">
                                No event breakdown recorded.
                              </span>
                            ) : teamAEvents.length === 0 ? null : (
                              <div className="team-scorers">
                                {teamAEvents.map((e) => {
                                  const actionLabel =
                                    e.type === "shibobo"
                                      ? "shibobo"
                                      : "goal";
                                  return (
                                    <div
                                      key={e.id}
                                      className="scorer-line"
                                    >
                                      {e.scorer}
                                      {e.assist
                                        ? ` (assist: ${e.assist})`
                                        : ""}{" "}
                                      – {actionLabel}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td />
                          <td>
                            {events.length === 0 ? (
                              <span className="muted">
                                No event breakdown recorded.
                              </span>
                            ) : teamBEvents.length === 0 ? null : (
                              <div className="team-scorers">
                                {teamBEvents.map((e) => {
                                  const actionLabel =
                                    e.type === "shibobo"
                                      ? "shibobo"
                                      : "goal";
                                  return (
                                    <div
                                      key={e.id}
                                      className="scorer-line"
                                    >
                                      {e.scorer}
                                      {e.assist
                                        ? ` (assist: ${e.assist})`
                                        : ""}{" "}
                                      – {actionLabel}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td />
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

function formatSecondsSafe(s) {
  const v = typeof s === "number" && !Number.isNaN(s) ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
