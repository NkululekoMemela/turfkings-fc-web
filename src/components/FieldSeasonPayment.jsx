import React, {useState} from "react";
import {
  createSeasonCheckout, getSeasonSquadView,
} from "../storage/fieldSeasonSquadRepository.js";

const money = cents => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR",
}).format(cents / 100);

export default function FieldSeasonPayment({
  scope, invitation, paymentPage = false, onOpenPayment, onBack,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  if (!invitation) return null;

  const paid = alreadyPaid || invitation.paymentStatus === "paid";
  const contribution = Number(invitation.contributionCents);
  const fee = invitation.platformFeePaymentStatus === "paid" ? 0 : 7900;
  const total = contribution + fee;
  const accepted = invitation.invitationStatus === "accepted";
  const enabled = scope.clubId === "turf-kings";

  async function pay() {
    if (busy || paid || !accepted) return;
    setBusy(true); setError("");
    try {
      const fresh = await getSeasonSquadView(scope);
      const booking = fresh.invitation ||
        fresh.squad?.entries?.[invitation.memberId];
      if (!booking || booking.memberId !== invitation.memberId) {
        throw new Error("Your booking has changed. Return to your league.");
      }
      if (booking.paymentStatus === "paid") {
        setAlreadyPaid(true);
        return;
      }
      if (booking.invitationStatus !== "accepted") {
        throw new Error("Accept your invitation before paying.");
      }
      const result = await createSeasonCheckout({
        ...scope, memberId: invitation.memberId,
      });
      if (!result.redirectUrl) throw new Error("Checkout did not return a link.");
      window.location.assign(result.redirectUrl);
    } catch (failure) {
      setError(failure.message || "Could not open checkout.");
    } finally {
      setBusy(false);
    }
  }

  if (!paymentPage) {
    if (paid) return <p role="status"><strong>Paid</strong></p>;
    if (invitation.invitationStatus === "declined") return null;
    if (!accepted) return null;
    if (!enabled) return <p className="muted small">
      Online payments are not enabled for this Club yet.
    </p>;
    return (
      <button type="button" className="primary-btn" onClick={onOpenPayment}>
        Go to payment
      </button>
    );
  }

  return (
    <div className="page payment-page">
      <section className="card payment-hero-card">
        <div className="payment-hero-top">
          <div>
            <h2>Payment</h2>
            <p className="muted">Whole-season league booking.</p>
          </div>
          <button type="button" className="secondary-btn"
            disabled={busy} onClick={onBack}>← Back</button>
        </div>
      </section>
      <section className="card">
        <h3>{invitation.fullName}</h3>
        {paid ? <p role="status">
          <strong>Paid</strong> · Your club contribution is confirmed.
        </p> : (
          <>
            <dl style={{
              display: "grid", gridTemplateColumns: "1fr auto", gap: 14,
            }}>
              <dt>Club season contribution</dt>
              <dd style={{margin: 0}}>{money(contribution)}</dd>
              <dt>Platform fee · whole season</dt>
              <dd style={{margin: 0}}>{money(fee)}</dd>
              <dt><strong>Total payable</strong></dt>
              <dd style={{margin: 0}}><strong>{money(total)}</strong></dd>
            </dl>
            <button type="button" className="primary-btn"
              disabled={busy || !accepted || !enabled} onClick={pay}>
              {busy ? "Opening secure checkout…" : `Pay ${money(total)}`}
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
