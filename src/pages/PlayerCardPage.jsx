// src/pages/PlayerCardPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext.jsx";

export function PlayerCardPage({
  teams,
  allEvents,
  archivedEvents = [], // full-season history
  peerRatingsByPlayer,
  playerPhotosByName,
  onBack,
}) {
  // ----- Auth: who is currently signed in? -----
  const { authUser } = useAuth() || {};
  const user = authUser || null;

  const authDisplayName = useMemo(
    () =>
      user?.displayName
        ? user.displayName.trim().toLowerCase()
        : user?.email
        ? user.email.trim().toLowerCase()
        : "",
    [user]
  );

  // --- FULL SEASON EVENTS (archived + current) ---
  const seasonEvents = useMemo(
    () => [...(archivedEvents || []), ...(allEvents || [])],
    [archivedEvents, allEvents]
  );

  const peerRatings = peerRatingsByPlayer || {};

  // ----- Firestore player photos (same source as FormationsPage) -----
  const [cloudPhotos, setCloudPhotos] = useState({});

  useEffect(() => {
    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        const map = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.name && data?.photoData) {
            map[data.name] = data.photoData;
          }
        });
        setCloudPhotos(map);
      } catch (err) {
        console.error("Failed to load player photos for cards:", err);
      }
    }
    loadPhotos();
  }, []);

  // ----- Load members to map raw name -> shortName (display name) -----
  const [memberNameIndex, setMemberNameIndex] = useState({});

  useEffect(() => {
    async function loadMembers() {
      try {
        const snap = await getDocs(collection(db, "members"));
        const index = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const fullName = (data.fullName || "").trim();
          const shortName = (data.shortName || fullName || "").trim();

          if (!shortName && !fullName) return;

          const fullLower = fullName.toLowerCase();
          const shortLower = shortName.toLowerCase();

          // Map both the fullName and the shortName to the official shortName
          if (fullLower) index[fullLower] = shortName;
          if (shortLower) index[shortLower] = shortName;
        });

        setMemberNameIndex(index);
      } catch (err) {
        console.error("Failed to load members for PlayerCardPage:", err);
      }
    }

    loadMembers();
  }, []);

  const resolveDisplayName = (rawName) => {
    if (!rawName || typeof rawName !== "string") return rawName;
    const key = rawName.trim().toLowerCase();
    return memberNameIndex[key] || rawName;
  };

  // ----- Map player -> team label -----
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

  // ----- Player photo resolver (merge prop + Firebase + team metadata) -----
  const mergedPhotoMap = useMemo(() => {
    // start with prop + Firestore avatars
    const map = {
      ...(playerPhotosByName || {}),
      ...(cloudPhotos || {}),
    };

    (teams || []).forEach((t) => {
      // team-level map: t.playerPhotos = { [name]: url }
      if (t.playerPhotos) {
        Object.entries(t.playerPhotos).forEach(([name, url]) => {
          if (name && url && !map[name]) {
            map[name] = url;
          }
        });
      }

      // per-player object: { name, photoUrl }
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
  }, [teams, playerPhotosByName, cloudPhotos]);

  // 🔑 NEW: try both raw name and displayName when resolving photos
  const getPlayerPhoto = (rawName, displayName) => {
    const candidates = [];

    if (rawName) candidates.push(rawName);
    if (displayName && displayName !== rawName) candidates.push(displayName);

    // 1) Exact key matches first
    for (const cand of candidates) {
      if (mergedPhotoMap[cand]) return mergedPhotoMap[cand];
    }

    // 2) Case-insensitive match fallback
    const lowerEntries = Object.entries(mergedPhotoMap).map(([k, url]) => [
      (k || "").trim().toLowerCase(),
      url,
    ]);

    for (const cand of candidates) {
      const target = cand.trim().toLowerCase();
      if (!target) continue;
      const match = lowerEntries.find(([k]) => k === target);
      if (match) return match[1];
    }

    return null;
  };

  // ---------- DEDUP EVENTS (so stats match leaderboard) ----------
  const uniqueEvents = useMemo(() => {
    const seen = new Set();
    const out = [];

    (seasonEvents || []).forEach((e) => {
      if (!e) return;

      const key =
        e.id ??
        [
          e.matchNo ?? "m?",
          e.timeSeconds ?? "t?",
          e.type ?? "type?",
          e.teamId ?? "team?",
          e.scorer ?? "s?",
          e.assist ?? "a?",
        ].join("|");

      if (seen.has(key)) return;
      seen.add(key);
      out.push(e);
    });

    return out;
  }, [seasonEvents]);

  // ----- Aggregate stats from FULL SEASON events -----
  const statsByPlayer = useMemo(() => {
    const stats = {};

    const ensure = (name) => {
      if (!stats[name]) {
        stats[name] = {
          name,
          goals: 0,
          assists: 0,
          shibobos: 0,
          rawStatsScore: 0,
        };
      }
      return stats[name];
    };

    uniqueEvents.forEach((e) => {
      if (!e) return;

      if (e.scorer) {
        const s = ensure(e.scorer);
        if (e.type === "goal") {
          s.goals += 1;
        } else if (e.type === "shibobo") {
          s.shibobos += 1;
        }
      }

      if (e.assist) {
        const a = ensure(e.assist);
        a.assists += 1;
      }
    });

    // apply weights: goals=3, assists=2, shibobo=1
    Object.values(stats).forEach((p) => {
      p.rawStatsScore = p.goals * 3 + p.assists * 2 + p.shibobos * 1;
    });

    return stats;
  }, [uniqueEvents]);

  // ----- Normalise stats to /10 and combine with peer ratings -----
  const playersWithRatings = useMemo(() => {
    const allNames = new Set([
      ...Object.keys(statsByPlayer),
      ...Object.keys(peerRatings),
    ]);

    // include everyone in squads so nobody disappears
    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const name =
          typeof p === "string" ? p : p?.name || p?.displayName;
        if (name) allNames.add(name);
      });
    });

    // max for normalisation
    let maxRaw = 0;
    Object.values(statsByPlayer).forEach((p) => {
      if (p.rawStatsScore > maxRaw) maxRaw = p.rawStatsScore;
    });
    if (maxRaw <= 0) maxRaw = 1;

    const out = [];

    allNames.forEach((name) => {
      if (!name) return;

      const stats = statsByPlayer[name] || {
        name,
        goals: 0,
        assists: 0,
        shibobos: 0,
        rawStatsScore: 0,
      };

      const peer = peerRatings[name] || null;

      const statsScore10 = Math.min(
        10,
        (stats.rawStatsScore / maxRaw) * 10
      );

      let attackAvg = null;
      let defenceAvg = null;
      let gkAvg = null;
      let peerScore10 = null;

      if (peer) {
        attackAvg = safeNumber(peer.attackAvg);
        defenceAvg = safeNumber(peer.defenceAvg);
        gkAvg = safeNumber(peer.gkAvg);

        const validVals = [attackAvg, defenceAvg, gkAvg].filter(
          (v) => v != null
        );

        if (validVals.length > 0) {
          const avgAttr =
            validVals.reduce((a, b) => a + b, 0) / validVals.length;
          // map 1–5 -> 2–10 scale
          peerScore10 = Math.min(10, Math.max(0, 2 * avgAttr));
        }
      }

      let overall;
      if (peerScore10 != null) {
        overall = 0.5 * statsScore10 + 0.5 * peerScore10;
      } else {
        overall = statsScore10;
      }

      const overallRounded = Math.round(overall * 10) / 10;
      const styleLabel = makeStyleLabel(attackAvg, defenceAvg, gkAvg);

      // ----- Identity: is this the signed-in user? (still based on raw name) -----
      const isYou =
        !!authDisplayName &&
        typeof name === "string" &&
        name.trim().toLowerCase() === authDisplayName;

      // 🔤 Official display name from members.shortName (fallback to raw)
      const displayName = resolveDisplayName(name);

      // 🔗 Photo: try raw name, then displayName (shortName)
      const photoUrl = getPlayerPhoto(name, displayName);

      out.push({
        name, // raw name used for stats / keys
        displayName,
        teamName: playerTeamMap[name] || "—",
        photoUrl,
        goals: stats.goals,
        assists: stats.assists,
        shibobos: stats.shibobos,
        statsScore10,
        peerScore10,
        attackAvg,
        defenceAvg,
        gkAvg,
        overall: overallRounded,
        styleLabel,
        isYou,
      });
    });

    // sort: highest overall, then goals, then display name
    out.sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      if (b.goals !== a.goals) return b.goals - a.goals;
      const nameA = (a.displayName || a.name || "").toString();
      const nameB = (b.displayName || b.name || "").toString();
      return nameA.localeCompare(nameB);
    });

    return out;
  }, [
    statsByPlayer,
    peerRatings,
    playerTeamMap,
    mergedPhotoMap,
    teams,
    authDisplayName,
    memberNameIndex,
  ]);

  // ----- Filters -----
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const filteredPlayers = useMemo(() => {
    return playersWithRatings.filter((p) => {
      if (
        teamFilter !== "ALL" &&
        p.teamName &&
        p.teamName !== teamFilter
      ) {
        return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      const display = (p.displayName || p.name || "").toLowerCase();
      return (
        display.includes(q) ||
        (p.teamName && p.teamName.toLowerCase().includes(q))
      );
    });
  }, [playersWithRatings, teamFilter, search]);

  const uniqueTeams = useMemo(() => {
    const set = new Set();
    (teams || []).forEach((t) => set.add(t.label));
    return ["ALL", ...Array.from(set)];
  }, [teams]);

  // ----- Render -----
  return (
    <div className="page player-cards-page">
      <header className="header">
        <h1>Player cards</h1>
        <p className="subtitle">
          Ratings built from TurfKings stats and squad peer reviews.
        </p>

        {/* Small identity hint so players know to sign in before editing photos */}
        {user ? (
          <p className="subtitle">
            Signed in as{" "}
            <strong>{user.displayName || user.email}</strong>. Your own
            card will be tagged as <strong>“You”</strong>.
          </p>
        ) : (
          <p className="subtitle">
            Not signed in – use Google sign-in on the landing page so your
            photo changes can be tied to your identity.
          </p>
        )}

        <div className="news-header-actions">
          <button className="secondary-btn" onClick={onBack}>
            Back to stats
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="card player-card-filters">
        <div className="player-card-filters-row">
          <div className="player-card-filter">
            <label>Team</label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              {uniqueTeams.map((t) => (
                <option key={t} value={t}>
                  {t === "ALL" ? "All teams" : t}
                </option>
              ))}
            </select>
          </div>

          <div className="player-card-filter">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search by player or team"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Cards grid */}
      <section className="card player-card-grid-card">
        {filteredPlayers.length === 0 ? (
          <p className="muted">
            No players to show yet – record some games or add peer ratings
            to unlock player cards.
          </p>
        ) : (
          <div className="player-card-grid">
            {filteredPlayers.map((p) => {
              const displayName = p.displayName || p.name || "";
              return (
                <article
                  key={p.name}
                  className={
                    p.isYou
                      ? "player-card fifa-card player-card-you"
                      : "player-card fifa-card"
                  }
                >
                  <div className="fifa-card-top">
                    <div className="fifa-rating-block">
                      <span className="fifa-rating-score">
                        {p.overall.toFixed(1)}
                      </span>
                      <span className="fifa-rating-pos">ALL</span>
                    </div>

                    <div className="fifa-photo-wrap">
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt={displayName}
                          className="fifa-photo-img"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="fifa-photo-placeholder">
                          {getInitials(displayName)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="fifa-name-bar">
                    <span className="fifa-name">
                      {displayName}
                      {p.isYou && (
                        <span className="you-pill"> • You</span>
                      )}
                    </span>
                    <span className="fifa-team">{p.teamName}</span>
                  </div>

                  <div className="fifa-mid-row">
                    <div className="fifa-chip">
                      <span className="chip-label">Stats</span>
                      <span className="chip-value">
                        {p.statsScore10.toFixed(1)}/10
                      </span>
                    </div>
                    <div className="fifa-chip">
                      <span className="chip-label">Peer</span>
                      <span className="chip-value">
                        {p.peerScore10 != null
                          ? `${p.peerScore10.toFixed(1)}/10`
                          : "Not rated yet"}
                      </span>
                    </div>
                  </div>

                  <div className="fifa-attr-grid">
                    <div className="fifa-attr-cell">
                      <span className="fifa-attr-label">ATT</span>
                      {p.attackAvg != null ? (
                        <>
                          <span className="fifa-attr-value">
                            {p.attackAvg.toFixed(1)}/5
                          </span>
                          <span className="fifa-attr-desc">ATTACK</span>
                        </>
                      ) : (
                        <span className="fifa-attr-desc fifa-attr-unrated">
                          No votes yet
                        </span>
                      )}
                    </div>

                    <div className="fifa-attr-cell">
                      <span className="fifa-attr-label">DEF</span>
                      {p.defenceAvg != null ? (
                        <>
                          <span className="fifa-attr-value">
                            {p.defenceAvg.toFixed(1)}/5
                          </span>
                          <span className="fifa-attr-desc">DEFENCE</span>
                        </>
                      ) : (
                        <span className="fifa-attr-desc fifa-attr-unrated">
                          No votes yet
                        </span>
                      )}
                    </div>

                    <div className="fifa-attr-cell">
                      <span className="fifa-attr-label">GK</span>
                      {p.gkAvg != null ? (
                        <>
                          <span className="fifa-attr-value">
                            {p.gkAvg.toFixed(1)}/5
                          </span>
                          <span className="fifa-attr-desc">
                            GOALKEEPING
                          </span>
                        </>
                      ) : (
                        <span className="fifa-attr-desc fifa-attr-unrated">
                          No votes yet
                        </span>
                      )}
                    </div>

                    <div className="fifa-attr-cell">
                      <span className="fifa-attr-label">G+A+S</span>
                      <span className="fifa-attr-value">
                        {p.goals + p.assists + p.shibobos}
                      </span>
                      <span className="fifa-attr-desc">TOTAL</span>
                    </div>
                  </div>

                  <div className="fifa-bottom-stats">
                    <span>⚽ {p.goals} Goals</span>
                    <span>🎯 {p.assists} Assists</span>
                    <span>🌀 {p.shibobos} Shibobos</span>
                  </div>

                  {p.styleLabel && (
                    <p className="player-card-style">{p.styleLabel}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ----- Helpers -----
function safeNumber(v) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return null;
}

function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function makeStyleLabel(attackAvg, defenceAvg, gkAvg) {
  const vals = [
    { key: "attack", val: attackAvg ?? -1 },
    { key: "defence", val: defenceAvg ?? -1 },
    { key: "gk", val: gkAvg ?? -1 },
  ];

  const best = vals.reduce(
    (acc, cur) => (cur.val > acc.val ? cur : acc),
    { key: null, val: -1 }
  );

  if (best.val < 0) return "";

  if (best.key === "attack") {
    return "Profile: direct attacker, loves getting into scoring positions.";
  }
  if (best.key === "defence") {
    return "Profile: defensive anchor, breaks up play and protects the back.";
  }
  if (best.key === "gk") {
    return "Profile: safe hands in goal, big presence between the posts.";
  }
  return "";
}
