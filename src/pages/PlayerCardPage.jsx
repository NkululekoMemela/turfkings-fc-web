// src/pages/PlayerCardPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext.jsx";
import { toPng } from "html-to-image";
import TurfKingsLogo from "../assets/TurfKings_logo_transparent.png";

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

function clamp(min, val, max) {
  return Math.max(min, Math.min(max, val));
}

function round1(v) {
  return Math.round(Number(v || 0) * 10) / 10;
}

function hasPositiveNumber(v) {
  return typeof v === "number" && !Number.isNaN(v) && v > 0;
}

function blendPeerValue(adminVal, squadVal) {
  const admin = safeNumber(adminVal);
  const squad = safeNumber(squadVal);

  const hasAdmin = hasPositiveNumber(admin);
  const hasSquad = squad != null;

  if (hasAdmin && hasSquad) {
    return round1(admin * 0.2 + squad * 0.8);
  }
  if (hasAdmin) return round1(admin);
  if (hasSquad) return round1(squad);

  return null;
}

/**
 * Remap a 0–10 score into a baseline system where:
 * - 1+ games -> score lives in 3–10
 */
function applyOverallBaseline(score10) {
  const raw = clamp(0, Number(score10 || 0), 10);
  return round1(3 + (raw / 10) * 7);
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
  activeSeasonId = null,
  onBack,
}) {
  const { authUser } = useAuth() || {};
  const user = authUser || null;

  const authIdentityKey = useMemo(() => {
    const dn = safeLower(user?.displayName || "");
    const em = safeLower(user?.email || "");
    return dn || em || "";
  }, [user]);

  const seasonEvents = useMemo(
    () => [...(archivedEvents || []), ...(allEvents || [])],
    [archivedEvents, allEvents]
  );

  const peerRatingsRaw = peerRatingsByPlayer || {};

  const [membersLoaded, setMembersLoaded] = useState(false);
  const [nameToCanonical, setNameToCanonical] = useState({});
  const [canonicalToShort, setCanonicalToShort] = useState({});
  const [participationByPlayer, setParticipationByPlayer] = useState({});
  const [participationLoaded, setParticipationLoaded] = useState(false);

  const [baselineByPlayer, setBaselineByPlayer] = useState({});
  const [baselineLoaded, setBaselineLoaded] = useState(false);

  const [savingCardId, setSavingCardId] = useState("");
  const cardRefs = useRef({});
  const longPressTimers = useRef({});
  const didHandlePhoneBackRef = useRef(false);

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
              const af = safeLower(firstNameOf(aa));
              if (af) keys.add(af);
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

  useEffect(() => {
    async function loadParticipation() {
      try {
        const snap = await getDoc(doc(db, "appState_v2", "main"));

        if (!snap.exists()) {
          setParticipationByPlayer({});
          setParticipationLoaded(true);
          return;
        }

        const data = snap.data() || {};
        const state = data.state || {};
        const seasons = Array.isArray(state.seasons) ? state.seasons : [];
        const targetSeason =
          seasons.find((s) => s?.seasonId === activeSeasonId) || seasons[0] || null;

        if (!targetSeason) {
          setParticipationByPlayer({});
          setParticipationLoaded(true);
          return;
        }

        const history = Array.isArray(targetSeason.matchDayHistory)
          ? targetSeason.matchDayHistory
          : [];

        const next = {};

        const ensure = (canonName) => {
          if (!next[canonName]) {
            next[canonName] = {
              gamesPlayed: 0,
              matchDaysPresent: 0,
            };
          }
          return next[canonName];
        };

        history.forEach((day) => {
          const dayId = String(day?.id || "").trim();
          const appearances = Array.isArray(day?.playerAppearances)
            ? day.playerAppearances
            : [];

          const seenThisDay = new Set();

          appearances.forEach((entry) => {
            const raw =
              entry?.playerName ||
              entry?.shortName ||
              entry?.playerId ||
              "";
            const canon = resolveCanonicalName(raw);
            if (!canon) return;

            const p = ensure(canon);
            p.gamesPlayed += Number(entry?.matchesPlayed || 0);

            const key = `${dayId}|${safeLower(canon)}`;
            if (!seenThisDay.has(key)) {
              seenThisDay.add(key);
              p.matchDaysPresent += 1;
            }
          });
        });

        setParticipationByPlayer(next);
        setParticipationLoaded(true);
      } catch (err) {
        console.error("Failed to load participation for PlayerCardPage:", err);
        setParticipationByPlayer({});
        setParticipationLoaded(true);
      }
    }

    if (!membersLoaded) return;
    loadParticipation();
  }, [membersLoaded, activeSeasonId]);

  useEffect(() => {
    async function loadBaselines() {
      try {
        if (!membersLoaded) return;

        const snap = await getDocs(collection(db, "peerRatingBaselines"));
        const next = {};
        const seasonMatches = {};
        const fallbackUnknown = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const seasonId = String(data.seasonId || "").trim();
          const canonical = resolveCanonicalName(data.targetName || "");
          if (!canonical) return;

          const baseline = {
            attack: hasPositiveNumber(Number(data.attack)) ? Number(data.attack) : null,
            defence: hasPositiveNumber(Number(data.defence))
              ? Number(data.defence)
              : null,
            gk: hasPositiveNumber(Number(data.gk)) ? Number(data.gk) : null,
          };

          if (seasonId && activeSeasonId && seasonId === String(activeSeasonId)) {
            seasonMatches[canonical] = baseline;
            return;
          }

          if (seasonId === "UNKNOWN_SEASON") {
            fallbackUnknown[canonical] = baseline;
          }
        });

        const allNames = new Set([
          ...Object.keys(seasonMatches),
          ...Object.keys(fallbackUnknown),
        ]);

        allNames.forEach((name) => {
          next[name] = seasonMatches[name] || fallbackUnknown[name];
        });

        setBaselineByPlayer(next);
        setBaselineLoaded(true);
      } catch (err) {
        console.error("Failed to load peer baselines for PlayerCardPage:", err);
        setBaselineByPlayer({});
        setBaselineLoaded(true);
      }
    }

    setBaselineLoaded(false);
    loadBaselines();
  }, [membersLoaded, activeSeasonId, nameToCanonical]);

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

  const peerRatingsCanon = useMemo(() => {
    const out = {};
    Object.entries(peerRatingsRaw || {}).forEach(([rawName, val]) => {
      const canon = resolveCanonicalName(rawName);
      if (!canon) return;
      if (!out[canon]) out[canon] = val;
    });
    return out;
  }, [peerRatingsRaw, nameToCanonical, membersLoaded]);

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
          points: 0,
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

    Object.values(stats).forEach((p) => {
      p.points = p.goals + p.assists + p.defCleanSheets + p.gkCleanSheets;
      p.rawStatsScore = p.points;
    });

    return stats;
  }, [uniqueEvents, nameToCanonical, membersLoaded]);

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

  const playersWithRatings = useMemo(() => {
    const allNames = new Set([
      ...Object.keys(statsByPlayer || {}),
      ...Object.keys(peerRatingsCanon || {}),
      ...Object.keys(participationByPlayer || {}),
      ...Object.keys(baselineByPlayer || {}),
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
    let maxPpg = 0;

    Object.entries(statsByPlayer || {}).forEach(([canonName, p]) => {
      if (p.rawStatsScore > maxRaw) maxRaw = p.rawStatsScore;

      const gp = Number(participationByPlayer?.[canonName]?.gamesPlayed || 0);
      const ppg = gp > 0 ? p.points / gp : 0;
      if (ppg > maxPpg) maxPpg = ppg;
    });

    if (maxRaw <= 0) maxRaw = 1;
    if (maxPpg <= 0) maxPpg = 1;

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
        points: 0,
        rawStatsScore: 0,
      };

      const peer = peerRatingsCanon[canonName] || null;
      const baseline = baselineByPlayer[canonName] || null;

      const participation = participationByPlayer[canonName] || {
        gamesPlayed: 0,
        matchDaysPresent: 0,
      };

      const gamesPlayed = Number(participation.gamesPlayed || 0);
      const matchDaysPresent = Number(participation.matchDaysPresent || 0);

      const pointsPerGame = gamesPlayed > 0 ? stats.points / gamesPlayed : 0;
      const statsScore10 = clamp(0, (stats.rawStatsScore / maxRaw) * 10, 10);

      const squadAttackAvg = peer ? safeNumber(peer.attackAvg) : null;
      const squadDefenceAvg = peer ? safeNumber(peer.defenceAvg) : null;
      const squadGkAvg = peer ? safeNumber(peer.gkAvg) : null;

      const adminAttack = baseline ? safeNumber(baseline.attack) : null;
      const adminDefence = baseline ? safeNumber(baseline.defence) : null;
      const adminGk = baseline ? safeNumber(baseline.gk) : null;

      const attackAvg = blendPeerValue(adminAttack, squadAttackAvg);
      const defenceAvg = blendPeerValue(adminDefence, squadDefenceAvg);
      const gkAvg = blendPeerValue(adminGk, squadGkAvg);

      let peerScore10 = null;
      const validVals = [attackAvg, defenceAvg, gkAvg].filter((v) => v != null);

      if (validVals.length > 0) {
        const avgAttr = validVals.reduce((a, b) => a + b, 0) / validVals.length;
        peerScore10 = clamp(0, 2 * avgAttr, 10);
      }

      const ppgScore10 = clamp(0, (pointsPerGame / maxPpg) * 10, 10);

      let formScore10 = null;
      let overall = 0;

      if (gamesPlayed > 0) {
        formScore10 =
          peerScore10 != null
            ? round1(ppgScore10 * 0.7 + peerScore10 * 0.3)
            : round1(ppgScore10);

        const rawOverall =
          peerScore10 != null
            ? round1(statsScore10 * 0.4 + peerScore10 * 0.3 + formScore10 * 0.3)
            : round1(statsScore10 * 0.65 + formScore10 * 0.35);

        overall = applyOverallBaseline(rawOverall);
      } else {
        formScore10 = null;
        overall = peerScore10 != null ? round1(peerScore10) : 0;
      }

      const styleLabel = makeStyleLabel(attackAvg, defenceAvg, gkAvg);
      const displayName = canonName;
      const shortName = resolveShortDisplay(canonName);
      const photoUrl = getPlayerPhoto(canonName, shortName);

      const isYou =
        !!authIdentityKey &&
        safeLower(resolveCanonicalName(authIdentityKey)) ===
          safeLower(canonName);

      out.push({
        id: safeLower(canonName),
        name: canonName,
        displayName,
        shortName,
        teamName: playerTeamMap[canonName] || "—",
        photoUrl,

        goals: stats.goals,
        assists: stats.assists,
        gkCleanSheets: stats.gkCleanSheets,
        defCleanSheets: stats.defCleanSheets,
        points: stats.points,

        gamesPlayed,
        matchDaysPresent,

        statsScore10: round1(statsScore10),
        formScore10,
        peerScore10: peerScore10 != null ? round1(peerScore10) : null,
        attackAvg,
        defenceAvg,
        gkAvg,
        overall,
        styleLabel,
        isYou,
      });
    });

    out.sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;

      const aForm = a.formScore10 == null ? -1 : a.formScore10;
      const bForm = b.formScore10 == null ? -1 : b.formScore10;
      if (bForm !== aForm) return bForm - aForm;

      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;

      return String(a.displayName || "").localeCompare(
        String(b.displayName || "")
      );
    });

    return out;
  }, [
    statsByPlayer,
    peerRatingsCanon,
    baselineByPlayer,
    participationByPlayer,
    playerTeamMap,
    teams,
    authIdentityKey,
    nameToCanonical,
    canonicalToShort,
    mergedPhotoIndex,
    membersLoaded,
  ]);

  const [teamFilter, setTeamFilter] = useState("ALL");
  const [playerViewFilter, setPlayerViewFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");

  const filteredPlayers = useMemo(() => {
    return playersWithRatings.filter((p) => {
      if (playerViewFilter === "ACTIVE" && Number(p.gamesPlayed || 0) <= 0) {
        return false;
      }

      if (playerViewFilter === "OFF_SEASON" && Number(p.gamesPlayed || 0) > 0) {
        return false;
      }

      if (teamFilter !== "ALL" && p.teamName && p.teamName !== teamFilter) {
        return false;
      }

      if (!search) return true;

      const q = search.toLowerCase();
      const dn = (p.displayName || "").toLowerCase();
      const tn = (p.teamName || "").toLowerCase();

      return dn.includes(q) || tn.includes(q);
    });
  }, [playersWithRatings, playerViewFilter, teamFilter, search]);

  const uniqueTeams = useMemo(() => {
    const set = new Set();
    (teams || []).forEach((t) => set.add(t.label));
    return ["ALL", ...Array.from(set)];
  }, [teams]);

  // ---------------- PHONE BACK BUTTON SUPPORT ----------------
  useEffect(() => {
    if (typeof window === "undefined" || typeof onBack !== "function") return;

    didHandlePhoneBackRef.current = false;

    const stateMarker = {
      tkPage: "player-cards",
      tkTs: Date.now(),
    };

    window.history.pushState(stateMarker, "", window.location.href);

    const handlePopState = () => {
      if (didHandlePhoneBackRef.current) return;
      didHandlePhoneBackRef.current = true;
      onBack();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onBack]);

  async function saveCardImage(player) {
    try {
      const node = cardRefs.current[player.id];
      if (!node) return;

      setSavingCardId(player.id);

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0b1220",
      });

      const link = document.createElement("a");
      link.download = `${slugFromName(
        player.displayName || player.name
      )}_card.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to save card:", err);
      window.alert("Could not save this card as an image.");
    } finally {
      setSavingCardId("");
    }
  }

  function startLongPress(player) {
    clearLongPress(player.id);
    longPressTimers.current[player.id] = window.setTimeout(() => {
      saveCardImage(player);
    }, 650);
  }

  function clearLongPress(playerId) {
    const t = longPressTimers.current[playerId];
    if (t) {
      window.clearTimeout(t);
      delete longPressTimers.current[playerId];
    }
  }

  function getFormArrow(player) {
    if (player.formScore10 == null) {
      return { symbol: "", color: "transparent" };
    }
    if (player.formScore10 > player.overall) {
      return { symbol: "↑", color: "#22c55e" };
    }
    if (player.formScore10 < player.overall) {
      return { symbol: "↓", color: "#ef4444" };
    }
    return { symbol: "", color: "transparent" };
  }

  return (
    <div className="page player-cards-page">
      <header className="header">
        <h1>Player cards</h1>
        <p className="subtitle">
          Ratings built from TurfKings goals, assists, clean sheets, games
          played, squad peer reviews, and admin baseline ratings.
        </p>

        <p className="subtitle">
          Double-click a card to save it. On touch devices, long-press a card to
          save it.
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
          <div className="player-card-filter player-card-filter-view">
            <label>View</label>

            <div
              className="segmented-toggle"
              role="tablist"
              aria-label="Player card view filter"
            >
              <button
                type="button"
                className={
                  playerViewFilter === "ACTIVE"
                    ? "segmented-option active"
                    : "segmented-option"
                }
                onClick={() => setPlayerViewFilter("ACTIVE")}
                aria-pressed={playerViewFilter === "ACTIVE"}
              >
                Active season
              </button>

              <button
                type="button"
                className={
                  playerViewFilter === "OFF_SEASON"
                    ? "segmented-option active"
                    : "segmented-option"
                }
                onClick={() => setPlayerViewFilter("OFF_SEASON")}
                aria-pressed={playerViewFilter === "OFF_SEASON"}
              >
                Off-season
              </button>
            </div>
          </div>

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
        {!membersLoaded || !participationLoaded || !baselineLoaded ? (
          <p className="muted">Loading player cards…</p>
        ) : filteredPlayers.length === 0 ? (
          <p className="muted">
            {playerViewFilter === "OFF_SEASON"
              ? "No off-season players found for this filter."
              : "No active season players found for this filter."}
          </p>
        ) : (
          <div className="player-card-grid">
            {filteredPlayers.map((p) => {
              const displayName = p.displayName || p.name || "";
              const formArrow = getFormArrow(p);
              const showForm = p.formScore10 != null;

              return (
                <article
                  key={p.id}
                  ref={(el) => {
                    if (el) cardRefs.current[p.id] = el;
                  }}
                  onDoubleClick={() => saveCardImage(p)}
                  onTouchStart={() => startLongPress(p)}
                  onTouchEnd={() => clearLongPress(p.id)}
                  onTouchMove={() => clearLongPress(p.id)}
                  onTouchCancel={() => clearLongPress(p.id)}
                  className={
                    p.isYou
                      ? "player-card fifa-card player-card-you"
                      : "player-card fifa-card"
                  }
                  style={{
                    cursor: "pointer",
                    position: "relative",
                    opacity: savingCardId === p.id ? 0.88 : 1,
                    overflow: "hidden",
                  }}
                  title="Double-click to save card. On mobile, long-press to save."
                >
                  <img
                    src={TurfKingsLogo}
                    alt=""
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      right: "0.8rem",
                      bottom: "1rem",
                      width: "110px",
                      height: "110px",
                      objectFit: "contain",
                      opacity: 0.5,
                      filter: "grayscale(0.1) brightness(1.1)",
                      pointerEvents: "none",
                      userSelect: "none",
                      zIndex: 0,
                    }}
                  />

                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div className="fifa-card-top">
                      <div className="fifa-rating-block">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.28rem",
                          }}
                        >
                          <span className="fifa-rating-score">
                            {p.overall.toFixed(1)}
                          </span>

                          {showForm ? (
                            <sup
                              title={`Form ${p.formScore10.toFixed(1)}/10`}
                              style={{
                                fontSize: "1rem",
                                fontWeight: 900,
                                lineHeight: 1,
                                marginTop: "0.18rem",
                                display: "inline-flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: "0.08rem",
                                minWidth: "2.5rem",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.14rem",
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-block",
                                    minWidth: "0.18rem",
                                  }}
                                />
                                <span>{p.formScore10.toFixed(1)}</span>
                                {formArrow.symbol ? (
                                  <span
                                    style={{
                                      color: formArrow.color,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {formArrow.symbol}
                                  </span>
                                ) : null}
                              </span>

                              <span
                                style={{
                                  fontSize: "0.52rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                  opacity: 0.95,
                                  paddingLeft: "0.18rem",
                                }}
                              >
                                FORM
                              </span>
                            </sup>
                          ) : null}
                        </div>

                        <span className="fifa-rating-pos">OVERALL</span>
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
                        <span className="fifa-attr-value">{p.points}</span>
                        <span className="fifa-attr-desc">
                          points in {p.gamesPlayed} matches
                        </span>
                      </div>
                    </div>

                    <div className="fifa-bottom-stats">
                      <span>⚽ {p.goals} Goals</span>
                      <span>🎯 {p.assists} Assists</span>
                      <span>🥅 {p.gkCleanSheets} Saves CS</span>
                      <span>🌀 {p.defCleanSheets} Defence CS</span>
                    </div>

                    {p.styleLabel && (
                      <p
                        className="player-card-style"
                        style={{
                          maxWidth: "65%",
                          width: "65%",
                          paddingRight: "0.35rem",
                          boxSizing: "border-box",
                          position: "relative",
                          zIndex: 1,
                        }}
                      >
                        {p.styleLabel}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}