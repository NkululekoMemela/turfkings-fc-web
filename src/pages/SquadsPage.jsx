// src/pages/SquadsPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig"; // ✅ existing Firebase config

const MASTER_CODE = "3333"; // Nkululeko only
const UNSEEDED_ID = "__unseeded__";

// 🔥 New canonical collection (same as EntryPage & FormationsPage)
const MEMBERS_COLLECTION = "members";

// Helper: enforce "Title Case"
function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Helper: find members by canonical fullName
function findMembersByName(allPlayers, canonicalName) {
  const lower = canonicalName.toLowerCase();
  return allPlayers.filter((p) => {
    const baseName = p.fullName || p.name || "";
    const name = toTitleCase(baseName);
    return name.toLowerCase() === lower;
  });
}

export function SquadsPage({ teams, onUpdateTeams, onBack }) {
  // Local editable copy of teams (seeded squads)
  const [localTeams, setLocalTeams] = useState(() =>
    teams.map((t) => ({ ...t, players: [...t.players] }))
  );

  // 🔥 All members from Firestore `members` collection
  const [allPlayers, setAllPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");

  // Input state + errors for add fields
  const [pendingNames, setPendingNames] = useState({});
  const [addErrors, setAddErrors] = useState({}); // per-team / unseeded add error

  // Admin save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");

  // ---------------- FIRESTORE MEMBERS SUBSCRIPTION ----------------
  useEffect(() => {
    setPlayersLoading(true);
    setPlayersError("");

    const colRef = collection(db, MEMBERS_COLLECTION);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            ...data,
          };
        });
        console.log("[Squads] Firestore members snapshot:", list);
        setAllPlayers(list);
        setPlayersLoading(false);
      },
      (err) => {
        console.error("[Squads] Error loading members:", err);
        setPlayersError("Could not load players from database.");
        setPlayersLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Canonical list of all player names in DB (Title Case, unique, active only)
  const allPlayerNames = useMemo(() => {
    const set = new Set();
    allPlayers.forEach((p) => {
      const status = p.status || "active";
      if (status !== "active") return;
      const baseName = p.fullName || p.name || "";
      const name = toTitleCase(baseName);
      if (name) set.add(name);
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    console.log("[Squads] allPlayerNames (active members):", arr);
    return arr;
  }, [allPlayers]);

  // Players currently assigned to teams (from localTeams)
  const playersAssignedToTeams = useMemo(() => {
    const set = new Set();
    localTeams.forEach((t) => {
      (t.players || []).forEach((p) => {
        const name = toTitleCase(p);
        if (name) set.add(name);
      });
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    console.log("[Squads] playersAssignedToTeams:", arr);
    return arr;
  }, [localTeams]);

  const playersAssignedToTeamsLower = useMemo(() => {
    const s = new Set();
    playersAssignedToTeams.forEach((n) => s.add(n.toLowerCase()));
    return s;
  }, [playersAssignedToTeams]);

  // 🔥 Unseeded players = active members that are NOT in any team
  const unseededPlayers = useMemo(() => {
    const arr = allPlayers.filter((p) => {
      const status = p.status || "active";
      if (status !== "active") return false;
      const baseName = p.fullName || p.name || "";
      const name = toTitleCase(baseName);
      if (!name) return false;
      return !playersAssignedToTeamsLower.has(name.toLowerCase());
    });
    console.log("[Squads] unseededPlayers (active members not in squads):", arr);
    return arr;
  }, [allPlayers, playersAssignedToTeamsLower]);

  // For team dropdowns: available players are ONLY unseeded players (by name)
  const availableForTeams = useMemo(() => {
    const set = new Set();
    unseededPlayers.forEach((p) => {
      const baseName = p.fullName || p.name || "";
      const name = toTitleCase(baseName);
      if (name) set.add(name);
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    console.log("[Squads] availableForTeams (unseeded names):", arr);
    return arr;
  }, [unseededPlayers]);

  // For Unseeded dropdown: suggestions = players currently assigned to teams
  const availableForUnseeded = playersAssignedToTeams;

  const handlePendingChange = (id, value) => {
    setPendingNames((prev) => ({ ...prev, [id]: value }));
    // clear any previous error when user types again
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  // Helper: create a new member in DB if they don't exist yet
  const ensureMemberInDb = async (canonicalName) => {
    const matches = findMembersByName(allPlayers, canonicalName);
    if (matches.length > 0) {
      return; // already exists in DB
    }
    try {
      console.log("[Squads] Creating NEW DB member:", canonicalName);
      await addDoc(collection(db, MEMBERS_COLLECTION), {
        fullName: canonicalName,
        shortName: canonicalName.split(" ")[0],
        email: "",
        role: "player",
        status: "active",
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[Squads] Error creating member in DB:", err);
    }
  };

  const handleAddPlayer = async (id) => {
    const raw = pendingNames[id] || "";
    const trimmed = raw.trim();
    if (!trimmed) return;

    const canonicalName = toTitleCase(trimmed);
    const lowerName = canonicalName.toLowerCase();

    console.log("[Squads] handleAddPlayer", { id, canonicalName });

    // locate where this player currently lives (if anywhere)
    const teamIndex = localTeams.findIndex((t) =>
      (t.players || []).some(
        (p) => toTitleCase(p).toLowerCase() === lowerName
      )
    );
    const inAnyTeam = teamIndex >= 0;

    if (id === UNSEEDED_ID) {
      // --- Adding to Unseeded bin ---
      const alreadyInDb = findMembersByName(allPlayers, canonicalName).length;
      if (!inAnyTeam && alreadyInDb > 0) {
        // Already in DB but not in any team ==> already unseeded
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${canonicalName} is already unseeded (in the database but not in any team).`,
        }));
        return;
      }

      if (inAnyTeam) {
        // Move from team -> Unseeded (just remove from team;
        // DB member remains so they show up in unseeded)
        setLocalTeams((prev) =>
          prev.map((t, idx) =>
            idx === teamIndex
              ? {
                  ...t,
                  players: t.players.filter(
                    (p) => toTitleCase(p).toLowerCase() !== lowerName
                  ),
                }
              : t
          )
        );
      }

      // Make sure there is a DB record for this player
      await ensureMemberInDb(canonicalName);
    } else {
      // --- Adding to a TEAM ---
      const targetIndex = localTeams.findIndex((t) => t.id === id);
      if (targetIndex === -1) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: "Unknown team.",
        }));
        return;
      }

      const targetTeam = localTeams[targetIndex];
      const alreadyInTarget = (targetTeam.players || []).some(
        (p) => toTitleCase(p).toLowerCase() === lowerName
      );
      if (alreadyInTarget) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${canonicalName} is already in this team.`,
        }));
        return;
      }

      if (inAnyTeam && teamIndex !== targetIndex) {
        // Player is in a DIFFERENT team; require move via Unseeded first
        const existingTeam = localTeams[teamIndex];
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${canonicalName} is already in ${existingTeam.label}. Move them to Unseeded first, then assign to this team.`,
        }));
        return;
      }

      // If they were unseeded (in DB but not in any team), that's fine:
      // we just add them to this team.
      setLocalTeams((prev) =>
        prev.map((t, idx) =>
          idx === targetIndex
            ? { ...t, players: [...t.players, canonicalName] }
            : t
        )
      );

      // Ensure DB record exists
      await ensureMemberInDb(canonicalName);
    }

    setPendingNames((prev) => ({ ...prev, [id]: "" }));
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const handleRemovePlayer = (teamId, player) => {
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              players: t.players.filter((p) => p !== player),
            }
          : t
      )
    );
  };

  // Remove player completely from DB (only affects unseeded players)
  const handleRemoveUnseeded = async (playerName) => {
    const canonicalName = toTitleCase(playerName);
    const matches = findMembersByName(allPlayers, canonicalName);

    if (matches.length === 0) return;

    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            `Remove ${canonicalName} from the Turf Kings database? This does not affect past stats, but they will disappear from the unseeded pool.`
          )
        : true;

    if (!ok) return;

    try {
      await Promise.all(
        matches.map((p) => deleteDoc(doc(db, MEMBERS_COLLECTION, p.id)))
      );
    } catch (err) {
      console.error("[Squads] Error deleting member from DB:", err);
    }
  };

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

  const handleConfirmSave = () => {
    const code = saveCode.trim();
    if (code !== MASTER_CODE) {
      setSaveError("Invalid admin code.");
      return;
    }
    // Save teams but STAY on this page.
    onUpdateTeams(localTeams);
    handleCancelSave(); // just close modal
  };

  return (
    <div className="page squads-page">
      <header className="header">
        <h1>Manage Squads</h1>

        {playersLoading && (
          <p className="muted small">Loading players from database…</p>
        )}
        {playersError && <p className="error-text">{playersError}</p>}
      </header>

      <section className="card">
        <div className="squads-grid">
          {/* Real teams */}
          {localTeams.map((team) => {
            const inputId = team.id;
            const listId = `players-db-${inputId}`;

            return (
              <div key={team.id} className="squad-column">
                <h2>
                  {team.label}{" "}
                  <span className="captain-tag">(c: {team.captain})</span>
                </h2>

                <ul className="player-list">
                  {team.players.map((p) => (
                    <li key={p} className="player-row">
                      <span>{p}</span>
                      {p !== team.captain && (
                        <button
                          className="link-btn"
                          onClick={() => handleRemovePlayer(team.id, p)}
                        >
                          remove
                        </button>
                      )}
                    </li>
                  ))}
                  {team.players.length === 0 && (
                    <li className="player-row muted small">
                      No players yet in this squad.
                    </li>
                  )}
                </ul>

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
                  {/* Suggestions: ONLY unseeded players are available to assign */}
                  <datalist id={listId}>
                    {availableForTeams.map((name) => (
                      <option key={name} value={name} />
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
              </div>
            );
          })}

          {/* Unseeded / database-only players */}
          <div key={UNSEEDED_ID} className="squad-column">
            <h2>Unseeded players</h2>
            <p className="muted small">
              These players are stored in the Turf Kings database but are not
              assigned to any team yet. They are available in{" "}
              <strong>Lineups &amp; Formations (11-a-side)</strong> and in the{" "}
              <strong>picture selection</strong> UI.
            </p>

            <ul className="player-list">
              {unseededPlayers.map((p) => {
                const name = p.fullName
                  ? toTitleCase(p.fullName)
                  : p.name
                  ? toTitleCase(p.name)
                  : "Unknown";
                const roles = p.roles || {};
                const roleTag =
                  typeof p.role === "string" ? p.role.toLowerCase() : null;
                return (
                  <li key={p.id} className="player-row">
                    <span>
                      {name}{" "}
                      {roles.coach && (
                        <span className="tag tag-coach">Coach</span>
                      )}
                      {roles.admin && (
                        <span className="tag tag-admin">Admin</span>
                      )}
                      {roleTag === "coach" && (
                        <span className="tag tag-coach">Coach</span>
                      )}
                      {roleTag === "admin" && (
                        <span className="tag tag-admin">Admin</span>
                      )}
                    </span>
                    <button
                      className="link-btn"
                      onClick={() => handleRemoveUnseeded(name)}
                    >
                      ❌ delete?
                    </button>
                  </li>
                );
              })}
              {unseededPlayers.length === 0 && (
                <li className="player-row muted small">
                  No unseeded players right now. New approved members will
                  appear here automatically.
                </li>
              )}
            </ul>

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
              {/* Suggestions: ONLY players currently assigned to teams */}
              <datalist id="players-db-unseeded">
                {availableForUnseeded.map((name) => (
                  <option key={name} value={name} />
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
              <p className="error-text small">{addErrors[UNSEEDED_ID]}</p>
            )}

            {/* Tiny debug aid, muted */}

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
