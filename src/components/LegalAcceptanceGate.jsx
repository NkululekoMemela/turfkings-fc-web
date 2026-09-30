import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, activeFirebaseProjectId } from "../firebaseConfig.js";
import { LEGAL, legalText } from "../legal/policies.js";

const installationKey =
  `native-installation-agreement:${activeFirebaseProjectId}:v1`;
const acceptanceEvent = "native-installation-agreement-accepted";

function installationAccepted() {
  try {
    return Boolean(window.localStorage.getItem(installationKey));
  } catch {
    return false;
  }
}

export default function LegalAcceptanceGate({ user }) {
  // Browser visits never mount the automatic agreement gate.
  if (!Capacitor.isNativePlatform() || !user?.uid) return null;
  return <NativeInstallationAgreement key={user.uid} user={user} />;
}

function NativeInstallationAgreement({ user }) {
  const [accepted, setAccepted] = useState(installationAccepted);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => setAccepted(installationAccepted());
    window.addEventListener(acceptanceEvent, refresh);
    return () => window.removeEventListener(acceptanceEvent, refresh);
  }, []);

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    setError("");
    try {
      // Keep the existing immutable, account-linked acceptance records.
      for (const scope of ["club", "field"]) {
        const agreement = LEGAL[scope];
        if (!agreement) throw new Error("The app agreement is unavailable.");
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(legalText(scope))
        );
        const documentHash = Array.from(
          new Uint8Array(digest),
          byte => byte.toString(16).padStart(2, "0")
        ).join("");
        const ref = doc(
          db, "legalAcceptances", user.uid, "records", agreement.version
        );
        const snapshot = await getDoc(ref);
        if (snapshot.exists()) {
          const record = snapshot.data();
          if (record.uid !== user.uid || record.scope !== scope ||
              record.documentHash !== documentHash) {
            throw new Error("The recorded agreement does not match this version.");
          }
        } else {
          await setDoc(ref, {
            uid: user.uid,
            scope,
            version: agreement.version,
            documentHash,
            acceptedAt: serverTimestamp(),
          });
        }
      }

      window.localStorage.setItem(installationKey, JSON.stringify({
        acceptedByUid: user.uid,
        acceptedAtMs: Date.now(),
        clubVersion: LEGAL.club.version,
        fieldVersion: LEGAL.field.version,
      }));
      setAccepted(true);
      window.dispatchEvent(new Event(acceptanceEvent));
    } catch (cause) {
      console.error("[Native installation agreement]", cause);
      setError("Could not save your agreement. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (accepted) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 30000,
      background: "rgba(3,9,22,.92)", display: "grid",
      placeItems: "center", padding: 16,
    }}>
      <section role="dialog" aria-modal="true"
        aria-labelledby="native-installation-agreement-title"
        style={{
          color: "#f8fafc", background: "#101b30",
          border: "1px solid #b99d70", borderRadius: 18,
          width: "min(720px,100%)", maxHeight: "94dvh",
          display: "flex", flexDirection: "column", padding: 20,
        }}>
        <h2 id="native-installation-agreement-title">
          Welcome — App Terms and Privacy Notice
        </h2>
        <p>Review the Club and Field agreements once for this installation.</p>
        <div style={{ overflowY: "auto", paddingRight: 12, flex: 1 }}>
          {["club", "field"].map(scope => (
            <section key={scope}>
              <h3>{LEGAL[scope].title}</h3>
              <small>Version {LEGAL[scope].version}</small>
              {LEGAL[scope].sections.map(([heading, content]) => (
                <section key={heading}>
                  <h4>{heading}</h4>
                  <p>{content}</p>
                </section>
              ))}
            </section>
          ))}
        </div>
        <label style={{ display: "flex", gap: 10, margin: "14px 0" }}>
          <input type="checkbox" checked={checked} disabled={saving}
            onChange={event => setChecked(event.target.checked)} />
          <span>
            I agree to the Club and Field Terms and acknowledge their
            Privacy Notices. Checking this box is my electronic signature.
          </span>
        </label>
        {error && <p role="alert" style={{ color: "#fca5a5" }}>{error}</p>}
        <button type="button" className="primary-btn"
          disabled={!checked || saving} onClick={accept}>
          {saving ? "Saving agreement…" : "Agree and continue"}
        </button>
      </section>
    </div>
  );
}
