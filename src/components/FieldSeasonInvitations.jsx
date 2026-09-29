import "./FieldSeasonInvitations.css";
import React, { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";
import { canManageClubField } from "../storage/clubFieldMembershipRepository.js";
import {
  announceFieldSeason, respondToFieldSeason,
} from "../storage/fieldSeasonInvitationRepository.js";

const backdropStyle = {
  position: "fixed", inset: 0, zIndex: 11000,
  background: "rgba(2,6,23,.85)", display: "grid",
  placeItems: "center", padding: "1rem", overflowY: "auto",
};
const cardStyle = {
  width: "min(100%, 480px)", maxHeight: "90dvh", overflowY: "auto",
  background: "#111827", color: "#fff", padding: "1.5rem",
  borderRadius: "22px", border: "1px solid rgba(251,191,36,.5)",
};
const money = value => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR",
}).format(Number(value) || 0);

function SeasonDialog({ title, children, busy, onClose, premium = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("input, button")?.focus();
    return () => previous?.isConnected && previous.focus?.();
  }, []);
  return (
    <div className="field-season-backdrop" style={backdropStyle} onKeyDown={event => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key === "Tab") {
        const elements = [...ref.current.querySelectorAll(
          "input:not(:disabled), button:not(:disabled)"
        )];
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    }}>
      <div ref={ref}
        className={`field-season-dialog ${premium ? "tk-admin-notification-card" : ""}`}
        style={premium ? {
          ...cardStyle,
          background: "radial-gradient(circle at top left, rgba(34,211,238,.22), transparent 36%), radial-gradient(circle at bottom right, rgba(34,197,94,.16), transparent 38%), linear-gradient(180deg, #0f172a, #020617)",
          border: "1px solid rgba(125,211,252,.34)",
        } : cardStyle}
        role="dialog" aria-modal="true" aria-label={title}>
        {premium ? (
          <div className="tk-admin-notification-topline">
            <span className="tk-admin-notification-icon" aria-hidden="true">
              <span>🔔</span>
            </span>
            <div className="tk-admin-notification-title-wrap">
              <div className="tk-admin-notification-title">{title}</div>
              <span className="tk-admin-notification-tag">Field season invitation</span>
            </div>
          </div>
        ) : <h2>{title}</h2>}
        <div className={premium ? "tk-admin-notification-body" : ""}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function FieldSeasonStartModal({ venue, season, onClose }) {
  const [name, setName] = useState(season?.name || "Field League Season");
  const [date, setDate] = useState(season?.startsOn || "");
  const [fee, setFee] = useState("");
  const [prize, setPrize] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);

  return (
    <SeasonDialog title={sent ? "Season invitations sent" : "Start Season"}
      busy={busy} onClose={onClose}>
      {sent ? (
        <>
          <p>{sent} member Clubs have received an invitation.</p>
          <p>Their administrators can sign up from their Club entry page.</p>
          <button type="button" className="primary-btn" onClick={onClose}>Done</button>
        </>
      ) : (
        <form onSubmit={async event => {
          event.preventDefault();
          if (busy) return;
          setBusy(true); setError("");
          try {
            setSent(await announceFieldSeason({
              venueId: venue.id, name, startsOn: date,
              entryFee: fee, prizeMoney: prize,
            }));
          } catch (failure) {
            setError(failure.message || "Could not announce this season.");
          } finally { setBusy(false); }
        }}>
          <p>Invite all member Clubs at {venue.name} to the upcoming season.</p>
          {[
            ["Season name", "text", name, setName],
            ["Season start date", "date", date, setDate],
            ["Entry fee per Club (R)", "number", fee, setFee],
            ["Prize money (R)", "number", prize, setPrize],
          ].map(([label, type, value, setter]) => (
            <label key={label} style={{ display: "grid", gap: ".3rem", margin: ".8rem 0" }}>
              {label}
              <input className="text-input" type={type} value={value}
                required disabled={busy} min={type === "number" ? 0 : undefined}
                step={type === "number" ? ".01" : undefined}
                maxLength={type === "text" ? 80 : undefined}
                onChange={event => setter(event.target.value)} />
            </label>
          ))}
          <p>Club signup confirms participation. It does not collect payment.</p>
          {error && <p role="alert" className="error-text">{error}</p>}
          <div className="actions-row">
            <button type="button" className="secondary-btn" disabled={busy}
              onClick={onClose}>Cancel</button>
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Start Season & Invite Clubs"}
            </button>
          </div>
        </form>
      )}
    </SeasonDialog>
  );
}

export function ClubFieldSeasonInvitation({ clubId }) {
  const [user, setUser] = useState(null);
  const [club, setClub] = useState(null);
  const [venue, setVenue] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    setClub(null); setVenue(null); setError(""); setDismissed([]);
    if (!clubId || !user?.uid) return undefined;
    let stopVenue = () => {};
    const stopClub = onSnapshot(doc(db, "clubs", clubId),
      snapshot => setClub(snapshot.data() || null),
      () => setClub(null));
    const stopMembership = onSnapshot(
      doc(db, "clubFieldMemberships", clubId),
      snapshot => {
        stopVenue(); setVenue(null);
        const membership = snapshot.data();
        if (membership?.status !== "active" || !membership.venueId) return;
        const venueId = membership.venueId;
        stopVenue = onSnapshot(doc(db, "leagueVenues", venueId),
          field => setVenue(field.exists() ? { ...field.data(), id: venueId } : null),
          () => setVenue(null));
      },
      () => { stopVenue(); setVenue(null); }
    );
    return () => { stopClub(); stopMembership(); stopVenue(); };
  }, [clubId, user?.uid]);

  const season = venue?.league?.activeSeason;
  const invitation = season?.invitations?.[clubId];
  const key = `${venue?.id}:${season?.id}`;
  if (!canManageClubField(club, user) ||
      !season?.announcedAtMs || season.registrationOpen !== true ||
      invitation?.status !== "pending") return null;

  const later = () => { setDismissed(previous => [...previous, key]); setError(""); };
  const respond = async status => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await respondToFieldSeason({
        venueId: venue.id, clubId, seasonId: season.id, status,
      });
    } catch (failure) {
      setError(failure.message || "Could not respond to this invitation.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="tk-admin-notification-dock field-season-notification-dock">
        <button type="button" className="tk-admin-notification-bell"
          aria-label="Open Field season invitation"
          title="Field season invitation"
          onClick={() => {
            setDismissed(previous => previous.filter(value => value !== key));
            setError("");
          }}>
          <span aria-hidden="true">🔔</span>
          <em className="tk-admin-notification-count">1</em>
        </button>
      </div>
      {!dismissed.includes(key) && (
      <SeasonDialog title="Your Club is invited" premium busy={busy} onClose={later}>
      <p><strong>{venue.name}</strong> invites {club?.name || "your Club"} to:</p>
      <h3>{season.name}</h3>
      <p>Season starts: <strong>{season.startsOn}</strong></p>
      <p>Entry fee per Club: <strong>{money(season.entryFee)}</strong></p>
      <p>Prize money: <strong>{money(season.prizeMoney)}</strong></p>
      <p>Sign up your Club and start mobilising your players.
        Signup confirms participation; it does not collect payment.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="actions-row">
        <button type="button" className="tk-admin-notification-primary" disabled={busy}
          onClick={() => respond("accepted")}>{busy ? "Saving…" : "Sign up Club"}</button>
        <button type="button" className="tk-admin-notification-secondary" disabled={busy}
          onClick={later}>Remind me later</button>
        <button type="button" className="tk-admin-notification-secondary" disabled={busy}
          onClick={() => {
            if (window.confirm("Decline this season invitation for your Club?")) {
              respond("declined");
            }
          }}>Decline</button>
      </div>
      </SeasonDialog>
      )}
    </>
  );
}
