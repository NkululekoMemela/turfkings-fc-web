// src/components/homeHub/HomePage_HUB_SignupModal.jsx

import React, { useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import HomePage_HUB_ClubRegisterForm from "./HomePage_HUB_ClubRegisterForm";
import HomePage_HUB_LogoGenerator from "./HomePage_HUB_LogoGenerator";
import HomePage_HUB_BankingForm from "./HomePage_HUB_BankingForm";
import { normalizeBankDetails, slugifyClubName } from "../../core/homePageHubLogoUtils";

const INITIAL_CLUB_DRAFT = {
  clubName: "",
  clubId: "",
  location: "",
  weeklyPlayTime: "",
  captainName: "",
  captainEmail: "",
  accent: "#16a34a",
  logoText: "FC",
};

export default function HomePage_HUB_SignupModal({ isOpen, onClose, onJoinExistingClub, onClubCreated }) {
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
    onClose?.();
  }

  function validateBeforeSubmit() {
    if (!clubDraft.clubName.trim()) return "Club name is required.";
    if (!clubId) return "Club ID could not be created from the club name.";
    if (!clubDraft.captainName.trim()) return "Captain name is required.";
    if (!clubDraft.captainEmail.trim()) return "Captain email is required.";
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
      const captainEmail = clubDraft.captainEmail.trim().toLowerCase();
      const bankDetails = normalizeBankDetails(bankingDraft);
      const selectedGeneratedLogo = logoDraft.selectedGeneratedLogoId || "";
      const uploadedLogoUrl = logoDraft.uploadedLogoUrl || "";

      await setDoc(
        doc(db, "clubs", clubId),
        {
          id: clubId,
          name: clubDraft.clubName.trim(),
          location: clubDraft.location.trim(),
          area: clubDraft.location.trim(),
          weeklyPlayTime: clubDraft.weeklyPlayTime.trim(),
          accent: clubDraft.accent || "#16a34a",
          activity: "New club",
          clubRating: "Unranked",
          helpNeeded: 0,
          members: 1,
          logoText: clubDraft.logoText || clubDraft.clubName.trim().slice(0, 2).toUpperCase(),
          image: uploadedLogoUrl,
          logoUrl: uploadedLogoUrl,
          branding: {
            uploadedLogoUrl,
            selectedGeneratedLogo,
            generatedLogoPrompt: logoDraft.generatedLogoPrompt || "",
            logoStorage: logoDraft.storage || null,
            transparentTwinStatus: selectedGeneratedLogo || uploadedLogoUrl ? "pending" : "not_started",
          },
          banking: bankDetails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: captainEmail,
          description: "",
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "clubs", clubId, "state", "main"),
        {
          activeMatch: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          seasonStatus: "setup",
          signupOpen: true,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "clubs", clubId, "members", captainEmail),
        {
          name: clubDraft.captainName.trim(),
          email: captainEmail,
          role: "captain",
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      onClubCreated?.({ id: clubId, name: clubDraft.clubName.trim() });
      resetAndClose();
    } catch (error) {
      console.error("[HomePage_HUB] Failed to create club:", error);
      setErrorText("Failed to create club. Check Firebase permissions and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="hub-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) resetAndClose();
    }}>
      <section className="hub-modal" role="dialog" aria-modal="true" aria-label="Sign up free">
        <header className="hub-modal__header">
          <div>
            <span>Free signup</span>
            <h2>{mode === "register" ? "Register your club" : "Start playing"}</h2>
          </div>
          <button type="button" onClick={resetAndClose} aria-label="Close signup modal">×</button>
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
                >
                  {item}
                </button>
              ))}
            </div>

            {step === 1 ? (
              <HomePage_HUB_ClubRegisterForm clubDraft={clubDraft} onChange={setClubDraft} />
            ) : null}

            {step === 2 ? (
              <HomePage_HUB_LogoGenerator clubDraft={{ ...clubDraft, clubId }} logoDraft={logoDraft} onChange={setLogoDraft} />
            ) : null}

            {step === 3 ? (
              <HomePage_HUB_BankingForm bankingDraft={bankingDraft} onChange={setBankingDraft} />
            ) : null}

            {errorText ? <div className="hub-error-box">{errorText}</div> : null}

            <footer className="hub-modal__footer">
              <button
                type="button"
                className="hub-secondary-button"
                onClick={() => (step === 1 ? setMode("choice") : setStep((current) => Math.max(1, current - 1)))}
              >
                Back
              </button>

              {step < 3 ? (
                <button type="button" className="hub-primary-button" onClick={() => setStep((current) => Math.min(3, current + 1))}>
                  Continue
                </button>
              ) : (
                <button type="button" className="hub-primary-button" onClick={createClub} disabled={submitting}>
                  {submitting ? "Creating..." : "Create club"}
                </button>
              )}
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}
