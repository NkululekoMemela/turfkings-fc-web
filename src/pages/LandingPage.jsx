// src/pages/LandingPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getTeamById } from "../core/teams.js";
import TurfKingsLogo from "../assets/TurfKings_logo.jpeg";
import TeamPhoto from "../assets/TurfKings.jpg";

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
  streaks, // kept for future use
  hasLiveMatch,
  onUpdatePairing,
  onStartMatch,
  onGoToStats,
  onOpenBackupModal,
  onOpenEndSeasonModal,
  onGoToLiveAsSpectator,
  onGoToFormations,
  onGoToNews,
  onGoToEntryDev,
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

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth <= 480);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
    ribbonText = `Next: ${teamA.label} vs ${teamB.label}  \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0  Standby: ${standbyTeam.label}`;
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

      ribbonText += `  \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 • Last: ${lastA.label} ${lastResult.goalsA}-${lastResult.goalsB} ${lastB.label} (${status})`;
    }
  } else if (ribbonText) {
    ribbonText +=
      "  \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 • No results yet – first game incoming!";
  }

  const requestPairChange = (candidateMatch) => {
    if (!canStartMatch) return;
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

  return (
    <div className="page landing-page">
      <header className="header">
        <div className="header-title">
          <img src={TurfKingsLogo} alt="Turf Kings logo" className="tk-logo" />
          <h1>Turf Kings 5-A-Side</h1>
        </div>

        <p className="subtitle">Grand Central (CT) – Wednesdays, 17:30–19:00</p>

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

      <section className="card">
        <h2>Upcoming Match #{currentMatchNo}</h2>

        <div className="match-setup-row">
          <div className="team-select">
            <label>On-field Team 1</label>
            <select
              value={teamAId || ""}
              onChange={handleTeamAChange}
              disabled={!canSeeCaptainStyleControls}
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
              disabled={!canSeeCaptainStyleControls}
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
        <img src={TeamPhoto} alt="Turf Kings team" className="team-photo" />
      </section>

      <section className="card website-card">
        <div className="website-links">
          <a
            href="https://nkululeko-memela0205.github.io/packetcodeofficial.github.io/"
            target="_blank"
            rel="noreferrer"
            className="website-btn"
          >
            🌍 Visit Our Website
          </a>

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
    </div>
  );
}