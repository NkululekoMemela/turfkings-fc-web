// src/pages/StatsPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";

export function StatsPage({ teams, results, allEvents, cameFromLive, onBack }) {
  // ---------- Helpers ----------
  const teamById = useMemo(() => {
    const map = new Map();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const getTeamName = (id) => teamById.get(id)?.label || "Unknown";

  // Map player -> team label (first team that contains the player)
  const playerTeamMap = useMemo(() => {
    const map = {};
    teams.forEach((t) => {
      (t.players || []).forEach((p) => {
        if (!map[p]) {
          map[p] = t.label;
        }
      });
    });
    return map;
  }, [teams]);

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

    results.forEach((r) => {
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
  }, [teams, results]);

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

    allEvents.forEach((e) => {
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

    // attach team name + total if available
    Object.values(stats).forEach((p) => {
      p.teamName = playerTeamMap[p.name] || "—";
      p.total = p.goals + p.assists + p.shibobos; // 👈 combined total
    });

    return Object.values(stats);
  }, [allEvents, playerTeamMap]);

  // Combined player rankings (main table: total = goals + assists + shibobos)
  const combinedLeaderboard = useMemo(() => {
    const arr = playerStats
      .filter((p) => (p.total || 0) > 0)
      .slice();
    arr.sort((x, y) => {
      if (y.total !== x.total) return y.total - x.total;       // sort by total first
      if (y.goals !== x.goals) return y.goals - x.goals;       // then goals
      if (y.assists !== x.assists) return y.assists - x.assists; // then assists
      if (y.shibobos !== x.shibobos) return y.shibobos - x.shibobos; // then shibobos
      return x.name.localeCompare(y.name);
    });
    return arr;
  }, [playerStats]);

  // Top scorers table: goals only + team
  const goalLeaderboard = useMemo(() => {
    const arr = playerStats.filter((p) => p.goals > 0).slice();
    arr.sort((x, y) => {
      if (y.goals !== x.goals) return y.goals - x.goals;
      return x.name.localeCompare(y.name);
    });
    return arr;
  }, [playerStats]);

  // Playmakers table: assists only + team
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
    const arr = results.slice();
    arr.sort((a, b) => a.matchNo - b.matchNo);
    return arr;
  }, [results]);

  const eventsByMatch = useMemo(() => {
    const map = new Map();
    allEvents.forEach((e) => {
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
  }, [allEvents]);

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

  // ---------- TABS: which table is visible ----------
  // options: "matches", "combined", "goals", "assists", "teams"
  const [activeTab, setActiveTab] = useState("teams"); // default to Team Standings

  // ---------- RENDER ----------
  return (
    <div className="page stats-page">
      <header className="header">
        <h1>Stats &amp; Leaderboards</h1>
        <button className="secondary-btn" onClick={onBack}>
          Back
        </button>
      </header>

      {/* Tab buttons */}
      <section className="card">
        <h2>View</h2>
        <div className="actions-row stats-tabs">
          {/* Team Standings + Match Results (left side) */}
          <button
            className={
              activeTab === "teams" ? "secondary-btn active" : "secondary-btn"
            }
            onClick={() => setActiveTab("teams")}
          >
            Team Standings
          </button>
          <button
            className={
              activeTab === "matches" ? "secondary-btn active" : "secondary-btn"
            }
            onClick={() => setActiveTab("matches")}
          >
            Match Results
          </button>

          {/* Rest of buttons */}
          <button
            className={
              activeTab === "goals" ? "secondary-btn active" : "secondary-btn"
            }
            onClick={() => setActiveTab("goals")}
          >
            Top Scorers
          </button>
          <button
            className={
              activeTab === "assists" ? "secondary-btn active" : "secondary-btn"
            }
            onClick={() => setActiveTab("assists")}
          >
            Playmakers
          </button>
          <button
            className={
              activeTab === "combined" ? "secondary-btn active" : "secondary-btn"
            }
            onClick={() => setActiveTab("combined")}
          >
            Summary Player Stats
          </button>
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
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((t, idx) => (
                  <tr key={t.teamId}>
                    <td>{idx + 1}</td>
                    <td>{t.name}</td>
                    <td>{t.played}</td>
                    <td>{t.won}</td>
                    <td>{t.drawn}</td>
                    <td>{t.lost}</td>
                    <td>{t.goalsFor}</td>
                    <td>{t.goalsAgainst}</td>
                    <td>{t.goalDiff}</td>
                    <td>{t.points}</td>
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
          <h2>Player Rankings (Total = Goals + Assists + Shibobo)</h2>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Goals</th>
                  <th>Assists</th>
                  <th>Shibobo</th>
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

      {/* TOP SCORERS TABLE: GOALS ONLY + TEAM */}
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

      {/* PLAYMAKERS TABLE: ASSISTS ONLY + TEAM */}
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

      {/* MATCH RESULTS + CLICK FOR EVENT BREAKDOWN */}
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

                  return (
                    <React.Fragment key={r.matchNo}>
                      <tr
                        className={isExpanded ? "match-row expanded" : "match-row"}
                        onClick={() => toggleMatchDetails(r.matchNo)}
                      >
                        <td>{r.matchNo}</td>
                        <td>{teamAName}</td>
                        <td>
                          {r.goalsA} – {r.goalsB}
                        </td>
                        <td>{teamBName}</td>
                        <td>{resultText}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="match-details-row">
                          <td colSpan={5}>
                            {events.length === 0 ? (
                              <p className="muted">
                                No event breakdown recorded for this match.
                              </p>
                            ) : (
                              <ul className="event-details-list">
                                {events.map((e) => {
                                  const teamName = getTeamName(e.teamId);
                                  const label =
                                    e.type === "shibobo" ? "Shibobo" : "Goal";
                                  const t = formatSecondsSafe(e.timeSeconds);
                                  return (
                                    <li key={e.id}>
                                      [{t}] {teamName} – <strong>{label}</strong>:{" "}
                                      {e.scorer}
                                      {e.assist
                                        ? ` (assist: ${e.assist})`
                                        : ""}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </td>
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
