import React, { useMemo, useState } from "react";
import { buildLogoStorageNames } from "../../core/homePageHubLogoUtils";
import {
  buildSvgLogoOptions,
  getSelectedSvgLogo,
} from "../../core/homePageHubLogoSvgFactory";
import HomePage_HUB_AIBadgeCreator from "./HomePage_HUB_AIBadgeCreator";

function fileToPreview(file) {
  if (!file) return "";
  return URL.createObjectURL(file);
}

export default function HomePage_HUB_LogoGenerator({ clubDraft, logoDraft, onChange }) {
  const [conceptSeed, setConceptSeed] = useState(0);
  const [showAiCreator, setShowAiCreator] = useState(false);
  const [showStarterBadges, setShowStarterBadges] = useState(false);

  const svgOptions = useMemo(
    () =>
      buildSvgLogoOptions({
        clubName: clubDraft?.clubName,
        accent: clubDraft?.accent,
        seed: conceptSeed,
      }),
    [clubDraft?.clubName, clubDraft?.accent, conceptSeed]
  );

  const selectedOption = logoDraft?.selectedGeneratedLogoId || "";
  const selectedSvgLogo = getSelectedSvgLogo(svgOptions, selectedOption);
  const storageNames = buildLogoStorageNames(clubDraft?.clubId || clubDraft?.clubName);

  const logoPreviewUrl = useMemo(
    () => fileToPreview(logoDraft?.logoFile),
    [logoDraft?.logoFile]
  );

  const activeBadgeUrl = logoPreviewUrl || selectedSvgLogo?.previewUrl || "";

  function updateLogoDraft(nextValues) {
    onChange?.({
      ...(logoDraft || {}),
      ...nextValues,
      storage: storageNames,
    });
  }

  function handleLogoFile(event) {
    const file = event.target.files?.[0] || null;

    updateLogoDraft({
      logoFile: file,
      uploadedLogoUrl: "",
      selectedGeneratedLogoId: "",
      generatedLogoPrompt: "",
      generatedLogoSvg: "",
      generatedLogoDataUrl: "",
    });
  }

  function selectSvgLogo(option) {
    updateLogoDraft({
      selectedGeneratedLogoId: option.id,
      generatedLogoPrompt: "",
      generatedLogoSvg: option.svg,
      generatedLogoDataUrl: option.previewUrl,
      logoFile: null,
      uploadedLogoUrl: "",
    });
  }

  return (
    <div className="hub-form-panel">
      {showAiCreator ? (
        <HomePage_HUB_AIBadgeCreator
          clubDraft={clubDraft}
          onClose={() => setShowAiCreator(false)}
        />
      ) : null}

      <div className="hub-form-panel__head">
        <span>Step 3</span>
        <h3>Club identity</h3>
        <p>Create a badge your players will proudly recognise.</p>
      </div>

      <label className="hub-file-drop hub-badge-upload-card">
        <span>⬆️ Upload your own badge</span>
        <strong>{logoDraft?.logoFile?.name || "Choose badge image"}</strong>
        <small>PNG, JPG or WebP.</small>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleLogoFile}
        />
      </label>

      <div className="hub-or-divider"><span>OR</span></div>

      <div className="hub-identity-ai-card">
        <span>✨ Most Popular</span>
        <strong>✨ Create Premium Badge (on ChatGPT)</strong>
        <p>
          Design a professional badge with a prepared 5 Asides Near Me prompt in under a minute.
        </p>
        <button
          type="button"
          className="hub-primary-button"
          onClick={() => setShowAiCreator(true)}
        >
          ✨ Create Premium Badge
        </button>
      </div>

      <div className="hub-or-divider"><span>OR</span></div>

      <button
        type="button"
        className="hub-starter-toggle-card"
        onClick={() => setShowStarterBadges((current) => !current)}
      >
        <span className="hub-starter-toggle-icon">🎨</span>
        <span>
          <strong>Choose a free starter badge</strong>
          <small>Pick a style that matches your club. You can change it anytime.</small>
        </span>
        <em>{showStarterBadges ? "⌃" : "⌄"}</em>
      </button>

      {showStarterBadges ? (
        <>
          <div className="hub-badge-toolbar">
            <div>
              <strong>Starter badges</strong>
              <span>Choose a free starter badge based on your club name.</span>
            </div>

            <button
              type="button"
              className="hub-refresh-concepts-button"
              onClick={() => {
                setConceptSeed((current) => current + 1);
                updateLogoDraft({
                  selectedGeneratedLogoId: "",
                  generatedLogoPrompt: "",
                  generatedLogoSvg: "",
                  generatedLogoDataUrl: "",
                });
              }}
            >
              ↻ Refresh styles
            </button>
          </div>

          <div className="hub-logo-options hub-logo-options--svg">
            {svgOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`hub-logo-option hub-logo-option--svg ${
                  selectedOption === option.id ? "is-selected" : ""
                }`}
                onClick={() => selectSvgLogo(option)}
                style={{ "--hub-logo-accent": clubDraft?.accent || "#16a34a" }}
              >
                <span className="hub-logo-option__svg-preview">
                  <img src={option.previewUrl} alt={`${option.title} preview`} />
                </span>
                <strong>{option.title}</strong>
                <small>{option.tone}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="hub-badge-preview-card">
        <span>Badge preview</span>
        <div className="hub-badge-preview-mark">
          {activeBadgeUrl ? (
            <img src={activeBadgeUrl} alt="Club badge preview" />
          ) : (
            <strong>{clubDraft?.logoText || "FC"}</strong>
          )}
        </div>
        <strong>{clubDraft?.clubName || "Your Club"}</strong>
      </div>
    </div>
  );
}
