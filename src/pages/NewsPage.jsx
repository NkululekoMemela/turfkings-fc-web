// src/pages/NewsPage.jsx
import React, { useMemo, useState } from "react";
import JaydTribute from "../assets/Jayd_Tribute.jpeg"; // <- tribute photo

const BAD_MATCH_NUMBERS = new Set([14, 15, 16, 17]); // drop these from week-1 archive

// change this if I guessed the wrong name
const injuredPlayerName = "Jayd";

export function NewsPage({
  teams,
  // full tournament (seed + previous weeks + current week)
  results,
  allEvents,
  // current match-day only
  currentResults,
  currentEvents,
  onBack,
  // OPTIONAL: map { [playerName]: photoUrl } passed down from Firebase
  playerPhotosByName,
}) {
  // ---------- Helpers ----------
  const teamById = useMemo(() => {
    const map = new Map();
    (teams || []).forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const getTeamName = (id) => teamById.get(id)?.label || "Unknown";

  // Map player -> team label (first team that contains the player)
  const playerTeamMap = useMemo(() => {
    const map = {};
    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const name =
          typeof p === "string" ? p : p?.name || p?.displayName;
        if (name && !map[name]) {
          map[name] = t.label;
        }
      });
    });
    return map;
  }, [teams]);

  // Map player -> photo URL (Firebase + team metadata)
  const mergedPhotoMap = useMemo(() => {
    const map = { ...(playerPhotosByName || {}) };

    (teams || []).forEach((t) => {
      if (t.playerPhotos) {
        Object.entries(t.playerPhotos).forEach(([name, url]) => {
          if (name && url && !map[name]) {
            map[name] = url;
          }
        });
      }

      (t.players || []).forEach((p) => {
        if (p && typeof p === "object") {
          const name = p.name || p.displayName;
          if (name && p.photoUrl && !map[name]) {
            map[name] = p.photoUrl;
          }
        }
      });
    });

    return map;
  }, [teams, playerPhotosByName]);

  const getPlayerPhoto = (name) =>
    name ? mergedPhotoMap[name] || null : null;

  // ---------- RAW DATA SPLIT ----------
  const fullResultsRaw = results || [];
  const fullEventsRaw = allEvents || [];
  const weekResultsRaw = currentResults || [];
  const weekEventsRaw = currentEvents || [];

  // ---------- CLEAN DATA (FULL TOURNAMENT) ----------
  const cleanTournamentResults = useMemo(
    () =>
      fullResultsRaw.filter(
        (r) => r && !BAD_MATCH_NUMBERS.has(r.matchNo)
      ),
    [fullResultsRaw]
  );

  const cleanTournamentEvents = useMemo(
    () =>
      fullEventsRaw.filter(
        (e) => e && !BAD_MATCH_NUMBERS.has(e.matchNo)
      ),
    [fullEventsRaw]
  );

  // ---------- CLEAN DATA (THIS MATCH-DAY) ----------
  const cleanWeekResults = useMemo(
    () =>
      weekResultsRaw.filter(
        (r) => r && !BAD_MATCH_NUMBERS.has(r.matchNo)
      ),
    [weekResultsRaw]
  );

  const cleanWeekEvents = useMemo(
    () =>
      weekEventsRaw.filter(
        (e) => e && !BAD_MATCH_NUMBERS.has(e.matchNo)
      ),
    [weekEventsRaw]
  );

  // ---------- TEAM TABLE (full tournament so far) ----------
  const teamStats = useMemo(() => {
    const base = {};
    (teams || []).forEach((t) => {
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

    cleanTournamentResults.forEach((r) => {
      const a = base[r.teamAId];
      const b = base[r.teamBId];
      if (!a || !b) return;

      const gA = r.goalsA || 0;
      const gB = r.goalsB || 0;

      a.played += 1;
      b.played += 1;

      a.goalsFor += gA;
      a.goalsAgainst += gB;
      b.goalsFor += gB;
      b.goalsAgainst += gA;

      if (r.isDraw) {
        a.drawn += 1;
        b.drawn += 1;
        a.points += 1;
        b.points += 1;
      } else {
        if (r.winnerId === r.teamAId) {
          a.won += 1;
          b.lost += 1;
          a.points += 3;
        } else if (r.winnerId === r.teamBId) {
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
  }, [teams, cleanTournamentResults]);

  const tableLeader = teamStats[0] || null;

  // ---------- PLAYER STATS (full tournament) ----------
  const playerStats = useMemo(() => {
    const stats = {};
    const getOrCreate = (name) => {
      if (!stats[name]) {
        stats[name] = {
          name,
          goals: 0,
          assists: 0,
          shibobos: 0,
        };
      }
      return stats[name];
    };

    cleanTournamentEvents.forEach((e) => {
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

    const arr = Object.values(stats);
    arr.forEach((p) => {
      p.teamName = playerTeamMap[p.name] || "—";
      p.total = p.goals + p.assists + p.shibobos;
    });
    return arr;
  }, [cleanTournamentEvents, playerTeamMap]);

  const topScorer = useMemo(() => {
    let best = null;
    playerStats.forEach((p) => {
      if (p.goals <= 0) return;
      if (
        !best ||
        p.goals > best.goals ||
        (p.goals === best.goals && p.name.localeCompare(best.name) < 0)
      ) {
        best = p;
      }
    });
    return best;
  }, [playerStats]);

  const topPlaymaker = useMemo(() => {
    let best = null;
    playerStats.forEach((p) => {
      if (p.assists <= 0) return;
      if (
        !best ||
        p.assists > best.assists ||
        (p.assists === best.assists && p.name.localeCompare(best.name) < 0)
      ) {
        best = p;
      }
    });
    return best;
  }, [playerStats]);

  // Tournament MVP = goals + assists + shibobos (full tournament)
  const bestOverall = useMemo(() => {
    let best = null;
    playerStats.forEach((p) => {
      if (p.total <= 0) return;
      if (
        !best ||
        p.total > best.total ||
        (p.total === best.total && p.goals > best.goals) ||
        (p.total === best.total &&
          p.goals === best.goals &&
          p.name.localeCompare(best.name) < 0)
      ) {
        best = p;
      }
    });
    return best;
  }, [playerStats]);

  const mvpPhotoUrl = bestOverall ? getPlayerPhoto(bestOverall.name) : null;

  // ---------- STREAK STATS (full tournament) ----------
  const streakStats = useMemo(() => {
    const byMatch = new Map();
    cleanTournamentResults.forEach((r) => {
      byMatch.set(r.matchNo, {
        scorers: new Set(),
        assisters: new Set(),
      });
    });

    cleanTournamentEvents.forEach((e) => {
      const rec = byMatch.get(e.matchNo);
      if (!rec) return;
      if (e.scorer && e.type === "goal") {
        rec.scorers.add(e.scorer);
      }
      if (e.assist) {
        rec.assisters.add(e.assist);
      }
    });

    const matchNos = Array.from(byMatch.keys()).sort((a, b) => a - b);

    const goalStreaks = new Map();
    const assistStreaks = new Map();

    const updateStreaksForMatch = (set, map) => {
      set.forEach((name) => {
        let st = map.get(name);
        if (!st) st = { current: 0, best: 0 };
        st.current += 1;
        if (st.current > st.best) st.best = st.current;
        map.set(name, st);
      });
      map.forEach((st, name) => {
        if (!set.has(name)) {
          st.current = 0;
        }
      });
    };

    matchNos.forEach((m) => {
      const rec = byMatch.get(m);
      if (!rec) return;
      updateStreaksForMatch(rec.scorers, goalStreaks);
      updateStreaksForMatch(rec.assisters, assistStreaks);
    });

    let bestGoal = null;
    goalStreaks.forEach((st, name) => {
      if (st.best <= 0) return;
      if (!bestGoal || st.best > bestGoal.length) {
        bestGoal = { name, length: st.best };
      }
    });

    let bestAssist = null;
    assistStreaks.forEach((st, name) => {
      if (st.best <= 0) return;
      if (!bestAssist || st.best > bestAssist.length) {
        bestAssist = { name, length: st.best };
      }
    });

    if (bestGoal) {
      bestGoal.teamName = playerTeamMap[bestGoal.name] || "—";
    }
    if (bestAssist) {
      bestAssist.teamName = playerTeamMap[bestAssist.name] || "—";
    }

    return { bestGoal, bestAssist };
  }, [cleanTournamentResults, cleanTournamentEvents, playerTeamMap]);

  // ---------- GLOBAL NUMBERS (full tournament) ----------
  const totalMatches = cleanTournamentResults.length;
  const totalGoals = cleanTournamentResults.reduce(
    (acc, r) => acc + (r.goalsA || 0) + (r.goalsB || 0),
    0
  );

  const biggestWin = useMemo(() => {
    let best = null;
    cleanTournamentResults.forEach((r) => {
      const gA = r.goalsA || 0;
      const gB = r.goalsB || 0;
      const diff = Math.abs(gA - gB);
      const goals = gA + gB;
      if (diff === 0) return; // ignore draws
      if (!best || diff > best.diff || (diff === best.diff && goals > best.goals)) {
        best = { ...r, diff, goals };
      }
    });
    return best;
  }, [cleanTournamentResults]);

  // ---------- RECAP TOGGLE (week vs full) ----------
  const [recapScope, setRecapScope] = useState("week"); // "week" | "all"

  const recapResults = useMemo(() => {
    const base =
      recapScope === "week" ? cleanWeekResults : cleanTournamentResults;
    const arr = base.slice();
    arr.sort((a, b) => a.matchNo - b.matchNo);
    return arr;
  }, [recapScope, cleanWeekResults, cleanTournamentResults]);

  const recapEventsByMatch = useMemo(() => {
    const src =
      recapScope === "week" ? cleanWeekEvents : cleanTournamentEvents;
    const map = new Map();
    src.forEach((e) => {
      if (e.matchNo == null) return;
      if (!map.has(e.matchNo)) map.set(e.matchNo, []);
      map.get(e.matchNo).push(e);
    });
    map.forEach((list) =>
      list.sort((a, b) => (a.timeSeconds || 0) - (b.timeSeconds || 0))
    );
    return map;
  }, [recapScope, cleanWeekEvents, cleanTournamentEvents]);

  // ---------- RENDER ----------
  return (
    <div className="page news-page">
      <header className="header">
        <h1>News &amp; highlights</h1>
        <p className="subtitle">
          Automatic recap built from your full TurfKings match history.
        </p>
        <div className="news-header-actions">
          <button className="secondary-btn" onClick={onBack}>
            Back to stats
          </button>
        </div>
      </header>

      {/* HERO SUMMARY (full tournament) */}
      <section className="card news-hero-card">
        <div className="news-hero-main">
          <h2>Tournament recap</h2>
          <p className="news-hero-text">
            So far we&apos;ve logged{" "}
            <strong>{totalMatches || 0}</strong> matches and{" "}
            <strong>{totalGoals || 0}</strong> goals in the TurfKings 5-a-side
            league.
          </p>
          {tableLeader && (
            <p className="news-hero-text">
              <strong>{tableLeader.name}</strong> currently lead the table with{" "}
              <strong>{tableLeader.points}</strong> points and a goal
              difference of <strong>{tableLeader.goalDiff}</strong> from{" "}
              {tableLeader.played} games.
            </p>
          )}
        </div>

        <div className="news-hero-side">
          <div className="news-stat-chips">
            <div className="news-stat-chip">
              Matches
              <span>{totalMatches || 0}</span>
            </div>
            <div className="news-stat-chip">
              Goals scored
              <span>{totalGoals || 0}</span>
            </div>
            {topScorer && (
              <div className="news-stat-chip">
                Top scorer
                <span>
                  {topScorer.name} ({topScorer.goals})
                </span>
              </div>
            )}
            {topPlaymaker && (
              <div className="news-stat-chip">
                Top playmaker
                <span>
                  {topPlaymaker.name} ({topPlaymaker.assists})
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* HEADLINES + BIGGEST WIN (full tournament) */}
      <section className="card news-grid">
        <div className="news-column">
          <h2>Headlines</h2>
          <ul className="news-list">
            {tableLeader && (
              <li className="news-list-item">
                <span className="news-tag">Standings</span>
                <span>
                  <strong>{tableLeader.name}</strong> sit on top with{" "}
                  {tableLeader.points} points ({tableLeader.won}W{" "}
                  {tableLeader.drawn}D {tableLeader.lost}L).
                </span>
              </li>
            )}

            {topScorer && (
              <li className="news-list-item">
                <span className="news-tag">Goals</span>
                <span>
                  <strong>{topScorer.name}</strong> leads the golden-boot
                  race with {topScorer.goals} goals so far.
                </span>
              </li>
            )}

            {topPlaymaker && (
              <li className="news-list-item">
                <span className="news-tag">Assists</span>
                <span>
                  <strong>{topPlaymaker.name}</strong> has created{" "}
                  {topPlaymaker.assists} goals, topping the playmaker chart.
                </span>
              </li>
            )}

            {!tableLeader && !topScorer && !topPlaymaker && (
              <li className="news-list-item">
                <span className="news-tag">Info</span>
                <span>
                  No stats yet – start a live match to generate your first
                  round of TurfKings news.
                </span>
              </li>
            )}
          </ul>
        </div>

        <div className="news-column">
          <h2>Match of the night</h2>
          {biggestWin ? (
            <div className="news-match-feature">
              <p className="news-match-label">
                Match #{biggestWin.matchNo}
              </p>
              <p className="news-match-scoreline">
                <span>{getTeamName(biggestWin.teamAId)}</span>
                <span className="score">
                  {biggestWin.goalsA} – {biggestWin.goalsB}
                </span>
                <span>{getTeamName(biggestWin.teamBId)}</span>
              </p>
              <p className="news-match-note">
                Margin of <strong>{biggestWin.diff}</strong> goals with{" "}
                <strong>{biggestWin.goals}</strong> total on the board.
              </p>
            </div>
          ) : (
            <p className="muted">
              We&apos;ll highlight the biggest win once a few games have
              been played.
            </p>
          )}
        </div>
      </section>

      {/* TOURNAMENT MVP CARD (full tournament) */}
      {bestOverall && (
        <section className="card news-mvp-card">
          <div className="mvp-hero">
            <div className="mvp-avatar">
              {mvpPhotoUrl ? (
                <img
                  src={mvpPhotoUrl}
                  alt={bestOverall.name}
                  className="mvp-photo"
                />
              ) : (
                <span className="mvp-initials">
                  {getInitials(bestOverall.name)}
                </span>
              )}
            </div>
            <div>
              <p className="mvp-label">Tournament MVP (so far)</p>
              <h2 className="mvp-name">{bestOverall.name}</h2>
              <p className="mvp-team">
                {bestOverall.teamName && bestOverall.teamName !== "—"
                  ? `Team: ${bestOverall.teamName}`
                  : "Flying free agent mode."}
              </p>
            </div>
          </div>
          <div className="mvp-stats">
            <div className="mvp-stat-pill">
              <span>Total G+A+S</span>
              <strong>{bestOverall.total}</strong>
            </div>
            <div className="mvp-stat-pill">
              <span>Goals</span>
              <strong>{bestOverall.goals}</strong>
            </div>
            <div className="mvp-stat-pill">
              <span>Assists</span>
              <strong>{bestOverall.assists}</strong>
            </div>
            <div className="mvp-stat-pill">
              <span>Shibobos</span>
              <strong>{bestOverall.shibobos}</strong>
            </div>
          </div>
        </section>
      )}

      {/* STREAK WATCH (full tournament) */}
      <section className="card news-streak-card">
        <h2>Streak watch</h2>
        {!streakStats.bestGoal && !streakStats.bestAssist ? (
          <p className="muted">
            No streaks yet – once players start scoring and assisting in
            back-to-back games, their names will light up here.
          </p>
        ) : (
          <div className="streak-grid">
            {streakStats.bestGoal && (
              <div className="streak-pill">
                <span className="streak-tag">Goal streak</span>
                <p className="streak-main">
                  <strong>{streakStats.bestGoal.name}</strong>{" "}
                  has scored in{" "}
                  <strong>{streakStats.bestGoal.length}</strong>{" "}
                  match{streakStats.bestGoal.length > 1 ? "es" : ""} in a row.
                </p>
                <p className="streak-sub">
                  {streakStats.bestGoal.teamName &&
                  streakStats.bestGoal.teamName !== "—"
                    ? `Flying for ${streakStats.bestGoal.teamName}.`
                    : "Free roaming finisher energy."}
                </p>
              </div>
            )}

            {streakStats.bestAssist && (
              <div className="streak-pill">
                <span className="streak-tag">Assist streak</span>
                <p className="streak-main">
                  <strong>{streakStats.bestAssist.name}</strong>{" "}
                  has dropped assists in{" "}
                  <strong>{streakStats.bestAssist.length}</strong>{" "}
                  straight game
                  {streakStats.bestAssist.length > 1 ? "s" : ""}.
                </p>
                <p className="streak-sub">
                  {streakStats.bestAssist.teamName &&
                  streakStats.bestAssist.teamName !== "—"
                    ? `Playmaking for ${streakStats.bestAssist.teamName}.`
                    : "Sharing the shine with everyone."}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* YEAR-END FUNCTION CARD */}
      <section className="card year-end-card">
        <h2>Year-end function: 5 December</h2>
        <p className="year-end-lead">
          We&apos;re closing off the TurfKings season in style.
        </p>
        <p>
          <strong>Date:</strong> 5 December &nbsp;|&nbsp;
          <strong>Time:</strong> 18:00 &nbsp;|&nbsp;
          <strong>Venue:</strong> Haveva, Lower Main Road, Observatory.
        </p>
        <p>
          Dress code: smart-casual with a touch of TurfKings flavour – think
          clean sneakers, your best drip, maybe even your team colours.
        </p>
        <p>
          Bring your cooler-box with drinks and alcohol. There&apos;ll be a
          small fee to walk in with them, but it&apos;s more than worth it for
          a relaxed night with the squad, vibes, and plenty of football talk.
        </p>
      </section>

      {/* INJURY TRIBUTE CARD */}
      <section className="card injury-tribute-card">
        <div className="injury-photo-wrapper">
          <img
            src={JaydTribute}
            alt="Injury tribute"
            className="injury-photo"
          />
        </div>
        <div className="injury-text">
          <h2>Looking forward to Jayd's recovery</h2>
          <p>
            In the middle of this shot – standing between{" "}
            <strong>Enock</strong> and the brilliant{" "}
            <strong>Justin</strong> – is{" "}
            <strong>{injuredPlayerName}</strong>, our teammate battling a
            long-term injury.
          </p>
          <p>
            <strong>Ebrahim</strong> is dropping a knee in front, but the whole
            frame is really about the player in the centre: a reminder of the
            energy, link-up and calm presence we can&apos;t wait to have back
            on the pitch.
          </p>
          <p className="injury-cta">
            From the whole TurfKings family: speedy recovery, bro – your spot
            is waiting.
          </p>
        </div>
      </section>

      {/* MATCH-BY-MATCH RECAP (toggle week vs full) */}
      <section className="card">
        <div className="news-recap-header">
          <h2>Match-by-match recap</h2>
          <div className="pill-toggle-group">
            <button
              className={
                "pill-toggle" +
                (recapScope === "week" ? " pill-toggle-active" : "")
              }
              onClick={() => setRecapScope("week")}
            >
              This match-day
            </button>
            <button
              className={
                "pill-toggle" +
                (recapScope === "all" ? " pill-toggle-active" : "")
              }
              onClick={() => setRecapScope("all")}
            >
              Full record
            </button>
          </div>
        </div>

        {recapResults.length === 0 ? (
          <p className="muted">
            {recapScope === "week"
              ? "No matches recorded for this match-day yet."
              : "No matches recorded yet. Start a live match to see a recap here."}
          </p>
        ) : (
          <ul className="news-match-list">
            {recapResults.map((r) => {
              const events = recapEventsByMatch.get(r.matchNo) || [];
              return (
                <li key={r.matchNo} className="news-match-item">
                  <div className="news-match-header">
                    <span className="news-match-number">
                      Match #{r.matchNo}
                    </span>
                    <span className="news-match-scoreline">
                      <span>{getTeamName(r.teamAId)}</span>
                      <span className="score">
                        {r.goalsA} – {r.goalsB}
                      </span>
                      <span>{getTeamName(r.teamBId)}</span>
                    </span>
                  </div>
                  {events.length === 0 ? (
                    <p className="muted small">
                      No event breakdown stored for this match.
                    </p>
                  ) : (
                    <ul className="news-event-list">
                      {events.map((e) => (
                        <li key={e.id} className="news-event-item">
                          <span className="news-event-time">
                            {formatSecondsSafe(e.timeSeconds)}
                          </span>
                          <span className="news-event-text">
                            <strong>
                              {e.type === "shibobo" ? "Shibobo" : "Goal"}
                            </strong>{" "}
                            – {e.scorer}
                            {e.assist ? ` (assist: ${e.assist})` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatSecondsSafe(s) {
  const v =
    typeof s === "number" && !Number.isNaN(s) && s >= 0 ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


