// src/components/home/HomeTutorials.jsx
import React from "react";

export default function HomeTutorials() {
  return (
    <section className="fanm-section fanm-tutorials" id="learn">
      <div className="fanm-section-head">
        <div>
          <span className="fanm-kicker">Induction videos</span>
          <h2>Learn the platform in minutes</h2>
        </div>
        <p>
          These video slots are reserved for tutorials uploaded by the platform owner for marketing and onboarding.
        </p>
      </div>

      <div className="fanm-video-grid">
        <article className="fanm-video-card">
          <div className="fanm-video-placeholder">▶</div>
          <h3>For captains</h3>
          <p>How to register a club, manage players, setup payments and run match nights.</p>
        </article>

        <article className="fanm-video-card">
          <div className="fanm-video-placeholder">▶</div>
          <h3>For players</h3>
          <p>How to join a club, pay, follow stats, view player cards and watch highlights.</p>
        </article>
      </div>
    </section>
  );
}