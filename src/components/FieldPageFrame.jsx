import React, {useEffect, useId, useState} from "react";
import "./FieldPageFrame.css";

const titles = {
  entry: "Field Access",
  landing: "Home",
  stats: "League Stats",
  squads: "Matchday Squads",
  formations: "Lineups & Formations",
  news: "Field News",
  videos: "Match Highlights",
  live: "Live Match",
  chat: "Field Chat",
  fixtures: "League Fixtures",
  actionLog: "Action Log",
  lostFound: "Lost & Found",
};

export default function FieldPageFrame({
  venue, page = "landing", onHome, children,
}) {
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const ribbonId = useId().replace(/:/g, "");
  const title = page === "landing"
    ? venue?.name || "Your Field"
    : titles[page] || "Field League";
  const logo = venue?.branding?.logoUrl || venue?.logoUrl ||
    "/favicon_nobackground.png";
  const modeLipLabel = "LEAGUE MODE";
  const modeLipDotColor = "#facc15";

  useEffect(() => {
    const handleScroll = () => setHeaderScrolled(window.scrollY > 6);
    handleScroll();
    window.addEventListener("scroll", handleScroll, {passive: true});
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="field-ribbon-frame" data-field-page={page}>
      <div
        className={`landing-header-sticky ${
          headerScrolled ? "is-scrolled" : ""
        }`}
      >
        <header className="landing-wave-header">
          <svg
            className="tk-ribbon-wave-svg tk-ribbon-wave-svg--mobile"
            viewBox="0 0 390 122"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id={`${ribbonId}-tkLandingRibbonWaveGradient`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1d4ed8" />
                <stop offset="42%" stopColor="#071329" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <radialGradient id={`${ribbonId}-tkLandingRibbonModeGlow`} cx="22%" cy="86%" r="56%">
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
              fill={`url(#${ribbonId}-tkLandingRibbonWaveGradient)`}
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
              fill={`url(#${ribbonId}-tkLandingRibbonModeGlow)`}
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
                id={`${ribbonId}-tkLandingDesktopLipGradient`}
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
              fill={`url(#${ribbonId}-tkLandingDesktopLipGradient)`}
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

          <div className="tk-ribbon-mode-label" aria-label={modeLipLabel}>
            <span
              className="tk-ribbon-mode-label-dot"
              style={{ color: modeLipDotColor }}
              aria-hidden="true"
            />
            <span>{modeLipLabel}</span>
          </div>


          <div className="header-title">
            <div className="field-ribbon-title-row">
              <img src={logo} alt="" className="tk-logo field-ribbon-logo"
                onError={event => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/favicon_nobackground.png";
                }} />
              <div className="field-ribbon-title-copy">
                <small>{page === "landing" ? "FIELD LEAGUE" : venue?.name || "Your Field"}</small>
                <h1>{title}</h1>
              </div>
              {page !== "landing" && page !== "entry" && (
<button type="button" className="field-ribbon-home"
                onClick={onHome} aria-label="Field home" title="Field home">
                <span aria-hidden="true" style={{fontSize: "24px", lineHeight: 1}}>🏡</span>
              </button>
              )}
            </div>
          </div>

          <div className="landing-header-divider" />

        </header>
      </div>
      <div className="field-ribbon-content">{children}</div>
    </div>
  );
}
