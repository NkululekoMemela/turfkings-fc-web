// src/pages/PeerReviewPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { submitPeerRating } from "../storage/firebaseRepository.js";

const LOCAL_VOTE_PREFIX = "turfkings_peer_vote_v1";

const EMAIL_TO_PLAYER_NAME = {
  "nkululekolerato@gmail.com": "Nkululeko",
  "nmbulungeni@gmail.com": "Enoch",
  "mduduzi933@gmail.com": "Mdu",
};

export function PeerReviewPage({
  teams,
  playerPhotosByName = {},
  identity = null, // { role, memberId, fullName, shortName, email, ... }
  onBack,
}) {
  const [selectedRater, setSelectedRater] = useState(null);
  const [raterLocked, setRaterLocked] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [attack, setAttack] = useState(0);
  const [defence, setDefence] = useState(0);
  const [gk, setGk] = useState(0);
  const [comment, setComment] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterTeam, setFilterTeam] = useState("ALL");

  // ---------- Helpers ----------
  const normaliseName = (name) =>
    (name || "").trim().toLowerCase().replace(/\s+/g, " ");

  const getPhotoFor = (name) => {
    if (!name) return null;
    const direct = playerPhotosByName[name];
    if (direct) return direct;

    const n = normaliseName(name);
    const underscored = n.replace(/\s+/g, "_");

    return playerPhotosByName[n] || playerPhotosByName[underscored] || null;
  };

  const getInitials = (name) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0] || "";
    return (parts[0][0] || "") + (parts[1][0] || "");
  };

  // ---------- Build flat player list ----------
  const allPlayers = useMemo(() => {
    const list = [];
    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const name = typeof p === "string" ? p : p?.name || p?.displayName;
        if (!name) return;
        list.push({
          name,
          teamLabel: t.label,
        });
      });
    });

    const seen = new Set();
    const unique = [];
    list.forEach((p) => {
      if (seen.has(p.name)) return;
      seen.add(p.name);
      unique.push(p);
    });

    unique.sort((a, b) => {
      if (a.teamLabel !== b.teamLabel) {
        return a.teamLabel.localeCompare(b.teamLabel);
      }
      return a.name.localeCompare(b.name);
    });
    return unique;
  }, [teams]);

  const allPlayerNames = useMemo(
    () => allPlayers.map((p) => p.name),
    [allPlayers]
  );

  // ---------- Identity / eligibility ----------
  const entryRole = identity?.role || null;
  const isEntryPlayer =
    entryRole === "player" ||
    entryRole === "captain" ||
    entryRole === "admin";
  const isSpectator = entryRole === "spectator";
  const isSignedInPlayer = !!identity && isEntryPlayer;

  // ---------- Auto-select rater ----------
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

    const normCandidate = normaliseName(candidateName);

    let matched =
      allPlayerNames.find((n) => normaliseName(n) === normCandidate) || null;

    if (!matched && identity?.email) {
      const email = identity.email.toLowerCase();
      const alias = EMAIL_TO_PLAYER_NAME[email];
      if (alias) {
        matched =
          allPlayerNames.find(
            (n) => normaliseName(n) === normaliseName(alias)
          ) || alias;
      }
    }

    const finalName = matched || candidateName;

    setSelectedRater(finalName);
    setRaterLocked(true);
    setStatusMsg("");
  }, [identity, allPlayerNames, isSignedInPlayer, selectedRater]);

  const teamsForFilter = useMemo(() => {
    const labels = new Set();
    (teams || []).forEach((t) => labels.add(t.label));
    return ["ALL", ...Array.from(labels).sort()];
  }, [teams]);

  const candidateTargets = useMemo(() => {
    return allPlayers.filter((p) => {
      if (selectedRater && p.name === selectedRater) return false;
      if (filterTeam !== "ALL" && p.teamLabel !== filterTeam) return false;
      return true;
    });
  }, [allPlayers, selectedRater, filterTeam]);

  // ---------- Stars ----------
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
            onClick={() => handleStarClick(setter, v)}
          >
            ★
          </button>
        ))}
      </div>
      <span className="star-rating-value">
        {value > 0 ? `${value}/5` : "Skip"}
      </span>
    </div>
  );

  const toggleTarget = (name) => {
    setSelectedTargets((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name]
    );
    setStatusMsg("");
  };

  // ---------- Submit ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMsg("");

    if (!isSignedInPlayer) {
      setStatusMsg("Peer voting is reserved for Turf Kings players.");
      return;
    }

    if (!selectedRater) {
      setStatusMsg("Step 1: confirm who you are first.");
      return;
    }

    if (selectedTargets.length === 0) {
      setStatusMsg("Step 2: tap one or more teammates to rate.");
      return;
    }

    const hasAnyScore = attack || defence || gk;
    if (!hasAnyScore) {
      setStatusMsg(
        "Give at least one rating (Attack, Defence, or Goalkeeping), or cancel."
      );
      return;
    }

    const raterNorm = normaliseName(selectedRater);
    const nowIso = new Date().toISOString();
    const docsToSend = [];

    try {
      selectedTargets.forEach((targetName) => {
        const targetNorm = normaliseName(targetName);
        const voteKey = `${LOCAL_VOTE_PREFIX}:${raterNorm}:${targetNorm}`;

        if (typeof window !== "undefined") {
          const already = window.localStorage.getItem(voteKey);
          if (already) {
            return;
          }
        }

        const docData = {
          raterName: selectedRater,
          targetName,
          attack: attack || null,
          defence: defence || null,
          gk: gk || null,
          comment: comment.trim() || null,
          createdAt: nowIso,
        };

        docsToSend.push({ docData, voteKey });
      });
    } catch {
      // ignore localStorage errors
    }

    if (docsToSend.length === 0) {
      setStatusMsg(
        "You’ve already rated these teammates from this device. Thank you!"
      );
      return;
    }

    setSubmitting(true);

    try {
      await Promise.all(
        docsToSend.map(({ docData }) => submitPeerRating(docData))
      );

      try {
        if (typeof window !== "undefined") {
          docsToSend.forEach(({ voteKey }) => {
            window.localStorage.setItem(voteKey, "1");
          });
        }
      } catch {
        // ignore
      }

      setStatusMsg("✅ Thanks, your ratings have been saved.");
      setSelectedTargets([]);
      setAttack(0);
      setDefence(0);
      setGk(0);
      setComment("");
    } catch (err) {
      console.error("Peer rating submit error", err);
      setStatusMsg(
        "⚠️ Something went wrong saving your ratings. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRater = () => {
    if (raterLocked) return;
    setSelectedRater(null);
    setSelectedTargets([]);
    setAttack(0);
    setDefence(0);
    setGk(0);
    setComment("");
    setStatusMsg("");
  };

  const signedInName =
    selectedRater ||
    identity?.fullName ||
    identity?.shortName ||
    identity?.email ||
    null;

  // ---------- Render ----------
  return (
    <div className="page peer-review-page">
      <header className="header">
        <h1>Peer Ratings</h1>
        <p className="subtitle">
          Quiet, anonymous scorecard for{" "}
          <strong>Turf Kings players</strong> to rate each other. These
          ratings feed into the Player Cards.
        </p>
        <div className="stats-header-actions">
          <button className="secondary-btn" onClick={onBack}>
            Back to stats
          </button>
        </div>
      </header>

      <section className="card peer-card">
        {/* STEP 1 */}
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
                  You are signed in as a spectator. Only{" "}
                  <strong>Turf Kings players</strong> can submit peer ratings.
                  Use the player sign-in on the home screen.
                </p>
              ) : (
                <p className="muted small">
                  You are not signed in as a Turf Kings player. Peer voting is
                  reserved for{" "}
                  <strong>signed-in Turf Kings players</strong>. Use the sign-in
                  on the home screen.
                </p>
              )}
            </>
          )}

          {isSignedInPlayer && !selectedRater && (
            <>
              <p className="muted small">
                Tap your name from the Turf Kings squads. Only players in the
                squads can submit ratings.
              </p>
              <div className="peer-player-chip-row">
                {allPlayers.map((p) => (
                  <button
                    key={p.name + "-rater"}
                    type="button"
                    className="player-chip-btn"
                    onClick={() => {
                      setSelectedRater(p.name);
                      setRaterLocked(false);
                      setStatusMsg("");
                    }}
                  >
                    <span className="chip-name">{p.name}</span>
                    {p.teamLabel && (
                      <span className="chip-team">{p.teamLabel}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* STEP 2 */}
        <div className="peer-step">
          <h2>Step 2 – Rate your teammates</h2>

          {!isSignedInPlayer && (
            <p className="muted">
              We need to know who you are in Step 1 before you can rate
              teammates.
            </p>
          )}

          {isSignedInPlayer && selectedRater && (
            <>
              {/* Filters */}
              <div className="peer-filter-row">
                <span className="muted small">Filter by team:</span>
                <div className="team-pill-row">
                  {teamsForFilter.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={`team-pill-btn ${
                        filterTeam === label ? "active" : ""
                      }`}
                      onClick={() => {
                        setFilterTeam(label);
                        setSelectedTargets([]);
                      }}
                    >
                      {label === "ALL" ? "All teams" : label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player cards (multi-select) */}
              <div className="peer-player-grid">
                {candidateTargets.length === 0 && (
                  <p className="muted small">
                    No teammates available in this filter.
                  </p>
                )}
                {candidateTargets.map((p) => {
                  const isActive = selectedTargets.includes(p.name);
                  const photoUrl = getPhotoFor(p.name);
                  const initials = getInitials(p.name);

                  return (
                    <button
                      key={p.name + "-target"}
                      type="button"
                      className={`peer-player-card ${
                        isActive ? "active" : ""
                      }`}
                      onClick={() => toggleTarget(p.name)}
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
                          <div className="peer-avatar-fallback">
                            {initials}
                          </div>
                        )}
                      </div>
                      <div className="peer-player-meta">
                        <div className="peer-player-name">{p.name}</div>
                        <div className="peer-player-team">
                          {p.teamLabel || "—"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Rating controls */}
              <form className="peer-rating-form" onSubmit={handleSubmit}>
                <div className="peer-rating-card">
                  <h3>
                    Rating{" "}
                    {selectedTargets.length > 0 ? (
                      <span className="highlight-name">
                        {selectedTargets.length === 1
                          ? selectedTargets[0]
                          : `${selectedTargets.length} teammates`}
                      </span>
                    ) : (
                      <span className="muted">no teammate selected yet</span>
                    )}
                  </h3>

                  {renderStarsRow("Attack", attack, setAttack)}
                  {renderStarsRow("Defence", defence, setDefence)}
                  {renderStarsRow("Goalkeeping", gk, setGk)}

                  <div className="peer-field">
                    <label>Quick comment (optional)</label>
                    <textarea
                      className="text-input"
                      rows={3}
                      placeholder="Short note – strengths, improvements, compliments..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>

                  {statusMsg && (
                    <p className="status-text">{statusMsg}</p>
                  )}

                  <div className="actions-row">
                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={submitting}
                    >
                      {submitting ? "Sending..." : "Submit rating(s)"}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={onBack}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
