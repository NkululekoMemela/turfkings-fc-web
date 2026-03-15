// src/pages/FormationsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import {
  GAME_TYPE_5,
  GAME_TYPE_11,
  FORMATIONS_5,
  FORMATIONS_11,
  DEFAULT_FORMATION_ID_5,
  DEFAULT_FORMATION_ID_11,
  loadSavedLineups,
  saveLineups,
  writeLineupVariant,
  LINEUP_SAVE_ROLE_CAPTAIN,
  LINEUP_SAVE_ROLE_ADMIN,
  LINEUP_SAVE_ROLE_GENERAL,
} from "../core/lineups.js";

// ---------------- HELPERS ----------------

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

function slugFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
}

function uniqueByLower(list = []) {
  const seen = new Set();
  const out = [];

  list.forEach((item) => {
    const value = String(item || "").trim();
    if (!value) return;
    const key = normKey(value);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });

  return out;
}

function removeNameFromList(list = [], name = "") {
  const target = normKey(name);
  return (list || []).filter((item) => normKey(item) !== target);
}

function moveNameToFront(list = [], name = "") {
  const clean = String(name || "").trim();
  if (!clean) return uniqueByLower(list);
  return uniqueByLower([clean, ...removeNameFromList(list, clean)]);
}

function swapNamesInList(list = [], a = "", b = "") {
  const aKey = normKey(a);
  const bKey = normKey(b);

  const swapped = (list || []).map((item) => {
    const key = normKey(item);
    if (key === aKey) return b;
    if (key === bKey) return a;
    return item;
  });

  return uniqueByLower(swapped);
}

function buildOrderedBenchPool(unassignedPlayers = [], benchSnapshot = []) {
  const pool = uniqueByLower(unassignedPlayers);
  const poolKeys = new Set(pool.map((p) => normKey(p)));

  const orderedFromSnapshot = uniqueByLower(benchSnapshot).filter((name) =>
    poolKeys.has(normKey(name))
  );

  const already = new Set(orderedFromSnapshot.map((p) => normKey(p)));
  const remaining = pool.filter((name) => !already.has(normKey(name)));

  return [...orderedFromSnapshot, ...remaining];
}

function buildDefaultLineupLocal(playerList, formationId, formationsMap) {
  const formation =
    formationsMap[formationId] ||
    formationsMap[Object.keys(formationsMap)[0]];

  const players = playerList || [];
  const positions = {};

  formation.positions.forEach((pos, idx) => {
    positions[pos.id] = players[idx] || null;
  });

  return {
    formationId: formation.id,
    positions,
    guestPlayers: [],
    benchSnapshot: [],
    meta: {
      savedByRole: LINEUP_SAVE_ROLE_GENERAL,
      savedByEmail: null,
      savedByName: null,
      savedAt: null,
      teamCaptainPreferred: false,
    },
  };
}

function sanitizeLineupShapeLocal(
  lineup,
  formationsMap,
  defaultFormationId,
  playerPool = []
) {
  if (!lineup || typeof lineup !== "object") {
    return buildDefaultLineupLocal(playerPool, defaultFormationId, formationsMap);
  }

  const formationId =
    lineup.formationId && formationsMap[lineup.formationId]
      ? lineup.formationId
      : defaultFormationId;

  const formation =
    formationsMap[formationId] ||
    formationsMap[Object.keys(formationsMap)[0]];

  const cleanPositions = {};
  formation.positions.forEach((pos) => {
    cleanPositions[pos.id] = lineup?.positions?.[pos.id]
      ? toTitleCase(lineup.positions[pos.id])
      : null;
  });

  return {
    formationId: formation.id,
    positions: cleanPositions,
    guestPlayers: uniqueByLower(lineup.guestPlayers || []),
    benchSnapshot: uniqueByLower(lineup.benchSnapshot || []),
    meta: {
      savedByRole:
        lineup?.meta?.savedByRole || LINEUP_SAVE_ROLE_GENERAL,
      savedByEmail: lineup?.meta?.savedByEmail || null,
      savedByName: lineup?.meta?.savedByName || null,
      savedAt: lineup?.meta?.savedAt || null,
      teamCaptainPreferred: !!lineup?.meta?.teamCaptainPreferred,
    },
  };
}

function getSavedAtMs(lineup) {
  const raw = lineup?.meta?.savedAt || "";
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function getRoleTieBreaker(role) {
  if (role === LINEUP_SAVE_ROLE_CAPTAIN) return 3;
  if (role === LINEUP_SAVE_ROLE_ADMIN) return 2;
  if (role === LINEUP_SAVE_ROLE_GENERAL) return 1;
  return 0;
}

function pickLatestStoredVariant(modeEntry) {
  if (!modeEntry || typeof modeEntry !== "object") return null;

  if (modeEntry.formationId) {
    return modeEntry;
  }

  const variants = modeEntry.variants || {};
  const candidates = Object.entries(variants)
    .map(([role, lineup]) => ({
      role,
      lineup,
      savedAtMs: getSavedAtMs(lineup),
      tieBreaker: getRoleTieBreaker(role),
    }))
    .filter((x) => x.lineup);

  if (candidates.length === 0) {
    return modeEntry.default || null;
  }

  candidates.sort((a, b) => {
    if (b.savedAtMs !== a.savedAtMs) return b.savedAtMs - a.savedAtMs;
    return b.tieBreaker - a.tieBreaker;
  });

  return candidates[0].lineup;
}

function getCurrentDefaultVariantInfoLocal(lineupsByTeam, teamId, gameType) {
  const teamEntry = lineupsByTeam?.[teamId];
  if (!teamEntry) return null;

  if (teamEntry.formationId) {
    return {
      role: LINEUP_SAVE_ROLE_GENERAL,
      lineup: teamEntry,
    };
  }

  const modeEntry = teamEntry?.[gameType];
  if (!modeEntry) return null;

  const variants = modeEntry.variants || {};
  const candidates = Object.entries(variants)
    .map(([role, lineup]) => ({
      role,
      lineup,
      savedAtMs: lineup?.meta?.savedAt
        ? new Date(lineup.meta.savedAt).getTime()
        : 0,
      tieBreaker: getRoleTieBreaker(role),
    }))
    .filter((x) => x.lineup);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.savedAtMs !== a.savedAtMs) return b.savedAtMs - a.savedAtMs;
    return b.tieBreaker - a.tieBreaker;
  });

  return {
    role: candidates[0].role,
    lineup: candidates[0].lineup,
  };
}

function resolveLatestPreferredTeamLineup(
  team,
  gameType,
  lineupsByTeam,
  formationsMap,
  defaultFormationId,
  playerPool
) {
  const players = playerPool || [];
  if (!team) {
    return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
  }

  const existing = lineupsByTeam?.[team.id];
  if (!existing) {
    return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
  }

  if (existing.formationId) {
    if (gameType === GAME_TYPE_5 && formationsMap[existing.formationId]) {
      return sanitizeLineupShapeLocal(
        existing,
        formationsMap,
        defaultFormationId,
        players
      );
    }
    return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
  }

  const modeEntry = existing?.[gameType];
  const chosen = pickLatestStoredVariant(modeEntry);

  if (chosen) {
    return sanitizeLineupShapeLocal(
      chosen,
      formationsMap,
      defaultFormationId,
      players
    );
  }

  return buildDefaultLineupLocal(players, defaultFormationId, formationsMap);
}

function getSaveRole(
  identity,
  authUser,
  selectedTeamCanonical,
  gameType,
  canonicalName
) {
  const playerId = String(
    authUser?.playerId ||
      authUser?.memberId ||
      identity?.playerId ||
      identity?.memberId ||
      ""
  )
    .trim()
    .toLowerCase();

  const teamCaptainId = String(selectedTeamCanonical?.captainId || "")
    .trim()
    .toLowerCase();

  const explicitRole = String(
    authUser?.role || identity?.role || ""
  ).trim().toLowerCase();

  const displayName =
    authUser?.fullName ||
    identity?.fullName ||
    identity?.displayName ||
    identity?.shortName ||
    identity?.name ||
    null;

  const canonicalDisplayName = displayName ? canonicalName(displayName) : null;

  if (gameType === GAME_TYPE_11 && explicitRole === "admin") {
    return {
      savedByRole: LINEUP_SAVE_ROLE_CAPTAIN,
      teamCaptainPreferred: true,
      savedByEmail:
        String(authUser?.email || identity?.email || "").trim() || null,
      savedByName: canonicalDisplayName || displayName || null,
    };
  }

  if (
    gameType === GAME_TYPE_5 &&
    teamCaptainId &&
    playerId &&
    playerId === teamCaptainId
  ) {
    return {
      savedByRole: LINEUP_SAVE_ROLE_CAPTAIN,
      teamCaptainPreferred: true,
      savedByEmail:
        String(authUser?.email || identity?.email || "").trim() || null,
      savedByName: canonicalDisplayName || displayName || null,
    };
  }

  if (explicitRole === "admin") {
    return {
      savedByRole: LINEUP_SAVE_ROLE_ADMIN,
      teamCaptainPreferred: false,
      savedByEmail:
        String(authUser?.email || identity?.email || "").trim() || null,
      savedByName: canonicalDisplayName || displayName || null,
    };
  }

  return {
    savedByRole: LINEUP_SAVE_ROLE_GENERAL,
    teamCaptainPreferred: false,
    savedByEmail:
      String(authUser?.email || identity?.email || "").trim() || null,
    savedByName: canonicalDisplayName || displayName || null,
  };
}

function makeSavedLineup(
  updatedLineup,
  canonicalName,
  identity,
  authUser,
  selectedTeamCanonical,
  gameType
) {
  const canonPositions = {};
  Object.keys(updatedLineup.positions || {}).forEach((posId) => {
    const v = updatedLineup.positions[posId];
    canonPositions[posId] = v ? canonicalName(v) : null;
  });

  const metaBits = getSaveRole(
    identity,
    authUser,
    selectedTeamCanonical,
    gameType,
    canonicalName
  );

  return {
    ...updatedLineup,
    positions: canonPositions,
    guestPlayers: updatedLineup.guestPlayers || [],
    benchSnapshot: updatedLineup.benchSnapshot || [],
    meta: {
      savedByRole: metaBits.savedByRole,
      savedByEmail: metaBits.savedByEmail,
      savedByName: metaBits.savedByName,
      savedAt: new Date().toISOString(),
      teamCaptainPreferred: metaBits.teamCaptainPreferred,
    },
  };
}

function PlayerBenchChip({
  name,
  isSelected,
  onClick,
  photoData,
  disabled = false,
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

      <span>{name}</span>
    </button>
  );
}

// Single source of truth for people across this page
const PLAYERS_COLLECTION = "players";
const MAX_SUBS = 5;
const LONG_PRESS_MS = 650;

export function FormationsPage({
  teams,
  currentMatch,
  playerPhotosByName = {},
  identity = null,
  authUser = null,
  onBack,
  onGoToSquads,
}) {
  const canEditLineups = true;

  const [lineupsByTeam, setLineupsByTeam] = useState(() => loadSavedLineups());

  const initialTeamId =
    currentMatch?.teamAId || (teams[0] ? teams[0].id : null);
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);

  const [gameType, setGameType] = useState(GAME_TYPE_5);

  const selectedTeam =
    teams.find((t) => t.id === selectedTeamId) || teams[0] || null;

  const exportRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const [savingFormationImage, setSavingFormationImage] = useState(false);

  // ---------- PLAYERS FROM FIRESTORE ----------
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const colRef = collection(db, PLAYERS_COLLECTION);

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};

          const fullName = toTitleCase(
            data.fullName ||
              data.displayName ||
              data.name ||
              data.playerName ||
              ""
          );

          const shortName = toTitleCase(
            data.shortName ||
              data.name ||
              data.displayName ||
              firstNameOf(fullName) ||
              fullName
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

        const active = list.filter(
          (p) => String(p.status || "active").toLowerCase() === "active"
        );

        active.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setPlayers(active);
      },
      (err) => {
        console.error("Error loading players for formations:", err);
      }
    );

    return () => unsub();
  }, []);

  const playerResolver = useMemo(() => {
    const byAny = new Map();
    const firstNameCounts = new Map();

    players.forEach((p) => {
      const keys = new Set();

      const addKey = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return;

        const pretty = toTitleCase(raw);

        keys.add(normKey(raw));
        keys.add(normKey(pretty));
        keys.add(normKey(slugFromName(raw)));
        keys.add(normKey(slugFromName(pretty)));

        const first = normKey(firstNameOf(pretty));
        if (first) {
          firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
          keys.add(first);
        }
      };

      addKey(p.id);
      addKey(p.fullName);
      addKey(p.shortName);
      (p.aliases || []).forEach((a) => addKey(a));

      keys.forEach((k) => {
        if (k && !byAny.has(k)) {
          byAny.set(k, p);
        }
      });
    });

    function resolve(rawLabel) {
      const raw = toTitleCase(rawLabel || "");
      const k = normKey(raw);
      if (!k) return { display: "", player: null };

      const exact = byAny.get(k);
      if (exact) return { display: exact.fullName || raw, player: exact };

      const slug = normKey(slugFromName(raw));
      const bySlug = byAny.get(slug);
      if (bySlug) return { display: bySlug.fullName || raw, player: bySlug };

      const first = normKey(firstNameOf(raw));
      if (first && firstNameCounts.get(first) === 1) {
        const candidate = byAny.get(first);
        if (candidate) {
          return { display: candidate.fullName || raw, player: candidate };
        }
      }

      return { display: raw, player: null };
    }

    return { resolve };
  }, [players]);

  const canonicalName = (raw) => playerResolver.resolve(raw).display;

  const displayCompactName = (raw) => {
    if (!raw) return "";
    const resolved = playerResolver.resolve(raw);

    const p = resolved?.player;
    const full = resolved?.display || toTitleCase(raw);

    if (p) {
      const sn = String(p.shortName || "").trim();
      if (sn) return sn;
      return String(p.fullName || full).split(/\s+/)[0] || full;
    }

    return String(full).split(/\s+/)[0] || full;
  };

  // ---------------- photos ----------------
  const [playerPhotos, setPlayerPhotos] = useState(playerPhotosByName || {});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [showPhotoPanel, setShowPhotoPanel] = useState(false);

  useEffect(() => {
    if (!playerPhotosByName) return;
    setPlayerPhotos((prev) => ({
      ...prev,
      ...playerPhotosByName,
    }));
  }, [playerPhotosByName]);

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
              toTitleCase(String(p.docId || "").replace(/_/g, " ")),
              firstNameOf(p.name),
            ].filter(Boolean);

            let assignedKey = null;

            for (const c of candidates) {
              const resolved = playerResolver.resolve(c);
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
  }, [playerResolver]);

  const getPlayerPhoto = (name) => {
    if (!name) return null;

    const canon = canonicalName(name);
    const compact = displayCompactName(name);

    const candidates = [
      canon,
      compact,
      firstNameOf(canon),
      firstNameOf(compact),
      slugFromName(canon),
      slugFromName(compact),
      name,
      toTitleCase(name),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (playerPhotos[candidate]) return playerPhotos[candidate];
      const key = Object.keys(playerPhotos).find(
        (k) => normKey(k) === normKey(candidate)
      );
      if (key && playerPhotos[key]) return playerPhotos[key];
    }

    return null;
  };

  // ---------- VERIFIED PLAYER ----------
  const verifiedPlayerName = useMemo(() => {
    const role = identity?.role || authUser?.role || null;
    const isRealPlayer =
      role === "player" || role === "captain" || role === "admin";

    if (!isRealPlayer) return null;

    const rawName =
      authUser?.fullName ||
      identity?.fullName ||
      identity?.shortName ||
      identity?.displayName ||
      identity?.name ||
      null;

    if (!rawName) return null;
    return canonicalName(rawName);
  }, [identity, authUser, playerResolver]);

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
          name: photoPlayer,
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

  // ---------------- player pools ----------------
  const dbPlayerNames = useMemo(() => {
    return players.map((p) => p.fullName).filter(Boolean);
  }, [players]);

  const turfKingsPlayers = useMemo(() => {
    const set = new Set();

    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const raw =
          typeof p === "string" ? p : p?.name || p?.displayName || "";
        const canon = canonicalName(raw);
        if (canon) set.add(canon);
      });
    });

    dbPlayerNames.forEach((name) => {
      const canon = canonicalName(name);
      if (canon) set.add(canon);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [teams, dbPlayerNames, playerResolver]);

  const canonicalTeams = useMemo(() => {
    return (teams || []).map((t) => ({
      ...t,
      players: (t.players || [])
        .map((p) => {
          const raw =
            typeof p === "string" ? p : p?.name || p?.displayName || "";
          return canonicalName(raw);
        })
        .filter(Boolean),
      captain: canonicalName(t.captain || ""),
      captainId: t.captainId || null,
    }));
  }, [teams, playerResolver]);

  const selectedTeamCanonical =
    canonicalTeams.find((t) => t.id === selectedTeamId) ||
    canonicalTeams[0] ||
    null;

  // IMPORTANT: this must come AFTER selectedTeamCanonical exists
  const loggedInCanonicalName = useMemo(() => {
    const rawName =
      authUser?.fullName ||
      identity?.fullName ||
      identity?.displayName ||
      identity?.shortName ||
      identity?.name ||
      "";
    return rawName ? canonicalName(rawName) : "";
  }, [authUser, identity, canonicalName]);

  const effectiveCaptainName = useMemo(() => {
    const explicitRole = String(
      authUser?.role || identity?.role || ""
    ).trim().toLowerCase();

    if (gameType === GAME_TYPE_11 && explicitRole === "admin") {
      return loggedInCanonicalName || "";
    }

    if (gameType === GAME_TYPE_5) {
      return selectedTeamCanonical?.captain || "";
    }

    return "";
  }, [authUser, identity, gameType, loggedInCanonicalName, selectedTeamCanonical]);

  const isCaptainPlayer = (name) => {
    return normKey(name) === normKey(effectiveCaptainName);
  };

  const withCaptainTag = (name) => {
    const label = displayCompactName(name);
    return isCaptainPlayer(name) ? `${label} (C)` : label;
  };

  const formationsMap =
    gameType === GAME_TYPE_11 ? FORMATIONS_11 : FORMATIONS_5;

  const defaultFormationId =
    gameType === GAME_TYPE_11
      ? DEFAULT_FORMATION_ID_11
      : DEFAULT_FORMATION_ID_5;

  const playerPool =
    gameType === GAME_TYPE_11
      ? turfKingsPlayers
      : selectedTeamCanonical?.players || [];

  const buildResolvedLineup = (teamId, targetGameType) => {
    const targetTeam =
      canonicalTeams.find((t) => t.id === teamId) || canonicalTeams[0] || null;

    const targetFormationsMap =
      targetGameType === GAME_TYPE_11 ? FORMATIONS_11 : FORMATIONS_5;

    const targetDefaultFormationId =
      targetGameType === GAME_TYPE_11
        ? DEFAULT_FORMATION_ID_11
        : DEFAULT_FORMATION_ID_5;

    const targetPlayerPool =
      targetGameType === GAME_TYPE_11
        ? turfKingsPlayers
        : targetTeam?.players || [];

    const next = resolveLatestPreferredTeamLineup(
      targetTeam,
      targetGameType,
      lineupsByTeam,
      targetFormationsMap,
      targetDefaultFormationId,
      targetPlayerPool
    );

    const canonPositions = {};
    Object.keys(next.positions || {}).forEach((posId) => {
      const v = next.positions[posId];
      canonPositions[posId] = v ? canonicalName(v) : null;
    });

    return {
      ...next,
      positions: canonPositions,
      guestPlayers: next.guestPlayers || [],
      benchSnapshot: next.benchSnapshot || [],
      meta: next.meta || {
        savedByRole: LINEUP_SAVE_ROLE_GENERAL,
        savedByEmail: null,
        savedByName: null,
        savedAt: null,
        teamCaptainPreferred: false,
      },
    };
  };

  const [lineup, setLineup] = useState(() =>
    buildResolvedLineup(selectedTeamId, gameType)
  );

  const [selectedPlayer, setSelectedPlayer] = useState(null);

  useEffect(() => {
    if (!selectedTeamCanonical) return;
    setLineup(buildResolvedLineup(selectedTeamId, gameType));
    setSelectedPlayer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedTeamId,
    gameType,
    lineupsByTeam,
    playerResolver,
    canonicalTeams,
    turfKingsPlayers,
  ]);

  const formation =
    formationsMap[lineup.formationId] ||
    formationsMap[defaultFormationId] ||
    Object.values(formationsMap)[0];

  const allPlayers =
    gameType === GAME_TYPE_11
      ? turfKingsPlayers
      : selectedTeamCanonical?.players || [];

  const assignedNames = new Set(Object.values(lineup.positions).filter(Boolean));
  const rawUnassignedPlayers = allPlayers.filter((p) => !assignedNames.has(p));

  const orderedBenchPool = useMemo(
    () => buildOrderedBenchPool(rawUnassignedPlayers, lineup.benchSnapshot || []),
    [rawUnassignedPlayers, lineup.benchSnapshot]
  );

  const subsPlayers = orderedBenchPool.slice(0, MAX_SUBS);
  const reservePlayers = orderedBenchPool.slice(MAX_SUBS);

  const handleTeamClick = (teamId) => {
    const nextLineup = buildResolvedLineup(teamId, gameType);
    setSelectedTeamId(teamId);
    setLineup(nextLineup);
    setSelectedPlayer(null);
    setPhotoMessage("");
  };

  const handleGameTypeClick = (type) => {
    const nextLineup = buildResolvedLineup(selectedTeamId, type);
    setGameType(type);
    setLineup(nextLineup);
    setSelectedPlayer(null);
    setPhotoMessage("");
  };

  const saveTeamLineup = (teamId, updatedLineup) => {
    if (!teamId) return;

    const previewLineup = makeSavedLineup(
      {
        ...lineup,
        ...updatedLineup,
        guestPlayers: updatedLineup.guestPlayers || lineup.guestPlayers || [],
        benchSnapshot:
          updatedLineup.benchSnapshot || lineup.benchSnapshot || [],
      },
      canonicalName,
      identity,
      authUser,
      selectedTeamCanonical,
      gameType
    );

    const saveRole =
      previewLineup?.meta?.savedByRole || LINEUP_SAVE_ROLE_GENERAL;

    const currentDefaultInfo = getCurrentDefaultVariantInfoLocal(
      lineupsByTeam,
      teamId,
      gameType
    );

    const currentDefaultRole = currentDefaultInfo?.role || "";
    const currentDefaultName =
      currentDefaultInfo?.lineup?.meta?.savedByName || "captain";
    const currentDefaultTime =
      currentDefaultInfo?.lineup?.meta?.savedAt || "";

    const isAdminTryingToOverrideCaptain =
      saveRole === LINEUP_SAVE_ROLE_ADMIN &&
      currentDefaultRole === LINEUP_SAVE_ROLE_CAPTAIN;

    if (isAdminTryingToOverrideCaptain) {
      const ok = window.confirm(
        `The current default squad was last set by ${currentDefaultName}${
          currentDefaultTime
            ? ` on ${new Date(currentDefaultTime).toLocaleString()}`
            : ""
        }.\n\nHave you agreed with the captain to change his default squad?`
      );

      if (!ok) return;
    }

    setLineupsByTeam((prev) => {
      const updatedMap = writeLineupVariant(
        prev,
        teamId,
        gameType,
        previewLineup,
        saveRole
      );
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

    const currentPlayersInOrder = formation.positions
      .map((pos) => lineup.positions[pos.id])
      .filter(Boolean);

    const newPositions = {};
    newFormation.positions.forEach((pos, idx) => {
      newPositions[pos.id] = currentPlayersInOrder[idx] || null;
    });

    const updated = {
      ...lineup,
      formationId: newFormation.id,
      positions: newPositions,
    };

    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }

    setSelectedPlayer(null);
  };

  const handleSubClick = (playerName) => {
    if (!canEditLineups) return;

    if (
      selectedPlayer &&
      selectedPlayer.from === "sub" &&
      selectedPlayer.name === playerName
    ) {
      setSelectedPlayer(null);
      return;
    }

    if (
      selectedPlayer &&
      selectedPlayer.from === "reserve" &&
      selectedPlayer.name
    ) {
      const swappedBench = swapNamesInList(
        orderedBenchPool,
        playerName,
        selectedPlayer.name
      );

      const updated = {
        ...lineup,
        benchSnapshot: swappedBench,
      };

      setLineup(updated);

      if (selectedTeamCanonical) {
        saveTeamLineup(selectedTeamCanonical.id, updated);
      }

      setSelectedPlayer(null);
      return;
    }

    setSelectedPlayer({ from: "sub", name: playerName });
  };

  const handleReserveClick = (playerName) => {
    if (!canEditLineups) return;

    if (
      selectedPlayer &&
      selectedPlayer.from === "reserve" &&
      selectedPlayer.name === playerName
    ) {
      setSelectedPlayer(null);
      return;
    }

    if (
      selectedPlayer &&
      selectedPlayer.from === "sub" &&
      selectedPlayer.name
    ) {
      const swappedBench = swapNamesInList(
        orderedBenchPool,
        selectedPlayer.name,
        playerName
      );

      const updated = {
        ...lineup,
        benchSnapshot: swappedBench,
      };

      setLineup(updated);

      if (selectedTeamCanonical) {
        saveTeamLineup(selectedTeamCanonical.id, updated);
      }

      setSelectedPlayer(null);
      return;
    }

    setSelectedPlayer({ from: "reserve", name: playerName });
  };

  const handlePitchClick = (posId) => {
    if (!canEditLineups) return;

    const currentAtPos = lineup.positions[posId] || null;

    if (!selectedPlayer) {
      if (!currentAtPos) return;
      setSelectedPlayer({ from: "pitch", name: currentAtPos, posId });
      return;
    }

    if (selectedPlayer.from === "reserve") {
      window.alert(
        "A reserve must first swap with a sub before entering the lineup."
      );
      return;
    }

    const newPositions = { ...lineup.positions };
    let nextBenchSnapshot = [...orderedBenchPool];

    if (selectedPlayer.from === "sub") {
      const incoming = selectedPlayer.name;
      const outgoing = currentAtPos;

      Object.keys(newPositions).forEach((key) => {
        if (newPositions[key] === incoming) newPositions[key] = null;
      });

      newPositions[posId] = incoming;
      nextBenchSnapshot = removeNameFromList(nextBenchSnapshot, incoming);

      if (outgoing) {
        nextBenchSnapshot = moveNameToFront(nextBenchSnapshot, outgoing);
      }
    } else if (selectedPlayer.from === "pitch") {
      const fromPos = selectedPlayer.posId;
      const fromName = selectedPlayer.name;
      const toName = currentAtPos;

      newPositions[fromPos] = toName || null;
      newPositions[posId] = fromName;
    }

    const updated = {
      ...lineup,
      positions: newPositions,
      benchSnapshot: nextBenchSnapshot,
    };

    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }

    setSelectedPlayer(null);
  };

  const handleClearSpot = (posId) => {
    if (!canEditLineups) return;

    const clearedName = lineup.positions[posId] || null;
    const newPositions = { ...lineup.positions, [posId]: null };

    const updated = {
      ...lineup,
      positions: newPositions,
      benchSnapshot: clearedName
        ? moveNameToFront(orderedBenchPool, clearedName)
        : orderedBenchPool,
    };

    setLineup(updated);

    if (selectedTeamCanonical) {
      saveTeamLineup(selectedTeamCanonical.id, updated);
    }

    setSelectedPlayer(null);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const saveFormationImage = async () => {
    try {
      if (!exportRef.current) return;

      setSavingFormationImage(true);

      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#0f172a",
      });

      const filename = `${slugFromName(
        selectedTeamCanonical?.label || "team"
      )}_${gameType === GAME_TYPE_5 ? "5aside" : "11aside"}_${
        formation?.id || "formation"
      }.png`;

      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to save formation image:", err);
      window.alert("Could not save this formation as an image.");
    } finally {
      setSavingFormationImage(false);
    }
  };

  const startLongPressSave = () => {
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      saveFormationImage();
    }, LONG_PRESS_MS);
  };

  useEffect(() => {
    return () => clearLongPress();
  }, []);

  const saveMeta = lineup?.meta || null;

  const saveMetaText = useMemo(() => {
    if (!saveMeta) return "";
    const role = saveMeta.savedByRole || "general";
    const who = saveMeta.savedByName || saveMeta.savedByEmail || "unknown";
    const captainBit = saveMeta.teamCaptainPreferred
      ? " • team captain preferred"
      : "";
    return `Saved by ${who} (${role})${captainBit}`;
  }, [saveMeta]);

  if (!selectedTeamCanonical) {
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
          <button className="primary-btn" type="button" onClick={onGoToSquads}>
            Manage Squads
          </button>
        </div>

        <h1>Lineups &amp; Formations</h1>

      </header>

      <section
        ref={exportRef}
        className="card lineups-card"
        onDoubleClick={saveFormationImage}
        onTouchStart={startLongPressSave}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onTouchCancel={clearLongPress}
        style={{
          position: "relative",
          opacity: savingFormationImage ? 0.92 : 1,
        }}
        title="Double-click to save. On mobile, long-press to save."
      >
        <div className="lineups-controls">
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

          {gameType === GAME_TYPE_5 ? (
            <div className="field-row inline-field">
              <label>Team (5-a-side)</label>
              <div className="team-pill-row">
                {canonicalTeams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`team-pill-btn ${
                      t.id === selectedTeamCanonical.id ? "active" : ""
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

        {saveMetaText ? (
          <p
            className="muted small"
            style={{ marginTop: "-0.35rem", marginBottom: "0.9rem" }}
          >
            {saveMetaText}
          </p>
        ) : null}

        <div className="lineups-layout">
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

                const photoData = name ? getPlayerPhoto(name) : null;

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
                          {name ? withCaptainTag(name) : "Empty"}
                        </span>
                        <span className="position-tag">{pos.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="muted helper-text">
              Tap a sub, then tap a reserve to swap them.
            </p>
          </div>

          <div className="bench-wrapper">
            <h3>Subs</h3>
            {subsPlayers.length === 0 ? (
              <p className="muted">No substitutes available.</p>
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
                {subsPlayers.map((p) => {
                  const isSelected =
                    selectedPlayer &&
                    selectedPlayer.from === "sub" &&
                    selectedPlayer.name === p;

                  const photoData = getPlayerPhoto(p);

                  return (
                    <li key={p}>
                      <PlayerBenchChip
                        name={withCaptainTag(p)}
                        isSelected={isSelected}
                        onClick={() => handleSubClick(p)}
                        photoData={photoData}
                        disabled={!canEditLineups}
                      />
                    </li>
                  );
                })}
              </ul>
            )}



            <h3 style={{ marginTop: "1rem" }}>Reserves</h3>
            {reservePlayers.length === 0 ? (
              <p className="muted">No reserves available.</p>
            ) : (
              <ul className="bench-list">
                {reservePlayers.map((p) => {
                  const isSelected =
                    selectedPlayer &&
                    selectedPlayer.from === "reserve" &&
                    selectedPlayer.name === p;

                  return (
                    <li key={p}>
                      <button
                        type="button"
                        className={`bench-player ${
                          isSelected ? "selected" : ""
                        }`}
                        onClick={() => handleReserveClick(p)}
                        disabled={!canEditLineups}
                      >
                        {withCaptainTag(p)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}



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
                      player identity on the home screen before uploading a
                      photo.
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

                {uploadingPhoto && (
                  <p className="muted small">Uploading photo…</p>
                )}
                {photoMessage && <p className="muted small">{photoMessage}</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}