// src/components/home/HomeHero.jsx
import React from "react";

const CLUB_PHOTO = "/HomePage/ClubPhoto_marketing.jpeg";

export default function HomeHero({ onCaptainEntry, onPlayerEntry, onBrowse }) {
  return (
    <section className="fanm-hero fanm-hero--entry" id="top">
      <div className="fanm-hero__content fanm-entry-gate">
        <div className="fanm-kicker">5 Asides football platform</div>

        <h1>What brings you here?</h1>

        <p className="fanm-hero__lead">
          Choose your entry point. Captains run clubs, players find nearby games,
          and supporters can browse public club pages before joining.
        </p>

        <div
          className="fanm-entry-cards fanm-entry-cards--focused"
          aria-label="Choose how you want to enter"
        >
          <button
            type="button"
            className="fanm-entry-card fanm-entry-card--primary"
            onClick={onCaptainEntry}
          >
            <span className="fanm-entry-card__row">
              <span className="fanm-entry-card__icon" aria-hidden="true">
                🛡️
              </span>
              <span className="fanm-entry-card__main">
                <strong>I run a club</strong>
                <small>Manage your club</small>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="fanm-entry-card"
            onClick={onPlayerEntry}
          >
            <span className="fanm-entry-card__row">
              <span className="fanm-entry-card__icon" aria-hidden="true">
                ⚽
              </span>
              <span className="fanm-entry-card__main">
                <strong>I'm a new player</strong>
                <small>Find a club</small>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="fanm-entry-card"
            onClick={onBrowse}
          >
            <span className="fanm-entry-card__row">
              <span className="fanm-entry-card__icon" aria-hidden="true">
                👀
              </span>
              <span className="fanm-entry-card__main">
                <strong>I am browsing</strong>
                <small>Explore first</small>
              </span>
            </span>
          </button>
        </div>
      </div>

      <aside className="fanm-hero-panel fanm-hero-panel--photo" aria-label="Platform preview">
        <img src={CLUB_PHOTO} alt="5-a-side players after a match" />

        <div className="fanm-live-card">
          <div>
            <span className="fanm-live-dot" /> Live platform preview
          </div>
          <strong>Turf Kings FC</strong>
          <p>Cape Town · Wednesdays 19:00</p>

          <div className="fanm-score-row">
            <span>Dark</span>
            <strong>4 - 3</strong>
            <span>Light</span>
          </div>
        </div>

        <div className="fanm-mini-stats">
          <span>
            <strong>28</strong> players
          </span>
          <span>
            <strong>12</strong> clips
          </span>
          <span>
            <strong>3</strong> clubs ready
          </span>
        </div>
      </aside>
    </section>
  );
}