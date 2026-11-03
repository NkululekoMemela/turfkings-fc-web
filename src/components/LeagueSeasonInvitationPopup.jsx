import React, {useEffect, useRef, useState} from "react";
import {auth} from "../firebaseConfig.js";
import {respondSeasonInvitation} from "../storage/fieldSeasonSquadRepository.js";

export default function LeagueSeasonInvitationPopup({
  invitation, seasonName, scope, uid, onBusy, onLater, onResponded,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const panel = useRef(null);
  const amount = new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: "ZAR",
  }).format(Number(invitation.contributionCents) / 100);

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  async function respond(response) {
    if (working.current) return;
    if (auth.currentUser?.uid !== uid) {
      setError("Your account changed. Reopen the invitation.");
      return;
    }
    working.current = true;
    setBusy(true); setError(""); onBusy(true);
    try {
      await respondSeasonInvitation({
        ...scope, memberId: invitation.memberId, response,
      });
      if (auth.currentUser?.uid === uid) onResponded();
    } catch (failure) {
      if (auth.currentUser?.uid === uid) {
        setError(failure.message || "Could not respond to your invitation.");
      }
    } finally {
      working.current = false;
      setBusy(false); onBusy(false);
    }
  }

  function handleKeys(event) {
    if (event.key === "Escape" && !working.current) onLater();
    if (event.key !== "Tab") return;
    const buttons = [...panel.current.querySelectorAll("button")]
      .filter(button => !button.disabled);
    if (!buttons.length) {
      event.preventDefault();
      return;
    }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey &&
        (document.activeElement === first ||
         document.activeElement === panel.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey &&
        (document.activeElement === last ||
         document.activeElement === panel.current)) {
      event.preventDefault(); first.focus();
    }
  }

  return (
    <div className="modal-backdrop" style={{
      position: "fixed", inset: 0, zIndex: 12000,
      display: "grid", placeItems: "center", padding: 18,
      background: "rgba(2,6,23,.82)",
    }}>
      <section ref={panel} tabIndex={-1} role="dialog"
        aria-modal="true" aria-labelledby="league-invitation-title"
        aria-describedby="league-invitation-description"
        aria-busy={busy} onKeyDown={handleKeys}
        style={{
          width: "min(100%, 420px)", boxSizing: "border-box",
          maxHeight: "85dvh", overflowY: "auto", padding: 24,
          borderRadius: 24, border: "1px solid #a78bfa",
          background: "linear-gradient(145deg, #30214b, #111827)",
          color: "#f5f3ff", boxShadow: "0 24px 70px rgba(0,0,0,.5)",
        }}>
        <div aria-hidden="true" style={{fontSize: 32}}>🏆</div>
        <h2 id="league-invitation-title">You’re invited</h2>
        <p style={{fontWeight: 700, overflowWrap: "anywhere"}}>{seasonName}</p>
        <p>{invitation.fullName}, your captain has selected you for the league squad.</p>
        <div style={{
          padding: 18, borderRadius: 16,
          background: "rgba(167,139,250,.12)", margin: "18px 0",
        }}>
          <strong style={{fontSize: 30}}>{amount}</strong>
          <div>For the whole season</div>
        </div>
        <p id="league-invitation-description">
          Pay your Club captain. Your captain will confirm receipt in the app.
          Accepting this invitation does not mark you as paid.
        </p>
        {error && <p role="alert" style={{color: "#fca5a5"}}>{error}</p>}
        {busy && <p role="status">Saving your response…</p>}
        <div style={{display: "grid", gap: 10, marginTop: 20}}>
          <button type="button" className="primary-btn" disabled={busy}
            onClick={() => respond("accepted")}>Accept invitation</button>
          <button type="button" className="secondary-btn" disabled={busy}
            onClick={() => respond("declined")}>Decline</button>
          <button type="button" className="secondary-btn" disabled={busy}
            onClick={onLater}>Later</button>
        </div>
      </section>
    </div>
  );
}
