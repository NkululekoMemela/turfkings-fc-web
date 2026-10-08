import React, {useContext, useEffect, useId, useState} from "react";
import {createPortal} from "react-dom";
import {FieldRibbonContext} from "./FieldRibbonContext.jsx";

export default function FieldPracticeTimer({expiresAt, onExit}) {
  const ribbonHost = useContext(FieldRibbonContext);
  const expiry = Date.parse(expiresAt);
  const remaining = () => Number.isFinite(expiry)
    ? Math.max(0, Math.ceil((expiry - Date.now()) / 1000))
    : 0;
  const [seconds, setSeconds] = useState(remaining);
  const [minimized, setMinimized] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();

  useEffect(() => {
    setSeconds(remaining());
    const timer = window.setInterval(() => setSeconds(remaining()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:` +
    String(seconds % 60).padStart(2, "0");
  const buttonStyle = {
    minHeight: 30, padding: "4px 8px", borderRadius: 9,
    border: "1px solid rgba(255,255,255,.45)",
    background: "rgba(255,255,255,.1)", color: "#fff",
    fontSize: 11, cursor: "pointer",
  };

  return <>
    {ribbonHost && onExit && createPortal(
      <button type="button" onClick={onExit}
        title="Return to Official" aria-label="Return to Official"
        style={{width: 80, minHeight: 32, padding: "4px 6px",
          fontSize: 10, lineHeight: 1.15, borderRadius: 10, fontWeight: 800,
          background: "linear-gradient(100deg,#581c87,#86198f)",
          color: "#fff", border: "1px solid #d8b4fe", cursor: "pointer"}}>
        Return to Official
      </button>, ribbonHost)}
    <section aria-label="Practice session ribbon"
    style={{
      position: "sticky", top: 126, zIndex: 45,
      width: minimized ? "fit-content" : "100%",
      maxWidth: "100%", boxSizing: "border-box", marginLeft: "auto",
      padding: minimized ? "5px 7px" : "8px 12px",
      borderRadius: 14, marginBottom: 12,
      background: "linear-gradient(100deg,#581c87,#86198f)",
      color: "white", border: "1px solid rgba(255,255,255,.2)",
    }}>
    <div style={{display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8}}>
      {!minimized && <strong style={{fontSize: 12, marginRight: "auto"}}>
        Practice session
      </strong>}
      {minimized && <span aria-hidden="true">🎮</span>}
      <span role="timer" aria-live="off"
        aria-label={`Practice time remaining ${label}`}
        style={{fontVariantNumeric: "tabular-nums", fontWeight: 800, fontSize: 13}}>
        {label}
      </span>
      {!minimized && <>
        <button type="button" style={buttonStyle}
          aria-expanded={showDetails} aria-controls={detailsId}
          onClick={() => setShowDetails(value => !value)}>
          {showDetails ? "Hide details" : "Details"}
        </button>
      </>}
      <button type="button" style={buttonStyle}
        aria-label={minimized ? "Expand Practice ribbon" : "Minimize Practice ribbon"}
        title={minimized ? "Expand Practice ribbon" : "Minimize Practice ribbon"}
        aria-expanded={!minimized}
        onClick={() => setMinimized(value => !value)}>
        <span aria-hidden="true">{minimized ? "◂" : "▸"}</span>
      </button>
    </div>
    {!minimized && showDetails && <div id={detailsId}
      style={{fontSize: 12, lineHeight: 1.5, marginTop: 10,
        borderTop: "1px solid rgba(255,255,255,.25)", paddingTop: 8}}>
      <p style={{margin: "0 0 6px"}}>
        Practice is your 15-minute training space. Rehearse league setup,
        squads and matches without changing Official Field records.
      </p>
      <p style={{margin: 0}}>
        Official is for real seasons, match results and standings.
        Practice activity stays separate. The countdown shows the time
        left in this session. Choose Return to Official on the top ribbon to return to your real Field.
      </p>
    </div>}
  </section>
  </>;
}
