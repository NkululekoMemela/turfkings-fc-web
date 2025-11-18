// src/pages/SquadsPage.jsx

import React, { useState } from "react";

const MASTER_CODE = "3333"; // Nkululeko only

export function SquadsPage({ teams, onUpdateTeams, onBack }) {
  const [localTeams, setLocalTeams] = useState(() =>
    teams.map((t) => ({ ...t, players: [...t.players] }))
  );
  const [pendingNames, setPendingNames] = useState({});
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCode, setSaveCode] = useState("");
  const [saveError, setSaveError] = useState("");

  const handlePendingChange = (teamId, value) => {
    setPendingNames((prev) => ({ ...prev, [teamId]: value }));
  };

  const handleAddPlayer = (teamId) => {
    const name = (pendingNames[teamId] || "").trim();
    if (!name) return;
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === teamId && !t.players.includes(name)
          ? { ...t, players: [...t.players, name] }
          : t
      )
    );
    setPendingNames((prev) => ({ ...prev, [teamId]: "" }));
  };

  const handleRemovePlayer = (teamId, player) => {
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? { ...t, players: t.players.filter((p) => p !== player) }
          : t
      )
    );
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
    onUpdateTeams(localTeams);
    handleCancelSave();
    onBack();
  };

  return (
    <div className="page squads-page">
      <header className="header">
        <h1>Manage Squads</h1>
        <p className="subtitle">
          Adjust player lists. Changes affect future matches – past stats stay as
          they were.
        </p>
      </header>

      <section className="card">
        <div className="squads-grid">
          {localTeams.map((team) => (
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
                  placeholder="Add player..."
                  value={pendingNames[team.id] || ""}
                  onChange={(e) =>
                    handlePendingChange(team.id, e.target.value)
                  }
                />
                <button
                  className="secondary-btn"
                  onClick={() => handleAddPlayer(team.id)}
                >
                  Add
                </button>
              </div>
            </div>
          ))}
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
