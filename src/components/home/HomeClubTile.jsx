// src/components/home/HomeClubTile.jsx
import React from "react";

export default function HomeClubTile({ club, onViewClub, onJoinClub, onChallengeClub }) {
  if (!club) return null;

  const shortCount = Number(club.helpNeeded || 0);

  return (
    <article className="fanm-club-card fanm-club-card--logo-led" style={{ "--club-accent": club.accent || "#22c55e" }}>
      <div className="fanm-club-card__hero-logo" aria-label={`${club.name} logo`}>
        {club.image ? (
          <img src={club.image} alt={`${club.name} logo`} onError={(event) => { event.currentTarget.style.display = "none"; }} />
        ) : null}
        <span>{club.logoText || club.name?.slice(0, 2) || "FC"}</span>
      </div>

      <div className="fanm-club-card__body fanm-club-card__body--lean">
        <div className="fanm-club-title-row">
          <h3>{club.name}</h3>
          {club.activity ? <span className="fanm-club-pill">{club.activity}</span> : null}
        </div>

        <div className="fanm-club-signal-row">
          {shortCount > 0 ? (
            <button
              type="button"
              className="fanm-help-needed"
              onClick={() => onJoinClub?.(club, { intent: "help-needed" })}
              title={`${club.name} is short ${shortCount} player${shortCount === 1 ? "" : "s"} for the next match`}
            >
              <span aria-hidden="true">✋</span>
              <strong>{shortCount}</strong>
              <small>spots open</small>
            </button>
          ) : null}

          {club.clubRating ? (
            <span className="fanm-club-rating" title="Club style/rating guide">
              {club.clubRating}
            </span>
          ) : null}
        </div>

        <p className="fanm-club-location">📍 {club.location}</p>
        <p className="fanm-club-copy">{club.description}</p>
        <p className="fanm-club-time">{club.weeklyPlayTime}</p>
      </div>

      <div className="fanm-club-actions">
        <button type="button" onClick={() => onViewClub?.(club)}>
          View Club
        </button>
        <button type="button" onClick={() => onJoinClub?.(club)}>
          Join
        </button>
        <button type="button" className="fanm-leader-only" onClick={() => onChallengeClub?.(club)} title="Club challenges are visible to everyone, but only club leaders/admins can send them.">
          Challenge
        </button>
      </div>
    </article>
  );
}