// src/pages/MigrationPage.jsx
import React, { useMemo, useState } from "react";
import { migrateLegacyToV2Season1 } from "../tools/migrateLegacyToV2Season1";
import { useAuth } from "../auth/AuthContext.jsx";
import { isCaptainEmail } from "../core/captainAuth.js";

export function MigrationPage({ onBack }) {
  const { authUser } = useAuth() || {};
  const user = authUser || null;

  const isCaptain = useMemo(() => {
    const email = (user?.email || "").trim().toLowerCase();
    if (!email) return false;
    try {
      return isCaptainEmail(email);
    } catch {
      return false;
    }
  }, [user]);

  const [targetSeasonId, setTargetSeasonId] = useState("2026-S1");
  const [targetSeasonNo, setTargetSeasonNo] = useState(1);
  const [overwriteV2, setOverwriteV2] = useState(true);

  const [confirm1, setConfirm1] = useState(false);
  const [confirm2, setConfirm2] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const canRun =
    isCaptain &&
    confirm1 &&
    confirm2 &&
    confirmText.trim().toUpperCase() === "MIGRATE" &&
    !busy;

  const run = async () => {
    setError("");
    setResult(null);

    if (!isCaptain) {
      setError("Only Captain accounts may run this migration.");
      return;
    }

    const ok = window.confirm(
      "This will COPY data from legacy (read-only) into V2 as Season-1.\n\nContinue?"
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await migrateLegacyToV2Season1({
        targetSeasonId: targetSeasonId.trim(),
        targetSeasonNo: Number(targetSeasonNo) || 1,
        overwriteV2: !!overwriteV2,
      });
      setResult(res);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page stats-page">
      <header className="header">
        <h1>Migration (Legacy ➜ V2)</h1>
        <div className="stats-header-actions">
          <button className="secondary-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <section className="card">
        <h2>Admin only</h2>

        {user ? (
          <p className="muted">
            Signed in as <strong>{user.displayName || user.email}</strong>
          </p>
        ) : (
          <p className="muted">Not signed in.</p>
        )}

        {!isCaptain && (
          <div
            style={{
              padding: "0.9rem",
              borderRadius: "12px",
              background: "rgba(255,0,0,0.08)",
              border: "1px solid rgba(255,0,0,0.25)",
              marginTop: "0.6rem",
              fontWeight: 800,
            }}
          >
            Captain access required to run migration.
          </div>
        )}
      </section>

      <section className="card">
        <h2>Target</h2>

        <div style={{ display: "grid", gap: "0.75rem", maxWidth: 520 }}>
          <div>
            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
              Target Season ID (V2)
            </label>
            <input
              type="text"
              value={targetSeasonId}
              onChange={(e) => setTargetSeasonId(e.target.value)}
              placeholder="2026-S1"
              style={{ width: "100%" }}
            />
            <div className="muted" style={{ marginTop: 6 }}>
              Example: 2026-S1
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
              Target Season No
            </label>
            <input
              type="number"
              value={targetSeasonNo}
              onChange={(e) => setTargetSeasonNo(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              id="overwriteV2"
              type="checkbox"
              checked={overwriteV2}
              onChange={(e) => setOverwriteV2(e.target.checked)}
            />
            <label htmlFor="overwriteV2" style={{ fontWeight: 800 }}>
              Overwrite V2 doc (recommended)
            </label>
          </div>

          <div className="muted">
            Overwrite mode resets <code>appState_v2/main</code> to a clean Season-1 import.
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Safety confirmations</h2>

        <div style={{ display: "grid", gap: "0.6rem", maxWidth: 720 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={confirm1}
              onChange={(e) => setConfirm1(e.target.checked)}
            />
            <span>
              I understand this only <strong>reads</strong> legacy (<code>appState/main</code>) and
              only <strong>writes</strong> to V2 (<code>appState_v2/main</code>).
            </span>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={confirm2}
              onChange={(e) => setConfirm2(e.target.checked)}
            />
            <span>
              I will run this <strong>once</strong>, verify, then remove the migration page + tool.
            </span>
          </label>

          <div>
            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
              Type <code>MIGRATE</code> to enable
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              style={{ width: "100%", maxWidth: 320 }}
              placeholder="MIGRATE"
            />
          </div>

          <button
            className="secondary-btn"
            onClick={run}
            disabled={!canRun}
            style={{
              marginTop: "0.6rem",
              fontWeight: 900,
              opacity: canRun ? 1 : 0.6,
            }}
          >
            {busy ? "Running migration..." : "RUN MIGRATION (Legacy ➜ V2 Season-1)"}
          </button>

          {error && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.9rem",
                borderRadius: 12,
                background: "rgba(255,0,0,0.08)",
                border: "1px solid rgba(255,0,0,0.25)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Error</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {error}
              </div>
            </div>
          )}

          {result && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.9rem",
                borderRadius: 12,
                background: "rgba(0,255,0,0.08)",
                border: "1px solid rgba(0,255,0,0.22)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Migration complete ✅</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Written to <code>{result.v2WrittenTo}</code> as <code>{result.targetSeasonId}</code>
              </div>
              <ul className="muted" style={{ marginTop: 8 }}>
                <li>Teams: {result.seasonTeams}</li>
                <li>Results: {result.seasonResults}</li>
                <li>Match days: {result.seasonMatchDays}</li>
                <li>All events: {result.seasonAllEvents}</li>
              </ul>
              <div className="muted" style={{ marginTop: 10, fontWeight: 800 }}>
                Now refresh Firestore and confirm:{" "}
                <code>appState_v2/main/state/seasons[0].seasonId</code>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}