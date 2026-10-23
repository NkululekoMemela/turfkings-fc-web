import FIELD_MARKETING_IMAGE_TWO from "../assets/marketing/field-venue-advert-2.jpeg";
import { LEGAL } from "../legal/policies.js";
import LegalSignature from "./LegalSignature.jsx";
const FIELD_POLICY = LEGAL.field;
import { ABOUT_RELEASE } from "../content/aboutRelease.js";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import HOME_FOOTER_LOGO_LIGHT from "../assets/branding/logo-main-light.jpeg";
import HOME_FOOTER_LOGO_DAY from "../assets/branding/logo-main-day.jpeg";
import HOME_FOOTER_LOGO_DARK from "../assets/branding/logo-main-dark.jpeg";
import FIELD_MARKETING_IMAGE from "../assets/marketing/field-venue-marketing.png";

const INFO = {
  help: {
    title: "How can we help?",
    body: [],
  },
  tour: {
    title: "Your Field. Your football community.",
    body: [
      "Discover a nearby 5-a-side Field and enter its football community.",
      "Follow league standings, match results, player statistics and Field announcements.",
      "Field Managers can register their venue, invite clubs and organise new league seasons.",
    ],
  },
  joinLeague: {
    title: "How does my club join a Field league?",
    body: [
      "Open the Field where your club plays and view its available or upcoming league seasons.",
      "The club administrator can respond to a Field invitation or submit the club for entry.",
      "The Field Manager confirms participating clubs before the season begins.",
    ],
  },
  fieldManagement: {
    title: "What can a Field Manager do?",
    body: [
      "Field Managers can build the Field identity, approve staff and organise league seasons.",
      "They can invite clubs, communicate matchday information and publish Field updates.",
      "Authorised referees and staff receive only the access needed for their assigned duties.",
    ],
  },
  matchdays: {
    title: "How do matchdays work?",
    body: [
      "Fixtures, results and league standings remain connected to the registered Field.",
      "Authorised match officials can manage games and record match events.",
      "Clubs and players can follow the season from one shared football platform.",
    ],
  },
  about: {
    title: "About 5 Asides Near Me",
    body: ABOUT_RELEASE,
  },
  terms: {
    title: FIELD_POLICY.title,
    body: FIELD_POLICY.sections.map(([heading, detail]) => `${heading}: ${detail}`),
  },
};

export default function VenueMarketingFooter() {
  const [secondAdvertReady, setSecondAdvertReady] = useState(false);
  const [advertIndex, setAdvertIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const preload = new Image();
    preload.onload = () => {
      if (active) setSecondAdvertReady(true);
    };
    preload.src = FIELD_MARKETING_IMAGE_TWO;
    return () => {
      active = false;
      preload.onload = null;
    };
  }, []);

  const [infoModal, setInfoModal] =
    useState(null);

  const footerLogos = useMemo(() => {
    const logos = [
      {
        src: HOME_FOOTER_LOGO_LIGHT,
        label: "light",
      },
      {
        src: HOME_FOOTER_LOGO_DAY,
        label: "day",
      },
      {
        src: HOME_FOOTER_LOGO_DARK,
        label: "night",
      },
    ];

    return [...logos].sort(
      () => Math.random() - 0.5
    );
  }, []);

  function openInfo(key) {
    setInfoModal(INFO[key] || null);
  }

  const helpContent = (
<div
          className="hub-premium-footer-panels"
          aria-label="Field support, FAQs and quick links"
        >
          <section className="hub-premium-footer-card">
            <h3>
              Need help? <span>🎧</span>
            </h3>

            <a
              className="hub-premium-footer-row"
              href="mailto:support@5asidesnearme.com"
            >
              <span className="hub-premium-footer-icon">
                ✉️
              </span>

              <span>
                <strong>Email us</strong>
                <small>
                  support@5asidesnearme.com
                </small>
              </span>

              <em>›</em>
            </a>

            <a
              className="hub-premium-footer-row"
              href="https://wa.me/27762849740"
              target="_blank"
              rel="noreferrer"
            >
              <span className="hub-premium-footer-icon">
                💬
              </span>

              <span>
                <strong>
                  Chat on WhatsApp
                </strong>
                <small>We’re here to help</small>
              </span>

              <em>›</em>
            </a>

            <div className="hub-premium-footer-row hub-premium-footer-row--static">
              <span className="hub-premium-footer-icon">
                🕒
              </span>

              <span>
                <strong>Support hours</strong>
                <small>
                  Mon–Fri: 08:00–18:00 SAST
                </small>
              </span>
            </div>
          </section>

          <section className="hub-premium-footer-card">
            <h3>
              Field FAQs <span>❔</span>
            </h3>

            <button
              type="button"
              className="hub-premium-footer-row"
              onClick={() =>
                openInfo("joinLeague")
              }
            >
              <span>
                <strong>
                  How does my club join?
                </strong>
              </span>
              <em>›</em>
            </button>

            <button
              type="button"
              className="hub-premium-footer-row"
              onClick={() =>
                openInfo("fieldManagement")
              }
            >
              <span>
                <strong>
                  What can a Field Manager do?
                </strong>
              </span>
              <em>›</em>
            </button>

            <button
              type="button"
              className="hub-premium-footer-row"
              onClick={() =>
                openInfo("matchdays")
              }
            >
              <span>
                <strong>
                  How do matchdays work?
                </strong>
              </span>
              <em>›</em>
            </button>
          </section>

          <section className="hub-premium-footer-card">
            <h3>
              Quick links <span>🔗</span>
            </h3>

            <button
              type="button"
              className="hub-premium-footer-row"
              onClick={() => openInfo("about")}
            >
              <span className="hub-premium-footer-icon">
                👥
              </span>

              <span>
                <strong>
                  About 5 Asides Near Me
                </strong>
              </span>

              <em>›</em>
            </button>

            <button
              type="button"
              className="hub-premium-footer-row"
              onClick={() => openInfo("terms")}
            >
              <span className="hub-premium-footer-icon">
                📄
              </span>

              <span>
                <strong>
                  Terms & Privacy
                </strong>
              </span>

              <em>›</em>
            </button>


          </section>
        </div>
  );

  return (
    <>
      <section
        className="fanm-venues__closing-visual field-marketing-carousel"
        aria-label="5 Asides Near Me Field experience"
      >
        <img
          src={
            secondAdvertReady && advertIndex === 1
              ? FIELD_MARKETING_IMAGE_TWO
              : FIELD_MARKETING_IMAGE
          }
          onError={() => {
            setSecondAdvertReady(false);
            setAdvertIndex(0);
          }}
          alt={
            advertIndex === 1
              ? "5 Asides Near Me Field football experience"
              : "5 Asides Near Me Field and league experience"
          }
        />

        {secondAdvertReady && (
          <>
            <button
              type="button"
              className="field-marketing-carousel__arrow field-marketing-carousel__arrow--previous"
              aria-label="Show previous marketing image"
              onClick={() =>
                setAdvertIndex((index) =>
                  index === 0 ? 1 : 0
                )
              }
            >
              ‹
            </button>

            <button
              type="button"
              className="field-marketing-carousel__arrow field-marketing-carousel__arrow--next"
              aria-label="Show next marketing image"
              onClick={() =>
                setAdvertIndex((index) =>
                  index === 0 ? 1 : 0
                )
              }
            >
              ›
            </button>

            <div
              className="field-marketing-carousel__dots"
              aria-label={`Marketing image ${advertIndex + 1} of 2`}
            >
              {[0, 1].map((index) => (
                <button
                  key={index}
                  type="button"
                  className={
                    index === advertIndex
                      ? "field-marketing-carousel__dot is-active"
                      : "field-marketing-carousel__dot"
                  }
                  aria-label={`Show marketing image ${index + 1}`}
                  aria-current={
                    index === advertIndex
                      ? "true"
                      : undefined
                  }
                  onClick={() => setAdvertIndex(index)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="hub-footer-brand fanm-venues__marketing-footer">
        <div className="hub-footer-logo-stage">
          {footerLogos.map((logo, index) => (
            <img
              key={logo.label}
              src={logo.src}
              alt="5 Asides Near Me"
              className={`hub-footer-logo-static hub-footer-logo-static--${
                ["one", "two", "three"][index]
              }`}
            />
          ))}
        </div>

        <section>
          <span className="hub-kicker">
            Field-first football
          </span>

          <h2>
            Find your Field. Join the game.
          </h2>

          <p>
            5 Asides Near Me connects Fields,
            clubs, leagues, match officials
            and players in one football
            platform.
          </p>

          <div className="hub-footer-actions">
            <button
              type="button"
              className="hub-footer-tour-button"
              onClick={() => openInfo("tour")}
            >
              Take the tour
            </button>
            <button
              type="button"
              className="hub-footer-help-button"
              aria-haspopup="dialog"
              onClick={() => openInfo("help")}
            >
              Help? <span aria-hidden="true">🎧</span>
            </button>
          </div>
        </section>

        {helpContent}


      </footer>



      {infoModal ? (
        <div
          className="hub-action-sheet-backdrop field-support-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setInfoModal(null);
            }
          }}
        >
          <section
            className={`hub-info-modal field-support-modal ${
              infoModal === INFO.help ? "field-support-modal--help" : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={infoModal.title}
            onKeyDown={event => {
              if (event.key === "Escape") setInfoModal(null);
            }}
          >
            <button
              type="button"
              className="hub-action-sheet__close"
              onClick={() =>
                setInfoModal(null)
              }
            >
              ×
            </button>

            <span className="hub-kicker">
              5 Asides Near Me
            </span>

            <h2>{infoModal.title}</h2>
            {infoModal === INFO.help && (
              <p className="field-support-intro">
                Support, answers and everything you need to get started.
              </p>
            )}

            <div className="hub-info-modal__body">
              {infoModal === INFO.help ? helpContent : infoModal.body === ABOUT_RELEASE ? (
                <ul>
                  {ABOUT_RELEASE.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : infoModal.body.map((item, index) => (
                <p key={index}>{item}</p>
              ))}
            </div>
            {infoModal === INFO.terms &&
              <LegalSignature scope="field" />}
          </section>
        </div>
      ) : null}


    </>
  );
}
