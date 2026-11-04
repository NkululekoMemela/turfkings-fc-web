// src/components/HomePage_HUB/HomePage_HUB_SignupModal.jsx

import React, { useMemo, useState } from "react";
import HomePage_HUB_ClubRegisterForm from "./HomePage_HUB_ClubRegisterForm";
import HomePage_HUB_LogoGenerator from "./HomePage_HUB_LogoGenerator";
import HomePage_HUB_CaptainVerification from "./HomePage_HUB_CaptainVerification";
import { slugifyClubName } from "../../core/homePageHubLogoUtils";
import { auth } from "../../firebaseConfig";
import {
  createHomePageHubClub,
  updateHomePageHubClub,
} from "../../storage/homePageHubClubRepository";

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
  founderFirstName: "",
  founderSurname: "",
  captainName: "",
  captainEmail: "",
  captainWhatsApp: "",
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
  const [captainVerificationConfirmed, setCaptainVerificationConfirmed] = useState(false);
  const [bankingDraft, setBankingDraft] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [pendingCreatedClubId, setPendingCreatedClubId] = useState("");
  const [mediaSetupPending, setMediaSetupPending] = useState(false);

  const clubId = useMemo(
    () => slugifyClubName(clubDraft.clubId || clubDraft.clubName),
    [clubDraft.clubId, clubDraft.clubName]
  );

  const showLocalQuickFill =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

  function quickFillTestData() {
    const testNumber = String(Date.now()).slice(-5);
    const testClubName = `Test FC ${testNumber}`;

    setClubDraft({
      ...INITIAL_CLUB_DRAFT,
      clubName: testClubName,
      clubId: slugifyClubName(testClubName),
      venueName: "Wynberg Sports Club",
      address: "Wynberg, Cape Town",
      suburb: "Wynberg",
      city: "Cape Town",
      province: "Western Cape",
      country: "South Africa",
      latitude: -34.0048,
      longitude: 18.4681,
      playDay: "Wednesday",
      playTime: "19:00",
      weeklyPlayTime: "Wednesdays · 19:00",
      timezone: "Africa/Johannesburg",
      founderFirstName: "Nkululeko",
      founderSurname: "Memela",
      captainName: "Nkululeko Memela",
      captainEmail: auth.currentUser?.email || "nkululeko.memela+test@gmail.com",
      captainWhatsApp: "+27 76 284 9740",
      accent: "#16a34a",
      logoText: "TF",
    });

    setCaptainVerificationConfirmed(true);
    setErrorText("");
  }

  if (!isOpen) return null;

  function resetAndClose() {
    setMode("choice");
    setStep(1);
    setErrorText("");
    setSubmitting(false);
    setCaptainVerificationConfirmed(false);
    setPendingCreatedClubId("");
    setMediaSetupPending(false);
    onClose?.();
  }

  function validateStep(stepNumber) {
    if (stepNumber === 1) {
      if (!clubDraft.clubName.trim()) return "Club name is required.";
      if (clubDraft.clubName.trim().length > 16) return "Club name must be 16 characters or less.";
      if (!clubId) return "Club ID could not be created from the club name.";

      if (!clubDraft.venueName?.trim()) return "Venue name is required.";
      if (!clubDraft.city?.trim()) return "City is required.";
      if (!clubDraft.country?.trim()) return "Country is required.";
      if (!clubDraft.playDay?.trim()) return "Playing day is required.";
      if (!clubDraft.playTime?.trim()) return "Playing time is required.";

      if (!clubDraft.founderFirstName?.trim()) return "First name is required.";
      if (clubDraft.founderFirstName.trim().length > 20) return "First name must be 20 characters or less.";

      if (!clubDraft.founderSurname?.trim()) return "Surname is required.";
      if (clubDraft.founderSurname.trim().length > 24) return "Surname must be 24 characters or less.";

      if (!clubDraft.captainEmail.trim()) return "Email is required.";
      if (!isValidEmail(clubDraft.captainEmail)) return "Email is not valid.";

      if (!clubDraft.captainWhatsApp?.trim()) return "WhatsApp number is required.";
      if (clubDraft.captainWhatsApp.trim().length > 20) return "WhatsApp number must be 20 characters or less.";
    }

    if (stepNumber === 3) {
      if (
        !logoDraft?.logoFile &&
        !logoDraft?.selectedGeneratedLogoId &&
        !logoDraft?.generatedLogoDataUrl
      ) {
        return "Please upload a badge or choose a starter badge before continuing.";
      }
    }

    return "";
  }

  function validateBeforeSubmit() {
    return validateStep(1) || validateStep(3);
  }

  function goToStep(nextStep) {
    if (nextStep <= step) {
      setErrorText("");
      setStep(nextStep);
      return;
    }

    for (let item = step; item < nextStep; item += 1) {
      const stepError = validateStep(item);
      if (stepError) {
        setErrorText(stepError);
        setStep(item);
        return;
      }
    }

    setErrorText("");
    setStep(nextStep);
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

      const founderName = `${clubDraft.founderFirstName || ""} ${clubDraft.founderSurname || ""}`
        .replace(/\s+/g, " ")
        .trim();

      const preparedClubDraft = {
        ...clubDraft,
        captainName: founderName,
        captainVerificationStatus: captainVerificationConfirmed
          ? "pending_whatsapp_admin_review"
          : "not_started",
        captainVerificationMethod: "whatsapp_business_manual",
        captainVerificationRequestedAtClient: captainVerificationConfirmed
          ? new Date().toISOString()
          : "",
      };

      const preparedBankingDraft = {
        ...bankingDraft,
        founderProgrammeActive: true,
        paymentCollectionMode: "founder_programme_free",
      };

      if (mediaSetupPending && pendingCreatedClubId) {
        const completedClub = await updateHomePageHubClub({
          clubId: pendingCreatedClubId,
          clubDraft: preparedClubDraft,
          logoDraft,
          bankingDraft: preparedBankingDraft,
        });

        onClubCreated?.(completedClub);
        resetAndClose();
        return;
      }

      const createdClub = await createHomePageHubClub({
        clubId,
        clubDraft: preparedClubDraft,
        logoDraft,
        bankingDraft: preparedBankingDraft,
      });

      if (createdClub?.mediaSetupPending) {
        setPendingCreatedClubId(createdClub.id || clubId);
        setMediaSetupPending(true);
        setStep(3);
        setErrorText(
          "Your club was created successfully, but we could not finish saving the badge. Select Finish club setup to try again."
        );
        return;
      }

      onClubCreated?.(createdClub);
      resetAndClose();
    } catch (error) {
      console.error(
        mediaSetupPending
          ? "[HomePage_HUB] Failed to finish club setup:"
          : "[HomePage_HUB] Failed to create club:",
        error
      );

      setErrorText(
        mediaSetupPending
          ? "Your club is safe, but the badge still could not be saved. Please try again."
          : error?.message ||
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
              <strong>Join a football club</strong>
              <small>
                Discover nearby clubs, verify yourself and become matchday ready.
              </small>
            </button>

            <button type="button" onClick={() => setMode("register")}>
              <span>🏟️</span>
              <strong>Create your own club</strong>
              <small>
                Launch your club, customise your badge and start inviting players.
              </small>
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
                  onClick={() => goToStep(item)}
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
                onQuickFill={quickFillTestData}
              />
            ) : null}

            {step === 2 ? (
              <HomePage_HUB_CaptainVerification
                clubDraft={clubDraft}
                onClubDraftChange={setClubDraft}
                verificationConfirmed={captainVerificationConfirmed}
                onVerificationConfirmed={setCaptainVerificationConfirmed}
              />
            ) : null}

            {step === 3 ? (
              <HomePage_HUB_LogoGenerator
                clubDraft={{ ...clubDraft, clubId }}
                logoDraft={logoDraft}
                onChange={setLogoDraft}
              />
            ) : null}

            {errorText ? <div className="hub-error-box">{errorText}</div> : null}

            <footer className="hub-modal__footer">
              <button
                type="button"
                className="hub-secondary-button"
                disabled={submitting || mediaSetupPending}
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
                  onClick={() => goToStep(Math.min(3, step + 1))}
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
