import React, {
  useMemo,
  useState,
} from "react";
import HOME_FOOTER_LOGO_LIGHT from "../assets/branding/logo-main-light.jpeg";
import HOME_FOOTER_LOGO_DAY from "../assets/branding/logo-main-day.jpeg";
import HOME_FOOTER_LOGO_DARK from "../assets/branding/logo-main-dark.jpeg";
import FIELD_MARKETING_IMAGE from "../assets/marketing/field-venue-marketing.png";

const INFO = {
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
    body: [
      "5 Asides Near Me connects Fields, clubs, players and match officials.",
      "It helps local football communities discover one another and manage their football in one place.",
    ],
  },
  terms: {
    title: "Terms & Privacy",
    body: [
      "Only authorised people should register or administer a Field.",
      "Personal and operational information must be used only for legitimate platform activities.",
      "Field access can be reviewed or removed when permissions are no longer appropriate.",
    ],
  },
};

export default function VenueMarketingFooter() {
  const [infoModal, setInfoModal] =
    useState(null);
  const [feedbackOpen, setFeedbackOpen] =
    useState(false);
  const [subject, setSubject] = useState(
    "5 Asides Near Me Field Feedback"
  );
  const [message, setMessage] = useState("");

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

  function openFeedback() {
    setSubject(
      "5 Asides Near Me Field Feedback"
    );
    setMessage("");
    setFeedbackOpen(true);
  }

  function sendFeedback() {
    const mailSubject = encodeURIComponent(
      subject ||
        "5 Asides Near Me Field Feedback"
    );
    const mailBody = encodeURIComponent(
      message || ""
    );

    window.location.href =
      `mailto:support@5asidesnearme.com?subject=${mailSubject}&body=${mailBody}`;
  }

  return (
    <>
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
          </div>
        </section>

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

            <button
              type="button"
              className="hub-premium-footer-row"
              onClick={openFeedback}
            >
              <span className="hub-premium-footer-icon">
                💬
              </span>

              <span>
                <strong>Send feedback</strong>
              </span>

              <em>›</em>
            </button>
          </section>
        </div>

        <details className="hub-mobile-help-accordion">
          <summary>
            Help? <span>🎧</span>
          </summary>

          <details className="hub-mobile-help-group">
            <summary>✉️ Need help?</summary>

            <a href="mailto:support@5asidesnearme.com">
              Email support
            </a>

            <a
              href="https://wa.me/27762849740"
              target="_blank"
              rel="noreferrer"
            >
              Chat on WhatsApp
            </a>

            <span>
              Mon–Fri: 08:00–18:00 SAST
            </span>
          </details>

          <details className="hub-mobile-help-group">
            <summary>❔ Field FAQs</summary>

            <button
              type="button"
              onClick={() =>
                openInfo("joinLeague")
              }
            >
              How does my club join?
            </button>

            <button
              type="button"
              onClick={() =>
                openInfo("fieldManagement")
              }
            >
              What can a Field Manager do?
            </button>

            <button
              type="button"
              onClick={() =>
                openInfo("matchdays")
              }
            >
              How do matchdays work?
            </button>
          </details>

          <details className="hub-mobile-help-group">
            <summary>🔗 Quick links</summary>

            <button
              type="button"
              onClick={() => openInfo("about")}
            >
              About 5 Asides Near Me
            </button>

            <button
              type="button"
              onClick={() => openInfo("terms")}
            >
              Terms & Privacy
            </button>

            <button
              type="button"
              onClick={openFeedback}
            >
              Send feedback
            </button>
          </details>
        </details>
      </footer>

      <section
        className="fanm-venues__closing-visual"
        aria-label="5 Asides Near Me Field experience"
      >
        <img
          src={FIELD_MARKETING_IMAGE}
          alt="5 Asides Near Me Field and league experience"
        />
      </section>

      {infoModal ? (
        <div
          className="hub-action-sheet-backdrop"
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
            className="hub-info-modal"
            aria-label={infoModal.title}
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

            <div className="hub-info-modal__body">
              {infoModal.body.map(
                (item, index) => (
                  <p key={index}>{item}</p>
                )
              )}
            </div>
          </section>
        </div>
      ) : null}

      {feedbackOpen ? (
        <div
          className="hub-action-sheet-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setFeedbackOpen(false);
            }
          }}
        >
          <section
            className="hub-info-modal"
            aria-label="Send Field feedback"
          >
            <button
              type="button"
              className="hub-action-sheet__close"
              onClick={() =>
                setFeedbackOpen(false)
              }
            >
              ×
            </button>

            <span className="hub-kicker">
              Feedback
            </span>

            <h2>Send feedback</h2>

            <label className="hub-contact-field">
              <span>Subject</span>
              <input
                value={subject}
                onChange={(event) =>
                  setSubject(event.target.value)
                }
              />
            </label>

            <label className="hub-contact-field">
              <span>Message</span>
              <textarea
                value={message}
                onChange={(event) =>
                  setMessage(event.target.value)
                }
                rows={6}
                placeholder="Write your message here..."
              />
            </label>

            <button
              type="button"
              className="hub-primary-button"
              onClick={sendFeedback}
            >
              Open email to send
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
