// src/pages/LandingPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getTeamById } from "../core/teams.js";
import { buildClubIdentity } from "../core/clubIdentity.js";
import { GLOBAL_CAPTAIN_CODES } from "../core/accessCodes.js";

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

const CAPTAIN_CODES = GLOBAL_CAPTAIN_CODES;

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

function formatMatchDurationLabel(seconds) {
  const safeSeconds = Number(seconds);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) return "Default";

  const minutes = safeSeconds / 60;
  if (minutes < 60) {
    return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
  }

  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

function secondsToEditableMinutes(seconds, fallbackSeconds = 60 * 60) {
  const safeSeconds = Number(seconds);
  const fallback = Number(fallbackSeconds);
  const resolved = Number.isFinite(safeSeconds) && safeSeconds > 0
    ? safeSeconds
    : Number.isFinite(fallback) && fallback > 0
      ? fallback
      : 60 * 60;

  return String(Number((resolved / 60).toFixed(2))).replace(/\.0$/, "");
}

export function LandingPage({
  activeClub = null,
  activeClubId = null,
  activeClubName = null,
  clubIdentity = null,
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
  matchSeconds = 60 * 60,
  defaultMatchSeconds = 60 * 60,
  onUpdateMatchSeconds,
  durationSwitchLocked = false,
  adminCode = "3333",
  onUpdateAdminCode,
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

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [showAdminCodeModal, setShowAdminCodeModal] = useState(false);
  const [durationDraftMinutes, setDurationDraftMinutes] = useState(() =>
    secondsToEditableMinutes(matchSeconds, defaultMatchSeconds)
  );
  const [adminCodeStatus, setAdminCodeStatus] = useState("");
  const [adminCodeBusy, setAdminCodeBusy] = useState(false);
  const [showCodes, setShowCodes] = useState(true);
  const [codeCopyStatus, setCodeCopyStatus] = useState("");
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  const resolvedClubIdentity = useMemo(
    () =>
      clubIdentity ||
      buildClubIdentity({
        ...(activeClub || {}),
        id: activeClubId || activeClub?.id,
        name: activeClubName || activeClub?.name,
      }),
    [clubIdentity, activeClub, activeClubId, activeClubName]
  );

  const resolvedClubName = resolvedClubIdentity.name || "This Club";
  const resolvedClubLogo = resolvedClubIdentity.logoUrl || resolvedClubIdentity.logo;
  const resolvedClubSubtitle = resolvedClubIdentity.subtitle || "Club match hub";

  const teamPhotos = useMemo(() => {
    const photos = Array.isArray(resolvedClubIdentity.heroImages)
      ? resolvedClubIdentity.heroImages
      : [];
    const fallback = resolvedClubIdentity.heroImage || resolvedClubLogo;
    return photos.length ? photos : fallback ? [fallback] : [];
  }, [resolvedClubIdentity, resolvedClubLogo]);

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

  useEffect(() => {
    if (!showFixturesModal) return;
    setFixtureTargetDraft(scheduledTarget ?? smartTarget ?? "");
  }, [showFixturesModal, scheduledTarget, smartTarget]);

  useEffect(() => {
    setDurationDraftMinutes(secondsToEditableMinutes(matchSeconds, defaultMatchSeconds));
  }, [matchSeconds, defaultMatchSeconds]);

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


  const activeCaptainCodes = useMemo(() => {
    const code = String(adminCode || "3333").trim() || "3333";
    return Array.from(new Set([...CAPTAIN_CODES, code]));
  }, [adminCode]);

  const isAdminCode = (value) =>
    String(value || "").trim() === (String(adminCode || "3333").trim() || "3333");

  const closeSettingsPanelAfterPopup = () => {
    setShowSettingsPanel(false);
  };

  const closeAdminCodeModal = () => {
    setShowAdminCodeModal(false);
    setCodeCopyStatus("");
    closeSettingsPanelAfterPopup();
  };

  const closeDurationModal = () => {
    setShowDurationModal(false);
    closeSettingsPanelAfterPopup();
  };

  const closeFixturesModal = () => {
    setShowFixturesModal(false);
    closeSettingsPanelAfterPopup();
  };

  const copyCodeToClipboard = async (label, value) => {
    const text = String(value || "").trim();
    if (!text) return;

    if (!showCodes) {
      setCodeCopyStatus("Show codes before copying.");
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCodeCopyStatus(`${label} copied.`);
    } catch (error) {
      console.error("[TK SETTINGS] Copy code failed:", error);
      setCodeCopyStatus("Could not copy code. Tap and hold the code to copy.");
    }
  };

  const renderCodeRow = (label, value, accent = "rgba(148,163,184,0.14)") => {
    const displayValue = showCodes ? String(value || "") : String(value || "").replace(/./g, "•");

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
          gap: "0.45rem",
          padding: "0.52rem 0.55rem",
          borderRadius: "0.8rem",
          background: "rgba(15,23,42,0.42)",
          border: `1px solid ${accent}`,
        }}
      >
        <label
          className="muted small"
          style={{
            display: "grid",
            gap: "0.22rem",
            minWidth: 0,
          }}
        >
          <span>{label}</span>
          <input
            type="text"
            readOnly
            inputMode="numeric"
            value={displayValue}
            onFocus={(event) => event.target.select()}
            style={{
              width: "100%",
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#f8fafc",
              fontSize: "1rem",
              fontWeight: 900,
              letterSpacing: showCodes ? "0.12em" : "0.05em",
              padding: 0,
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          />
        </label>

        <button
          type="button"
          className="secondary-btn"
          onClick={() => copyCodeToClipboard(label, value)}
          disabled={!showCodes}
          style={{
            minHeight: "32px",
            padding: "0.25rem 0.62rem",
            borderRadius: "999px",
            fontSize: "0.72rem",
            fontWeight: 850,
            whiteSpace: "nowrap",
          }}
        >
          Copy
        </button>
      </div>
    );
  };

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
  const resolvedMatchSeconds = Number.isFinite(Number(matchSeconds))
    ? Number(matchSeconds)
    : Number(defaultMatchSeconds || 60 * 60);
  const resolvedDefaultMatchSeconds = Number.isFinite(Number(defaultMatchSeconds))
    ? Number(defaultMatchSeconds)
    : isThreeTeamLeague
      ? 5 * 60
      : 60 * 60;
  const matchDurationLabel = formatMatchDurationLabel(resolvedMatchSeconds);
  const defaultDurationLabel = formatMatchDurationLabel(resolvedDefaultMatchSeconds);
  const durationIsCustom =
    Math.round(resolvedMatchSeconds) !== Math.round(resolvedDefaultMatchSeconds);
  const settingsSummary = isThreeTeamLeague
    ? `League • ${resolvedLeagueMode === "scheduled_target" ? "Fixtured" : "Round Robin"} • ${activeGameFormatLabel} • ${matchDurationLabel}`
    : `Friendly • ${activeGameFormatLabel} • ${matchDurationLabel}`;
  const fixturedMode =
    isThreeTeamLeague && resolvedLeagueMode === "scheduled_target";

  const modeLipLabel = isThreeTeamLeague ? "LEAGUE MODE" : "FRIENDLY MODE";
  const modeLipDotColor = isThreeTeamLeague ? "#facc15" : "#38bdf8";

  const clubWeeklyPlayTime =
    activeClub?.weeklyPlayTime ||
    activeClub?.schedule?.weeklyPlayTime ||
    activeClub?.schedule?.playTime ||
    activeClub?.playTime ||
    "";

  const clubVenueLine =
    activeClub?.locationDetails?.venueName ||
    activeClub?.locationDetails?.displayLocation ||
    activeClub?.location ||
    activeClub?.venue ||
    "";

  const clubHeaderInfoLine = [clubWeeklyPlayTime, clubVenueLine]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" • ");


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
    closeSettingsPanelAfterPopup();
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

    if (!activeCaptainCodes.includes(formatCode.trim())) {
      setFormatError("Invalid captain code.");
      return;
    }

    applyPendingProtectedChange(pendingGameFormat);
    cancelGameFormatChange();
  };

  const handleProtectedTargetChange = (target) => {
    if (!isAdmin) return;

    if (!isAdminCode(fixtureAdminCode)) {
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

  const handleApplyMatchDuration = () => {
    if (durationSwitchLocked) {
      window.alert("Finish or discard the live match before changing match length.");
      return;
    }

    const minutes = Number(durationDraftMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      window.alert("Please enter a valid match length in minutes.");
      return;
    }

    const nextSeconds = Math.round(minutes * 60);

    if (Math.round(nextSeconds) !== Math.round(resolvedDefaultMatchSeconds)) {
      const ok = window.confirm(
        `${isThreeTeamLeague ? "League" : "Friendly"} default is ${defaultDurationLabel}.\n\nYou are changing this match type to ${formatMatchDurationLabel(nextSeconds)}. Continue only if this is intentional.`
      );
      if (!ok) return;
    }

    onUpdateMatchSeconds?.(nextSeconds, resolvedMatchType);
    closeDurationModal();
  };

  const handleResetMatchDuration = () => {
    if (durationSwitchLocked) {
      window.alert("Finish or discard the live match before changing match length.");
      return;
    }

    setDurationDraftMinutes(
      secondsToEditableMinutes(resolvedDefaultMatchSeconds, resolvedDefaultMatchSeconds)
    );
    onUpdateMatchSeconds?.(resolvedDefaultMatchSeconds, resolvedMatchType);
    closeDurationModal();
  };

  const generateAdminCode = () => {
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return String(1000 + (values[0] % 9000));
    }

    return String(Math.floor(1000 + Math.random() * 9000));
  };

  const handleRegenerateAdminCode = async () => {
    if (!isAdmin) return;

    if (typeof onUpdateAdminCode !== "function") {
      setAdminCodeStatus("Admin code updater is not connected yet.");
      return;
    }

    const ok = window.confirm(
      "Generate a new admin code?\n\nThe old admin code will stop working for admin-only actions."
    );
    if (!ok) return;

    const nextCode = generateAdminCode();
    setAdminCodeStatus("");
    setAdminCodeBusy(true);

    try {
      const result = await onUpdateAdminCode({
        currentCode: adminCode,
        nextCode,
      });

      if (!result?.ok) {
        setAdminCodeStatus(result?.message || "Could not update admin code.");
        return;
      }

      setShowCodes(true);
      setCodeCopyStatus("");
      setAdminCodeStatus(`New admin code generated: ${nextCode}`);
    } catch (error) {
      console.error("[TK SETTINGS] Admin code update failed:", error);
      setAdminCodeStatus("Could not update admin code.");
    } finally {
      setAdminCodeBusy(false);
    }
  };

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
        .landing-wave-header .landing-header-divider {
          position: relative;
          z-index: 2;
        }

        .landing-wave-header .header-title {
          min-height: 76px;
          padding: 16px 12px 0 12px;
          box-sizing: border-box;
          width: 100%;
          max-width: 920px;
          margin: 0 auto;
        }

        @media (min-width: 760px) {
          .landing-header-sticky {
            margin-left: 0;
            margin-right: 0;
          }

          .landing-wave-header .header-title {
            padding-left: 18px;
            padding-right: 18px;
          }
        }

        .landing-wave-header .landing-header-divider {
          display: none;
        }

        .tk-ribbon-mode-label {
          position: absolute;
          z-index: 3;
          left: 14.9%;
          top: 85.25%;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          pointer-events: none;
          user-select: none;
          color: #f8fafc;
          font-size: clamp(0.48rem, 0.62vw, 0.68rem);
          font-weight: 900;
          line-height: 1;
          letter-spacing: clamp(0.045em, 0.08vw, 0.085em);
          text-transform: uppercase;
          white-space: nowrap;
          text-shadow: none;
        }

        .tk-ribbon-mode-label-dot {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: currentColor;
          box-shadow: none;
        }

        @media (min-width: 760px) {
          .tk-ribbon-mode-label {
            font-size: clamp(0.58rem, 0.52vw, 0.72rem);
            letter-spacing: 0.08em;
          }
        }

        @media (max-width: 480px) {
          .tk-ribbon-mode-label {
            font-size: 0.47rem;
            letter-spacing: 0.075em;
          }

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

          <div className="tk-ribbon-mode-label" aria-label={modeLipLabel}>
            <span
              className="tk-ribbon-mode-label-dot"
              style={{ color: modeLipDotColor }}
              aria-hidden="true"
            />
            <span>{modeLipLabel}</span>
          </div>

          <div className="header-title">
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                minWidth: 0,
                width: "100%",
              }}
            >
              <img
                src={resolvedClubLogo}
                alt={`${resolvedClubName} logo`}
                className="tk-logo"
              />
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0 }}>{resolvedClubName} 5-A-Side</h1>
              </div>
            </div>
          </div>

          <div className="landing-header-divider" />

        </header>
      </div>

      <header className="header" style={{ marginTop: "1.15rem" }}>
        <p className="subtitle">{clubHeaderInfoLine || resolvedClubSubtitle}</p>

        <div className="header-top-row" style={{ width: "100%" }}>
          <div className="auth-status" style={{ width: "100%" }}>
            <span className="auth-text">
              Viewing as <strong>{identityName}</strong>
              <span className="muted small">
                {" "}• Role: <strong>{roleLabel}</strong>
              </span>
            </span>

            {currentUser && (
              <div
                className="muted small"
                style={{
                  marginTop: "0.2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  width: "100%",
                  flexWrap: "nowrap",
                }}
              >
                <span>
                  Google account:{" "}
                  <strong>{currentUser.displayName || currentUser.email}</strong>
                </span>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => onGoToEntryDev?.()}
                  style={{
                    minHeight: "30px",
                    padding: "0.28rem 0.68rem",
                    borderRadius: "999px",
                    fontSize: "0.76rem",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  Change Profile
                </button>
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
                  {settingsSummary}
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

            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setDurationDraftMinutes(
                  secondsToEditableMinutes(resolvedMatchSeconds, resolvedDefaultMatchSeconds)
                );
                setShowDurationModal(true);
              }}
              disabled={durationSwitchLocked}
              style={{
                width: "100%",
                minHeight: "48px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                borderRadius: "1rem",
                padding: "0.65rem 0.78rem",
                border: durationIsCustom
                  ? "1px solid rgba(250,204,21,0.38)"
                  : "1px solid rgba(148,163,184,0.20)",
                background: durationIsCustom
                  ? "linear-gradient(180deg, rgba(250,204,21,0.10), rgba(15,23,42,0.70))"
                  : "rgba(15,23,42,0.50)",
                color: "#e5e7eb",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  minWidth: 0,
                }}
              >
                <span aria-hidden="true" style={{ fontSize: "1.2rem" }}>⏱️</span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontWeight: 800 }}>Match Length</span>
                  <span className="muted small">
                    {matchDurationLabel}
                    {durationIsCustom ? " • custom" : ` • default ${defaultDurationLabel}`}
                  </span>
                </span>
              </span>
              <span aria-hidden="true" className="muted small">Edit</span>
            </button>

            {(isAdmin || isCaptain) && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setAdminCodeStatus("");
                  setCodeCopyStatus("");
                  setShowCodes(true);
                  setShowAdminCodeModal(true);
                }}
                style={{
                  width: "100%",
                  minHeight: "42px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  borderRadius: "1rem",
                  padding: "0.55rem 0.78rem",
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(15,23,42,0.42)",
                  color: "#e5e7eb",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    minWidth: 0,
                    fontWeight: 800,
                  }}
                >
                  <span aria-hidden="true">🔐</span>
                  <span>Click for password update</span>
                </span>
                <span className="muted small" style={{ whiteSpace: "nowrap" }}>
                  View
                </span>
              </button>
            )}
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
                    src="/formations-icon.png"
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

            {isThreeTeamLeague && isAdmin && (
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

            {isThreeTeamLeague && isAdmin && typeof onOpenEndSeasonModal === "function" && (
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
                icon: (
                  <img
                    src="/formations-icon.png"
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
          alt={`${resolvedClubName} club image ${photoIndex + 1}`}
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
              height: "48px",
              minHeight: "48px",
              maxHeight: "48px",
              width: "100%",
              padding: "0 1rem",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
                height: "100%",
                lineHeight: 1,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 20,
                  lineHeight: 1,
                  flex: "0 0 22px",
                }}
              >
                💳
              </span>
              <span>Book your next games</span>
            </span>
          </button>

          <a
            href="https://www.messivsronaldo.app/#google_vignette"
            target="_blank"
            rel="noreferrer"
            className="website-btn"
            style={{
              height: "48px",
              minHeight: "48px",
              maxHeight: "48px",
              width: "100%",
              padding: "0 1rem",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
                height: "100%",
                lineHeight: 1,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 20,
                  lineHeight: 1,
                  flex: "0 0 22px",
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
              height: "48px",
              minHeight: "48px",
              maxHeight: "48px",
              width: "100%",
              padding: "0 1rem",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
                height: "100%",
                lineHeight: 1,
              }}
            >
              <img
                src="/WorldCup.png"
                alt=""
                style={{
                  width: 22,
                  height: 22,
                  objectFit: "contain",
                  display: "block",
                  flex: "0 0 22px",
                }}
                draggable="false"
              />
              <span>2026 FIFA World Cup</span>
            </span>
          </a>
        </div>
      </section>

      {showAdminCodeModal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            style={{
              width: "min(92vw, 360px)",
              padding: isMobile ? "0.92rem" : "1rem",
              borderRadius: "1.05rem",
              border: "1px solid rgba(148,163,184,0.20)",
              background:
                "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "0.65rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1rem" }}>🔐 Access codes</h3>
              <button
                type="button"
                className="link-btn"
                onClick={() => setShowCodes((prev) => !prev)}
                style={{ fontSize: "0.78rem", fontWeight: 850 }}
              >
                {showCodes ? "Hide" : "Show"}
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              {isAdmin && renderCodeRow("Admin", adminCode, "rgba(34,197,94,0.22)")}

              {CAPTAIN_CODES.map((code, index) => (
                <React.Fragment key={`captain-code-${code}-${index}`}>
                  {renderCodeRow(`Captain ${index + 1}`, code)}
                </React.Fragment>
              ))}
            </div>

            {isAdmin && (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleRegenerateAdminCode}
                disabled={adminCodeBusy}
                style={{
                  width: "100%",
                  marginTop: "0.7rem",
                  minHeight: "40px",
                  borderRadius: "999px",
                }}
              >
                {adminCodeBusy ? "Generating…" : "Generate new admin code"}
              </button>
            )}

            {(adminCodeStatus || codeCopyStatus) && (
              <p
                className="muted small"
                style={{
                  margin: "0.58rem 0 0",
                  color: (adminCodeStatus || codeCopyStatus).includes("copied") || (adminCodeStatus || codeCopyStatus).includes("generated") ? "#86efac" : "#fecaca",
                  fontWeight: 750,
                  lineHeight: 1.35,
                }}
              >
                {adminCodeStatus || codeCopyStatus}
              </p>
            )}

            <button
              type="button"
              className="primary-btn"
              onClick={closeAdminCodeModal}
              style={{
                width: "100%",
                marginTop: "0.75rem",
                minHeight: "42px",
                borderRadius: "999px",
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showDurationModal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            style={{
              width: "min(92vw, 420px)",
              padding: isMobile ? "1rem" : "1.15rem",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "0.35rem" }}>⏱️ Match Length</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Default for {isThreeTeamLeague ? "League" : "Friendly"}: <strong>{defaultDurationLabel}</strong>
            </p>

            <div className="field-row">
              <label>Minutes</label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  min="1"
                  max="180"
                  step="0.5"
                  className="text-input"
                  value={durationDraftMinutes}
                  onChange={(e) => setDurationDraftMinutes(e.target.value)}
                  disabled={durationSwitchLocked}
                  autoFocus
                  style={{
                    width: "100%",
                    paddingRight: "3.15rem",
                    boxSizing: "border-box",
                  }}
                />
                <span
                  className="muted small"
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                >
                  min
                </span>
              </div>
            </div>

            {durationIsCustom && (
              <p className="muted small" style={{ color: "#facc15", marginTop: "0.35rem" }}>
                Custom length active.
              </p>
            )}

            <div
              className="actions-row"
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: "0.55rem",
                marginTop: "0.9rem",
              }}
            >
              <button
                type="button"
                className="secondary-btn"
                onClick={closeDurationModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleApplyMatchDuration}
                disabled={durationSwitchLocked}
              >
                Apply
              </button>
            </div>

            <button
              type="button"
              className="secondary-btn"
              onClick={handleResetMatchDuration}
              disabled={durationSwitchLocked}
              style={{
                width: "100%",
                marginTop: "0.55rem",
                borderRadius: "999px",
              }}
            >
              Reset to {defaultDurationLabel}
            </button>
          </div>
        </div>
      )}

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
                onClick={closeFixturesModal}
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
                onClick={closeFixturesModal}
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