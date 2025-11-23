// src/pages/FormationsPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";

// ---------------- GAME TYPES ----------------
const GAME_TYPE_5 = "5";
const GAME_TYPE_11 = "11";

// ------------- 5-A-SIDE FORMATIONS -------------
const FORMATIONS_5 = {
  "2-0-2": {
    id: "2-0-2",
    label: "2-0-2",
    positions: [
      { id: "p1", label: "LW", x: 22, y: 26 },
      { id: "p2", label: "RW", x: 78, y: 26 },
      { id: "p3", label: "LB", x: 27, y: 68 },
      { id: "p4", label: "RB", x: 73, y: 68 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
  "1-2-1": {
    id: "1-2-1",
    label: "1-2-1",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 20 },
      { id: "p2", label: "LM", x: 25, y: 45 },
      { id: "p3", label: "RM", x: 75, y: 45 },
      { id: "p4", label: "CB", x: 50, y: 70 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
  "2-1-1": {
    id: "2-1-1",
    label: "2-1-1",
    positions: [
      { id: "p1", label: "LF", x: 30, y: 22 },
      { id: "p2", label: "RF", x: 70, y: 22 },
      { id: "p3", label: "CAM", x: 50, y: 45 },
      { id: "p4", label: "CB", x: 50, y: 70 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
  "1-1-2": {
    id: "1-1-2",
    label: "1-1-2",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 18 },
      { id: "p2", label: "CM", x: 50, y: 42 },
      { id: "p3", label: "LB", x: 30, y: 68 },
      { id: "p4", label: "RB", x: 70, y: 68 },
      { id: "p5", label: "GK", x: 50, y: 88 },
    ],
  },
};

const DEFAULT_FORMATION_ID_5 = "2-0-2";

// ------------- 11-A-SIDE FORMATIONS -------------
const FORMATIONS_11 = {
  "4-3-3": {
    id: "4-3-3",
    label: "4-3-3",
    positions: [
      { id: "p1", label: "LW", x: 18, y: 20 },
      { id: "p2", label: "ST", x: 50, y: 18 },
      { id: "p3", label: "RW", x: 82, y: 20 },
      { id: "p4", label: "LCM", x: 35, y: 38 },
      { id: "p5", label: "CDM", x: 50, y: 45 },
      { id: "p6", label: "RCM", x: 65, y: 38 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "4-4-2": {
    id: "4-4-2",
    label: "4-4-2",
    positions: [
      { id: "p1", label: "ST", x: 40, y: 18 },
      { id: "p2", label: "ST", x: 60, y: 18 },
      { id: "p3", label: "LM", x: 20, y: 35 },
      { id: "p4", label: "LCM", x: 40, y: 40 },
      { id: "p5", label: "RCM", x: 60, y: 40 },
      { id: "p6", label: "RM", x: 80, y: 35 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "3-5-2": {
    id: "3-5-2",
    label: "3-5-2",
    positions: [
      { id: "p1", label: "ST", x: 45, y: 17 },
      { id: "p2", label: "ST", x: 55, y: 17 },
      { id: "p3", label: "LM", x: 20, y: 32 },
      { id: "p4", label: "LCM", x: 35, y: 38 },
      { id: "p5", label: "CAM", x: 50, y: 32 },
      { id: "p6", label: "RCM", x: 65, y: 38 },
      { id: "p7", label: "RM", x: 80, y: 32 },
      { id: "p8", label: "LCB", x: 32, y: 68 },
      { id: "p9", label: "CB", x: 50, y: 72 },
      { id: "p10", label: "RCB", x: 68, y: 68 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "4-2-3-1": {
    id: "4-2-3-1",
    label: "4-2-3-1",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 18 },
      { id: "p2", label: "LAM", x: 30, y: 30 },
      { id: "p3", label: "CAM", x: 50, y: 30 },
      { id: "p4", label: "RAM", x: 70, y: 30 },
      { id: "p5", label: "LDM", x: 38, y: 42 },
      { id: "p6", label: "RDM", x: 62, y: 42 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "3-4-3": {
    id: "3-4-3",
    label: "3-4-3",
    positions: [
      { id: "p1", label: "LW", x: 20, y: 20 },
      { id: "p2", label: "ST", x: 50, y: 18 },
      { id: "p3", label: "RW", x: 80, y: 20 },
      { id: "p4", label: "LCM", x: 35, y: 38 },
      { id: "p5", label: "RCM", x: 65, y: 38 },
      { id: "p6", label: "LWB", x: 25, y: 50 },
      { id: "p7", label: "RWB", x: 75, y: 50 },
      { id: "p8", label: "LCB", x: 32, y: 68 },
      { id: "p9", label: "CB", x: 50, y: 72 },
      { id: "p10", label: "RCB", x: 68, y: 68 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
  "4-1-4-1": {
    id: "4-1-4-1",
    label: "4-1-4-1",
    positions: [
      { id: "p1", label: "ST", x: 50, y: 18 },
      { id: "p2", label: "LM", x: 25, y: 32 },
      { id: "p3", label: "LCM", x: 40, y: 36 },
      { id: "p4", label: "RCM", x: 60, y: 36 },
      { id: "p5", label: "RM", x: 75, y: 32 },
      { id: "p6", label: "CDM", x: 50, y: 46 },
      { id: "p7", label: "LB", x: 22, y: 62 },
      { id: "p8", label: "LCB", x: 38, y: 70 },
      { id: "p9", label: "RCB", x: 62, y: 70 },
      { id: "p10", label: "RB", x: 78, y: 62 },
      { id: "p11", label: "GK", x: 50, y: 88 },
    ],
  },
};

const DEFAULT_FORMATION_ID_11 = "4-3-3";

const LOCAL_KEY = "turfkings_lineups_v1";

// -------- local storage helpers --------
function loadSavedLineups() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLineups(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

// build a default lineup from a player list
function buildDefaultLineup(playerList, formationId, formationsMap) {
  const formation =
    formationsMap[formationId] ||
    formationsMap[Object.keys(formationsMap)[0]];
  const positions = {};
  const players = playerList || [];
  formation.positions.forEach((pos, idx) => {
    positions[pos.id] = players[idx] || null;
  });
  return { formationId: formation.id, positions };
}

// resolve which lineup to use for a given team + game type
function resolveTeamLineup(
  team,
  gameType,
  lineupsByTeam,
  formationsMap,
  defaultFormationId,
  playerPool
) {
  const players = playerPool || [];
  if (!team) {
    return buildDefaultLineup(players, defaultFormationId, formationsMap);
  }
  const existing = lineupsByTeam[team.id];
  if (!existing) {
    return buildDefaultLineup(players, defaultFormationId, formationsMap);
  }

  // legacy: flat shape
  if (existing.formationId) {
    if (gameType === GAME_TYPE_5) {
      if (formationsMap[existing.formationId]) return existing;
      return buildDefaultLineup(players, defaultFormationId, formationsMap);
    }
    // 11-a-side: no saved lineup yet, build default from full pool
    return buildDefaultLineup(players, defaultFormationId, formationsMap);
  }

  // new multi-mode shape
  const modeEntry = existing[gameType];
  if (modeEntry && formationsMap[modeEntry.formationId]) {
    return modeEntry;
  }
  return buildDefaultLineup(players, defaultFormationId, formationsMap);
}

// small helper for Firestore document ids
function slugFromName(name) {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export function FormationsPage({
  teams,
  currentMatch,
  playerPhotosByName = {},   // 🔥 NEW: seeded from App (state)
  onBack,
  onGoToSquads,
}) {
  // Gmail-based auth (for photo protection)
  const { authUser, signInWithGoogle, signOut, canEditPlayer } = useAuth();

  // ✅ For now: everyone can edit lineups (5s + 11s) for brainstorming
  const canEditLineups = true;

  // all saved lineups (per teamId, per game type)
  const [lineupsByTeam, setLineupsByTeam] = useState(() =>
    loadSavedLineups()
  );

  // which team is being shown (prefer the team A from current match if provided)
  const initialTeamId =
    currentMatch?.teamAId || (teams[0] ? teams[0].id : null);
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);

  // game type: 5-a-side by default, with optional 11-a-side
  const [gameType, setGameType] = useState(GAME_TYPE_5);

  const selectedTeam =
    teams.find((t) => t.id === selectedTeamId) || teams[0] || null;

  // full Turf Kings player pool = all unique players from all teams
  const turfKingsPlayers = useMemo(
    () => Array.from(new Set(teams.flatMap((t) => t.players || []))),
    [teams]
  );

  const formationsMap =
    gameType === GAME_TYPE_11 ? FORMATIONS_11 : FORMATIONS_5;
  const defaultFormationId =
    gameType === GAME_TYPE_11
      ? DEFAULT_FORMATION_ID_11
      : DEFAULT_FORMATION_ID_5;

  // which player list to use for seeding this mode
  const playerPool =
    gameType === GAME_TYPE_11
      ? turfKingsPlayers
      : selectedTeam?.players || [];

  const [lineup, setLineup] = useState(() =>
    resolveTeamLineup(
      selectedTeam,
      gameType,
      lineupsByTeam,
      formationsMap,
      defaultFormationId,
      playerPool
    )
  );

  // keep lineup in sync if team, game type, or stored lineups change
  useEffect(() => {
    if (!selectedTeam) return;
    const next = resolveTeamLineup(
      selectedTeam,
      gameType,
      lineupsByTeam,
      formationsMap,
      defaultFormationId,
      playerPool
    );
    setLineup(next);
    setSelectedPlayer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId, selectedTeam, gameType, lineupsByTeam, teams]);

  const formation =
    formationsMap[lineup.formationId] ||
    formationsMap[defaultFormationId] ||
    Object.values(formationsMap)[0];

  // -------- player photos (DB-backed + seeded from App) --------
  const [playerPhotos, setPlayerPhotos] = useState(
    playerPhotosByName || {}
  );
  const [photoPlayer, setPhotoPlayer] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [showPhotoPanel, setShowPhotoPanel] = useState(false); // collapsible

  // 🔥 Merge photos coming from App state (playerPhotosByName) into local map
  useEffect(() => {
    if (!playerPhotosByName) return;
    setPlayerPhotos((prev) => ({
      ...playerPhotosByName,
      ...prev, // keep any that were added locally
    }));
  }, [playerPhotosByName]);

  // players available for photo dropdown
  const playersForPhotoSelect = useMemo(() => {
    if (gameType === GAME_TYPE_11) {
      return turfKingsPlayers;
    }
    return selectedTeam?.players || [];
  }, [gameType, turfKingsPlayers, selectedTeam]);

  // load photos from Firestore once and MERGE into current map
  useEffect(() => {
    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        setPlayerPhotos((prev) => {
          const map = { ...prev };
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data?.name && data?.photoData) {
              map[data.name] = data.photoData;
            }
          });
          return map;
        });
      } catch (err) {
        console.error("Failed to load player photos:", err);
      }
    }
    loadPhotos();
  }, []);

  // keep selected "photo player" in sync with mode / pool
  useEffect(() => {
    const players = playersForPhotoSelect;
    const first = players[0] || "";
    setPhotoPlayer((prev) =>
      prev && players.includes(prev) ? prev : first
    );
  }, [playersForPhotoSelect]);

  const handlePhotoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !photoPlayer) return;

    setPhotoMessage("");

    const playerId = slugFromName(photoPlayer);

    // 🔒 Identity check via Gmail profile
    if (!authUser) {
      setPhotoMessage(
        "You must sign in with your Gmail before uploading a photo."
      );
      e.target.value = "";
      return;
    }
    if (!canEditPlayer(playerId)) {
      setPhotoMessage(
        `You are signed in as ${authUser.email}, which is not linked to ${photoPlayer}'s card. Ask Nkululeko to map your Gmail to this player, or sign in with the correct address.`
      );
      e.target.value = "";
      return;
    }

    setUploadingPhoto(true);

    try {
      // convert image to data URL (simple, works well for avatars)
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const docId = slugFromName(photoPlayer);
      await setDoc(
        doc(db, "playerPhotos", docId),
        {
          name: photoPlayer,
          teamId: selectedTeam ? selectedTeam.id : "turf_kings",
          photoData: dataUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setPlayerPhotos((prev) => ({
        ...prev,
        [photoPlayer]: dataUrl,
      }));
      setPhotoMessage(`Photo saved for ${photoPlayer} ✅`);
    } catch (err) {
      console.error("Failed to upload player photo:", err);
      setPhotoMessage("Could not save photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  // -------- selection state: click a bench player or on-pitch player to move / swap --------
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  // selectedPlayer = { from: "bench" | "pitch", name, posId? }

  const allPlayers =
    gameType === GAME_TYPE_11
      ? turfKingsPlayers
      : selectedTeam?.players || [];
  const assignedNames = new Set(
    Object.values(lineup.positions).filter(Boolean)
  );
  const benchPlayers = allPlayers.filter((p) => !assignedNames.has(p));

  // TEAM selection via buttons (only relevant for 5-a-side)
  const handleTeamClick = (teamId) => {
    setSelectedTeamId(teamId);
    setSelectedPlayer(null);
    setPhotoMessage("");
  };

  const handleGameTypeClick = (type) => {
    setGameType(type);
    setSelectedPlayer(null);
    setPhotoMessage("");
  };

  const saveTeamLineup = (teamId, updatedLineup) => {
    if (!teamId) return;
    setLineupsByTeam((prev) => {
      const prevEntry = prev[teamId];
      let nextEntry;

      if (!prevEntry) {
        nextEntry =
          gameType === GAME_TYPE_11
            ? { [GAME_TYPE_11]: updatedLineup }
            : { [GAME_TYPE_5]: updatedLineup };
      } else if (prevEntry.formationId) {
        // legacy shape -> migrate
        if (gameType === GAME_TYPE_5) {
          nextEntry = { [GAME_TYPE_5]: updatedLineup };
        } else {
          nextEntry = {
            [GAME_TYPE_5]: prevEntry,
            [GAME_TYPE_11]: updatedLineup,
          };
        }
      } else {
        // already in multi-mode shape
        nextEntry = { ...prevEntry, [gameType]: updatedLineup };
      }

      const updatedMap = {
        ...prev,
        [teamId]: nextEntry,
      };
      saveLineups(updatedMap);
      return updatedMap;
    });
  };

  const handleFormationChange = (e) => {
    if (!canEditLineups) return;
    const newFormationId = e.target.value;
    const formationsForType =
      gameType === GAME_TYPE_11 ? FORMATIONS_11 : FORMATIONS_5;
    const newFormation =
      formationsForType[newFormationId] ||
      formationsForType[Object.keys(formationsForType)[0]];

    // preserve current on-pitch players in order as best as possible
    const currentPlayersInOrder = formation.positions
      .map((pos) => lineup.positions[pos.id])
      .filter(Boolean);

    const newPositions = {};
    newFormation.positions.forEach((pos, idx) => {
      newPositions[pos.id] = currentPlayersInOrder[idx] || null;
    });

    const updated = { formationId: newFormation.id, positions: newPositions };
    setLineup(updated);

    if (selectedTeam) {
      saveTeamLineup(selectedTeam.id, updated);
    }
    setSelectedPlayer(null);
  };

  const handleBenchClick = (playerName) => {
    if (!canEditLineups) return;
    if (
      selectedPlayer &&
      selectedPlayer.from === "bench" &&
      selectedPlayer.name === playerName
    ) {
      // unselect
      setSelectedPlayer(null);
      return;
    }
    setSelectedPlayer({ from: "bench", name: playerName });
  };

  const handlePitchClick = (posId) => {
    if (!canEditLineups) return;

    const currentAtPos = lineup.positions[posId] || null;

    // nothing selected -> select this on-pitch player (to move)
    if (!selectedPlayer) {
      if (!currentAtPos) return;
      setSelectedPlayer({ from: "pitch", name: currentAtPos, posId });
      return;
    }

    const newPositions = { ...lineup.positions };

    if (selectedPlayer.from === "bench") {
      // place new player from bench into this position
      const name = selectedPlayer.name;

      // remove them from any other position just in case
      Object.keys(newPositions).forEach((key) => {
        if (newPositions[key] === name) newPositions[key] = null;
      });

      newPositions[posId] = name;
    } else if (selectedPlayer.from === "pitch") {
      // swap / move between pitch positions
      const fromPos = selectedPlayer.posId;
      const fromName = selectedPlayer.name;
      const toName = currentAtPos;

      newPositions[fromPos] = toName || null;
      newPositions[posId] = fromName;
    }

    const updated = { ...lineup, positions: newPositions };
    setLineup(updated);

    if (selectedTeam) {
      saveTeamLineup(selectedTeam.id, updated);
    }

    setSelectedPlayer(null);
  };

  const handleClearSpot = (posId) => {
    if (!canEditLineups) return;
    const newPositions = { ...lineup.positions, [posId]: null };
    const updated = { ...lineup, positions: newPositions };
    setLineup(updated);
    if (selectedTeam) {
      saveTeamLineup(selectedTeam.id, updated);
    }
    setSelectedPlayer(null);
  };

  if (!selectedTeam) {
    return (
      <div className="page lineups-page">
        <header className="header">
          <div className="header-top-row">
            <button className="secondary-btn" type="button" onClick={onBack}>
              ← Back to Home
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={onGoToSquads}
            >
              Manage Squads
            </button>
          </div>
          <h1>Lineups &amp; Formations</h1>
        </header>
        <section className="card">
          <p>No teams found yet.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page lineups-page">
      <header className="header">
        <div className="header-top-row">
          <button className="secondary-btn" type="button" onClick={onBack}>
            ← Back to Home
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={onGoToSquads}
          >
            Manage Squads
          </button>
        </div>

        <h1>Lineups &amp; Formations</h1>
        <p className="subtitle">
          Design{" "}
          <strong>5-a-side and 11-a-side lineups</strong> for your Turf Kings
          teams. Everyone can move players around on this device to brainstorm
          shapes and take screenshots.
        </p>
      </header>

      <section className="card lineups-card">
        <div className="lineups-controls">
          {/* Game type toggle FIRST */}
          <div className="field-row inline-field">
            <label>Game type</label>
            <div className="segmented-toggle">
              <button
                type="button"
                className={`segmented-option ${
                  gameType === GAME_TYPE_5 ? "active" : ""
                }`}
                onClick={() => handleGameTypeClick(GAME_TYPE_5)}
              >
                5-a-side
              </button>
              <button
                type="button"
                className={`segmented-option ${
                  gameType === GAME_TYPE_11 ? "active" : ""
                }`}
                onClick={() => handleGameTypeClick(GAME_TYPE_11)}
              >
                11-a-side
              </button>
            </div>
          </div>

          {/* TEAM: buttons only for 5-a-side */}
          {gameType === GAME_TYPE_5 ? (
            <div className="field-row inline-field">
              <label>Team (5-a-side)</label>
              <div className="team-pill-row">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`team-pill-btn ${
                      t.id === selectedTeam.id ? "active" : ""
                    }`}
                    onClick={() => handleTeamClick(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="field-row inline-field">
              <label>11-a-side squad</label>
              <p className="muted small">
                Using full Turf Kings player pool{" "}
                <strong>({turfKingsPlayers.length} players)</strong>. Perfect
                for brainstorming XI ideas.
              </p>
            </div>
          )}

          <div className="field-row inline-field">
            <label>Formation</label>
            <select
              value={formation.id}
              onChange={handleFormationChange}
              className="lineups-select"
              disabled={!canEditLineups}
            >
              {Object.values(formationsMap).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="lineups-layout">
          {/* Pitch */}
          <div className="pitch-wrapper">
            <div className="pitch">
              <div className="pitch-centre-circle" />
              <div className="pitch-half-line" />
              <div className="pitch-box pitch-box-top" />
              <div className="pitch-box pitch-box-bottom" />

              {formation.positions.map((pos) => {
                const name = lineup.positions[pos.id] || "";
                const isSelected =
                  selectedPlayer &&
                  selectedPlayer.from === "pitch" &&
                  selectedPlayer.posId === pos.id;
                const photoData = name ? playerPhotos[name] : null;

                return (
                  <div
                    key={pos.id}
                    className={`pitch-position ${
                      name ? "has-player" : ""
                    } ${isSelected ? "selected" : ""}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onClick={() => handlePitchClick(pos.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleClearSpot(pos.id);
                    }}
                  >
                    <div className="player-token">
                      <div
                        className={`player-shirt ${
                          photoData ? "with-photo" : ""
                        }`}
                        style={
                          photoData
                            ? { backgroundImage: `url(${photoData})` }
                            : {}
                        }
                      />
                      <div className="player-label">
                        <span className="player-name">
                          {name || "Empty"}
                        </span>
                        <span className="position-tag">{pos.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="muted helper-text">
              Tap a bench player, then tap a spot on the pitch to place them.
              Double-click a spot to clear it.
            </p>
          </div>

          {/* Bench + photo upload */}
          <div className="bench-wrapper">
            <h3>Bench / Subs</h3>
            {benchPlayers.length === 0 ? (
              <p className="muted">No subs – full squad on the pitch.</p>
            ) : (
              <ul className="bench-list">
                {benchPlayers.map((p) => {
                  const isSelected =
                    selectedPlayer &&
                    selectedPlayer.from === "bench" &&
                    selectedPlayer.name === p;
                  return (
                    <li key={p}>
                      <button
                        type="button"
                        className={`bench-player ${
                          isSelected ? "selected" : ""
                        }`}
                        onClick={() => handleBenchClick(p)}
                        disabled={!canEditLineups}
                      >
                        {p}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="bench-note">
              <p className="muted">
                Lineups are saved on this device for each team and game type.
                When you return, the same shape will load.
              </p>
            </div>

            {/* Collapsible player photo section */}
            <div className="photo-toggle-row">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowPhotoPanel((v) => !v)}
              >
                {showPhotoPanel ? "Hide player photos" : "Show player photos"}
              </button>
            </div>

            {showPhotoPanel && (
              <div className="photo-upload-block">
                <h4>Player photo</h4>
                <p className="muted small">
                  Upload a profile picture for your card. Photos are stored in
                  the TurfKings database for future awards and player cards.
                </p>

                {/* Auth status / actions */}
                <div className="field-row">
                  {authUser ? (
                    <div className="muted small">
                      <p>
                        Signed in as <strong>{authUser.email}</strong>{" "}
                        {authUser.role === "captain"
                          ? "(captain – can update any player)."
                          : authUser.playerId
                          ? "(you can update your own card)."
                          : "(email not yet linked to a specific player – ask Nkululeko)."}
                      </p>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={signOut}
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <p className="muted small">
                      You are not signed in.{" "}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={signInWithGoogle}
                      >
                        Sign in with your Gmail
                      </button>{" "}
                      so uploads are linked to your player card.
                    </p>
                  )}
                </div>

                <div className="field-row">
                  <label>Player</label>
                  <select
                    value={photoPlayer}
                    onChange={(e) => {
                      setPhotoPlayer(e.target.value);
                      setPhotoMessage("");
                    }}
                  >
                    {playersForPhotoSelect.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-row">
                  <label>Upload image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFileChange}
                    disabled={uploadingPhoto}
                  />
                </div>

                {uploadingPhoto && (
                  <p className="muted small">Uploading photo…</p>
                )}
                {photoMessage && (
                  <p className="muted small">{photoMessage}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
