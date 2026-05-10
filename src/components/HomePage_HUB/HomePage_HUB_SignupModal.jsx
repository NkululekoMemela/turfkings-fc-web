// src/components/HomePage_HUB/HomePage_HUB_SignupModal.jsx

import React, { useMemo, useState } from "react";
import HomePage_HUB_ClubRegisterForm from "./HomePage_HUB_ClubRegisterForm";
import HomePage_HUB_LogoGenerator from "./HomePage_HUB_LogoGenerator";
import HomePage_HUB_BankingForm from "./HomePage_HUB_BankingForm";
import { slugifyClubName } from "../../core/homePageHubLogoUtils";
import { createHomePageHubClub } from "../../storage/homePageHubClubRepository";

const INITIAL_CLUB_DRAFT = {
  clubName: "",
  clubId: "",
  venueName: "",
  address: "",
  suburb: "",
  city: "",
  province: "",
  country: "South Africa",
  playDay: "",
  playTime: "",
  weeklyPlayTime: "",
  timezone: "Africa/Johannesburg",
  captainName: "",
  captainEmail: "",
  accent: "#16a34a",
  logoText: "FC",
};

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export default function HomePage_HUB_SignupModal({
  isOpen,
  onClose,
  onJoinExistingClub,
  onClubCreated,
}) {
  const [mode, setMode] = useState("choice");
  const [step, setStep] = useState(1);
  const [clubDraft, setClubDraft] = useState(INITIAL_CLUB_DRAFT);
  const [logoDraft, setLogoDraft] = useState({});
  const [bankingDraft, setBankingDraft] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");

  const clubId = useMemo(
    () => slugifyClubName(clubDraft.clubId || clubDraft.clubName),
    [clubDraft.clubId, clubDraft.clubName]
  );

  if (!isOpen) return null;

  function resetAndClose() {
    setMode("choice");
    setStep(1);
    setErrorText("");
    setSubmitting(false);
    onClose?.();
  }

  function validateBeforeSubmit() {
    if (!clubDraft.clubName.trim()) return "Club name is required.";
    if (!clubId) return "Club ID could not be created from the club name.";
    if (!clubDraft.captainName.trim()) return "Captain name is required.";
    if (!clubDraft.captainEmail.trim()) return "Captain email is required.";
    if (!isValidEmail(clubDraft.captainEmail)) return "Captain email is not valid.";
    return "";
  }

  async function createClub() {
    setErrorText("");

    const validationError = validateBeforeSubmit();

    if (validationError) {
      setErrorText(validationError);
      setStep(1);
      return;
    }

    try {
      setSubmitting(true);

      const createdClub = await createHomePageHubClub({
        clubId,
        clubDraft,
        logoDraft,
        bankingDraft,
      });

      onClubCreated?.(createdClub);
      resetAndClose();
    } catch (error) {
      console.error("[HomePage_HUB] Failed to create club:", error);
      setErrorText(
        error?.message ||
          "Failed to create club. Check Firebase permissions and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="hub-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) resetAndClose();
      }}
    >
      <section
        className="hub-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Sign up free"
      >
        <header className="hub-modal__header">
          <div>
            <span>Free signup</span>
            <h2>{mode === "register" ? "Register your club" : "Start playing"}</h2>
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Close signup modal"
            disabled={submitting}
          >
            ×
          </button>
        </header>

        {mode === "choice" ? (
          <div className="hub-choice-grid">
            <button type="button" onClick={() => onJoinExistingClub?.()}>
              <span>⚽</span>
              <strong>Join an existing club</strong>
              <small>Use the current EntryPage player signup flow.</small>
            </button>

            <button type="button" onClick={() => setMode("register")}>
              <span>🏟️</span>
              <strong>Register a new club</strong>
              <small>Create a club page, add branding and payment details.</small>
            </button>
          </div>
        ) : null}

        {mode === "register" ? (
          <>
            <div className="hub-stepper" aria-label="Club registration steps">
              {[1, 2, 3].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={step === item ? "is-active" : ""}
                  onClick={() => setStep(item)}
                  disabled={submitting}
                >
                  {item}
                </button>
              ))}
            </div>

            {step === 1 ? (
              <HomePage_HUB_ClubRegisterForm
                clubDraft={clubDraft}
                onChange={setClubDraft}
              />
            ) : null}

            {step === 2 ? (
              <HomePage_HUB_LogoGenerator
                clubDraft={{ ...clubDraft, clubId }}
                logoDraft={logoDraft}
                onChange={setLogoDraft}
              />
            ) : null}

            {step === 3 ? (
              <HomePage_HUB_BankingForm
                bankingDraft={bankingDraft}
                onChange={setBankingDraft}
              />
            ) : null}

            {errorText ? <div className="hub-error-box">{errorText}</div> : null}

            <footer className="hub-modal__footer">
              <button
                type="button"
                className="hub-secondary-button"
                disabled={submitting}
                onClick={() =>
                  step === 1
                    ? setMode("choice")
                    : setStep((current) => Math.max(1, current - 1))
                }
              >
                Back
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  className="hub-primary-button"
                  disabled={submitting}
                  onClick={() => setStep((current) => Math.min(3, current + 1))}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="hub-primary-button"
                  onClick={createClub}
                  disabled={submitting}
                >
                  {submitting ? "Creating club..." : "Create club"}
                </button>
              )}
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}
