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


function getClubVideoUrl(club) {
  return (
    club?.featuredVideoUrl ||
    club?.highlightVideoUrl ||
    club?.videoUrl ||
    club?.mediaUrl ||
    ""
  );
}

export default function HomePage_HUB_ClubCard({
  club,
  onOpenClubActions,
  onViewClub,
  onJoinClub,
  onChallengeClub,
  onDeleteClub,
  canJoin = true,
  canChallenge = false,
  canDelete = false,
}) {
  const [faceIndex, setFaceIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

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
  const videoUrl = getClubVideoUrl(club);
  const playerCount = club?.playerCount ?? club?.memberCount ?? club?.playersCount ?? 0;
  const distanceValue = club?.distanceKm ? `${club.distanceKm.toFixed(club.distanceKm < 10 ? 1 : 0)} km` : "Nearby";
  const gamesPlayed = club?.gamesPlayed ?? club?.matchesPlayed ?? club?.completedMatchesCount ?? club?.matchCount ?? 0;

  useEffect(() => {
    if (isPaused) return undefined;

    const timer = window.setInterval(() => {
      setFaceIndex((current) => (current + 1) % 3);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [isPaused]);

  if (!club) return null;

  return (
    <article
      className="hub-club-card"
      style={{ "--hub-club-accent": accent }}
      onClick={() => onViewClub?.(club)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onViewClub?.(club);
        }
      }}
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      aria-label={`Open ${club.name || "club"}`}
    >
      <div className="hub-club-card__menu-wrap" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="hub-club-card__menu-button"
          aria-label={`Open ${club.name || "club"} actions`}
          aria-expanded={actionsOpen}
          onClick={() => setActionsOpen((current) => !current)}
        >
          ⋯
        </button>

        {actionsOpen ? (
          <div className="hub-club-card__menu" role="menu">
            {canJoin ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionsOpen(false);
                  onJoinClub?.(club);
                }}
              >
                Join Club
              </button>
            ) : null}

            {canChallenge ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionsOpen(false);
                  onChallengeClub?.(club);
                }}
              >
                Challenge Club
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                role="menuitem"
                className="hub-club-card__menu-danger"
                onClick={() => {
                  setActionsOpen(false);
                  onDeleteClub?.(club);
                }}
              >
                Delete Club
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

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

        <section className="hub-club-card__face hub-club-card__face--details hub-club-card__face--trust">
          <div className="tk-trust-face">
            <div className="tk-trust-face__header">
              <span />
              <strong>Club Trust</strong>
              <span />
            </div>

            <svg className="tk-trust-face__shield" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.2 18.5 5.6v5.2c0 4.2-2.7 7.8-6.5 9.9-3.8-2.1-6.5-5.7-6.5-9.9V5.6L12 3.2Z" />
              <path d="m8.8 12.1 2.1 2.1 4.4-4.8" />
            </svg>

            <h3>{club.name || "Football Club"}</h3>

            <div className="tk-trust-face__stats tk-trust-face__stats--hero">
              <div className="tk-trust-face__stat tk-trust-face__stat--players">
                <svg className="tk-trust-face__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.2 11.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" />
                  <path d="M15.8 11.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" />
                  <path d="M3.4 19.2c.4-3.1 2.4-5.1 4.8-5.1s4.4 2 4.8 5.1" />
                  <path d="M11 19.2c.4-3.1 2.4-5.1 4.8-5.1s4.4 2 4.8 5.1" />
                </svg>
                <b>{playerCount}</b>
                <small>Players</small>
              </div>

              <div className="tk-trust-face__stat tk-trust-face__stat--distance">
                <svg className="tk-trust-face__icon tk-trust-face__icon--pin" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s6.8-6 6.8-12.1A6.8 6.8 0 0 0 5.2 8.9C5.2 15 12 21 12 21Z" />
                  <circle cx="12" cy="8.9" r="2.45" />
                </svg>
                <b>{distanceValue}</b>
                <small>Away</small>
              </div>
            </div>

            <div className="tk-trust-face__info">
              <p>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s6-5.1 6-11a6 6 0 0 0-12 0c0 5.9 6 11 6 11Z" />
                  <circle cx="12" cy="10" r="2.2" />
                </svg>
                <span>{location}</span>
              </p>

              <p>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 7.8v4.7l3.1 1.8" />
                </svg>
                <span>{playTime}</span>
              </p>

              <p>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="m12 3.5 2.6 5.2 5.7.8-4.1 4 1 5.6L12 16.5 6.9 19.1l1-5.6-4.1-4 5.7-.8L12 3.5Z" />
                </svg>
                <span>{gamesPlayed > 0 ? `${gamesPlayed} games played` : "New club"}</span>
              </p>
            </div>

          </div>
        </section>

        <section className="hub-club-card__face hub-club-card__face--highlights">
          {videoUrl ? (
            <>
              <video
                className="hub-club-card__highlight-video"
                src={videoUrl}
                muted
                autoPlay
                loop
                playsInline
                preload="auto"
                onLoadedData={(event) => {
                  const video = event.currentTarget;

                  video.muted = true;

                  const playPromise = video.play();

                  if (playPromise?.catch) {
                    playPromise.catch(() => {});
                  }
                }}
              />
              <div className="hub-club-card__highlight-overlay">
                <span className="hub-club-card__eyebrow">Highlights</span>
                <div className="hub-club-card__play">▶</div>
                <h3>{highlightPreview === "Highlights coming soon" ? "Club highlight" : highlightPreview}</h3>
              </div>
            </>
          ) : (
            <>
              <span className="hub-club-card__eyebrow">Highlights</span>
              <div className="hub-club-card__play">▶</div>
              <h3>{highlightPreview}</h3>
              <p>Goals, saves and skills from this club will live here.</p>
            </>
          )}
        </section>
      </div>
    </article>
  );
}
