import {
  FIELD_GAME_FORMATS, fieldSeasonHasPlayRecords,
} from "../core/fieldSeasonLifecycle.js";
import { endVenueSeason } from "../storage/leagueSeasonRepository.js";
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
    ref.current?.querySelector("input, select, textarea, button")?.focus();
    return () => previous?.isConnected && previous.focus?.();
  }, []);
  return (
    <div className="field-season-backdrop" style={backdropStyle} onKeyDown={event => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key === "Tab") {
        const elements = [...ref.current.querySelectorAll(
          "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)"
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
  const [firstPrize, setFirstPrize] = useState("");
  const [secondPrize, setSecondPrize] = useState("");
  const [thirdPrize, setThirdPrize] = useState("");
  const [gameFormat, setGameFormat] = useState(season?.gameFormat || "5_V_5");
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
              entryFee: fee, gameFormat,
              prizes: { first: firstPrize, second: secondPrize, third: thirdPrize },
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
            ["First place prize (R)", "number", firstPrize, setFirstPrize],
            ["Second place prize (R)", "number", secondPrize, setSecondPrize],
            ["Third place prize (R)", "number", thirdPrize, setThirdPrize],
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
          <label style={{ display: "grid", gap: ".3rem", margin: ".8rem 0" }}>
            League size
            <select className="text-input" value={gameFormat} disabled={busy}
              onChange={event => setGameFormat(event.target.value)}>
              {FIELD_GAME_FORMATS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
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
      <p>League size: <strong>{
        FIELD_GAME_FORMATS.find(([value]) => value === season.gameFormat)?.[1]
          || "To be confirmed by Field management"
      }</strong></p>
      {season.prizes ? (
        <div className="field-season-prizes">
          <p>🥇 First place: <strong>{money(season.prizes.first)}</strong></p>
          <p>🥈 Second place: <strong>{money(season.prizes.second)}</strong></p>
          <p>🥉 Third place: <strong>{money(season.prizes.third)}</strong></p>
        </div>
      ) : (
        <p>Prize money: <strong>{money(season.prizeMoney)}</strong></p>
      )}
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

export function FieldSeasonEndModal({ venue, season, onClose }) {
  const cancelling = !fieldSeasonHasPlayRecords(season);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = cancelling ? "Cancel Season" : "End Season";

  return (
    <SeasonDialog title={action} busy={busy} onClose={onClose}>
      <form onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try {
          await endVenueSeason({
            venueId: venue.id, seasonId: season.id,
            mode: cancelling ? "cancel" : "complete",
            cancellationReason: reason,
          });
          onClose();
        } catch (failure) {
          setError(failure.message || "Could not close this season.");
        } finally { setBusy(false); }
      }}>
        <p>{cancelling
          ? "No play is recorded. Cancel this season with an explanation, such as insufficient Club signups."
          : "Archive the completed season. End every completed Match Day first."
        }</p>
        <p>The season remains in the archive and a new draft season is created.</p>
        {cancelling && (
          <label style={{ display: "grid", gap: ".4rem", margin: "1rem 0" }}>
            Cancellation reason
            <textarea className="text-input" rows={4}
              value={reason} required minLength={10} maxLength={500}
              disabled={busy} placeholder="Explain why the season is being cancelled"
              onChange={event => setReason(event.target.value)} />
          </label>
        )}
        <label style={{ display: "grid", gap: ".4rem", margin: "1rem 0" }}>
          Type {venue.name} to confirm
          <input className="text-input" value={confirmation}
            disabled={busy} autoComplete="off"
            onChange={event => setConfirmation(event.target.value)} />
        </label>
        {error && <p role="alert" className="error-text">{error}</p>}
        <div className="actions-row">
          <button type="button" className="secondary-btn"
            disabled={busy} onClick={onClose}>Go back</button>
          <button type="submit" className="primary-btn" disabled={
            busy || confirmation.trim() !== venue.name?.trim()
            || (cancelling && reason.trim().length < 10)
          }>{busy ? "Saving…" : action}</button>
        </div>
      </form>
    </SeasonDialog>
  );
}
