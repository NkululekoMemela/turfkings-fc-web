// src/pages/LandingPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getTeamById } from "../core/teams.js";
import TurfKingsLogo from "../assets/TurfKings_logo.jpeg";
import TeamPhoto1 from "../assets/TurfKings.jpg";
import TeamPhoto2 from "../assets/TurfKings2.jpeg";
import TeamPhoto3 from "../assets/TurfKings3.jpeg";

import { auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

const CAPTAIN_CODES = ["11", "22", "3333"];

const activePrimaryStyle = {
  background:
    "radial-gradient(circle at 0% 0%, rgba(56,189,248,0.25), transparent 55%), radial-gradient(circle at 100% 100%, rgba(59,130,246,0.35), transparent 55%), linear-gradient(90deg, #22d3ee, #38bdf8, #6366f1)",
  color: "#000000",
  boxShadow:
    "0 0 0 1px rgba(148, 255, 255, 0.35), 0 0 24px rgba(56,189,248,0.50)",
  border: "none",
};

function getIdentityRole(identity) {
  const role = String(
    identity?.actingRole || identity?.role || "spectator"
  ).trim().toLowerCase();

  if (
    role === "admin" ||
    role === "captain" ||
    role === "player" ||
    role === "spectator"
  ) {
    return role;
  }

  return "spectator";
}

function getIdentityDisplayName(identity, currentUser) {
  return (
    identity?.shortName ||
    identity?.fullName ||
    identity?.displayName ||
    identity?.name ||
    currentUser?.displayName ||
    currentUser?.email ||
    "Guest"
  );
}

export function LandingPage({
  teams,
  currentMatchNo,
  currentMatch,
  results,
  streaks,
  hasLiveMatch,
  matchMode = "round_robin",
  scheduledTarget = null,
  scheduledFixtures = [],
  smartOffset = 5,
  smartTarget = null,
  onUpdatePairing,
  onStartMatch,
  onSetMatchMode,
  onGenerateScheduledPlan,
  onUpdateSmartOffset,
  onGoToStats,
  onOpenBackupModal,
  onOpenEndSeasonModal,
  onGoToLiveAsSpectator,
  onGoToFormations,
  onGoToNews,
  onGoToEntryDev,
  onGoToPayments,
  identity,
  activeRole,
  isAdmin = false,
  isCaptain = false,
  isPlayer = false,
  isSpectator = false,
  canStartMatch = false,
}) {
  const { teamAId, teamBId, standbyId } = currentMatch || {};

  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pendingMatch, setPendingMatch] = useState(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState("");

  const [showFixturesModal, setShowFixturesModal] = useState(false);
  const [fixtureAdminCode, setFixtureAdminCode] = useState("");
  const [fixtureAdminError, setFixtureAdminError] = useState("");
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  const teamPhotos = [TeamPhoto1, TeamPhoto2, TeamPhoto3];
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (teamPhotos.length <= 1) return;

    const interval = setInterval(() => {
      setPhotoIndex((prev) => (prev + 1) % teamPhotos.length);
    }, 3500);

    return () => clearInterval(interval);
  }, [teamPhotos.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth <= 480);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 6);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsub();
  }, []);

  const resolvedRole = useMemo(() => {
    if (activeRole === "admin") return "admin";
    if (activeRole === "captain") return "captain";
    if (activeRole === "player") return "player";
    if (activeRole === "spectator") return "spectator";
    return getIdentityRole(identity);
  }, [activeRole, identity]);

  const teamA = getTeamById(teams, teamAId);
  const teamB = getTeamById(teams, teamBId);
  const standbyTeam = getTeamById(teams, standbyId);

  const matchesPlayed = Array.isArray(results) ? results.length : 0;
  const lastResult = matchesPlayed > 0 ? results[matchesPlayed - 1] : null;

  const identityName = useMemo(
    () => getIdentityDisplayName(identity, currentUser),
    [identity, currentUser]
  );

  const profileButtonLabel = identity
    ? resolvedRole === "spectator"
      ? "Change viewer mode"
      : "Change profile"
    : "Sign in";

  const roleLabel = useMemo(() => {
    if (resolvedRole === "admin") return "admin";
    if (resolvedRole === "captain") return "captain";
    if (resolvedRole === "player") return "player";
    return "spectator";
  }, [resolvedRole]);

  let ribbonText = "";
  if (teamA && teamB && standbyTeam) {
    ribbonText = `Next: ${teamA.label} vs ${teamB.label}       Standby: ${standbyTeam.label}`;
  }

  if (lastResult) {
    const lastA = getTeamById(teams, lastResult.teamAId);
    const lastB = getTeamById(teams, lastResult.teamBId);

    if (lastA && lastB) {
      const status =
        lastResult.isDraw && !lastResult.winnerId
          ? "draw"
          : `won by ${
              lastResult.winnerId === lastA.id ? lastA.label : lastB.label
            }`;

      ribbonText += `       • Last: ${lastA.label} ${lastResult.goalsA}-${lastResult.goalsB} ${lastB.label} (${status})`;
    }
  } else if (ribbonText) {
    ribbonText += "       • No results yet – first game incoming!";
  }

  const requestPairChange = (candidateMatch) => {
    if (!canStartMatch) return;

    if (matchMode === "scheduled_target") {
      window.alert(
        "Pairing override is locked while Fixtured mode is active."
      );
      return;
    }

    setPendingMatch(candidateMatch);
    setPairingCode("");
    setPairingError("");
    setShowPairingModal(true);
  };

  const handleTeamAChange = (e) => {
    if (!canStartMatch) return;

    const newA = e.target.value;
    if (newA === teamAId) return;

    const allowedForB = teams.filter((t) => t.id !== newA);
    const newB = allowedForB.some((t) => t.id === teamBId)
      ? teamBId
      : allowedForB[0]?.id;
    const newStandby =
      teams.find((t) => t.id !== newA && t.id !== newB)?.id || standbyId;

    requestPairChange({
      teamAId: newA,
      teamBId: newB,
      standbyId: newStandby,
    });
  };

  const handleTeamBChange = (e) => {
    if (!canStartMatch) return;

    const newB = e.target.value;
    if (newB === teamBId) return;

    const allowedForA = teams.filter((t) => t.id !== newB);
    const newA = allowedForA.some((t) => t.id === teamAId)
      ? teamAId
      : allowedForA[0]?.id;
    const newStandby =
      teams.find((t) => t.id !== newA && t.id !== newB)?.id || standbyId;

    requestPairChange({
      teamAId: newA,
      teamBId: newB,
      standbyId: newStandby,
    });
  };

  const cancelPairingChange = () => {
    setShowPairingModal(false);
    setPendingMatch(null);
    setPairingCode("");
    setPairingError("");
  };

  const confirmPairingChange = () => {
    if (!pendingMatch) return;

    if (!CAPTAIN_CODES.includes(pairingCode.trim())) {
      setPairingError("Invalid captain code.");
      return;
    }

    onUpdatePairing(pendingMatch);
    cancelPairingChange();
  };

  const optionsForTeamA = teams.filter((t) => t.id !== teamBId);
  const optionsForTeamB = teams.filter((t) => t.id !== teamAId);

  const renderOptionLabel = (team) =>
    isMobile ? team.label : `${team.label} (c: ${team.captain})`;

  const handleSpectatorLiveClick = () => {
    onGoToLiveAsSpectator();
  };

  const handleStartMatchClick = () => {
    if (!canStartMatch) {
      window.alert("Only captains or admin can start a match.");
      return;
    }
    onStartMatch();
  };

  const canSeeCaptainStyleControls = isCaptain || isAdmin;
  const fixturedMode = matchMode === "scheduled_target";

  const handleProtectedTargetChange = (target) => {
    if (!isAdmin) return;

    if (fixtureAdminCode.trim() !== "3333") {
      setFixtureAdminError("Invalid admin code.");
      return;
    }

    setFixtureAdminError("");
    onGenerateScheduledPlan?.(target);
  };

  return (
    <div className="page landing-page">
      <div
        className={`landing-header-sticky ${headerScrolled ? "is-scrolled" : ""}`}
      >
        <header className="header">
          <div className="header-title">
            <img src={TurfKingsLogo} alt="Turf Kings logo" className="tk-logo" />
            <h1>Turf Kings 5-A-Side</h1>
          </div>

          <p className="subtitle">
            Grand Central (CT) – Wednesdays, 17:30–19:00
          </p>

          <div className="header-top-row">
            <div className="auth-status">
              <span className="auth-text">
                Viewing as <strong>{identityName}</strong>
                <span className="muted small">
                  {" "}
                  • Role: <strong>{roleLabel}</strong>
                </span>
              </span>

              {currentUser && resolvedRole !== "spectator" && (
                <div className="muted small" style={{ marginTop: "0.2rem" }}>
                  Google account:{" "}
                  <strong>{currentUser.displayName || currentUser.email}</strong>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {isAdmin && typeof onOpenEndSeasonModal === "function" && (
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={onOpenEndSeasonModal}
                >
                  🏆 End Season
                </button>
              )}

              <button
                className="secondary-btn"
                type="button"
                onClick={onGoToEntryDev}
              >
                {profileButtonLabel}
              </button>
            </div>
          </div>
        </header>

        <div className="landing-header-divider" />
      </div>

      <section className="card landing-first-card">
        {canSeeCaptainStyleControls && (
          <div style={{ marginBottom: "0.9rem" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.10)",
                gap: "4px",
              }}
            >
              <button
                type="button"
                className="secondary-btn"
                onClick={() => onSetMatchMode?.("round_robin")}
                style={{
                  borderRadius: "999px",
                  padding: "0.45rem 0.9rem",
                  color: "#ffffff",
                  border: fixturedMode
                    ? "1px solid transparent"
                    : "1px solid rgba(255, 90, 90, 0.55)",
                  background: fixturedMode
                    ? "transparent"
                    : "linear-gradient(180deg, rgba(255,80,80,0.95), rgba(210,35,35,0.95))",
                  boxShadow: fixturedMode
                    ? "none"
                    : "0 0 18px rgba(255,60,60,0.35)",
                }}
              >
                Round Robin
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => onSetMatchMode?.("scheduled_target")}
                style={{
                  borderRadius: "999px",
                  padding: "0.45rem 0.9rem",
                  color: "#ffffff",
                  border: fixturedMode
                    ? "1px solid rgba(255, 90, 90, 0.55)"
                    : "1px solid transparent",
                  background: fixturedMode
                    ? "linear-gradient(180deg, rgba(255,80,80,0.95), rgba(210,35,35,0.95))"
                    : "transparent",
                  boxShadow: fixturedMode
                    ? "0 0 18px rgba(255,60,60,0.35)"
                    : "none",
                }}
              >
                Fixtured
              </button>
            </div>
          </div>
        )}

        <h2>Upcoming Match #{currentMatchNo}</h2>

        {fixturedMode && canSeeCaptainStyleControls && (
          <div style={{ marginBottom: "0.9rem" }}>
            <div
              style={{
                display: "flex",
                gap: "0.45rem",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "0.55rem",
              }}
            >
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowFixturesModal(true)}
                disabled={!scheduledFixtures || scheduledFixtures.length === 0}
                style={{
                  opacity:
                    scheduledFixtures && scheduledFixtures.length > 0 ? 1 : 0.6,
                }}
              >
                View fixtures
              </button>
            </div>

            <div className="muted small">
              Common target: <strong>{scheduledTarget ?? smartTarget ?? "-"}</strong>
            </div>
          </div>
        )}

        <div className="match-setup-row">
          <div className="team-select">
            <label>On-field Team 1</label>
            <select
              value={teamAId || ""}
              onChange={handleTeamAChange}
              disabled={!canSeeCaptainStyleControls || fixturedMode}
            >
              {optionsForTeamA.map((team) => (
                <option key={team.id} value={team.id}>
                  {renderOptionLabel(team)}
                </option>
              ))}
            </select>
          </div>

          <span className="vs-label">vs</span>

          <div className="team-select">
            <label>On-field Team 2</label>
            <select
              value={teamBId || ""}
              onChange={handleTeamBChange}
              disabled={!canSeeCaptainStyleControls || fixturedMode}
            >
              {optionsForTeamB.map((team) => (
                <option key={team.id} value={team.id}>
                  {renderOptionLabel(team)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {standbyTeam && (
          <p className="standby-label">
            Standby Team:{" "}
            <strong>
              {standbyTeam.label} (c: {standbyTeam.captain})
            </strong>
          </p>
        )}

        {fixturedMode && (
          <p className="muted small" style={{ marginTop: "-0.1rem" }}>
            Pairing override is locked while Fixtured mode is active.
          </p>
        )}

        {canSeeCaptainStyleControls ? (
          <div className="actions-row landing-actions">
            <button
              className="primary-btn"
              style={activePrimaryStyle}
              onClick={handleStartMatchClick}
              type="button"
            >
              ⚽ Start Match
            </button>

            <button
              className="secondary-btn"
              onClick={() => onGoToStats()}
              type="button"
            >
              📊 View Stats
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={onGoToFormations}
            >
              🧩 Lineups &amp; Formations
            </button>

            <button
              className="secondary-btn"
              type="button"
              onClick={onGoToNews}
            >
              📝 News &amp; Highlights
            </button>

            {isAdmin && (
              <button
                className="secondary-btn"
                onClick={onOpenBackupModal}
                type="button"
              >
                🏁 End Match Day
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="muted">
              {isPlayer
                ? "Players can view the setup, lineups and stats, but only captains or admin can start a match."
                : "You can follow the live game and view all public information."}
            </p>

            <div className="actions-row landing-actions">
              <button
                className="primary-btn"
                style={activePrimaryStyle}
                type="button"
                onClick={handleSpectatorLiveClick}
              >
                {hasLiveMatch ? "⚽ View Live Match" : "⚽ Live Match"}
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={() => onGoToStats()}
              >
                📊 View Stats
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={onGoToFormations}
              >
                🧩 Lineups &amp; Formations
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={onGoToNews}
              >
                📝 News &amp; Highlights
              </button>
            </div>
          </>
        )}
      </section>

      <section className="ticker">
        <div className="ticker-inner">
          <span>{ribbonText}</span>
        </div>
      </section>

      <section className="card team-photo-card">
        <img
          src={teamPhotos[photoIndex]}
          alt={`Turf Kings team ${photoIndex + 1}`}
          className="team-photo"
        />
      </section>

      <section className="card website-card">
        <div className="website-links">
          <button
            type="button"
            className="website-btn"
            onClick={onGoToPayments}
          >
            💳 Pay for next month games
          </button>

          <a
            href="https://www.messivsronaldo.app/#google_vignette"
            target="_blank"
            rel="noreferrer"
            className="website-btn"
          >
            ⚔️ Messi vs Ronaldo
          </a>
        </div>
      </section>

      {showPairingModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm Match Override</h3>
            <p>Changing the next pairing requires a captain code.</p>

            <div className="field-row">
              <label>Captain code</label>
              <input
                type="password"
                className="text-input"
                value={pairingCode}
                onChange={(e) => {
                  setPairingCode(e.target.value);
                  setPairingError("");
                }}
              />
              {pairingError && <p className="error-text">{pairingError}</p>}
            </div>

            <div className="actions-row">
              <button className="secondary-btn" onClick={cancelPairingChange}>
                Cancel
              </button>
              <button className="primary-btn" onClick={confirmPairingChange}>
                Confirm change
              </button>
            </div>
          </div>
        </div>
      )}

      {showFixturesModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: "620px", width: "94%" }}>
            <h3>Fixtured Match List</h3>
            <p>
              Common target: <strong>{scheduledTarget ?? smartTarget ?? "-"}</strong>
            </p>

            {isAdmin && (
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 0.9fr auto",
                    gap: "0.75rem",
                    alignItems: "end",
                    marginBottom: "0.55rem",
                  }}
                >
                  <div>
                    <label
                      className="muted small"
                      style={{ display: "block", marginBottom: "0.35rem" }}
                    >
                      Admin code
                    </label>
                    <input
                      type="password"
                      className="text-input"
                      placeholder="Enter admin code"
                      value={fixtureAdminCode}
                      onChange={(e) => {
                        setFixtureAdminCode(e.target.value);
                        setFixtureAdminError("");
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="muted small"
                      style={{ display: "block", marginBottom: "0.35rem" }}
                    >
                      Remaining games
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="text-input"
                      value={smartOffset}
                      onChange={(e) =>
                        onUpdateSmartOffset?.(Number(e.target.value || 0))
                      }
                      placeholder="5"
                      title="Remaining games"
                    />
                  </div>

                  <div>
                    <label
                      className="muted small"
                      style={{
                        display: "block",
                        marginBottom: "0.35rem",
                        opacity: 0.85,
                      }}
                    >
                      Target
                    </label>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() =>
                        smartTarget != null &&
                        handleProtectedTargetChange(smartTarget)
                      }
                      disabled={smartTarget == null}
                      style={
                        smartTarget != null &&
                        Number(scheduledTarget) === Number(smartTarget)
                          ? {
                              border: "1px solid rgba(255, 90, 90, 0.55)",
                              background:
                                "linear-gradient(180deg, rgba(255,80,80,0.95), rgba(210,35,35,0.95))",
                              color: "#ffffff",
                              minWidth: "88px",
                            }
                          : { minWidth: "88px" }
                      }
                    >
                      {smartTarget ?? "-"}
                    </button>
                  </div>
                </div>

                <p
                  className="muted small"
                  style={{ marginTop: "0.15rem", lineHeight: 1.5 }}
                >
                  <strong>Remaining games</strong> sets how many more games above
                  the current highest <strong>P</strong> you want to aim for. The
                  system then finds the nearest reachable common target for all 3
                  teams.
                </p>

                {fixtureAdminError && (
                  <p className="error-text" style={{ marginTop: "0.35rem" }}>
                    {fixtureAdminError}
                  </p>
                )}
              </div>
            )}

            <div
              style={{
                maxHeight: "50vh",
                overflowY: "auto",
                marginTop: "0.5rem",
                paddingRight: "0.25rem",
              }}
            >
              {(scheduledFixtures || []).map((fixture, index) => {
                const done = !!fixture.completed;

                const hasScore =
                  done &&
                  fixture.goalsA !== null &&
                  fixture.goalsA !== undefined &&
                  fixture.goalsB !== null &&
                  fixture.goalsB !== undefined;

                return (
                  <div
                    key={`${fixture.id || `${fixture.teamAId}-${fixture.teamBId}`}-${index}`}
                    style={{
                      padding: "0.45rem 0",
                      fontWeight: done ? 400 : 700,
                      opacity: done ? 0.6 : 1,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {index + 1}. {fixture.teamALabel} vs {fixture.teamBLabel}
                    {hasScore ? ` (${fixture.goalsA}-${fixture.goalsB})` : ""}
                  </div>
                );
              })}
            </div>

            <div className="actions-row">
              <button
                className="secondary-btn"
                onClick={() => setShowFixturesModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}