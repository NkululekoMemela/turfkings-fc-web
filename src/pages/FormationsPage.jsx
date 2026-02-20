// src/pages/FormationsPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";

// ---------------- HELPERS ----------------

// Title Case helper
function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normKey(x) {
  return String(x || "").trim().toLowerCase();
}

// Small helper for Firestore document ids (for photos)
function slugFromName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// ---------------- GAME TYPES ----------------
const GAME_TYPE_5 = "5";
const GAME_TYPE_11 = "11";

// Single source of truth for people
const MEMBERS_COLLECTION = "members";

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
    return buildDefaultLineup(players, defaultFormationId, formationsMap);
  }

  // new multi-mode shape
  const modeEntry = existing[gameType];
  if (modeEntry && formationsMap[modeEntry.formationId]) {
    return modeEntry;
  }
  return buildDefaultLineup(players, defaultFormationId, formationsMap);
}

export function FormationsPage({
  teams,
  currentMatch,
  playerPhotosByName = {},
  identity = null, // from EntryPage
  authUser = null,
  onBack,
  onGoToSquads,
}) {
  // Everyone can edit lineups
  const canEditLineups = true;

  // all saved lineups (per teamId, per game type)
  const [lineupsByTeam, setLineupsByTeam] = useState(() => loadSavedLineups());

  // which team is being shown (prefer the team A from current match if provided)
  const initialTeamId =
    currentMatch?.teamAId || (teams[0] ? teams[0].id : null);
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);

  // game type: 5-a-side by default, with optional 11-a-side
  const [gameType, setGameType] = useState(GAME_TYPE_5);

  const selectedTeam =
    teams.find((t) => t.id === selectedTeamId) || teams[0] || null;

  // ---------- MEMBERS FROM FIRESTORE (canonical people) ----------
  const [members, setMembers] = useState([]);

  useEffect(() => {
    const colRef = collection(db, MEMBERS_COLLECTION);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          const fullName = toTitleCase(data.fullName || data.name || "");
          const shortName = toTitleCase(
            data.shortName || data.displayName || ""
          );
          const aliases = Array.isArray(data.aliases)
            ? data.aliases.map((a) => toTitleCase(a)).filter(Boolean)
            : [];
          return {
            id: d.id,
            fullName,
            shortName,
            aliases,
            status: data.status || "active",
          };
        });

        const active = list.filter((m) => (m.status || "active") === "active");
        active.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setMembers(active);
      },
      (err) => {
        console.error("Error loading members for formations:", err);
      }
    );
    return () => unsub();
  }, []);

  // Build resolver maps so we can snap ANY old label to one canonical display name
  const memberResolver = useMemo(() => {
    const byAny = new Map(); // key -> member
    const firstNameCounts = new Map(); // firstNameLower -> count

    members.forEach((m) => {
      const keys = new Set();

      keys.add(normKey(m.id));
      if (m.fullName) keys.add(normKey(m.fullName));
      if (m.shortName) keys.add(normKey(m.shortName));
      (m.aliases || []).forEach((a) => keys.add(normKey(a)));

      // count first names for safe short matching
      const first = normKey((m.fullName || "").split(" ")[0]);
      if (first) firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);

      keys.forEach((k) => {
        if (k) byAny.set(k, m);
      });
    });

    function resolve(rawLabel) {
      const raw = toTitleCase(rawLabel || "");
      const k = normKey(raw);
      if (!k) return { display: "", member: null };

      // 1) exact match
      const exact = byAny.get(k);
      if (exact) return { display: exact.fullName || raw, member: exact };

      // 2) slug match
      const slug = normKey(slugFromName(raw));
      const bySlug = byAny.get(slug);
      if (bySlug) return { display: bySlug.fullName || raw, member: bySlug };

      // 3) first-name match ONLY if unique
      const first = normKey(raw.split(" ")[0]);
      if (first && firstNameCounts.get(first) === 1) {
        const candidate = byAny.get(first);
        if (candidate) return { display: candidate.fullName || raw, member: candidate };
      }

      // 4) fallback
      return { display: raw, member: null };
    }

    return { resolve };
  }, [members]);

  // Canonical display for any input name (FULL NAME for storage)
  const canonicalName = (raw) => memberResolver.resolve(raw).display;

  // UI-only: compact label (first name / shortName), but DO NOT change stored names
  const displayCompactName = (raw) => {
    if (!raw) return "";
    const resolved = memberResolver.resolve(raw);

    const m = resolved?.member;
    const full = resolved?.display || toTitleCase(raw);

    if (m) {
      const sn = String(m.shortName || "").trim();
      if (sn) return sn;
      return String(m.fullName || full).split(/\s+/)[0] || full;
    }

    return String(full).split(/\s+/)[0] || full;
  };

  // ---------------- photos (DB-backed + seeded from App) ----------------
  const [playerPhotos, setPlayerPhotos] = useState(playerPhotosByName || {});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [showPhotoPanel, setShowPhotoPanel] = useState(false); // collapsible

  useEffect(() => {
    if (!playerPhotosByName) return;
    setPlayerPhotos((prev) => ({
      ...prev,
      ...playerPhotosByName,
    }));
  }, [playerPhotosByName]);

  // Load ALL photos and re-key them to canonical member fullName where possible
  useEffect(() => {
    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        const rawPhotos = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (data?.photoData) {
            rawPhotos.push({
              docId: docSnap.id,
              name: data.name || "",
              photoData: data.photoData,
            });
          }
        });

        setPlayerPhotos((prev) => {
          const next = { ...prev };

          rawPhotos.forEach((p) => {
            const candidates = [
              p.name,
              toTitleCase(p.name),
              p.docId,
              toTitleCase(p.docId.replace(/_/g, " ")),
            ].filter(Boolean);

            let assignedKey = null;

            for (const c of candidates) {
              const resolved = memberResolver.resolve(c);
              if (resolved?.display) {
                assignedKey = resolved.display;
                break;
              }
            }

            const fallbackKey = toTitleCase(p.name || p.docId || "Unknown");
            next[assignedKey || fallbackKey] = p.photoData;
          });

          return next;
        });
      } catch (err) {
        console.error("Failed to load player photos:", err);
      }
    }
    loadPhotos();
  }, [memberResolver]);

  // ---------- VERIFIED PLAYER (for photo upload) ----------
  const verifiedPlayerName = useMemo(() => {
    const role = identity?.role || null;
    const isRealPlayer = role === "player" || role === "captain" || role === "admin";
    if (!isRealPlayer) return null;

    const rawName =
      identity.fullName ||
      identity.shortName ||
      identity.displayName ||
      identity.name ||
      null;

    if (!rawName) return null;
    return canonicalName(rawName);
  }, [identity, memberResolver]);

  const isVerifiedPlayer = !!verifiedPlayerName;
  const photoPlayer = verifiedPlayerName;

  const handlePhotoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isVerifiedPlayer || !photoPlayer) {
      setPhotoMessage(
        "We can't tell which player you are. Please verify your player identity on the home screen first."
      );
      e.target.value = "";
      return;
    }

    setPhotoMessage("");
    setUploadingPhoto(true);

    try {
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
          name: photoPlayer, // canonical full name
          teamId: selectedTeam ? selectedTeam.id : "turf_kings",
          photoData: dataUrl,
          updatedAt: serverTimestamp(),
          uploadedByEmail: authUser?.email || identity?.email || null,
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

  // ---------------- player pools (canonicalised) ----------------

  const dbPlayerNames = useMemo(() => {
    return members.map((m) => m.fullName).filter(Boolean);
  }, [members]);

  const turfKingsPlayers = useMemo(() => {
    const set = new Set();

    teams.forEach((t) => {
      (t.players || []).forEach((p) => {
        const canon = canonicalName(p);
        if (canon) set.add(canon);
      });
    });

    dbPlayerNames.forEach((name) => {
      const canon = canonicalName(name);
      if (canon) set.add(canon);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [teams, dbPlayerNames, memberResolver]);

  const canonicalTeams = useMemo(() => {
    return (teams || []).map((t) => ({
      ...t,
      players: (t.players || []).map((p) => canonicalName(p)).filter(Boolean),
      captain: canonicalName(t.captain || ""),
    }));
  }, [teams, memberResolver]);

  const selectedTeamCanonical =
    canonicalTeams.find((t) => t.id === selectedTeamId) || canonicalTeams[0] || null;

  const formationsMap = gameType === GAME_TYPE_11 ? FORMATIONS_11 : FORMATIONS_5;
  const defaultFormationId =
    gameType === GAME_TYPE_11 ? DEFAULT_FORMATION_ID_11 : DEFAULT_FORMATION_ID_5;

  const playerPool =
    gameType === GAME_TYPE_11 ? turfKingsPlayers : selectedTeamCanonical?.players || [];

  const [lineup, setLineup] = useState(() =>
    resolveTeamLineup(
      selectedTeamCanonical,
      gameType,
      lineupsByTeam,
      formationsMap,
      defaultFormationId,
      playerPool
    )
  );

  useEffect(() => {
    if (!selectedTeamCanonical) return;

    const next = resolveTeamLineup(
      selectedTeamCanonical,
      gameType,
      lineupsByTeam,
      formationsMap,
      defaultFormationId,
      playerPool
    );

    const canonPositions = {};
    Object.keys(next.positions || {}).forEach((posId) => {
      const v = next.positions[posId];
      canonPositions[posId] = v ? canonicalName(v) : null;
    });

    const canonicalised = { ...next, positions: canonPositions };

    setLineup(canonicalised);
    setSelectedPlayer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId, gameType, lineupsByTeam, memberResolver, canonicalTeams, turfKingsPlayers]);

  const formation =
    formationsMap[lineup.formationId] ||
    formationsMap[defaultFormationId] ||
    Object.values(formationsMap)[0];

  // -------- selection state --------
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const allPlayers =
    gameType === GAME_TYPE_11 ? turfKingsPlayers : selectedTeamCanonical?.players || [];

  const assignedNames = new Set(Object.values(lineup.positions).filter(Boolean));
  const benchPlayers = allPlayers.filter((p) => !assignedNames.has(p));

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

    const canonPositions = {};
    Object.keys(updatedLineup.positions || {}).forEach((posId) => {
      const v = updatedLineup.positions[posId];
      canonPositions[posId] = v ? canonicalName(v) : null;
    });
    const canonLineup = { ...updatedLineup, positions: canonPositions };

    setLineupsByTeam((prev) => {
      const prevEntry = prev[teamId];
      let nextEntry;

      if (!prevEntry) {
        nextEntry =
          gameType === GAME_TYPE_11
            ? { [GAME_TYPE_11]: canonLineup }
            : { [GAME_TYPE_5]: canonLineup };
      } else if (prevEntry.formationId) {
        if (gameType === GAME_TYPE_5) {
          nextEntry = { [GAME_TYPE_5]: canonLineup };
        } else {
          nextEntry = { [GAME_TYPE_5]: prevEntry, [GAME_TYPE_11]: canonLineup };
        }
      } else {
        nextEntry = { ...prevEntry, [gameType]: canonLineup };
      }

      const updatedMap = { ...prev, [teamId]: nextEntry };
      saveLineups(updatedMap);
      return updatedMap;
    });
  };

  const handleFormationChange = (e) => {
    if (!canEditLineups) return;
    const newFormationId = e.target.value;
    const formationsForType = gameType === GAME_TYPE_11 ? FORMATIONS_11 : FORMATIONS_5;
    const newFormation =
      formationsForType[newFormationId] ||
      formationsForType[Object.keys(formationsForType)[0]];

    const currentPlayersInOrder = formation.positions
      .map((pos) => lineup.positions[pos.id])
      .filter(Boolean);

    const newPositions = {};
    newFormation.positions.forEach((pos, idx) => {
      newPositions[pos.id] = currentPlayersInOrder[idx] || null;
    });

    const updated = { formationId: newFormation.id, positions: newPositions };
    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }
    setSelectedPlayer(null);
  };

  const handleBenchClick = (playerName) => {
    if (!canEditLineups) return;
    if (selectedPlayer && selectedPlayer.from === "bench" && selectedPlayer.name === playerName) {
      setSelectedPlayer(null);
      return;
    }
    setSelectedPlayer({ from: "bench", name: playerName });
  };

  const handlePitchClick = (posId) => {
    if (!canEditLineups) return;

    const currentAtPos = lineup.positions[posId] || null;

    if (!selectedPlayer) {
      if (!currentAtPos) return;
      setSelectedPlayer({ from: "pitch", name: currentAtPos, posId });
      return;
    }

    const newPositions = { ...lineup.positions };

    if (selectedPlayer.from === "bench") {
      const name = selectedPlayer.name;

      Object.keys(newPositions).forEach((key) => {
        if (newPositions[key] === name) newPositions[key] = null;
      });

      newPositions[posId] = name;
    } else if (selectedPlayer.from === "pitch") {
      const fromPos = selectedPlayer.posId;
      const fromName = selectedPlayer.name;
      const toName = currentAtPos;

      newPositions[fromPos] = toName || null;
      newPositions[posId] = fromName;
    }

    const updated = { ...lineup, positions: newPositions };
    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }

    setSelectedPlayer(null);
  };

  const handleClearSpot = (posId) => {
    if (!canEditLineups) return;
    const newPositions = { ...lineup.positions, [posId]: null };
    const updated = { ...lineup, positions: newPositions };
    setLineup(updated);
    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }
    setSelectedPlayer(null);
  };

  if (!selectedTeamCanonical) {
    return (
      <div className="page lineups-page">
        <header className="header">
          <div className="header-top-row">
            <button className="secondary-btn" type="button" onClick={onBack}>
              ← Back to Home
            </button>
            <button className="primary-btn" type="button" onClick={onGoToSquads}>
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
          <button className="primary-btn" type="button" onClick={onGoToSquads}>
            Manage Squads
          </button>
        </div>

        <h1>Lineups &amp; Formations</h1>
        <p className="subtitle">
          Design <strong>5-a-side and 11-a-side lineups</strong> for your Turf Kings
          teams. Everyone can move players around on this device to brainstorm
          shapes and take screenshots.
        </p>
      </header>

      <section className="card lineups-card">
        <div className="lineups-controls">
          <div className="field-row inline-field">
            <label>Game type</label>
            <div className="segmented-toggle">
              <button
                type="button"
                className={`segmented-option ${gameType === GAME_TYPE_5 ? "active" : ""}`}
                onClick={() => handleGameTypeClick(GAME_TYPE_5)}
              >
                5-a-side
              </button>
              <button
                type="button"
                className={`segmented-option ${gameType === GAME_TYPE_11 ? "active" : ""}`}
                onClick={() => handleGameTypeClick(GAME_TYPE_11)}
              >
                11-a-side
              </button>
            </div>
          </div>

          {gameType === GAME_TYPE_5 ? (
            <div className="field-row inline-field">
              <label>Team (5-a-side)</label>
              <div className="team-pill-row">
                {canonicalTeams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`team-pill-btn ${t.id === selectedTeamCanonical.id ? "active" : ""}`}
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
                <strong>({turfKingsPlayers.length} players)</strong>.
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

                // photos keyed by canonical full name
                const photoData = name ? playerPhotos[name] : null;

                return (
                  <div
                    key={pos.id}
                    className={`pitch-position ${name ? "has-player" : ""} ${isSelected ? "selected" : ""}`}
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
                        style={photoData ? { backgroundImage: `url(${photoData})` } : {}}
                      />
                      <div className="player-label">
                        {/* ✅ UI only: compact (first/short). Storage remains full name */}
                        <span className="player-name">
                          {name ? displayCompactName(name) : "Empty"}
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
                        className={`bench-player ${isSelected ? "selected" : ""}`}
                        onClick={() => handleBenchClick(p)}
                        disabled={!canEditLineups}
                      >
                        {/* ✅ UI only */}
                        {displayCompactName(p)}
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

                <div className="field-row">
                  {isVerifiedPlayer ? (
                    <p className="muted small">
                      Uploading as <strong>{verifiedPlayerName}</strong>.
                    </p>
                  ) : (
                    <p className="error-text small">
                      We can&apos;t tell which player you are. Please verify your
                      player identity on the home screen before uploading a photo.
                    </p>
                  )}
                </div>

                <div className="field-row">
                  <label>Upload image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFileChange}
                    disabled={uploadingPhoto || !isVerifiedPlayer}
                  />
                </div>

                {uploadingPhoto && <p className="muted small">Uploading photo…</p>}
                {photoMessage && <p className="muted small">{photoMessage}</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
