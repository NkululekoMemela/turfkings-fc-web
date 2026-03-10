// src/pages/LiveMatchPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTeamById } from "../core/teams.js";
import { db } from "../firebaseConfig.js";
import {
  doc,
  updateDoc,
  setDoc,
  arrayUnion,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";
import {
  FORMATIONS_5,
  DEFAULT_FORMATION_ID_5,
  loadSavedLineups,
  resolvePreferredTeamLineup,
  createVerifiedLineupSnapshot,
  getVerifiedPlayersForEvents,
  isGuestPlayerInSnapshot,
  toTitleCaseLoose,
  uniqueNames,
} from "../core/lineups.js";

const CAPTAIN_PASSWORDS = ["11", "22", "3333"];
const MATCH_DOC_ID = "current";
const SOUND_URL = `${import.meta.env.BASE_URL}alarm.mp4`;

const matchEndSound =
  typeof Audio !== "undefined" ? new Audio(SOUND_URL) : null;

if (matchEndSound) {
  matchEndSound.preload = "auto";
  matchEndSound.loop = false;
  matchEndSound.volume = 1;
}

function stopAlarmLoop(alarmLoopRef) {
  if (alarmLoopRef.current) {
    clearInterval(alarmLoopRef.current);
    alarmLoopRef.current = null;
  }
  if (matchEndSound) {
    try {
      matchEndSound.pause();
      matchEndSound.currentTime = 0;
    } catch (_) {
      // ignore
    }
  }
}

function getShortName(label) {
  if (!label) return "";
  const map = {
    Barcelona: "BAR",
    Madrid: "MAD",
    Liverpool: "LIV",
  };
  if (map[label]) return map[label];

  const cleaned = String(label).replace(/team/gi, "").trim();
  if (!cleaned) return String(label || "");
  return cleaned.slice(0, 3).toUpperCase();
}

function formatPlayerLabel(name) {
  return toTitleCaseLoose(name || "");
}

function slugFromLooseName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getIdentityDisplayName(identity) {
  return (
    identity?.shortName ||
    identity?.fullName ||
    identity?.displayName ||
    identity?.name ||
    identity?.email ||
    "viewer"
  );
}

function getTeamCaptainNames(team) {
  const rawCaptain = team?.captain;
  if (!rawCaptain) return [];
  return uniqueNames([formatPlayerLabel(rawCaptain)]);
}

function getPlayerPhoto(playerPhotosByName = {}, playerName = "") {
  const raw = String(playerName || "").trim();
  if (!raw) return null;

  const pretty = formatPlayerLabel(raw);
  const slug = slugFromLooseName(raw);
  const firstRaw = raw.split(/\s+/)[0] || "";
  const firstPretty = pretty.split(/\s+/)[0] || "";

  const candidates = [raw, pretty, slug, firstRaw, firstPretty]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  for (const key of candidates) {
    if (playerPhotosByName[key]) return playerPhotosByName[key];
  }

  return null;
}

async function hardResetMatchDoc(summaryInfo, matchSeconds) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        matchNumber: summaryInfo.matchNumber,
        teamAId: summaryInfo.teamAId,
        teamBId: summaryInfo.teamBId,
        standbyId: summaryInfo.standbyId,
        teamALabel: summaryInfo.teamALabel,
        teamBLabel: summaryInfo.teamBLabel,
        standbyLabel: summaryInfo.standbyLabel,
        events: [],
        goalsA: 0,
        goalsB: 0,
        finalSummary: null,
        isFinished: false,
        matchSeconds: matchSeconds ?? 0,
        secondsLeft: matchSeconds ?? 0,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      },
      { merge: false }
    );
  } catch (err) {
    console.error("⚠️ Failed to hard reset match doc:", err);
  }
}

async function appendEventToFirestore(
  event,
  summaryInfo,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);

    const common = {
      ...summaryInfo,
      matchSeconds: matchSeconds ?? 0,
      secondsLeft:
        typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : null,
      isFinished: false,
      lastUpdated: serverTimestamp(),
    };

    try {
      await updateDoc(ref, {
        events: arrayUnion(event),
        ...common,
      });
    } catch (_) {
      await setDoc(
        ref,
        {
          events: [event],
          createdAt: serverTimestamp(),
          ...common,
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("⚠️ Failed to mirror event to Firestore:", err);
  }
}

async function overwriteEventsInFirestore(
  allEvents,
  summaryInfo,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        events: allEvents,
        matchSeconds: matchSeconds ?? 0,
        secondsLeft:
          typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : null,
        isFinished: false,
        lastUpdated: serverTimestamp(),
        ...summaryInfo,
      },
      { merge: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to overwrite events in Firestore:", err);
  }
}

async function writeFinalSummaryToFirestore(
  finalSummary,
  events,
  secondsLeft,
  matchSeconds
) {
  try {
    const ref = doc(db, "matches", MATCH_DOC_ID);
    await setDoc(
      ref,
      {
        finalSummary,
        events,
        isFinished: true,
        finishedAt: serverTimestamp(),
        matchSeconds: matchSeconds ?? 0,
        secondsLeft:
          typeof secondsLeft === "number" ? Math.max(secondsLeft, 0) : 0,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to write final summary to Firestore:", err);
  }
}

function PlayerBenchChip({
  name,
  isSelected,
  onClick,
  photoData,
  disabled = false,
  suffix = "",
}) {
  return (
    <button
      type="button"
      className={`bench-player ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        padding: "0.38rem 0.7rem",
      }}
    >
      <span
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "999px",
          overflow: "hidden",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: photoData
            ? "transparent"
            : "radial-gradient(circle at 30% 20%, #38bdf8, #0f172a)",
          border: "1px solid rgba(255,255,255,0.35)",
        }}
      >
        {photoData ? (
          <img
            src={photoData}
            alt={name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              color: "#e5e7eb",
            }}
          >
            {String(name || "?").charAt(0).toUpperCase()}
          </span>
        )}
      </span>

      <span>
        {formatPlayerLabel(name)}
        {suffix}
      </span>
    </button>
  );
}

function PlayerChoiceGrid({
  title,
  players,
  selectedName,
  onSelect,
  playerPhotosByName = {},
  guestSnapshotChecker = null,
  disabled = false,
}) {
  return (
    <div className="field-row">
      <label>{title}</label>
      {players.length === 0 ? (
        <p className="muted small">No players available.</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.55rem",
            alignItems: "flex-start",
          }}
        >
          {players.map((name) => {
            const isSelected = selectedName === name;
            const isGuest = guestSnapshotChecker
              ? guestSnapshotChecker(name)
              : false;
            const photoData = getPlayerPhoto(playerPhotosByName, name);

            return (
              <PlayerBenchChip
                key={name}
                name={name}
                isSelected={isSelected}
                onClick={() => onSelect(isSelected ? "" : name)}
                photoData={photoData}
                disabled={disabled}
                suffix={isGuest ? " (Guest)" : ""}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function LineupBoard({
  title,
  lineup,
  setLineup,
  registeredPlayers,
  playerPhotos = {},
  disabled = false,
}) {
  const formation =
    FORMATIONS_5[lineup?.formationId] || FORMATIONS_5[DEFAULT_FORMATION_ID_5];
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [guestName, setGuestName] = useState("");

  useEffect(() => {
    setSelectedPlayer(null);
  }, [lineup?.formationId]);

  const allRegistered = uniqueNames(registeredPlayers || []);
  const assignedNames = new Set(
    Object.values(lineup?.positions || {}).filter(Boolean)
  );
  const benchPlayers = allRegistered.filter((p) => !assignedNames.has(p));
  const benchList = uniqueNames([
    ...(lineup?.guestPlayers || []),
    ...benchPlayers,
  ]);

  const handleBenchClick = (playerName) => {
    if (disabled) return;

    if (
      selectedPlayer &&
      selectedPlayer.from === "bench" &&
      selectedPlayer.name === playerName
    ) {
      setSelectedPlayer(null);
      return;
    }

    setSelectedPlayer({ from: "bench", name: playerName });
  };

  const handlePitchClick = (posId) => {
    if (disabled) return;

    const currentAtPos = lineup?.positions?.[posId] || null;

    if (!selectedPlayer) {
      if (!currentAtPos) return;
      setSelectedPlayer({ from: "pitch", name: currentAtPos, posId });
      return;
    }

    const newPositions = { ...(lineup?.positions || {}) };

    if (selectedPlayer.from === "bench") {
      const name = selectedPlayer.name;
      Object.keys(newPositions).forEach((key) => {
        if (newPositions[key] === name) newPositions[key] = null;
      });
      newPositions[posId] = name;
    } else {
      const fromPos = selectedPlayer.posId;
      const fromName = selectedPlayer.name;
      const toName = currentAtPos;
      newPositions[fromPos] = toName || null;
      newPositions[posId] = fromName;
    }

    setLineup((prev) => ({
      ...prev,
      positions: newPositions,
    }));
    setSelectedPlayer(null);
  };

  const handleClearSpot = (posId) => {
    if (disabled) return;

    setLineup((prev) => ({
      ...prev,
      positions: {
        ...(prev?.positions || {}),
        [posId]: null,
      },
    }));
    setSelectedPlayer(null);
  };

  const handleGuestAdd = () => {
    if (disabled) return;

    const clean = formatPlayerLabel(guestName);
    if (!clean) return;

    setLineup((prev) => ({
      ...prev,
      guestPlayers: uniqueNames([...(prev?.guestPlayers || []), clean]),
    }));
    setGuestName("");
  };

  const handleRemoveGuest = (name) => {
    if (disabled) return;

    setLineup((prev) => {
      const nextGuests = (prev?.guestPlayers || []).filter((g) => g !== name);
      const nextPositions = { ...(prev?.positions || {}) };
      Object.keys(nextPositions).forEach((k) => {
        if (nextPositions[k] === name) nextPositions[k] = null;
      });

      return {
        ...prev,
        positions: nextPositions,
        guestPlayers: nextGuests,
      };
    });
    setSelectedPlayer(null);
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <h3 style={{ marginTop: 0, marginBottom: "0.6rem" }}>{title}</h3>

      <div className="pitch-wrapper">
        <div className="pitch" style={{ maxWidth: "100%" }}>
          <div className="pitch-centre-circle" />
          <div className="pitch-half-line" />
          <div className="pitch-box pitch-box-top" />
          <div className="pitch-box pitch-box-bottom" />

          {formation.positions.map((pos) => {
            const name = lineup?.positions?.[pos.id] || "";
            const isSelected =
              selectedPlayer &&
              selectedPlayer.from === "pitch" &&
              selectedPlayer.posId === pos.id;

            const photoData = getPlayerPhoto(playerPhotos, name);

            return (
              <div
                key={pos.id}
                className={`pitch-position ${name ? "has-player" : ""} ${
                  isSelected ? "selected" : ""
                }`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onClick={() => handlePitchClick(pos.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleClearSpot(pos.id);
                }}
              >
                <div className="player-token">
                  <div
                    className={`player-shirt ${photoData ? "with-photo" : ""}`}
                    style={
                      photoData ? { backgroundImage: `url(${photoData})` } : {}
                    }
                  />
                  <div className="player-meta">
                    <span className="player-name">
                      {name ? formatPlayerLabel(name) : "Empty"}
                    </span>
                    <span className="position-tag">{pos.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bench-wrapper" style={{ marginTop: "0.9rem" }}>
        <h4 style={{ marginBottom: "0.45rem" }}>Bench / Subs</h4>

        {benchList.length === 0 ? (
          <p className="muted">No bench players available.</p>
        ) : (
          <ul
            className="bench-list"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.55rem",
              alignItems: "flex-start",
            }}
          >
            {benchList.map((p) => {
              const isSelected =
                selectedPlayer &&
                selectedPlayer.from === "bench" &&
                selectedPlayer.name === p;
              const isGuest = (lineup?.guestPlayers || []).includes(p);
              const photoData = getPlayerPhoto(playerPhotos, p);

              return (
                <li
                  key={p}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <PlayerBenchChip
                    name={p}
                    isSelected={isSelected}
                    onClick={() => handleBenchClick(p)}
                    photoData={photoData}
                    disabled={disabled}
                    suffix={isGuest ? " (Guest)" : ""}
                  />
                  {isGuest && !disabled && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => handleRemoveGuest(p)}
                      title="Remove guest"
                    >
                      remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!disabled && (
          <div style={{ marginTop: "0.85rem" }}>
            <label
              className="muted small"
              style={{ display: "block", marginBottom: "0.35rem" }}
            >
              Add guest player
            </label>
            <div
              style={{
                display: "flex",
                gap: "0.45rem",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                className="text-input"
                placeholder="Guest player name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={handleGuestAdd}
              >
                + Guest
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveMatchPage({
  matchSeconds,
  secondsLeft,
  timeUp,
  running,
  teams,
  currentMatchNo,
  currentMatch,
  currentEvents,
  identity = null,
  activeRole = "spectator",
  isAdmin = false,
  isCaptain = false,
  canControlMatch = false,
  pendingMatchStartContext = null,
  confirmedLineupSnapshot = null,
  confirmedLineupsByMatchNo = {},
  playerPhotosByName = {},
  onConfirmPreMatchLineups,
  onCancelPreMatchLineups,
  onAddEvent,
  onDeleteEvent,
  onUndoLastEvent,
  onConfirmEndMatch,
  onBackToLanding,
  onGoToStats,
}) {
  const { teamAId, teamBId, standbyId } = currentMatch || {};
  const teamA = getTeamById(teams, teamAId);
  const teamB = getTeamById(teams, teamBId);
  const standbyTeam = getTeamById(teams, standbyId);

  const role = String(activeRole || "spectator").trim().toLowerCase();
  const isControllerSession = Boolean(pendingMatchStartContext) && canControlMatch;

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.innerWidth <= 480);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [mergedPlayerPhotos, setMergedPlayerPhotos] = useState(
    playerPhotosByName || {}
  );

  useEffect(() => {
    setMergedPlayerPhotos((prev) => ({
      ...prev,
      ...(playerPhotosByName || {}),
    }));
  }, [playerPhotosByName]);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        if (cancelled) return;

        const loaded = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const photoData = data?.photoData || "";
          const rawName = data?.name || docSnap.id || "";
          if (!photoData) return;

          const pretty = formatPlayerLabel(rawName);
          const slug = slugFromLooseName(rawName);
          const first = pretty.split(/\s+/)[0] || "";

          [rawName, pretty, slug, first]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .forEach((key) => {
              loaded[key] = photoData;
            });
        });

        setMergedPlayerPhotos((prev) => ({
          ...loaded,
          ...prev,
        }));
      } catch (err) {
        console.error("Failed to load player photos in LiveMatchPage:", err);
      }
    }

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  const [scoringTeamId, setScoringTeamId] = useState(teamAId);
  const [scorerName, setScorerName] = useState("");
  const [assistName, setAssistName] = useState("");
  const [showGoalRecorder, setShowGoalRecorder] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState(15);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [showBackModal, setShowBackModal] = useState(false);
  const [backPassword, setBackPassword] = useState("");
  const [backError, setBackError] = useState("");

  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoPassword, setUndoPassword] = useState("");
  const [undoError, setUndoError] = useState("");

  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const alarmLoopRef = useRef(null);
  const savedLineups = useMemo(() => loadSavedLineups(), []);

  const defaultTeamALineup = useMemo(
    () =>
      resolvePreferredTeamLineup(
        teamA,
        "5",
        savedLineups,
        FORMATIONS_5,
        DEFAULT_FORMATION_ID_5,
        (teamA?.players || []).map((p) => formatPlayerLabel(p))
      ),
    [teamA, savedLineups]
  );

  const defaultTeamBLineup = useMemo(
    () =>
      resolvePreferredTeamLineup(
        teamB,
        "5",
        savedLineups,
        FORMATIONS_5,
        DEFAULT_FORMATION_ID_5,
        (teamB?.players || []).map((p) => formatPlayerLabel(p))
      ),
    [teamB, savedLineups]
  );

  const [verifyTeamALineup, setVerifyTeamALineup] =
    useState(defaultTeamALineup);
  const [verifyTeamBLineup, setVerifyTeamBLineup] =
    useState(defaultTeamBLineup);
  const [localConfirmedSnapshots, setLocalConfirmedSnapshots] = useState(null);

  useEffect(() => {
    setVerifyTeamALineup(defaultTeamALineup);
  }, [defaultTeamALineup]);

  useEffect(() => {
    setVerifyTeamBLineup(defaultTeamBLineup);
  }, [defaultTeamBLineup]);

  const existingConfirmedFromApp =
    localConfirmedSnapshots ||
    confirmedLineupSnapshot ||
    confirmedLineupsByMatchNo?.[currentMatchNo] ||
    null;

  const hasVerifiedLineups = Boolean(
    existingConfirmedFromApp?.[teamAId] && existingConfirmedFromApp?.[teamBId]
  );

  const mustVerifyBeforePlay = isControllerSession;

  useEffect(() => {
    if (mustVerifyBeforePlay && !hasVerifiedLineups) {
      setVerifyTeamALineup(defaultTeamALineup);
      setVerifyTeamBLineup(defaultTeamBLineup);
      setShowVerifyModal(true);
      setShowGoalRecorder(false);
      setScorerName("");
      setAssistName("");
      return;
    }

    if (!mustVerifyBeforePlay) {
      setShowVerifyModal(false);
    }
  }, [
    mustVerifyBeforePlay,
    hasVerifiedLineups,
    currentMatchNo,
    teamAId,
    teamBId,
    defaultTeamALineup,
    defaultTeamBLineup,
  ]);

  useEffect(() => {
    setScoringTeamId(teamAId);
    setScorerName("");
    setAssistName("");
    setShowGoalRecorder(false);
  }, [teamAId, teamBId, currentMatchNo]);

  useEffect(() => {
    if (!matchEndSound) return;

    const unlock = async () => {
      try {
        await matchEndSound.play();
        matchEndSound.pause();
        matchEndSound.currentTime = 0;
      } catch (_) {
        // ignore
      } finally {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("click", unlock);
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  useEffect(() => {
    if (!timeUp) {
      stopAlarmLoop(alarmLoopRef);
      return;
    }

    (async () => {
      try {
        if (matchEndSound) {
          matchEndSound.currentTime = 0;
          await matchEndSound.play();
        }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch (_) {
        // ignore
      }
    })();

    alarmLoopRef.current = setInterval(async () => {
      try {
        if (matchEndSound) {
          matchEndSound.currentTime = 0;
          await matchEndSound.play();
        }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch (_) {
        // ignore
      }
    }, 10000);

    return () => {
      stopAlarmLoop(alarmLoopRef);
    };
  }, [timeUp]);

  useEffect(() => {
    if (!canControlMatch) return;
    if (!running) return;
    if (secondsLeft == null) return;

    const shouldPush = secondsLeft <= 5 || secondsLeft % 5 === 0;
    if (!shouldPush) return;

    const pushTimer = async () => {
      try {
        const ref = doc(db, "matches", MATCH_DOC_ID);
        await updateDoc(ref, {
          secondsLeft: Math.max(secondsLeft, 0),
          matchSeconds: matchSeconds ?? 0,
          isFinished: false,
          lastUpdated: serverTimestamp(),
        });
      } catch (_) {
        // ignore
      }
    };

    pushTimer();
  }, [secondsLeft, running, matchSeconds, canControlMatch]);

  useEffect(() => {
    if (!isControllerSession) return;
    if (!teamA || !teamB || !standbyTeam) return;

    hardResetMatchDoc(
      {
        matchNumber: currentMatchNo,
        teamAId,
        teamBId,
        standbyId,
        teamALabel: teamA.label,
        teamBLabel: teamB.label,
        standbyLabel: standbyTeam.label,
      },
      matchSeconds
    );
  }, [
    isControllerSession,
    currentMatchNo,
    teamAId,
    teamBId,
    standbyId,
    teamA,
    teamB,
    standbyTeam,
    matchSeconds,
  ]);

  const displaySeconds = useMemo(() => {
    if (typeof secondsLeft === "number" && !Number.isNaN(secondsLeft)) {
      return secondsLeft;
    }
    return matchSeconds ?? 0;
  }, [secondsLeft, matchSeconds]);

  const formattedTime = useMemo(() => {
    const m = Math.floor(displaySeconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (displaySeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [displaySeconds]);

  const goalsA = currentEvents.filter(
    (e) => e.teamId === teamAId && e.type === "goal"
  ).length;

  const goalsB = currentEvents.filter(
    (e) => e.teamId === teamBId && e.type === "goal"
  ).length;

  const verifiedLineupA = existingConfirmedFromApp?.[teamAId] || null;
  const verifiedLineupB = existingConfirmedFromApp?.[teamBId] || null;

  const playersForSelectedTeam = useMemo(() => {
    const snapshot =
      scoringTeamId === teamAId
        ? verifiedLineupA
        : scoringTeamId === teamBId
        ? verifiedLineupB
        : null;

    const fallbackTeam =
      scoringTeamId === teamAId
        ? teamA
        : scoringTeamId === teamBId
        ? teamB
        : null;

    const fallbackPlayers = (fallbackTeam?.players || []).map((p) =>
      formatPlayerLabel(p)
    );

    return getVerifiedPlayersForEvents(snapshot, fallbackPlayers);
  }, [
    scoringTeamId,
    verifiedLineupA,
    verifiedLineupB,
    teamA,
    teamB,
    teamAId,
    teamBId,
  ]);

  const assistOptions = playersForSelectedTeam.filter((p) => p !== scorerName);

  const selectedSnapshot =
    scoringTeamId === teamAId ? verifiedLineupA : verifiedLineupB;

  const basicSummary = {
    matchNumber: currentMatchNo,
    teamAId,
    teamBId,
    standbyId,
    teamALabel: teamA?.label || "",
    teamBLabel: teamB?.label || "",
    standbyLabel: standbyTeam?.label || "",
  };

  const handleConfirmLineups = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can confirm match lineups.");
      return;
    }

    const confirmedByName = getIdentityDisplayName(identity);
    const confirmedByRole = role;

    const snapshotA = createVerifiedLineupSnapshot({
      teamId: teamAId,
      lineup: verifyTeamALineup,
      formationMap: FORMATIONS_5,
      registeredPlayers: (teamA?.players || []).map((p) =>
        formatPlayerLabel(p)
      ),
      confirmedBy: confirmedByName,
      confirmedByRole,
      preferredCaptainNames: getTeamCaptainNames(teamA),
    });

    const snapshotB = createVerifiedLineupSnapshot({
      teamId: teamBId,
      lineup: verifyTeamBLineup,
      formationMap: FORMATIONS_5,
      registeredPlayers: (teamB?.players || []).map((p) =>
        formatPlayerLabel(p)
      ),
      confirmedBy: confirmedByName,
      confirmedByRole,
      preferredCaptainNames: getTeamCaptainNames(teamB),
    });

    const merged = {
      [teamAId]: snapshotA,
      [teamBId]: snapshotB,
    };

    setLocalConfirmedSnapshots(merged);
    onConfirmPreMatchLineups?.(merged);
    setShowVerifyModal(false);
  };

  const handleStartGoalRecord = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can record goals.");
      return;
    }
    if (!hasVerifiedLineups) {
      window.alert("Verify lineups before recording goals.");
      return;
    }

    setShowGoalRecorder(true);
    setScorerName("");
    setAssistName("");
  };

  const handleCancelGoalRecord = () => {
    setShowGoalRecorder(false);
    setScorerName("");
    setAssistName("");
  };

  const handleAddEvent = async () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can record goals.");
      return;
    }

    if (!hasVerifiedLineups) {
      window.alert("Verify lineups before recording goals.");
      return;
    }

    if (!scorerName) return;

    const relevantSnapshot =
      scoringTeamId === teamAId ? verifiedLineupA : verifiedLineupB;

    const scorerIsGuest = isGuestPlayerInSnapshot(relevantSnapshot, scorerName);
    const assistIsGuest = assistName
      ? isGuestPlayerInSnapshot(relevantSnapshot, assistName)
      : false;

    const event = {
      id: Date.now().toString(),
      type: "goal",
      teamId: scoringTeamId,
      scorer: scorerName,
      assist: assistName ? assistName : null,
      scorerType: scorerIsGuest ? "guest" : "registered",
      assistType: assistName
        ? assistIsGuest
          ? "guest"
          : "registered"
        : null,
      timeSeconds: matchSeconds - displaySeconds,
    };

    onAddEvent(event);
    setScorerName("");
    setAssistName("");
    setShowGoalRecorder(false);

    appendEventToFirestore(event, basicSummary, displaySeconds, matchSeconds);
  };

  const handleEndMatchClick = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can end the match.");
      return;
    }
    setShowConfirmModal(true);
    setConfirmCountdown(15);
  };

  useEffect(() => {
    if (!showConfirmModal) return;
    if (confirmCountdown <= 0) {
      handleConfirmFinal();
      return;
    }

    const id = setInterval(() => {
      setConfirmCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(id);
  }, [showConfirmModal, confirmCountdown]);

  const handleGoBackToEdit = () => {
    setShowConfirmModal(false);
    setConfirmCountdown(15);
  };

  const handleConfirmFinal = () => {
    if (!canControlMatch) {
      window.alert("Only captains or admin can end the match.");
      return;
    }

    stopAlarmLoop(alarmLoopRef);

    setShowConfirmModal(false);
    setConfirmCountdown(15);

    const summary = {
      teamAId,
      teamBId,
      standbyId,
      goalsA,
      goalsB,
    };

    onConfirmEndMatch(summary);

    const finalSummary = {
      ...basicSummary,
      goalsA,
      goalsB,
      verifiedLineups: existingConfirmedFromApp || null,
    };

    writeFinalSummaryToFirestore(
      finalSummary,
      currentEvents,
      displaySeconds,
      matchSeconds
    );
  };

  const handleRequestDelete = (index) => {
    if (!canControlMatch) return;

    setDeleteIndex(index);
    setDeletePassword("");
    setDeleteError("");
    setShowDeleteModal(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteIndex(null);
    setDeletePassword("");
    setDeleteError("");
  };

  const handleConfirmDelete = () => {
    if (!canControlMatch) {
      setDeleteError("Only captains or admin can delete events.");
      return;
    }

    const password = deletePassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setDeleteError("Invalid captain password.");
      return;
    }

    if (deleteIndex !== null) {
      onDeleteEvent(deleteIndex);
      const newEvents = currentEvents.filter((_, i) => i !== deleteIndex);
      overwriteEventsInFirestore(
        newEvents,
        basicSummary,
        displaySeconds,
        matchSeconds
      );
    }

    handleCancelDelete();
  };

  const handleBackClick = () => {
    if (!canControlMatch) {
      onBackToLanding();
      return;
    }

    setShowBackModal(true);
    setBackPassword("");
    setBackError("");
  };

  const handleCancelBack = () => {
    setShowBackModal(false);
    setBackPassword("");
    setBackError("");
  };

  const handleConfirmDiscardAndBack = () => {
    if (!canControlMatch) {
      setBackError("Only captains or admin can discard a live match.");
      return;
    }

    const password = backPassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setBackError("Invalid captain password.");
      return;
    }

    stopAlarmLoop(alarmLoopRef);

    setShowBackModal(false);
    setBackPassword("");
    setBackError("");

    overwriteEventsInFirestore([], basicSummary, displaySeconds, matchSeconds);

    if (mustVerifyBeforePlay && typeof onCancelPreMatchLineups === "function") {
      onCancelPreMatchLineups();
      return;
    }

    onBackToLanding();
  };

  const handleUndoClick = () => {
    if (!canControlMatch || currentEvents.length === 0) return;

    setShowUndoModal(true);
    setUndoPassword("");
    setUndoError("");
  };

  const handleCancelUndo = () => {
    setShowUndoModal(false);
    setUndoPassword("");
    setUndoError("");
  };

  const handleConfirmUndo = () => {
    if (!canControlMatch) {
      setUndoError("Only captains or admin can undo events.");
      return;
    }

    const password = undoPassword.trim();
    if (!CAPTAIN_PASSWORDS.includes(password)) {
      setUndoError("Invalid captain password.");
      return;
    }

    onUndoLastEvent();
    const newEvents = currentEvents.slice(0, -1);

    overwriteEventsInFirestore(
      newEvents,
      basicSummary,
      displaySeconds,
      matchSeconds
    );

    setShowUndoModal(false);
    setUndoPassword("");
    setUndoError("");
  };

  const displayNameA = isMobile ? getShortName(teamA?.label) : teamA?.label;
  const displayNameB = isMobile ? getShortName(teamB?.label) : teamB?.label;

  return (
    <div className="page live-page">
      <style>{`
        .live-page .player-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-top: 0.12rem;
          line-height: 1;
        }

        .live-page .player-meta .player-name {
          display: block;
          font-size: 0.66rem;
          line-height: 1;
          text-align: center;
          max-width: 70px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .live-page .player-meta .position-tag {
          display: block;
          font-size: 0.56rem;
          line-height: 1;
          margin-top: 0.05rem;
        }

        @media (max-width: 480px) {
          .live-page .player-shirt {
            width: 34px !important;
            height: 34px !important;
          }

          .live-page .player-meta .player-name {
            font-size: 0.52rem !important;
            max-width: 48px !important;
          }

          .live-page .player-meta .position-tag {
            font-size: 0.46rem !important;
          }
        }
      `}</style>

      <header className="header">
        <h1>Match #{currentMatchNo}</h1>
        <p>
          On-field: <strong>{teamA?.label}</strong> (c: {teamA?.captain}) vs{" "}
          <strong>{teamB?.label}</strong> (c: {teamB?.captain})
        </p>
        <p>
          Standby: <strong>{standbyTeam?.label}</strong> (c:{" "}
          {standbyTeam?.captain})
        </p>
        <p className="muted small">
          Signed in as <strong>{getIdentityDisplayName(identity)}</strong> •{" "}
          <strong>{role}</strong>
          {isCaptain ? " 👑" : ""}
          {isAdmin ? " 🛠️" : ""}
        </p>
      </header>

      <section className="card">
        <div className="timer-row">
          <div className="timer-display">{formattedTime}</div>
          {running ? (
            <span className="muted small">Live timer running</span>
          ) : timeUp ? (
            <span className="timer-warning">⏱️ Time is up – end match!</span>
          ) : (
            <span className="muted small">Match not running yet</span>
          )}
        </div>

        <div className="score-row">
          <div className="score-team">
            <strong className="score-team-name">{displayNameA}</strong>
            <div className="score-number">{goalsA}</div>
          </div>
          <div className="score-dash">–</div>
          <div className="score-team">
            <strong className="score-team-name">{displayNameB}</strong>
            <div className="score-number">{goalsB}</div>
          </div>
        </div>

        <div className="event-input">
          <h3>Goal Recorder</h3>

          {!hasVerifiedLineups && canControlMatch && (
            <p className="muted" style={{ marginBottom: "0.6rem" }}>
              Verify lineups before recording goals.
            </p>
          )}

          {canControlMatch ? (
            !showGoalRecorder ? (
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={handleStartGoalRecord}
                  disabled={!hasVerifiedLineups}
                >
                  ⚽ Record Goal
                </button>
              </div>
            ) : (
              <div
                style={{
                  marginTop: "0.6rem",
                  padding: "0.9rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div className="field-row">
                  <label>Which team scored?</label>
                  <div className="team-toggle">
                    <button
                      className={
                        scoringTeamId === teamAId
                          ? "toggle-btn active"
                          : "toggle-btn"
                      }
                      type="button"
                      onClick={() => {
                        setScoringTeamId(teamAId);
                        setScorerName("");
                        setAssistName("");
                      }}
                      disabled={!hasVerifiedLineups}
                    >
                      {teamA?.label}
                    </button>
                    <button
                      className={
                        scoringTeamId === teamBId
                          ? "toggle-btn active"
                          : "toggle-btn"
                      }
                      type="button"
                      onClick={() => {
                        setScoringTeamId(teamBId);
                        setScorerName("");
                        setAssistName("");
                      }}
                      disabled={!hasVerifiedLineups}
                    >
                      {teamB?.label}
                    </button>
                  </div>
                </div>

                <PlayerChoiceGrid
                  title="Scorer"
                  players={playersForSelectedTeam}
                  selectedName={scorerName}
                  onSelect={(name) => {
                    setScorerName(name);
                    if (name && name === assistName) {
                      setAssistName("");
                    }
                  }}
                  playerPhotosByName={mergedPlayerPhotos}
                  guestSnapshotChecker={(name) =>
                    isGuestPlayerInSnapshot(selectedSnapshot, name)
                  }
                  disabled={!hasVerifiedLineups}
                />

                {scorerName && (
                  <PlayerChoiceGrid
                    title="Assist (optional)"
                    players={assistOptions}
                    selectedName={assistName}
                    onSelect={(name) => setAssistName(name)}
                    playerPhotosByName={mergedPlayerPhotos}
                    guestSnapshotChecker={(name) =>
                      isGuestPlayerInSnapshot(selectedSnapshot, name)
                    }
                    disabled={!hasVerifiedLineups}
                  />
                )}

                <div
                  style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}
                >
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={handleAddEvent}
                    disabled={!hasVerifiedLineups || !scorerName}
                  >
                    ✍🏻 Save Goal
                  </button>
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={handleCancelGoalRecord}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="muted" style={{ marginBottom: "0.6rem" }}>
              This is a live view only. Goal recording is controlled by
              captain/admin.
            </p>
          )}
        </div>

        <div className="event-log">
          <div className="event-log-header">
            <h3>Current Match Goals</h3>
            {canControlMatch && (
              <button
                className="secondary-btn"
                type="button"
                onClick={handleUndoClick}
                disabled={currentEvents.length === 0}
              >
                Undo last
              </button>
            )}
          </div>

          {currentEvents.length === 0 && <p className="muted">No goals yet.</p>}

          <ul>
            {currentEvents.map((e, idx) => {
              const team =
                e.teamId === teamAId
                  ? teamA
                  : e.teamId === teamBId
                  ? teamB
                  : null;

              return (
                <li key={e.id} className="event-item">
                  <span>
                    [{formatSeconds(e.timeSeconds)}] {team?.label} –{" "}
                    <strong>Goal:</strong> {formatPlayerLabel(e.scorer)}
                    {e.scorerType === "guest" ? " (Guest)" : ""}
                    {e.assist
                      ? ` (assist: ${formatPlayerLabel(e.assist)}${
                          e.assistType === "guest" ? " - Guest" : ""
                        })`
                      : ""}
                  </span>

                  {canControlMatch && (
                    <div className="event-actions">
                      <button
                        className="link-btn"
                        type="button"
                        onClick={() => handleRequestDelete(idx)}
                      >
                        ❌ delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="actions-row">
          {canControlMatch && (
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setShowVerifyModal(true)}
            >
              🧩 Verify Lineups
            </button>
          )}

          <button
            className="secondary-btn"
            type="button"
            onClick={handleBackClick}
          >
            {canControlMatch ? "⛔ Cancel Game" : "⬅ Back"}
          </button>

          <button
            className="secondary-btn"
            type="button"
            onClick={onGoToStats}
          >
            📊 View Stats
          </button>

          {canControlMatch && (
            <button
              className="primary-btn"
              type="button"
              onClick={handleEndMatchClick}
            >
              🤝 End & Close Match
            </button>
          )}
        </div>
      </section>

      {showVerifyModal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            style={{
              width: "min(1100px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
          >
            <h3>Verify lineups before the match</h3>
            <p
              className="muted"
              style={{ marginTop: "0.35rem", marginBottom: "0.9rem" }}
            >
              Captain/admin saved lineups are loaded by default. Only change
              them here if kickoff requires an override.
            </p>

            <div
              style={{
                display: "flex",
                gap: "1.25rem",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <LineupBoard
                title={`${teamA?.label}`}
                lineup={verifyTeamALineup}
                setLineup={setVerifyTeamALineup}
                registeredPlayers={(teamA?.players || []).map((p) =>
                  formatPlayerLabel(p)
                )}
                playerPhotos={mergedPlayerPhotos}
                disabled={!canControlMatch}
              />
              <LineupBoard
                title={`${teamB?.label}`}
                lineup={verifyTeamBLineup}
                setLineup={setVerifyTeamBLineup}
                registeredPlayers={(teamB?.players || []).map((p) =>
                  formatPlayerLabel(p)
                )}
                playerPhotos={mergedPlayerPhotos}
                disabled={!canControlMatch}
              />
            </div>

            <div className="actions-row" style={{ marginTop: "1rem" }}>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  if (mustVerifyBeforePlay && !hasVerifiedLineups) {
                    onCancelPreMatchLineups?.();
                    return;
                  }
                  setShowVerifyModal(false);
                }}
              >
                {mustVerifyBeforePlay && !hasVerifiedLineups
                  ? "Cancel match start"
                  : "Close"}
              </button>

              {canControlMatch && (
                <button
                  className="primary-btn"
                  type="button"
                  onClick={handleConfirmLineups}
                >
                  Confirm lineups
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm End of Match</h3>
            <p>
              <strong>{teamA?.label}</strong> {goalsA} – {goalsB}{" "}
              <strong>{teamB?.label}</strong>
            </p>
            <p>
              Are you sure everything is correct? You have{" "}
              <strong>{confirmCountdown}</strong> seconds to go back and edit.
            </p>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleGoBackToEdit}
              >
                Go back &amp; edit
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmFinal}
              >
                Confirm &amp; lock
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm Delete Event</h3>
            <p>To delete an event, enter any team captain&apos;s password.</p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteError("");
                }}
                maxLength={4}
              />
              {deleteError && <p className="error-text">{deleteError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmDelete}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Discard match &amp; go back?</h3>
            <p>
              This will <strong>lose all current events</strong> for this match
              and return to the main screen.
            </p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={backPassword}
                onChange={(e) => {
                  setBackPassword(e.target.value);
                  setBackError("");
                }}
                maxLength={4}
              />
              {backError && <p className="error-text">{backError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelBack}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmDiscardAndBack}
              >
                ⚠️ Don&apos;t save this game
              </button>
            </div>
          </div>
        </div>
      )}

      {showUndoModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Undo last event?</h3>
            <p>To undo the last event, enter any team captain&apos;s password.</p>
            <div className="field-row">
              <label>Captain password</label>
              <input
                type="password"
                className="text-input"
                value={undoPassword}
                onChange={(e) => {
                  setUndoPassword(e.target.value);
                  setUndoError("");
                }}
                maxLength={4}
              />
              {undoError && <p className="error-text">{undoError}</p>}
            </div>
            <div className="actions-row">
              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancelUndo}
              >
                Cancel
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={handleConfirmUndo}
              >
                Confirm undo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSeconds(s) {
  const v = typeof s === "number" && !Number.isNaN(s) ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}