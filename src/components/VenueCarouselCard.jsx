import React, { useEffect, useState } from "react";

export default function VenueCarouselCard({ venue, onEnter }) {
  const [face, setFace] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => {
      setFace((current) => (current + 1) % 3);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const logoUrl =
    venue.branding?.logoUrl || venue.logoUrl || venue.image || "";
  const location = [
    venue.location?.suburb,
    venue.location?.city,
  ].filter(Boolean).join(", ");
  const clubCount = venue.league?.activeSeason?.clubIds?.length || 0;

  return (
    <button
      className="fanm-venues__venue-card fanm-venues__rotating-card"
      type="button"
      onClick={() => onEnter?.(venue)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onTouchCancel={() => setPaused(false)}
      aria-label={`Enter ${venue.name}`}
    >
      <span
        className="fanm-venues__rotating-face"
        key={face}
        aria-hidden="true"
      >
        {face === 0 ? (
          <span
            className="fanm-venues__badge"
            style={{ "--venue-accent": venue.branding?.accent || "#b98653" }}
          >
            {logoUrl ? <img src={logoUrl} alt="" /> :
              venue.name.trim().charAt(0).toUpperCase()}
          </span>
        ) : face === 1 ? (
          <span className="fanm-venues__face-icon">⌖</span>
        ) : (
          <span className="fanm-venues__face-icon">⚽</span>
        )}
        <strong>{venue.name}</strong>
        <small>
          {face === 0 ? (location || "Field league") :
            face === 1 ? (location || "Find your Field") :
            `${clubCount} ${clubCount === 1 ? "club" : "clubs"} in this season`}
        </small>
        <span className="fanm-venues__enter-hint">Enter Field ↗</span>
      </span>
    </button>
  );
}
