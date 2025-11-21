// src/pages/PeerReviewPage.jsx
import React, { useMemo, useState } from "react";
import { submitPeerRating } from "../storage/firebaseRepository.js";

const LOCAL_VOTE_PREFIX = "turfkings_peer_vote_v1";

export function PeerReviewPage({
  teams,
  playerPhotosByName = {},
  onBack,
}) {
  const [selectedRater, setSelectedRater] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [attack, setAttack] = useState(0);
  const [defence, setDefence] = useState(0);
  const [gk, setGk] = useState(0);
  const [comment, setComment] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterTeam, setFilterTeam] = useState("ALL");

  // ---- build flat player list from teams ----
  const allPlayers = useMemo(() => {
    const list = [];
    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const name =
          typeof p === "string" ? p : p?.name || p?.displayName;
        if (!name) return;
        list.push({
          name,
          teamLabel: t.label,
        });
      });
    });

    // unique by name
    const seen = new Set();
    const unique = [];
    list.forEach((p) => {
      if (seen.has(p.name)) return;
      seen.add(p.name);
      unique.push(p);
    });

    // sort by team then name
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

  const getPhotoFor = (name) => {
    if (!name) return null;
    return playerPhotosByName[name] || null;
  };

  const getInitials = (name) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0] || "";
    return (parts[0][0] || "") + (parts[1][0] || "");
  };

  // star click handlers
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
            className={
              v <= value ? "star-btn star-filled" : "star-btn star-empty"
            }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMsg("");

    if (!selectedRater) {
      setStatusMsg("Step 1: tap your own name first.");
      return;
    }
    if (!selectedTarget) {
      setStatusMsg("Step 2: tap the teammate you want to rate.");
      return;
    }

    // safety: ensure both are valid players
    if (!allPlayerNames.includes(selectedRater)) {
      setStatusMsg(
        "Only players on the Turf Kings squads can vote."
      );
      return;
    }
    if (!allPlayerNames.includes(selectedTarget)) {
      setStatusMsg("Please pick a valid teammate.");
      return;
    }

    if (selectedRater === selectedTarget) {
      setStatusMsg("You can’t rate yourself – pick a teammate instead.");
      return;
    }

    const hasAnyScore = attack || defence || gk;
    if (!hasAnyScore) {
      setStatusMsg(
        "Give at least one rating (Attack, Defence, or Goalkeeping), or cancel."
      );
      return;
    }

    const voteKey = `${LOCAL_VOTE_PREFIX}:${selectedTarget.toLowerCase()}`;

    try {
      if (typeof window !== "undefined") {
        const already = window.localStorage.getItem(voteKey);
        if (already) {
          setStatusMsg(
            "You’ve already rated this player from this device. Thank you!"
          );
          return;
        }
      }
    } catch {
      // ignore localStorage issues
    }

    setSubmitting(true);

    try {
      const docData = {
        // rater name is intentionally NOT stored -> anonymous
        targetName: selectedTarget,
        attack: attack || null,
        defence: defence || null,
        gk: gk || null,
        comment: comment.trim() || null,
        createdAt: new Date().toISOString(),
      };

      await submitPeerRating(docData);

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(voteKey, "1");
        }
      } catch {
        // ignore
      }

      setStatusMsg("✅ Thanks, your rating has been saved.");
      // reset target + ratings but keep rater for more votes
      setSelectedTarget(null);
      setAttack(0);
      setDefence(0);
      setGk(0);
      setComment("");
    } catch (err) {
      console.error("Peer rating submit error", err);
      setStatusMsg(
        "⚠️ Something went wrong saving your rating. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

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
        {/* STEP 1: WHO ARE YOU? */}
        <div className="peer-step">
          <div className="peer-step-header">
            <h2>Step 1 – Who are you?</h2>
            {selectedRater && (
              <div className="peer-current-rater">
                Voting as <strong>{selectedRater}</strong>{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setSelectedRater(null);
                    setSelectedTarget(null);
                    setAttack(0);
                    setDefence(0);
                    setGk(0);
                    setComment("");
                    setStatusMsg("");
                  }}
                >
                  change
                </button>
              </div>
            )}
          </div>

          {!selectedRater && (
            <>
              <p className="muted small">
                Tap your name from the Turf Kings squads. Only players in
                the squads can submit ratings.
              </p>
              <div className="peer-player-chip-row">
                {allPlayers.map((p) => (
                  <button
                    key={p.name + "-rater"}
                    type="button"
                    className="player-chip-btn"
                    onClick={() => {
                      setSelectedRater(p.name);
                      setStatusMsg("");
                    }}
                  >
                    {p.name}
                    {p.teamLabel ? ` (${p.teamLabel})` : ""}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* STEP 2: PICK TEAMMATE + RATE */}
        <div className="peer-step">
          <h2>Step 2 – Rate a teammate</h2>
          {!selectedRater && (
            <p className="muted">
              Select yourself in Step 1 before choosing a teammate.
            </p>
          )}

          {selectedRater && (
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
                        setSelectedTarget(null);
                      }}
                    >
                      {label === "ALL" ? "All teams" : label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player cards */}
              <div className="peer-player-grid">
                {candidateTargets.length === 0 && (
                  <p className="muted small">
                    No teammates available in this filter.
                  </p>
                )}
                {candidateTargets.map((p) => {
                  const isActive = selectedTarget === p.name;
                  const photo = getPhotoFor(p.name);
                  const initials = getInitials(p.name);

                  return (
                    <button
                      key={p.name + "-target"}
                      type="button"
                      className={`peer-player-card ${
                        isActive ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedTarget(p.name);
                        setStatusMsg("");
                      }}
                    >
                      <div className="peer-player-avatar">
                        {photo ? (
                          <div
                            className="peer-avatar-photo"
                            style={{ backgroundImage: `url(${photo})` }}
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
                    {selectedTarget ? (
                      <span className="highlight-name">
                        {selectedTarget}
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
                      {submitting ? "Sending..." : "Submit rating"}
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
