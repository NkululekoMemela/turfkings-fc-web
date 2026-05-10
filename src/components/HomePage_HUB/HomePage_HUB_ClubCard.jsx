// src/components/HomePage_HUB/HomePage_HUB_ClubCard.jsx

import React, { useEffect, useMemo, useState } from "react";
import { getClubInitials } from "../../core/homePageHubLogoUtils";

function getHighlightPreview(club) {
  if (club?.highlightText) return club.highlightText;
  if (club?.latestHighlight) return club.latestHighlight;

  if (club?.videosAvailable || club?.highlightCount) {
    const count = Number(club.highlightCount || club.videosAvailable || 0);
    return count > 0
      ? `${count} highlight${count === 1 ? "" : "s"} available`
      : "Highlights coming soon";
  }

  return "Highlights coming soon";
}

export default function HomePage_HUB_ClubCard({ club, onOpenClubActions }) {
  const [faceIndex, setFaceIndex] = useState(0);

  const initials = useMemo(() => getClubInitials(club?.name), [club?.name]);

  const accent = club?.accent || "#16a34a";
  const location =
    club?.location ||
    club?.locationDetails?.displayLocation ||
    club?.area ||
    "Location to be confirmed";
  const playTime =
    club?.weeklyPlayTime ||
    club?.schedule?.weeklyPlayTime ||
    club?.playTime ||
    "Play time to be confirmed";
  const highlightPreview = getHighlightPreview(club);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFaceIndex((current) => (current + 1) % 3);
    }, 7000);

    return () => window.clearInterval(timer);
  }, []);

  if (!club) return null;

  return (
    <article
      className="hub-club-card"
      style={{ "--hub-club-accent": accent }}
      onClick={() => onOpenClubActions?.(club)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenClubActions?.(club);
        }
      }}
      aria-label={`Open ${club.name || "club"}`}
    >
      <div className={`hub-club-card__cube hub-club-card__cube--face-${faceIndex}`}>
        <section className="hub-club-card__face hub-club-card__face--logo">
          <div className="hub-club-card__logo-ring">
            {club.image || club.logoUrl ? (
              <img
                src={club.image || club.logoUrl}
                alt={`${club.name || "Club"} logo`}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span>{club.logoText || initials}</span>
            )}
          </div>

          <strong>{club.name || "Football Club"}</strong>
          <small>Tap to enter</small>
        </section>

        <section className="hub-club-card__face hub-club-card__face--details">
          <span className="hub-club-card__eyebrow">Club details</span>
          <h3>{club.name || "Football Club"}</h3>
          <p>📍 {location}</p>
          <p>🕒 {playTime}</p>
          {club.activity ? <em>{club.activity}</em> : <em>Open for players</em>}
        </section>

        <section className="hub-club-card__face hub-club-card__face--highlights">
          <span className="hub-club-card__eyebrow">Highlights</span>
          <div className="hub-club-card__play">▶</div>
          <h3>{highlightPreview}</h3>
          <p>Goals, saves and skills from this club will live here.</p>
        </section>
      </div>
    </article>
  );
}
