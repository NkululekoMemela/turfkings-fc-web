// src/components/HomePage_HUB/HomePage_HUB_ClubProfileEditorModal.jsx

import React, { useMemo, useState } from "react";
import HomePage_HUB_ClubRegisterForm from "./HomePage_HUB_ClubRegisterForm";
import HomePage_HUB_LogoGenerator from "./HomePage_HUB_LogoGenerator";
import { updateHomePageHubClub } from "../../storage/homePageHubClubRepository";

function getDraftFromClub(club = {}) {
  return {
    clubName: club.name || "",
    clubId: club.id || "",
    venueName: club?.locationDetails?.venueName || "",
    address: club?.locationDetails?.address || "",
    suburb: club?.locationDetails?.suburb || club.area || "",
    city: club?.locationDetails?.city || "",
    province: club?.locationDetails?.province || "",
    country: club?.locationDetails?.country || "South Africa",
    playDay: club?.schedule?.playDay || "",
    playTime: club?.schedule?.playTime || "",
    weeklyPlayTime: club?.weeklyPlayTime || club?.schedule?.weeklyPlayTime || "",
    timezone: club?.schedule?.timezone || "Africa/Johannesburg",
    captainName: club?.captain?.name || "",
    captainEmail: club?.captain?.email || "",
    accent: club.accent || "#16a34a",
    logoText: club.logoText || "FC",
  };
}

function getLogoDraftFromClub(club = {}) {
  return {
    logoFile: null,
    uploadedLogoUrl:
      club.logoUrl ||
      club.image ||
      club?.branding?.uploadedLogoUrl ||
      club?.media?.logoOriginalUrl ||
      "",
    selectedGeneratedLogo: club?.branding?.selectedGeneratedLogo || "",
    generatedLogoPrompt: club?.branding?.generatedLogoPrompt || "",
    generatedLogoSvg: club?.branding?.generatedLogoSvg || "",
    generatedLogoDataUrl: club?.branding?.generatedLogoDataUrl || "",
    galleryFiles: [],
  };
}

export default function HomePage_HUB_ClubProfileEditorModal({
  club,
  isOpen,
  onClose,
  onSaved,
}) {
  const [step, setStep] = useState(1);
  const [clubDraft, setClubDraft] = useState(() =>
    getDraftFromClub(club || {})
  );

  const [logoDraft, setLogoDraft] = useState(() =>
    getLogoDraftFromClub(club || {})
  );
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  const clubId = useMemo(() => club?.id || clubDraft.clubId, [club?.id, clubDraft.clubId]);

  if (!isOpen || !club?.id) return null;

  async function saveClubProfile() {
    setErrorText("");

    try {
      setSaving(true);

      const updatedClub = await updateHomePageHubClub({
        clubId,
        clubDraft,
        logoDraft,
      });

      onSaved?.({
        ...club,
        ...updatedClub,
      });

      onClose?.();
    } catch (error) {
      console.error("[HomePage_HUB] Failed to update club profile:", error);
      setErrorText(error?.message || "Failed to update club profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="hub-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <section
        className="hub-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${club.name || "club"} profile`}
      >
        <header className="hub-modal__header">
          <div>
            <span>Club profile</span>
            <h2>Edit {club.name || "club"}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close club profile editor"
            disabled={saving}
          >
            ×
          </button>
        </header>

        <div className="hub-stepper" aria-label="Club profile editor steps">
          {[1, 2].map((item) => (
            <button
              key={item}
              type="button"
              className={step === item ? "is-active" : ""}
              onClick={() => setStep(item)}
              disabled={saving}
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

        {errorText ? <div className="hub-error-box">{errorText}</div> : null}

        <footer className="hub-modal__footer">
          <button
            type="button"
            className="hub-secondary-button"
            disabled={saving}
            onClick={() => (step === 1 ? onClose?.() : setStep(1))}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step === 1 ? (
            <button
              type="button"
              className="hub-primary-button"
              disabled={saving}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="hub-primary-button"
              disabled={saving}
              onClick={saveClubProfile}
            >
              {saving ? "Saving..." : "Save club"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
