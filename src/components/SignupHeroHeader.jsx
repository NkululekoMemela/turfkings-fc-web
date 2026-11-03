import React from "react";

export default function SignupHeroHeader({
  photoData, beneficiary, attendanceBadgeText, attendanceSubtext,
  isMobile, isPracticeMode = false, matchTicketBusy = false,
  onPullOut, onOpenCalendar, showPullOut = true,
  title = "Pay for upcoming games",
  subtext = "Select the remaining current games, next month games, and any special Challenge fixture.",
}) {
  return (
      <section className="card signup-hero-card">
        <div className="signup-hero-compact">
          <div className="signup-hero-left">
            <div className="signup-player-avatar signup-player-avatar-hero">
              {photoData ? (
                <img
                  src={photoData}
                  alt={beneficiary.fullName}
                  className="signup-player-avatar-img"
                  loading="eager"
                />
              ) : (
                <span className="signup-player-avatar-fallback">
                  {String(beneficiary.shortName || "P")
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
            </div>

            <div className="signup-hero-copy">
              <div className="signup-hero-title-row">
                <h2>{title}</h2>
              </div>

              <p className="muted signup-hero-subtext">
                {subtext}
              </p>

              <div className="signup-top-meta">
                <div className="signup-attendance-badge">
                  <span className="signup-attendance-badge-label">
                    Attendance Badge 🛡️
                  </span>
                  <strong>{attendanceBadgeText}</strong>
                  {attendanceSubtext ? <small>{attendanceSubtext}</small> : null}
                </div>
              </div>
            </div>
          </div>

          <div
            className="signup-hero-actions"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: isMobile ? "flex-start" : "flex-end",
              gap: isMobile ? 8 : 10,
              flexWrap: "wrap",
            }}
          >
            {showPullOut && !beneficiary?.isGuest ? (
              <button
                type="button"
                className={[
                  "tk-match-pull-out-btn",
                  isPracticeMode ? "is-practice-ticket" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={onPullOut}
                disabled={matchTicketBusy}
                title={
                  isPracticeMode
                    ? "Pull out of an upcoming Practice match"
                    : "Pull out of an upcoming match"
                }
                style={{ touchAction: "manipulation" }}
              >
                <span
                  className="tk-match-pull-out-icon"
                  aria-hidden="true"
                >
                  ↩
                </span>

                <span className="tk-match-pull-out-copy">
                  <strong>Match pull out</strong>
                  <small>Can't make it this week?</small>
                </span>

                {isPracticeMode ? (
                  <span className="tk-practice-feature-tag">
                    Practice
                  </span>
                ) : null}
              </button>
            ) : null}

            <button
              type="button"
              className="secondary-btn signup-calendar-btn"
              onClick={onOpenCalendar}
              aria-label="Open next month calendar"
              title="Open next month calendar"
              style={{ touchAction: "manipulation" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8 2V5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M16 2V5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M3.5 9H20.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <rect
                  x="3"
                  y="4.5"
                  width="18"
                  height="16.5"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
          </div>
        </div>
      </section>
  );
}
