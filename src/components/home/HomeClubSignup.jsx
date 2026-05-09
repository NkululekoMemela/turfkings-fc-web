// src/components/home/HomeClubSignup.jsx

import React, { useMemo, useState } from "react";
import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../../firebaseConfig";

function slugifyClubName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/--+/g, "-");
}

const ACCENT_OPTIONS = [
  "#22c55e",
  "#38bdf8",
  "#f97316",
  "#facc15",
  "#ef4444",
  "#a855f7",
];

export default function HomeClubSignup({
  onClose,
  onClubCreated,
}) {
  const [clubName, setClubName] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [weeklyPlayTime, setWeeklyPlayTime] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [accent, setAccent] = useState("#22c55e");

  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const clubId = useMemo(
    () => slugifyClubName(clubName),
    [clubName]
  );

  async function handleSubmit(event) {
    event.preventDefault();

    setErrorText("");
    setSuccessText("");

    if (!clubName.trim()) {
      setErrorText("Club name is required.");
      return;
    }

    if (!captainName.trim()) {
      setErrorText("Captain name is required.");
      return;
    }

    if (!captainEmail.trim()) {
      setErrorText("Captain email is required.");
      return;
    }

    try {
      setSubmitting(true);

      const clubRef = doc(db, "clubs", clubId);

      await setDoc(
        clubRef,
        {
          id: clubId,
          name: clubName.trim(),
          location: location.trim(),
          area: area.trim(),
          weeklyPlayTime: weeklyPlayTime.trim(),
          accent,
          members: 1,
          activity: "New club",
          clubRating: "Unranked",
          helpNeeded: 0,
          logoText: clubName.trim().slice(0, 2).toUpperCase(),
          createdAt: serverTimestamp(),
          createdBy: captainEmail.trim().toLowerCase(),
          description: "",
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "clubs", clubId, "state", "main"),
        {
          activeMatch: null,
          createdAt: serverTimestamp(),
          seasonStatus: "setup",
          signupOpen: true,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "clubs", clubId, "members", captainEmail.trim().toLowerCase()),
        {
          name: captainName.trim(),
          email: captainEmail.trim().toLowerCase(),
          role: "captain",
          joinedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSuccessText(`${clubName} created successfully.`);

      onClubCreated?.({
        id: clubId,
        name: clubName,
      });

    } catch (error) {
      console.error(error);
      setErrorText("Failed to create club.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="fanm-section fanm-club-signup"
      id="register"
    >
      <div className="fanm-section-head">
        <div>
          <span className="fanm-kicker">
            Club registration
          </span>

          <h2>Create your football club</h2>
        </div>

        <p>
          Set up your club identity and begin inviting players.
        </p>
      </div>

      <form
        className="fanm-club-signup-form"
        onSubmit={handleSubmit}
      >
        <div className="fanm-signup-grid">
          <label>
            <span>Club name</span>

            <input
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="Turf Kings FC"
            />
          </label>

          <label>
            <span>Location</span>

            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Cape Town, Southern Suburbs"
            />
          </label>

          <label>
            <span>Area</span>

            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Claremont"
            />
          </label>

          <label>
            <span>Weekly play time</span>

            <input
              value={weeklyPlayTime}
              onChange={(e) => setWeeklyPlayTime(e.target.value)}
              placeholder="Wednesdays · 19:00"
            />
          </label>

          <label>
            <span>Captain name</span>

            <input
              value={captainName}
              onChange={(e) => setCaptainName(e.target.value)}
              placeholder="Nkululeko"
            />
          </label>

          <label>
            <span>Captain email</span>

            <input
              type="email"
              value={captainEmail}
              onChange={(e) => setCaptainEmail(e.target.value)}
              placeholder="captain@email.com"
            />
          </label>
        </div>

        <div className="fanm-accent-picker">
          <span>Club accent</span>

          <div className="fanm-accent-options">
            {ACCENT_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                className={`fanm-accent-dot ${
                  accent === color ? "is-active" : ""
                }`}
                style={{ background: color }}
                onClick={() => setAccent(color)}
              />
            ))}
          </div>
        </div>

        <div className="fanm-signup-preview">
          <strong>Club ID</strong>
          <span>{clubId || "club-id-preview"}</span>
        </div>

        {errorText ? (
          <div className="fanm-signup-error">
            {errorText}
          </div>
        ) : null}

        {successText ? (
          <div className="fanm-signup-success">
            {successText}
          </div>
        ) : null}

        <div className="fanm-signup-actions">
          <button
            type="submit"
            className="fanm-nav-primary"
            disabled={submitting}
          >
            {submitting
              ? "Creating club..."
              : "Create club"}
          </button>

          <button
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}