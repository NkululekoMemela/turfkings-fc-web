// src/pages/PlayerCardPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext.jsx";

// ---------------- HELPERS ----------------

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// For legacy photo doc ids (and your FormationsPage uploader)
function slugFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function safeLower(s) {
  return String(s || "").trim().toLowerCase();
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
}

function safeNumber(v) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return null;
}

function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
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

// ---------------- PAGE ----------------

export function PlayerCardPage({
  teams,
  allEvents,
  archivedEvents = [],
  peerRatingsByPlayer,
  playerPhotosByName,
  onBack,
}) {
  const { authUser } = useAuth() || {};
  const user = authUser || null;

  const authIdentityKey = useMemo(() => {
    const dn = safeLower(user?.displayName || "");
    const em = safeLower(user?.email || "");
    return dn || em || "";
  }, [user]);

  // --- FULL SEASON EVENTS (archived + current) ---
  const seasonEvents = useMemo(
    () => [...(archivedEvents || []), ...(allEvents || [])],
    [archivedEvents, allEvents]
  );

  const peerRatingsRaw = peerRatingsByPlayer || {};

  // ----- Load members: build canonical resolver -----
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [nameToCanonical, setNameToCanonical] = useState({});
  const [canonicalToShort, setCanonicalToShort] = useState({});

  useEffect(() => {
    async function loadMembers() {
      try {
        const snap = await getDocs(collection(db, "members"));

        const mapNameToCanon = {};
        const mapCanonToShort = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};

          const fullName = toTitleCase(data.fullName || "");
          const shortName = toTitleCase(data.shortName || "") || fullName;

          if (!fullName) return;

          mapCanonToShort[safeLower(fullName)] = shortName;

          const keys = new Set();

          keys.add(safeLower(fullName));
          keys.add(safeLower(shortName));

          keys.add(slugFromName(fullName));
          keys.add(slugFromName(shortName));

          const fn = safeLower(firstNameOf(fullName));
          if (fn) keys.add(fn);

          const aliases = Array.isArray(data.aliases) ? data.aliases : [];
          aliases.forEach((a) => {
            const aa = toTitleCase(a);
            if (aa) {
              keys.add(safeLower(aa));
              keys.add(slugFromName(aa));
            }
          });

          keys.forEach((k) => {
            if (!k) return;
            if (!mapNameToCanon[k]) mapNameToCanon[k] = fullName;
          });
        });

        setNameToCanonical(mapNameToCanon);
        setCanonicalToShort(mapCanonToShort);
        setMembersLoaded(true);
      } catch (err) {
        console.error("Failed to load members for PlayerCardPage:", err);
        setMembersLoaded(true);
      }
    }

    loadMembers();
  }, []);

  const resolveCanonicalName = (rawName) => {
    if (!rawName || typeof rawName !== "string") return "";
    const tc = toTitleCase(rawName);
    if (!tc) return "";

    const direct = nameToCanonical[safeLower(tc)];
    if (direct) return direct;

    const bySlug = nameToCanonical[slugFromName(tc)];
    if (bySlug) return bySlug;

    const fn = safeLower(firstNameOf(tc));
    if (fn && nameToCanonical[fn]) return nameToCanonical[fn];

    return tc;
  };

  const resolveShortDisplay = (canonicalFullName) => {
    const key = safeLower(canonicalFullName);
    return canonicalToShort[key] || canonicalFullName;
  };

  // ----- Firestore player photos -----
  const [cloudPhotosIndex, setCloudPhotosIndex] = useState({});

  useEffect(() => {
    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        const idx = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const docId = docSnap.id;
          const name = toTitleCase(data.name || "");

          if (!data.photoData) return;

          const keys = new Set();

          if (name) {
            keys.add(safeLower(name));
            keys.add(slugFromName(name));
            const fn = safeLower(firstNameOf(name));
            if (fn) keys.add(fn);
          }

          if (docId) keys.add(safeLower(docId));

          keys.forEach((k) => {
            if (!k) return;
            if (!idx[k]) idx[k] = data.photoData;
          });
        });

        setCloudPhotosIndex(idx);
      } catch (err) {
        console.error("Failed to load player photos for cards:", err);
      }
    }
    loadPhotos();
  }, []);

  const mergedPhotoIndex = useMemo(() => {
    const idx = {};

    const addPhotoKey = (key, url) => {
      const k = safeLower(key);
      if (!k || !url) return;
      if (!idx[k]) idx[k] = url;
    };

    Object.entries(playerPhotosByName || {}).forEach(([k, url]) => {
      addPhotoKey(k, url);
      addPhotoKey(slugFromName(k), url);
      addPhotoKey(firstNameOf(k), url);
    });

    Object.entries(cloudPhotosIndex || {}).forEach(([k, url]) => {
      addPhotoKey(k, url);
    });

    (teams || []).forEach((t) => {
      if (t?.playerPhotos) {
        Object.entries(t.playerPhotos).forEach(([k, url]) => {
          addPhotoKey(k, url);
          addPhotoKey(slugFromName(k), url);
          addPhotoKey(firstNameOf(k), url);
        });
      }

      (t?.players || []).forEach((p) => {
        if (p && typeof p === "object") {
          const nm = p.name || p.displayName || "";
          if (nm && p.photoUrl) {
            addPhotoKey(nm, p.photoUrl);
            addPhotoKey(slugFromName(nm), p.photoUrl);
            addPhotoKey(firstNameOf(nm), p.photoUrl);
          }
        }
      });
    });

    return idx;
  }, [playerPhotosByName, cloudPhotosIndex, teams]);

  const getPlayerPhoto = (canonicalFullName, shortName = "") => {
    const candidates = [];

    const cn = toTitleCase(canonicalFullName || "");
    const sn = toTitleCase(shortName || "");

    if (cn) candidates.push(cn);
    if (sn && sn !== cn) candidates.push(sn);

    const fn1 = firstNameOf(cn);
    const fn2 = firstNameOf(sn);
    if (fn1) candidates.push(fn1);
    if (fn2 && fn2 !== fn1) candidates.push(fn2);

    if (cn) candidates.push(slugFromName(cn));
    if (sn) candidates.push(slugFromName(sn));

    for (const c of candidates) {
      const k = safeLower(c);
      if (k && mergedPhotoIndex[k]) return mergedPhotoIndex[k];
    }

    return null;
  };

  // ---------- DEDUP EVENTS ----------
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
          e.scorer ?? e.playerName ?? "p?",
          e.assist ?? "a?",
          e.role ?? "role?",
        ].join("|");

      if (seen.has(key)) return;
      seen.add(key);
      out.push(e);
    });

    return out;
  }, [seasonEvents]);

  // ----- Canonicalize peer ratings keys -----
  const peerRatingsCanon = useMemo(() => {
    const out = {};
    Object.entries(peerRatingsRaw || {}).forEach(([rawName, val]) => {
      const canon = resolveCanonicalName(rawName);
      if (!canon) return;

      if (!out[canon]) {
        out[canon] = val;
      } else {
        out[canon] = out[canon] || val;
      }
    });
    return out;
  }, [peerRatingsRaw, nameToCanonical, membersLoaded]);

  // ----- Aggregate stats from FULL SEASON events -----
  const statsByPlayer = useMemo(() => {
    const stats = {};

    const ensure = (canonName) => {
      if (!stats[canonName]) {
        stats[canonName] = {
          name: canonName,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          gkCleanSheets: 0,
          defCleanSheets: 0,
          rawStatsScore: 0,
        };
      }
      return stats[canonName];
    };

    uniqueEvents.forEach((e) => {
      if (!e) return;

      if (e.type === "clean_sheet") {
        const holderName = e.playerName || e.scorer || "";
        const canonHolder = resolveCanonicalName(holderName);
        if (!canonHolder) return;

        const s = ensure(canonHolder);
        s.cleanSheets += 1;

        if (e.role === "gk") s.gkCleanSheets += 1;
        if (e.role === "def") s.defCleanSheets += 1;

        return;
      }

      if (e.scorer && e.type === "goal") {
        const canonScorer = resolveCanonicalName(e.scorer);
        if (canonScorer) {
          const s = ensure(canonScorer);
          s.goals += 1;
        }
      }

      if (e.assist) {
        const canonAssist = resolveCanonicalName(e.assist);
        if (canonAssist) {
          const a = ensure(canonAssist);
          a.assists += 1;
        }
      }
    });

    // weights
    // goals = 3
    // assists = 2
    // defender clean sheet = 1
    // goalkeeper clean sheet = 1.5
    Object.values(stats).forEach((p) => {
      p.rawStatsScore =
        p.goals * 3 +
        p.assists * 2 +
        p.defCleanSheets * 1 +
        p.gkCleanSheets * 1.5;
    });

    return stats;
  }, [uniqueEvents, nameToCanonical, membersLoaded]);

  // ----- Map canonical player -> team label -----
  const playerTeamMap = useMemo(() => {
    const map = {};

    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const raw =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        const canon = resolveCanonicalName(raw);
        if (canon && !map[canon]) {
          map[canon] = t.label;
        }
      });
    });

    return map;
  }, [teams, nameToCanonical, membersLoaded]);

  // ----- Normalise stats to /10 and combine with peer ratings -----
  const playersWithRatings = useMemo(() => {
    const allNames = new Set([
      ...Object.keys(statsByPlayer || {}),
      ...Object.keys(peerRatingsCanon || {}),
    ]);

    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const raw =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        const canon = resolveCanonicalName(raw);
        if (canon) allNames.add(canon);
      });
    });

    let maxRaw = 0;
    Object.values(statsByPlayer || {}).forEach((p) => {
      if (p.rawStatsScore > maxRaw) maxRaw = p.rawStatsScore;
    });
    if (maxRaw <= 0) maxRaw = 1;

    const out = [];

    allNames.forEach((canonName) => {
      if (!canonName) return;

      const stats = statsByPlayer[canonName] || {
        name: canonName,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        gkCleanSheets: 0,
        defCleanSheets: 0,
        rawStatsScore: 0,
      };

      const peer = peerRatingsCanon[canonName] || null;

      const statsScore10 = Math.min(10, (stats.rawStatsScore / maxRaw) * 10);

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
          peerScore10 = Math.min(10, Math.max(0, 2 * avgAttr));
        }
      }

      const overall =
        peerScore10 != null
          ? 0.5 * statsScore10 + 0.5 * peerScore10
          : statsScore10;

      const overallRounded = Math.round(overall * 10) / 10;
      const styleLabel = makeStyleLabel(attackAvg, defenceAvg, gkAvg);

      const displayName = canonName;
      const shortName = resolveShortDisplay(canonName);

      const photoUrl = getPlayerPhoto(canonName, shortName);

      const isYou =
        !!authIdentityKey &&
        safeLower(resolveCanonicalName(authIdentityKey)) === safeLower(canonName);

      out.push({
        id: safeLower(canonName),
        name: canonName,
        displayName,
        shortName,
        teamName: playerTeamMap[canonName] || "—",
        photoUrl,
        goals: stats.goals,
        assists: stats.assists,
        cleanSheets: stats.cleanSheets,
        gkCleanSheets: stats.gkCleanSheets,
        defCleanSheets: stats.defCleanSheets,
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

    out.sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      if (b.goals !== a.goals) return b.goals - a.goals;
      return String(a.displayName || "").localeCompare(
        String(b.displayName || "")
      );
    });

    return out;
  }, [
    statsByPlayer,
    peerRatingsCanon,
    playerTeamMap,
    teams,
    authIdentityKey,
    nameToCanonical,
    canonicalToShort,
    mergedPhotoIndex,
    membersLoaded,
  ]);

  // ----- Filters -----
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const filteredPlayers = useMemo(() => {
    return playersWithRatings.filter((p) => {
      if (teamFilter !== "ALL" && p.teamName && p.teamName !== teamFilter) {
        return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      const dn = (p.displayName || "").toLowerCase();
      const tn = (p.teamName || "").toLowerCase();
      return dn.includes(q) || tn.includes(q);
    });
  }, [playersWithRatings, teamFilter, search]);

  const uniqueTeams = useMemo(() => {
    const set = new Set();
    (teams || []).forEach((t) => set.add(t.label));
    return ["ALL", ...Array.from(set)];
  }, [teams]);

  return (
    <div className="page player-cards-page">
      <header className="header">
        <h1>Player cards</h1>
        <p className="subtitle">
          Ratings built from TurfKings goals, assists, clean sheets, and squad peer
          reviews.
        </p>

        {user ? (
          <p className="subtitle">
            Signed in as <strong>{user.displayName || user.email}</strong>. Your
            own card will be tagged as <strong>“You”</strong>.
          </p>
        ) : (
          <p className="subtitle">
            Not signed in – use Google sign-in on the landing page so your photo
            changes can be tied to your identity.
          </p>
        )}

        <div className="news-header-actions">
          <button className="secondary-btn" onClick={onBack}>
            Back to stats
          </button>
        </div>
      </header>

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

      <section className="card player-card-grid-card">
        {filteredPlayers.length === 0 ? (
          <p className="muted">
            No players to show yet – record some games or add peer ratings to
            unlock player cards.
          </p>
        ) : (
          <div className="player-card-grid">
            {filteredPlayers.map((p) => {
              const displayName = p.displayName || p.name || "";
              return (
                <article
                  key={p.id}
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
                      {p.isYou && <span className="you-pill"> • You</span>}
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
                          <span className="fifa-attr-desc">GOALKEEPING</span>
                        </>
                      ) : (
                        <span className="fifa-attr-desc fifa-attr-unrated">
                          No votes yet
                        </span>
                      )}
                    </div>

                    <div className="fifa-attr-cell">
                      <span className="fifa-attr-label">TOTAL</span>
                      <span className="fifa-attr-value">
                        {p.goals + p.assists + p.cleanSheets}
                      </span>
                      <span className="fifa-attr-desc">EVENTS</span>
                    </div>
                  </div>

                  <div className="fifa-bottom-stats">
                    <span>⚽ {p.goals} Goals</span>
                    <span>🎯 {p.assists} Assists</span>
                    <span>🥅 {p.gkCleanSheets} Saves CS</span>
                    <span>🌀 {p.defCleanSheets} Defence CS</span>
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