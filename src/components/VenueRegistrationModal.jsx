import React, {
  useMemo,
  useState,
} from "react";
import { auth } from "../firebaseConfig.js";
import HomePage_HUB_GoogleVenueInput from "./HomePage_HUB/HomePage_HUB_GoogleVenueInput.jsx";
import HomePage_HUB_LogoGenerator from "./HomePage_HUB/HomePage_HUB_LogoGenerator.jsx";
import {
  completeLeagueVenueRegistration,
  createLeagueVenue,
} from "../storage/leagueVenueRepository.js";

const INITIAL_DRAFT = {
  name: "",
  city: "",
  suburb: "",
  address: "",
  province: "",
  country: "South Africa",
  latitude: null,
  longitude: null,
  googlePlaceId: "",
  websiteUrl: "",
  creatorRole: "",
  staffFirstName: "",
  staffSurname: "",
  staffEmail: "",
  staffWhatsApp: "",
  accent: "#16a34a",
  logoText: "FV",
};

function initials(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "FV";
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );
}

export default function VenueRegistrationModal({
  isOpen,
  onClose,
  onVenueCreated,
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(() => ({
    ...INITIAL_DRAFT,
    staffEmail: auth.currentUser?.email || "",
  }));
  const [logoDraft, setLogoDraft] = useState({});
  const [createdVenueId, setCreatedVenueId] =
    useState("");
  const [submitting, setSubmitting] =
    useState(false);
  const [errorText, setErrorText] = useState("");

  const venueIdentity = useMemo(
    () => ({
      clubName: draft.name,
      clubId: slug(draft.name),
      accent: draft.accent,
      logoText: draft.logoText,
    }),
    [
      draft.name,
      draft.accent,
      draft.logoText,
    ]
  );

  if (!isOpen) return null;

  function updateField(field, value) {
    setDraft((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "name") {
        next.logoText = initials(value);
      }

      return next;
    });
  }

  function selectGoogleVenue(place) {
    setDraft((current) => ({
      ...current,
      name:
        current.name ||
        place?.venueName ||
        "",
      address: place?.address || "",
      suburb: place?.suburb || "",
      city: place?.city || "",
      province:
        place?.province ||
        current.province ||
        "",
      country:
        place?.country ||
        current.country ||
        "South Africa",
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      googlePlaceId: place?.placeId || "",
    }));
  }

  function validateStep(stepNumber) {
    if (stepNumber === 1) {
      if (!draft.name.trim()) {
        return "Field/Venue name is required.";
      }

      if (!draft.city.trim()) {
        return "City is required.";
      }

      if (!draft.country.trim()) {
        return "Country is required.";
      }

      const website = draft.websiteUrl.trim();

      if (
        website &&
        !/^https?:\/\/[^ ]+\.[^ ]+/i.test(
          website
        )
      ) {
        return "Enter a complete website address beginning with https://";
      }
    }

    if (stepNumber === 2) {
      if (!draft.creatorRole) {
        return "Select your role at this Field.";
      }

      if (!draft.staffFirstName.trim()) {
        return "First name is required.";
      }

      if (!draft.staffSurname.trim()) {
        return "Surname is required.";
      }

      if (!validEmail(draft.staffEmail)) {
        return "Enter a valid authorised staff email.";
      }

      if (!draft.staffWhatsApp.trim()) {
        return "WhatsApp number is required.";
      }
    }

    if (stepNumber === 3) {
      const hasLogo =
        logoDraft.logoFile ||
        logoDraft.selectedGeneratedLogoId ||
        logoDraft.generatedLogoDataUrl ||
        logoDraft.uploadedLogoUrl;

      if (!hasLogo) {
        return "Upload a Field logo or choose a starter logo before continuing.";
      }
    }

    return "";
  }

  function goToStep(nextStep) {
    if (nextStep <= step) {
      setErrorText("");
      setStep(nextStep);
      return;
    }

    for (
      let current = step;
      current < nextStep;
      current += 1
    ) {
      const error = validateStep(current);

      if (error) {
        setErrorText(error);
        setStep(current);
        return;
      }
    }

    setErrorText("");
    setStep(nextStep);
  }

  function resetAndClose() {
    if (submitting) return;

    setStep(1);
    setDraft({
      ...INITIAL_DRAFT,
      staffEmail:
        auth.currentUser?.email || "",
    });
    setLogoDraft({});
    setCreatedVenueId("");
    setErrorText("");
    onClose?.();
  }

  async function createField() {
    const validationError =
      validateStep(1) ||
      validateStep(2) ||
      validateStep(3);

    if (validationError) {
      setErrorText(validationError);
      return;
    }

    setSubmitting(true);
    setErrorText("");

    try {
      let venueId = createdVenueId;
      let createdVenue = null;

      if (!venueId) {
        createdVenue = await createLeagueVenue({
          name: draft.name,
          city: draft.city,
          suburb: draft.suburb,
          address: draft.address,
          websiteUrl: draft.websiteUrl,
          creatorRole: draft.creatorRole,
        });

        venueId = createdVenue.id;
        setCreatedVenueId(venueId);
      }

      const completedVenue =
        await completeLeagueVenueRegistration({
          venueId,
          draft,
          logoDraft,
        });

      onVenueCreated?.({
        ...(createdVenue || {}),
        ...completedVenue,
        id: venueId,
      });

      setSubmitting(false);
      setStep(1);
      setDraft({
        ...INITIAL_DRAFT,
        staffEmail:
          auth.currentUser?.email || "",
      });
      setLogoDraft({});
      setCreatedVenueId("");
      onClose?.();
    } catch (error) {
      console.error(
        "[VenueRegistration] Could not register Field:",
        error
      );

      setErrorText(
        createdVenueId
          ? error?.message ||
              "The Field is safe, but branding could not be completed. Try again."
          : error?.message ||
              "Field registration failed. Check the details and try again."
      );
      setSubmitting(false);
    }
  }

  return (
    <div
      className="hub-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          resetAndClose();
        }
      }}
    >
      <section
        className="hub-modal venue-register-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Register a new 5 Asides Field or Venue"
      >
        <header className="hub-modal__header">
          <div>
            <span>Field setup</span>
            <h2>
              Register a new 5 Asides Field/Venue
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close Field registration"
            onClick={resetAndClose}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <div
          className="hub-stepper"
          aria-label="Field registration steps"
        >
          {[1, 2, 3].map((item) => (
            <button
              key={item}
              type="button"
              className={
                step === item ? "is-active" : ""
              }
              onClick={() => goToStep(item)}
              disabled={submitting}
            >
              {item}
            </button>
          ))}
        </div>

        {step === 1 ? (
          <div className="hub-form-panel">
            <div className="hub-form-panel__head">
              <span>Step 1</span>
              <h3>Field/Venue details</h3>
              <p>
                Add the official Field identity and
                exact location.
              </p>
            </div>

            <div className="hub-form-grid">
              <label className="hub-field hub-field--wide">
                <span>Field/Venue name</span>
                <input
                  value={draft.name}
                  maxLength={80}
                  placeholder="Wynberg MM"
                  onChange={(event) =>
                    updateField(
                      "name",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field hub-field--wide">
                <span>Find the Field on Google</span>
                <small className="hub-field-hint">
                  Select the exact venue to capture its
                  address and map coordinates.
                </small>

                <HomePage_HUB_GoogleVenueInput
                  value={draft.name}
                  onTextChange={(value) => {
                    if (!draft.name) {
                      updateField("name", value);
                    }
                  }}
                  onPlaceSelected={selectGoogleVenue}
                />

                {draft.latitude &&
                draft.longitude ? (
                  <small className="hub-venue-verification-note hub-venue-verification-note--good">
                    Exact Field location captured.
                  </small>
                ) : (
                  <small className="hub-venue-verification-note">
                    Choose the closest Google result or
                    complete the location manually.
                  </small>
                )}
              </label>

              <label className="hub-field hub-field--wide">
                <span>Street address</span>
                <input
                  value={draft.address}
                  placeholder="Full venue address"
                  onChange={(event) =>
                    updateField(
                      "address",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field">
                <span>Suburb</span>
                <input
                  value={draft.suburb}
                  placeholder="Wynberg"
                  onChange={(event) =>
                    updateField(
                      "suburb",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field">
                <span>City</span>
                <input
                  value={draft.city}
                  placeholder="Cape Town"
                  onChange={(event) =>
                    updateField(
                      "city",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field">
                <span>Province</span>
                <input
                  value={draft.province}
                  placeholder="Western Cape"
                  onChange={(event) =>
                    updateField(
                      "province",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field">
                <span>Country</span>
                <input
                  value={draft.country}
                  onChange={(event) =>
                    updateField(
                      "country",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field hub-field--wide">
                <span>Existing website</span>
                <input
                  type="url"
                  value={draft.websiteUrl}
                  placeholder="https://example.com (optional)"
                  onChange={(event) =>
                    updateField(
                      "websiteUrl",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="hub-form-panel">
            <div className="hub-form-panel__head">
              <span>Step 2</span>
              <h3>Authorised Field representative</h3>
              <p>
                Confirm who is responsible for managing
                this Field on 5 Asides Near Me.
              </p>
            </div>

            <div className="hub-form-grid">
              <label className="hub-field hub-field--wide">
                <span>Your role at this Field</span>
                <select
                  className="hub-select"
                  value={draft.creatorRole}
                  onChange={(event) =>
                    updateField(
                      "creatorRole",
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select your role
                  </option>
                  <option value="field_manager">
                    Field Manager
                  </option>
                  <option value="assistant_manager">
                    Assistant Manager
                  </option>
                  <option value="field_assistant">
                    Field Assistant
                  </option>
                  <option value="other_staff">
                    Other authorised staff
                  </option>
                </select>
              </label>

              <label className="hub-field">
                <span>First name</span>
                <input
                  value={draft.staffFirstName}
                  maxLength={20}
                  onChange={(event) =>
                    updateField(
                      "staffFirstName",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field">
                <span>Surname</span>
                <input
                  value={draft.staffSurname}
                  maxLength={24}
                  onChange={(event) =>
                    updateField(
                      "staffSurname",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field">
                <span>Email / Gmail</span>
                <input
                  type="email"
                  value={draft.staffEmail}
                  maxLength={64}
                  onChange={(event) =>
                    updateField(
                      "staffEmail",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field">
                <span>WhatsApp number</span>
                <input
                  type="tel"
                  value={draft.staffWhatsApp}
                  maxLength={20}
                  placeholder="+27821234567"
                  onChange={(event) =>
                    updateField(
                      "staffWhatsApp",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="hub-field hub-field--wide">
                <span>Brand colour</span>
                <input
                  type="color"
                  value={draft.accent}
                  onChange={(event) =>
                    updateField(
                      "accent",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>

            <div className="hub-club-id-preview">
              <span>Field identity</span>
              <strong>
                {draft.logoText} ·{" "}
                {draft.name || "Your Field"}
              </strong>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <HomePage_HUB_LogoGenerator
            clubDraft={venueIdentity}
            logoDraft={logoDraft}
            onChange={setLogoDraft}
          />
        ) : null}

        {errorText ? (
          <div className="hub-error-box">
            {errorText}
          </div>
        ) : null}

        <footer className="hub-modal__footer">
          <button
            type="button"
            className="hub-secondary-button"
            disabled={
              submitting ||
              Boolean(createdVenueId)
            }
            onClick={() =>
              step === 1
                ? resetAndClose()
                : setStep((current) =>
                    Math.max(1, current - 1)
                  )
            }
          >
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              className="hub-primary-button"
              disabled={submitting}
              onClick={() =>
                goToStep(
                  Math.min(3, step + 1)
                )
              }
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="hub-primary-button"
              disabled={submitting}
              onClick={createField}
            >
              {submitting
                ? "Creating Field..."
                : createdVenueId
                  ? "Finish Field setup"
                  : "Create Field/Venue"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
