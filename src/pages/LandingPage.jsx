// src/pages/LandingPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTeamById } from "../core/teams.js";
import TurfKingsLogo from "../assets/TurfKings_logo.jpeg";
import TeamPhoto1 from "../assets/TurfKings.jpg";
import TeamPhoto2 from "../assets/TurfKings2.jpeg";
import TeamPhoto3 from "../assets/TurfKings3.jpeg";

import { auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

import {
  GAME_FORMAT,
  GAME_FORMAT_OPTIONS,
  MATCH_MODE,
  MATCH_MODE_OPTIONS,
  normalizeGameFormat,
  normalizeMatchMode,
} from "../core/matchConfig.js";

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
    aspectRatio: "1 / 1",
    minHeight: isMobile ? "138px" : "138px",
    maxHeight: isMobile ? "none" : "150px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 700,
    whiteSpace: "normal",
    lineHeight: 1.15,
    padding: isMobile ? "0.85rem" : "0.9rem",
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

function renderPublicImageIcon({
  src,
  alt = "",
  isMobile,
  mobileSize = 32,
  desktopSize = 30,
  glow = true,
}) {
  const size = isMobile ? mobileSize : desktopSize;

  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        filter: glow ? "drop-shadow(0 0 7px rgba(56,189,248,0.45))" : "none",
      }}
      draggable="false"
    />
  );
}

export function LandingPage({
  teams,
  currentMatchNo,
  currentMatch,
  results,
  streaks,
  hasLiveMatch,
  matchType = null,
  gameFormat = "5_V_5",
  leagueMode = null,
  matchMode = "round_robin",
  scheduledTarget = null,
  scheduledFixtures = [],
  smartOffset = 5,
  smartTarget = null,
  onUpdatePairing,
  onStartMatch,
  onSetMatchType,
  onSetGameFormat,
  onForceSetGameFormat,
  formatSwitchLocked = false,
  onSetLeagueMode,
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
  onGoToHighlights,
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
  const [fixtureTargetDraft, setFixtureTargetDraft] = useState(
    scheduledTarget ?? smartTarget ?? ""
  );
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
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

  useEffect(() => {
    if (!showFixturesModal) return;
    setFixtureTargetDraft(scheduledTarget ?? smartTarget ?? "");
  }, [showFixturesModal, scheduledTarget, smartTarget]);

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

  const resolvedMatchType = normalizeMatchMode(
    matchType || (gameFormat === "3_TEAM_LEAGUE" ? MATCH_MODE.LEAGUE : MATCH_MODE.FRIENDLY)
  );
  const resolvedGameFormat = normalizeGameFormat(gameFormat);
  const resolvedLeagueMode = leagueMode || matchMode || "round_robin";

  const isThreeTeamLeague = resolvedMatchType === MATCH_MODE.LEAGUE;
  const isFriendlyMatch = resolvedMatchType === MATCH_MODE.FRIENDLY;
  const isFiveVFive = resolvedGameFormat === GAME_FORMAT.FIVE_V_FIVE;
  const activeGameFormatOption =
    GAME_FORMAT_OPTIONS.find((option) => option.value === resolvedGameFormat) ||
    GAME_FORMAT_OPTIONS[0];
  const activeGameFormatLabel = activeGameFormatOption?.label || "5 v 5";
  const fixturedMode =
    isThreeTeamLeague && resolvedLeagueMode === "scheduled_target";

  const modeLipLabel = isThreeTeamLeague ? "LEAGUE MODE" : "FRIENDLY MODE";
  const modeLipDotColor = isThreeTeamLeague ? "#facc15" : "#38bdf8";

  let ribbonText = "";
  if (isThreeTeamLeague && teamA && teamB && standbyTeam) {
    ribbonText = `League ${activeGameFormatLabel} • Next: ${teamA.label} vs ${teamB.label}       Standby: ${standbyTeam.label}`;
  } else if (isFriendlyMatch) {
    ribbonText = `Friendly ${activeGameFormatLabel} mode is active`;
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

    if (isThreeTeamLeague && resolvedLeagueMode === "scheduled_target") {
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

  const requestProtectedFormatChange = (change) => {
    if (!canSeeCaptainStyleControls) return;
    if (!change?.kind || !change?.value) return;

    const currentValue =
      change.kind === "matchType"
        ? resolvedMatchType
        : change.kind === "gameFormat"
          ? resolvedGameFormat
          : resolvedLeagueMode;

    if (change.value === currentValue) return;

    setPendingGameFormat(change);
    setFormatCode("");
    setFormatError("");
    setShowFormatModal(true);
  };

  const requestMatchTypeChange = (nextMatchType) => {
    requestProtectedFormatChange({
      kind: "matchType",
      value: normalizeMatchMode(nextMatchType),
    });
  };

  const requestGameFormatChange = (nextFormat) => {
    requestProtectedFormatChange({
      kind: "gameFormat",
      value: normalizeGameFormat(nextFormat),
    });
  };

  const requestLeagueModeChange = (nextLeagueMode) => {
    requestProtectedFormatChange({
      kind: "leagueMode",
      value: nextLeagueMode === "scheduled_target" ? "scheduled_target" : "round_robin",
    });
  };

  const cancelGameFormatChange = () => {
    setShowFormatModal(false);
    setPendingGameFormat(null);
    setFormatCode("");
    setFormatError("");
  };

  const applyPendingProtectedChange = (change) => {
    if (!change?.kind || !change?.value) return;

    if (change.kind === "matchType") {
      if (typeof onSetMatchType === "function") {
        onSetMatchType(change.value);
        return;
      }

      // Legacy fallback while App.jsx is still being migrated:
      // Friendly is represented by the selected game format; League by 3_TEAM_LEAGUE.
      if (change.value === MATCH_MODE.LEAGUE) {
        onSetGameFormat?.("3_TEAM_LEAGUE");
      } else {
        onSetGameFormat?.(resolvedGameFormat || GAME_FORMAT.FIVE_V_FIVE);
      }
      return;
    }

    if (change.kind === "gameFormat") {
      if (isFormatLocked && typeof onForceSetGameFormat === "function") {
        onForceSetGameFormat(change.value);
      } else {
        onSetGameFormat?.(change.value);
      }
      return;
    }

    if (change.kind === "leagueMode") {
      if (typeof onSetLeagueMode === "function") {
        onSetLeagueMode(change.value);
      } else {
        onSetMatchMode?.(change.value);
      }
    }
  };

  const confirmGameFormatChange = () => {
    if (!pendingGameFormat) return;

    if (!CAPTAIN_CODES.includes(formatCode.trim())) {
      setFormatError("Invalid captain code.");
      return;
    }

    applyPendingProtectedChange(pendingGameFormat);
    cancelGameFormatChange();
  };

  const handleProtectedTargetChange = (target) => {
    if (!isAdmin) return;

    if (fixtureAdminCode.trim() !== "3333") {
      setFixtureAdminError("Invalid admin code.");
      return;
    }

    const numericTarget = Number(target);

    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setFixtureAdminError("Please choose a valid target.");
      return;
    }

    setFixtureAdminError("");
    onGenerateScheduledPlan?.(Math.round(numericTarget));
  };

  const closeHeaderMenu = () => setShowHeaderMenu(false);

  const isLeagueMatchType =
    String(matchType || "").trim().toUpperCase() === "LEAGUE";

  const menuItems = [
    {
      label: "Change Profile",
      onClick: () => onGoToEntryDev?.(),
      show: true,
    },
    {
      label: "End Season",
      onClick: () => onOpenEndSeasonModal?.(),
      show: isLeagueMatchType && isAdmin && typeof onOpenEndSeasonModal === "function",
    },
    {
      label: "End Match Day",
      onClick: () => onOpenBackupModal?.(),
      show: isLeagueMatchType && isAdmin,
    },
  ].filter((item) => item.show);

  return (
    <div className="page landing-page">
      <style>{`
        /*
          Pure SVG ribbon: no dim rectangular shell.
          The bright SVG wave is the only visible top-ribbon shape and is pulled
          to the page edge so it does not feel bulky or boxed-in.
        */
        .landing-page {
          padding-top: 0 !important;
        }

        .landing-header-sticky {
          overflow: visible;
          margin: -1rem -0.75rem 0.34rem -0.75rem;
          padding: 0 !important;
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        .landing-header-sticky > .landing-wave-header {
          position: relative;
          overflow: visible;
          height: 122px;
          min-height: 122px;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          isolation: isolate;
        }

        .tk-ribbon-wave-svg {
          position: absolute;
          top: -1px;
          left: 0;
          width: 100%;
          height: 123px;
          z-index: 0;
          overflow: visible;
          pointer-events: none;
          filter: drop-shadow(0 13px 22px rgba(2, 6, 23, 0.24));
        }

        .landing-wave-header .header-title,
        .landing-wave-header .landing-header-divider,
        .landing-wave-header .tk-match-mode-ribbon-lip {
          position: relative;
          z-index: 2;
        }

        .landing-wave-header .header-title {
          min-height: 76px;
          padding: 16px 12px 0 12px;
          box-sizing: border-box;
        }

        .landing-wave-header .landing-header-divider {
          display: none;
        }

        .tk-match-mode-ribbon-lip {
          position: absolute;
          left: 58px;
          bottom: -2px;
          z-index: 3;
          height: 17px;
          display: inline-flex;
          align-items: center;
          gap: 0.44rem;
          color: #f8fafc;
          font-size: 0.52rem;
          font-weight: 950;
          line-height: 1;
          letter-spacing: 0.075em;
          text-transform: uppercase;
          pointer-events: none;
          user-select: none;
          white-space: nowrap;
          text-shadow: 0 1px 9px rgba(2, 6, 23, 0.65);
        }

        .tk-match-mode-ribbon-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          flex: 0 0 auto;
          box-shadow: 0 0 10px currentColor;
        }

        @media (max-width: 480px) {
          .landing-header-sticky {
            margin: -1rem -0.75rem 0.28rem -0.75rem;
          }

          .landing-header-sticky > .landing-wave-header {
            height: 120px;
            min-height: 120px;
          }

          .tk-ribbon-wave-svg {
            top: -1px;
            height: 121px;
          }

          .landing-wave-header .header-title {
            min-height: 74px;
            padding: 14px 11px 0 11px;
          }

          .tk-match-mode-ribbon-lip {
            left: 56px;
            bottom: -2px;
            font-size: 0.50rem;
            letter-spacing: 0.065em;
            height: 16px;
          }
        }
      `}</style>
      <div
        className={`landing-header-sticky ${
          headerScrolled ? "is-scrolled" : ""
        }`}
      >
        <header className="landing-wave-header">
          <svg
            className="tk-ribbon-wave-svg"
            viewBox="0 0 390 122"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id="tkLandingRibbonWaveGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1d4ed8" />
                <stop offset="42%" stopColor="#071329" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <radialGradient id="tkLandingRibbonModeGlow" cx="22%" cy="86%" r="56%">
                <stop offset="0%" stopColor="rgba(34,211,238,0.34)" />
                <stop offset="58%" stopColor="rgba(34,211,238,0.08)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0)" />
              </radialGradient>
            </defs>

            <path
              d="
                M 0 0
                H 390
                V 86
                H 190
                C 171 86, 164 119, 144 119
                H 55
                C 43 119, 38 86, 28 86
                H 0
                Z
              "
              fill="url(#tkLandingRibbonWaveGradient)"
            />
            <path
              d="
                M 0 0
                H 390
                V 86
                H 190
                C 171 86, 164 119, 144 119
                H 55
                C 43 119, 38 86, 28 86
                H 0
                Z
              "
              fill="url(#tkLandingRibbonModeGlow)"
              opacity="0.9"
            />
            <path
              d="M 28 86 C 38 86, 43 119, 55 119 H 144 C 164 119, 171 86, 190 86"
              fill="none"
              stroke="rgba(34,211,238,0.35)"
              strokeWidth="1.2"
            />
          </svg>

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

          <div className="tk-match-mode-ribbon-lip" aria-label={modeLipLabel}>
            <span
              className="tk-match-mode-ribbon-dot"
              style={{ background: modeLipDotColor, color: modeLipDotColor }}
              aria-hidden="true"
            />
            {modeLipLabel}
          </div>
        </header>
      </div>

      <header className="header" style={{ marginTop: "0.25rem" }}>
        <p className="subtitle">
          Grand Central (CT) – Wednesdays, 17:30–19:00
        </p>

        <div className="header-top-row">
          <div className="auth-status">
            <span className="auth-text">
              Viewing as <strong>{identityName}</strong>
              <span className="muted small">
                {" "}• Role: <strong>{roleLabel}</strong>
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
          <div style={{ marginBottom: "0.9rem" }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setShowSettingsPanel((prev) => !prev)}
              aria-expanded={showSettingsPanel}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                borderRadius: "1rem",
                padding: "0.75rem 0.9rem",
                background:
                  "linear-gradient(145deg, rgba(15,23,42,0.92), rgba(2,6,23,0.92))",
                border: "1px solid rgba(148,163,184,0.18)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.16rem" }}>
                <span style={{ fontWeight: 850 }}>⚙️ Match Settings</span>
                <span className="muted small">
                  {isThreeTeamLeague
                    ? `League • ${fixturedMode ? "Fixtured" : "Round Robin"} • ${activeGameFormatLabel}`
                    : `Friendly • ${activeGameFormatLabel}`}
                </span>
              </span>
              <span
                aria-hidden="true"
                style={{
                  fontSize: "1rem",
                  transform: showSettingsPanel ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}
              >
                ▾
              </span>
            </button>

            {showSettingsPanel && (
              <div
                style={{
                  marginTop: "0.75rem",
                  display: "grid",
                  gap: "0.85rem",
                  padding: "0.85rem",
                  borderRadius: "1rem",
                  background: "rgba(15,23,42,0.40)",
                  border: "1px solid rgba(148,163,184,0.14)",
                }}
              >
            <div>
              <div
                className="muted small"
                style={{ marginBottom: "0.35rem", fontWeight: 700 }}
              >
                Match Type
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
                {MATCH_MODE_OPTIONS.map((option) => {
                  const active = resolvedMatchType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        if (isFormatLocked) return;
                        requestMatchTypeChange(option.value);
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
                  ? " Match day data already exists, so switching match type or format should only be done deliberately."
                  : " "}
              </p>

              {isFormatLocked && canSeeCaptainStyleControls && (
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() =>
                    requestMatchTypeChange(
                      resolvedMatchType === MATCH_MODE.LEAGUE
                        ? MATCH_MODE.FRIENDLY
                        : MATCH_MODE.LEAGUE
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
                  League Mode
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
                    onClick={() => requestLeagueModeChange("round_robin")}
                    style={{
                      borderRadius: "999px",
                      padding: "0.45rem 0.9rem",
                      color: "#ffffff",
                      border: !fixturedMode
                        ? "1px solid rgba(255, 90, 90, 0.55)"
                        : "1px solid transparent",
                      background: !fixturedMode
                        ? "linear-gradient(180deg, rgba(255,80,80,0.95), rgba(210,35,35,0.95))"
                        : "transparent",
                      boxShadow: !fixturedMode
                        ? "0 0 18px rgba(255,60,60,0.35)"
                        : "none",
                    }}
                  >
                    Round Robin
                  </button>

                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => requestLeagueModeChange("scheduled_target")}
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

            <div>
              <div
                className="muted small"
                style={{ marginBottom: "0.35rem", fontWeight: 700 }}
              >
                Game Format
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
                {GAME_FORMAT_OPTIONS.map((option) => {
                  const active = resolvedGameFormat === option.value;
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
                          ? "1px solid rgba(34, 197, 94, 0.55)"
                          : "1px solid transparent",
                        background: active
                          ? "linear-gradient(180deg, rgba(22,163,74,0.96), rgba(21,128,61,0.94))"
                          : "transparent",
                        boxShadow: active
                          ? "0 0 18px rgba(34,197,94,0.24)"
                          : "none",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
              </div>
            )}
          </div>
        )}

        <h2>
          {isThreeTeamLeague
            ? `Upcoming League ${activeGameFormatLabel} Match #${currentMatchNo}`
            : `Upcoming Friendly ${activeGameFormatLabel} Match`}
        </h2>


        {isFriendlyMatch && (
          <p
            className="muted small"
            style={{ marginTop: "-0.25rem", marginBottom: "0.9rem" }}
          >
            Friendly {activeGameFormatLabel} is active. Squads and live match flow should follow the {activeGameFormatLabel} format.
          </p>
        )}

        {isThreeTeamLeague && fixturedMode && (

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
              Season Target:{" "}
              <strong>{scheduledTarget ?? smartTarget ?? "-"}</strong> {" "}
              Matches
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

        {canStartMatch ? (
          <div
            className="actions-row landing-actions"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(auto-fit, minmax(150px, 165px))",
              justifyContent: "center",
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
                icon: (
                  <img
                    src="/strategy.png"
                    alt=""
                    style={{
                      width: isMobile ? 30 : 26,
                      height: isMobile ? 30 : 26,
                      objectFit: "contain",
                    }}
                    draggable="false"
                  />
                ),
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
                icon: (
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: isMobile ? "1.55rem" : "1.38rem",
                      lineHeight: 1,
                      filter: "drop-shadow(0 0 5px rgba(56,189,248,0.25))",
                    }}
                  >
                    📰
                  </span>
                ),
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

            <button
              type="button"
              className="secondary-btn"
              onClick={() => onGoToHighlights?.()}
              style={tileButtonStyle(isMobile)}
            >
              {renderTileContent({
                isMobile,
                icon: renderPublicImageIcon({
                  src: "/videotape.png",
                  alt: "",
                  isMobile,
                  mobileSize: 31,
                  desktopSize: 28,
                }),
                desktopLines: ["Video", "Highlights"],
                mobileLines: ["Video", "Highlights"],
              })}
            </button>

            {isLeagueMatchType && isAdmin && (
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

            {isLeagueMatchType && isAdmin && typeof onOpenEndSeasonModal === "function" && (
              <button
                className="secondary-btn"
                onClick={onOpenEndSeasonModal}
                type="button"
                style={tileButtonStyle(isMobile, {
                  border: "1px solid rgba(250,204,21,0.34)",
                  boxShadow: "0 0 18px rgba(250,204,21,0.10)",
                })}
              >
                {renderTileContent({
                  isMobile,
                  icon: "🏆",
                  desktopLines: ["End Season"],
                  mobileLines: ["End", "Season"],
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
                  : "repeat(auto-fit, minmax(150px, 165px))",
                justifyContent: "center",
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
                  icon: (
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: isMobile ? "1.55rem" : "1.38rem",
                      lineHeight: 1,
                      filter: "drop-shadow(0 0 5px rgba(56,189,248,0.25))",
                    }}
                  >
                    📰
                  </span>
                ),
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

              <button
                className="secondary-btn"
                type="button"
                onClick={() => onGoToHighlights?.()}
                style={tileButtonStyle(isMobile)}
              >
                {renderTileContent({
                  isMobile,
                  icon: renderPublicImageIcon({
                    src: "/videotape.png",
                    alt: "",
                    isMobile,
                    mobileSize: 31,
                    desktopSize: 28,
                  }),
                  desktopLines: ["Video", "Highlights"],
                  mobileLines: ["Video", "Highlights"],
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
            style={{
              minHeight: "54px",
              width: "100%",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "24px",
                  height: "24px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.25rem",
                  lineHeight: 1,
                  flex: "0 0 24px",
                }}
              >
                💳
              </span>
              <span>Pay for next month games</span>
            </span>
          </button>

          <a
            href="https://www.messivsronaldo.app/#google_vignette"
            target="_blank"
            rel="noreferrer"
            className="website-btn"
            style={{
              minHeight: "54px",
              width: "100%",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "24px",
                  height: "24px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.25rem",
                  lineHeight: 1,
                  flex: "0 0 24px",
                }}
              >
                ⚔️
              </span>
              <span>Messi vs Ronaldo</span>
            </span>
          </a>

          <a
            href="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=&wtw-filter=ALL"
            target="_blank"
            rel="noreferrer"
            className="website-btn"
            style={{
              minHeight: "54px",
              width: "100%",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
              }}
            >
              <img
                src="/WorldCup.png"
                alt="2026 FIFA World Cup"
                style={{
                  width: "24px",
                  height: "24px",
                  objectFit: "contain",
                  display: "block",
                  flex: "0 0 24px",
                }}
                draggable="false"
              />
              <span>2026 FIFA World Cup</span>
            </span>
          </a>
        </div>
      </section>

      {showFormatModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm Protected Change</h3>
            <p>
              Update{" "}
              <strong>
                {pendingGameFormat?.kind === "matchType"
                  ? "Match Type"
                  : pendingGameFormat?.kind === "leagueMode"
                    ? "League Mode"
                    : "Game Format"}
              </strong>{" "}
              to{" "}
              <strong>
                {pendingGameFormat?.kind === "matchType"
                  ? pendingGameFormat?.value === MATCH_MODE.LEAGUE
                    ? "League"
                    : "Friendly"
                  : pendingGameFormat?.kind === "leagueMode"
                    ? pendingGameFormat?.value === "scheduled_target"
                      ? "Fixtured"
                      : "Round Robin"
                    : GAME_FORMAT_OPTIONS.find((item) => item.value === pendingGameFormat?.value)?.label || pendingGameFormat?.value}
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
          <div
            className="modal"
            style={{
              width: "min(96vw, 760px)",
              maxWidth: "760px",
              maxHeight: "88vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              padding: isMobile ? "1rem" : "1.25rem",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                marginBottom: "0.8rem",
              }}
            >
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "0.35rem" }}>
                  Fixtured Match List
                </h3>
                <p className="muted small" style={{ margin: 0 }}>
                  Common target:{" "}
                  <strong>{scheduledTarget ?? smartTarget ?? "-"}</strong>
                </p>
              </div>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowFixturesModal(false)}
                aria-label="Close fixtures"
                style={{
                  width: "42px",
                  minWidth: "42px",
                  height: "42px",
                  borderRadius: "999px",
                  padding: 0,
                  touchAction: "manipulation",
                }}
              >
                ✕
              </button>
            </div>

            {isAdmin && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: isMobile ? "0.85rem" : "1rem",
                  borderRadius: "1rem",
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(15,23,42,0.42)",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "minmax(180px, 1fr) minmax(150px, 0.8fr) auto",
                    gap: "0.75rem",
                    alignItems: "end",
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
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>

                  <div>
                    <label
                      className="muted small"
                      style={{ display: "block", marginBottom: "0.35rem" }}
                    >
                      Target
                    </label>
                    <input
                      type="number"
                      min={Math.max(1, matchesPlayed)}
                      step="1"
                      className="text-input"
                      value={fixtureTargetDraft}
                      onChange={(e) => {
                        setFixtureTargetDraft(e.target.value);
                        setFixtureAdminError("");
                      }}
                      placeholder={String(smartTarget ?? scheduledTarget ?? 50)}
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => handleProtectedTargetChange(fixtureTargetDraft)}
                    disabled={fixtureTargetDraft === ""}
                    style={{
                      minHeight: "44px",
                      whiteSpace: "nowrap",
                      touchAction: "manipulation",
                    }}
                  >
                    Update fixtures
                  </button>
                </div>

                <p
                  className="muted small"
                  style={{
                    margin: "0.65rem 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  Select the common target you want all 3 teams to move towards.
                  If the number cannot be reached perfectly, choose the nearest
                  sensible target just above or below it.
                </p>

                {fixtureAdminError && (
                  <p className="error-text" style={{ marginTop: "0.45rem" }}>
                    {fixtureAdminError}
                  </p>
                )}
              </div>
            )}

            <div
              style={{
                flex: "1 1 auto",
                overflowY: "auto",
                paddingRight: isMobile ? "0.15rem" : "0.35rem",
                minHeight: 0,
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
                      padding: isMobile ? "0.58rem 0" : "0.65rem 0",
                      fontWeight: done ? 500 : 800,
                      opacity: done ? 0.58 : 1,
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      lineHeight: 1.35,
                    }}
                  >
                    {index + 1}. {fixture.teamALabel} vs {fixture.teamBLabel}
                    {hasScore ? ` (${fixture.goalsA}-${fixture.goalsB})` : ""}
                  </div>
                );
              })}
            </div>

            <div
              className="actions-row"
              style={{
                marginTop: "1rem",
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                className="secondary-btn"
                onClick={() => setShowFixturesModal(false)}
                style={{
                  width: isMobile ? "100%" : "min(320px, 100%)",
                  touchAction: "manipulation",
                }}
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