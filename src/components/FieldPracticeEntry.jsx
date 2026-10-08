import {createPortal} from "react-dom";
import {FieldRibbonContext} from "./FieldRibbonContext.jsx";
import React, {useContext, useEffect, useRef, useState} from "react";
import {doc, getDoc} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {fieldPracticeRequest} from "../storage/fieldPracticeGateway.js";
import FieldPracticeStartupSplash from "./FieldPracticeStartupSplash.jsx";
import {
  createPracticeVenueLeagueScope, venueLeagueRootPath,
} from "../core/venueLeaguePaths.js";

export default function FieldPracticeEntry({venue, userId, onPractice}) {
  const ribbonHost = useContext(FieldRibbonContext);
  const preferenceKey = `fanm:field:${venue.id}:user:${userId}:show-practice`;
  const [visible, setVisible] = useState(() => {
    try {return localStorage.getItem(preferenceKey) !== "hidden";}
    catch {return true;}
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false;};
  }, []);

  async function startPractice() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const {session} = await fieldPracticeRequest(
        "startFieldPracticeSession", {venueId: venue.id}
      );
      const scope = createPracticeVenueLeagueScope({
        venueId: venue.id, practiceSessionId: session.sessionId,
      });
      const snapshot = await getDoc(doc(db, venueLeagueRootPath(scope)));
      if (!snapshot.exists()) throw new Error("Practice workspace is not ready.");
      const expiry = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiry) || expiry <= Date.now()) {
        throw new Error("This Practice session expired. Start another session.");
      }
      if (mounted.current) onPractice(session);
    } catch (failure) {
      if (mounted.current) setError(failure.message || "Could not start Practice.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <>
    {ribbonHost && createPortal(<div className="field-practice-entry">
      {visible && <button type="button" className="secondary-btn"
        disabled={busy} onClick={startPractice}>
        Try practice session?
      </button>}
      <details className="field-practice-settings">
        <summary aria-label="Practice settings" title="Practice settings">⚙</summary>
        <label>
          <input type="checkbox" checked={visible} disabled={busy}
            onChange={event => {
              const next = event.target.checked;
              setVisible(next);
              try {localStorage.setItem(preferenceKey, next ? "shown" : "hidden");}
              catch { /* The preference still works during this visit. */ }
            }}/>
          Show practice session button
        </label>
      </details>
    </div>, ribbonHost)}
    {error && <p className="error-text" role="alert">{error}</p>}
    {busy && <FieldPracticeStartupSplash practiceBootstrapping/>}
    <style>{`
      .field-ribbon-practice-slot:empty {display: none;}
      .field-ribbon-practice-slot {flex: 0 0 auto;}
      .field-practice-entry {
        display: inline-flex; align-items: center; gap: 2px;
      }
      .field-practice-entry > button {
        width: 80px; max-width: 80px; min-height: 32px;
        padding: 4px 6px; font-size: 10px; line-height: 1.15;
        white-space: normal; border-radius: 10px; font-weight: 800;
        background: linear-gradient(100deg,#581c87,#86198f);
        color: #fff; border: 1px solid #d8b4fe;
      }
      .field-practice-settings {position: relative; color: #f3e8ff;}
      .field-practice-settings summary {
        list-style: none; cursor: pointer; padding: 3px;
        border-radius: 6px; font-size: 13px;
      }
      .field-practice-settings summary::-webkit-details-marker {display: none;}
      .field-practice-settings label {
        position: absolute; right: 0; top: 100%; z-index: 60;
        display: flex; align-items: center; gap: .65rem;
        width: min(270px, 80vw); box-sizing: border-box;
        padding: 1rem; border-radius: 12px;
        background: #10213a; color: #f8fafc;
        border: 1px solid #64748b; box-shadow: 0 8px 24px #0005;
      }
      .field-practice-settings input {width: 18px; height: 18px; flex-shrink: 0;}
    `}</style>
  </>;
}
