import {useLostFoundSummary} from "../storage/fieldLostFoundRepository.js";
import MatchTeamChooser from "../components/MatchTeamChooser.jsx";
import FieldPortalTile from "../components/FieldPortalTile.jsx";
/*
 * FIELD LEAGUE CLONE WORKBENCH
 *
 * Copied from the proven Club page. This clone must not be
 * routed until its Club writes have been replaced by explicit
 * Venue League repositories.
 */
// src/pages/VenueLandingPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./VenueTheme.css";
import { getTeamById } from "../core/teams.js";
import { buildClubIdentity } from "../core/clubIdentity.js";
import {
  FANM_PRO_CLUBS,
} from "../data/fanm/fanmTeamLibrary.js";

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


function landingTeamIdentityKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolveLandingTeamIdentity(team = {}) {
  const embedded = team?.teamIdentity || {};

  const candidates = new Set(
    [
      embedded?.id,
      embedded?.abbr,
      embedded?.code,
      embedded?.shortName,
      embedded?.name,
      team?.id,
      team?.teamId,
      team?.abbrev,
      team?.code,
      team?.label,
      team?.name,
    ]
      .map(landingTeamIdentityKey)
      .filter(Boolean)
  );

  return (
    (FANM_PRO_CLUBS || []).find(
      (identity) =>
        [
          identity?.id,
          identity?.abbr,
          identity?.code,
          identity?.shortName,
          identity?.name,
        ]
          .map(landingTeamIdentityKey)
          .filter(Boolean)
          .some((key) => candidates.has(key))
    ) ||
    (Object.keys(embedded).length ? embedded : null)
  );
}

function getLandingTeamAbbreviation(team = {}) {
  const identity = resolveLandingTeamIdentity(team);

  return String(
    identity?.abbr ||
    team?.abbrev ||
    team?.code ||
    team?.label ||
    "TEAM"
  )
    .trim()
    .toUpperCase()
    .slice(0, 4);
}

function getLandingTeamBadge(team = {}) {
  const identity = resolveLandingTeamIdentity(team);

  return (
    identity?.fantasyLogo32 ||
    identity?.logo32 ||
    identity?.badgeUrl ||
    identity?.logoUrl ||
    team?.badgeUrl ||
    team?.logoUrl ||
    ""
  );
}

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
    role === "spectator" ||
    role === "club_rep" ||
    role === "field_manager" ||
    role === "assistant_manager" ||
    role === "field_assistant" ||
    role === "other_staff" ||
    role === "referee"
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

export default function VenueLandingPage({
  dataScope = null,
  fieldScheduleControls = null,
  fieldScheduleView = null,
  fieldSeason = null,
  fieldDecisionControls = null,
  fieldStaffRequestControls = null,
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
  pairingRequiresCode = true,
  onStartMatch,
  onSetMatchType,
  onForceSetMatchType,
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
  seasonActionLabel = "End Season",
  onReturnToClub,
  portalClubName,
  onGoToLiveAsSpectator,
  onGoToFormations,
  onGoToSquads,
  onGoToNews,
  onGoToLostFound,
  fieldSettingsOnly = false,
  onSettingsBack,
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
  startMatchDeniedMessage =
    "Only captains or admin can start a match.",
  hasRecordedMatchDayState = false,
  onManageFieldStaff,
  onManageFieldPowers,
  onOpenActionLog,
  pendingFieldStaffCount = 0,
  onReady,
}) {
  const { teamAId, teamBId, standbyId } = currentMatch || {};

  const lostFoundOpenCount = useLostFoundSummary(activeClubId || activeClub?.id, isAdmin, dataScope?.environment || "official");
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
  const [downloadingFixtures, setDownloadingFixtures] =
    useState(false);


  const [, setShowSettingsPanel] = useState(false);
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
    if (!teamPhotos.length) {
      onReady?.();
    }
  }, [teamPhotos.length, onReady]);

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
    const labels = {
      admin: "admin",
      captain: "captain",
      player: "player",
      spectator: "spectator",
      club_rep: "club representative",
      field_manager: "Field Manager",
      assistant_manager: "Assistant Manager",
      field_assistant: "Field Assistant",
      other_staff: "Field staff",
      referee: "referee",
    };

    return labels[resolvedRole] || "spectator";
  }, [resolvedRole]);


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

  const structuredLocation =
    activeClub?.location &&
    typeof activeClub.location === "object"
      ? activeClub.location
      : null;

  const clubVenueLine =
    activeClub?.locationDetails?.venueName ||
    activeClub?.locationDetails?.displayLocation ||
    activeClub?.address ||
    structuredLocation?.address ||
    structuredLocation?.displayLocation ||
    [
      activeClub?.suburb || structuredLocation?.suburb,
      activeClub?.city || structuredLocation?.city,
    ]
      .filter(Boolean)
      .join(", ") ||
    (typeof activeClub?.location === "string"
      ? activeClub.location
      : "") ||
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

  const nextTwelveFixtures = useMemo(
    () =>
      (scheduledFixtures || [])
        .filter((fixture) => !fixture?.completed)
        .slice(0, 12),
    [scheduledFixtures]
  );

  const handleDownloadNextTwelveFixtures = async () => {
    if (
      !isAdmin ||
      downloadingFixtures ||
      nextTwelveFixtures.length === 0
    ) {
      return;
    }

    const loadCanvasImage = (source) =>
      new Promise((resolve) => {
        if (!source) {
          resolve(null);
          return;
        }

        const image = new Image();
        image.crossOrigin = "anonymous";

        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = source;
      });

    const drawRoundedRectangle = (
      context,
      x,
      y,
      width,
      height,
      radius
    ) => {
      context.beginPath();
      context.roundRect(
        x,
        y,
        width,
        height,
        radius
      );
      context.closePath();
    };

    try {
      setDownloadingFixtures(true);

      if (document?.fonts?.ready) {
        await document.fonts.ready;
      }

      const exportRows = nextTwelveFixtures.map(
        (fixture, index) => {
          const teamA =
            getTeamById(teams, fixture.teamAId) || {
              label: fixture.teamALabel,
            };

          const teamB =
            getTeamById(teams, fixture.teamBId) || {
              label: fixture.teamBLabel,
            };

          return {
            number: index + 1,
            abbreviationA:
              getLandingTeamAbbreviation(teamA),
            abbreviationB:
              getLandingTeamAbbreviation(teamB),
            labelA:
              teamA?.label ||
              fixture.teamALabel ||
              "Team A",
            labelB:
              teamB?.label ||
              fixture.teamBLabel ||
              "Team B",
            badgeA: getLandingTeamBadge(teamA),
            badgeB: getLandingTeamBadge(teamB),
          };
        }
      );

      const imagePairs = await Promise.all(
        exportRows.map(async (row) => ({
          badgeA: await loadCanvasImage(row.badgeA),
          badgeB: await loadCanvasImage(row.badgeB),
        }))
      );

      const canvas = document.createElement("canvas");
      const width = 1200;
      const horizontalPadding = 68;
      const headerHeight = 220;
      const rowHeight = 104;
      const rowGap = 14;
      const footerHeight = 105;

      const height =
        headerHeight +
        exportRows.length * (rowHeight + rowGap) +
        footerHeight;

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas is unavailable.");
      }

      const background = context.createLinearGradient(
        0,
        0,
        width,
        height
      );

      background.addColorStop(0, "#0b2350");
      background.addColorStop(0.48, "#071633");
      background.addColorStop(1, "#03131e");

      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const topGlow = context.createRadialGradient(
        width,
        0,
        0,
        width,
        0,
        650
      );

      topGlow.addColorStop(
        0,
        "rgba(37, 99, 235, 0.42)"
      );
      topGlow.addColorStop(
        1,
        "rgba(37, 99, 235, 0)"
      );

      context.fillStyle = topGlow;
      context.fillRect(0, 0, width, height);

      context.fillStyle = "#67e8f9";
      context.font = "900 18px sans-serif";
      context.letterSpacing = "3px";
      context.fillText(
        "5 ASIDES NEAR ME · SEASON SCHEDULE",
        horizontalPadding,
        58
      );

      context.fillStyle = "#f8fafc";
      context.font = "900 48px sans-serif";
      context.letterSpacing = "0px";
      context.fillText(
        "Next 12 Fixtures",
        horizontalPadding,
        120
      );

      context.fillStyle = "rgba(226,232,240,0.76)";
      context.font = "600 22px sans-serif";
      context.fillText(
        `${resolvedClubName} · Fixtured season`,
        horizontalPadding,
        162
      );

      context.fillStyle = "rgba(148,163,184,0.28)";
      context.fillRect(
        horizontalPadding,
        190,
        width - horizontalPadding * 2,
        2
      );

      exportRows.forEach((row, index) => {
        const y =
          headerHeight +
          index * (rowHeight + rowGap);

        const cardGradient =
          context.createLinearGradient(
            horizontalPadding,
            y,
            width - horizontalPadding,
            y + rowHeight
          );

        cardGradient.addColorStop(
          0,
          "rgba(18, 47, 96, 0.96)"
        );
        cardGradient.addColorStop(
          1,
          "rgba(7, 24, 53, 0.98)"
        );

        drawRoundedRectangle(
          context,
          horizontalPadding,
          y,
          width - horizontalPadding * 2,
          rowHeight,
          22
        );

        context.fillStyle = cardGradient;
        context.fill();

        context.strokeStyle =
          "rgba(96,165,250,0.34)";
        context.lineWidth = 2;
        context.stroke();

        context.fillStyle =
          "rgba(148,163,184,0.8)";
        context.font = "900 17px sans-serif";
        context.fillText(
          String(row.number).padStart(2, "0"),
          horizontalPadding + 24,
          y + 61
        );

        const badgeSize = 58;
        const badgeAY = y + (rowHeight - badgeSize) / 2;
        const badgeAX = horizontalPadding + 90;
        const badgeBX =
          width - horizontalPadding - 90 - badgeSize;

        if (imagePairs[index]?.badgeA) {
          context.drawImage(
            imagePairs[index].badgeA,
            badgeAX,
            badgeAY,
            badgeSize,
            badgeSize
          );
        }

        if (imagePairs[index]?.badgeB) {
          context.drawImage(
            imagePairs[index].badgeB,
            badgeBX,
            badgeAY,
            badgeSize,
            badgeSize
          );
        }

        context.fillStyle = "#f8fafc";
        context.font = "900 28px sans-serif";
        context.textAlign = "left";
        context.fillText(
          row.abbreviationA,
          badgeAX + badgeSize + 20,
          y + 48
        );

        context.fillStyle =
          "rgba(203,213,225,0.68)";
        context.font = "600 15px sans-serif";
        context.fillText(
          row.labelA,
          badgeAX + badgeSize + 20,
          y + 75
        );

        context.fillStyle = "#7dd3fc";
        context.font = "900 17px sans-serif";
        context.textAlign = "center";
        context.fillText(
          "VS",
          width / 2,
          y + 61
        );

        context.fillStyle = "#f8fafc";
        context.font = "900 28px sans-serif";
        context.textAlign = "right";
        context.fillText(
          row.abbreviationB,
          badgeBX - 20,
          y + 48
        );

        context.fillStyle =
          "rgba(203,213,225,0.68)";
        context.font = "600 15px sans-serif";
        context.fillText(
          row.labelB,
          badgeBX - 20,
          y + 75
        );

        context.textAlign = "left";
      });

      const footerY =
        height - footerHeight + 40;

      context.fillStyle =
        "rgba(148,163,184,0.25)";
      context.fillRect(
        horizontalPadding,
        footerY - 22,
        width - horizontalPadding * 2,
        2
      );

      context.fillStyle =
        "rgba(167,243,208,0.88)";
      context.font = "800 17px sans-serif";
      context.textAlign = "center";
      context.fillText(
        "MATCHDAY INTELLIGENCE EDITION",
        width / 2,
        footerY + 22
      );

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download =
        "next-12-fixtured-matches.png";
      link.click();
    } catch (error) {
      console.error(
        "[FIXTURES] Could not download fixture list:",
        error
      );

      window.alert(
        "The next 12 fixtures could not be downloaded."
      );
    } finally {
      setDownloadingFixtures(false);
    }
  };

  const requestPairChange = (candidateMatch) => {
    if (!canStartMatch) return;

    if (
      isThreeTeamLeague &&
      resolvedLeagueMode === "scheduled_target"
    ) {
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

    if (!canStartMatch || (pairingRequiresCode && pairingCode.trim().toUpperCase() !== "CONFIRM")) {
      setPairingError("Type CONFIRM to continue.");
      return;
    }

    Promise.resolve()
      .then(() => onUpdatePairing(pendingMatch))
      .then(cancelPairingChange)
      .catch((error) => setPairingError(
        error?.message || "Could not change the next pairing."
      ));
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
      window.alert(startMatchDeniedMessage);
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
    if (!canSeeCaptainStyleControls) return;

    const safeLeagueMode =
      nextLeagueMode === "scheduled_target"
        ? "scheduled_target"
        : "round_robin";

    if (safeLeagueMode === resolvedLeagueMode) return;

    /*
     * The signed-in captain/admin role is sufficient authorization for
     * league scheduling. Do not add a second captain-code checkpoint.
     */
    if (typeof onSetLeagueMode === "function") {
      onSetLeagueMode(safeLeagueMode);
    } else {
      onSetMatchMode?.(safeLeagueMode);
    }

    closeSettingsPanelAfterPopup();

    if (safeLeagueMode === "scheduled_target") {
      const suggestedTarget = Number(smartTarget);
      const existingTarget = Number(scheduledTarget);

      setFixtureTargetDraft(
        Number.isFinite(existingTarget) && existingTarget > 0
          ? String(Math.round(existingTarget))
          : Number.isFinite(suggestedTarget) && suggestedTarget > 0
            ? String(Math.round(suggestedTarget))
            : ""
      );

      window.setTimeout(() => {
        setShowFixturesModal(true);
      }, 0);
    }
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
      if (
        isFormatLocked &&
        typeof onForceSetMatchType === "function"
      ) {
        onForceSetMatchType(change.value);
        return;
      }

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

    if (!canSeeCaptainStyleControls || formatCode.trim().toUpperCase() !== "CONFIRM") {
      setFormatError("Type CONFIRM to continue.");
      return;
    }

    const confirmedChange = pendingGameFormat;

    applyPendingProtectedChange(confirmedChange);
    cancelGameFormatChange();

    /*
     * Enter fixture setup immediately after the protected mode change.
     * The captain has already confirmed the structural change, so target
     * selection must not introduce a second password barrier.
     */
    if (
      confirmedChange.kind === "leagueMode" &&
      confirmedChange.value === "scheduled_target"
    ) {
      const suggestedTarget = Number(smartTarget);
      const existingTarget = Number(scheduledTarget);

      setFixtureTargetDraft(
        Number.isFinite(existingTarget) && existingTarget > 0
          ? String(Math.round(existingTarget))
          : Number.isFinite(suggestedTarget) && suggestedTarget > 0
            ? String(Math.round(suggestedTarget))
            : ""
      );

      window.setTimeout(() => {
        setShowFixturesModal(true);
      }, 0);
    }
  };

  const handleProtectedTargetChange = (target) => {
    if (!canSeeCaptainStyleControls) return;

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

  if (fieldSettingsOnly) return <div className="page landing-page field-landing-page">
    {canSeeCaptainStyleControls && (
          <div id="field-season-settings" className="field-settings-panel" style={{
            gridColumn: "1 / -1", marginBottom: "0.9rem", padding: "0.65rem",
            border: "2px solid rgba(56,189,248,.65)",
            borderRadius: "1.2rem",
          }}>
            <h3>Season settings</h3>
            <button type="button" className="secondary-btn"
              onClick={onSettingsBack}>Close settings</button>
            {true && (
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
            {(typeof onManageFieldPowers === "function" ||
              (onManageFieldStaff && isAdmin)) && (
              <details style={{
                padding: 14, borderRadius: "0.9rem",
                border: "1px solid rgba(56,189,248,.3)",
              }}>
                <summary style={{cursor: "pointer", fontWeight: 800}}>
                  Field team
                  {pendingFieldStaffCount > 0
                    ? ` · ${pendingFieldStaffCount} applications pending` : ""}
                </summary>
                <div style={{display: "grid", gap: 10, marginTop: 12}}>
                  {onManageFieldStaff && isAdmin && (
                    <button type="button" className="secondary-btn"
                      onClick={() => {
                        setShowSettingsPanel(false);
                        onManageFieldStaff();
                      }}>
                      Staff applications and roles
                    </button>
                  )}
                  {typeof onManageFieldPowers === "function" && (
                    <button type="button" className="secondary-btn"
                      onClick={() => {
                        setShowSettingsPanel(false);
                        onManageFieldPowers();
                      }}>
                      Staff permissions
                    </button>
                  )}
                </div>
              </details>
            )}
            {fieldDecisionControls}
            {typeof onOpenActionLog === "function" && (
              <details style={{
                padding: 14, borderRadius: "0.9rem",
                border: "1px solid rgba(148,163,184,.25)",
              }}>
                <summary style={{cursor: "pointer", fontWeight: 800}}>
                  History
                </summary>
                <p className="muted small">
                  Review recorded Field actions and changes.
                </p>
                <button type="button" className="secondary-btn"
                  onClick={onOpenActionLog}>Open action log</button>
              </details>
            )}

            <details aria-label="Season details"
              style={{ padding: "0.9rem", borderRadius: "0.9rem",
                border: "1px solid rgba(56,189,248,.4)" }}>
              <summary style={{cursor: "pointer", fontWeight: 800}}>
                Season details
              </summary>
              <p>League · Fixtured</p>
              <p style={{ margin: "0.6rem 0" }}>
                Format: {String(gameFormat).replaceAll("_V_", " v ")}
              </p>
              {fieldSeason?.scheduleVersion === 1 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  {Number(fieldSeason.scheduleSettings?.matchMinutes ??
                    (Number(matchSeconds) / 60)) / 2} minutes per half
                  {" · "}{Number(fieldSeason.scheduleSettings?.halftimeMinutes ?? 5)}
                  {" "}minutes at halftime
                  {" · "}{Number(fieldSeason.scheduleSettings?.turnaroundMinutes ?? 5)}
                  {" "}minutes between games
                </p>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  Older season: recorded match length is {matchDurationLabel}.
                  The new dated schedule uses the duration selected when
                  announcing the season.
                </p>
              )}
              <p className="muted small" style={{ marginBottom: 0 }}>
                Format and playing duration are chosen before the season starts.
              </p>
            </details>
            {fieldScheduleControls}



              </div>
            )}
          </div>
        )}
    {!canSeeCaptainStyleControls && <section className="card"><h2>Settings</h2><p>Season settings are available to authorized Field administrators.</p><button type="button" className="secondary-btn" onClick={onSettingsBack}>Back to Home</button></section>}
  </div>;

  return (
    <div className="page landing-page field-landing-page">



      <header className="header field-canvas-identity" style={{ marginTop: "1.15rem" }}>
        <p className="subtitle">{clubHeaderInfoLine || resolvedClubSubtitle}</p>

        <div className="header-top-row" style={{ width: "100%" }}>
          <div className="auth-status" style={{ width: "100%" }}>
            <span className="auth-text">
              Viewing as <strong>{identityName}</strong>
              <span className="muted small">
                {" "}• Role: <strong>{roleLabel}</strong>
              </span>
            </span>

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
                {currentUser ? (
                  <>
                    Google account:{" "}
                    <strong>{currentUser.displayName || currentUser.email}</strong>
                  </>
                ) : (
                  <>Browse as a spectator</>
                )}
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
                👤 Change Profile
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="card landing-first-card">
        {fieldScheduleView}
        {!canSeeCaptainStyleControls && (
          <div style={{minWidth: 0, width: "100%"}}>

            {fieldDecisionControls}
            {fieldStaffRequestControls}
          </div>
        )}
        {isThreeTeamLeague && fixturedMode && (
          <section className="fixture-premium-summary">
            <div className="fixture-premium-summary-icon">
              ◫
            </div>

            <div className="fixture-premium-summary-copy">
              <span>FIXTURED SEASON</span>
              <strong>
                {scheduledTarget ?? smartTarget ?? "—"} match target
              </strong>
              <small>
                {(scheduledFixtures || []).length} scheduled fixtures
              </small>
            </div>

            <button
              type="button"
              className="fixture-premium-view-button"
              onClick={() => setShowFixturesModal(true)}
              disabled={
                !scheduledFixtures ||
                scheduledFixtures.length === 0
              }
            >
              View fixtures
              <span aria-hidden="true">›</span>
            </button>
          </section>
        )}

        <header className="match-preview-heading">
          <div className="match-preview-heading__title">
            <h2>Upcoming match:</h2>
          </div>
          <div className="match-preview-heading__details">
            <span className="match-preview-heading__mode">
              {isThreeTeamLeague ? "League" : "Friendly"}
            </span>
            <span>{activeGameFormatLabel}</span>
            {isThreeTeamLeague && (
              <span className="match-preview-heading__number">
                Match #{currentMatchNo}
              </span>
            )}
          </div>
        </header>




        {isThreeTeamLeague && (
          <div
            className={`match-setup-row ${
              fixturedMode
                ? "fixture-premium-pairing"
                : ""
            }`}
          >
            <MatchTeamChooser
              label="On-field Team 1"
              value={teamAId || ""}
              teams={optionsForTeamA}
              renderLabel={renderOptionLabel}
              onChange={handleTeamAChange}
              disabled={!canSeeCaptainStyleControls || fixturedMode}
              side="a"
            />

            <span className="vs-label match-team-versus">VS</span>

            <MatchTeamChooser
              label="On-field Team 2"
              value={teamBId || ""}
              teams={optionsForTeamB}
              renderLabel={renderOptionLabel}
              onChange={handleTeamBChange}
              disabled={!canSeeCaptainStyleControls || fixturedMode}
              side="b"
            />
          </div>
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
            {typeof onOpenEndSeasonModal === "function" && (
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
                  desktopLines: [seasonActionLabel],
                  mobileLines: seasonActionLabel.split(" "),
                })}
              </button>
            )}

{typeof onOpenBackupModal === "function" && (
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

            <button type="button" className="secondary-btn"
                  onClick={onGoToLostFound}
                  aria-label={`Lost and Found${lostFoundOpenCount ?
                    `, ${lostFoundOpenCount} open tickets` : ""}`}
                  style={{...tileButtonStyle(isMobile), position: "relative",
                    width: "100%", minWidth: 0}}>
                  {renderTileContent({
                    isMobile,
                    icon: <span aria-hidden="true"
                      style={{fontSize: isMobile ? "1.55rem" : "1.38rem"}}>🔎</span>,
                    desktopLines: ["Lost &", "Found"],
                    mobileLines: ["Lost &", "Found"],
                  })}
                  {lostFoundOpenCount > 0 && <span style={{
                    position: "absolute", top: 7, right: 8,
                    minWidth: 21, height: 21, padding: "0 4px",
                    display: "grid", placeItems: "center", borderRadius: 999,
                    color: "#fff", background: "#dc354b",
                    fontSize: 11, fontWeight: 800,
                    boxShadow: "0 2px 9px rgba(220,53,75,.35)",
                  }}>{lostFoundOpenCount > 99 ? "99+" : lostFoundOpenCount}</span>}
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
                desktopLines: ["Match", "Highlights"],
                mobileLines: ["Match", "Highlights"],
              })}
            </button>



                {typeof onReturnToClub === "function" && (
                <FieldPortalTile style={tileButtonStyle(isMobile)}
                  clubId={identity?.clubId}
                  label={`Return to ${portalClubName || "your Club"}`}
                  subtitle=""
                  destination={portalClubName || "your Club"}
                  onClick={onReturnToClub} />
              )}










          </div>
        ) : (
          <>
            <p
              className={
                isPlayer
                  ? "muted"
                  : "muted landing-spectator-note"
              }
            >
              {isPlayer
                ? "Players can view the setup, lineups and stats, but only captains or admin can start a match."
                : "You can follow the live game."}
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

              <button type="button" className="secondary-btn"
                  onClick={onGoToLostFound}
                  aria-label={`Lost and Found${lostFoundOpenCount ?
                    `, ${lostFoundOpenCount} open tickets` : ""}`}
                  style={{...tileButtonStyle(isMobile), position: "relative",
                    width: "100%", minWidth: 0}}>
                  {renderTileContent({
                    isMobile,
                    icon: <span aria-hidden="true"
                      style={{fontSize: isMobile ? "1.55rem" : "1.38rem"}}>🔎</span>,
                    desktopLines: ["Lost &", "Found"],
                    mobileLines: ["Lost &", "Found"],
                  })}
                  {lostFoundOpenCount > 0 && <span style={{
                    position: "absolute", top: 7, right: 8,
                    minWidth: 21, height: 21, padding: "0 4px",
                    display: "grid", placeItems: "center", borderRadius: 999,
                    color: "#fff", background: "#dc354b",
                    fontSize: 11, fontWeight: 800,
                    boxShadow: "0 2px 9px rgba(220,53,75,.35)",
                  }}>{lostFoundOpenCount > 99 ? "99+" : lostFoundOpenCount}</span>}
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
                  desktopLines: ["Match", "Highlights"],
                  mobileLines: ["Match", "Highlights"],
                })}
              </button>


              {typeof onReturnToClub === "function" && (
                <FieldPortalTile style={tileButtonStyle(isMobile)}
                  clubId={identity?.clubId}
                  label={`Return to ${portalClubName || "your Club"}`}
                  subtitle=""
                  destination={portalClubName || "your Club"}
                  onClick={onReturnToClub} />
               )}


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
          onLoad={() => onReady?.()}
          onError={() => onReady?.()}
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
          <div className="modal">
            <h3>Account permissions</h3>
            <p>Admin and captain access follows your current account role.
              Remembered access codes are no longer required.</p>
            <p>For protected actions, type the confirmation word shown.</p>
            <button type="button" className="primary-btn"
              onClick={closeAdminCodeModal}>Done</button>
          </div>
        </div>
      )}

      {showDurationModal && (
        <div className="modal-backdrop duration-sheet-backdrop">
          <div className="modal duration-sheet" role="dialog"
            aria-modal="true" aria-labelledby="duration-sheet-title">
            <header className="duration-sheet__header">
              <div>
                <span className="duration-sheet__eyebrow">MATCH SETTINGS</span>
                <h3 id="duration-sheet-title">Time on the pitch</h3>
              </div>
              <button type="button" className="duration-sheet__close"
                aria-label="Close match length" onClick={closeDurationModal}>×</button>
            </header>

            <label className="duration-sheet__display">
              <span>Match duration</span>
              <div>
                <input type="number" min="1" max="180" step="0.5"
                  aria-label="Match duration in minutes"
                  value={durationDraftMinutes}
                  onChange={event => setDurationDraftMinutes(event.target.value)}
                  disabled={durationSwitchLocked} autoFocus />
                <span>MINUTES</span>
              </div>
            </label>

            <div className="duration-sheet__presets" aria-label="Quick durations">
              {[5, 10, 15, 20].map(minutes => (
                <button type="button" key={minutes}
                  className={Number(durationDraftMinutes) === minutes ? "is-selected" : ""}
                  aria-pressed={Number(durationDraftMinutes) === minutes}
                  disabled={durationSwitchLocked}
                  onClick={() => setDurationDraftMinutes(String(minutes))}>
                  {minutes}<span>min</span>
                </button>
              ))}
            </div>

            <p className="duration-sheet__hint">
              {durationSwitchLocked
                ? "Match duration is locked for this match day."
                : "Choose a quick duration or enter your own."}
            </p>

            <div className="duration-sheet__actions">
              <button type="button" className="duration-sheet__cancel"
                onClick={closeDurationModal}>Cancel</button>
              <button type="button" className="duration-sheet__apply"
                onClick={handleApplyMatchDuration}
                disabled={durationSwitchLocked}>Apply duration</button>
            </div>
            <button type="button" className="duration-sheet__reset"
              onClick={handleResetMatchDuration} disabled={durationSwitchLocked}>
              Restore {isThreeTeamLeague ? "League" : "Friendly"} default · {defaultDurationLabel}
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
              <label>Type CONFIRM to continue</label>
              <input
                type="text"
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
            <p>{pairingRequiresCode
              ? "Type CONFIRM to change the next pairing."
              : "Confirm the next Field fixture pairing."}</p>

            {pairingRequiresCode && (
              <div className="field-row">
                <label>Type CONFIRM to continue</label>
                <input
                  type="text"
                  className="text-input"
                  value={pairingCode}
                  onChange={(e) => {
                    setPairingCode(e.target.value);
                    setPairingError("");
                  }}
                />
              </div>
            )}
            {pairingError && <p className="error-text">{pairingError}</p>}

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
        <div
          className="modal-backdrop fixture-presentation-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeFixturesModal();
            }
          }}
        >
          <section
            className="fixture-presentation-modal"
            aria-label="Fixtured match list"
          >
            <header className="fixture-presentation-head">
              <div className="fixture-presentation-title">
                <span className="fixture-presentation-kicker">
                  SEASON SCHEDULE
                </span>
                <h3>Fixtured Match List</h3>
                <p>
                  {Number(scheduledTarget) > 0
                    ? `${scheduledTarget} match target`
                    : "Build a fair season schedule"}
                  <span aria-hidden="true"> · </span>
                  {(scheduledFixtures || []).length} fixtures
                </p>
              </div>

              <div className="fixture-presentation-head-actions">
                {isAdmin && nextTwelveFixtures.length > 0 ? (
                  <button
                    type="button"
                    className="fixture-download-button"
                    onClick={handleDownloadNextTwelveFixtures}
                    disabled={downloadingFixtures}
                  >
                    <span aria-hidden="true">⇩</span>
                    {downloadingFixtures
                      ? "Preparing…"
                      : "Next 12"}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="fixture-presentation-close"
                  onClick={closeFixturesModal}
                  aria-label="Close fixtures"
                >
                  ✕
                </button>
              </div>
            </header>

            {canSeeCaptainStyleControls ? (
              <section className="fixture-target-panel">
                <div className="fixture-target-copy">
                  <span>SEASON CONTROL</span>
                  <strong>Set the match target</strong>
                  <small>
                    We suggest a reachable total. You remain in control.
                  </small>
                </div>

                <div className="fixture-target-actions">
                  <input
                    type="number"
                    min={Math.max(1, matchesPlayed)}
                    step="1"
                    className="text-input"
                    value={fixtureTargetDraft}
                    onChange={(event) => {
                      setFixtureTargetDraft(event.target.value);
                      setFixtureAdminError("");
                    }}
                    placeholder={String(
                      smartTarget ?? scheduledTarget ?? 50
                    )}
                    aria-label="Season match target"
                  />

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() =>
                      handleProtectedTargetChange(
                        fixtureTargetDraft
                      )
                    }
                    disabled={fixtureTargetDraft === ""}
                  >
                    Update
                  </button>
                </div>

                {fixtureAdminError ? (
                  <p className="error-text">
                    {fixtureAdminError}
                  </p>
                ) : null}
              </section>
            ) : null}

            <div className="fixture-presentation-list">
              {(scheduledFixtures || []).map(
                (fixture, index) => {
                  const done = Boolean(fixture.completed);

                  const hasScore =
                    done &&
                    fixture.goalsA !== null &&
                    fixture.goalsA !== undefined &&
                    fixture.goalsB !== null &&
                    fixture.goalsB !== undefined;

                  const fixtureTeamA =
                    getTeamById(teams, fixture.teamAId) || {
                      id: fixture.teamAId,
                      label: fixture.teamALabel,
                    };

                  const fixtureTeamB =
                    getTeamById(teams, fixture.teamBId) || {
                      id: fixture.teamBId,
                      label: fixture.teamBLabel,
                    };

                  const abbreviationA =
                    getLandingTeamAbbreviation(fixtureTeamA);

                  const abbreviationB =
                    getLandingTeamAbbreviation(fixtureTeamB);

                  const badgeA =
                    getLandingTeamBadge(fixtureTeamA);

                  const badgeB =
                    getLandingTeamBadge(fixtureTeamB);

                  return (
                    <article
                      key={`${
                        fixture.id ||
                        `${fixture.teamAId}-${fixture.teamBId}`
                      }-${index}`}
                      className={`fixture-premium-row ${
                        done ? "is-complete" : "is-upcoming"
                      }`}
                    >
                      <span className="fixture-premium-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div className="fixture-premium-team">
                        {badgeA ? (
                          <img src={badgeA} alt="" />
                        ) : (
                          <span className="fixture-badge-fallback">
                            {abbreviationA.slice(0, 1)}
                          </span>
                        )}

                        <div>
                          <strong>{abbreviationA}</strong>
                          <small>
                            {fixtureTeamA.label ||
                              fixture.teamALabel}
                          </small>
                        </div>
                      </div>

                      <div className="fixture-premium-versus">
                        {hasScore ? (
                          <strong>
                            {fixture.goalsA}
                            <span>–</span>
                            {fixture.goalsB}
                          </strong>
                        ) : (
                          <span>VS</span>
                        )}
                      </div>

                      <div className="fixture-premium-team is-away">
                        <div>
                          <strong>{abbreviationB}</strong>
                          <small>
                            {fixtureTeamB.label ||
                              fixture.teamBLabel}
                          </small>
                        </div>

                        {badgeB ? (
                          <img src={badgeB} alt="" />
                        ) : (
                          <span className="fixture-badge-fallback">
                            {abbreviationB.slice(0, 1)}
                          </span>
                        )}
                      </div>

                      <span className="fixture-premium-status">
                        {done ? "FINAL" : "UPCOMING"}
                      </span>
                    </article>
                  );
                }
              )}
            </div>

            <footer className="fixture-presentation-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={closeFixturesModal}
              >
                Close schedule
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
