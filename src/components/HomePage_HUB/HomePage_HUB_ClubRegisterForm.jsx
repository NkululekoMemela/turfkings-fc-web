// src/components/HomePage_HUB/HomePage_HUB_ClubRegisterForm.jsx

import React, { useMemo } from "react";
import HomePage_HUB_GoogleVenueInput from "./HomePage_HUB_GoogleVenueInput";
import {
  getClubInitials,
  slugifyClubName,
} from "../../core/homePageHubLogoUtils";

const PLAY_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function HomePage_HUB_ClubRegisterForm({
  clubDraft,
  onChange,
}) {
  const clubId = useMemo(
    () => slugifyClubName(clubDraft?.clubName),
    [clubDraft?.clubName]
  );

  const initials = useMemo(
    () => getClubInitials(clubDraft?.clubName),
    [clubDraft?.clubName]
  );

  function handleVenueSelected(place) {
    const nextDraft = {
      ...(clubDraft || {}),
      venueName: place?.venueName || clubDraft?.venueName || "",
      address: place?.address || "",
      suburb: place?.suburb || "",
      city: place?.city || "",
      province: place?.province || clubDraft?.province || "",
      country: place?.country || "South Africa",
      latitude: place?.latitude || null,
      longitude: place?.longitude || null,
      googlePlaceId: place?.placeId || "",
      locationDetails: {
        venueName: place?.venueName || clubDraft?.venueName || "",
        address: place?.address || "",
        fullAddress: place?.address || "",
        displayLocation:
          [place?.suburb, place?.city].filter(Boolean).join(", ") ||
          place?.address ||
          place?.venueName ||
          "",
        suburb: place?.suburb || "",
        city: place?.city || "",
        province: place?.province || clubDraft?.province || "",
        country: place?.country || "South Africa",
        latitude: place?.latitude || null,
        longitude: place?.longitude || null,
        placeId: place?.placeId || "",
      },
    };

    onChange?.(nextDraft);
  }

  function updateField(field, value) {
    const cleanValue =
      field === "clubName"
        ? String(value || "").slice(0, 16)
        : String(value || "");

    const nextDraft = {
      ...(clubDraft || {}),
      [field]: cleanValue,
    };

    const city = String(nextDraft.city || "").trim().toLowerCase();
    const province = String(nextDraft.province || "").trim().toLowerCase();

    if (field === "clubName") {
      nextDraft.clubId = slugifyClubName(cleanValue);
      nextDraft.logoText = getClubInitials(cleanValue);
    }

    if (city === "cape town") {
      nextDraft.province = nextDraft.province || "Western Cape";
      nextDraft.country = nextDraft.country || "South Africa";
    }

    if (province === "western cape") {
      nextDraft.country = nextDraft.country || "South Africa";
    }

    if (
      nextDraft.playDay &&
      nextDraft.playTime
    ) {
      nextDraft.weeklyPlayTime =
        `${nextDraft.playDay}s · ${nextDraft.playTime}`;
    }

    onChange?.(nextDraft);
  }

  return (
    <div className="hub-form-panel">
      <div className="hub-form-panel__head">
        <span>Step 1</span>

        <h3>Club details</h3>

        <p>
          Add the venue location and playing time.
        </p>
      </div>

      <div className="hub-form-grid">
        <label className="hub-field hub-field--wide">
          <span>Club name</span>

          <input
            value={clubDraft?.clubName || ""}
            maxLength={16}
            onChange={(event) =>
              updateField(
                "clubName",
                event.target.value.slice(0, 16)
              )
            }
            placeholder="Farmers FC"
          />
        </label>

        <label className="hub-field hub-field--wide">
          <span>Venue name</span>
          <small className="hub-field-hint">Start with the venue name. Google venue search will plug in here.</small>

          <HomePage_HUB_GoogleVenueInput
            value={clubDraft?.venueName || ""}
            onTextChange={(value) => updateField("venueName", value)}
            onPlaceSelected={handleVenueSelected}
          />

          {clubDraft?.latitude && clubDraft?.longitude ? (
            <small className="hub-venue-verification-note hub-venue-verification-note--good">
              Location captured from Google. Please confirm this is the exact pitch or venue where your club plays.
            </small>
          ) : (
            <small className="hub-venue-verification-note">
              Select the closest Google venue result so FANM can save the exact address and map coordinates.
            </small>
          )}
        </label>
<label className="hub-field">
          <span>Suburb</span>

          <input
            value={clubDraft?.suburb || ""}
            onChange={(event) =>
              updateField(
                "suburb",
                event.target.value
              )
            }
            placeholder="Wynberg"
          />
        </label>

        <label className="hub-field">
          <span>City</span>

          <input
            value={clubDraft?.city || ""}
            onChange={(event) =>
              updateField(
                "city",
                event.target.value
              )
            }
            placeholder="Cape Town"
          />
        </label>

        <label className="hub-field">
          <span>Country</span>

          <input
            value={clubDraft?.country || ""}
            onChange={(event) =>
              updateField(
                "country",
                event.target.value
              )
            }
            placeholder="South Africa"
          />
        </label>

        <label className="hub-field">
          <span>Playing day</span>

          <select
            className="hub-select"
            value={clubDraft?.playDay || ""}
            onChange={(event) =>
              updateField(
                "playDay",
                event.target.value
              )
            }
          >
            <option value="">
              Select day
            </option>

            {PLAY_DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>

        <label className="hub-field">
          <span>Playing time</span>

          <input
            type="time"
            value={clubDraft?.playTime || ""}
            onChange={(event) =>
              updateField(
                "playTime",
                event.target.value
              )
            }
          />
        </label>

        <label className="hub-field">
          <span>First name</span>

          <input
            value={clubDraft?.founderFirstName || ""}
            maxLength={20}
            onChange={(event) =>
              updateField(
                "founderFirstName",
                event.target.value
              )
            }
            placeholder="Nkululeko"
          />
        </label>

        <label className="hub-field">
          <span>Surname</span>

          <input
            value={clubDraft?.founderSurname || ""}
            maxLength={24}
            onChange={(event) =>
              updateField(
                "founderSurname",
                event.target.value
              )
            }
            placeholder="Memela"
          />
        </label>

        <label className="hub-field">
          <span>Email / Gmail</span>

          <input
            type="email"
            value={clubDraft?.captainEmail || ""}
            maxLength={64}
            onChange={(event) =>
              updateField(
                "captainEmail",
                event.target.value
              )
            }
            placeholder="captain@gmail.com"
          />
        </label>

        <label className="hub-field">
          <span>WhatsApp number</span>

          <input
            type="tel"
            value={clubDraft?.captainWhatsApp || ""}
            maxLength={20}
            onChange={(event) =>
              updateField(
                "captainWhatsApp",
                event.target.value
              )
            }
            placeholder="+27821234567"
          />
        </label>
      </div>

      <div className="hub-club-id-preview">
        <span>Club ID</span>

        <strong>
          {clubId || initials}
        </strong>
      </div>
    </div>
  );
}