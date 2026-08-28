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
  const viteEnv =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env
      : {};

  const explicit = String(viteEnv.VITE_FUNCTIONS_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const projectId = String(
    viteEnv.VITE_FIREBASE_PROJECT_ID || activeFirebaseProjectId || ""
  ).trim();
  if (!projectId) return "";

  const useFunctionsEmulator =
    String(viteEnv.VITE_USE_FUNCTIONS_EMULATOR || "").trim() === "true";

  if (
    useFunctionsEmulator &&
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
  activeClubId: explicitActiveClubId = "",
  isPracticeMode = false,
  practiceSessionId = null,
  dataScope = null,
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

  const activeClubId =
    String(
      explicitActiveClubId ||
        paymentContext?.activeClubId ||
        paymentContext?.clubId ||
        identity?.clubId ||
        "turf-kings"
    ).trim() || "turf-kings";

  // One resolver for every payment-state read/write.
  // Official keeps the historical club document.
  // Practice resolves into the disposable session sandbox.
  const matchSignupDocRef = (docId) =>
    isPracticeMode
      ? getScopedMatchSignupDoc(db, docId, dataScope)
      : getClubDoc(
          db,
          CLUB_COLLECTIONS.matchSignups,
          docId,
          activeClubId
        );

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
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [error, setError] = useState("");
  const [slowPaymentMessage, setSlowPaymentMessage] = useState("");
  const [showPaymentBreakdown, setShowPaymentBreakdown] = useState(false);
  const [clubPaymentSettings, setClubPaymentSettings] = useState(() =>
    resolveClubPaymentSettings({})
  );
  const [clubProfile, setClubProfile] = useState(null);

  const captainContributionPerGame = Number(
    paymentContext?.captainContributionPerGame ||
      paymentContext?.fieldContributionPerGame ||
      paymentContext?.captainRequiredContribution ||
      paymentContext?.baseCostPerGame ||
      paymentContext?.costPerGame ||
      COST_PER_GAME_DEFAULT
  );

  const platformUpliftPerGame = Number(
    clubPaymentSettings?.pricingModel?.serviceFeePerPlayer ?? 7.5
  );

  const playerChargePerGame = captainContributionPerGame + platformUpliftPerGame;
  const costPerGame = playerChargePerGame;

  const contextGamesSelected =
    primarySelectedWeeks.length + secondSelectedWeeks.length;

  const fallbackAmountDue = contextGamesSelected * costPerGame;
  const contextAmountDue = Number(
    paymentContext?.totalAmount || paymentContext?.amountDue || fallbackAmountDue || 0
  );

  const [adminAmountPaid, setAdminAmountPaid] = useState("");
  const [adminStatus, setAdminStatus] = useState("pending");
  const [adminNote, setAdminNote] = useState("");

  const canVerifyPayments =
    isAdmin ||
    isCaptain ||
    activeRole === "admin" ||
    activeRole === "captain";

  useEffect(() => {
    let cancelled = false;

    getClubPaymentSettings(activeClubId)
      .then((settings) => {
        if (!cancelled) {
          setClubPaymentSettings(settings);
        }
      })

    getDoc(doc(db, "clubs", activeClubId))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          setClubProfile(snap.data() || {});
        }
      })
      .catch((err) => {
        console.warn("Failed to load club profile for payment page:", err);
      })
      .catch((err) => {
        console.warn("Failed to load club payment settings:", err);
        if (!cancelled) {
          setClubPaymentSettings(resolveClubPaymentSettings({}));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeClubId]);

  const clubCanUsePlatformPayments = canUsePlatformPayments(clubPaymentSettings);
  const clubCanUseExternalPayments = canUseExternalPayments(clubPaymentSettings);

  const isTurfKingsYoco =
    activeClubId === "turf-kings" &&
    clubCanUsePlatformPayments &&
    clubPaymentSettings?.provider === PAYMENT_PROVIDERS.YOCO;

  const paymentMethodLabel = isTurfKingsYoco ? "Yoco" : "Online payment";

  const clubPaymentModeLabel = clubCanUsePlatformPayments
    ? `Online payments via ${String(clubPaymentSettings.provider || "platform")}`
    : clubCanUseExternalPayments
      ? "External collection by club/captain"
      : "Payments not active";

  const clubDisplayName =
    paymentContext?.clubName ||
    paymentContext?.activeClubName ||
    clubProfile?.name ||
    clubProfile?.clubName ||
    clubPaymentSettings?.clubName ||
    "your club";

  const captainPaymentName =
    paymentContext?.captainName ||
    paymentContext?.captainDisplayName ||
    paymentContext?.clubCaptainName ||
    clubProfile?.captainName ||
    clubProfile?.captain?.name ||
    clubProfile?.captain?.fullName ||
    clubProfile?.adminName ||
    clubProfile?.ownerName ||
    clubPaymentSettings?.captainName ||
    clubPaymentSettings?.captainDisplayName ||
    `${clubDisplayName} captain`;

  useEffect(() => {
    if (!signupDocId) {
      setLoading(false);
      setSignup(null);
      setError("No payment record found.");
      return undefined;
    }

    setLoading(true);
    setError("");

    const ref = matchSignupDocRef(signupDocId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSignup(null);
          setLoading(false);
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
    activeClubId,
    isPracticeMode,
    practiceSessionId,
    dataScope,
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
    signup?.primaryPaidWeeks || signup?.paidWeeks || contextPrimaryPaidWeeks
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

  const unpaidTotalGames = unpaidPrimaryWeeks.length + unpaidSecondWeeks.length;

  const effectiveTotalGamesSelected =
    effectivePrimaryWeeks.length + effectiveSecondWeeks.length;

  const recomputedFullAmount = effectiveTotalGamesSelected * costPerGame;

  const paidAmountFromWeeks =
    (effectivePrimaryPaidWeeks.length + effectiveSecondPaidWeeks.length) * costPerGame;

  const storedAmountPaid = Number(signup?.amountPaid || 0);
  const amountPaid = Math.max(storedAmountPaid, paidAmountFromWeeks);

  const effectiveAmountDue =
    effectiveTotalGamesSelected > 0
      ? recomputedFullAmount
      : Number(signup?.amountDue ?? contextAmountDue ?? 0);

  const amountToPayNow = unpaidTotalGames * costPerGame;
  const captainContributionToPayNow = unpaidTotalGames * captainContributionPerGame;
  const platformUpliftToPayNow = unpaidTotalGames * platformUpliftPerGame;
  const fanmBookingFee = platformUpliftToPayNow;
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
    if (!signupDocId || amountToPayNow <= 0 || creatingCheckout) return;

    // --------------------------------------------------------
    // PRACTICE PAYMENT SIMULATION
    //
    // This intentionally reproduces only the football consequence
    // of payment. No Cloud Function, Paystack checkout, redirect,
    // card transaction or real financial settlement may occur.
    // --------------------------------------------------------
    if (isPracticeMode) {
      setCreatingCheckout(true);
      setError("");
      setSlowPaymentMessage("");

      try {
        const simulatedPrimaryPaidWeeks = uniqueWeeks([
          ...effectivePrimaryPaidWeeks,
          ...unpaidPrimaryWeeks,
        ]);

        const simulatedSecondPaidWeeks = uniqueWeeks([
          ...effectiveSecondPaidWeeks,
          ...unpaidSecondWeeks,
        ]);

        const simulatedPaidAmount =
          (
            simulatedPrimaryPaidWeeks.length +
            simulatedSecondPaidWeeks.length
          ) * costPerGame;

        const simulatedFullyPaid =
          effectiveTotalGamesSelected > 0 &&
          simulatedPrimaryPaidWeeks.length === effectivePrimaryWeeks.length &&
          simulatedSecondPaidWeeks.length === effectiveSecondWeeks.length;

        const ref = matchSignupDocRef(signupDocId);

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

            primaryPaidWeeks: simulatedPrimaryPaidWeeks,
            paidWeeks: simulatedPrimaryPaidWeeks,

            secondDisplayName: effectiveSecondDisplayName,
            secondPlayerId: secondPlayerId || "",
            secondEmail: secondEmail || "",
            secondSelectedWeeks: effectiveSecondWeeks,
            secondPaidWeeks: simulatedSecondPaidWeeks,

            totalGamesSelected: effectiveTotalGamesSelected,
            paymentForMode: effectiveMode,
            amountDue: effectiveAmountDue,
            amountPaid: simulatedPaidAmount,
            costPerGame,

            // Explicitly distinguish this disposable football simulation
            // from a real payment-provider transaction.
            paymentMethod: "Practice simulation",
            paymentReference: `practice-${signupDocId}`,
            paymentIntentAmount: amountToPayNow,
            paymentStatus: simulatedFullyPaid ? "paid" : "part_paid",
            paymentSimulation: true,
            paymentProviderContacted: false,
            paymentSubmittedAt: serverTimestamp(),
            unpaidPrimaryWeeks: effectivePrimaryWeeks.filter(
              (week) => !simulatedPrimaryPaidWeeks.includes(week)
            ),
            unpaidSecondWeeks: effectiveSecondWeeks.filter(
              (week) => !simulatedSecondPaidWeeks.includes(week)
            ),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (typeof onDone === "function") onDone();
      } catch (err) {
        console.error("Failed to simulate Practice payment:", err);
        setError("Could not confirm the Practice payment simulation.");
      } finally {
        setCreatingCheckout(false);
        setSlowPaymentMessage("");
      }

      return;
    }

    if (!isTurfKingsYoco) {
      setError("Online payments are not available for this club yet.");
      return;
    }

    const functionsBaseUrl = getFunctionsBaseUrl();
    if (!functionsBaseUrl) {
      setError(
        "The secure payment service is temporarily unavailable. Please try again later."
      );
      return;
    }

    setCreatingCheckout(true);
    setError("");
    setSlowPaymentMessage("");

    let slowTimer = null;

    try {
      slowTimer = window.setTimeout(() => {
        setSlowPaymentMessage("Still opening payment. Please wait...");
      }, 8000);

      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : "";

      const { ok, data } = await postJson(
        `${functionsBaseUrl}/createYocoCheckout`,
        {
          activeClubId,
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
          costPerGame: captainContributionPerGame,
          serviceFeePerGame: platformUpliftPerGame,
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
        setCreatingCheckout(false);
        setSlowPaymentMessage("");
        return;
      }

      const redirectUrl = String(data?.redirectUrl || "").trim();
      if (!redirectUrl) {
        throw new Error("Yoco checkout did not return a redirect URL.");
      }

      const ref = matchSignupDocRef(signupDocId);
      setDoc(
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
          paymentMethod: paymentMethodLabel,
          paymentReference: buildReferenceLabel(primaryDisplayName),
          paymentIntentAmount: amountToPayNow,
          paymentStatus: amountToPayNow > 0 ? "pending" : "paid",
          paymentSubmittedAt: serverTimestamp(),
          unpaidPrimaryWeeks,
          unpaidSecondWeeks,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((writeErr) => {
        console.warn("Non-blocking payment metadata write failed:", writeErr);
      });

      window.location.assign(redirectUrl);
    } catch (err) {
      console.error("Failed to start payment:", err);
      setError(err?.message || "Could not open payment.");
      setCreatingCheckout(false);
      setSlowPaymentMessage("");
    } finally {
      if (slowTimer) window.clearTimeout(slowTimer);
    }
  }

  async function verifyPayment() {
    if (!signupDocId || verifyingPayment) return;

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

    setVerifyingPayment(true);
    setError("");

    try {
      const ref = matchSignupDocRef(signupDocId);

      // Practice v2 admin verification simulates only the football
      // consequence of payment. It never represents real settlement.
      //
      // Explicit "paid" confirmation unlocks all selected Practice weeks.
      // For part-paid/unpaid states we do NOT guess which particular
      // weeks were covered, so existing paid-week state is preserved.
      if (isPracticeMode) {
        const confirmedPrimaryPaidWeeks =
          nextStatus === "paid"
            ? uniqueWeeks(effectivePrimaryWeeks)
            : uniqueWeeks(effectivePrimaryPaidWeeks);

        const confirmedSecondPaidWeeks =
          nextStatus === "paid"
            ? uniqueWeeks(effectiveSecondWeeks)
            : uniqueWeeks(effectiveSecondPaidWeeks);

        const simulatedAmountPaid =
          nextStatus === "paid"
            ? effectiveAmountDue
            : verifiedAmount;

        await setDoc(
          ref,
          {
            amountPaid: simulatedAmountPaid,
            paymentStatus: nextStatus,

            primaryPaidWeeks: confirmedPrimaryPaidWeeks,
            paidWeeks: confirmedPrimaryPaidWeeks,
            secondPaidWeeks: confirmedSecondPaidWeeks,

            paymentMethod: "Practice simulation",
            paymentSimulation: true,
            paymentProviderContacted: false,

            adminNote: note,
            verifiedBy: verifier,
            verifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (typeof onDone === "function") onDone();
        return;
      }

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
      setVerifyingPayment(false);
    }
  }

  return (
    <div className="page payment-page">
      <section className="card payment-hero-card">
        <div className="payment-hero-top">
          <div>
            <h2>Payment</h2>
            <p className="muted">
              {isPracticeMode
                ? "Practice payment simulation."
                : isTurfKingsYoco
                  ? "Pay securely with Yoco."
                  : "Online payments are not available for this club yet."}
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
                    Reference: {buildReferenceLabel(primaryDisplayName)}
                  </p>
                  <p className="muted small">
                    Your payment will be sent to {captainPaymentName}, captain of {clubDisplayName}, for field booking.
                  </p>
                  <p className="muted small">
                    5 Asides Near Me securely processes this payment and provides player management services.
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

              {!isFullyPaid ? (
                <button
                  type="button"
                  className="primary-btn payment-action-btn"
                  disabled={
                    creatingCheckout ||
                    amountToPayNow <= 0 ||
                    (!isPracticeMode && !isTurfKingsYoco)
                  }
                  onClick={handlePayNow}
                >
                  {creatingCheckout
                    ? "Opening..."
                    : !isPracticeMode && !isTurfKingsYoco
                      ? "Online payment unavailable"
                      : `Pay ${formatCurrency(amountToPayNow)}`}
                </button>
              ) : (
                <div className="payment-paid-banner muted small">
                  You’ve already paid for these selected weeks.
                </div>
              )}

              <p className="muted small payment-help-text">
                {isFullyPaid
                  ? "No further payment is needed for the currently selected weeks."
                  : isPracticeMode
                    ? "This Practice payment is simulated and does not contact Yoco."
                    : isTurfKingsYoco
                      ? "You will be redirected to Yoco’s secure payment page in the same tab."
                      : "This club is waiting for the future marketplace payment system."}
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