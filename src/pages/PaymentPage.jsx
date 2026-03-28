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
const COST_PER_GAME_DEFAULT = 65;
const FUNCTIONS_REGION = "us-central1";

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
  const viteEnv =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env
      : {};

  const explicit = String(viteEnv.VITE_FUNCTIONS_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const projectId = String(viteEnv.VITE_FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) return "";

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    return `http://127.0.0.1:5001/${projectId}/${FUNCTIONS_REGION}`;
  }

  return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
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

  const rawPrimarySelectedWeeks = paymentContext?.selectedWeeks || [];
  const rawSecondSelectedWeeks =
    paymentContext?.secondSelectedWeeks ||
    paymentContext?.additionalSelectedWeeks ||
    paymentContext?.beneficiarySelectedWeeks ||
    [];

  const rawPrimaryPaidWeeks =
    paymentContext?.primaryPaidWeeks ||
    paymentContext?.paidWeeks ||
    paymentContext?.alreadyPaidWeeks ||
    [];

  const rawSecondPaidWeeks =
    paymentContext?.secondPaidWeeks ||
    paymentContext?.additionalPaidWeeks ||
    paymentContext?.beneficiaryPaidWeeks ||
    [];

  const primarySelectedWeeksKey = weeksKey(rawPrimarySelectedWeeks);
  const secondSelectedWeeksKey = weeksKey(rawSecondSelectedWeeks);
  const primaryPaidWeeksKey = weeksKey(rawPrimaryPaidWeeks);
  const secondPaidWeeksKey = weeksKey(rawSecondPaidWeeks);

  const primarySelectedWeeks = useMemo(
    () => uniqueWeeks(rawPrimarySelectedWeeks),
    [primarySelectedWeeksKey]
  );

  const secondSelectedWeeks = useMemo(
    () => uniqueWeeks(rawSecondSelectedWeeks),
    [secondSelectedWeeksKey]
  );

  const contextPrimaryPaidWeeks = useMemo(
    () => uniqueWeeks(rawPrimaryPaidWeeks),
    [primaryPaidWeeksKey]
  );

  const contextSecondPaidWeeks = useMemo(
    () => uniqueWeeks(rawSecondPaidWeeks),
    [secondPaidWeeksKey]
  );

  const primaryDisplayName = paymentContext?.displayName || baseDisplayName;
  const primaryPlayerId =
    paymentContext?.playerId ||
    identity?.playerId ||
    identity?.memberId ||
    identity?.uid ||
    slugFromLooseName(primaryDisplayName);

  const currentUserId =
    identity?.uid ||
    identity?.userId ||
    identity?.playerId ||
    identity?.memberId ||
    "";

  const paymentForMode =
    paymentContext?.paymentForMode ||
    paymentContext?.mode ||
    (secondSelectedWeeks.length > 0 ? "both" : "self");

  const secondDisplayName =
    paymentContext?.secondDisplayName ||
    paymentContext?.additionalPlayerName ||
    paymentContext?.beneficiaryDisplayName ||
    paymentContext?.beneficiaryName ||
    "";

  const secondPlayerId =
    paymentContext?.secondPlayerId ||
    paymentContext?.additionalPlayerId ||
    paymentContext?.beneficiaryPlayerId ||
    slugFromLooseName(secondDisplayName || "");

  const secondEmail =
    paymentContext?.secondEmail ||
    paymentContext?.beneficiaryEmail ||
    paymentContext?.additionalPlayerEmail ||
    "";

  const costPerGame = Number(paymentContext?.costPerGame || COST_PER_GAME_DEFAULT);

  const contextGamesSelected =
    primarySelectedWeeks.length + secondSelectedWeeks.length;

  const fallbackAmountDue = contextGamesSelected * costPerGame;
  const contextAmountDue = Number(
    paymentContext?.totalAmount || paymentContext?.amountDue || fallbackAmountDue || 0
  );

  const initialReference =
    paymentContext?.paymentReference || buildReferenceLabel(primaryDisplayName);

  const signupDocId = useMemo(() => {
    const provided = String(paymentContext?.signupDocId || "").trim();
    if (provided) return provided;

    return buildSignupDocId({
      activeSeasonId,
      displayName: primaryDisplayName,
      selectedWeeks: primarySelectedWeeks,
      paymentForMode,
      secondDisplayName,
      secondSelectedWeeks,
    });
  }, [
    activeSeasonId,
    primaryDisplayName,
    primarySelectedWeeksKey,
    paymentForMode,
    secondDisplayName,
    secondSelectedWeeksKey,
    paymentContext?.signupDocId,
  ]);

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
          const starterPrimaryPaidWeeks = contextPrimaryPaidWeeks;
          const starterSecondPaidWeeks = contextSecondPaidWeeks;

          const starterUnpaidPrimaryWeeks = primarySelectedWeeks.filter(
            (w) => !starterPrimaryPaidWeeks.includes(w)
          );
          const starterUnpaidSecondWeeks = secondSelectedWeeks.filter(
            (w) => !starterSecondPaidWeeks.includes(w)
          );
          const starterUnpaidGames =
            starterUnpaidPrimaryWeeks.length + starterUnpaidSecondWeeks.length;
          const starterAmountDue = starterUnpaidGames * costPerGame;

          const starterData = {
            signupDocId,
            activeSeasonId: String(activeSeasonId || "").trim(),
            displayName: primaryDisplayName,
            shortName: firstNameOf(primaryDisplayName),
            playerId: primaryPlayerId,
            userId: currentUserId || "",
            selectedWeeks: primarySelectedWeeks,
            primaryPaidWeeks: starterPrimaryPaidWeeks,
            paidWeeks: starterPrimaryPaidWeeks,
            secondDisplayName: secondDisplayName || "",
            secondPlayerId: secondPlayerId || "",
            secondEmail: secondEmail || "",
            secondSelectedWeeks,
            secondPaidWeeks: starterSecondPaidWeeks,
            totalGamesSelected: contextGamesSelected,
            paymentForMode,
            amountDue: starterAmountDue,
            amountPaid:
              (starterPrimaryPaidWeeks.length + starterSecondPaidWeeks.length) * costPerGame,
            paymentIntentAmount: 0,
            costPerGame,
            paymentMethod: PAYMENT_METHOD_LABEL,
            paymentReference: initialReference,
            adminNote: "",
            paymentStatus: starterAmountDue > 0 ? "unpaid" : "paid",
            paymentLinkUrl: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          try {
            await setDoc(ref, starterData, { merge: true });
            setSignup({ id: signupDocId, ...starterData });
            setLoading(false);
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
    primaryDisplayName,
    primaryPlayerId,
    currentUserId,
    primarySelectedWeeksKey,
    secondDisplayName,
    secondPlayerId,
    secondEmail,
    secondSelectedWeeksKey,
    contextGamesSelected,
    paymentForMode,
    costPerGame,
    initialReference,
    primaryPaidWeeksKey,
    secondPaidWeeksKey,
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
  }, [
    signup?.id,
    signup?.amountDue,
    signup?.amountPaid,
    signup?.paymentStatus,
    signup?.adminNote,
  ]);

  const effectivePrimaryWeeks = uniqueWeeks(signup?.selectedWeeks || primarySelectedWeeks);
  const effectiveSecondWeeks = uniqueWeeks(
    signup?.secondSelectedWeeks || secondSelectedWeeks
  );

  const effectivePrimaryPaidWeeks = uniqueWeeks(
    signup?.primaryPaidWeeks ||
      signup?.paidWeeks ||
      contextPrimaryPaidWeeks
  );

  const effectiveSecondPaidWeeks = uniqueWeeks(
    signup?.secondPaidWeeks || contextSecondPaidWeeks
  );

  const unpaidPrimaryWeeks = effectivePrimaryWeeks.filter(
    (w) => !effectivePrimaryPaidWeeks.includes(w)
  );

  const unpaidSecondWeeks = effectiveSecondWeeks.filter(
    (w) => !effectiveSecondPaidWeeks.includes(w)
  );

  const unpaidTotalGames =
    unpaidPrimaryWeeks.length + unpaidSecondWeeks.length;

  const effectiveTotalGamesSelected =
    effectivePrimaryWeeks.length + effectiveSecondWeeks.length;

  const recomputedFullAmount =
    effectiveTotalGamesSelected * costPerGame;

  const paidAmountFromWeeks =
    (effectivePrimaryPaidWeeks.length + effectiveSecondPaidWeeks.length) * costPerGame;

  const storedAmountPaid = Number(signup?.amountPaid || 0);
  const amountPaid = Math.max(storedAmountPaid, paidAmountFromWeeks);

  const effectiveAmountDue =
    effectiveTotalGamesSelected > 0
      ? recomputedFullAmount
      : Number(signup?.amountDue ?? contextAmountDue ?? 0);

  const amountToPayNow = unpaidTotalGames * costPerGame;
  const isFullyPaid = effectiveTotalGamesSelected > 0 && amountToPayNow === 0;

  const effectiveMode =
    signup?.paymentForMode ||
    (effectiveSecondWeeks.length > 0 ? "both" : paymentForMode || "self");

  const effectiveSecondDisplayName =
    signup?.secondDisplayName || secondDisplayName || "";

  const paymentStatus = isFullyPaid
    ? "paid"
    : derivePaymentStatus(
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

    const functionsBaseUrl = getFunctionsBaseUrl();
    if (!functionsBaseUrl) {
      setError(
        "Functions base URL is missing. Set VITE_FIREBASE_PROJECT_ID or VITE_FUNCTIONS_BASE_URL."
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
          displayName: primaryDisplayName,
          shortName: firstNameOf(primaryDisplayName),
          playerId: primaryPlayerId,
          userId: currentUserId || "",
          selectedWeeks: effectivePrimaryWeeks,
          primaryPaidWeeks: effectivePrimaryPaidWeeks,
          paidWeeks: effectivePrimaryPaidWeeks,
          secondDisplayName: effectiveSecondDisplayName,
          secondPlayerId: secondPlayerId || "",
          secondEmail: secondEmail || "",
          secondSelectedWeeks: effectiveSecondWeeks,
          secondPaidWeeks: effectiveSecondPaidWeeks,
          totalGamesSelected: effectiveTotalGamesSelected,
          paymentForMode: effectiveMode,
          amountDue: effectiveAmountDue,
          amountPaid,
          costPerGame,
          paymentMethod: PAYMENT_METHOD_LABEL,
          paymentReference: buildReferenceLabel(primaryDisplayName),
          paymentIntentAmount: amountToPayNow,
          paymentStatus: amountToPayNow > 0 ? "pending" : "paid",
          paymentSubmittedAt: serverTimestamp(),
          unpaidPrimaryWeeks,
          unpaidSecondWeeks,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : "";

      const { ok, data } = await postJson(
        `${functionsBaseUrl}/createYocoCheckout`,
        {
          signupDocId,
          activeSeasonId: String(activeSeasonId || "").trim(),
          userId: currentUserId || "",
          playerId: primaryPlayerId,
          displayName: primaryDisplayName,
          secondDisplayName: effectiveSecondDisplayName,
          secondPlayerId: secondPlayerId || "",
          secondEmail: secondEmail || "",
          paymentForMode: effectiveMode,
          selectedWeeks: effectivePrimaryWeeks,
          secondSelectedWeeks: effectiveSecondWeeks,
          primaryPaidWeeks: effectivePrimaryPaidWeeks,
          secondPaidWeeks: effectiveSecondPaidWeeks,
          unpaidPrimaryWeeks,
          unpaidSecondWeeks,
          costPerGame,
          paymentReference: buildReferenceLabel(primaryDisplayName),
          returnUrl,
          successUrl: returnUrl
            ? `${returnUrl}?paymentStatus=success&signupDocId=${encodeURIComponent(signupDocId)}`
            : "",
          cancelUrl: returnUrl
            ? `${returnUrl}?paymentStatus=cancel&signupDocId=${encodeURIComponent(signupDocId)}`
            : "",
          failureUrl: returnUrl
            ? `${returnUrl}?paymentStatus=failure&signupDocId=${encodeURIComponent(signupDocId)}`
            : "",
        }
      );

      if (!ok) {
        throw new Error(data?.error || "Could not create Yoco checkout.");
      }

      if (data?.alreadyPaid) {
        setSaving(false);
        return;
      }

      const redirectUrl = String(data?.redirectUrl || "").trim();
      if (!redirectUrl) {
        throw new Error("Yoco checkout did not return a redirect URL.");
      }

      window.location.assign(redirectUrl);
    } catch (err) {
      console.error("Failed to start payment:", err);
      setError(err?.message || "Could not open payment.");
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
                  <h3>
                    {effectiveMode === "both"
                      ? `${primaryDisplayName} + ${effectiveSecondDisplayName || "Additional player"}`
                      : effectiveMode === "other"
                        ? effectiveSecondDisplayName || "Additional player"
                        : primaryDisplayName}
                  </h3>
                  <p className="muted small">
                    Reference: {buildReferenceLabel(primaryDisplayName)}
                  </p>
                </div>

                <div className={`payment-status-pill is-${paymentStatus}`}>
                  {paymentStatusLabel}
                </div>
              </div>

              <div className="payment-total-block">
                <span className="payment-total-label">
                  {isFullyPaid ? "Already paid" : "Total due"}
                </span>
                <strong className="payment-total-value">
                  {isFullyPaid ? "✅" : formatCurrency(amountToPayNow)}
                </strong>
              </div>

              <div className="payment-summary-simple">
                <div className="summary-row">
                  <span>Games selected</span>
                  <strong>{effectiveTotalGamesSelected}</strong>
                </div>
                <div className="summary-row">
                  <span>Cost per game</span>
                  <strong>{formatCurrency(costPerGame)}</strong>
                </div>
                <div className="summary-row">
                  <span>Paid so far</span>
                  <strong>{formatCurrency(amountPaid)}</strong>
                </div>
                <div className="summary-row total-row">
                  <span>Balance</span>
                  <strong>{formatCurrency(amountToPayNow)}</strong>
                </div>
              </div>

              {!isFullyPaid ? (
                <button
                  type="button"
                  className="primary-btn payment-action-btn"
                  disabled={saving || amountToPayNow <= 0}
                  onClick={handlePayNow}
                >
                  {saving ? "Opening..." : `Pay ${formatCurrency(amountToPayNow)}`}
                </button>
              ) : (
                <div className="payment-paid-banner muted small">
                  You’ve already paid for these selected weeks.
                </div>
              )}

              <p className="muted small payment-help-text">
                {isFullyPaid
                  ? "No further payment is needed for the currently selected weeks."
                  : "You will be redirected to Yoco’s secure payment page in the same tab."}
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