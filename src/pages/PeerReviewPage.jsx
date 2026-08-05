// src/pages/PeerReviewPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  getPlayersCollection,
  getMembersCollection,
  getPlayerPhotosCollection,
  getPeerRatingsCollection,
  getPeerRatingBaselinesCollection,
  getClubDoc,
} from "../core/clubFirestorePaths";
import { CLUB_COLLECTIONS } from "../core/clubPaths";


function getCurrentWeekKey() {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const d = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts[0] || "";
}

function normaliseName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueByName(list = []) {
  const seen = new Set();
  const out = [];

  list.forEach((item) => {
    const key = safeLower(item?.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });

  return out;
}

function isUsefulTeamFilterLabel(label) {
  const key = safeLower(label);
  if (!key) return false;
  if (key === "all" || key === "all players") return false;
  return true;
}

function getPeerRatingDocId({ raterName, targetName }) {
  return [
    slugFromName(raterName),
    slugFromName(targetName),
  ].join("__");
}

function getInitials(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0].slice(0, 2) || "").toUpperCase();
  return ((parts[0][0] || "") + (parts[parts.length - 1][0] || "")).toUpperCase();
}

export function PeerReviewPage({
  teams,
  playerPhotosByName = {},
  identity = null,
  activeSeasonId = null,
  onBack,
  activeClubId = "turf-kings",
  activeClub = null,
}) {
  const safeActiveClubId = activeClubId || "turf-kings";
  const activeClubName = String(activeClub?.shortName || activeClub?.name || "this club").trim();
  const isTurfKingsClub = safeActiveClubId === "turf-kings";
  const [weekKey] = useState(() => getCurrentWeekKey());

  const [selectedRater, setSelectedRater] = useState(null);
  const [raterLocked, setRaterLocked] = useState(false);
  const [activeTarget, setActiveTarget] = useState(null);

  const [attack, setAttack] = useState(0);
  const [defence, setDefence] = useState(0);
  const [playmaking, setPlaymaking] = useState(0);
  const [gk, setGk] = useState(0);
  const [comment, setComment] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterTeam, setFilterTeam] = useState("ALL");
  const [ratedTargets, setRatedTargets] = useState([]);

  const [cloudPhotoIndex, setCloudPhotoIndex] = useState({});
  const [memberCanonicalMap, setMemberCanonicalMap] = useState({});
  const [memberPlayers, setMemberPlayers] = useState([]);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const [baselineMap, setBaselineMap] = useState({});
  const [baselineLoaded, setBaselineLoaded] = useState(false);
  const [baselineTarget, setBaselineTarget] = useState(null);
  const [baselineAttack, setBaselineAttack] = useState(0);
  const [baselineDefence, setBaselineDefence] = useState(0);
  const [baselinePlaymaking, setBaselinePlaymaking] = useState(0);
  const [baselineGk, setBaselineGk] = useState(0);
  const [baselineStatusMsg, setBaselineStatusMsg] = useState("");
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [baselineFilterTeam, setBaselineFilterTeam] = useState("ALL");
  const [showRatedBaselinePlayers, setShowRatedBaselinePlayers] = useState(false);
  const [showAdminBaselinePanel, setShowAdminBaselinePanel] = useState(false);
  const [baselineReminderDismissed, setBaselineReminderDismissed] = useState(false);

  useEffect(() => {
    const handleScroll = () => setHeaderScrolled(window.scrollY > 6);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const resolveCanonicalName = (rawName) => {
    const pretty = toTitleCase(rawName || "");
    if (!pretty) return "";

    const direct = memberCanonicalMap[safeLower(pretty)];
    if (direct) return direct;

    const bySlug = memberCanonicalMap[slugFromName(pretty)];
    if (bySlug) return bySlug;

    const first = safeLower(firstNameOf(pretty));
    if (first && memberCanonicalMap[first]) return memberCanonicalMap[first];

    return pretty;
  };

  const getPhotoFor = (name) => {
    if (!name) return null;

    const canonical = resolveCanonicalName(name);
    const pretty = toTitleCase(name);
    const candidates = [
      name,
      pretty,
      canonical,
      firstNameOf(pretty),
      firstNameOf(canonical),
      slugFromName(name),
      slugFromName(pretty),
      slugFromName(canonical),
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    for (const key of candidates) {
      if (playerPhotosByName[key]) return playerPhotosByName[key];
      if (cloudPhotoIndex[safeLower(key)]) return cloudPhotoIndex[safeLower(key)];
    }

    return null;
  };

  useEffect(() => {
    let cancelled = false;

    async function loadMembersAndPhotos() {
      try {
        const alreadyLoaded =
          playerPhotosByName &&
          Object.keys(playerPhotosByName).length > 20;

        const membersSnap = await getDocs(getMembersCollection(db, safeActiveClubId));
        const photosSnap = alreadyLoaded
          ? null
          : await getDocs(getPlayerPhotosCollection(db, safeActiveClubId));

        if (cancelled) return;

        const canonicalMap = {};
        const photoIdx = {};
        const memberList = [];

        const addCanon = (key, value) => {
          const k = safeLower(key);
          if (!k || !value) return;
          if (!canonicalMap[k]) canonicalMap[k] = value;
        };

        const addPhoto = (key, value) => {
          const k = safeLower(key);
          if (!k || !value) return;
          if (!photoIdx[k]) photoIdx[k] = value;
        };

        membersSnap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const fullName = toTitleCase(data.fullName || data.name || "");
          const shortName = toTitleCase(data.shortName || data.displayName || "");
          const aliases = Array.isArray(data.aliases) ? data.aliases : [];
          const rawTeam = String(data.teamLabel || data.team || "").trim();
          const teamLabel = isTurfKingsClub
            ? (isUsefulTeamFilterLabel(rawTeam) ? rawTeam : "Other players")
            : activeClubName;

          if (!fullName) return;

          memberList.push({ name: fullName, teamLabel });

          [fullName, slugFromName(fullName), firstNameOf(fullName)].forEach((key) =>
            addCanon(key, fullName)
          );

          if (shortName) {
            [shortName, slugFromName(shortName), firstNameOf(shortName)].forEach((key) =>
              addCanon(key, fullName)
            );
          }

          aliases.forEach((alias) => {
            const prettyAlias = toTitleCase(alias);
            if (!prettyAlias) return;
            [prettyAlias, slugFromName(prettyAlias), firstNameOf(prettyAlias)].forEach((key) =>
              addCanon(key, fullName)
            );
          });
        });

        if (photosSnap) photosSnap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const photoData = data.photoData || "";
          const rawName = toTitleCase(data.name || docSnap.id || "");
          if (!photoData || !rawName) return;

          const canonical = canonicalMap[safeLower(rawName)] || rawName;
          [
            rawName,
            canonical,
            slugFromName(rawName),
            slugFromName(canonical),
            firstNameOf(rawName),
            firstNameOf(canonical),
            docSnap.id,
          ]
            .filter(Boolean)
            .forEach((key) => addPhoto(key, photoData));
        });

        setMemberCanonicalMap(canonicalMap);
        setCloudPhotoIndex(photoIdx);

        setMemberPlayers(
          uniqueByName(
            memberList.sort((a, b) => {
              if ((a.teamLabel || "") !== (b.teamLabel || "")) {
                return (a.teamLabel || "").localeCompare(b.teamLabel || "");
              }
              return (a.name || "").localeCompare(b.name || "");
            })
          )
        );
      } catch (err) {
        console.error("Failed to load PeerReviewPage members/photos:", err);
      }
    }

    loadMembersAndPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeClubMemberNames = useMemo(() => {
    return new Set(
      Object.values(memberCanonicalMap || {})
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    );
  }, [memberCanonicalMap]);

  const allPlayers = useMemo(() => {
    const list = [];

    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const rawName = typeof p === "string" ? p : p?.name || p?.displayName || "";
        const canonical = resolveCanonicalName(rawName || "");
        if (!canonical) return;

        list.push({ name: canonical, teamLabel: t.label || "" });
      });
    });

    const sorted = uniqueByName(
      list.sort((a, b) => {
        if ((a.teamLabel || "") !== (b.teamLabel || "")) {
          return (a.teamLabel || "").localeCompare(b.teamLabel || "");
        }
        return (a.name || "").localeCompare(b.name || "");
      })
    );

    if (isTurfKingsClub) return sorted;

    if (activeClubMemberNames.size === 0) return [];

    return sorted.filter((p) => activeClubMemberNames.has(resolveCanonicalName(p.name)));
  }, [teams, memberCanonicalMap, activeClubMemberNames, isTurfKingsClub]);

  const baselinePlayerPool = useMemo(() => {
    const combined = [...(memberPlayers || []), ...(allPlayers || [])];
    return uniqueByName(
      combined.sort((a, b) => {
        if ((a.teamLabel || "") !== (b.teamLabel || "")) {
          return (a.teamLabel || "").localeCompare(b.teamLabel || "");
        }
        return (a.name || "").localeCompare(b.name || "");
      })
    );
  }, [memberPlayers, allPlayers]);

  const allPlayerNames = useMemo(() => allPlayers.map((p) => p.name), [allPlayers]);

  const entryRole = identity?.role || null;
  const isAdmin = entryRole === "admin";
  const isEntryPlayer = entryRole === "player" || entryRole === "captain" || entryRole === "admin";
  const isSpectator = entryRole === "spectator";
  const isSignedInPlayer = !!identity && isEntryPlayer;

  useEffect(() => {
    if (!isSignedInPlayer) return;
    if (selectedRater) return;

    let candidateName =
      identity?.fullName ||
      identity?.shortName ||
      null;

    if (!candidateName) return;

    const canonicalCandidate = resolveCanonicalName(candidateName);
    const normCandidate = normaliseName(canonicalCandidate);
    const matched = allPlayerNames.find((n) => normaliseName(n) === normCandidate) || null;
    const finalName = matched || canonicalCandidate;

    setSelectedRater(finalName);
    setRaterLocked(true);
    setStatusMsg("");
  }, [identity, allPlayerNames, isSignedInPlayer, selectedRater, memberCanonicalMap]);

  useEffect(() => {
    if (!selectedRater) return;

    let cancelled = false;

    async function loadWeeklyRatingsAlreadySubmitted() {
      const seasonId = String(activeSeasonId || "UNKNOWN_SEASON");
      const raterCanonical = resolveCanonicalName(selectedRater);
      const raterNorm = normaliseName(raterCanonical);
      const ratedSet = new Set();

      try {
        const snap = await getDocs(getPeerRatingsCollection(db, safeActiveClubId));

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const sameSeason = String(data.seasonId || "UNKNOWN_SEASON") === seasonId;
          const sameWeek = String(data.weekKey || "") === String(weekKey);
          const sameRater = normaliseName(data.raterNameNormalized || data.raterName || "") === raterNorm;

          if (!sameSeason || !sameWeek || !sameRater) return;

          const targetCanonical = resolveCanonicalName(data.targetName || "");
          const targetNorm = normaliseName(data.targetNameNormalized || targetCanonical || data.targetName || "");
          if (targetNorm) ratedSet.add(targetNorm);
        });
      } catch (err) {
        console.error("Failed to load weekly peer ratings:", err);
      }

      if (!cancelled) setRatedTargets(Array.from(ratedSet));
    }

    loadWeeklyRatingsAlreadySubmitted();
    return () => {
      cancelled = true;
    };
  }, [selectedRater, weekKey, activeSeasonId, memberCanonicalMap, safeActiveClubId]);

  useEffect(() => {
    let cancelled = false;

    async function loadBaselines() {
      try {
        const snap = await getDocs(getPeerRatingBaselinesCollection(db, safeActiveClubId));
        if (cancelled) return;

        const next = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const targetName = resolveCanonicalName(data.targetName || "");
          if (!targetName) return;

          next[safeLower(targetName)] = {
            attack: Number(data.attack ?? 0) || 0,
            defence: Number(data.defence ?? 0) || 0,
            playmaking: Number(data.playmaking ?? 0) || 0,
            gk: Number(data.gk ?? 0) || 0,
            targetName,
            updatedAtMs: Number(data.updatedAtMs || 0) || 0,
            updatedByName: data.updatedByName || "",
            updatedByEmail: data.updatedByEmail || "",
          };
        });

        setBaselineMap(next);
        setBaselineLoaded(true);
      } catch (err) {
        console.error("Failed to load peer rating baselines:", err);
        setBaselineLoaded(true);
      }
    }

    loadBaselines();
    return () => {
      cancelled = true;
    };
  }, [memberCanonicalMap, safeActiveClubId]);

  const teamsForFilter = useMemo(() => {
    const labels = new Set();
    (teams || []).forEach((t) => {
      if (isUsefulTeamFilterLabel(t?.label)) labels.add(t.label);
    });
    return ["ALL", ...Array.from(labels).sort()];
  }, [teams]);

  useEffect(() => {
    if (teamsForFilter.includes(filterTeam)) return;

    setFilterTeam("ALL");
    setActiveTarget(null);
  }, [teamsForFilter, filterTeam]);

  const candidateTargets = useMemo(() => {
    if (!baselineLoaded) return [];

    return allPlayers.filter((p) => {
      if (
        selectedRater &&
        normaliseName(p.name) ===
          normaliseName(selectedRater)
      ) {
        return false;
      }

      if (
        filterTeam !== "ALL" &&
        p.teamLabel !== filterTeam
      ) {
        return false;
      }

      const canonicalName =
        resolveCanonicalName(p.name);

      const existingBaseline =
        baselineMap[safeLower(canonicalName)] ||
        baselineMap[safeLower(p.name)] ||
        null;

      const hasBaseline =
        Number(existingBaseline?.attack || 0) > 0 ||
        Number(existingBaseline?.defence || 0) > 0 ||
        Number(existingBaseline?.playmaking || 0) > 0 ||
        Number(existingBaseline?.gk || 0) > 0;

      return hasBaseline;
    });
  }, [
    allPlayers,
    selectedRater,
    filterTeam,
    baselineLoaded,
    baselineMap,
    memberCanonicalMap,
  ]);

  const baselineTargets = useMemo(() => {
    return baselinePlayerPool.filter((p) => {
      if (baselineFilterTeam !== "ALL" && p.teamLabel !== baselineFilterTeam) return false;
      return true;
    });
  }, [baselinePlayerPool, baselineFilterTeam]);

  const currentWeekNameSet = useMemo(() => {
    return new Set((allPlayers || []).map((p) => safeLower(p.name)));
  }, [allPlayers]);

  const visibleBaselineTargets = useMemo(() => {
    if (showRatedBaselinePlayers) return baselineTargets;

    return baselineTargets.filter((p) => {
      const existing = baselineMap[safeLower(p.name)] || null;
      const hasBaseline =
        Number(existing?.attack || 0) > 0 ||
        Number(existing?.defence || 0) > 0 ||
        Number(existing?.playmaking || 0) > 0 ||
        Number(existing?.gk || 0) > 0;
      return !hasBaseline;
    });
  }, [baselineTargets, baselineMap, showRatedBaselinePlayers]);

  const baselineCurrentWeekTargets = useMemo(() => {
    return visibleBaselineTargets.filter((p) => currentWeekNameSet.has(safeLower(p.name)));
  }, [visibleBaselineTargets, currentWeekNameSet]);

  const baselineOtherTargets = useMemo(() => {
    return visibleBaselineTargets.filter((p) => !currentWeekNameSet.has(safeLower(p.name)));
  }, [visibleBaselineTargets, currentWeekNameSet]);

  const baselineFilterOptions = useMemo(() => {
    const labels = new Set();
    (baselinePlayerPool || []).forEach((p) => {
      if (isUsefulTeamFilterLabel(p?.teamLabel)) labels.add(p.teamLabel);
    });
    return ["ALL", ...Array.from(labels).sort()];
  }, [baselinePlayerPool]);

  const resetPeerForm = () => {
    setAttack(0);
    setDefence(0);
    setPlaymaking(0);
    setGk(0);
    setComment("");
  };

  const resetBaselineForm = () => {
    setBaselineAttack(0);
    setBaselineDefence(0);
    setBaselinePlaymaking(0);
    setBaselineGk(0);
  };

  const handleStarClick = (setter, value) => {
    setter(value);
    setStatusMsg("");
  };

  const renderStarsRow = (label, value, setter) => (
    <div className="star-rating-row">
      <span className="star-rating-label">{label}</span>
      <div className="star-rating-stars">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            className={v <= value ? "star-btn star-filled" : "star-btn star-empty"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleStarClick(setter, v);
            }}
          >
            ★
          </button>
        ))}
      </div>
      <span className="star-rating-value">{value > 0 ? `${value}/5` : "Skip"}</span>
    </div>
  );

  const renderBaselineStarsRow = (label, value, setter) => (
    <div className="star-rating-row">
      <span className="star-rating-label">{label}</span>
      <div className="star-rating-stars">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={`${label}-${v}`}
            type="button"
            className={v <= value ? "star-btn star-filled" : "star-btn star-empty"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setter(v);
              setBaselineStatusMsg("");
            }}
          >
            ★
          </button>
        ))}
      </div>
      <span className="star-rating-value">{value > 0 ? `${value}/5` : "Unset"}</span>
    </div>
  );

  const handleSelectTarget = (name) => {
    setStatusMsg("");
    if (activeTarget === name) {
      setActiveTarget(null);
      return;
    }
    setActiveTarget(name);
    resetPeerForm();
  };

  const handleSubmitForTarget = async (targetName) => {
    setStatusMsg("");

    if (!isSignedInPlayer) {
      setStatusMsg(`Peer voting is reserved for ${activeClubName} players.`);
      return;
    }
    if (!selectedRater) {
      setStatusMsg("Step 1: confirm who you are first.");
      return;
    }
    if (!targetName) {
      setStatusMsg("Tap a teammate first, then submit their rating.");
      return;
    }

    const hasAnyScore = attack || defence || playmaking || gk;
    if (!hasAnyScore) {
      setStatusMsg("Give at least one rating (Attack, Defence, Playmaking, or Goalkeeping), or cancel.");
      return;
    }

    const seasonId = String(activeSeasonId || "UNKNOWN_SEASON");
    const raterCanonical = resolveCanonicalName(selectedRater);
    const targetCanonical = resolveCanonicalName(targetName);
    const raterNorm = normaliseName(raterCanonical);
    const targetNorm = normaliseName(targetCanonical);
    const peerRatingDocId = getPeerRatingDocId({ raterName: raterCanonical, targetName: targetCanonical });

    setSubmitting(true);

    try {
      const now = new Date();
      const docData = {
        raterName: raterCanonical,
        raterNameNormalized: raterNorm,
        targetName: targetCanonical,
        targetNameNormalized: targetNorm,
        attack: attack || null,
        defence: defence || null,
        playmaking: playmaking || null,
        gk: gk || null,
        comment: null,
        createdAtMs: now.getTime(),
        weekKey,
        seasonId,
        source: "peer-review-page",
      };

      await setDoc(getClubDoc(db, CLUB_COLLECTIONS.peerRatings, peerRatingDocId, safeActiveClubId), docData, { merge: true });

      setRatedTargets((prev) => (prev.includes(targetNorm) ? prev : [...prev, targetNorm]));
      setActiveTarget(null);
      resetPeerForm();
      setStatusMsg(`✅ Latest weekly rating saved for ${targetCanonical}.`);
    } catch (err) {
      console.error("Peer rating submit error", err);
      setStatusMsg("⚠️ Something went wrong saving this rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRater = () => {
    if (raterLocked) return;
    setSelectedRater(null);
    setActiveTarget(null);
    resetPeerForm();
    setStatusMsg("");
    setRatedTargets([]);
  };

  const handleSelectBaselineTarget = (name) => {
    setBaselineStatusMsg("");
    if (baselineTarget === name) {
      setBaselineTarget(null);
      resetBaselineForm();
      return;
    }

    const canonical = resolveCanonicalName(name);
    const existing = baselineMap[safeLower(canonical)] || null;

    setBaselineTarget(canonical);
    setBaselineAttack(Number(existing?.attack || 0));
    setBaselineDefence(Number(existing?.defence || 0));
    setBaselinePlaymaking(Number(existing?.playmaking || 0));
    setBaselineGk(Number(existing?.gk || 0));
  };

  const handleSaveBaselineForTarget = async (targetName) => {
    setBaselineStatusMsg("");

    if (!isAdmin) {
      setBaselineStatusMsg("Only admin can save baseline ratings.");
      return;
    }
    if (!targetName) {
      setBaselineStatusMsg("Select a player first.");
      return;
    }

    const hasAnyBaseline = baselineAttack || baselineDefence || baselinePlaymaking || baselineGk;
    if (!hasAnyBaseline) {
      setBaselineStatusMsg("Give at least one baseline rating before saving.");
      return;
    }

    const seasonId = String(activeSeasonId || "UNKNOWN_SEASON");
    const targetCanonical = resolveCanonicalName(targetName);
    const targetNorm = normaliseName(targetCanonical);
    const docId = slugFromName(targetCanonical);
    const now = new Date();

    const payload = {
      seasonIdLastUpdated: seasonId,
      targetName: targetCanonical,
      targetNameNormalized: targetNorm,
      attack: baselineAttack || 0,
      defence: baselineDefence || 0,
      playmaking: baselinePlaymaking || 0,
      gk: baselineGk || 0,
      updatedAtMs: now.getTime(),
      updatedByName: identity?.fullName || identity?.shortName || "Admin",
      updatedByEmail: identity?.email || "",
      source: "peer-review-admin-baseline-global",
    };

    setSavingBaseline(true);

    try {
      await setDoc(getClubDoc(db, CLUB_COLLECTIONS.peerRatingBaselines, docId, safeActiveClubId), payload, { merge: true });

      setBaselineMap((prev) => ({
        ...prev,
        [safeLower(targetCanonical)]: {
          attack: payload.attack,
          defence: payload.defence,
          playmaking: payload.playmaking,
          gk: payload.gk,
          targetName: targetCanonical,
          updatedAtMs: payload.updatedAtMs,
          updatedByName: payload.updatedByName,
          updatedByEmail: payload.updatedByEmail,
        },
      }));

      setBaselineStatusMsg(`✅ Baseline saved for ${targetCanonical}.`);
      setBaselineTarget(null);
      resetBaselineForm();
    } catch (err) {
      console.error("Baseline save error", err);
      setBaselineStatusMsg("⚠️ Something went wrong saving this baseline. Please try again.");
    } finally {
      setSavingBaseline(false);
    }
  };

  const missingBaselineCurrentWeekTargets = useMemo(() => {
    if (!isAdmin || !baselineLoaded || !allPlayers.length) return [];

    return allPlayers.filter((p) => {
      const canonicalName = resolveCanonicalName(p.name);
      const existing =
        baselineMap[safeLower(canonicalName)] ||
        baselineMap[safeLower(p.name)] ||
        null;

      const hasBaseline =
        Number(existing?.attack || 0) > 0 ||
        Number(existing?.defence || 0) > 0 ||
        Number(existing?.playmaking || 0) > 0 ||
        Number(existing?.gk || 0) > 0;

      return !hasBaseline;
    });
  }, [isAdmin, baselineLoaded, allPlayers, baselineMap, memberCanonicalMap]);

  const adminReminderCount = missingBaselineCurrentWeekTargets.length;

  const signedInName = selectedRater || identity?.fullName || identity?.shortName || identity?.email || null;

  const renderBaselineCard = (p) => {
    const isActive = baselineTarget === p.name;
    const photoUrl = getPhotoFor(p.name);
    const initials = getInitials(p.name);
    const existing = baselineMap[safeLower(p.name)] || null;
    const hasBaseline =
      Number(existing?.attack || 0) > 0 ||
      Number(existing?.defence || 0) > 0 ||
      Number(existing?.playmaking || 0) > 0 ||
      Number(existing?.gk || 0) > 0;

    return (
      <div key={`${p.name}-baseline`} className={`peer-player-card ${isActive ? "active" : ""}`}>
        <button type="button" className="peer-player-main" onClick={() => handleSelectBaselineTarget(p.name)}>
          <div className="peer-player-avatar">
            {photoUrl ? (
              <img src={photoUrl} alt={p.name} className="peer-avatar-photo" loading="lazy" decoding="async" />
            ) : (
              <div className="peer-avatar-fallback">{initials}</div>
            )}
          </div>

          <div className="peer-player-meta">
            <div className="peer-player-name">{p.name}</div>
            <div className="peer-player-team">{p.teamLabel || "—"}</div>
            {hasBaseline ? (
              <div className="peer-player-rated-tag">
                Baseline set: A {existing.attack || 0} · D {existing.defence || 0} · P {existing.playmaking || 0} · GK {existing.gk || 0}
              </div>
            ) : (
              <div className="peer-player-rated-tag">No baseline yet</div>
            )}
          </div>
        </button>

        {isActive && (
          <div className="peer-player-rating-inline" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            {renderBaselineStarsRow("Attack baseline", baselineAttack, setBaselineAttack)}
            {renderBaselineStarsRow("Defence baseline", baselineDefence, setBaselineDefence)}
            {renderBaselineStarsRow("Playmaking baseline", baselinePlaymaking, setBaselinePlaymaking)}
            {renderBaselineStarsRow("Goalkeeping baseline", baselineGk, setBaselineGk)}

            <div className="actions-row">
              <button
                type="button"
                className="primary-btn"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveBaselineForTarget(p.name);
                }}
              >
                {savingBaseline ? "Saving..." : `Save baseline for ${p.name}`}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page peer-review-page">
      <style>{`
        .peer-review-page .peer-card {
          background: #101827 !important;
          border: 1px solid #64748b !important;
          box-shadow: none !important;
        }

        .peer-review-page .peer-purpose-card {
          background: #111827 !important;
          border: 1px solid #94a3b8 !important;
          box-shadow: none !important;
        }

        .peer-review-page .peer-purpose-card.weekly {
          border-left: 5px solid #facc15 !important;
        }

        .peer-review-page .peer-purpose-card.baseline {
          border-left: 5px solid #38bdf8 !important;
        }

        .peer-review-page .peer-purpose-title {
          color: #ffffff !important;
          font-weight: 900 !important;
        }

        .peer-review-page .peer-purpose-card p,
        .peer-review-page .peer-purpose-card .muted {
          color: #dbeafe !important;
          opacity: 1 !important;
        }

        .peer-review-page .peer-admin-explainer {
          background: #0f172a !important;
          border: 1px solid #94a3b8 !important;
          box-shadow: none !important;
        }

        .peer-review-page .peer-admin-explainer p {
          color: #e2e8f0 !important;
          opacity: 1 !important;
        }

        .peer-review-page .peer-safe-primary {
          background: #15803d !important;
          color: #ffffff !important;
          border: 2px solid #bbf7d0 !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }

        .peer-review-page .peer-safe-secondary {
          background: #111827 !important;
          color: #ffffff !important;
          border: 1px solid #94a3b8 !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }

        .peer-review-page .team-pill-btn.active {
          background: #facc15 !important;
          color: #111827 !important;
          border-color: #fef08a !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }

        .peer-review-page .team-pill-btn:not(.active),
        .peer-review-page .peer-player-card,
        .peer-review-page .peer-player-main,
        .peer-review-page .primary-btn,
        .peer-review-page .secondary-btn {
          box-shadow: none !important;
          text-shadow: none !important;
        }

        .peer-reminder-popup {
          position: fixed;
          top: 88px;
          right: 18px;
          width: min(380px, calc(100vw - 32px));
          background:
            linear-gradient(
              180deg,
              rgba(15,23,42,.98),
              rgba(2,6,23,.98)
            );
          border: 1px solid rgba(239,68,68,.45);
          border-radius: 22px;
          padding: 1rem;
          z-index: 99999;
          box-shadow:
            0 24px 80px rgba(0,0,0,.48),
            0 0 0 1px rgba(255,255,255,.04) inset;
          backdrop-filter: blur(18px);
        }

        .peer-reminder-popup-title {
          color: #ffffff;
          font-size: 1rem;
          font-weight: 900;
          margin-bottom: .55rem;
        }

        .peer-reminder-popup-text {
          color: #cbd5e1;
          font-size: .86rem;
          line-height: 1.45;
        }

        .peer-reminder-player-list {
          margin-top: .8rem;
          display: flex;
          flex-wrap: wrap;
          gap: .45rem;
        }

        .peer-reminder-player-pill {
          padding: .42rem .7rem;
          border-radius: 999px;
          background: rgba(239,68,68,.12);
          border: 1px solid rgba(239,68,68,.32);
          color: #fecaca;
          font-size: .78rem;
          font-weight: 700;
        }

        .peer-reminder-actions {
          display: flex;
          gap: .6rem;
          margin-top: 1rem;
        }
      `}</style>
      <div className={`landing-header-sticky ${headerScrolled ? "is-scrolled" : ""}`}>
        <header className="header">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", width: "100%" }}>
            <div className="header-title" style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>Peer Ratings (Weekly)</h1>
            </div>
            <button
              className="secondary-btn"
              onClick={onBack}
              aria-label="Home"
              title="Home"
              style={{ minWidth: "46px", width: "46px", height: "46px", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem", flexShrink: 0 }}
            >
              🏠
            </button>
          </div>
        </header>
      </div>

      <section className="card peer-card">
        {isAdmin && (
          <div className="peer-step" style={{ marginBottom: "1.25rem" }}>
            <div
              className="peer-step-header"
              style={{
                alignItems: "flex-start",
                gap: "0.85rem",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 style={{ marginBottom: "0.25rem" }}>Admin baselines</h2>
                <div className="peer-current-rater">
                  Long-term ratings setup.
                </div>
              </div>

              <button
                type="button"
                className={showAdminBaselinePanel ? "secondary-btn peer-safe-secondary" : "primary-btn peer-safe-primary"}
                onClick={() => setShowAdminBaselinePanel((current) => !current)}
                style={{ flexShrink: 0 }}
              >
                {showAdminBaselinePanel ? "Hide tool" : "Open tool"}
              </button>
            </div>

            <div
              className="peer-admin-explainer"
              style={{
                marginTop: "0.75rem",
                padding: "0.8rem 0.9rem",
                borderRadius: "0.9rem",
              }}
            >
              <p className="muted small" style={{ margin: 0, lineHeight: 1.45 }}>
                Global per-player baselines. Edit only when needed.
              </p>
            </div>

            {showAdminBaselinePanel && (
              <>
                <div className="peer-filter-row" style={{ marginTop: "0.95rem" }}>
                  <span className="muted small">Filter by team:</span>
                  <div className="team-pill-row">
                    {baselineFilterOptions.map((label) => (
                      <button
                        key={`baseline-${label}`}
                        type="button"
                        className={`team-pill-btn ${baselineFilterTeam === label ? "active" : ""}`}
                        onClick={() => {
                          setBaselineFilterTeam(label);
                          setBaselineTarget(null);
                          resetBaselineForm();
                          setBaselineStatusMsg("");
                        }}
                      >
                        {label === "ALL" ? "All teams" : label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="actions-row" style={{ marginTop: "0.8rem" }}>
                  <button type="button" className="secondary-btn" onClick={() => setShowRatedBaselinePlayers((current) => !current)}>
                    {showRatedBaselinePlayers ? "Hide rated" : "Show rated"}
                  </button>
                </div>

                {!baselineLoaded ? (
                  <p className="muted small">Loading baselines…</p>
                ) : (
                  <>
                    <div style={{ marginTop: "0.9rem" }}>
                      <h3 style={{ marginBottom: "0.55rem" }}>Played this week</h3>
                      {baselineCurrentWeekTargets.length === 0 ? (
                        <p className="muted small">No players here.</p>
                      ) : (
                        <div className="peer-player-grid">{baselineCurrentWeekTargets.map(renderBaselineCard)}</div>
                      )}
                    </div>

                    <div style={{ marginTop: "1.1rem" }}>
                      <h3 style={{ marginBottom: "0.55rem" }}>Other players / not in current week</h3>
                      {baselineOtherTargets.length === 0 ? (
                        <p className="muted small">No players here.</p>
                      ) : (
                        <div className="peer-player-grid">{baselineOtherTargets.map(renderBaselineCard)}</div>
                      )}
                    </div>
                  </>
                )}

                {baselineStatusMsg && <p className="status-text" style={{ marginTop: "0.75rem" }}>{baselineStatusMsg}</p>}
              </>
            )}
          </div>
        )}

        <div className="peer-step">
          <div className="peer-step-header">
            <div>
              <h2 style={{ marginBottom: "0.25rem" }}>Rate your teammates</h2>
            </div>
          </div>

          {!isSignedInPlayer && <p className="muted">We need to know who you are in Step 1 before you can rate teammates.</p>}

          {isSignedInPlayer && selectedRater && (
            <>
              <div className="peer-filter-row">
                <span className="muted small">Filter by team:</span>
                <div className="team-pill-row">
                  {teamsForFilter.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={`team-pill-btn ${filterTeam === label ? "active" : ""}`}
                      onClick={() => {
                        setFilterTeam(label);
                        setActiveTarget(null);
                      }}
                    >
                      {label === "ALL" ? "All" : label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="peer-player-grid">
                {candidateTargets.length === 0 && <p className="muted small">No teammates available in this filter.</p>}

                {candidateTargets.map((p) => {
                  const isActive = activeTarget === p.name;
                  const targetNorm = normaliseName(p.name);
                  const isRated = ratedTargets.includes(targetNorm);
                  const photoUrl = getPhotoFor(p.name);
                  const initials = getInitials(p.name);

                  return (
                    <div key={`${p.name}-target`} className={`peer-player-card ${isActive ? "active" : ""} ${isRated ? "rated" : ""}`}>
                      <button type="button" className="peer-player-main" onClick={() => handleSelectTarget(p.name)}>
                        <div className="peer-player-avatar">
                          {photoUrl ? <img src={photoUrl} alt={p.name} className="peer-avatar-photo" loading="lazy" decoding="async" /> : <div className="peer-avatar-fallback">{initials}</div>}
                        </div>
                        <div className="peer-player-meta">
                          <div className="peer-player-name">{p.name}</div>
                          <div className="peer-player-team">{p.teamLabel || "—"}</div>
                          {isRated && <div className="peer-player-rated-tag">Rated this week</div>}
                        </div>
                      </button>

                      {isActive && (
                        <div className="peer-player-rating-inline" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          {renderStarsRow("Attack", attack, setAttack)}
                          {renderStarsRow("Defence", defence, setDefence)}
                          {renderStarsRow("Playmaking", playmaking, setPlaymaking)}
                          {renderStarsRow("Goalkeeping", gk, setGk)}

                          <div className="actions-row">
                            <button
                              type="button"
                              className="primary-btn"
                              disabled={submitting}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSubmitForTarget(p.name);
                              }}
                            >
                              {submitting ? "Sending..." : `Save rating for ${String(p.name || "").split(" ")[0]}`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {statusMsg && <p className="status-text" style={{ marginTop: "0.75rem" }}>{statusMsg}</p>}
            </>
          )}
        </div>

        {isAdmin &&
          !baselineReminderDismissed &&
          adminReminderCount > 0 && (
            <div className="peer-reminder-popup">
              <div className="peer-reminder-popup-title">
                Baseline ratings needed
              </div>

              <div className="peer-reminder-popup-text">
                Some players who participated this week still need admin baseline ratings.
              </div>

              <div className="peer-reminder-player-list">
                {missingBaselineCurrentWeekTargets.map((p) => (
                  <div
                    key={p.name}
                    className="peer-reminder-player-pill"
                  >
                    {p.name}
                  </div>
                ))}
              </div>

              <div className="peer-reminder-actions">
                <button
                  type="button"
                  className="primary-btn peer-safe-primary"
                  onClick={() => {
                    setShowAdminBaselinePanel(true);
                    setBaselineReminderDismissed(true);
                  }}
                >
                  Open tool
                </button>

                <button
                  type="button"
                  className="secondary-btn peer-safe-secondary"
                  onClick={() => {
                    setBaselineReminderDismissed(true);
                  }}
                >
                  Later
                </button>
              </div>
            </div>
          )}

      </section>
    </div>
  );
}

export default PeerReviewPage;