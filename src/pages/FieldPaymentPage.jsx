import {fieldTeamPaymentRequest} from "../storage/fieldTeamPaymentRepository.js";
import { calculateLateBookingFee } from "../../functions/lateBookingPolicy.mjs";
import { getActiveFirebaseFunctionsBaseUrl } from "../firebaseConfig.js";
// src/pages/PaymentPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { activeFirebaseProjectId, db } from "../firebaseConfig";
// import { getClubDoc, CLUB_COLLECTIONS } from "../core/clubFirestorePaths";

import {
  getClubDoc,
  getScopedMatchSignupDoc,
} from "../core/clubFirestorePaths";
import { CLUB_COLLECTIONS } from "../core/clubPaths";
import { getClubPaymentSettings } from "../core/payments/paymentSettingsRepository";
import {
  canUseExternalPayments,
  canUsePlatformPayments,
  PAYMENT_PROVIDERS,
  resolveClubPaymentSettings,
} from "../core/payments/paymentProviders";

const COST_PER_GAME_DEFAULT = 65;
const FUNCTIONS_REGION = "us-central1";

function formatCurrency(value) {
  const amount = Number(value || 0);
  const rounded = Math.round(amount);
  const hasCents = Math.abs(amount - rounded) >= 0.005;
  return `R${hasCents ? amount.toFixed(2) : rounded.toFixed(0)}`;
}

function firstNameOf(value) {
  return (
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] || "Player"
  );
}

function buildReferenceLabel(name) {
  return `5s-${firstNameOf(name)}`;
}

function slugFromLooseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueWeeks(value) {
  return Array.from(new Set(ensureArray(value)));
}

function weeksKey(value) {
  return uniqueWeeks(value).slice().sort().join("|");
}

function buildSignupDocId({
  activeSeasonId,
  displayName,
  selectedWeeks,
  paymentForMode,
  secondDisplayName,
  secondSelectedWeeks,
}) {
  const season = String(activeSeasonId || "season").trim();
  const player = slugFromLooseName(displayName || "player");
  const weeksJoined = uniqueWeeks(selectedWeeks).slice().sort().join("_");
  const mode = String(paymentForMode || "self").trim();
  const secondPlayer = slugFromLooseName(secondDisplayName || "none");
  const secondWeeksJoined = uniqueWeeks(secondSelectedWeeks)
    .slice()
    .sort()
    .join("_");

  return `${season}__${player}__${mode}__${secondPlayer}__${weeksJoined || "none"}__${secondWeeksJoined || "none"}`;
}

function derivePaymentStatus(amountDue, amountPaid, fallbackStatus = "unpaid") {
  const due = Number(amountDue || 0);
  const paid = Number(amountPaid || 0);

  if (due <= 0) return "not_selected";
  if (paid >= due && due > 0) return "paid";
  if (paid > 0 && paid < due) return "part_paid";
  return String(fallbackStatus || "unpaid");
}

function getFunctionsBaseUrl() {
  return getActiveFirebaseFunctionsBaseUrl({});
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export default function FieldPaymentPage({
  venue, clubId = "", paymentContext, onBack, onDone,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [error, setError] = useState("");
  const [slowPaymentMessage, setSlowPaymentMessage] = useState("");
  const [showPaymentBreakdown, setShowPaymentBreakdown] = useState(false);
  const [receivedTotals, setReceivedTotals] = useState({});

  const actionLock = React.useRef(false);
  const generation = React.useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    let sequence = 0;
    let activeRequest = null;
    setData(null);
    setLoading(true);
    setError("");

    async function refresh() {
      const request = ++sequence;
      activeRequest?.abort();
      activeRequest = new AbortController();
      const signal = activeRequest.signal;
      try {
        const result = await fieldTeamPaymentRequest(
          venue.id, "paymentView", {clubId}, signal
        );
        if (controller.signal.aborted || signal.aborted ||
            generation.current !== current || request !== sequence) return;
        setData(result);
        setError("");
      } catch (failure) {
        if (!controller.signal.aborted && !signal.aborted &&
            generation.current === current && request === sequence) {
          setError(failure.message);
        }
      } finally {
        if (!controller.signal.aborted && generation.current === current &&
            request === sequence) setLoading(false);
      }
    }

    const focus = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(focus, 30000);
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      activeRequest?.abort();
      ++sequence;
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [venue.id, clubId]);

  const selectedIds = paymentContext?.fieldBookings?.map(item => item.id) || [];
  const bookings = (data?.bookings || []).filter(item =>
    item.status !== "cancelled" &&
    (!selectedIds.length || selectedIds.includes(item.id))
  );
  const primaryDisplayName = data?.club?.name || venue.name;
  const effectiveMode = "self";
  const effectiveSecondDisplayName = "";
  const effectiveTotalGamesSelected = bookings.length;
  const amountPaid = bookings.reduce((sum, item) => sum + item.amountPaidCents, 0) / 100;
  const amountToPayNow = bookings.reduce((sum, item) =>
    sum + Math.max(0, item.amountDueCents - item.amountPaidCents), 0
  ) / 100;
  const captainContributionToPayNow = amountToPayNow;
  const fanmBookingFee = 0;
  const lateBookingFee = {amount: 0, lateGameCount: 0};
  const isFullyPaid = bookings.length > 0 && amountToPayNow === 0;
  const awaitingVerification = bookings.some(item => item.awaitingVerification);
  const paymentStatus = isFullyPaid ? "paid" : amountPaid > 0 ? "part_paid" : "pending";
  const paymentStatusLabel = awaitingVerification ? "Awaiting Field confirmation"
    : isFullyPaid ? "Paid" : amountPaid > 0 ? "Part paid" : "Pending";

  async function confirmFieldReceipt(booking) {
    if (actionLock.current || !data?.isAdmin) return;
    const value = String(receivedTotals[booking.id] ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value)) {
      setError("Enter the total received with up to two decimal places.");
      return;
    }
    const [whole, fraction = ""] = value.split(".");
    const receivedCents = Number(whole) * 100 +
      Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(receivedCents)) {
      setError("Enter a valid received amount.");
      return;
    }
    if (!window.confirm(
      `Confirm ${formatCurrency(receivedCents / 100)} received in total for ` +
      `${booking.clubName}, reference ${booking.reference}?`
    )) return;

    actionLock.current = true;
    const current = generation.current;
    setCreatingCheckout(true);
    setError("");
    try {
      await fieldTeamPaymentRequest(venue.id, "verify", {
        bookingId: booking.id, receivedCents,
      });
      const result = await fieldTeamPaymentRequest(
        venue.id, "paymentView", {clubId}
      );
      if (generation.current === current) {
        setData(result);
        setSlowPaymentMessage("Field receipt confirmed.");
      }
    } catch (failure) {
      if (generation.current === current) setError(failure.message);
    } finally {
      actionLock.current = false;
      if (generation.current === current) setCreatingCheckout(false);
    }
  }

  async function handlePayNow() {
    if (actionLock.current || !data?.canBook || amountToPayNow <= 0) return;
    actionLock.current = true;
    const current = generation.current;
    setCreatingCheckout(true);
    setError("");
    try {
      for (const booking of bookings) {
        if (booking.status !== "paid" && !booking.awaitingVerification) {
          await fieldTeamPaymentRequest(venue.id, "report", {bookingId: booking.id});
        }
      }
      const result = await fieldTeamPaymentRequest(
        venue.id, "paymentView", {clubId}
      );
      if (generation.current === current) {
        setData(result);
        setSlowPaymentMessage("Transfer reported. The Field must confirm receipt.");
        onDone?.();
      }
    } catch (failure) {
      if (generation.current === current) setError(failure.message);
    } finally {
      actionLock.current = false;
      if (generation.current === current) setCreatingCheckout(false);
    }
  }

  return (
    <div className="page payment-page">
      <section className="card payment-hero-card">
        <div className="payment-hero-top">
          <div>
            <h2>Payment</h2>
            <p className="muted">
              Pay your Club booking into the Field account.
            </p>
          </div>

          <button type="button" className="secondary-btn" onClick={onBack}>
            ← Back
          </button>
        </div>
      </section>

      {loading ? (
        <section className="card">
          <p className="muted">Loading...</p>
        </section>
      ) : error ? (
        <section className="card">
          <p className="muted">{error}</p>
        </section>
      ) : (
        <>
          <section className="card payment-grid-card">
            <div className="payment-panel payment-main-panel">
              <div className="payment-main-top">
                <div>
                  <h3>
                    {effectiveMode === "both"
                      ? `${primaryDisplayName} + ${effectiveSecondDisplayName || "Additional player"}`
                      : effectiveMode === "other"
                        ? effectiveSecondDisplayName || "Additional player"
                        : primaryDisplayName}
                  </h3>
                  <p className="muted small">
                    Reference: {bookings.map(item => item.reference).join(", ")}
                  </p>
                  <p className="muted small">
                    Your Club payment goes to {venue.name} for field booking.
                  </p>
                  <p className="muted small">
                    Transfer funds using the booking details below, then report your transfer.
                  </p>
                </div>

                <div className={`payment-status-pill is-${paymentStatus}`}>
                  {paymentStatusLabel}
                </div>
              </div>

              <div className="payment-total-block">
                <span className="payment-total-label">
                  {isFullyPaid ? "Already paid" : "Total due "}
                </span>
                <strong className="payment-total-value">
                  {isFullyPaid ? "✅" : formatCurrency(amountToPayNow)}
                </strong>
              </div>

              <button
                type="button"
                className="secondary-btn payment-breakdown-toggle"
                onClick={() => setShowPaymentBreakdown((value) => !value)}
                style={{ width: "100%", marginTop: 18, marginBottom: 18 }}
              >
                {showPaymentBreakdown ? "Hide payment breakdown" : "View payment breakdown"}
              </button>

              {showPaymentBreakdown ? (
                <div className="payment-summary-simple">
                  <div className="summary-row">
                    <span>Games selected</span>
                    <strong>{effectiveTotalGamesSelected}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Field contribution</span>
                    <strong>{formatCurrency(captainContributionToPayNow)}</strong>
                  </div>
                  {fanmBookingFee > 0 ? (
                    <div className="summary-row">
                      <span>Service fee</span>
                      <strong>{formatCurrency(fanmBookingFee)}</strong>
                    </div>
                  ) : null}
                  {lateBookingFee.amount > 0 && (
                    <div className="summary-row">
                      <span>Late booking fee ({lateBookingFee.lateGameCount} games)</span>
                      <strong>{formatCurrency(lateBookingFee.amount)}</strong>
                    </div>
                  )}
                  <div className="summary-row">
                    <span>Paid so far</span>
                    <strong>{formatCurrency(amountPaid)}</strong>
                  </div>
                  <div className="summary-row total-row">
                    <span>Total to pay</span>
                    <strong>{formatCurrency(amountToPayNow)}</strong>
                  </div>
                </div>
              ) : null}

              {bookings.map(booking => (
                <div className="payment-summary-simple" key={booking.id}>
                  <div className="summary-row"><span>{booking.label}</span>
                    <strong>{booking.reference}</strong></div>
                  {Object.entries(booking.bank || {}).map(([key, value]) =>
                    value ? <div className="summary-row" key={key}>
                      <span>{({
                        accountName: "Account holder", bankName: "Bank",
                        accountNumber: "Account number", branchCode: "Branch code",
                        accountType: "Account type",
                      })[key] || key}</span><strong>{value}</strong>
                    </div> : null
                  )}
                  <div className="summary-row"><span>Outstanding</span>
                    <strong>{formatCurrency(Math.max(0,
                      booking.amountDueCents - booking.amountPaidCents) / 100)}</strong>
                    <div className="summary-row">
                    <span>Club</span><strong>{booking.clubName}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Status</span><strong>{
                      booking.awaitingVerification ? "Awaiting confirmation"
                        : booking.status === "paid" ? "Paid"
                          : booking.status === "part_paid" ? "Part paid" : "Pending"
                    }</strong>
                  </div>
                  {data?.isAdmin && booking.status !== "paid" && (
                    <form onSubmit={event => {
                      event.preventDefault();
                      void confirmFieldReceipt(booking);
                    }}>
                      <label htmlFor={`received-${booking.id}`}>
                        Total received so far (R)
                      </label>
                      <input id={`received-${booking.id}`} type="text"
                        inputMode="decimal" required disabled={creatingCheckout}
                        placeholder={(booking.amountPaidCents / 100).toFixed(2)}
                        value={receivedTotals[booking.id] ?? ""}
                        onChange={event => setReceivedTotals(previous => ({
                          ...previous, [booking.id]: event.target.value,
                        }))} />
                      <button type="submit" className="primary-btn payment-action-btn"
                        disabled={creatingCheckout}>
                        Confirm receipt
                      </button>
                    </form>
                  )}
                </div>
                </div>
              ))}
              {!isFullyPaid ? (
                <button
                  type="button"
                  className="primary-btn payment-action-btn"
                  disabled={
                    creatingCheckout ||
                    amountToPayNow <= 0 ||
                    (!data?.canBook || awaitingVerification)
                  }
                  onClick={handlePayNow}
                >
                  {creatingCheckout
                    ? "Opening..."
                    : awaitingVerification
                      ? "Awaiting Field confirmation"
                      : "I have made the transfer"}
                </button>
              ) : (
                <div className="payment-paid-banner muted small">
                  You’ve already paid for these selected weeks.
                </div>
              )}

              <p className="muted small payment-help-text">
                {isFullyPaid
                  ? "No further payment is needed for the currently selected weeks."
                  : "A transfer report stays unpaid until the Field confirms receipt."}
              </p>

              {slowPaymentMessage ? (
                <p className="muted small payment-help-text">{slowPaymentMessage}</p>
              ) : null}
            </div>
          </section>

        </>
      )}
    </div>
  );
}