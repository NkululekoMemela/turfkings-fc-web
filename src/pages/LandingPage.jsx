// src/pages/LandingPage.jsx

import React, { useEffect, useState } from "react";
import { getTeamById } from "../core/teams.js";
import TurfKingsLogo from "../assets/TurfKings_logo.jpg";
import TeamPhoto from "../assets/TurfKings.jpg";

// 🔥 Firebase auth
import { auth, signInWithGoogle, logOut } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { isCaptainEmail } from "../core/captainAuth.js"; // captain email guard

const CAPTAIN_CODES = ["11", "22", "3333"]; // any captain can approve pairing override

export function LandingPage({
  teams,
  currentMatchNo,
  currentMatch,
  results,
  streaks, // currently unused but kept for future
  hasLiveMatch,
  onUpdatePairing,
  onStartMatch,
  onGoToStats,
  onGoToSquads,
  onOpenBackupModal,
  onGoToLiveAsSpectator, // for viewers
  onGoToFormations, // formations page (now also where you manage squads)
  onGoToNews, // 🔥 NEW: News & Highlights
}) {
  const { teamAId, teamBId, standbyId } = currentMatch;

  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pendingMatch, setPendingMatch] = useState(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState("");

  // 🔍 detect mobile for shorter option labels
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 🔐 Firebase auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsub();
  }, []);

  // ✅ Only these emails are allowed to actually be captains
  const userEmail = currentUser?.email || "";
  const canBeCaptain = currentUser && isCaptainEmail(userEmail);
  const isCaptain = !!canBeCaptain;

  const handleSignInClick = async () => {
    try {
      setAuthError("");
      await signInWithGoogle();
    } catch (err) {
      console.error("Sign-in failed:", err);
      setAuthError("Could not sign in. Please try again.");
    }
  };

  const handleSignOutClick = async () => {
    try {
      setAuthError("");
      await logOut();
    } catch (err) {
      console.error("Sign-out failed:", err);
      setAuthError("Could not sign out. Please try again.");
    }
  };

  const teamA = getTeamById(teams, teamAId);
  const teamB = getTeamById(teams, teamBId);
  const standbyTeam = getTeamById(teams, standbyId);

  const matchesPlayed = results.length;
  const lastResult = matchesPlayed > 0 ? results[matchesPlayed - 1] : null;

  // ---------- Ribbon text ----------
  let ribbonText = `Next: ${teamA.label} vs ${teamB.label}  \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0  Standby: ${standbyTeam.label}`;

  if (lastResult) {
    const lastA = getTeamById(teams, lastResult.teamAId);
    const lastB = getTeamById(teams, lastResult.teamBId);
    const status =
      lastResult.isDraw && !lastResult.winnerId
        ? "draw"
        : `won by ${
            lastResult.winnerId === lastA.id ? lastA.label : lastB.label
          }`;

    ribbonText += `  \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 • Last: ${lastA.label} ${lastResult.goalsA}-${lastResult.goalsB} ${lastB.label} (${status})`;
  } else {
    ribbonText +=
      "  \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 •  No results yet – first game incoming!";
  }

  // ---------- pairing override ----------
  const requestPairChange = (candidateMatch) => {
    setPendingMatch(candidateMatch);
    setPairingCode("");
    setPairingError("");
    setShowPairingModal(true);
  };

  const handleTeamAChange = (e) => {
    if (!isCaptain) return;
    const newA = e.target.value;
    if (newA === teamAId) return;

    const allowedForB = teams.filter((t) => t.id !== newA);
    const newB = allowedForB.some((t) => t.id === teamBId)
      ? teamBId
      : allowedForB[0].id;
    const newStandby =
      teams.find((t) => t.id !== newA && t.id !== newB)?.id || standbyId;

    requestPairChange({
      teamAId: newA,
      teamBId: newB,
      standbyId: newStandby,
    });
  };

  const handleTeamBChange = (e) => {
    if (!isCaptain) return;
    const newB = e.target.value;
    if (newB === teamBId) return;

    const allowedForA = teams.filter((t) => t.id !== newB);
    const newA = allowedForA.some((t) => t.id === teamAId)
      ? teamAId
      : allowedForA[0].id;
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

  // dropdown options (no same team both sides)
  const optionsForTeamA = teams.filter((t) => t.id !== teamBId);
  const optionsForTeamB = teams.filter((t) => t.id !== teamAId);

  const renderOptionLabel = (team) =>
    isMobile ? team.label : `${team.label} (c: ${team.captain})`;

  // spectator live button behaviour – always go to spectator page
  const handleSpectatorLiveClick = () => {
    onGoToLiveAsSpectator();
  };

  return (
    <div className="page landing-page">
      <header className="header">
        <div className="header-title">
          <img src={TurfKingsLogo} alt="Turf Kings logo" className="tk-logo" />
          <h1>Turf Kings 5-A-Side</h1>
        </div>
        <p className="subtitle">Grand Central – 17:30–19:00</p>

        {/* 🔐 Auth block */}
        <div className="header-top-row">
          <div className="auth-status">
            {currentUser ? (
              <>
                <span className="auth-text">
                  Signed in as{" "}
                  <strong>
                    {currentUser.displayName || currentUser.email}
                  </strong>{" "}
                  {isCaptain ? "(captain)" : "(spectator)"}
                </span>
                {!isCaptain && (
                  <p className="muted small">
                    This account is not registered as a TurfKings captain –
                    match control is locked.
                  </p>
                )}
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={handleSignOutClick}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <span className="auth-text">
                  You&apos;re in <strong>spectator mode</strong>
                </span>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={handleSignInClick}
                >
                  Sign in (captains use their email)
                </button>
              </>
            )}
          </div>
        </div>

        {authError && <p className="error-text">{authError}</p>}
      </header>

      <section className="card">
        <h2>Upcoming Match #{currentMatchNo}</h2>

        <div className="match-setup-row">
          <div className="team-select">
            <label>On-field Team 1</label>
            <select
              value={teamAId}
              onChange={handleTeamAChange}
              disabled={!isCaptain}
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
              value={teamBId}
              onChange={handleTeamBChange}
              disabled={!isCaptain}
            >
              {optionsForTeamB.map((team) => (
                <option key={team.id} value={team.id}>
                  {renderOptionLabel(team)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="standby-label">
          Standby Team:{" "}
          <strong>
            {standbyTeam.label} (c: {standbyTeam.captain})
          </strong>
        </p>

        {/* 🔁 Buttons: captain vs spectator */}
        {isCaptain ? (
          <div className="actions-row landing-actions">
            <button className="primary-btn" onClick={onStartMatch}>
            ⚽ Start Match
            </button>
            <button
              className="secondary-btn"
              onClick={() => onGoToStats()}
              type="button"
            >
              📊 View Stats
            </button>
            {/* 🔥 Replaced "Manage Squads" with News & Highlights */}
            <button
              className="secondary-btn"
              type="button"
              onClick={onGoToNews}
            >
              📝 News &amp; Highlights
            </button>
            <button className="secondary-btn" onClick={onOpenBackupModal}>
              Save / Clear Data
            </button>
          </div>
        ) : (
          <>
            <p className="muted">
              You can follow the live game, see stats and view squads, but only
              registered captains can control the match or change squads.
            </p>
            <div className="actions-row landing-actions">
              <button
                className="primary-btn"
                type="button"
                onClick={handleSpectatorLiveClick}
              >
                {hasLiveMatch ? "⚽ View Live Match" : "⚽ Live Match (waiting…)"}
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => onGoToStats()}
              >
                📊 View Stats
              </button>
              {/* 🔥 Spectators also get News & Highlights instead of "View Squads" */}
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

      {/* Ribbon stays here, above the team photo */}
      <section className="ticker">
        <div className="ticker-inner">
          <span>{ribbonText}</span>
        </div>
      </section>

      {/* Team photo */}
      <section className="card team-photo-card">
        <img src={TeamPhoto} alt="Turf Kings team" className="team-photo" />
      </section>

      {/* Website + formations links */}
      <section className="card website-card">
        <div className="website-links">
          <button
            type="button"
            className="website-btn"
            onClick={onGoToFormations}
          >
            🧩 Lineups &amp; Formations
          </button>

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
