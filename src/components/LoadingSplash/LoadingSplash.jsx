import React from "react";

function stepClass(state = "") {
  if (state === "done") return "is-done";
  if (state === "active") return "is-active";
  return "";
}

export default function LoadingSplash({
  progress = 0,
  message = "Preparing your football world...",
  title = "Preparing your football world...",
  kicker = "Club-first football",
  image,
  imageAlt = "5 Asides Near Me",
  steps = [],
  exiting = false,
  ariaLabel = "5 Asides Near Me is loading",
  footerLead = "Club-first football. Built for players.",
  footerStrong = " Powered by community.",
}) {
  const safeProgress = Math.max(
    0,
    Math.min(100, Math.round(Number(progress) || 0))
  );

  return (
    <div
      className={`hub-startup-splash ${exiting ? "is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div
        className="hub-startup-splash__stadium-glow"
        aria-hidden="true"
      />

      <section className="hub-startup-splash__panel">
        <div className="hub-startup-splash__art-wrap">
          <img
            src={image}
            alt={imageAlt}
            className="hub-startup-splash__art"
          />
        </div>

        <div className="hub-startup-splash__copy">
          <span className="hub-startup-splash__kicker">
            {kicker}
          </span>

          <h1>{title}</h1>

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
          {steps.map((step, index) => (
            <div
              key={`${step.label}-${index}`}
              className={`hub-startup-splash__step ${stepClass(
                step.state
              )}`}
            >
              <span className="hub-startup-splash__step-icon">
                {step.icon}
              </span>

              <span>{step.label}</span>

              <strong>
                {step.state === "done"
                  ? "✓"
                  : step.state === "active"
                    ? "•••"
                    : ""}
              </strong>
            </div>
          ))}
        </div>

        <footer className="hub-startup-splash__footer">
          <span aria-hidden="true">♡</span>
          <span>
            {footerLead}
            <strong>{footerStrong}</strong>
          </span>
        </footer>
      </section>
    </div>
  );
}
