// src/pages/SquadsPage.jsx

import React, { useEffect, useMemo, useState } from "react";
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

// ✅ matches your Firestore screenshots
const PLAYERS_COLLECTION = "players";

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

// Slug -> stable playerId
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

// Pick a "best" full display name from a player doc.
// Priority:
// 1) fullName (if present)
// 2) longest alias (often contains surname)
// 3) shortName
// 4) name
// 5) id
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

// For compact labels (captain tag), prefer SHORTNAME then name, then fullName.
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

// Build candidate identity strings for matching older values to a player doc
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

// Resolve an incoming legacy string ("Mark", "Mark Mc Kechniee", "Dr Babs") to playerId
function resolvePlayerIdFromString(allPlayers, raw) {
  const needle = toTitleCase(raw).toLowerCase();
  if (!needle) return null;

  // exact id match
  const direct = allPlayers.find((p) => String(p.id).toLowerCase() === needle);
  if (direct) return direct.id;

  // match against name/fullName/shortName/aliases
  for (const p of allPlayers) {
    const candidates = buildIdentityStrings(p);
    if (candidates.includes(needle)) return p.id;
  }
  return null;
}

// Parse datalist value: "playerId | Full Name"
function parseChoiceToPlayerId(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const parts = v.split("|").map((x) => x.trim());
  if (parts.length >= 2 && parts[0]) return parts[0];
  return v; // allow plain id input
}

/* ---------------- Component ---------------- */

export function SquadsPage({ teams, onUpdateTeams, onBack }) {
  // Local editable copy of teams (store playerIds internally where possible)
  const [localTeams, setLocalTeams] = useState(() =>
    (teams || []).map((t) => ({
      ...t,
      label: t.label || "",
      abbrev: normalizeAbbrev(t.abbrev || ""),
      players: [...(t.players || [])],
      // new canonical captain storage:
      captainId: t.captainId || null,
      // keep legacy captain string if it exists:
      captain: t.captain || "",
    }))
  );

  // 🔥 All players from Firestore `players`
  const [allPlayers, setAllPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");

  // Input state + errors for add fields
  const [pendingNames, setPendingNames] = useState({});
  const [addErrors, setAddErrors] = useState({});

  // Admin save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");

  /* ---------------- Firestore subscription ---------------- */

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

  /* ---------------- Display helpers ---------------- */

  // For lists (Manage squads), prefer FULL NAME (or best alias)
  const displayNameOf = (playerIdOrLegacy) => {
    const p = playersById.get(playerIdOrLegacy);
    if (!p) return toTitleCase(playerIdOrLegacy);
    return bestFullDisplayFromPlayer({ ...p, id: p.id });
  };

  // For compact labels (captain tag), prefer SHORTNAME then name
  const displayShortOf = (playerIdOrLegacy) => {
    const p = playersById.get(playerIdOrLegacy);
    if (!p) return toTitleCase(playerIdOrLegacy);
    return bestShortDisplayFromPlayer({ ...p, id: p.id });
  };

  const activePlayers = useMemo(() => {
    return allPlayers.filter((p) => (p.status || "active") === "active");
  }, [allPlayers]);

  /* ---------------- Normalize localTeams when players load ---------------- */

  useEffect(() => {
    if (!allPlayers.length) return;

    setLocalTeams((prev) =>
      prev.map((t) => {
        // Normalize players list entries -> ids if possible
        const nextPlayers = (t.players || []).map((entry) => {
          if (playersById.has(entry)) return entry;
          const resolved = resolvePlayerIdFromString(allPlayers, entry);
          return resolved || entry; // keep unresolved legacy as-is
        });

        // Dedup
        const seen = new Set();
        const deduped = [];
        for (const x of nextPlayers) {
          if (!x) continue;
          if (seen.has(x)) continue;
          seen.add(x);
          deduped.push(x);
        }

        // Normalize captainId from legacy captain string if missing
        let captainId = t.captainId || null;
        if (!captainId && t.captain) {
          const resolvedCaptain = resolvePlayerIdFromString(allPlayers, t.captain);
          if (resolvedCaptain) captainId = resolvedCaptain;
        }

        return { ...t, players: deduped, captainId };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers]);

  /* ---------------- Unseeded logic (based on DB players) ---------------- */

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

  /* ---------------- Input handlers ---------------- */

  const handlePendingChange = (id, value) => {
    setPendingNames((prev) => ({ ...prev, [id]: value }));
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const handleTeamLabelChange = (teamId, value) => {
    setLocalTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, label: value } : t))
    );
  };

  const handleTeamAbbrevChange = (teamId, value) => {
    const next = normalizeAbbrev(value);
    setLocalTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, abbrev: next } : t))
    );
  };

  /**
   * Captain selection:
   * - captain should be a real playerId
   * - if captain not in team players, we auto-add them to the team
   */
  const handleCaptainChange = (teamId, captainId) => {
    setLocalTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;

        const nextPlayers = [...(t.players || [])];
        if (captainId && playersById.has(captainId) && !nextPlayers.includes(captainId)) {
          nextPlayers.push(captainId);
        }

        return {
          ...t,
          captainId: captainId || null,
          // keep a human-readable legacy string too (nice for other pages)
          captain: captainId ? displayShortOf(captainId) : t.captain || "",
          players: nextPlayers,
        };
      })
    );
  };

  /* ---------------- DB helpers ---------------- */

  // Ensure a player exists in DB with a stable id (no random addDoc ids)
  const ensurePlayerInDb = async (canonicalFullNameOrName) => {
    const fullName = toTitleCase(canonicalFullNameOrName);
    if (!fullName) return null;

    // If it already exists by fullName/name/shortName/aliases, return its id
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
    const raw = pendingNames[id] || "";
    const trimmed = raw.trim();
    if (!trimmed) return;

    let chosenId = parseChoiceToPlayerId(trimmed);

    // If they typed a name, try resolve; otherwise create
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

    // locate where this player currently lives
    const teamIndex = localTeams.findIndex((t) =>
      (t.players || []).some((pid) => pid === chosenId)
    );
    const inAnyTeam = teamIndex >= 0;

    if (id === UNSEEDED_ID) {
      // Move from team -> unseeded (remove from that team)
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

          const nextPlayers = (t.players || []).filter((pid) => pid !== chosenId);

          // If we removed the captain, unset captainId
          const nextCaptainId = t.captainId === chosenId ? null : t.captainId;

          return { ...t, players: nextPlayers, captainId: nextCaptainId };
        })
      );
    } else {
      // Add to a TEAM
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

  /**
   * ✅ "remove" must UNSEED, not vanish.
   * If entry is a legacy string and no Firestore player doc exists yet,
   * we first ensure a doc exists, then remove from the team.
   */
  const handleRemovePlayer = async (teamId, playerIdOrLegacy) => {
    // Known id -> just remove from team
    if (playersById.has(playerIdOrLegacy)) {
      setLocalTeams((prev) =>
        prev.map((t) => {
          if (t.id !== teamId) return t;

          const nextPlayers = (t.players || []).filter((pid) => pid !== playerIdOrLegacy);
          const nextCaptainId = t.captainId === playerIdOrLegacy ? null : t.captainId;

          return { ...t, players: nextPlayers, captainId: nextCaptainId };
        })
      );
      return;
    }

    // Legacy string — ensure exists in Firestore, then remove legacy from team
    const legacyLabel = toTitleCase(playerIdOrLegacy);
    const createdId = await ensurePlayerInDb(legacyLabel);

    setLocalTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const nextPlayers = (t.players || []).filter((pid) => pid !== playerIdOrLegacy);
        return { ...t, players: nextPlayers };
      })
    );

    if (!createdId) {
      console.warn("[Squads] Could not create player doc for:", legacyLabel);
    }
  };

  // Remove player completely from DB (only affects unseeded players)
  const handleRemoveUnseeded = async (playerId) => {
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

  /* ---------------- Save flow (Admin) ---------------- */

  const handleSaveClick = () => {
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
    const code = saveCode.trim();
    if (code !== MASTER_CODE) {
      setSaveError("Invalid admin code.");
      return;
    }

    // 1) Clean teams: label + abbrev
    const cleanedTeams = localTeams.map((t) => {
      const label = String(t.label || "").trim();
      const abbrev = normalizeAbbrev(t.abbrev || "");
      return { ...t, label, abbrev };
    });

    // 2) Validate abbrevs (if provided)
    const bad = cleanedTeams.find((t) => t.abbrev && !isValidAbbrev(t.abbrev));
    if (bad) {
      setSaveError(
        `Invalid abbreviation for "${bad.label || bad.id}". Use exactly 3 letters (A–Z).`
      );
      return;
    }

    // 3) Prevent duplicate abbrevs (if used)
    const abbrevs = cleanedTeams.map((t) => t.abbrev).filter(Boolean);
    const dup = abbrevs.find((a, i) => abbrevs.indexOf(a) !== i);
    if (dup) {
      setSaveError(`Duplicate team abbreviation: ${dup}`);
      return;
    }

    // 4) Captain roles update in Firestore (players.roles.captain)
    const newCaptainIds = new Set(
      cleanedTeams.map((t) => t.captainId).filter(Boolean)
    );

    const currentCaptainIds = new Set(
      allPlayers.filter((p) => p.roles?.captain === true).map((p) => p.id)
    );

    const toMakeCaptain = [...newCaptainIds].filter((id) => !currentCaptainIds.has(id));
    const toRemoveCaptain = [...currentCaptainIds].filter((id) => !newCaptainIds.has(id));

    try {
      const batch = writeBatch(db);

      // ✅ Promote new captains WITHOUT overwriting other roles
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

      // ✅ Demote removed captains WITHOUT overwriting other roles
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

    // 5) Persist teams (to your app’s store/state)
    const teamsForSave = cleanedTeams.map((t) => ({
      ...t,
      captain: t.captainId ? displayShortOf(t.captainId) : (t.captain || ""),
    }));

    onUpdateTeams(teamsForSave);
    handleCancelSave();
  };

  /* ---------------- Render helpers ---------------- */

  const captainTagText = (team) => {
    if (team.captainId && playersById.has(team.captainId)) {
      return displayShortOf(team.captainId);
    }
    return toTitleCase(team.captain || "");
  };

  // Captain dropdown options: prefer team players (ids that exist)
  const captainOptionsForTeam = (team) => {
    const ids = (team.players || []).filter((pid) => playersById.has(pid));
    const unique = Array.from(new Set(ids));
    unique.sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)));
    return unique;
  };

  return (
    <div className="page squads-page">
      <header className="header">
        <h1>Manage Squads</h1>
        {playersLoading && <p className="muted small">Loading players from database…</p>}
        {playersError && <p className="error-text">{playersError}</p>}
      </header>

      <section className="card">
        <div className="squads-grid">
          {localTeams.map((team) => {
            const inputId = team.id;
            const listId = `players-db-${inputId}`;

            const capOptions = captainOptionsForTeam(team);
            const currentCapId =
              team.captainId && playersById.has(team.captainId) ? team.captainId : "";

            return (
              <div key={team.id} className="squad-column">
                <h2>
                  {team.label}{" "}
                  <span className="captain-tag">(c: {captainTagText(team) || "—"})</span>
                </h2>

                {/* ✅ Team configuration (VISIBLE like your previous version) */}
                <div className="team-config" style={{ marginBottom: 12 }}>
                  <div className="field-row" style={{ display: "flex", gap: 8 }}>
                    <input
                      className="text-input"
                      value={team.label || ""}
                      placeholder="Team name"
                      onChange={(e) => handleTeamLabelChange(team.id, e.target.value)}
                    />
                    <input
                      className="text-input"
                      value={team.abbrev || ""}
                      placeholder="ABC"
                      title="3-letter abbreviation (A–Z)"
                      onChange={(e) => handleTeamAbbrevChange(team.id, e.target.value)}
                      style={{ maxWidth: 90, textAlign: "center", fontWeight: 700 }}
                    />
                  </div>

                  {team.abbrev && !isValidAbbrev(team.abbrev) && (
                    <p className="muted small" style={{ marginTop: 6 }}>
                      Abbrev must be exactly 3 letters (A–Z), e.g. FCB / RMD / LIV
                    </p>
                  )}

                  {/* ✅ Captain selector (VISIBLE) */}
                  <div className="field-row" style={{ marginTop: 8 }}>
                    <label className="muted small" style={{ display: "block", marginBottom: 6 }}>
                      Captain
                    </label>
                    <select
                      className="text-input"
                      value={currentCapId}
                      onChange={(e) => handleCaptainChange(team.id, e.target.value)}
                      disabled={capOptions.length === 0}
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
                    <p className="muted small" style={{ marginTop: 6 }}>
                      Changing captain here will update the database on <b>Save Squads</b>
                      
                    </p>
                  </div>
                </div>

                <ul className="player-list">
                  {(team.players || []).map((pid, idx) => {
                    const label = displayNameOf(pid);
                    const isCaptain =
                      team.captainId && playersById.has(team.captainId)
                        ? team.captainId === pid
                        : false;

                    return (
                      <li key={`${team.id}-${pid}-${idx}`} className="player-row">
                        <span>
                          {label} {isCaptain ? <span className="muted">(C)</span> : null}
                        </span>

                        {/* Do not allow removing the current captain via remove (forces captain change first) */}
                        {!isCaptain && (
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
                    <li className="player-row muted small">No players yet in this squad.</li>
                  )}
                </ul>

                <div className="add-player-row">
                  <input
                    className="text-input"
                    placeholder="Add / select player..."
                    list={listId}
                    value={pendingNames[inputId] || ""}
                    onChange={(e) => handlePendingChange(inputId, e.target.value)}
                  />
                  <datalist id={listId}>
                    {availableForTeams.map((val) => (
                      <option key={val} value={val} />
                    ))}
                  </datalist>

                  <button className="secondary-btn" onClick={() => handleAddPlayer(inputId)}>
                    Add
                  </button>
                </div>

                {addErrors[inputId] && <p className="error-text small">{addErrors[inputId]}</p>}
              </div>
            );
          })}

          {/* Unseeded */}
          <div key={UNSEEDED_ID} className="squad-column">
            <h2>Unseeded players</h2>
            <p className="muted small">
              Active players in the database that are not assigned to any team.
            </p>

            <ul className="player-list">
              {unseededPlayers.map((p) => {
                const name = displayNameOf(p.id);
                const roles = p.roles || {};
                return (
                  <li key={p.id} className="player-row">
                    <span>
                      {name} {roles.captain ? <span className="muted">(C)</span> : null}
                      {roles.coach ? <span className="muted"> (Coach)</span> : null}
                      {roles.admin ? <span className="muted"> (Admin)</span> : null}
                    </span>
                    <button className="link-btn" onClick={() => handleRemoveUnseeded(p.id)}>
                      ❌ delete?
                    </button>
                  </li>
                );
              })}
              {unseededPlayers.length === 0 && (
                <li className="player-row muted small">No unseeded players right now.</li>
              )}
            </ul>

            <div className="add-player-row">
              <input
                className="text-input"
                placeholder="Move from team / add manual player..."
                list="players-db-unseeded"
                value={pendingNames[UNSEEDED_ID] || ""}
                onChange={(e) => handlePendingChange(UNSEEDED_ID, e.target.value)}
              />
              <datalist id="players-db-unseeded">
                {availableForUnseeded.map((val) => (
                  <option key={val} value={val} />
                ))}
              </datalist>

              <button className="secondary-btn" onClick={() => handleAddPlayer(UNSEEDED_ID)}>
                Add
              </button>
            </div>

            {addErrors[UNSEEDED_ID] && <p className="error-text small">{addErrors[UNSEEDED_ID]}</p>}
          </div>
        </div>

        <div className="actions-row">
          <button className="secondary-btn" onClick={onBack}>
            Back
          </button>
          <button className="primary-btn" onClick={handleSaveClick}>
            Save Squads
          </button>
        </div>
      </section>

      {showSaveModal && (
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
