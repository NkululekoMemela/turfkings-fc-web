import React, {useEffect, useState} from "react";

const money = cents => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR",
}).format(cents / 100);

export default function FieldTeamPaymentCard({
  booking, isAdmin, busy, onReport, onVerify,
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [received, setReceived] = useState(
    (booking.amountPaidCents / 100).toFixed(2)
  );
  useEffect(() => {
    setReceived((booking.amountPaidCents / 100).toFixed(2));
  }, [booking.amountPaidCents]);

  const remaining = Math.max(0, booking.amountDueCents - booking.amountPaidCents);
  const paid = booking.status === "paid";
  const cancelled = booking.status === "cancelled";
  const statusLabel = cancelled ? "Cancelled" : paid ? "Paid"
    : booking.awaitingVerification ? "Awaiting Field confirmation"
      : booking.status === "part_paid" ? "Part paid" : "Payment pending";

  return (
    <section className="card payment-grid-card">
      <div className="payment-panel payment-main-panel">
        <div className="payment-main-top">
          <div>
            <h3>{booking.clubName}</h3>
            <p className="muted small">{booking.label}</p>
            <p className="muted small">Reference: {booking.reference}</p>
            <p className="muted small">
              Your payment goes to {booking.venueName} for Field booking.
            </p>
          </div>
          <div className={`payment-status-pill is-${paid ? "paid" : "pending"}`}>
            {statusLabel}
          </div>
        </div>
        <div className="payment-total-block">
          <span className="payment-total-label">{paid ? "Already paid" : "Total due"}</span>
          <strong className="payment-total-value">{paid ? "✅" : money(remaining)}</strong>
        </div>
        <button type="button" className="secondary-btn payment-breakdown-toggle"
          onClick={() => setShowBreakdown(value => !value)}
          style={{width: "100%", marginTop: 18, marginBottom: 18}}>
          {showBreakdown ? "Hide payment breakdown" : "View payment breakdown"}
        </button>
        {showBreakdown && (
          <div className="payment-summary-simple">
            <div className="summary-row">
              <span>Field booking</span><strong>{money(booking.amountDueCents)}</strong>
            </div>
            <div className="summary-row">
              <span>Paid so far</span><strong>{money(booking.amountPaidCents)}</strong>
            </div>
            <div className="summary-row total-row">
              <span>Total to pay</span><strong>{money(remaining)}</strong>
            </div>
          </div>
        )}
        {!cancelled && !paid && (
          <div className="payment-summary-simple">
            {[
              ["Account holder", booking.bank.accountName],
              ["Bank", booking.bank.bankName],
              ["Account number", booking.bank.accountNumber],
              ["Branch code", booking.bank.branchCode],
              ["Payment reference", booking.reference],
            ].map(([label, value]) => (
              <div className="summary-row" key={label}>
                <span>{label}</span>
                <strong style={{overflowWrap: "anywhere"}}>{value}</strong>
              </div>
            ))}
            {isAdmin ? (
              <div className="form-row">
                <label htmlFor={`received-${booking.id}`}>
                  Total received so far (R)
                </label>
                <input id={`received-${booking.id}`} inputMode="decimal"
                  disabled={busy} value={received}
                  onChange={event => setReceived(event.target.value)} />
                <button type="button" className="primary-btn" disabled={busy}
                  onClick={() => onVerify(booking, received)}>
                  Confirm receipt
                </button>
              </div>
            ) : (
              <button type="button" className="primary-btn"
                disabled={busy || booking.awaitingVerification}
                onClick={() => onReport(booking)}>
                {booking.awaitingVerification
                  ? "Awaiting Field confirmation" : "I have made the transfer"}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
