import React from "react";

export default function VenueLandingHeader({ venue }) {
  const venueName = venue?.name || "League venue";
  const venueLogo = venue?.branding?.logoUrl || "/favicon_nobackground.png";
  const modeLabel = "CLUB LEAGUE";
  const modeDotColor = "#a8f9d8";
  return (
        <header className="landing-wave-header">
          <svg
            className="tk-ribbon-wave-svg tk-ribbon-wave-svg--mobile"
            viewBox="0 0 390 122"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id="tkLandingRibbonWaveGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1d4ed8" />
                <stop offset="42%" stopColor="#071329" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <radialGradient id="tkLandingRibbonModeGlow" cx="22%" cy="86%" r="56%">
                <stop offset="0%" stopColor="rgba(34,211,238,0.34)" />
                <stop offset="58%" stopColor="rgba(34,211,238,0.08)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0)" />
              </radialGradient>
            </defs>

            <path
              d="
                M 0 0
                H 390
                V 86
                H 190
                C 171 86, 164 119, 144 119
                H 55
                C 43 119, 38 86, 28 86
                H 0
                Z
              "
              fill="url(#tkLandingRibbonWaveGradient)"
            />
            <path
              d="
                M 0 0
                H 390
                V 86
                H 190
                C 171 86, 164 119, 144 119
                H 55
                C 43 119, 38 86, 28 86
                H 0
                Z
              "
              fill="url(#tkLandingRibbonModeGlow)"
              opacity="0.9"
            />
            <path
              d="M 28 86 C 38 86, 43 119, 55 119 H 144 C 164 119, 171 86, 190 86"
              fill="none"
              stroke="rgba(34,211,238,0.35)"
              strokeWidth="1.2"
            />

          </svg>

          <svg
            className="tk-ribbon-desktop-lip"
            viewBox="0 0 1200 122"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient
                id="tkLandingDesktopLipGradient"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="1200"
                y2="0"
              >
                <stop offset="0%" stopColor="#1d4ed8" />
                <stop offset="42%" stopColor="#071329" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>

            {/*
             * One continuous desktop path:
             * full-width header and compact mode lip share
             * the same fill, with no join between them.
             */}
            <path
              d="
                M 0 0
                H 1200
                V 86
                H 240
                C 216 86, 207 119, 182 119
                H 69
                C 54 119, 48 86, 35 86
                H 0
                Z
              "
              fill="url(#tkLandingDesktopLipGradient)"
            />

            <path
              d="
                M 35 86
                C 48 86, 54 119, 69 119
                H 182
                C 207 119, 216 86, 240 86
              "
              fill="none"
              stroke="rgba(34,211,238,0.38)"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="tk-ribbon-mode-label" aria-label={modeLabel}>
            <span
              className="tk-ribbon-mode-label-dot"
              style={{ color: modeDotColor }}
              aria-hidden="true"
            />
            <span>{modeLabel}</span>
          </div>

          <div className="header-title">
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                minWidth: 0,
                width: "100%",
              }}
            >
              <img
                src={venueLogo}
                alt={`${venueName} logo`}
                className="tk-logo"
              />
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0 }}>{venueName} Club League</h1>
              </div>
            </div>
          </div>

          <div className="landing-header-divider" />

        </header>
  );
}
