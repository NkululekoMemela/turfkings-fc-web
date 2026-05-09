// src/components/HomePage_HUB/HomePage_HUB_ClubRegisterForm.jsx

import React, { useMemo } from "react";
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

  function updateField(field, value) {
    const nextDraft = {
      ...(clubDraft || {}),
      [field]: value,
    };

    if (field === "clubName") {
      nextDraft.clubId = slugifyClubName(value);
      nextDraft.logoText = getClubInitials(value);
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
            onChange={(event) =>
              updateField(
                "clubName",
                event.target.value
              )
            }
            placeholder="Farmers FC"
          />
        </label>

        <label className="hub-field hub-field--wide">
          <span>Venue name</span>

          <input
            value={clubDraft?.venueName || ""}
            onChange={(event) =>
              updateField(
                "venueName",
                event.target.value
              )
            }
            placeholder="Wynberg Military Base 5s"
          />
        </label>

        <label className="hub-field hub-field--wide">
          <span>Full venue address</span>

          <input
            value={clubDraft?.address || ""}
            onChange={(event) =>
              updateField(
                "address",
                event.target.value
              )
            }
            placeholder="Wynberg, Cape Town"
          />
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
          <span>Province</span>

          <input
            value={clubDraft?.province || ""}
            onChange={(event) =>
              updateField(
                "province",
                event.target.value
              )
            }
            placeholder="Western Cape"
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
          <span>Captain name</span>

          <input
            value={clubDraft?.captainName || ""}
            onChange={(event) =>
              updateField(
                "captainName",
                event.target.value
              )
            }
            placeholder="Captain name"
          />
        </label>

        <label className="hub-field">
          <span>Captain email</span>

          <input
            type="email"
            value={
              clubDraft?.captainEmail || ""
            }
            onChange={(event) =>
              updateField(
                "captainEmail",
                event.target.value
              )
            }
            placeholder="captain@email.com"
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