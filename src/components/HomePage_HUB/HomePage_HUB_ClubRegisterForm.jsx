// src/components/homeHub/HomePage_HUB_ClubRegisterForm.jsx

import React, { useMemo } from "react";
import { getClubInitials, slugifyClubName } from "../../core/homePageHubLogoUtils";

const ACCENT_OPTIONS = ["#16a34a", "#2563eb", "#f97316", "#7c3aed", "#dc2626", "#0891b2"];

export default function HomePage_HUB_ClubRegisterForm({ clubDraft, onChange }) {
  const clubId = useMemo(() => slugifyClubName(clubDraft?.clubName), [clubDraft?.clubName]);
  const initials = useMemo(() => getClubInitials(clubDraft?.clubName), [clubDraft?.clubName]);

  function updateField(field, value) {
    onChange?.({
      ...(clubDraft || {}),
      [field]: value,
      clubId: field === "clubName" ? slugifyClubName(value) : clubId,
      logoText: field === "clubName" ? getClubInitials(value) : initials,
    });
  }

  return (
    <div className="hub-form-panel">
      <div className="hub-form-panel__head">
        <span>Step 1</span>
        <h3>Club details</h3>
        <p>Keep it simple. The club can edit deeper settings later.</p>
      </div>

      <div className="hub-form-grid">
        <label className="hub-field hub-field--wide">
          <span>Club name</span>
          <input
            value={clubDraft?.clubName || ""}
            onChange={(event) => updateField("clubName", event.target.value)}
            placeholder="Example: Farmers FC"
          />
        </label>

        <label className="hub-field">
          <span>Where do you play?</span>
          <input
            value={clubDraft?.location || ""}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="Cape Town, Claremont"
          />
        </label>

        <label className="hub-field">
          <span>Play day/time</span>
          <input
            value={clubDraft?.weeklyPlayTime || ""}
            onChange={(event) => updateField("weeklyPlayTime", event.target.value)}
            placeholder="Wednesdays · 19:00"
          />
        </label>

        <label className="hub-field">
          <span>Captain name</span>
          <input
            value={clubDraft?.captainName || ""}
            onChange={(event) => updateField("captainName", event.target.value)}
            placeholder="Captain name"
          />
        </label>

        <label className="hub-field">
          <span>Captain email</span>
          <input
            type="email"
            value={clubDraft?.captainEmail || ""}
            onChange={(event) => updateField("captainEmail", event.target.value)}
            placeholder="captain@email.com"
          />
        </label>
      </div>

      <div className="hub-accent-row">
        <span>Club accent</span>
        <div>
          {ACCENT_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              className={clubDraft?.accent === color ? "is-selected" : ""}
              style={{ background: color }}
              onClick={() => updateField("accent", color)}
              aria-label={`Choose ${color} accent`}
            />
          ))}
        </div>
      </div>

      <div className="hub-club-id-preview">
        <span>Club ID</span>
        <strong>{clubId || "club-id-preview"}</strong>
      </div>
    </div>
  );
}
