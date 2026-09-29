import React, { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import { LEGAL, legalText } from "../legal/policies.js";

export default function LegalAcceptanceGate({ user, scope }) {
  const [state, setState] = useState("checking");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const agreement = LEGAL[scope];
  useEffect(() => {
    if (!user?.uid || !agreement) return undefined;
    let active = true;
    setState("checking");
    setChecked(false);
    getDoc(doc(db, "legalAcceptances", user.uid, "records", agreement.version))
      .then((snap) => { if (active) setState(snap.exists() ? "accepted" : "required"); })
      .catch(() => { if (active) { setError("Could not check your agreement."); setState("required"); } });
    return () => { active = false; };
  }, [user?.uid, scope, agreement]);

  if (!user?.uid || !agreement || state === "accepted") return null;
  async function accept() {
    if (!checked || state === "saving") return;
    setState("saving"); setError("");
    try {
      const bytes = new TextEncoder().encode(legalText(scope));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
      await setDoc(doc(db, "legalAcceptances", user.uid, "records", agreement.version), {
        uid: user.uid, scope, version: agreement.version,
        documentHash: hash, acceptedAt: serverTimestamp(),
      });
      setState("accepted");
    } catch (cause) {
      setError(cause?.message || "Could not record acceptance.");
      setState("required");
    }
  }

  return <div role="presentation" style={{ position:"fixed", inset:0, zIndex:30000, background:"rgba(3,9,22,.92)", display:"grid", placeItems:"center", padding:16 }}>
    <section role="dialog" aria-modal="true" aria-label={agreement.title} style={{ color:"#f8fafc", background:"#101b30", border:"1px solid #b99d70", borderRadius:18, width:"min(720px,100%)", maxHeight:"94dvh", display:"flex", flexDirection:"column", padding:20 }}>
      <h2 style={{ margin:"0 0 8px" }}>{agreement.title}</h2>
      <p style={{ margin:"0 0 10px" }}>Version {agreement.version}. Review the agreement before continuing.</p>
      <div style={{ overflowY:"auto", paddingRight:12, flex:1 }}>
        {agreement.sections.map(([heading, text]) => <section key={heading}><h3>{heading}</h3><p>{text}</p></section>)}
      </div>
      <label style={{ display:"flex", gap:10, margin:"14px 0" }}>
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>I have read and agree to these {scope === "field" ? "Field" : "Club"} Terms and acknowledge the Privacy Notice. Checking this box is my electronic signature.</span>
      </label>
      {error && <p role="alert" style={{ color:"#fca5a5" }}>{error}</p>}
      <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(legalText(scope))}`}
        download={`${agreement.version}.txt`} style={{ color:"#facc15", marginBottom:10 }}>
        Save a copy of this agreement
      </a>
      <button type="button" disabled={!checked || state === "saving"} onClick={accept} className="primary-btn">
        {state === "saving" ? "Recording acceptance…" : "Sign agreement and continue"}
      </button>
    </section>
  </div>;
}
