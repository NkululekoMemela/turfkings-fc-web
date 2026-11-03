import React, { useEffect, useId, useState } from "react";
import "./FieldTravelSplash.css";

export default function FieldTravelSplash({
  destination, status, onRetry, onReturn, destinationKind = "field",
}) {
  const [delayed, setDelayed] = useState(false);
  const ballId=useId().replace(/:/g, "");

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
          <div className="football-travel__ball-shadow" />
          <div className="football-travel__ball-flight">
            <svg className="football-travel__ball" viewBox="0 0 100 100" aria-hidden="true">
              <defs><clipPath id={`ball-clip-${ballId}`}><circle cx="50" cy="50" r="46"/></clipPath><radialGradient id={`ball-shade-${ballId}`} cx="30%" cy="24%" r="78%"><stop stopColor="#fff"/><stop offset=".72" stopColor="#f1f5f9"/><stop offset="1" stopColor="#a6b3c3"/></radialGradient></defs>
              <circle cx="50" cy="50" r="46" fill={`url(#ball-shade-${ballId})`} stroke="#e2e8f0" strokeWidth="1.5"/>
              <g clipPath={`url(#ball-clip-${ballId})`}>
                <g fill="none" stroke="#64748b" strokeOpacity=".65" strokeWidth="1.2" strokeLinejoin="round"><path d="M50 32v-8M67 44l6-3M61 64l10 2M39 64l-10 2M33 44l-6-3M61 18l10 10M85 48l1 16M61 81H39M14 64l1-16M29 28l10-10"/></g>
                <g fill="#101820" stroke="#17212b" strokeWidth="1" strokeLinejoin="round">
                  <polygon points="50,32 67,44 61,64 39,64 33,44"/>
                  <polygon points="36,5 64,5 61,18 50,24 39,18"/>
                  <polygon points="85,20 96,40 85,48 73,41 71,28"/>
                  <polygon points="86,64 86,84 66,94 61,81 71,66"/>
                  <polygon points="14,64 29,66 39,81 34,94 14,84"/>
                  <polygon points="15,20 29,28 27,41 15,48 4,40"/>
                </g>
                <ellipse cx="32" cy="19" rx="16" ry="7" fill="#fff" opacity=".28" transform="rotate(-28 32 19)"/>
              </g>
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
