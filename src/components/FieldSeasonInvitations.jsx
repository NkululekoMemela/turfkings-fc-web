import { createPortal } from "react-dom";
import {
  FIELD_GAME_FORMATS, fieldSeasonHasPlayRecords,
  fieldSeasonRegistrationOpen, fieldSeasonProjectedPrizes,
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

function invitationDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "To be confirmed";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function SeasonDialog({ title, children, busy, onClose, premium = false, logoUrl = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("input, select, textarea, button")?.focus();
    return () => previous?.isConnected && previous.focus?.();
  }, []);
  return createPortal(
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
              {logoUrl
                ? <img src={logoUrl} alt="" className="field-invitation-logo"
                    onError={event => {
                      event.currentTarget.style.display = "none";
                    }} />
                : <span>🔔</span>}
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
    </div>,
    document.body
  );
}

export function FieldSeasonStartModal({
  venue, season, onClose, onAnnounce = announceFieldSeason,
  isPractice = false,
}) {
  const [name, setName] = useState(season?.name || "Field League Season");
  const [date, setDate] = useState(season?.startsOn || "");
  const [startTime, setStartTime] = useState(season?.scheduleSettings?.startTime || "18:00");
  const [matchMinutes, setMatchMinutes] = useState(String(season?.scheduleSettings?.matchMinutes || 40));
  const [halftimeMinutes, setHalftimeMinutes] = useState(String(season?.scheduleSettings?.halftimeMinutes ?? 5));
  const [turnaroundMinutes, setTurnaroundMinutes] = useState(String(season?.scheduleSettings?.turnaroundMinutes ?? 5));
  const [fee, setFee] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minimum, setMinimum] = useState("3");
  const [firstIncrease, setFirstIncrease] = useState("0");
  const [secondIncrease, setSecondIncrease] = useState("0");
  const [thirdIncrease, setThirdIncrease] = useState("0");
  const [firstPrize, setFirstPrize] = useState("");
  const [secondPrize, setSecondPrize] = useState("");
  const [thirdPrize, setThirdPrize] = useState("");
  const [gameFormat, setGameFormat] = useState(season?.gameFormat || "5_V_5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);

  return (
    <SeasonDialog premium title={sent ? "Invitations sent" : "Announce your season"}
      busy={busy} onClose={onClose}>
      {sent ? (
        <>
          <p>{sent} member Clubs have received an invitation.</p>
          <p>{isPractice
            ? "Sandbox captains have accepted. No real Clubs were contacted."
            : "Their administrators can sign up from their Club entry page."}</p>
          <button type="button" className="primary-btn" onClick={onClose}>Done</button>
        </>
      ) : (
        <form onInvalidCapture={event => {
          const details = event.target.closest("details");
          if (details) details.open = true;
        }} onSubmit={async event => {
          event.preventDefault();
          if (busy) return;
          setBusy(true); setError("");
          try {
            setSent(await onAnnounce({
              venueId: venue.id, name, startsOn: date,
              startTime, matchMinutes, halftimeMinutes, turnaroundMinutes,
              entryFee: fee, gameFormat, signupClosesOn: deadline,
              minimumClubs: minimum,
              prizeIncreasePerClub: {
                first: firstIncrease, second: secondIncrease, third: thirdIncrease,
              },
              prizes: { first: firstPrize, second: secondPrize, third: thirdPrize },
            }));
          } catch (failure) {
            setError(failure.message || "Could not announce this season.");
          } finally { setBusy(false); }
        }}>
          <p>Invite all member Clubs at {venue.name} to the upcoming season.</p>
          {[
            ["Season name", "text", name, setName],
            ["First match day", "date", date, setDate],
            ["First kickoff · SAST", "time", startTime, setStartTime],
            ["Match duration · total minutes", "number", matchMinutes, setMatchMinutes],
            ["Halftime break · minutes", "number", halftimeMinutes, setHalftimeMinutes],
            ["Between matches · minutes", "number", turnaroundMinutes, setTurnaroundMinutes],
            ["Signup deadline · closes at 23:59 SAST", "date", deadline, setDeadline],
            ["Minimum Clubs required", "number", minimum, setMinimum],
            ["Entry fee per Club (R)", "number", fee, setFee],
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
          <details className="field-season-details">
            <summary>Prizes & participation conditions</summary>
            <p>Base prizes apply when the minimum number of Clubs signs up.
              Each additional registered Club increases the prizes by the amounts below.</p>
            {[
              ["🥇 First prize", firstPrize, setFirstPrize, firstIncrease, setFirstIncrease],
              ["🥈 Second prize", secondPrize, setSecondPrize, secondIncrease, setSecondIncrease],
              ["🥉 Third prize", thirdPrize, setThirdPrize, thirdIncrease, setThirdIncrease],
            ].map(([label, base, setBase, increase, setIncrease]) => (
              <fieldset className="field-season-prize-row" key={label}>
                <legend>{label}</legend>
                <label>Base prize (R)
                  <input className="text-input" type="number" min="0" step=".01"
                    required disabled={busy} value={base}
                    onChange={event => setBase(event.target.value)} />
                </label>
                <label>Increase per extra Club (R)
                  <input className="text-input" type="number" min="0" step=".01"
                    required disabled={busy} value={increase}
                    onChange={event => setIncrease(event.target.value)} />
                </label>
              </fieldset>
            ))}
            <p>If fewer than {minimum || "the required number of"} Clubs sign up,
              the season cannot start and will need to be cancelled or revised
              by Field management.</p>
          </details>
          <p className="field-season-note">Registration closes at the deadline or when
            play begins, whichever comes first. Signup does not collect payment.</p>
          {error && <p role="alert" className="error-text">{error}</p>}
          <div className="actions-row">
            <button type="button" className="secondary-btn" disabled={busy}
              onClick={onClose}>Cancel</button>
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? "Sending invitations…" : "Open Registration & Invite Clubs"}
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
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
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

  useEffect(() => {
    const reopen = event => {
      const target = event.detail;
      if (target?.clubId !== clubId ||
          target?.venueId !== venue?.id ||
          target?.seasonId !== season?.id) return;
      setDismissed(previous => previous.filter(value => value !== key));
      setError("");
      setNow(Date.now());
    };
    window.addEventListener("field-season-invitation-open", reopen);
    return () => window.removeEventListener("field-season-invitation-open", reopen);
  }, [clubId, venue?.id, season?.id, key]);
  if (!canManageClubField(club, user) ||
      !fieldSeasonRegistrationOpen(season, now) ||
      invitation?.status !== "pending") return null;

  const storageKey = `field-season-invitation-seen:${clubId}:${key}`;
  let previouslySeen = false;
  try { previouslySeen = localStorage.getItem(storageKey) === "yes"; } catch {}
  const later = () => {
    try { localStorage.setItem(storageKey, "yes"); } catch {}
    setDismissed(previous => [...previous, key]); setError("");
  };
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
            try { localStorage.removeItem(storageKey); } catch {}
            setDismissed(previous => previous.filter(value => value !== key));
            setError("");
          }}>
          <span aria-hidden="true">🔔</span>
          <em className="tk-admin-notification-count">1</em>
        </button>
      </div>
      {!previouslySeen && !dismissed.includes(key) && (
      <SeasonDialog title="Your Club is invited" premium busy={busy} onClose={later}
        logoUrl={venue.branding?.logoUrl || venue.logoUrl || venue.image || ""}>
      <div className="field-invite-intro">
        <span>{venue.name}</span>
        <h3>{season.name}</h3>
        <p>An invitation for {club?.name || "your Club"}</p>
      </div>
      <div className="field-invite-facts">
        <div><span>Starts</span>
          <strong>{invitationDate(season.startsOn)}</strong></div>
        <div><span>Sign up by</span>
          <strong>{season.signupClosesOn
            ? invitationDate(season.signupClosesOn) : "Before play begins"}</strong>
          {season.signupClosesOn && <small>23:59 SAST</small>}</div>
        <div><span>Entry per Club</span>
          <strong>{money(season.entryFee)}</strong></div>
        <div><span>Format</span>
          <strong>{FIELD_GAME_FORMATS.find(
            ([value]) => value === season.gameFormat
          )?.[1] || "To be confirmed"}</strong></div>
      </div>
      <details className="field-season-details">
        <summary>Prizes & season details</summary>
        {["first", "second", "third"].map((place, index) => (
          <p key={place}>{["🥇 First", "🥈 Second", "🥉 Third"][index]} place:
            <strong> {money(fieldSeasonProjectedPrizes(
              season, (season.clubIds || []).length
            )[place])}</strong>
          </p>
        ))}
        <p>Minimum required: <strong>{season.minimumClubs || 3} Clubs</strong>.
          Registered so far: <strong>{(season.clubIds || []).length}</strong>.</p>
        <p>Below the minimum, the season cannot start.
          Field management must cancel or revise it.</p>
        {season.prizeIncreasePerClub && (
          <p>For each additional registered Club above the minimum, prizes increase by
            {" "}{money(season.prizeIncreasePerClub.first)} for first place,
            {" "}{money(season.prizeIncreasePerClub.second)} for second and
            {" "}{money(season.prizeIncreasePerClub.third)} for third.</p>
        )}
        <p>Registration closes at the deadline or when play begins,
          whichever comes first.</p>
      </details>
      <p className="field-invite-note">Confirm your Club’s place. Payment is separate.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="actions-row">
        <button type="button" className="tk-admin-notification-primary" disabled={busy}
          onClick={() => respond("accepted")}>{busy ? "Saving…" : "Sign up Club"}</button>
        <button type="button" className="tk-admin-notification-secondary" disabled={busy}
          onClick={later}>Not now</button>
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

export function FieldSeasonEndModal({
  venue, season, onClose, scope = null,
}) {
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
            scope,
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
