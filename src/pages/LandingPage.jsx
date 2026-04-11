import React, { useEffect, useMemo, useRef, useState } from "react";
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

const headerMenuPanelStyle = {
  marginTop: "0.4rem",
  padding: "0.15rem 0 0.2rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.22rem",
};

const headerMenuTextStyle = {
  background: "transparent",
  border: "none",
  padding: "0.1rem 0",
  margin: 0,
  color: "rgba(255,255,255,0.9)",
  fontSize: "0.84rem",
  fontWeight: 500,
  lineHeight: 1.2,
  textAlign: "left",
  cursor: "pointer",
};

function getIdentityRole(identity) {
  const role = String(
    identity?.actingRole || identity?.role || "spectator"
  )
    .trim()
    .toLowerCase();

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

function tileButtonStyle(isMobile, extra = {}) {
  return {
    borderRadius: "1rem",
    aspectRatio: isMobile ? "1 / 1" : "auto",
    minHeight: isMobile ? "138px" : "64px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 700,
    whiteSpace: "normal",
    lineHeight: 1.15,
    padding: isMobile ? "0.85rem" : "0.85rem 1rem",
    boxSizing: "border-box",
    overflow: "hidden",
    ...extra,
  };
}

function renderTileContent({ isMobile, icon, desktopLines, mobileLines }) {
  const lines = isMobile ? mobileLines : desktopLines;

  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: isMobile ? "0.38rem" : "0.12rem",
        lineHeight: 1.1,
        fontWeight: 700,
        width: "100%",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: isMobile ? "1.2rem" : "1rem" }}>{icon}</span>
      {lines.map((line) => (
        <span
          key={line}
          style={{
            display: "block",
            width: "100%",
            fontSize: isMobile ? "0.94rem" : "0.98rem",
            overflowWrap: "anywhere",
          }}
        >
          {line}
        </span>
      ))}
    </span>
  );
}

export function LandingPage({
  teams,
  currentMatchNo,
  currentMatch,
  results,
  streaks,
  hasLiveMatch,
  gameFormat = "5_V_5",
  matchMode = "round_robin",
  scheduledTarget = null,
  scheduledFixtures = [],
  smartOffset = 5,
  smartTarget = null,
  onUpdatePairing,
  onStartMatch,
  onSetGameFormat,
  onForceSetGameFormat,
  formatSwitchLocked = false,
  onSetMatchMode,
  onGenerateScheduledPlan,
  onUpdateSmartOffset,
  onGoToStats,
  onOpenBackupModal,
  onOpenEndSeasonModal,
  onGoToLiveAsSpectator,
  onGoToFormations,
  onGoToNews,
  onOpenHighlightsCamera,
  onGoToEntryDev,
  onGoToPayments,
  identity,
  activeRole,
  isAdmin = false,
  isCaptain = false,
  isPlayer = false,
  isSpectator = false,
  canStartMatch = false,
  hasRecordedMatchDayState = false,
}) {
  const { teamAId, teamBId, standbyId } = currentMatch || {};

  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pendingMatch, setPendingMatch] = useState(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState("");

  const [showFormatModal, setShowFormatModal] = useState(false);
  const [pendingGameFormat, setPendingGameFormat] = useState(null);
  const [formatCode, setFormatCode] = useState("");
  const [formatError, setFormatError] = useState("");

  const [showFixturesModal, setShowFixturesModal] = useState(false);
  const [fixtureAdminCode, setFixtureAdminCode] = useState("");
  const [fixtureAdminError, setFixtureAdminError] = useState("");
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const menuRef = useRef(null);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target)) {
        setShowHeaderMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const roleLabel = useMemo(() => {
    if (resolvedRole === "admin") return "admin";
    if (resolvedRole === "captain") return "captain";
    if (resolvedRole === "player") return "player";
    return "spectator";
  }, [resolvedRole]);

  const isThreeTeamLeague = gameFormat === "3_TEAM_LEAGUE";
  const isFiveVFive = gameFormat !== "3_TEAM_LEAGUE";
  const fixturedMode = isThreeTeamLeague && matchMode === "scheduled_target";

  let ribbonText = "";
  if (isThreeTeamLeague && teamA && teamB && standbyTeam) {
    ribbonText = `Next: ${teamA.label} vs ${teamB.label}       Standby: ${standbyTeam.label}`;
  } else if (isFiveVFive) {
    ribbonText = "Normal 5 v 5 mode is active";
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

    if (isThreeTeamLeague && matchMode === "scheduled_target") {
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
  const formatHasLiveRisk = Boolean(hasLiveMatch || hasRecordedMatchDayState);
  const isFormatLocked = formatSwitchLocked || formatHasLiveRisk;

  const formatOptions = [
    { value: "5_V_5", label: "Normal 5 v 5" },
    { value: "3_TEAM_LEAGUE", label: "3 Team League" },
  ];

  const requestGameFormatChange = (nextFormat) => {
    if (!canSeeCaptainStyleControls) return;
    if (!nextFormat || nextFormat === gameFormat) return;

    setPendingGameFormat(nextFormat);
    setFormatCode("");
    setFormatError("");
    setShowFormatModal(true);
  };

  const cancelGameFormatChange = () => {
    setShowFormatModal(false);
    setPendingGameFormat(null);
    setFormatCode("");
    setFormatError("");
  };

  const confirmGameFormatChange = () => {
    if (!pendingGameFormat) return;

    if (!CAPTAIN_CODES.includes(formatCode.trim())) {
      setFormatError("Invalid captain code.");
      return;
    }

    if (isFormatLocked) {
      onForceSetGameFormat?.(pendingGameFormat);
    } else {
      onSetGameFormat?.(pendingGameFormat);
    }
    cancelGameFormatChange();
  };

  const handleProtectedTargetChange = (target) => {
    if (!isAdmin) return;

    if (fixtureAdminCode.trim() !== "3333") {
      setFixtureAdminError("Invalid admin code.");
      return;
    }

    setFixtureAdminError("");
    onGenerateScheduledPlan?.(target);
  };

  const closeHeaderMenu = () => setShowHeaderMenu(false);

  const menuItems = [
    {
      label: "Change Profile",
      onClick: () => onGoToEntryDev?.(),
      show: true,
    },
    {
      label: "End Season",
      onClick: () => onOpenEndSeasonModal?.(),
      show: isAdmin && typeof onOpenEndSeasonModal === "function",
    },
    {
      label: "End Match Day",
      onClick: () => onOpenBackupModal?.(),
      show: isAdmin,
    },
  ].filter((item) => item.show);

  return (
    <div className="page landing-page">
      <div
        className={`landing-header-sticky ${
          headerScrolled ? "is-scrolled" : ""
        }`}
      >
        <header className="header">
          <div className="header-title">
            <div
              ref={menuRef}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <img
                  src={TurfKingsLogo}
                  alt="Turf Kings logo"
                  className="tk-logo"
                />
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ margin: 0 }}>Turf Kings 5-A-Side</h1>

                  {showHeaderMenu && menuItems.length > 0 && (
                    <div style={headerMenuPanelStyle}>
                      {menuItems.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            item.onClick?.();
                            closeHeaderMenu();
                          }}
                          style={headerMenuTextStyle}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flexShrink: 0, alignSelf: "flex-start" }}>
                <button
                  type="button"
                  className="menu-btn"
                  aria-label="Open navigation menu"
                  onClick={() => setShowHeaderMenu((prev) => !prev)}
                >
                  ☰
                </button>
              </div>
            </div>
          </div>

          <div
            className="landing-header-divider"
            style={{ marginTop: showHeaderMenu ? "0.45rem" : undefined }}
          />
        </header>
      </div>

      <header className="header" style={{ marginTop: "0.75rem" }}>
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
        </div>
      </header>

      <section className="card landing-first-card">
        {canSeeCaptainStyleControls && (
          <div style={{ marginBottom: "0.9rem", display: "grid", gap: "0.75rem" }}>
            <div>
              <div
                className="muted small"
                style={{ marginBottom: "0.35rem", fontWeight: 700 }}
              >
                Game format
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  gap: "4px",
                  flexWrap: "wrap",
                }}
              >
                {formatOptions.map((option) => {
                  const active = gameFormat === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        if (isFormatLocked) return;
                        requestGameFormatChange(option.value);
                      }}
                      disabled={isFormatLocked}
                      style={{
                        borderRadius: "999px",
                        padding: "0.45rem 0.9rem",
                        color: "#ffffff",
                        border: active
                          ? "1px solid rgba(34, 211, 238, 0.55)"
                          : "1px solid transparent",
                        background: active
                          ? "linear-gradient(180deg, rgba(8,145,178,0.98), rgba(37,99,235,0.96))"
                          : "transparent",
                        boxShadow: active
                          ? "0 0 18px rgba(34,211,238,0.28)"
                          : "none",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <p className="muted small" style={{ marginTop: "0.45rem" }}>
                {isFormatLocked && (
                  <span style={{ color: "#f87171", fontWeight: 600 }}>
                    🔒 Format locked for this match day.
                  </span>
                )}
                {isFormatLocked ? <br /> : null}
                {formatHasLiveRisk
                  ? " Match day data already exists, so switching format should only be done deliberately."
                  : " "}
              </p>

              {isFormatLocked && canSeeCaptainStyleControls && (
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() =>
                    requestGameFormatChange(
                      gameFormat === "5_V_5" ? "3_TEAM_LEAGUE" : "5_V_5"
                    )
                  }
                >
                  🔑 Override Format Lock
                </button>
              )}
            </div>

            {isThreeTeamLeague && (
              <div>
                <div
                  className="muted small"
                  style={{ marginBottom: "0.35rem", fontWeight: 700 }}
                >
                  League mode
                </div>
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
                        ? "1px solid rgba(255, 90, 90, 0.55)"
                        : "1px solid transparent",
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
          </div>
        )}

        <h2>{isThreeTeamLeague ? `Upcoming Match #${currentMatchNo}` : "Upcoming 5 v 5 Match"}</h2>

        {isFiveVFive && (
          <p className="muted small" style={{ marginTop: "-0.25rem", marginBottom: "0.9rem" }}>
            Normal 5 v 5 is active. Squads and live match flow should follow the 5 v 5 format.
          </p>
        )}

        {isThreeTeamLeague && fixturedMode && canSeeCaptainStyleControls && (
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
              Common target:{" "}
              <strong>{scheduledTarget ?? smartTarget ?? "-"}</strong>
            </div>
          </div>
        )}

        {isThreeTeamLeague && (
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
        )}

        {isThreeTeamLeague && standbyTeam && (
          <p className="standby-label">
            Standby Team:{" "}
            <strong>
              {standbyTeam.label} (c: {standbyTeam.captain})
            </strong>
          </p>
        )}

        {isThreeTeamLeague && fixturedMode && (
          <p className="muted small" style={{ marginTop: "-0.1rem" }}>
            Pairing override is locked while Fixtured mode is active.
          </p>
        )}

        {canSeeCaptainStyleControls ? (
          <div
            className="actions-row landing-actions"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.8rem",
              alignItems: "stretch",
            }}
          >
            <button
              className="primary-btn"
              style={tileButtonStyle(isMobile, activePrimaryStyle)}
              onClick={handleStartMatchClick}
              type="button"
            >
              {renderTileContent({
                isMobile,
                icon: "⚽",
                desktopLines: ["Start Match"],
                mobileLines: ["Start", "Match"],
              })}
            </button>

            <button
              className="secondary-btn"
              onClick={() => onGoToStats()}
              type="button"
              style={tileButtonStyle(isMobile)}
            >
              {renderTileContent({
                isMobile,
                icon: "📊",
                desktopLines: ["View Stats"],
                mobileLines: ["View", "Stats"],
              })}
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={onGoToFormations}
              style={tileButtonStyle(isMobile)}
            >
              {renderTileContent({
                isMobile,
                icon: "🧩",
                desktopLines: ["Lineups &", "Formations"],
                mobileLines: ["Lineups &", "Formations"],
              })}
            </button>

            <button
              className="secondary-btn"
              type="button"
              onClick={onGoToNews}
              style={tileButtonStyle(isMobile)}
            >
              {renderTileContent({
                isMobile,
                icon: "📝",
                desktopLines: ["News &", "Highlights"],
                mobileLines: ["News &", "Highlights"],
              })}
            </button>

            <button
              type="button"
              onClick={() => onOpenHighlightsCamera?.()}
              style={{
                ...tileButtonStyle(isMobile, {
                  background:
                    "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.08), transparent 60%), linear-gradient(145deg, rgba(8,15,35,0.98), rgba(3,8,23,0.98))",
                  border: "1px solid rgba(148,163,184,0.22)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(255,255,255,0.03), 0 0 20px rgba(59,130,246,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }),
              }}
            >
              <span
                style={{
                  position: "relative",
                  width: isMobile ? "84px" : "68px",
                  height: isMobile ? "84px" : "68px",
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 50% 50%, #C9D6E8 0%, #AAB8CE 38%, #8E9CB7 68%, #C5D0E2 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    "0 0 0 2px rgba(255,255,255,0.05), inset 0 1px 2px rgba(255,255,255,0.35), 0 8px 22px rgba(0,0,0,0.35)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    width: "88%",
                    height: "88%",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 50% 50%, #6F86C7 0%, #5371BA 32%, #2B467D 58%, #9FC1DD 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow:
                      "inset 0 0 8px rgba(255,255,255,0.22), 0 0 12px rgba(59,130,246,0.18)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      width: "64%",
                      height: "64%",
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle at 35% 35%, #2B3654 0%, #1B2238 38%, #0E1321 70%, #05070D 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow:
                        "inset 0 0 10px rgba(255,255,255,0.08), inset 0 -4px 10px rgba(0,0,0,0.35)",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        width: "18%",
                        height: "18%",
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.82)",
                        top: "26%",
                        left: "28%",
                        boxShadow: "0 0 6px rgba(255,255,255,0.28)",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        width: "10%",
                        height: "10%",
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.45)",
                        top: "42%",
                        left: "46%",
                      }}
                    />
                    <span
                      style={{
                        width: "18%",
                        height: "18%",
                        borderRadius: "50%",
                        background:
                          "radial-gradient(circle at 40% 40%, #64748B 0%, #3B425A 60%, #1C2233 100%)",
                        opacity: 0.95,
                      }}
                    />
                  </span>
                </span>
              </span>
            </button>

            {isAdmin && (
              <button
                className="secondary-btn"
                onClick={onOpenBackupModal}
                type="button"
                style={tileButtonStyle(isMobile)}
              >
                {renderTileContent({
                  isMobile,
                  icon: "🏁",
                  desktopLines: ["End Match Day"],
                  mobileLines: ["End Match", "Day"],
                })}
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

            <div
              className="actions-row landing-actions"
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.8rem",
                alignItems: "stretch",
              }}
            >
              <button
                className="primary-btn"
                style={tileButtonStyle(isMobile, activePrimaryStyle)}
                type="button"
                onClick={handleSpectatorLiveClick}
              >
                {renderTileContent({
                  isMobile,
                  icon: "⚽",
                  desktopLines: [hasLiveMatch ? "View Live Match" : "Live Match"],
                  mobileLines: ["Live", "Match"],
                })}
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={() => onGoToStats()}
                style={tileButtonStyle(isMobile)}
              >
                {renderTileContent({
                  isMobile,
                  icon: "📊",
                  desktopLines: ["View Stats"],
                  mobileLines: ["View", "Stats"],
                })}
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={onGoToFormations}
                style={tileButtonStyle(isMobile)}
              >
                {renderTileContent({
                  isMobile,
                  icon: "🧩",
                  desktopLines: ["Lineups &", "Formations"],
                  mobileLines: ["Lineups &", "Formations"],
                })}
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={onGoToNews}
                style={tileButtonStyle(isMobile)}
              >
                {renderTileContent({
                  isMobile,
                  icon: "📝",
                  desktopLines: ["News &", "Highlights"],
                  mobileLines: ["News &", "Highlights"],
                })}
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={() => onOpenHighlightsCamera?.()}
                style={tileButtonStyle(isMobile)}
              >
                {renderTileContent({
                  isMobile,
                  icon: "🎥",
                  desktopLines: ["Highlights", "Camera"],
                  mobileLines: ["Highlights", "Camera"],
                })}
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

      <section
        className="card team-photo-card"
        style={{
          width: "100%",
          borderRadius: "1.25rem",
          overflow: "hidden",
          aspectRatio: isMobile ? "4 / 3" : "3 / 2",
          minHeight: isMobile ? "260px" : "420px",
          position: "relative",
          border: "1px solid rgba(255,255,255,0.08)",
          background:
            "radial-gradient(circle at top right, rgba(34,197,94,0.10), transparent 35%), linear-gradient(145deg, rgba(15,23,42,0.92), rgba(2,6,23,0.90))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          boxSizing: "border-box",
        }}
      >
        <img
          src={teamPhotos[photoIndex]}
          alt={`Turf Kings team ${photoIndex + 1}`}
          className="team-photo"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center center",
            display: "block",
            opacity: 0.96,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.12))",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-start",
            padding: "0.8rem",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "0.35rem",
              alignItems: "center",
              padding: "0.4rem 0.6rem",
              borderRadius: "999px",
              background: "rgba(2,6,23,0.55)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(6px)",
            }}
          >
            {teamPhotos.map((_, idx) => (
              <span
                key={`photo-dot-${idx}`}
                style={{
                  width: idx === photoIndex ? 20 : 6,
                  height: 6,
                  borderRadius: "999px",
                  background:
                    idx === photoIndex
                      ? "linear-gradient(90deg, #22d3ee, #22c55e)"
                      : "rgba(255,255,255,0.35)",
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>
        </div>
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

      {showFormatModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm Format Change</h3>
            <p>
              Switch to{" "}
              <strong>
                {pendingGameFormat === "3_TEAM_LEAGUE"
                  ? "3 Team League"
                  : "Normal 5 v 5"}
              </strong>
              ?
            </p>
            <p className="muted small" style={{ marginTop: "-0.1rem" }}>
              {formatHasLiveRisk
                ? "This match day already has live or recorded data. Only continue if you are certain."
                : "This is a protected captain setting."}
            </p>

            <div className="field-row">
              <label>Captain code</label>
              <input
                type="password"
                className="text-input"
                value={formatCode}
                onChange={(e) => {
                  setFormatCode(e.target.value);
                  setFormatError("");
                }}
              />
              {formatError && <p className="error-text">{formatError}</p>}
            </div>

            <div className="actions-row">
              <button
                className="secondary-btn"
                onClick={cancelGameFormatChange}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                onClick={confirmGameFormatChange}
              >
                Confirm change
              </button>
            </div>
          </div>
        </div>
      )}

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
              Common target:{" "}
              <strong>{scheduledTarget ?? smartTarget ?? "-"}</strong>
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
                  <strong>Remaining games</strong> sets how many more games
                  above the current highest <strong>P</strong> you want to aim
                  for. The system then finds the nearest reachable common target
                  for all 3 teams.
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
                    key={`${
                      fixture.id || `${fixture.teamAId}-${fixture.teamBId}`
                    }-${index}`}
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