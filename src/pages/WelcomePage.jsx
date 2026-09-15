import React from "react";
import { createPortal } from "react-dom";
import "./WelcomeHero.css";

export default function WelcomePage({
  onExploreClubs,
  onExploreLeagues,
  onFindClub,
}) {
  return createPortal(
    <main id="fanm-welcome-hero">
      <div className="fanm-hero__content">
        <header className="fanm-hero__header">
          <div className="fanm-hero__brand">
            <img
              src="/favicon_nobackground.png"
              alt=""
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
            <span>5 Asides Near Me</span>
          </div>
          <span className="fanm-hero__edition">FOOTBALL. TOGETHER.</span>
        </header>

        <div className="fanm-hero__main">
          <section className="fanm-hero__story">
            <span className="fanm-hero__eyebrow">
              A home for the five-a-side game
            </span>
            <h1>5 Asides Near Me<br /><em>.com</em></h1>
            <p>
              Find your club. Follow the leagues that bring them together.
              Make your next match part of something bigger.
            </p>
          </section>

          <nav className="fanm-hero__actions" aria-label="Choose your destination">
            <span className="fanm-hero__prompt">WHERE DO YOU WANT TO GO?</span>
            <button type="button" onClick={onExploreClubs}>
              <span className="fanm-hero__action-icon" aria-hidden="true">01</span>
              <span className="fanm-hero__action-copy">
                <strong>Explore Clubs</strong>
                <small>Find a team near you or create one.</small>
              </span>
              <span className="fanm-hero__arrow" aria-hidden="true">↗</span>
            </button>
            <button type="button" onClick={onExploreLeagues}>
              <span className="fanm-hero__action-icon" aria-hidden="true">02</span>
              <span className="fanm-hero__action-copy">
                <strong>Explore Leagues</strong>
                <small>See where your club plays.</small>
              </span>
              <span className="fanm-hero__arrow" aria-hidden="true">↗</span>
            </button>
            <button
              className="fanm-hero__join"
              type="button"
              onClick={onFindClub}
            >
              <span className="fanm-hero__action-icon" aria-hidden="true">03</span>
              <span className="fanm-hero__action-copy">
                <strong>Sign me to a club</strong>
                <small>Get matched with a five-a-side club near you.</small>
              </span>
              <span className="fanm-hero__arrow" aria-hidden="true">↗</span>
            </button>
          </nav>
        </div>

        <footer className="fanm-hero__footer">
          <span>PLAY LOCAL. BELONG EVERYWHERE.</span>
          <span>Players · Clubs · Field managers</span>
        </footer>
      </div>
    </main>,
    document.body
  );
}
