// src/components/HomePage_HUB/HomePage_HUB_ClubProfileEditorModal.jsx

import React, { useEffect, useMemo, useState } from "react";
import HomePage_HUB_ClubRegisterForm from "./HomePage_HUB_ClubRegisterForm";
import HomePage_HUB_LogoGenerator from "./HomePage_HUB_LogoGenerator";
import { updateHomePageHubClub } from "../../storage/homePageHubClubRepository";

function parseWeeklyPlayTime(value = "") {
  const text = String(value || "").trim();
  if (!text) return { playDay: "", playTime: "" };

  const dayMatch = text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i);
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);

  return {
    playDay: dayMatch
      ? dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase()
      : "",
    playTime: timeMatch ? timeMatch[0] : "",
  };
}

function getDraftFromClub(club = {}, adminIdentity = {}) {
  const source = club?.raw || club || {};
  const admin = adminIdentity || {};
  const weeklyPlayTime =
    source?.weeklyPlayTime ||
    source?.schedule?.weeklyPlayTime ||
    club.weeklyPlayTime ||
    "";

  const parsedWeekly = parseWeeklyPlayTime(weeklyPlayTime);

  const captainName =
    source?.captain?.name ||
    source.captainName ||
    admin.fullName ||
    admin.displayName ||
    "";
  const captainParts = String(captainName || "").trim().split(/\s+/).filter(Boolean);
  const city = source?.locationDetails?.city || source.city || "";
  const province =
    source?.locationDetails?.province ||
    source.province ||
    (String(city).trim().toLowerCase() === "cape town" ? "Western Cape" : "");

  return {
    clubName: source.name || source.clubName || club.name || "",
    clubId: source.id || source.clubId || club.id || "",
    venueName: source?.locationDetails?.venueName || source.venueName || "",
    address: source?.locationDetails?.address || source.address || "",
    suburb: source?.locationDetails?.suburb || source.area || source.suburb || club.area || "",
    city,
    province,
    country: source?.locationDetails?.country || source.country || "South Africa",
    playDay: source?.schedule?.playDay || source.playDay || parsedWeekly.playDay,
    playTime: source?.schedule?.playTime || source.playTime || parsedWeekly.playTime,
    weeklyPlayTime,
    timezone: source?.schedule?.timezone || source.timezone || "Africa/Johannesburg",
    captainName,
    founderFirstName: source.founderFirstName || admin.firstName || admin.shortName || captainParts[0] || "",
    founderSurname: source.founderSurname || admin.surname || admin.lastName || captainParts.slice(1).join(" ") || "",
    captainEmail: source?.captain?.email || source.captainEmail || admin.email || "",
    captainWhatsApp:
      source?.captain?.whatsappNumber ||
      source?.captain?.phoneNumber ||
      source.captainWhatsApp ||
      admin.whatsappNumber ||
      admin.phoneNumber ||
      "",
    accent: source.accent || club.accent || "#16a34a",
    logoText: source.logoText || club.logoText || "FC",
  };
}

function getLogoDraftFromClub(club = {}) {
  const source = club?.raw || club || {};

  return {
    logoFile: null,
    uploadedLogoUrl:
      source.logoUrl ||
      source.image ||
      source?.branding?.uploadedLogoUrl ||
      source?.media?.logoOriginalUrl ||
      club.logoUrl ||
      club.image ||
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
  adminIdentity = {},
}) {
  const [step, setStep] = useState(1);
  const [clubDraft, setClubDraft] = useState(() =>
    getDraftFromClub(club || {}, adminIdentity)
  );

  const [logoDraft, setLogoDraft] = useState(() =>
    getLogoDraftFromClub(club || {})
  );
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  const clubId = useMemo(() => club?.id || clubDraft.clubId, [club?.id, clubDraft.clubId]);

  useEffect(() => {
    if (!isOpen || !club?.id) return;

    setClubDraft(getDraftFromClub(club, adminIdentity));
    setLogoDraft(getLogoDraftFromClub(club));
    setStep(1);
    setErrorText("");
  }, [isOpen, club?.id, adminIdentity?.email, adminIdentity?.fullName, adminIdentity?.whatsappNumber]);

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
