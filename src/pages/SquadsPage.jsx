// src/pages/SquadsPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const MASTER_CODE = "3333"; // Nkululeko only
const UNSEEDED_ID = "__unseeded__";
const PLAYERS_COLLECTION = "players";
const ADMIN_EMAILS = ["nkululekolerato@gmail.com"];
const LONG_PRESS_MS = 650;

/* ---------------- Helpers ---------------- */

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugFromName(name) {
  return toTitleCase(name)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeAbbrev(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function isValidAbbrev(v) {
  return /^[A-Z]{3}$/.test(String(v || ""));
}

function normalizeHexColor(v) {
  const raw = String(v || "").trim().replace(/[^#a-fA-F0-9]/g, "");
  if (!raw) return "";
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return raw.toUpperCase();
}

function isValidHexColor(v) {
  return /^#[0-9A-F]{6}$/.test(String(v || "").trim().toUpperCase());
}

function isAdminIdentity(identity) {
  if (!identity || typeof identity !== "object") return false;

  const emailCandidates = [
    identity.email,
    identity.userEmail,
    identity.gmail,
    identity.googleEmail,
  ]
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);

  if (emailCandidates.some((email) => ADMIN_EMAILS.includes(email))) {
    return true;
  }

  const roleCandidates = [
    identity.role,
    identity.userRole,
    identity.accountType,
  ]
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);

  if (roleCandidates.includes("admin")) {
    return true;
  }

  const nameCandidates = [
    identity.name,
    identity.displayName,
    identity.fullName,
    identity.playerName,
    identity.shortName,
  ]
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);

  return nameCandidates.some(
    (name) =>
      name === "nkululeko" ||
      name === "nkululeko memela" ||
      name === "nk"
  );
}

function bestFullDisplayFromPlayer(p) {
  if (!p) return "";
  const fullName = toTitleCase(p.fullName || "");
  if (fullName) return fullName;

  const aliasesArr = Array.isArray(p.aliases) ? p.aliases : [];
  const aliasCandidates = aliasesArr
    .map((a) => toTitleCase(a))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (aliasCandidates.length) return aliasCandidates[0];

  const shortName = toTitleCase(p.shortName || "");
  if (shortName) return shortName;

  const name = toTitleCase(p.name || "");
  if (name) return name;

  return toTitleCase(p.id || "");
}

function bestShortDisplayFromPlayer(p) {
  if (!p) return "";
  const shortName = toTitleCase(p.shortName || "");
  if (shortName) return shortName;

  const name = toTitleCase(p.name || "");
  if (name) return name;

  const fullName = toTitleCase(p.fullName || "");
  if (fullName) return fullName;

  return toTitleCase(p.id || "");
}

function buildIdentityStrings(playerDoc) {
  const id = String(playerDoc.id || "").trim();
  const name = toTitleCase(playerDoc.name || "");
  const fullName = toTitleCase(playerDoc.fullName || "");
  const shortName = toTitleCase(playerDoc.shortName || "");
  const aliasesArr = Array.isArray(playerDoc.aliases) ? playerDoc.aliases : [];
  const aliases = aliasesArr.map((a) => toTitleCase(a));

  const strings = [id, name, fullName, shortName, ...aliases].filter(Boolean);
  return Array.from(new Set(strings.map((s) => s.toLowerCase())));
}

function resolvePlayerIdFromString(allPlayers, raw) {
  const needle = toTitleCase(raw).toLowerCase();
  if (!needle) return null;

  const direct = allPlayers.find((p) => String(p.id).toLowerCase() === needle);
  if (direct) return direct.id;

  for (const p of allPlayers) {
    const candidates = buildIdentityStrings(p);
    if (candidates.includes(needle)) return p.id;
  }
  return null;
}

function parseChoiceToPlayerId(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const parts = v.split("|").map((x) => x.trim());
  if (parts.length >= 2 && parts[0]) return parts[0];
  return v;
}

function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return `rgba(34, 197, 94, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTeamTheme(team = {}) {
  const explicitHex = normalizeHexColor(
    team.teamColorHex || team.colorHex || team.teamColor || ""
  );
  const explicitName = toTitleCase(
    team.teamColorName || team.colorName || ""
  );

  if (isValidHexColor(explicitHex)) {
    return {
      accent: explicitHex,
      accentSoft: hexToRgba(explicitHex, 0.18),
      glow: hexToRgba(explicitHex, 0.24),
      text: "#E5E7EB",
      colorName: explicitName || "Team Color",
    };
  }

  const key = String(team.label || "").trim().toLowerCase();

  if (
    key.includes("man u") ||
    key.includes("manu") ||
    key.includes("man united") ||
    key.includes("manchester united")
  ) {
    return {
      accent: "#DC2626",
      accentSoft: "rgba(220, 38, 38, 0.18)",
      glow: "rgba(220, 38, 38, 0.24)",
      text: "#FECACA",
      colorName: "Red Shirt",
    };
  }

  if (key.includes("madrid") || key.includes("real madrid")) {
    return {
      accent: "#F8FAFC",
      accentSoft: "rgba(248, 250, 252, 0.16)",
      glow: "rgba(248, 250, 252, 0.16)",
      text: "#F8FAFC",
      colorName: "White Shirt",
    };
  }

  if (key.includes("psg") || key.includes("paris")) {
    return {
      accent: "#0F172A",
      accentSoft: "rgba(15, 23, 42, 0.32)",
      glow: "rgba(15, 23, 42, 0.34)",
      text: "#CBD5E1",
      colorName: "Black Shirt",
    };
  }

  return {
    accent: "#22C55E",
    accentSoft: "rgba(34, 197, 94, 0.16)",
    glow: "rgba(34, 197, 94, 0.18)",
    text: "#BBF7D0",
    colorName: "Green",
  };
}

/* ---------------- Component ---------------- */

export function SquadsPage({ teams, onUpdateTeams, onBack, identity = null }) {
  const isAdmin = isAdminIdentity(identity);
  const canEdit = isAdmin;

  const [headerScrolled, setHeaderScrolled] = useState(false);

  const [localTeams, setLocalTeams] = useState(() =>
    (teams || []).map((t) => ({
      ...t,
      label: t.label || "",
      abbrev: normalizeAbbrev(t.abbrev || ""),
      teamColorHex: normalizeHexColor(t.teamColorHex || t.colorHex || ""),
      teamColorName: toTitleCase(t.teamColorName || t.colorName || ""),
      players: [...(t.players || [])],
      captainId: t.captainId || null,
      captain: t.captain || "",
    }))
  );

  const [allPlayers, setAllPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");

  const [pendingNames, setPendingNames] = useState({});
  const [addErrors, setAddErrors] = useState({});

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");

  const [savingCardId, setSavingCardId] = useState("");
  const cardRefs = useRef({});
  const longPressTimersRef = useRef({});

  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 6);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stateMarker = { tkSquadsPage: true, ts: Date.now() };
    window.history.pushState(stateMarker, "");

    const handlePopState = () => {
      onBack?.();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onBack]);

  useEffect(() => {
    setLocalTeams(
      (teams || []).map((t) => ({
        ...t,
        label: t.label || "",
        abbrev: normalizeAbbrev(t.abbrev || ""),
        teamColorHex: normalizeHexColor(t.teamColorHex || t.colorHex || ""),
        teamColorName: toTitleCase(t.teamColorName || t.colorName || ""),
        players: [...(t.players || [])],
        captainId: t.captainId || null,
        captain: t.captain || "",
      }))
    );
  }, [teams]);

  useEffect(() => {
    setPlayersLoading(true);
    setPlayersError("");

    const colRef = collection(db, PLAYERS_COLLECTION);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setAllPlayers(list);
        setPlayersLoading(false);
      },
      (err) => {
        console.error("[Squads] Error loading players:", err);
        setPlayersError("Could not load players from database.");
        setPlayersLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const playersById = useMemo(() => {
    const m = new Map();
    allPlayers.forEach((p) => m.set(p.id, p));
    return m;
  }, [allPlayers]);

  const displayNameOf = (playerIdOrLegacy) => {
    const p = playersById.get(playerIdOrLegacy);
    if (!p) return toTitleCase(playerIdOrLegacy);
    return bestFullDisplayFromPlayer({ ...p, id: p.id });
  };

  const displayShortOf = (playerIdOrLegacy) => {
    const p = playersById.get(playerIdOrLegacy);
    if (!p) return toTitleCase(playerIdOrLegacy);
    return bestShortDisplayFromPlayer({ ...p, id: p.id });
  };

  const activePlayers = useMemo(() => {
    return allPlayers.filter((p) => (p.status || "active") === "active");
  }, [allPlayers]);

  useEffect(() => {
    if (!allPlayers.length) return;

    setLocalTeams((prev) =>
      prev.map((t) => {
        const nextPlayers = (t.players || []).map((entry) => {
          if (playersById.has(entry)) return entry;
          const resolved = resolvePlayerIdFromString(allPlayers, entry);
          return resolved || entry;
        });

        const seen = new Set();
        const deduped = [];
        for (const x of nextPlayers) {
          if (!x) continue;
          if (seen.has(x)) continue;
          seen.add(x);
          deduped.push(x);
        }

        let captainId = t.captainId || null;
        if (!captainId && t.captain) {
          const resolvedCaptain = resolvePlayerIdFromString(
            allPlayers,
            t.captain
          );
          if (resolvedCaptain) captainId = resolvedCaptain;
        }

        return { ...t, players: deduped, captainId };
      })
    );
  }, [allPlayers, playersById]);

  const assignedIds = useMemo(() => {
    const s = new Set();
    localTeams.forEach((t) => {
      (t.players || []).forEach((pid) => {
        if (playersById.has(pid)) s.add(pid);
      });
    });
    return s;
  }, [localTeams, playersById]);

  const unseededPlayers = useMemo(() => {
    return activePlayers.filter((p) => !assignedIds.has(p.id));
  }, [activePlayers, assignedIds]);

  const availableForTeams = useMemo(() => {
    return unseededPlayers
      .map((p) => {
        const full = bestFullDisplayFromPlayer({ ...p, id: p.id });
        return `${p.id} | ${full}`;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [unseededPlayers]);

  const availableForUnseeded = useMemo(() => {
    const list = [];
    localTeams.forEach((t) => {
      (t.players || []).forEach((pid) => {
        if (!playersById.has(pid)) return;
        list.push(`${pid} | ${displayNameOf(pid)}`);
      });
    });
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [localTeams, playersById]);

  const handlePendingChange = (id, value) => {
    if (!canEdit) return;
    setPendingNames((prev) => ({ ...prev, [id]: value }));
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const handleTeamLabelChange = (teamId, value) => {
    if (!canEdit) return;
    setLocalTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, label: value } : t))
    );
  };

  const handleTeamAbbrevChange = (teamId, value) => {
    if (!canEdit) return;
    const next = normalizeAbbrev(value);
    setLocalTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, abbrev: next } : t))
    );
  };

  const handleTeamColorHexChange = (teamId, value) => {
    if (!canEdit) return;
    const next = normalizeHexColor(value);
    setLocalTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, teamColorHex: next } : t))
    );
  };

  const handleTeamColorNameChange = (teamId, value) => {
    if (!canEdit) return;
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === teamId ? { ...t, teamColorName: value } : t
      )
    );
  };

  const handleCaptainChange = (teamId, captainId) => {
    if (!canEdit) return;

    setLocalTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;

        const nextPlayers = [...(t.players || [])];
        if (
          captainId &&
          playersById.has(captainId) &&
          !nextPlayers.includes(captainId)
        ) {
          nextPlayers.push(captainId);
        }

        return {
          ...t,
          captainId: captainId || null,
          captain: captainId ? displayShortOf(captainId) : t.captain || "",
          players: nextPlayers,
        };
      })
    );
  };

  const ensurePlayerInDb = async (canonicalFullNameOrName) => {
    const fullName = toTitleCase(canonicalFullNameOrName);
    if (!fullName) return null;

    const existing = allPlayers.find((p) => {
      const candidates = buildIdentityStrings({ ...p, id: p.id });
      return candidates.includes(fullName.toLowerCase());
    });
    if (existing) return existing.id;

    const newId = slugFromName(fullName);
    await setDoc(
      doc(db, PLAYERS_COLLECTION, newId),
      {
        fullName,
        name: fullName.split(" ")[0] || fullName,
        shortName: fullName.split(" ")[0] || fullName,
        aliases: [fullName],
        status: "active",
        roles: { player: true, captain: false, admin: false, coach: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return newId;
  };

  const handleAddPlayer = async (id) => {
    if (!canEdit) return;

    const raw = pendingNames[id] || "";
    const trimmed = raw.trim();
    if (!trimmed) return;

    let chosenId = parseChoiceToPlayerId(trimmed);

    if (!playersById.has(chosenId)) {
      const resolved = resolvePlayerIdFromString(allPlayers, chosenId);
      if (resolved) {
        chosenId = resolved;
      } else {
        const createdId = await ensurePlayerInDb(chosenId);
        if (!createdId) return;
        chosenId = createdId;
      }
    }

    const teamIndex = localTeams.findIndex((t) =>
      (t.players || []).some((pid) => pid === chosenId)
    );
    const inAnyTeam = teamIndex >= 0;

    if (id === UNSEEDED_ID) {
      if (!inAnyTeam) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${displayNameOf(chosenId)} is already unseeded.`,
        }));
        return;
      }

      setLocalTeams((prev) =>
        prev.map((t, idx) => {
          if (idx !== teamIndex) return t;

          const nextPlayers = (t.players || []).filter(
            (pid) => pid !== chosenId
          );
          const nextCaptainId =
            t.captainId === chosenId ? null : t.captainId;

          return { ...t, players: nextPlayers, captainId: nextCaptainId };
        })
      );
    } else {
      const targetIndex = localTeams.findIndex((t) => t.id === id);
      if (targetIndex === -1) {
        setAddErrors((prev) => ({ ...prev, [id]: "Unknown team." }));
        return;
      }

      const targetTeam = localTeams[targetIndex];
      const alreadyInTarget = (targetTeam.players || []).includes(chosenId);
      if (alreadyInTarget) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${displayNameOf(chosenId)} is already in this team.`,
        }));
        return;
      }

      if (inAnyTeam && teamIndex !== targetIndex) {
        const existingTeam = localTeams[teamIndex];
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${displayNameOf(chosenId)} is already in ${existingTeam.label}. Move them to Unseeded first, then assign to this team.`,
        }));
        return;
      }

      setLocalTeams((prev) =>
        prev.map((t, idx) =>
          idx === targetIndex
            ? { ...t, players: [...(t.players || []), chosenId] }
            : t
        )
      );
    }

    setPendingNames((prev) => ({ ...prev, [id]: "" }));
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const handleRemovePlayer = async (teamId, playerIdOrLegacy) => {
    if (!canEdit) return;

    if (playersById.has(playerIdOrLegacy)) {
      setLocalTeams((prev) =>
        prev.map((t) => {
          if (t.id !== teamId) return t;

          const nextPlayers = (t.players || []).filter(
            (pid) => pid !== playerIdOrLegacy
          );
          const nextCaptainId =
            t.captainId === playerIdOrLegacy ? null : t.captainId;

          return { ...t, players: nextPlayers, captainId: nextCaptainId };
        })
      );
      return;
    }

    const legacyLabel = toTitleCase(playerIdOrLegacy);
    const createdId = await ensurePlayerInDb(legacyLabel);

    setLocalTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const nextPlayers = (t.players || []).filter(
          (pid) => pid !== playerIdOrLegacy
        );
        return { ...t, players: nextPlayers };
      })
    );

    if (!createdId) {
      console.warn("[Squads] Could not create player doc for:", legacyLabel);
    }
  };

  const handleRemoveUnseeded = async (playerId) => {
    if (!canEdit) return;
    if (!playersById.has(playerId)) return;

    const name = displayNameOf(playerId);
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            `Remove ${name} from the Turf Kings database?\nThey will disappear from the unseeded pool.`
          )
        : true;
    if (!ok) return;

    try {
      await deleteDoc(doc(db, PLAYERS_COLLECTION, playerId));
    } catch (err) {
      console.error("[Squads] Error deleting player from DB:", err);
    }
  };

  const handleSaveClick = () => {
    if (!canEdit) return;
    setSaveCode("");
    setSaveError("");
    setShowSaveModal(true);
  };

  const handleCancelSave = () => {
    setShowSaveModal(false);
    setSaveCode("");
    setSaveError("");
  };

  const handleConfirmSave = async () => {
    if (!canEdit) return;

    const code = saveCode.trim();
    if (code !== MASTER_CODE) {
      setSaveError("Invalid admin code.");
      return;
    }

    const cleanedTeams = localTeams.map((t) => {
      const label = String(t.label || "").trim();
      const abbrev = normalizeAbbrev(t.abbrev || "");
      const teamColorHex = normalizeHexColor(t.teamColorHex || "");
      const teamColorName = toTitleCase(t.teamColorName || "");
      return { ...t, label, abbrev, teamColorHex, teamColorName };
    });

    const badAbbrev = cleanedTeams.find(
      (t) => t.abbrev && !isValidAbbrev(t.abbrev)
    );
    if (badAbbrev) {
      setSaveError(
        `Invalid abbreviation for "${badAbbrev.label || badAbbrev.id}". Use exactly 3 letters (A–Z).`
      );
      return;
    }

    const badColor = cleanedTeams.find(
      (t) => t.teamColorHex && !isValidHexColor(t.teamColorHex)
    );
    if (badColor) {
      setSaveError(
        `Invalid team color for "${badColor.label || badColor.id}". Use hex like #DC2626`
      );
      return;
    }

    const abbrevs = cleanedTeams.map((t) => t.abbrev).filter(Boolean);
    const dup = abbrevs.find((a, i) => abbrevs.indexOf(a) !== i);
    if (dup) {
      setSaveError(`Duplicate team abbreviation: ${dup}`);
      return;
    }

    const newCaptainIds = new Set(
      cleanedTeams.map((t) => t.captainId).filter(Boolean)
    );

    const currentCaptainIds = new Set(
      allPlayers.filter((p) => p.roles?.captain === true).map((p) => p.id)
    );

    const toMakeCaptain = [...newCaptainIds].filter(
      (id) => !currentCaptainIds.has(id)
    );
    const toRemoveCaptain = [...currentCaptainIds].filter(
      (id) => !newCaptainIds.has(id)
    );

    try {
      const batch = writeBatch(db);

      for (const pid of toMakeCaptain) {
        batch.set(
          doc(db, PLAYERS_COLLECTION, pid),
          {
            "roles.captain": true,
            "roles.player": true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      for (const pid of toRemoveCaptain) {
        batch.set(
          doc(db, PLAYERS_COLLECTION, pid),
          {
            "roles.captain": false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
    } catch (err) {
      console.error("[Squads] Error updating captain roles:", err);
      setSaveError("Could not update captain roles in the database.");
      return;
    }

    const teamsForSave = cleanedTeams.map((t) => ({
      ...t,
      captain: t.captainId ? displayShortOf(t.captainId) : t.captain || "",
    }));

    onUpdateTeams(teamsForSave);
    handleCancelSave();
  };

  const handleSaveCardAsImage = async (cardId, label) => {
    const node = cardRefs.current[cardId];
    if (!node) return;

    try {
      setSavingCardId(cardId);
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#071226",
      });

      const link = document.createElement("a");
      link.download = `${slugFromName(label || "squad_card")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[Squads] Failed to save squad card image:", err);
      if (typeof window !== "undefined") {
        window.alert("Could not save this squad card as an image.");
      }
    } finally {
      setSavingCardId("");
    }
  };

  const startLongPressSave = (cardId, label) => {
    clearLongPress(cardId);
    longPressTimersRef.current[cardId] = window.setTimeout(() => {
      handleSaveCardAsImage(cardId, label);
    }, LONG_PRESS_MS);
  };

  const clearLongPress = (cardId) => {
    const timer = longPressTimersRef.current[cardId];
    if (timer) {
      window.clearTimeout(timer);
      delete longPressTimersRef.current[cardId];
    }
  };

  useEffect(() => {
    return () => {
      Object.keys(longPressTimersRef.current).forEach((key) => {
        window.clearTimeout(longPressTimersRef.current[key]);
      });
      longPressTimersRef.current = {};
    };
  }, []);

  const captainTagText = (team) => {
    if (team.captainId && playersById.has(team.captainId)) {
      return displayShortOf(team.captainId);
    }
    return toTitleCase(team.captain || "");
  };

  const captainOptionsForTeam = (team) => {
    const ids = (team.players || []).filter((pid) => playersById.has(pid));
    const unique = Array.from(new Set(ids));
    unique.sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)));
    return unique;
  };

  const renderCardShell = (cardId, label, theme, children) => (
    <div
      className={`squad-surface ${savingCardId === cardId ? "saving" : ""}`}
      style={{
        "--team-accent": theme.accent,
        "--team-accent-soft": theme.accentSoft,
        "--team-glow": theme.glow,
        "--team-text": theme.text,
      }}
    >
      <div
        ref={(el) => {
          cardRefs.current[cardId] = el;
        }}
        className="squad-surface-inner squad-column"
        onDoubleClick={() => handleSaveCardAsImage(cardId, label)}
        onTouchStart={() => startLongPressSave(cardId, label)}
        onTouchEnd={() => clearLongPress(cardId)}
        onTouchMove={() => clearLongPress(cardId)}
        onTouchCancel={() => clearLongPress(cardId)}
        title="Double-click to save. On mobile, long-press to save."
      >
        {children}
      </div>
    </div>
  );

  return (
    <div className="page squads-page">
      <div
        className={`landing-header-sticky ${
          headerScrolled ? "is-scrolled" : ""
        }`}
      >
        <header className="header">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              width: "100%",
            }}
          >
            <div className="header-title" style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>Manage Squads</h1>
            </div>

            <button
              className="secondary-btn"
              onClick={onBack}
              aria-label="Home"
              title="Home"
              style={{
                minWidth: "46px",
                width: "46px",
                height: "46px",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.05rem",
                flexShrink: 0,
              }}
            >
              🏠
            </button>
          </div>
        </header>
      </div>

      <header className="header">
        {playersLoading && (
          <p className="muted small">Loading players from database…</p>
        )}
        {playersError && <p className="error-text">{playersError}</p>}
        {!playersLoading && (
          <p className="muted small">
            {isAdmin
              ? "Admin mode: you can edit squads, captains, player placement, and team colors."
              : "View mode: team cards and squads are visible to everyone."}
          </p>
        )}
      </header>

      <section className="card">
        <div className="squads-grid">
          {localTeams.map((team) => {
            const inputId = team.id;
            const listId = `players-db-${inputId}`;
            const capOptions = captainOptionsForTeam(team);
            const currentCapId =
              team.captainId && playersById.has(team.captainId)
                ? team.captainId
                : "";
            const cardId = `team-${team.id}`;
            const theme = getTeamTheme(team);

            return renderCardShell(
              cardId,
              team.label,
              theme,
              <>
                <div className="squad-card-topbar">
                  <div className="team-name-wrap">
                    <span className="team-color-pill" />
                    <div>
                      <div className="team-title-row">
                        <h2 className="team-title">{team.label}</h2>
                        {team.abbrev ? (
                          <span className="team-abbrev-badge">{team.abbrev}</span>
                        ) : null}
                      </div>
                      <div className="team-subtitle">
                        Captain: {captainTagText(team) || "—"}
                      </div>
                      <div className="team-color-name">
                        <span className="team-color-dot" />
                        {theme.colorName}
                      </div>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="team-config">
                    <div className="field-row-inline">
                      <input
                        className="text-input"
                        value={team.label || ""}
                        placeholder="Team name"
                        onChange={(e) =>
                          handleTeamLabelChange(team.id, e.target.value)
                        }
                        disabled={!canEdit}
                      />
                      <input
                        className="text-input team-abbrev-input"
                        value={team.abbrev || ""}
                        placeholder="ABC"
                        title="3-letter abbreviation (A–Z)"
                        onChange={(e) =>
                          handleTeamAbbrevChange(team.id, e.target.value)
                        }
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="field-row-top-spaced">
                      <input
                        className="text-input"
                        value={team.teamColorName || ""}
                        placeholder="Team color name e.g. Red Shirt"
                        onChange={(e) =>
                          handleTeamColorNameChange(team.id, e.target.value)
                        }
                        disabled={!canEdit}
                      />
                      <input
                        className="text-input team-color-input"
                        value={team.teamColorHex || ""}
                        placeholder="#DC2626"
                        title="Hex color e.g. #DC2626"
                        onChange={(e) =>
                          handleTeamColorHexChange(team.id, e.target.value)
                        }
                        disabled={!canEdit}
                      />
                    </div>

                    {team.abbrev && !isValidAbbrev(team.abbrev) && canEdit && (
                      <p className="muted small squad-note">
                        Abbrev must be exactly 3 letters (A–Z), e.g. FCB / RMD / LIV
                      </p>
                    )}

                    {team.teamColorHex &&
                      !isValidHexColor(team.teamColorHex) &&
                      canEdit && (
                        <p className="muted small squad-note">
                          Team color must be a full hex like #DC2626
                        </p>
                      )}

                    <div className="field-row field-row-top-spaced">
                      <label className="muted small field-label-tight">
                        Captain
                      </label>
                      <select
                        className="text-input"
                        value={currentCapId}
                        onChange={(e) =>
                          handleCaptainChange(team.id, e.target.value)
                        }
                        disabled={!canEdit || capOptions.length === 0}
                      >
                        <option value="">
                          {capOptions.length === 0
                            ? "Add players to pick a captain"
                            : "Select captain…"}
                        </option>
                        {capOptions.map((pid) => (
                          <option key={pid} value={pid}>
                            {displayNameOf(pid)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <ul className="player-list">
                  {(team.players || []).map((pid, idx) => {
                    const label = displayNameOf(pid);
                    const isCaptain =
                      team.captainId && playersById.has(team.captainId)
                        ? team.captainId === pid
                        : false;

                    return (
                      <li
                        key={`${team.id}-${pid}-${idx}`}
                        className="player-row"
                      >
                        <div className="player-row-left">
                          <span className="player-number">{idx + 1}</span>
                          <span className="player-name-text">
                            {label}{" "}
                            {isCaptain ? (
                              <span className="muted">(C)</span>
                            ) : null}
                          </span>
                        </div>

                        {isAdmin && (
                          <button
                            className="link-btn"
                            onClick={() => handleRemovePlayer(team.id, pid)}
                          >
                            remove
                          </button>
                        )}
                      </li>
                    );
                  })}

                  {(team.players || []).length === 0 && (
                    <li className="player-row muted small">
                      <div className="player-row-left">
                        <span className="player-number">0</span>
                        <span className="player-name-text">
                          No players yet in this squad.
                        </span>
                      </div>
                    </li>
                  )}
                </ul>

                {isAdmin && (
                  <>
                    <div className="add-player-row">
                      <input
                        className="text-input"
                        placeholder="Add / select player..."
                        list={listId}
                        value={pendingNames[inputId] || ""}
                        onChange={(e) =>
                          handlePendingChange(inputId, e.target.value)
                        }
                      />
                      <datalist id={listId}>
                        {availableForTeams.map((val) => (
                          <option key={val} value={val} />
                        ))}
                      </datalist>

                      <button
                        className="secondary-btn"
                        onClick={() => handleAddPlayer(inputId)}
                      >
                        Add
                      </button>
                    </div>

                    {addErrors[inputId] && (
                      <p className="error-text small">{addErrors[inputId]}</p>
                    )}
                  </>
                )}
              </>
            );
          })}

          {renderCardShell(
            UNSEEDED_ID,
            "unseeded_players",
            {
              accent: "#64748B",
              accentSoft: "rgba(100,116,139,0.16)",
              glow: "rgba(100,116,139,0.18)",
              text: "#CBD5E1",
              colorName: "Slate",
            },
            <>
              <div className="squad-card-topbar">
                <div className="team-name-wrap">
                  <span className="team-color-pill" />
                  <div>
                    <div className="team-title-row">
                      <h2 className="team-title">Unseeded Players</h2>
                      <span className="team-abbrev-badge">POOL</span>
                    </div>
                    <div className="team-subtitle">
                      Not currently assigned to a team
                    </div>
                    <div className="team-color-name">
                      <span className="team-color-dot" />
                      Slate
                    </div>
                  </div>
                </div>
              </div>

              <ul className="player-list">
                {unseededPlayers.map((p, idx) => {
                  const name = displayNameOf(p.id);
                  const roles = p.roles || {};
                  return (
                    <li key={p.id} className="player-row">
                      <div className="player-row-left">
                        <span className="player-number">{idx + 1}</span>
                        <span className="player-name-text">
                          {name}{" "}
                          {roles.captain ? (
                            <span className="muted">(C)</span>
                          ) : null}
                          {roles.coach ? (
                            <span className="muted"> (Coach)</span>
                          ) : null}
                          {roles.admin ? (
                            <span className="muted"> (Admin)</span>
                          ) : null}
                        </span>
                      </div>

                      {isAdmin && (
                        <button
                          className="link-btn"
                          onClick={() => handleRemoveUnseeded(p.id)}
                        >
                          ❌ delete?
                        </button>
                      )}
                    </li>
                  );
                })}

                {unseededPlayers.length === 0 && (
                  <li className="player-row muted small">
                    <div className="player-row-left">
                      <span className="player-number">0</span>
                      <span className="player-name-text">
                        No unseeded players right now.
                      </span>
                    </div>
                  </li>
                )}
              </ul>

              {isAdmin && (
                <>
                  <div className="add-player-row">
                    <input
                      className="text-input"
                      placeholder="Move from team / add manual player..."
                      list="players-db-unseeded"
                      value={pendingNames[UNSEEDED_ID] || ""}
                      onChange={(e) =>
                        handlePendingChange(UNSEEDED_ID, e.target.value)
                      }
                    />
                    <datalist id="players-db-unseeded">
                      {availableForUnseeded.map((val) => (
                        <option key={val} value={val} />
                      ))}
                    </datalist>

                    <button
                      className="secondary-btn"
                      onClick={() => handleAddPlayer(UNSEEDED_ID)}
                    >
                      Add
                    </button>
                  </div>

                  {addErrors[UNSEEDED_ID] && (
                    <p className="error-text small">
                      {addErrors[UNSEEDED_ID]}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="actions-row">
          <button className="secondary-btn" onClick={onBack}>
            Back
          </button>
          {isAdmin && (
            <button className="primary-btn" onClick={handleSaveClick}>
              Save Squads
            </button>
          )}
        </div>
      </section>

      {isAdmin && showSaveModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm Squad Changes</h3>
            <p>Enter the Turf Kings admin code to apply squad changes.</p>

            <div className="field-row">
              <label>Admin code</label>
              <input
                type="password"
                className="text-input"
                value={saveCode}
                onChange={(e) => {
                  setSaveCode(e.target.value);
                  setSaveError("");
                }}
              />
              {saveError && <p className="error-text">{saveError}</p>}
            </div>

            <div className="actions-row">
              <button className="secondary-btn" onClick={handleCancelSave}>
                Cancel
              </button>
              <button className="primary-btn" onClick={handleConfirmSave}>
                Confirm &amp; save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}