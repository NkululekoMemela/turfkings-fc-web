// src/components/homeHub/HomePage_HUB_LogoGenerator.jsx

import React, { useMemo, useState } from "react";
import { buildGeneratedLogoOptions, buildLogoStorageNames } from "../../core/homePageHubLogoUtils";

export default function HomePage_HUB_LogoGenerator({ clubDraft, logoDraft, onChange }) {
  const [showPrompt, setShowPrompt] = useState(false);

  const options = useMemo(
    () => buildGeneratedLogoOptions({
      clubName: clubDraft?.clubName,
      location: clubDraft?.location,
      accent: clubDraft?.accent,
    }),
    [clubDraft?.clubName, clubDraft?.location, clubDraft?.accent]
  );

  const selectedOption = logoDraft?.selectedGeneratedLogoId || "";
  const storageNames = buildLogoStorageNames(clubDraft?.clubId || clubDraft?.clubName);

  function updateLogoDraft(nextValues) {
    onChange?.({
      ...(logoDraft || {}),
      ...nextValues,
      storage: storageNames,
    });
  }

  return (
    <div className="hub-form-panel">
      <div className="hub-form-panel__head">
        <span>Step 2</span>
        <h3>Club logo</h3>
        <p>Upload your own logo, or prepare two AI-style options to generate later.</p>
      </div>

      <label className="hub-field">
        <span>Existing logo URL</span>
        <input
          value={logoDraft?.uploadedLogoUrl || ""}
          onChange={(event) => updateLogoDraft({ uploadedLogoUrl: event.target.value })}
          placeholder="Paste image URL for now"
        />
        <small>Full file upload can be connected to Firebase Storage after this UI is approved.</small>
      </label>

      <div className="hub-logo-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`hub-logo-option ${selectedOption === option.id ? "is-selected" : ""}`}
            onClick={() => updateLogoDraft({ selectedGeneratedLogoId: option.id, generatedLogoPrompt: option.prompt })}
            style={{ "--hub-logo-accent": option.accent }}
          >
            <span className="hub-logo-option__badge">
              <span>{option.initials}</span>
              <i>⚽</i>
            </span>
            <strong>{option.title}</strong>
            <small>{option.tone}</small>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="hub-secondary-button"
        onClick={() => setShowPrompt((current) => !current)}
      >
        {showPrompt ? "Hide logo prompt" : "Show prepared AI logo prompt"}
      </button>

      {showPrompt ? (
        <div className="hub-logo-prompt">
          <strong>Prepared prompt</strong>
          <p>{logoDraft?.generatedLogoPrompt || options[0]?.prompt}</p>
        </div>
      ) : null}

      <div className="hub-soft-note">
        <strong>Logo engine note</strong>
        <span>
          The UI is ready. Real AI generation needs a backend/API or a manual ChatGPT-assisted generation step.
          After a logo is selected, the transparent twin should be saved as: {storageNames.transparentLogoPath}
        </span>
      </div>
    </div>
  );
}
