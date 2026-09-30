import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  auth, provider, signInWithGoogle,
  activeFirebaseEnvironment, activeFirebaseProjectId,
  defaultFirebaseEnvironment, firebaseEnvironmentSwitchEnabled,
  switchFirebaseEnvironment, returnToConfiguredFirebaseEnvironment,
} from "../firebaseConfig.js";
import { isFirebaseEnvironmentAdmin } from "../core/firebaseEnvironmentPolicy.js";

const panelStyle = {
  boxSizing: "border-box", width: "100%", padding: "20px",
  border: "1px solid rgba(167,139,250,.45)", borderRadius: "22px",
  background: "linear-gradient(135deg,#17112e,#071426)", color: "#fff",
};
const buttonStyle = {
  flex: "1 1 130px", minHeight: "46px", padding: "10px 16px",
  borderRadius: "14px", fontSize: "16px", fontWeight: 800,
  cursor: "pointer",
};

export default function FirebaseEnvironmentControl({ user }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!firebaseEnvironmentSwitchEnabled || !isFirebaseEnvironmentAdmin(user)) {
    return null;
  }

  async function change(next) {
    if (busy || next === activeFirebaseEnvironment) return;
    setBusy(true);
    setError("");
    try {
      await switchFirebaseEnvironment(next);
    } catch (failure) {
      setError(failure.message || "Could not switch environments.");
      setBusy(false);
    }
  }

  return (
    <section style={{ ...panelStyle, margin: "24px 0" }}
      aria-label="Superadmin database environment">
      <small style={{ color: "#c4b5fd", fontWeight: 800 }}>SUPERADMIN</small>
      <h3 style={{ margin: "8px 0" }}>Database environment</h3>
      <p style={{ margin: "0 0 14px", overflowWrap: "anywhere" }}>
        Connected to <strong>{activeFirebaseEnvironment === "production"
          ? "Production" : "Staging"}</strong><br />
        <small>{activeFirebaseProjectId}</small>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {["staging", "production"].map(environment => {
          const selected = environment === activeFirebaseEnvironment;
          return (
            <button key={environment} type="button"
              aria-pressed={selected} disabled={busy}
              onClick={() => change(environment)}
              style={{
                ...buttonStyle,
                color: selected ? "#111827" : "#fff",
                background: selected
                  ? environment === "production" ? "#fbbf24" : "#67e8f9"
                  : "rgba(255,255,255,.06)",
                border: "1px solid rgba(196,181,253,.4)",
                opacity: busy ? .65 : 1,
              }}>
              {environment === "production" ? "Production" : "Staging"}
            </button>
          );
        })}
      </div>
      <p style={{ margin: "12px 0 0", color: "#cbd5e1", fontSize: "13px" }}>
        {busy ? "Saving pending changes and switching…" :
          "Switching reloads the whole app. Production uses live data."}
      </p>
      {error && <p role="alert" style={{ color: "#fda4af" }}>{error}</p>}
    </section>
  );
}

export function FirebaseEnvironmentGate({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, current => {
    setUser(current);
    setReady(true);
  }, failure => {
    setError(failure.message);
    setReady(true);
  }), []);

  const override = firebaseEnvironmentSwitchEnabled &&
    activeFirebaseEnvironment !== defaultFirebaseEnvironment;

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithGoogle();
    } catch (failure) {
      setError(failure.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  if (override && (!ready || !isFirebaseEnvironmentAdmin(user))) {
    return (
      <main style={{
        minHeight: "100dvh", display: "grid", placeItems: "center",
        padding: "20px", boxSizing: "border-box", background: "#080d1b",
      }}>
        <section style={{ ...panelStyle, maxWidth: "460px" }}>
          <h1 style={{ fontSize: "26px" }}>
            {activeFirebaseEnvironment === "production" ? "Production" : "Staging"}
          </h1>
          <p>{ready
            ? "Sign in with your superadmin account to open this environment."
            : "Checking your sign-in…"}</p>
          <small style={{ overflowWrap: "anywhere" }}>{activeFirebaseProjectId}</small>
          {ready && (
            <div style={{ display: "grid", gap: "12px", marginTop: "20px" }}>
              <button type="button" disabled={busy} onClick={signIn}
                style={{ ...buttonStyle, background: "#67e8f9", color: "#111827" }}>
                {busy ? "Signing in…" : "Sign in as superadmin"}
              </button>
              <button type="button"
                onClick={async () => {
                  try { await returnToConfiguredFirebaseEnvironment(); }
                  catch (failure) { setError(failure.message); }
                }}
                style={{ ...buttonStyle, background: "#211c2b", color: "#fff" }}>
                Return to {defaultFirebaseEnvironment === "production"
                  ? "Production" : "Staging"}
              </button>
            </div>
          )}
          {error && <p role="alert" style={{ color: "#fda4af" }}>{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <>
      {children}
      {firebaseEnvironmentSwitchEnabled && isFirebaseEnvironmentAdmin(user) && (
        <div aria-label={`Active database: ${activeFirebaseEnvironment}`}
          style={{
            position: "fixed", right: "8px",
            top: "calc(8px + env(safe-area-inset-top))",
            zIndex: 20000, pointerEvents: "none",
            padding: "4px 8px", borderRadius: "8px",
            background: activeFirebaseEnvironment === "production"
              ? "#fbbf24" : "#67e8f9",
            color: "#111827", fontSize: "10px", fontWeight: 900,
          }}>
          {activeFirebaseEnvironment.toUpperCase()}
        </div>
      )}
    </>
  );
}
