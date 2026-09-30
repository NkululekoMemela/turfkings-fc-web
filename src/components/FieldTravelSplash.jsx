import React, { useEffect, useState } from "react";
import "./FieldTravelSplash.css";

export default function FieldTravelSplash({
  destination, status, onRetry, onReturn, destinationKind = "field",
}) {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDelayed(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="football-travel" aria-busy="true">
      <div className="football-travel__content">
        <div className="football-travel__scene" aria-hidden="true">
          <div className="football-travel__glow" />
          <div className="football-travel__pitch">
            <div className="football-travel__centre" />
          </div>
          <div className="football-travel__gate">
            <div className="football-travel__net" />
            <div className="football-travel__ring football-travel__ring--one" />
            <div className="football-travel__ring football-travel__ring--two" />
            <div className="football-travel__ring football-travel__ring--three" />
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="football-travel__wave"
                style={{ animationDelay: `${i * -.65}s` }} />
            ))}
          </div>
          <div className="football-travel__ball-flight">
            <svg className="football-travel__ball" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="#f8fafc"
                stroke="#cbd5e1" strokeWidth="2" />
              <g fill="#0f172a" stroke="#0f172a" strokeWidth="2">
                <path d="M50 30l19 14-7 22H38l-7-22z" />
                <path d="M29 8l7 14-15 17L7 34M71 8l-7 14 15 17 14-5" />
                <path d="M10 70l18-3 12 20-6 8M90 70l-18-3-12 20 6 8" />
              </g>
              <g fill="none" stroke="#64748b" strokeWidth="1.4">
                <path d="M36 22l14 8 14-8M21 39l10 5M79 39l-10 5M28 67l10-1M72 67l-10-1M40 87l10-10 10 10M50 77V66" />
              </g>
              <ellipse cx="35" cy="23" rx="15" ry="7"
                fill="white" opacity=".55" transform="rotate(-25 35 23)" />
            </svg>
          </div>
        </div>

        <div className="football-travel__message" role="status" aria-live="polite">
          <p className="football-travel__eyebrow">
            {destinationKind === "club"
              ? "Taking you back to"
              : "Taking you to the"}
          </p>
          <h2>{destinationKind === "club" ? destination : "Official League"}</h2>
          {destinationKind !== "club" && (
            <p className="football-travel__field-name">{destination}</p>
          )}
          <p className="football-travel__caption">
            {destinationKind === "club"
              ? "Returning to your Club"
              : "The Field you play on."}
          </p>
          {delayed && (onRetry || onReturn) && (
            <div className="football-travel__delayed">
              <p>{status || "Connecting your Club account…"}</p>
              <div className="football-travel__actions">
                {onRetry && (
                  <button type="button" className="primary-btn"
                    onClick={onRetry}>Retry entry</button>
                )}
                {onReturn && (
                  <button type="button" className="secondary-btn"
                    onClick={onReturn}>Return to Club</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
