import "./ClubBookingSettings.css";
import React, { useEffect, useState } from "react";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { normalizeLateBookingPolicy } from "../../functions/lateBookingPolicy.mjs";

export default function ClubBookingSettings({ clubId, settings, defaultLimit }) {
  const [limit, setLimit] = useState(defaultLimit);
  const [enabled, setEnabled] = useState(false);
  const [fee, setFee] = useState(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLimit(settings?.maxPlayers ?? defaultLimit);
    setEnabled(settings?.lateBookingFee?.enabled === true);
    setFee(settings?.lateBookingFee?.feePerGame ?? 7);
  }, [settings, defaultLimit]);

  async function save(event) {
    event.preventDefault();
    const settingsPanel = event.currentTarget.closest("details");
    setBusy(true);
    setMessage("");
    try {
      const maxPlayers = Number(limit);
      if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 100) {
        throw new Error("Choose a player limit between 1 and 100.");
      }
      const lateBookingFee = normalizeLateBookingPolicy({
        enabled, feePerGame: fee, deadlineDay: 30,
      });
      const ref = doc(db, "clubs", clubId);
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("Club could not be found.");
        transaction.update(ref, {
          bookingSettings: {
            ...(snapshot.data().bookingSettings || {}),
            maxPlayers,
            lateBookingFee,
          },
          updatedAt: serverTimestamp(),
        });
      });
      setMessage("Booking settings saved.");
      if (settingsPanel) {
        settingsPanel.open = false;
        settingsPanel.querySelector("summary")?.focus();
      }
    } catch (error) {
      setMessage(error.message || "Could not save booking settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card signup-summary-card club-booking-settings">
      <summary className="club-booking-settings__header" tabIndex={0}>
        <span className="club-booking-settings__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M5 7h14M5 17h14M8 4v6M16 14v6"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="8" cy="7" r="3" fill="currentColor" />
            <circle cx="16" cy="17" r="3" fill="currentColor" />
          </svg>
        </span>
        <span className="club-booking-settings__heading">
          <span className="club-booking-settings__eyebrow">ADMIN CONTROLS</span>
          <strong>Booking settings</strong>
          <small>Manage squad capacity and late bookings</small>
        </span>
        <span className="club-booking-settings__badge">
          {settings?.maxPlayers ?? defaultLimit} places
        </span>
        <span className="club-booking-settings__chevron" aria-hidden="true">⌄</span>
      </summary>

      <form onSubmit={save} className="club-booking-settings__form">
        <div className="club-booking-settings__grid">
          <div className="club-booking-settings__tile">
            <label htmlFor="club-booking-capacity">Squad capacity</label>
            <p>Maximum players per regular game</p>
            <div className="club-booking-settings__input-wrap">
              <input id="club-booking-capacity" type="number"
                min="1" max="100" required value={limit}
                onChange={event => setLimit(event.target.value)} disabled={busy} />
              <span>players</span>
            </div>
            <small>Existing bookings stay confirmed. Challenges use their own limits.</small>
          </div>

          <div className="club-booking-settings__tile">
            <div className="club-booking-settings__fee-heading">
              <label htmlFor="club-booking-fee-enabled">Late booking fee</label>
              <label className="club-booking-settings__switch">
                <input id="club-booking-fee-enabled" type="checkbox"
                  role="switch" checked={enabled} disabled={busy}
                  onChange={event => setEnabled(event.target.checked)} />
                <span aria-hidden="true" />
              </label>
            </div>
            <p>{enabled ? "Active for late unpaid games" : "Off · no late fee applied"}</p>
            <div className="club-booking-settings__input-wrap">
              <span>R</span>
              <input aria-label="Late booking fee in rand per game"
                type="number" min="0" max="1000" step="0.01" required
                value={fee} onChange={event => setFee(event.target.value)}
                disabled={busy} />
              <span>per game</span>
            </div>
            <small>Separate from the service fee. Paid games receive no extra charge.</small>
          </div>
        </div>

        <div className="club-booking-settings__deadline">
          <span aria-hidden="true">◷</span>
          <div>
            <strong>Monthly deadline · 23:59 SAST</strong>
            <p>The 30th of the preceding month, or its last day when shorter.
              Late bookings depend on availability.</p>
          </div>
        </div>

        <div className="club-booking-settings__footer">
          <span>Applies to this Club</span>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
        {message && <p className="club-booking-settings__message" role="status">{message}</p>}
      </form>
    </details>
  );
}
