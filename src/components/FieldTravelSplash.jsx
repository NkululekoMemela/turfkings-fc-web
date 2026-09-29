import React, { useEffect, useState } from "react";

export default function FieldTravelSplash({
  destination, status, onRetry, onReturn,
}) {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDelayed(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main role="status" aria-live="polite" aria-busy="true" style={{
      position: "fixed", inset: 0, zIndex: 12000,
      display: "grid", placeItems: "center",
      padding: "max(24px, env(safe-area-inset-top)) 24px",
      boxSizing: "border-box", overflowY: "auto", color: "#fff",
      background: "radial-gradient(ellipse at center, #164e63, #17112e 55%, #020617)",
    }}>
      <div style={{ textAlign: "center", width: "min(100%,460px)" }}>
        <span aria-hidden="true" style={{
          display: "grid", placeItems: "center",
          width: "100px", height: "120px", margin: "0 auto 24px",
          borderRadius: "50%", border: "4px solid #a78bfa",
          boxShadow: "0 0 35px #8b5cf6, inset 0 0 25px #22d3ee",
          fontSize: "44px",
        }}>🏟️</span>
        <p style={{ color: "#c4b5fd", fontWeight: 700 }}>Taking you to</p>
        <h2 style={{ overflowWrap: "anywhere" }}>{destination}</h2>
        {delayed && (onRetry || onReturn) && (
          <>
            <p>{status || "Connecting your Club account…"}</p>
            <div style={{
              display: "flex", flexWrap: "wrap",
              gap: "12px", justifyContent: "center",
            }}>
              {onRetry && (
                <button type="button" className="primary-btn"
                  onClick={onRetry}>Retry entry</button>
              )}
              {onReturn && (
                <button type="button" className="secondary-btn"
                  onClick={onReturn}>Return to Club</button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
