// src/pages/PaymentPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const PAYMENT_METHOD_LABEL = "Yoco";

const YOCO_PAYMENT_LINKS = {
  65: "https://pay.yoco.com/r/4kwJvy",
  130: "https://pay.yoco.com/r/2JkJn8",
  195: "https://pay.yoco.com/r/25lxOg",
  260: "https://pay.yoco.com/r/2AB0Lw",
  325: "https://pay.yoco.com/r/mRgEZQ",
};

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `R${amount.toFixed(0)}`;
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

function buildSignupDocId({ activeSeasonId, displayName, selectedWeeks }) {
  const season = String(activeSeasonId || "season").trim();
  const player = slugFromLooseName(displayName || "player");
  const weeksKey = (Array.isArray(selectedWeeks) ? selectedWeeks : [])
    .slice()
    .sort()
    .join("_");

  return `${season}__${player}__${weeksKey || "none"}`;
}

function getOutstandingAmount(signup) {
  const due = Number(signup?.amountDue || 0);
  const paid = Number(signup?.amountPaid || 0);
  return Math.max(0, due - paid);
}

function derivePaymentStatus(amountDue, amountPaid, fallbackStatus = "unpaid") {
  const due = Number(amountDue || 0);
  const paid = Number(amountPaid || 0);

  if (due <= 0) return "not_selected";
  if (paid >= due && due > 0) return "paid";
  if (paid > 0 && paid < due) return "part_paid";
  return String(fallbackStatus || "unpaid");
}

function getYocoPaymentUrl(amount) {
  return YOCO_PAYMENT_LINKS[Number(amount || 0)] || "";
}

export default function PaymentPage({
  paymentContext,
  identity,
  activeRole = "player",
  activeSeasonId,
  isAdmin = false,
  isCaptain = false,
  onBack,
  onDone,
}) {
  const baseDisplayName =
    identity?.shortName ||
    identity?.fullName ||
    identity?.displayName ||
    identity?.email ||
    "Player";

  const displayName = paymentContext?.displayName || baseDisplayName;

  const selectedWeeks = Array.isArray(paymentContext?.selectedWeeks)
    ? paymentContext.selectedWeeks
    : [];

  const amountDue = Number(
    paymentContext?.totalAmount || paymentContext?.amountDue || 0
  );

  const costPerGame = Number(paymentContext?.costPerGame || 65);

  const initialReference =
    paymentContext?.paymentReference || buildReferenceLabel(displayName);

  const signupDocId = useMemo(() => {
    const provided = String(paymentContext?.signupDocId || "").trim();
    if (provided) return provided;

    return buildSignupDocId({
      activeSeasonId,
      displayName,
      selectedWeeks,
    });
  }, [paymentContext, activeSeasonId, displayName, selectedWeeks]);

  const [signup, setSignup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [adminAmountPaid, setAdminAmountPaid] = useState("");
  const [adminStatus, setAdminStatus] = useState("pending");
  const [adminNote, setAdminNote] = useState("");

  const canVerifyPayments =
    isAdmin ||
    isCaptain ||
    activeRole === "admin" ||
    activeRole === "captain";

  useEffect(() => {
    if (!signupDocId) {
      setLoading(false);
      setSignup(null);
      setError("No payment record found.");
      return undefined;
    }

    setLoading(true);
    setError("");

    const ref = doc(db, "matchSignups", signupDocId);

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          const starterData = {
            signupDocId,
            activeSeasonId: String(activeSeasonId || "").trim(),
            displayName,
            shortName: firstNameOf(displayName),
            playerId:
              identity?.playerId ||
              identity?.memberId ||
              slugFromLooseName(displayName),
            selectedWeeks,
            amountDue,
            amountPaid: 0,
            paymentIntentAmount: 0,
            costPerGame,
            paymentMethod: PAYMENT_METHOD_LABEL,
            paymentReference: initialReference,
            adminNote: "",
            paymentStatus: amountDue > 0 ? "unpaid" : "not_selected",
            paymentLinkUrl: getYocoPaymentUrl(amountDue),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          try {
            await setDoc(ref, starterData, { merge: true });
          } catch (err) {
            console.error("Failed to create starter signup doc:", err);
            setError("Could not create payment record.");
            setLoading(false);
          }
          return;
        }

        const data = snap.data() || {};
        setSignup({ id: snap.id, ...data });
        setLoading(false);
      },
      (err) => {
        console.error("Failed to subscribe to payment signup:", err);
        setError("Failed to load payment record.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [
    signupDocId,
    activeSeasonId,
    displayName,
    identity,
    selectedWeeks,
    amountDue,
    costPerGame,
    initialReference,
  ]);

  useEffect(() => {
    if (!signup) return;

    setAdminAmountPaid(String(Number(signup.amountPaid || 0)));
    setAdminStatus(
      derivePaymentStatus(
        signup.amountDue,
        signup.amountPaid,
        signup.paymentStatus || "pending"
      )
    );
    setAdminNote(String(signup.adminNote || ""));
  }, [signup]);

  const effectiveSelectedWeeks = Array.isArray(signup?.selectedWeeks)
    ? signup.selectedWeeks
    : selectedWeeks;

  const effectiveAmountDue = Number(signup?.amountDue ?? amountDue ?? 0);
  const amountPaid = Number(signup?.amountPaid || 0);
  const outstandingAmount = getOutstandingAmount({
    amountDue: effectiveAmountDue,
    amountPaid,
  });

  const amountToPayNow = outstandingAmount || effectiveAmountDue;
  const yocoPaymentUrl = getYocoPaymentUrl(amountToPayNow);

  const paymentStatus = derivePaymentStatus(
    effectiveAmountDue,
    amountPaid,
    signup?.paymentStatus || "unpaid"
  );

  const paymentStatusLabel = useMemo(() => {
    if (paymentStatus === "paid") return "Paid";
    if (paymentStatus === "part_paid") return "Part paid";
    if (paymentStatus === "pending") return "Pending";
    if (paymentStatus === "not_selected") return "No games";
    return "Unpaid";
  }, [paymentStatus]);

  async function handlePayNow() {
    if (!signupDocId || amountToPayNow <= 0) return;

    if (!yocoPaymentUrl) {
      setError(
        `No Yoco payment link has been set up for ${formatCurrency(amountToPayNow)} yet.`
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const ref = doc(db, "matchSignups", signupDocId);

      await setDoc(
        ref,
        {
          signupDocId,
          activeSeasonId: String(activeSeasonId || "").trim(),
          displayName,
          shortName: firstNameOf(displayName),
          playerId:
            identity?.playerId ||
            identity?.memberId ||
            slugFromLooseName(displayName),
          selectedWeeks: effectiveSelectedWeeks,
          amountDue: effectiveAmountDue,
          costPerGame,
          paymentMethod: PAYMENT_METHOD_LABEL,
          paymentReference: buildReferenceLabel(displayName),
          paymentIntentAmount: amountToPayNow,
          paymentStatus: effectiveAmountDue > 0 ? "pending" : "not_selected",
          paymentSubmittedAt: serverTimestamp(),
          paymentLinkUrl: yocoPaymentUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      window.open(yocoPaymentUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed to start payment:", err);
      setError("Could not open payment.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyPayment() {
    if (!signupDocId) return;

    const verifiedAmount = Math.max(0, Number(adminAmountPaid || 0));
    const nextStatus = derivePaymentStatus(
      effectiveAmountDue,
      verifiedAmount,
      adminStatus
    );
    const note = String(adminNote || "").trim();
    const verifier =
      identity?.email ||
      identity?.displayName ||
      identity?.shortName ||
      "captain";

    setSaving(true);
    setError("");

    try {
      const ref = doc(db, "matchSignups", signupDocId);

      await setDoc(
        ref,
        {
          amountPaid: verifiedAmount,
          paymentStatus: nextStatus,
          adminNote: note,
          verifiedBy: verifier,
          verifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (typeof onDone === "function") onDone();
    } catch (err) {
      console.error("Failed to verify payment:", err);
      setError("Could not update payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page payment-page">
      <section className="card payment-hero-card">
        <div className="payment-hero-top">
          <div>
            <h2>Payment</h2>
            <p className="muted">Pay securely with Yoco.</p>
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
                  <h3>{displayName}</h3>
                  <p className="muted small">Reference: {buildReferenceLabel(displayName)}</p>
                </div>

                <div className={`payment-status-pill is-${paymentStatus}`}>
                  {paymentStatusLabel}
                </div>
              </div>

              <div className="payment-total-block">
                <span className="payment-total-label">Amount due</span>
                <strong className="payment-total-value">
                  {formatCurrency(amountToPayNow)}
                </strong>
              </div>

              <div className="payment-summary-simple">
                <div className="summary-row">
                  <span>Games selected</span>
                  <strong>{effectiveSelectedWeeks.length}</strong>
                </div>
                <div className="summary-row">
                  <span>Per game</span>
                  <strong>{formatCurrency(costPerGame)}</strong>
                </div>
                <div className="summary-row">
                  <span>Paid so far</span>
                  <strong>{formatCurrency(amountPaid)}</strong>
                </div>
                <div className="summary-row">
                  <span>Balance</span>
                  <strong>{formatCurrency(outstandingAmount)}</strong>
                </div>
              </div>

              {effectiveSelectedWeeks.length > 0 ? (
                <div className="payment-week-list">
                  {effectiveSelectedWeeks.map((weekId) => (
                    <div key={weekId} className="payment-week-chip">
                      {weekId}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No game dates selected yet.</p>
              )}

              <button
                type="button"
                className="primary-btn payment-action-btn"
                disabled={saving || amountToPayNow <= 0 || !yocoPaymentUrl}
                onClick={handlePayNow}
              >
                {saving ? "Opening..." : `Pay ${formatCurrency(amountToPayNow)}`}
              </button>

              <p className="muted small payment-help-text">
                You will pay on Yoco’s secure page. Once payment is seen in Yoco,
                your status here can be updated to paid.
              </p>
            </div>
          </section>

          {canVerifyPayments ? (
            <section className="card payment-admin-card">
              <h3>Verify payment</h3>

              <div className="payment-admin-grid">
                <label className="payment-label">
                  Amount paid
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="1"
                    value={adminAmountPaid}
                    onChange={(e) => setAdminAmountPaid(e.target.value)}
                  />
                </label>

                <label className="payment-label">
                  Status
                  <select
                    className="text-input"
                    value={adminStatus}
                    onChange={(e) => setAdminStatus(e.target.value)}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="pending">Pending</option>
                    <option value="part_paid">Part paid</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
              </div>

              <label className="payment-label">
                Note
                <textarea
                  className="text-input payment-textarea"
                  rows="3"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Optional"
                />
              </label>

              <div className="payment-admin-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={saving}
                  onClick={verifyPayment}
                >
                  {saving ? "Saving..." : "Save"}
                </button>

                <button type="button" className="secondary-btn" onClick={onDone}>
                  Done
                </button>
              </div>
            </section>
          ) : (
            <section className="card payment-footer-card">
              <button type="button" className="primary-btn" onClick={onDone}>
                Done
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}