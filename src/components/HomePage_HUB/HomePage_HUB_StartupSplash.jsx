import React from "react";
import HOME_STARTUP_ART from "../../assets/branding/logo-main-day.jpeg";

export default function HomePage_HUB_StartupSplash({
  progress = 0,
  message = "Preparing your football world...",
  authReady = false,
  clubsReady = false,
  exiting = false,
}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  const homepageReady = authReady && clubsReady && safeProgress >= 100;

  return (
    <div
      className={`hub-startup-splash ${exiting ? "is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="5 Asides Near Me is loading"
    >
      <div className="hub-startup-splash__stadium-glow" aria-hidden="true" />

      <section className="hub-startup-splash__panel">
        <div className="hub-startup-splash__art-wrap">
          <img
            src={HOME_STARTUP_ART}
            alt="5 Asides Near Me"
            className="hub-startup-splash__art"
          />
        </div>

        <div className="hub-startup-splash__copy">
          <span className="hub-startup-splash__kicker">
            Club-first football
          </span>

          <h1>Preparing your football world...</h1>

          <p>{message}</p>
        </div>

        <div
          className="hub-startup-splash__progress-shell"
          aria-label={`Loading ${safeProgress}%`}
        >
          <div
            className="hub-startup-splash__progress-bar"
            style={{ width: `${safeProgress}%` }}
          >
            <span />
          </div>

          <strong>{safeProgress}%</strong>
        </div>

        <div className="hub-startup-splash__steps">
          <div
            className={`hub-startup-splash__step ${
              authReady ? "is-done" : "is-active"
            }`}
          >
            <span className="hub-startup-splash__step-icon">👤</span>
            <span>Connecting to your account</span>
            <strong>{authReady ? "✓" : "•••"}</strong>
          </div>

          <div
            className={`hub-startup-splash__step ${
              clubsReady ? "is-done" : authReady ? "is-active" : ""
            }`}
          >
            <span className="hub-startup-splash__step-icon">⚽</span>
            <span>Loading clubs and venues</span>
            <strong>{clubsReady ? "✓" : authReady ? "•••" : ""}</strong>
          </div>

          <div
            className={`hub-startup-splash__step ${
              homepageReady ? "is-done" : clubsReady ? "is-active" : ""
            }`}
          >
            <span className="hub-startup-splash__step-icon">📍</span>
            <span>Preparing nearby football</span>
            <strong>{homepageReady ? "✓" : clubsReady ? "•••" : ""}</strong>
          </div>
        </div>

        <footer className="hub-startup-splash__footer">
          <span aria-hidden="true">♡</span>
          <span>
            Club-first football. Built for players.
            <strong> Powered by community.</strong>
          </span>
        </footer>
      </section>
    </div>
  );
}
