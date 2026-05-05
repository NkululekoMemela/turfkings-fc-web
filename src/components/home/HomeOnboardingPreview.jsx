// src/components/home/HomeOnboardingPreview.jsx
import React, { useMemo, useState } from "react";

const WHATSAPP_SHARE_TEXT = encodeURIComponent(
  "Hi captain/coach, please register our club on 5 Asides Near Me. It is free for club leaders and will help manage signups, payments, player gaps, stats and match nights."
);

const steps = [
  {
    title: "Do you lead the club?",
    text: "The club leader, captain, coach or organiser should register the club because admin controls and payment details are sensitive.",
    type: "leader-check",
  },
  {
    title: "Register the club",
    text: "Club registration is free. The platform only charges a small player-side fee of about R5 when players sign up for games.",
    type: "free-register",
  },
  {
    title: "Club name + logo",
    text: "Use your current club name, run a WhatsApp poll, upload your existing logo, or later generate a clean football logo with a transparent version.",
    type: "branding",
  },
  {
    title: "Where and when you play",
    text: "Add your location, weekly play time, and whether you usually play 5s, 6s or 7s so nearby players can find you.",
    type: "location",
  },
  {
    title: "Launch and fill gaps",
    text: "Your club becomes searchable. When your weekly squad is short, nearby platform players can be notified about open spots.",
    type: "launch",
  },
];

export default function HomeOnboardingPreview({ onStartSetup, onClose }) {
  const [activeStep, setActiveStep] = useState(0);
  const [isLeader, setIsLeader] = useState(null);
  const step = steps[activeStep];

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return `https://wa.me/?text=${WHATSAPP_SHARE_TEXT}`;
    return `https://wa.me/?text=${WHATSAPP_SHARE_TEXT}%20${encodeURIComponent(window.location.href)}`;
  }, []);

  const goNext = () => setActiveStep((value) => Math.min(steps.length - 1, value + 1));
  const goBack = () => setActiveStep((value) => Math.max(0, value - 1));

  return (
    <section className="fanm-section fanm-onboarding" id="register">
      <div className="fanm-section-head fanm-section-head--with-action">
        <div>
          <span className="fanm-kicker">Captain onboarding</span>
          <h2>Register a club only when the leader is ready</h2>
        </div>
        <button type="button" className="fanm-close-section" onClick={onClose}>
          Hide onboarding
        </button>
      </div>

      <div className="fanm-captain-note">
        <strong>Free for club leaders.</strong>
        <span>
          Player payments go to the club for bookings. 5 Asides Near Me later adds a small platform/data fee of about R5 per player when they sign up to play.
        </span>
      </div>

      <div className="fanm-onboarding-layout fanm-onboarding-layout--wizard">
        <div className="fanm-steps-card fanm-steps-card--compact">
          {steps.map((item, index) => (
            <button
              type="button"
              className={`fanm-step ${index === activeStep ? "is-active" : ""}`}
              key={item.title}
              onClick={() => setActiveStep(index)}
            >
              <span>{index + 1}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </div>

        <div className="fanm-onboarding-copy fanm-onboarding-copy--focused">
          <span className="fanm-step-count">Step {activeStep + 1} of {steps.length}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>

          {step.type === "leader-check" && (
            <div className="fanm-leader-check-grid">
              <button type="button" className={isLeader === true ? "is-selected" : ""} onClick={() => setIsLeader(true)}>
                Yes, I lead this club
              </button>
              <a href={shareLink} target="_blank" rel="noreferrer" onClick={() => setIsLeader(false)}>
                No — share link to my leader on WhatsApp
              </a>
            </div>
          )}

          {step.type === "free-register" && (
            <div className="fanm-fee-card">
              <strong>Captain pays R0 to register.</strong>
              <span>Players later pay their club for games through the platform. The small platform fee is player-side, not a signup cost for the club leader.</span>
            </div>
          )}

          <div className="fanm-onboarding-actions">
            {activeStep > 0 && <button type="button" onClick={goBack}>Back</button>}
            {activeStep < steps.length - 1 ? (
              <button type="button" onClick={goNext} disabled={activeStep === 0 && isLeader !== true}>
                {activeStep === 0 && isLeader !== true ? "Confirm you lead the club" : "Next step"}
              </button>
            ) : (
              <button type="button" onClick={onStartSetup}>Start full setup</button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}