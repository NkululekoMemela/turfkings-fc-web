import React, { useState } from "react";
import "./WelcomePage.css";

export default function LeagueVenuesHub({ onBack }) {
  const [registrationOpen, setRegistrationOpen] = useState(false);

  return (
    <main className="fanm-venues">
      <div className="fanm-venues__shell">
        <header>
          <button type="button" onClick={onBack}>← Welcome</button>
          <strong>5 Asides Near Me</strong>
        </header>
        <div className="fanm-venues__intro">
          <span>CLUB LEAGUES</span>
          <h1>Explore league venues</h1>
          <p>Find the fields bringing clubs together for a season.</p>
        </div>
        <div className="fanm-venues__filters" aria-label="Venue views">
          <span>All venues</span><span>Nearby</span><span>My venues</span>
        </div>
        <div className="fanm-venues__carousel" aria-label="League venue carousel">
          <button type="button" onClick={() => setRegistrationOpen(true)}>
            <span className="fanm-venues__plus">+</span>
            <strong>Register your league venue</strong>
            <small>Setup for field managers</small>
          </button>
          <div className="fanm-venues__empty">
            League venues will appear here as managers register.
          </div>
        </div>
        {registrationOpen && (
          <div className="fanm-venues__overlay" role="presentation"
            onClick={() => setRegistrationOpen(false)}>
            <section role="dialog" aria-modal="true" aria-labelledby="venue-register-title"
              onClick={(event) => event.stopPropagation()}>
              <button type="button" className="fanm-venues__close"
                onClick={() => setRegistrationOpen(false)} aria-label="Close">×</button>
              <h2 id="venue-register-title">Register a league venue</h2>
              <p>Field-manager signup is the next build step. Venue profiles will have their own entry and landing pages.</p>
              <button type="button" onClick={() => setRegistrationOpen(false)}>Back to venues</button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
