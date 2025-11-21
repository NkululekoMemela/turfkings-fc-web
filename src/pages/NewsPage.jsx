// src/pages/NewsPage.jsx
import React, { useMemo, useState, useEffect } from "react";
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

  const getTeamAbbrev = (teamName) => {
    if (!teamName || typeof teamName !== "string") return "";
    const trimmed = teamName.trim();
    if (!trimmed) return "";
    return trimmed.slice(0, 3).toUpperCase();
  };

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

  const getPlayerTeamAbbrev = (playerName) => {
    const teamName = playerTeamMap[playerName];
    if (!teamName) return "";
    return getTeamAbbrev(teamName);
  };

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

  // For the little date label for "This match-day"
  const todayLabel = useMemo(
    () => formatMatchDayDate(new Date()),
    []
  );

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
      if (
        !best ||
        diff > best.diff ||
        (diff === best.diff && goals > best.goals)
      ) {
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

  // ---------- RESPONSIVE FLAG FOR YEAR-END CARD ----------
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined") {
        setIsNarrow(window.innerWidth < 640);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ---------- STYLE OBJECTS FOR YEAR-END PREMIUM CARD ----------
  const yearEndCardStyle = {
    display: isNarrow ? "flex" : "grid",
    flexDirection: isNarrow ? "column" : undefined,
    gridTemplateColumns: isNarrow
      ? undefined
      : "minmax(0, 3fr) minmax(0, 2fr)",
    gap: isNarrow ? "1rem" : "1.5rem",
    padding: isNarrow ? "1.2rem" : "1.8rem",
    borderRadius: "1.5rem",
    background:
      "radial-gradient(circle at top left, rgba(248,250,252,0.22), transparent 55%)," +
      "radial-gradient(circle at bottom right, rgba(248,250,252,0.18), transparent 60%)," +
      "linear-gradient(135deg, #020617, #111827 45%, #0b1120 100%)",
    boxShadow:
      "0 18px 45px rgba(15,23,42,0.85), 0 0 0 1px rgba(148,163,184,0.18)",
    color: "#e5e7eb",
    alignItems: "stretch",
    marginBottom: "1.75rem",
  };

  const yearEndPillStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.22rem 0.8rem",
    borderRadius: "999px",
    background: "rgba(15,23,42,0.9)",
    border: "1px solid rgba(148,163,184,0.45)",
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#e5e7eb",
  };

  const yearEndHeadingStyle = {
    fontSize: isNarrow ? "1.3rem" : "1.5rem",
    fontWeight: 700,
    margin: "0.6rem 0 0.25rem",
    color: "#f9fafb",
  };

  const yearEndSubStyle = {
    fontSize: "0.92rem",
    color: "#cbd5f5",
    marginBottom: "0.7rem",
  };

  const yearEndMetaRowStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.55rem",
    margin: "0.5rem 0 0.9rem",
    fontSize: "0.85rem",
    color: "#e5e7eb",
  };

  const metaChipStyle = {
    padding: "0.28rem 0.75rem",
    borderRadius: "999px",
    background: "rgba(15,23,42,0.85)",
    border: "1px solid rgba(148,163,184,0.4)",
  };

  const bulletListStyle = {
    listStyle: "none",
    paddingLeft: 0,
    margin: "0.4rem 0 0",
    fontSize: "0.88rem",
    color: "#e5e7eb",
  };

  const artContainerStyle = {
    position: "relative",
    overflow: "hidden",
    borderRadius: "1.25rem",
    background:
      "radial-gradient(circle at 20% 0%, rgba(251,191,36,0.27), transparent 55%)," +
      "radial-gradient(circle at 90% 80%, rgba(251,113,133,0.32), transparent 60%)," +
      "linear-gradient(145deg, #020617, #111827)",
    minHeight: isNarrow ? "170px" : "210px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: isNarrow ? "0.4rem" : 0,
  };

  const artGlassHaloStyle = {
    position: "absolute",
    width: isNarrow ? "170px" : "210px",
    height: isNarrow ? "170px" : "210px",
    borderRadius: "999px",
    border: "1px solid rgba(248,250,252,0.2)",
    boxShadow:
      "0 0 60px rgba(251,191,36,0.22), 0 0 120px rgba(251,113,133,0.18)",
    opacity: 0.9,
  };

  const artInnerOrbStyle = {
    position: "absolute",
    width: isNarrow ? "120px" : "140px",
    height: isNarrow ? "120px" : "140px",
    borderRadius: "999px",
    background:
      "radial-gradient(circle, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.1) 70%, transparent 100%)",
  };

  const suitCardStyle = {
    position: "relative",
    zIndex: 2,
    padding: isNarrow ? "0.7rem 0.9rem" : "0.9rem 1.15rem",
    borderRadius: "1rem",
    background:
      "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.75))",
    border: "1px solid rgba(148,163,184,0.6)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 14px 35px rgba(15,23,42,0.9)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.35rem",
    maxWidth: isNarrow ? "80%" : "100%",
  };

  const suitTitleRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    fontSize: "0.9rem",
    color: "#f9fafb",
  };

  const suitEmojiStyle = { fontSize: "1.4rem" };
  const glassesRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: "1.35rem",
    marginTop: "0.15rem",
  };

  const glassesLabelStyle = {
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#e5e7eb",
    opacity: 0.9,
  };

  const sparkleRowStyle = {
    display: "flex",
    gap: "0.4rem",
    marginTop: "0.1rem",
    fontSize: "0.8rem",
    color: "#e5e7eb",
    opacity: 0.9,
  };

  const artCornerBadgeStyle = {
    position: "absolute",
    right: "0.9rem",
    top: "0.9rem",
    padding: "0.3rem 0.7rem",
    borderRadius: "999px",
    border: "1px solid rgba(248,250,252,0.65)",
    background: "rgba(15,23,42,0.9)",
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#f9fafb",
  };

  const artBottomRibbonStyle = {
    position: "absolute",
    left: "-12%",
    bottom: "14%",
    width: "140%",
    height: "40px",
    background:
      "linear-gradient(90deg, rgba(251,191,36,0.95), rgba(251,113,133,0.95))",
    transform: "rotate(-4deg)",
    opacity: 0.85,
  };

  const artBottomRibbonInnerStyle = {
    position: "absolute",
    inset: "6px 10px",
    borderRadius: "999px",
    border: "1px solid rgba(248,250,252,0.6)",
  };

  const artBottomTextStyle = {
    position: "absolute",
    left: "14%",
    bottom: "21%",
    fontSize: "0.78rem",
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "#020617",
    zIndex: 2,
  };

  // ---------- INJURED PLAYER / TRIBUTE AVATAR ----------
  const injuredAvatarUrl =
    (injuredPlayerName && mergedPhotoMap[injuredPlayerName]) ||
    JaydTribute;

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

      {/* YEAR-END FUNCTION – PREMIUM CARD (FIRST CARD) */}
      <section className="card year-end-premium-card" style={yearEndCardStyle}>
        {/* Left: text content */}
        <div style={{ minWidth: 0 }}>
          <div style={yearEndPillStyle}>
            <span>✨ Special Event</span>
            <span style={{ fontSize: "0.9rem" }}>• Year-End Function</span>
          </div>

          <h2 style={yearEndHeadingStyle}>TurfKings Year-End Function</h2>
          <p style={yearEndSubStyle}>
            We&apos;re closing off the season in proper TurfKings style —
            sharp fits, chilled drinks and a full-squad night out. 🏆
          </p>

          <div style={yearEndMetaRowStyle}>
            <span style={metaChipStyle}>📅 Friday · 5 December</span>
            <span style={metaChipStyle}>⏰ 18:00</span>
            <span style={metaChipStyle}>
              📍 Haveva · Lower Main Road · Observatory
            </span>
          </div>

          <ul style={bulletListStyle}>
            <li>• Dress code: Smart / suit vibes – leave the bibs at home.</li>
            <li>• Season recap: comebacks, wild scorelines & classic banter.</li>
            <li>• Photos, speeches and plenty of off-the-pitch linking.</li>
          </ul>

          <p
            style={{
              marginTop: "0.7rem",
              fontSize: "0.85rem",
              opacity: 0.95,
            }}
          >
            🧊 <strong>Coolerboxes & bottles are encouraged</strong> – bring your
            own drinks. There&apos;s a small fee for walking in with them, but
            it works out cheaper and keeps the vibe relaxed for the whole night. (<strong>R180 </strong>per coolerbox) and (<strong>R80 </strong> per whisky/brandy/gin bottle)
          </p>
        </div>

        {/* Right: visual art (suit + wine glasses) */}
        <div style={artContainerStyle} aria-hidden="true">
          <div style={artGlassHaloStyle} />
          <div style={artInnerOrbStyle} />

          <div style={suitCardStyle}>
            <div style={suitTitleRowStyle}>
              <span style={suitEmojiStyle}>🤵‍♂️</span>
              <div>
                <div style={{ fontSize: "0.78rem", opacity: 0.8 }}>
                  Dress Code
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                  Suits & Smart Fits
                </div>
              </div>
            </div>

            <div style={glassesRowStyle}>
              <span>🥂</span>
              <span>🥂</span>
              <div style={glassesLabelStyle}>TurfKings Toast</div>
            </div>

            <div style={sparkleRowStyle}>
              <span>✦ Awards</span>
              <span>✦ Photos</span>
              <span>✦ Stories</span>
            </div>
          </div>

          <div style={artCornerBadgeStyle}>Year-End 2025</div>

          {/* Ribbon + bottom text only on wider screens to avoid overlap on mobile */}
          {!isNarrow && (
            <>
              <div style={artBottomRibbonStyle}>
                <div style={artBottomRibbonInnerStyle} />
              </div>
              <div style={artBottomTextStyle}>
                5 DECEMBER · 18:00 · HAVEVA
              </div>
            </>
          )}
        </div>
      </section>

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
          <h2>Match of the Tournament</h2>
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
                    : "Free roaming finisher energy."
                  }
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
                    : "Sharing the shine with everyone."
                  }
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* INJURY TRIBUTE CARD */}
      <section className="card injury-tribute-card">
        <div className="injury-photo-wrapper">
          <img
            src={injuredAvatarUrl}
            alt="Injury tribute"
            className="injury-photo"
          />
        </div>
        <div className="injury-text">
          <h2>Looking forward to Jayd&apos;s recovery</h2>
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
                      {recapScope === "week" && (
                        <span> – {todayLabel}</span>
                      )}
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
                      {events.map((e) => {
                        const abbr = getPlayerTeamAbbrev(e.scorer);
                        const assistPart = e.assist
                          ? ` (assist: ${e.assist})`
                          : "";
                        const teamSuffix = abbr ? `, ${abbr}` : "";
                        return (
                          <li key={e.id} className="news-event-item">
                            <span className="news-event-time">
                              {formatSecondsSafe(e.timeSeconds)}
                            </span>
                            <span className="news-event-text">
                              <strong>
                                {e.type === "shibobo" ? "Shibobo" : "Goal"}
                              </strong>{" "}
                              – {e.scorer}
                              {assistPart}
                              {teamSuffix}
                            </span>
                          </li>
                        );
                      })}
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

function formatMatchDayDate(input) {
  let d = null;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === "string") {
    const tmp = new Date(input);
    if (!Number.isNaN(tmp.getTime())) d = tmp;
  }

  if (!d) return "";

  const day = d.getDate().toString().padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}
