// src/pages/PeerReviewPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { submitPeerRating } from "../storage/firebaseRepository.js";

const LOCAL_VOTE_PREFIX = "turfkings_peer_vote_v1";

const EMAIL_TO_PLAYER_NAME = {
  "nkululekolerato@gmail.com": "Nkululeko",
  "nmbulungeni@gmail.com": "Enoch",
  "mduduzi933@gmail.com": "Mdu",
};

function getCurrentWeekKey() {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - day
  );
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

export function PeerReviewPage({
  teams,
  playerPhotosByName = {},
  identity = null,
  activeSeasonId = null,
  onBack,
}) {
  const [weekKey] = useState(() => getCurrentWeekKey());

  const [selectedRater, setSelectedRater] = useState(null);
  const [raterLocked, setRaterLocked] = useState(false);

  const [activeTarget, setActiveTarget] = useState(null);

  const [attack, setAttack] = useState(0);
  const [defence, setDefence] = useState(0);
  const [gk, setGk] = useState(0);
  const [comment, setComment] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterTeam, setFilterTeam] = useState("ALL");

  const [ratedTargets, setRatedTargets] = useState([]);

  const [cloudPhotoIndex, setCloudPhotoIndex] = useState({});
  const [, setMemberAliasMap] = useState({});
  const [memberCanonicalMap, setMemberCanonicalMap] = useState({});

  const normaliseName = (name) =>
    String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

  const getInitials = (name) => {
    if (!name) return "";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return (parts[0].slice(0, 2) || "").toUpperCase();
    return (
      ((parts[0][0] || "") + (parts[parts.length - 1][0] || "")).toUpperCase()
    );
  };

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
    const firstCanonical = firstNameOf(canonical);
    const pretty = toTitleCase(name);
    const firstPretty = firstNameOf(pretty);

    const candidates = [
      name,
      pretty,
      canonical,
      firstPretty,
      firstCanonical,
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
        const [membersSnap, photosSnap] = await Promise.all([
          getDocs(collection(db, "members")),
          getDocs(collection(db, "playerPhotos")),
        ]);

        if (cancelled) return;

        const aliasMap = {};
        const canonicalMap = {};
        const photoIdx = {};

        const addCanon = (key, value) => {
          const k = safeLower(key);
          if (!k || !value) return;
          if (!canonicalMap[k]) canonicalMap[k] = value;
        };

        const addAlias = (key, value) => {
          const k = safeLower(key);
          if (!k || !value) return;
          if (!aliasMap[k]) aliasMap[k] = value;
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

          if (!fullName) return;

          addCanon(fullName, fullName);
          addCanon(slugFromName(fullName), fullName);

          const firstFull = firstNameOf(fullName);
          if (firstFull) addCanon(firstFull, fullName);

          addAlias(fullName, fullName);

          if (shortName) {
            addCanon(shortName, fullName);
            addCanon(slugFromName(shortName), fullName);
            addAlias(shortName, fullName);

            const firstShort = firstNameOf(shortName);
            if (firstShort) addCanon(firstShort, fullName);
          }

          aliases.forEach((alias) => {
            const prettyAlias = toTitleCase(alias);
            if (!prettyAlias) return;
            addCanon(prettyAlias, fullName);
            addCanon(slugFromName(prettyAlias), fullName);
            addAlias(prettyAlias, fullName);

            const firstAlias = firstNameOf(prettyAlias);
            if (firstAlias) addCanon(firstAlias, fullName);
          });
        });

        photosSnap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const photoData = data.photoData || "";
          const rawName = toTitleCase(data.name || docSnap.id || "");

          if (!photoData || !rawName) return;

          const canonical = canonicalMap[safeLower(rawName)] || rawName;
          const firstRaw = firstNameOf(rawName);
          const firstCanonical = firstNameOf(canonical);

          [
            rawName,
            canonical,
            slugFromName(rawName),
            slugFromName(canonical),
            firstRaw,
            firstCanonical,
            docSnap.id,
          ]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .forEach((key) => addPhoto(key, photoData));
        });

        setMemberAliasMap(aliasMap);
        setMemberCanonicalMap(canonicalMap);
        setCloudPhotoIndex(photoIdx);
      } catch (err) {
        console.error("Failed to load PeerReviewPage members/photos:", err);
      }
    }

    loadMembersAndPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  const allPlayers = useMemo(() => {
    const list = [];

    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const rawName =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        const canonical = resolveCanonicalName(rawName || "");
        if (!canonical) return;

        list.push({
          name: canonical,
          teamLabel: t.label || "",
        });
      });
    });

    return uniqueByName(
      list.sort((a, b) => {
        if ((a.teamLabel || "") !== (b.teamLabel || "")) {
          return (a.teamLabel || "").localeCompare(b.teamLabel || "");
        }
        return (a.name || "").localeCompare(b.name || "");
      })
    );
  }, [teams, memberCanonicalMap]);

  const allPlayerNames = useMemo(() => allPlayers.map((p) => p.name), [allPlayers]);

  const entryRole = identity?.role || null;
  const isEntryPlayer =
    entryRole === "player" || entryRole === "captain" || entryRole === "admin";
  const isSpectator = entryRole === "spectator";
  const isSignedInPlayer = !!identity && isEntryPlayer;

  useEffect(() => {
    if (!isSignedInPlayer) return;
    if (selectedRater) return;

    let candidateName =
      identity?.fullName ||
      identity?.shortName ||
      (identity?.email && EMAIL_TO_PLAYER_NAME[identity.email.toLowerCase()]) ||
      null;

    if (!candidateName && identity?.email) {
      const email = identity.email.toLowerCase();
      candidateName = EMAIL_TO_PLAYER_NAME[email] || null;
    }

    if (!candidateName) return;

    const canonicalCandidate = resolveCanonicalName(candidateName);
    const normCandidate = normaliseName(canonicalCandidate);

    let matched =
      allPlayerNames.find((n) => normaliseName(n) === normCandidate) || null;

    if (!matched && identity?.email) {
      const email = identity.email.toLowerCase();
      const alias = EMAIL_TO_PLAYER_NAME[email];
      if (alias) {
        const canonicalAlias = resolveCanonicalName(alias);
        matched =
          allPlayerNames.find(
            (n) => normaliseName(n) === normaliseName(canonicalAlias)
          ) || canonicalAlias;
      }
    }

    const finalName = matched || canonicalCandidate;

    setSelectedRater(finalName);
    setRaterLocked(true);
    setStatusMsg("");
  }, [identity, allPlayerNames, isSignedInPlayer, selectedRater, memberCanonicalMap]);

  useEffect(() => {
    if (!selectedRater) return;
    if (typeof window === "undefined") return;

    const rNorm = normaliseName(selectedRater);
    const ratedSet = new Set();

    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(`${LOCAL_VOTE_PREFIX}:`)) continue;

        const parts = key.split(":");
        if (parts.length < 5) continue;

        const [, storedSeasonId, storedWeek, storedRater, storedTarget] = parts;

        if (
          storedSeasonId === String(activeSeasonId || "UNKNOWN_SEASON") &&
          storedWeek === weekKey &&
          storedRater === rNorm
        ) {
          ratedSet.add(storedTarget);
        }
      }
    } catch {
      // ignore
    }

    setRatedTargets(Array.from(ratedSet));
  }, [selectedRater, weekKey, activeSeasonId]);

  const teamsForFilter = useMemo(() => {
    const labels = new Set();
    (teams || []).forEach((t) => labels.add(t.label));
    return ["ALL", ...Array.from(labels).sort()];
  }, [teams]);

  const candidateTargets = useMemo(() => {
    return allPlayers.filter((p) => {
      if (selectedRater && normaliseName(p.name) === normaliseName(selectedRater)) {
        return false;
      }
      if (filterTeam !== "ALL" && p.teamLabel !== filterTeam) return false;
      return true;
    });
  }, [allPlayers, selectedRater, filterTeam]);

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

  const handleSelectTarget = (name) => {
    setStatusMsg("");

    if (activeTarget === name) {
      setActiveTarget(null);
      return;
    }

    setActiveTarget(name);
    setAttack(0);
    setDefence(0);
    setGk(0);
    setComment("");
  };

  const handleSubmitForTarget = async (targetName) => {
    setStatusMsg("");

    if (!isSignedInPlayer) {
      setStatusMsg("Peer voting is reserved for Turf Kings players.");
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

    const hasAnyScore = attack || defence || gk;
    if (!hasAnyScore) {
      setStatusMsg(
        "Give at least one rating (Attack, Defence, or Goalkeeping), or cancel."
      );
      return;
    }

    const seasonId = String(activeSeasonId || "UNKNOWN_SEASON");
    const raterCanonical = resolveCanonicalName(selectedRater);
    const targetCanonical = resolveCanonicalName(targetName);

    const raterNorm = normaliseName(raterCanonical);
    const targetNorm = normaliseName(targetCanonical);

    const voteKey = `${LOCAL_VOTE_PREFIX}:${seasonId}:${weekKey}:${raterNorm}:${targetNorm}`;

    try {
      if (typeof window !== "undefined") {
        const already = window.localStorage.getItem(voteKey);
        if (already) {
          setStatusMsg(`You’ve already rated ${targetCanonical} for this week.`);
          setActiveTarget(null);
          return;
        }
      }
    } catch {
      // ignore
    }

    const now = new Date();

    const docData = {
      raterName: raterCanonical,
      raterNameNormalized: raterNorm,
      targetName: targetCanonical,
      targetNameNormalized: targetNorm,
      attack: attack || null,
      defence: defence || null,
      gk: gk || null,
      comment: comment.trim() || null,
      createdAtMs: now.getTime(),
      weekKey,
      seasonId,
      source: "peer-review-page",
    };

    setSubmitting(true);

    try {
      await submitPeerRating(docData);

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(voteKey, "1");
        }
      } catch {
        // ignore
      }

      setRatedTargets((prev) => {
        if (prev.includes(targetNorm)) return prev;
        return [...prev, targetNorm];
      });

      setActiveTarget(null);
      setAttack(0);
      setDefence(0);
      setGk(0);
      setComment("");
      setStatusMsg(`✅ Saved rating for ${targetCanonical}.`);
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
    setAttack(0);
    setDefence(0);
    setGk(0);
    setComment("");
    setStatusMsg("");
    setRatedTargets([]);
  };

  const signedInName =
    selectedRater ||
    identity?.fullName ||
    identity?.shortName ||
    identity?.email ||
    null;

  return (
    <div className="page peer-review-page">
      <header className="header">
        <h1>Peer Ratings</h1>
        <p className="subtitle">
          Quiet, anonymous scorecard for <strong>Turf Kings players</strong> to rate
          each other. These ratings feed into the Player Cards.
        </p>
        <p className="subtitle">
          Reviews are weekly and tied to the <strong>current season</strong>.
        </p>
        <div className="stats-header-actions">
          <button className="secondary-btn" onClick={onBack}>
            Back to stats
          </button>
        </div>
      </header>

      <section className="card peer-card">
        <div className="peer-step">
          <div className="peer-step-header">
            <h2>Step 1 – Who are you?</h2>
            {signedInName && isSignedInPlayer && (
              <div className="peer-current-rater">
                Voting as{" "}
                <strong>
                  {selectedRater || signedInName}
                  {raterLocked ? " (verified)" : ""}
                </strong>{" "}
                {!raterLocked && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={handleChangeRater}
                  >
                    change
                  </button>
                )}
              </div>
            )}
          </div>

          {!isSignedInPlayer && (
            <>
              {isSpectator ? (
                <p className="muted small">
                  You are signed in as a spectator. Only <strong>Turf Kings players</strong>{" "}
                  can submit peer ratings.
                </p>
              ) : (
                <p className="muted small">
                  You are not signed in as a Turf Kings player.
                </p>
              )}
            </>
          )}

          {isSignedInPlayer && !selectedRater && (
            <>
              <p className="muted small">
                Tap your name from the Turf Kings squads.
              </p>

              <div
                className="peer-player-grid"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
              >
                {allPlayers.map((p) => {
                  const photoUrl = getPhotoFor(p.name);
                  const initials = getInitials(p.name);

                  return (
                    <button
                      key={`${p.name}-rater`}
                      type="button"
                      className="peer-player-main"
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "16px",
                        padding: "0.85rem",
                        background: "rgba(255,255,255,0.04)",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        setSelectedRater(p.name);
                        setRaterLocked(false);
                        setStatusMsg("");
                      }}
                    >
                      <div className="peer-player-avatar">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={p.name}
                            className="peer-avatar-photo"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="peer-avatar-fallback">{initials}</div>
                        )}
                      </div>
                      <div className="peer-player-meta">
                        <div className="peer-player-name">{p.name}</div>
                        <div className="peer-player-team">{p.teamLabel}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="peer-step">
          <h2>Step 2 – Rate your teammates</h2>

          {!isSignedInPlayer && (
            <p className="muted">
              We need to know who you are in Step 1 before you can rate teammates.
            </p>
          )}

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
                      {label === "ALL" ? "All teams" : label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="peer-player-grid">
                {candidateTargets.length === 0 && (
                  <p className="muted small">No teammates available in this filter.</p>
                )}

                {candidateTargets.map((p) => {
                  const isActive = activeTarget === p.name;
                  const targetNorm = normaliseName(p.name);
                  const isRated = ratedTargets.includes(targetNorm);
                  const photoUrl = getPhotoFor(p.name);
                  const initials = getInitials(p.name);

                  return (
                    <div
                      key={`${p.name}-target`}
                      className={`peer-player-card ${isActive ? "active" : ""} ${
                        isRated ? "rated" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="peer-player-main"
                        onClick={() => handleSelectTarget(p.name)}
                      >
                        <div className="peer-player-avatar">
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={p.name}
                              className="peer-avatar-photo"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="peer-avatar-fallback">{initials}</div>
                          )}
                        </div>

                        <div className="peer-player-meta">
                          <div className="peer-player-name">{p.name}</div>
                          <div className="peer-player-team">{p.teamLabel || "—"}</div>
                          {isRated && (
                            <div className="peer-player-rated-tag">Rated this week</div>
                          )}
                        </div>
                      </button>

                      {isActive && (
                        <div
                          className="peer-player-rating-inline"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {renderStarsRow("Attack", attack, setAttack)}
                          {renderStarsRow("Defence", defence, setDefence)}
                          {renderStarsRow("Goalkeeping", gk, setGk)}

                          <div className="peer-field">
                            <label>Quick comment (optional)</label>
                            <textarea
                              className="text-input"
                              rows={2}
                              placeholder="Short note – strengths, improvements, compliments..."
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                          </div>

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
                                handleSubmitForTarget(p.name);
                              }}
                            >
                              {submitting ? "Sending..." : `Save rating for ${p.name}`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {statusMsg && (
                <p className="status-text" style={{ marginTop: "0.75rem" }}>
                  {statusMsg}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}