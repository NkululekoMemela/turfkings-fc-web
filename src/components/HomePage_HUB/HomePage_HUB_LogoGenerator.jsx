// src/components/HomePage_HUB/HomePage_HUB_LogoGenerator.jsx

import React, { useMemo, useState } from "react";
import {
  buildGeneratedLogoOptions,
  buildLogoStorageNames,
} from "../../core/homePageHubLogoUtils";
import {
  buildSvgLogoOptions,
  getSelectedSvgLogo,
} from "../../core/homePageHubLogoSvgFactory";

const MAX_GALLERY_FILES = 3;

function fileToPreview(file) {
  if (!file) return "";
  return URL.createObjectURL(file);
}

export default function HomePage_HUB_LogoGenerator({
  clubDraft,
  logoDraft,
  onChange,
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  const aiPromptOptions = useMemo(
    () =>
      buildGeneratedLogoOptions({
        clubName: clubDraft?.clubName,
        location: clubDraft?.location || clubDraft?.city || clubDraft?.suburb,
        accent: clubDraft?.accent,
      }),
    [
      clubDraft?.clubName,
      clubDraft?.location,
      clubDraft?.city,
      clubDraft?.suburb,
      clubDraft?.accent,
    ]
  );

  const svgOptions = useMemo(
    () =>
      buildSvgLogoOptions({
        clubName: clubDraft?.clubName,
        accent: clubDraft?.accent,
      }),
    [clubDraft?.clubName, clubDraft?.accent]
  );

  const selectedOption = logoDraft?.selectedGeneratedLogoId || "";
  const selectedSvgLogo = getSelectedSvgLogo(svgOptions, selectedOption);

  const storageNames = buildLogoStorageNames(
    clubDraft?.clubId || clubDraft?.clubName
  );

  const logoPreviewUrl = useMemo(
    () => fileToPreview(logoDraft?.logoFile),
    [logoDraft?.logoFile]
  );

  const galleryPreviewItems = useMemo(
    () =>
      (logoDraft?.galleryFiles || []).map((file) => ({
        name: file.name,
        url: fileToPreview(file),
      })),
    [logoDraft?.galleryFiles]
  );

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

  function handleGalleryFiles(event) {
    const files = Array.from(event.target.files || []).slice(0, MAX_GALLERY_FILES);

    updateLogoDraft({
      galleryFiles: files,
    });
  }

  function removeGalleryFile(name) {
    updateLogoDraft({
      galleryFiles: (logoDraft?.galleryFiles || []).filter(
        (file) => file.name !== name
      ),
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
      <div className="hub-form-panel__head">
        <span>Step 2</span>
        <h3>Club identity</h3>
        <p>
          Upload a logo, choose an instant badge, or keep a temporary initials
          mark. The badge loosely follows your selected club colour.
        </p>
      </div>

      <label className="hub-file-drop">
        <span>Upload club logo</span>
        <strong>{logoDraft?.logoFile?.name || "Choose logo image"}</strong>
        <small>PNG, JPG or WebP. This will be saved to Firebase Storage.</small>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleLogoFile}
        />
      </label>

      {logoPreviewUrl ? (
        <div className="hub-logo-upload-preview">
          <img src={logoPreviewUrl} alt="Selected club logo preview" />
          <button
            type="button"
            className="hub-secondary-button"
            onClick={() => updateLogoDraft({ logoFile: null })}
          >
            Remove logo
          </button>
        </div>
      ) : null}

      <div className="hub-soft-note">
        <strong>Instant badge generator</strong>
        <span>
          Pick a clean generated badge now. You can still upload a real logo later.
        </span>
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

      {selectedSvgLogo ? (
        <div className="hub-logo-upload-preview">
          <img src={selectedSvgLogo.previewUrl} alt="Generated club badge preview" />
          <button
            type="button"
            className="hub-secondary-button"
            onClick={() =>
              updateLogoDraft({
                selectedGeneratedLogoId: "",
                generatedLogoSvg: "",
                generatedLogoDataUrl: "",
              })
            }
          >
            Remove badge
          </button>
        </div>
      ) : null}

      <label className="hub-file-drop">
        <span>Upload club photos</span>
        <strong>
          {(logoDraft?.galleryFiles || []).length
            ? `${(logoDraft?.galleryFiles || []).length}/${MAX_GALLERY_FILES} photo(s) selected`
            : "Choose up to 3 group photos"}
        </strong>
        <small>Optional. Add a few existing team photos for the club page.</small>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleGalleryFiles}
        />
      </label>

      {galleryPreviewItems.length ? (
        <div className="hub-gallery-preview-grid">
          {galleryPreviewItems.map((item) => (
            <div key={item.name} className="hub-gallery-preview-item">
              <img src={item.url} alt={item.name} />
              <button type="button" onClick={() => removeGalleryFile(item.name)}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="hub-soft-note">
        <strong>Already have a hosted logo?</strong>
        <span>You can paste a logo URL below instead of uploading a file.</span>
      </div>

      <label className="hub-field">
        <span>Existing logo URL</span>
        <input
          value={logoDraft?.uploadedLogoUrl || ""}
          onChange={(event) =>
            updateLogoDraft({
              uploadedLogoUrl: event.target.value,
              logoFile: null,
              selectedGeneratedLogoId: "",
              generatedLogoSvg: "",
              generatedLogoDataUrl: "",
            })
          }
          placeholder="https://..."
        />
      </label>

      <button
        type="button"
        className="hub-secondary-button"
        onClick={() => setShowPrompt((current) => !current)}
      >
        {showPrompt ? "Hide AI prompt" : "Show prepared AI logo prompt"}
      </button>

      {showPrompt ? (
        <div className="hub-logo-prompt">
          <strong>Prepared prompt</strong>
          <p>{logoDraft?.generatedLogoPrompt || aiPromptOptions[0]?.prompt}</p>
        </div>
      ) : null}
    </div>
  );
}
