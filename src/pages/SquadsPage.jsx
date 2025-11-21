// src/pages/SquadsPage.jsx

import React, { useEffect, useState } from "react";

const MASTER_CODE = "3333"; // Nkululeko only
const UNSEEDED_ID = "__unseeded__";
const EXTRA_PLAYERS_KEY = "turfkings_extra_players_v1"; // shared with FormationsPage

// Helper: enforce "Title Case" (capital letter at the beginning of each word)
function toTitleCase(name) {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function loadUnseededPlayers() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXTRA_PLAYERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUnseededPlayers(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXTRA_PLAYERS_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

export function SquadsPage({ teams, onUpdateTeams, onBack }) {
  const [localTeams, setLocalTeams] = useState(() =>
    teams.map((t) => ({ ...t, players: [...t.players] }))
  );

  // 🔥 Unseeded / database-only players (not assigned to a team)
  const [unseededPlayers, setUnseededPlayers] = useState(() =>
    loadUnseededPlayers()
  );

  const [pendingNames, setPendingNames] = useState({});
  const [addErrors, setAddErrors] = useState({}); // per-team / unseeded add error

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");

  // Persist unseeded players to localStorage
  useEffect(() => {
    saveUnseededPlayers(unseededPlayers);
  }, [unseededPlayers]);

  // Players currently assigned to teams
  const playersAssignedToTeams = Array.from(
    new Set(localTeams.flatMap((t) => t.players || []))
  ).sort((a, b) => a.localeCompare(b));

  // For team dropdowns: available players are ONLY unseeded players
  const availableForTeams = [...unseededPlayers].sort((a, b) =>
    a.localeCompare(b)
  );

  // For Unseeded dropdown: available players are ONLY players currently in teams
  const availableForUnseeded = playersAssignedToTeams;

  const handlePendingChange = (id, value) => {
    setPendingNames((prev) => ({ ...prev, [id]: value }));
    // clear any previous error when user types again
    setAddErrors((prev) => ({ ...prev, [id]: "" }));
  };

  const handleAddPlayer = (id) => {
    const raw = pendingNames[id] || "";
    const trimmed = raw.trim();
    if (!trimmed) return;

    // 🔤 Enforce Title Case
    const canonicalName = toTitleCase(trimmed);
    const lowerName = canonicalName.toLowerCase();

    // locate where this player currently lives (if anywhere)
    const teamIndex = localTeams.findIndex((t) =>
      (t.players || []).some((p) => p.toLowerCase() === lowerName)
    );
    const inUnseeded = unseededPlayers.some(
      (p) => p.toLowerCase() === lowerName
    );

    if (id === UNSEEDED_ID) {
      // --- Adding to Unseeded bin ---
      if (inUnseeded) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${canonicalName} is already in Unseeded players.`,
        }));
        return;
      }

      if (teamIndex >= 0) {
        // Move from team -> Unseeded
        const teamId = localTeams[teamIndex].id;
        setLocalTeams((prev) =>
          prev.map((t, idx) =>
            idx === teamIndex
              ? {
                  ...t,
                  players: t.players.filter(
                    (p) => p.toLowerCase() !== lowerName
                  ),
                }
              : t
          )
        );
        setUnseededPlayers((prev) => [...prev, canonicalName]);
      } else {
        // Brand new player -> Unseeded
        setUnseededPlayers((prev) => [...prev, canonicalName]);
      }
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
        (p) => p.toLowerCase() === lowerName
      );
      if (alreadyInTarget) {
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${canonicalName} is already in this team.`,
        }));
        return;
      }

      if (teamIndex >= 0 && teamIndex !== targetIndex) {
        // Player is in a DIFFERENT team; require move via Unseeded first
        const existingTeam = localTeams[teamIndex];
        setAddErrors((prev) => ({
          ...prev,
          [id]: `${canonicalName} is already in ${existingTeam.label}. Move them to Unseeded first, then assign to this team.`,
        }));
        return;
      }

      if (inUnseeded) {
        // Move from Unseeded -> this team
        setUnseededPlayers((prev) =>
          prev.filter((p) => p.toLowerCase() !== lowerName)
        );
        setLocalTeams((prev) =>
          prev.map((t, idx) =>
            idx === targetIndex
              ? { ...t, players: [...t.players, canonicalName] }
              : t
          )
        );
      } else {
        // Brand new player -> directly into this team
        setLocalTeams((prev) =>
          prev.map((t, idx) =>
            idx === targetIndex
              ? { ...t, players: [...t.players, canonicalName] }
              : t
          )
        );
      }
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

  const handleRemoveUnseeded = (player) => {
    setUnseededPlayers((prev) => prev.filter((p) => p !== player));
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
    // Save teams but STAY on this page. Unseeded players are already persisted to localStorage.
    onUpdateTeams(localTeams);
    handleCancelSave(); // just close modal
  };

  return (
    <div className="page squads-page">
      <header className="header">
        <h1>Manage Squads</h1>
        <p className="subtitle">
          Adjust player lists and manage{" "}
          <strong>Unseeded players (database-only)</strong>. Changes affect
          future matches – past stats stay as they were.
          <br />
          <strong>
            Player names are stored in Title Case and are unique across all
            teams and Unseeded players.
          </strong>
        </p>
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
              assigned to any team yet. They are still available in{" "}
              <strong>Lineups &amp; Formations</strong>.
            </p>

            <ul className="player-list">
              {unseededPlayers.map((p) => (
                <li key={p} className="player-row">
                  <span>{p}</span>
                  <button
                    className="link-btn"
                    onClick={() => handleRemoveUnseeded(p)}
                  >
                    remove
                  </button>
                </li>
              ))}
              {unseededPlayers.length === 0 && (
                <li className="player-row muted small">
                  No unseeded players yet.
                </li>
              )}
            </ul>

            <div className="add-player-row">
              <input
                className="text-input"
                placeholder="Add NEW / move from team..."
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
