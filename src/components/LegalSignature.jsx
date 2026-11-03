import React, { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";
import { LEGAL, legalText } from "../legal/policies.js";

export default function LegalSignature({ scope }) {
  const [status, setStatus] = useState("checking");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const agreement = LEGAL[scope];
  const user = auth.currentUser;

  useEffect(() => {
    if (!user?.uid || !agreement) return;
    let active = true;
    getDoc(doc(db, "legalAcceptances", user.uid, "records", agreement.version))
      .then(snap => {
        if (active) setStatus(snap.exists() ? "signed" : "ready");
      })
      .catch(() => {
        if (active) {
          setStatus("ready");
          setError("Could not check previous acceptance.");
        }
      });
    return () => { active = false; };
  }, [user?.uid, agreement]);

  async function sign() {
    if (!user?.uid || !checked || status !== "ready") return;
    setStatus("saving");
    setError("");
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(legalText(scope))
      );
      const documentHash = Array.from(
        new Uint8Array(digest),
        byte => byte.toString(16).padStart(2, "0")
      ).join("");
      await setDoc(
        doc(db, "legalAcceptances", user.uid, "records", agreement.version),
        {
          uid: user.uid,
          scope,
          version: agreement.version,
          documentHash,
          acceptedAt: serverTimestamp(),
        }
      );
      setStatus("signed");
    } catch (cause) {
      setError(cause?.message || "Could not record signature.");
      setStatus("ready");
    }
  }

  return <div style={{ padding: "14px 0 4px" }}>
    {status === "signed" ? (
      <p role="status">Signed for this version with your account.</p>
    ) : <>
      <label style={{ display: "flex", gap: 10, alignItems: "start" }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!user?.uid}
          onChange={event => setChecked(event.target.checked)}
        />
        <span>
          I have read and agree to the {scope === "field" ? "Field" : "Club"} Terms
          and acknowledge the Privacy Notice. Checking this box is my electronic signature.
        </span>
      </label>
      {!user?.uid && <p>Sign in to sign this agreement.</p>}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="hub-primary-button"
        disabled={!user?.uid || !checked || status !== "ready"}
        onClick={sign}
      >
        {status === "saving" ? "Recording signature…" : "Sign agreement"}
      </button>
    </>}
  </div>;
}
