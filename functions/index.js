/* eslint-env node */
/* global require, process, exports */
// FILE: functions/index.js
// PURPOSE:
// - Yoco checkout session creation
// - Yoco webhook verification + payment settlement
// - WhatsApp admin notifications (optional)
// - Existing Twilio WhatsApp reminder collection
// - Existing WhatsApp number verification lifecycle
//
// TYPE: FULL SCRIPT (replace your entire existing functions/index.js)

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");
const crypto = require("crypto");
const {Buffer} = require("node:buffer");
const fetch = require("node-fetch");

admin.initializeApp();
const db = getFirestore();

// -----------------------------------------------------------------------------
// Base config
// -----------------------------------------------------------------------------
const REGION = "us-central1";
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.PROJECT_ID ||
  admin.app().options.projectId ||
  "";

// -----------------------------------------------------------------------------
// Legacy config bridges
// -----------------------------------------------------------------------------
let legacyTwilioConfig = {};
let legacyYocoConfig = {};
try {
  legacyTwilioConfig = functions.config().twilio || {};
} catch (error) {
  legacyTwilioConfig = {};
}
try {
  legacyYocoConfig = functions.config().yoco || {};
} catch (error) {
  legacyYocoConfig = {};
}

// -----------------------------------------------------------------------------
// Twilio config
// -----------------------------------------------------------------------------
const TWILIO_ACCOUNT_SID =
  process.env.TWILIO_ACCOUNT_SID ||
  process.env.TWILIO_SID ||
  legacyTwilioConfig.sid ||
  "";

const TWILIO_AUTH_TOKEN =
  process.env.TWILIO_AUTH_TOKEN ||
  process.env.TWILIO_TOKEN ||
  legacyTwilioConfig.token ||
  "";

const TWILIO_WHATSAPP_FROM =
  process.env.TWILIO_WHATSAPP_FROM ||
  legacyTwilioConfig.whatsapp_from ||
  "whatsapp:+14155238886";

const TWILIO_STATUS_CALLBACK_URL =
  process.env.TWILIO_STATUS_CALLBACK_URL ||
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/twilioStatusCallback`;

const ADMIN_CONTACT_NAME =
  process.env.ADMIN_CONTACT_NAME ||
  "Nkululeko";

const ADMIN_WHATSAPP_TO = process.env.ADMIN_WHATSAPP_TO || "";

const hasTwilioConfig =
  Boolean(TWILIO_ACCOUNT_SID) &&
  Boolean(TWILIO_AUTH_TOKEN) &&
  Boolean(TWILIO_WHATSAPP_FROM);

const twilioClient = hasTwilioConfig ?
  twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) :
  null;

// -----------------------------------------------------------------------------
// Yoco config
// -----------------------------------------------------------------------------
const YOCO_SECRET_KEY =
  process.env.YOCO_SECRET_KEY ||
  process.env.YOCO_SECRET ||
  legacyYocoConfig.secret_key ||
  legacyYocoConfig.secret ||
  "";

const YOCO_WEBHOOK_SECRET =
  process.env.YOCO_WEBHOOK_SECRET ||
  legacyYocoConfig.webhook_secret ||
  "";

const YOCO_BASE_URL =
  process.env.YOCO_BASE_URL ||
  legacyYocoConfig.base_url ||
  "https://payments.yoco.com";

const YOCO_CURRENCY =
  process.env.YOCO_CURRENCY ||
  legacyYocoConfig.currency ||
  "ZAR";

// IMPORTANT:
// Set YOCO_AMOUNT_MULTIPLIER=100 if your checkout endpoint expects cents.
// Set YOCO_AMOUNT_MULTIPLIER=1 if your account expects whole-rand amount values.
// This script defaults to 100 for safety with hosted checkout integrations.
const YOCO_AMOUNT_MULTIPLIER =
  Number(process.env.YOCO_AMOUNT_MULTIPLIER || legacyYocoConfig.amount_multiplier || 100);

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  legacyYocoConfig.app_base_url ||
  "";

const hasYocoConfig =
  Boolean(YOCO_SECRET_KEY) &&
  Boolean(YOCO_BASE_URL);

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------
function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.status(204).send("");
    return true;
  }
  return false;
}

function safeString(value = "") {
  return String(value || "").trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueArray(value) {
  return Array.from(new Set(ensureArray(value).map((item) => safeString(item)).filter(Boolean)));
}

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

function slugFromLooseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function buildReferenceLabel(name) {
  return `5s-${firstNameOf(name)}`;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseRequestValue(req, key) {
  if (req.body && typeof req.body === "object" && req.body[key] !== undefined) {
    return req.body[key];
  }

  if (req.query && req.query[key] !== undefined) {
    return req.query[key];
  }

  if (req.rawBody) {
    try {
      const raw = req.rawBody.toString("utf8");
      const params = new URLSearchParams(raw);
      if (params.has(key)) return params.get(key);
    } catch (error) {
      console.log("Failed rawBody parse for key:", key, error.message);
    }
  }

  return undefined;
}

function normalizeReminderPreference(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "12" || v === "12:00" || v === "12h00" || v === "noon") {
    return "12:00";
  }

  if (v === "17" || v === "17:00" || v === "5pm" || v === "17h00") {
    return "17:00";
  }

  return "17:00";
}

function normalizeWhatsappNumber(value = "") {
  let v = String(value || "").trim();

  if (!v) return "";

  v = v.replace(/\s+/g, "");
  v = v.replace(/-/g, "");

  if (v.startsWith("whatsapp:")) {
    v = v.replace("whatsapp:", "");
  }

  if (v.startsWith("00")) {
    v = `+${v.slice(2)}`;
  }

  if (v.startsWith("0")) {
    v = `+27${v.slice(1)}`;
  }

  return v;
}

function toWhatsAppAddress(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

function isLocalUrl(value = "") {
  const raw = safeString(value);
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0"
    );
  } catch (error) {
    return false;
  }
}

function buildReturnUrl(baseUrl, status, paymentRecordId = "") {
  const base = safeString(baseUrl || APP_BASE_URL);
  if (!base) return "";
  const joiner = base.includes("?") ? "&" : "?";
  const suffix = paymentRecordId ?
    `${joiner}paymentStatus=${encodeURIComponent(status)}&paymentRecordId=${encodeURIComponent(paymentRecordId)}` :
    `${joiner}paymentStatus=${encodeURIComponent(status)}`;
  return `${base}${suffix}`;
}

function resolveCheckoutUrlSet(body = {}, paymentRecordId = "") {
  const requestedReturnUrl = safeString(body.returnUrl || "");
  const requestedSuccessUrl = safeString(body.successUrl || "");
  const requestedCancelUrl = safeString(body.cancelUrl || "");
  const requestedFailureUrl = safeString(body.failureUrl || "");

  const isLiveKey = safeString(YOCO_SECRET_KEY).startsWith("sk_live_");
  let baseForReturn = requestedReturnUrl || APP_BASE_URL || "";

  if (isLiveKey && isLocalUrl(baseForReturn)) {
    baseForReturn = safeString(APP_BASE_URL || "");
  }

  let successUrl = requestedSuccessUrl || buildReturnUrl(baseForReturn, "success", paymentRecordId);
  let cancelUrl = requestedCancelUrl || buildReturnUrl(baseForReturn, "cancel", paymentRecordId);
  let failureUrl = requestedFailureUrl || buildReturnUrl(baseForReturn, "failure", paymentRecordId);

  if (isLiveKey) {
    if (isLocalUrl(successUrl)) successUrl = "";
    if (isLocalUrl(cancelUrl)) cancelUrl = "";
    if (isLocalUrl(failureUrl)) failureUrl = "";
  }

  return {
    successUrl: safeString(successUrl),
    cancelUrl: safeString(cancelUrl),
    failureUrl: safeString(failureUrl),
  };
}

function deepFindFirst(obj, keys = [], maxDepth = 6) {
  const targetKeys = new Set(keys);
  const queue = [{value: obj, depth: 0}];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    const value = current.value;
    const depth = current.depth;

    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);

    for (const [k, v] of Object.entries(value)) {
      if (targetKeys.has(k) && v !== undefined && v !== null && `${v}` !== "") {
        return v;
      }

      if (depth < maxDepth && v && typeof v === "object") {
        queue.push({value: v, depth: depth + 1});
      }
    }
  }

  return undefined;
}

function parseWebhookSignatureHeader(headerValue = "") {
  const raw = safeString(headerValue);
  if (!raw) return [];

  return raw
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [version, signature] = part.split(",");
      return {
        version: safeString(version),
        signature: safeString(signature),
      };
    })
    .filter((item) => item.signature);
}

function computeYocoExpectedSignature({
  secret,
  webhookId,
  webhookTimestamp,
  rawBody,
}) {
  const usableSecret = safeString(secret);
  if (!usableSecret.startsWith("whsec_")) {
    throw new Error("Invalid Yoco webhook secret format.");
  }

  const secretBytes = Buffer.from(usableSecret.split("_")[1], "base64");
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  return crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");
}

function verifyYocoWebhookSignature(req) {
  const webhookId = safeString(req.headers["webhook-id"]);
  const webhookTimestamp = safeString(req.headers["webhook-timestamp"]);
  const webhookSignatureHeader = safeString(req.headers["webhook-signature"]);
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";

  if (!webhookId || !webhookTimestamp || !webhookSignatureHeader || !rawBody) {
    return {
      ok: false,
      reason: "Missing webhook headers or raw body.",
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const sentAt = Number(webhookTimestamp || 0);
  const ageSeconds = Math.abs(nowSeconds - sentAt);

  if (!Number.isFinite(sentAt) || ageSeconds > 180) {
    return {
      ok: false,
      reason: "Webhook timestamp outside allowed window.",
    };
  }

  let expectedSignature = "";
  try {
    expectedSignature = computeYocoExpectedSignature({
      secret: YOCO_WEBHOOK_SECRET,
      webhookId,
      webhookTimestamp,
      rawBody,
    });
  } catch (error) {
    return {
      ok: false,
      reason: error.message || "Could not compute expected signature.",
    };
  }

  const signatures = parseWebhookSignatureHeader(webhookSignatureHeader);
  const matches = signatures.some((item) => {
    const actual = Buffer.from(item.signature);
    const expected = Buffer.from(expectedSignature);

    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  });

  return {
    ok: matches,
    reason: matches ? "" : "Webhook signature mismatch.",
  };
}

function deriveYocoEventStatus(payload = {}) {
  const eventType = safeString(
    payload.type ||
    payload.eventType ||
    deepFindFirst(payload, ["type", "eventType"])
  ).toLowerCase();

  const explicitStatus = safeString(
    payload.status ||
    payload.checkoutStatus ||
    payload.paymentStatus ||
    deepFindFirst(payload, ["status", "checkoutStatus", "paymentStatus"])
  ).toLowerCase();

  const successWords = ["success", "succeeded", "successful", "completed", "paid"];
  const failureWords = ["failed", "cancelled", "canceled", "expired", "declined"];

  const eventText = `${eventType} ${explicitStatus}`.trim();

  if (successWords.some((word) => eventText.includes(word))) return "paid";
  if (failureWords.some((word) => eventText.includes(word))) return "failed";
  if (eventText.includes("pending")) return "pending";

  return "unknown";
}

function deriveOutstandingWeeks({
  selectedWeeks = [],
  paidWeeks = [],
}) {
  const selected = uniqueArray(selectedWeeks);
  const paid = uniqueArray(paidWeeks);
  return selected.filter((week) => !paid.includes(week));
}

function computeSignupPaymentState({
  signup = {},
  requestBody = {},
}) {
  const costPerGame = Number(
    signup.costPerGame ||
    requestBody.costPerGame ||
    65
  );

  const primarySelectedWeeks = uniqueArray(
    signup.selectedWeeks || requestBody.selectedWeeks
  );

  const secondSelectedWeeks = uniqueArray(
    signup.secondSelectedWeeks ||
    requestBody.secondSelectedWeeks ||
    requestBody.additionalSelectedWeeks ||
    requestBody.beneficiarySelectedWeeks
  );

  const primaryPaidWeeks = uniqueArray(
    signup.primaryPaidWeeks ||
    signup.paidWeeks ||
    requestBody.primaryPaidWeeks ||
    requestBody.paidWeeks ||
    requestBody.alreadyPaidWeeks
  );

  const secondPaidWeeks = uniqueArray(
    signup.secondPaidWeeks ||
    requestBody.secondPaidWeeks ||
    requestBody.additionalPaidWeeks ||
    requestBody.beneficiaryPaidWeeks
  );

  const unpaidPrimaryWeeks = deriveOutstandingWeeks({
    selectedWeeks: primarySelectedWeeks,
    paidWeeks: primaryPaidWeeks,
  });

  const unpaidSecondWeeks = deriveOutstandingWeeks({
    selectedWeeks: secondSelectedWeeks,
    paidWeeks: secondPaidWeeks,
  });

  const totalGamesSelected =
    primarySelectedWeeks.length + secondSelectedWeeks.length;

  const unpaidTotalGames =
    unpaidPrimaryWeeks.length + unpaidSecondWeeks.length;

  const fullAmount = totalGamesSelected * costPerGame;
  const outstandingAmount = unpaidTotalGames * costPerGame;

  const amountPaidFromWeeks =
    (primaryPaidWeeks.length + secondPaidWeeks.length) * costPerGame;

  return {
    costPerGame,
    primarySelectedWeeks,
    secondSelectedWeeks,
    primaryPaidWeeks,
    secondPaidWeeks,
    unpaidPrimaryWeeks,
    unpaidSecondWeeks,
    totalGamesSelected,
    unpaidTotalGames,
    fullAmount,
    outstandingAmount,
    amountPaidFromWeeks,
  };
}

function deriveSignupDocIdFromBody(body = {}) {
  const provided = safeString(body.signupDocId);
  if (provided) return provided;

  const season = safeString(body.activeSeasonId || "season");
  const player = slugFromLooseName(body.displayName || "player");
  const mode = safeString(body.paymentForMode || body.mode || "self");
  const secondPlayer = slugFromLooseName(body.secondDisplayName || "none");
  const weeksKey = uniqueArray(body.selectedWeeks).slice().sort().join("_") || "none";
  const secondWeeksKey = uniqueArray(body.secondSelectedWeeks).slice().sort().join("_") || "none";

  return `${season}__${player}__${mode}__${secondPlayer}__${weeksKey}__${secondWeeksKey}`;
}

async function sendWhatsAppMessage({to, body, statusCallback = null}) {
  if (!hasTwilioConfig || !twilioClient) {
    console.log("Twilio config missing. Dry-run only.", {
      to,
      from: TWILIO_WHATSAPP_FROM,
      body,
      statusCallback,
    });
    return {
      ok: false,
      dryRun: true,
      reason: "Missing Twilio configuration",
    };
  }

  const payload = {
    from: TWILIO_WHATSAPP_FROM,
    to: toWhatsAppAddress(to),
    body,
  };

  if (statusCallback) {
    payload.statusCallback = statusCallback;
  }

  const message = await twilioClient.messages.create(payload);

  return {
    ok: true,
    sid: message.sid,
    status: message.status || "queued",
  };
}

async function notifyAdminOnWhatsApp(message) {
  const to = normalizeWhatsappNumber(ADMIN_WHATSAPP_TO);
  if (!to) return {ok: false, skipped: true, reason: "ADMIN_WHATSAPP_TO not set"};
  return sendWhatsAppMessage({
    to,
    body: message,
  });
}

async function findMemberDocByUserId(userId = "") {
  if (!userId) return null;

  const membersRef = db.collection("members").doc(userId);
  const membersSnap = await membersRef.get();
  if (membersSnap.exists) return membersRef;

  const humanRef = db.collection("humanMembers").doc(userId);
  const humanSnap = await humanRef.get();
  if (humanSnap.exists) return humanRef;

  return membersRef;
}

async function updateVerificationFailure(memberRef, currentData = {}) {
  const prevCount = Number(currentData.whatsappVerificationAttemptCount || 0);
  const nextCount = prevCount + 1;
  const status = nextCount >= 2 ? "failed_twice" : "failed_once";

  await memberRef.set({
    whatsappVerificationStatus: status,
    whatsappVerificationAttemptCount: nextCount,
    whatsappVerificationLastFailedAt: FieldValue.serverTimestamp(),
    whatsappVerificationAdminContactName: ADMIN_CONTACT_NAME,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

async function updateVerificationSuccess(memberRef) {
  await memberRef.set({
    whatsappVerificationStatus: "verified",
    whatsappVerificationVerifiedAt: FieldValue.serverTimestamp(),
    whatsappVerificationLastDeliveredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

// -----------------------------------------------------------------------------
// UPDATED: fetchJson with timeout support
// -----------------------------------------------------------------------------
async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      data = {raw: text};
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildYocoCheckoutPayload({
  paymentRecordId,
  amountInBaseUnits,
  referenceLabel,
  successUrl,
  cancelUrl,
  failureUrl,
  metadata = {},
}) {
  const payload = {
    amount: amountInBaseUnits,
    currency: YOCO_CURRENCY,
    externalId: paymentRecordId,
    clientReferenceId: referenceLabel,
    metadata,
  };

  if (successUrl) payload.successUrl = successUrl;
  if (cancelUrl) payload.cancelUrl = cancelUrl;
  if (failureUrl) payload.failureUrl = failureUrl;

  return payload;
}

async function settleVerifiedPayment({
  paymentRef,
  paymentData,
  yocoPayload = {},
}) {
  const signupDocId = safeString(paymentData.signupDocId);
  if (!signupDocId) {
    throw new Error("Payment record missing signupDocId.");
  }

  const signupRef = db.collection("matchSignups").doc(signupDocId);
  const signupSnap = await signupRef.get();
  const signupData = signupSnap.exists ? (signupSnap.data() || {}) : {};

  const costPerGame = Number(
    signupData.costPerGame ||
    paymentData.costPerGame ||
    65
  );

  const currentPrimarySelectedWeeks = uniqueArray(
    signupData.selectedWeeks || paymentData.selectedWeeks
  );
  const currentSecondSelectedWeeks = uniqueArray(
    signupData.secondSelectedWeeks || paymentData.secondSelectedWeeks
  );

  const currentPrimaryPaidWeeks = uniqueArray(
    signupData.primaryPaidWeeks || signupData.paidWeeks || paymentData.primaryPaidWeeks
  );
  const currentSecondPaidWeeks = uniqueArray(
    signupData.secondPaidWeeks || paymentData.secondPaidWeeks
  );

  const newlyPaidPrimaryWeeks = uniqueArray(
    paymentData.unpaidPrimaryWeeks || paymentData.primaryWeeksToCharge || []
  );
  const newlyPaidSecondWeeks = uniqueArray(
    paymentData.unpaidSecondWeeks || paymentData.secondWeeksToCharge || []
  );

  const mergedPrimaryPaidWeeks = uniqueArray([
    ...currentPrimaryPaidWeeks,
    ...newlyPaidPrimaryWeeks,
  ]);

  const mergedSecondPaidWeeks = uniqueArray([
    ...currentSecondPaidWeeks,
    ...newlyPaidSecondWeeks,
  ]);

  const remainingPrimaryWeeks = deriveOutstandingWeeks({
    selectedWeeks: currentPrimarySelectedWeeks,
    paidWeeks: mergedPrimaryPaidWeeks,
  });

  const remainingSecondWeeks = deriveOutstandingWeeks({
    selectedWeeks: currentSecondSelectedWeeks,
    paidWeeks: mergedSecondPaidWeeks,
  });

  const totalGamesSelected =
    currentPrimarySelectedWeeks.length + currentSecondSelectedWeeks.length;

  const amountDue = totalGamesSelected * costPerGame;
  const paidGames =
    mergedPrimaryPaidWeeks.length + mergedSecondPaidWeeks.length;
  const amountPaidFromWeeks = paidGames * costPerGame;
  const amountReceived = Number(
    paymentData.amountReceived ||
    paymentData.amountRequested ||
    0
  );
  const finalAmountPaid = Math.max(
    Number(signupData.amountPaid || 0),
    amountPaidFromWeeks,
    amountReceived
  );

  const outstandingGames =
    remainingPrimaryWeeks.length + remainingSecondWeeks.length;
  const paymentStatus = outstandingGames === 0 ?
    "paid" :
    finalAmountPaid > 0 ? "part_paid" : "unpaid";

  const batch = db.batch();

  batch.set(signupRef, {
    primaryPaidWeeks: mergedPrimaryPaidWeeks,
    paidWeeks: mergedPrimaryPaidWeeks,
    secondPaidWeeks: mergedSecondPaidWeeks,
    unpaidPrimaryWeeks: remainingPrimaryWeeks,
    unpaidSecondWeeks: remainingSecondWeeks,
    amountDue,
    amountPaid: finalAmountPaid,
    paymentStatus,
    paymentVerifiedAt: FieldValue.serverTimestamp(),
    verifiedAt: FieldValue.serverTimestamp(),
    verifiedBy: "yoco_webhook",
    yocoCheckoutId:
      safeString(paymentData.yocoCheckoutId) ||
      safeString(yocoPayload.checkoutId) ||
      safeString(yocoPayload.id) ||
      "",
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  batch.set(paymentRef, {
    status: "paid",
    amountReceived: amountReceived || Number(paymentData.amountRequested || 0),
    verifiedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    webhookEvent: {
      type: safeString(yocoPayload.type || yocoPayload.eventType || ""),
      status: safeString(yocoPayload.status || ""),
      receivedAt: new Date().toISOString(),
    },
  }, {merge: true});

  await batch.commit();

  const userId = safeString(paymentData.userId || paymentData.payerUserId || "");
  if (userId) {
    const pendingSnap = await db
      .collection("pendingSignups")
      .where("userId", "==", userId)
      .where("paymentStatus", "in", ["pending", "payment_deferred", "submitted_awaiting_confirmation"])
      .get();

    if (!pendingSnap.empty) {
      const pendingBatch = db.batch();
      pendingSnap.forEach((docSnap) => {
        pendingBatch.update(docSnap.ref, {
          paymentStatus: "paid_confirmed",
          remindersPaused: true,
          remindersEnabled: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await pendingBatch.commit();
    }
  }

  const adminMessage =
    `✅ TurfKings payment verified.\n` +
    `${safeString(paymentData.displayName || "Player")}` +
    (safeString(paymentData.secondDisplayName) ?
      ` + ${safeString(paymentData.secondDisplayName)}` :
      "") +
    `\nAmount: ${formatCurrency(amountReceived || Number(paymentData.amountRequested || 0))}` +
    `\nSignup: ${signupDocId}`;

  await notifyAdminOnWhatsApp(adminMessage);
}

async function markPaymentFailed({
  paymentRef,
  paymentData,
  yocoPayload = {},
  nextStatus = "failed",
}) {
  await paymentRef.set({
    status: nextStatus,
    updatedAt: FieldValue.serverTimestamp(),
    webhookEvent: {
      type: safeString(yocoPayload.type || yocoPayload.eventType || ""),
      status: safeString(yocoPayload.status || ""),
      receivedAt: new Date().toISOString(),
    },
  }, {merge: true});

  const adminMessage =
    `⚠️ TurfKings payment not completed.\n` +
    `${safeString(paymentData.displayName || "Player")}` +
    (safeString(paymentData.secondDisplayName) ?
      ` + ${safeString(paymentData.secondDisplayName)}` :
      "") +
    `\nStatus: ${nextStatus}` +
    `\nSignup: ${safeString(paymentData.signupDocId || "")}`;

  await notifyAdminOnWhatsApp(adminMessage);
}

// -----------------------------------------------------------------------------
// UPDATED: create checkout session with Yoco (faster response path)
// -----------------------------------------------------------------------------
exports.createYocoCheckout = onRequest(
  {
    region: REGION,
    invoker: "public",
  },
  async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(res);

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed. Use POST.",
      });
    }

    if (!hasYocoConfig) {
      return res.status(500).json({
        ok: false,
        error: "Yoco configuration is missing on the server.",
      });
    }

    const t0 = Date.now();

    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const signupDocId = deriveSignupDocIdFromBody(body);

      if (!signupDocId) {
        return res.status(400).json({
          ok: false,
          error: "Missing signupDocId.",
        });
      }

      const signupRef = db.collection("matchSignups").doc(signupDocId);

      const tSignupRead0 = Date.now();
      const signupSnap = await signupRef.get();
      const signupData = signupSnap.exists ? (signupSnap.data() || {}) : {};
      console.log("[createYocoCheckout] signup read ms:", Date.now() - tSignupRead0);

      const paymentState = computeSignupPaymentState({
        signup: signupData,
        requestBody: body,
      });

      if (paymentState.outstandingAmount <= 0) {
        return res.status(200).json({
          ok: true,
          alreadyPaid: true,
          redirectUrl: "",
          amount: 0,
          signupDocId,
          outstandingGames: 0,
        });
      }

      const displayName = safeString(
        signupData.displayName ||
        body.displayName ||
        "Player"
      );

      const secondDisplayName = safeString(
        signupData.secondDisplayName ||
        body.secondDisplayName ||
        ""
      );

      const activeSeasonId = safeString(
        signupData.activeSeasonId ||
        body.activeSeasonId ||
        ""
      );

      const paymentForMode = safeString(
        signupData.paymentForMode ||
        body.paymentForMode ||
        body.mode ||
        (paymentState.secondSelectedWeeks.length > 0 ? "both" : "self")
      );

      const referenceLabel = safeString(
        signupData.paymentReference ||
        body.paymentReference ||
        buildReferenceLabel(displayName)
      );

      const paymentsRef = db.collection("payments").doc();
      const resolvedUrls = resolveCheckoutUrlSet(body, paymentsRef.id);

      const amountInBaseUnits = Math.round(
        paymentState.outstandingAmount * YOCO_AMOUNT_MULTIPLIER
      );

      const metadata = {
        paymentRecordId: paymentsRef.id,
        signupDocId,
        activeSeasonId,
        displayName,
        secondDisplayName,
        paymentForMode,
        outstandingGames: paymentState.unpaidTotalGames,
        referenceLabel,
      };

      const yocoPayload = buildYocoCheckoutPayload({
        paymentRecordId: paymentsRef.id,
        amountInBaseUnits,
        referenceLabel,
        successUrl: resolvedUrls.successUrl,
        cancelUrl: resolvedUrls.cancelUrl,
        failureUrl: resolvedUrls.failureUrl,
        metadata,
      });

      const tYoco0 = Date.now();
      const yocoResponse = await fetchJson(
        `${YOCO_BASE_URL.replace(/\/$/, "")}/api/checkouts`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${YOCO_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(yocoPayload),
        },
        15000
      );
      console.log("[createYocoCheckout] yoco call ms:", Date.now() - tYoco0);

      if (!yocoResponse.ok) {
        console.error("[YOCO] checkout create failed status:", yocoResponse.status);
        console.error("[YOCO] checkout create failed data:", JSON.stringify(yocoResponse.data || {}));

        await paymentsRef.set({
          provider: "yoco",
          status: "create_failed",
          signupDocId,
          activeSeasonId,
          displayName,
          secondDisplayName,
          playerId: safeString(signupData.playerId || body.playerId || ""),
          secondPlayerId: safeString(signupData.secondPlayerId || body.secondPlayerId || ""),
          secondEmail: safeString(signupData.secondEmail || body.secondEmail || ""),
          userId: safeString(body.userId || body.identityUserId || signupData.userId || ""),
          paymentForMode,
          selectedWeeks: paymentState.primarySelectedWeeks,
          secondSelectedWeeks: paymentState.secondSelectedWeeks,
          primaryPaidWeeks: paymentState.primaryPaidWeeks,
          secondPaidWeeks: paymentState.secondPaidWeeks,
          unpaidPrimaryWeeks: paymentState.unpaidPrimaryWeeks,
          unpaidSecondWeeks: paymentState.unpaidSecondWeeks,
          totalGamesSelected: paymentState.totalGamesSelected,
          outstandingGames: paymentState.unpaidTotalGames,
          costPerGame: paymentState.costPerGame,
          amountRequested: paymentState.outstandingAmount,
          amountRequestedBaseUnits: amountInBaseUnits,
          currency: YOCO_CURRENCY,
          paymentReference: referenceLabel,
          source: "turfkings_checkout_api",
          requestedSuccessUrl: resolvedUrls.successUrl,
          requestedCancelUrl: resolvedUrls.cancelUrl,
          requestedFailureUrl: resolvedUrls.failureUrl,
          yocoError: yocoResponse.data,
          yocoErrorText: yocoResponse.text || "",
          yocoStatusCode: yocoResponse.status,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});

        return res.status(502).json({
          ok: false,
          error: "Yoco checkout creation failed.",
          details: yocoResponse.data || yocoResponse.text || "Unknown Yoco error",
          statusCode: yocoResponse.status,
        });
      }

      const yocoData = yocoResponse.data || {};
      const redirectUrl = safeString(
        yocoData.redirectUrl ||
        yocoData.redirectURL ||
        yocoData.url
      );

      const yocoCheckoutId = safeString(
        yocoData.id ||
        yocoData.checkoutId ||
        ""
      );

      if (!redirectUrl) {
        return res.status(502).json({
          ok: false,
          error: "Yoco checkout did not return a redirect URL.",
        });
      }

      const paymentRecord = {
        provider: "yoco",
        status: "checkout_created",
        signupDocId,
        activeSeasonId,
        displayName,
        secondDisplayName,
        playerId: safeString(signupData.playerId || body.playerId || ""),
        secondPlayerId: safeString(signupData.secondPlayerId || body.secondPlayerId || ""),
        secondEmail: safeString(signupData.secondEmail || body.secondEmail || ""),
        userId: safeString(body.userId || body.identityUserId || signupData.userId || ""),
        paymentForMode,
        selectedWeeks: paymentState.primarySelectedWeeks,
        secondSelectedWeeks: paymentState.secondSelectedWeeks,
        primaryPaidWeeks: paymentState.primaryPaidWeeks,
        secondPaidWeeks: paymentState.secondPaidWeeks,
        unpaidPrimaryWeeks: paymentState.unpaidPrimaryWeeks,
        unpaidSecondWeeks: paymentState.unpaidSecondWeeks,
        totalGamesSelected: paymentState.totalGamesSelected,
        outstandingGames: paymentState.unpaidTotalGames,
        costPerGame: paymentState.costPerGame,
        amountRequested: paymentState.outstandingAmount,
        amountRequestedBaseUnits: amountInBaseUnits,
        currency: YOCO_CURRENCY,
        paymentReference: referenceLabel,
        source: "turfkings_checkout_api",
        requestedSuccessUrl: resolvedUrls.successUrl,
        requestedCancelUrl: resolvedUrls.cancelUrl,
        requestedFailureUrl: resolvedUrls.failureUrl,
        yocoCheckoutId,
        yocoResponse: yocoData,
        redirectUrl,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const tWrites0 = Date.now();
      await Promise.all([
        paymentsRef.set(paymentRecord, {merge: true}),
        signupRef.set({
          paymentRecordId: paymentsRef.id,
          paymentLinkUrl: redirectUrl,
          paymentStatus: "pending",
          paymentSubmittedAt: FieldValue.serverTimestamp(),
          unpaidPrimaryWeeks: paymentState.unpaidPrimaryWeeks,
          unpaidSecondWeeks: paymentState.unpaidSecondWeeks,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true}),
      ]);
      console.log("[createYocoCheckout] final writes ms:", Date.now() - tWrites0);

      console.log("[createYocoCheckout] total ms before response:", Date.now() - t0);

      res.status(200).json({
        ok: true,
        paymentRecordId: paymentsRef.id,
        signupDocId,
        amount: paymentState.outstandingAmount,
        outstandingGames: paymentState.unpaidTotalGames,
        redirectUrl,
        yocoCheckoutId,
        processingMode: safeString(yocoData.processingMode || ""),
      });

      Promise.resolve().then(async () => {
        try {
          await notifyAdminOnWhatsApp(
            `🧾 TurfKings payment started.\n` +
            `${displayName}` +
            (secondDisplayName ? ` + ${secondDisplayName}` : "") +
            `\nAmount: ${formatCurrency(paymentState.outstandingAmount)}` +
            `\nSignup: ${signupDocId}`
          );
        } catch (notifyError) {
          console.error("Admin WhatsApp notify failed:", notifyError);
        }
      });
    } catch (error) {
      const isAbort =
        error &&
        (error.name === "AbortError" ||
          String(error.message || "").toLowerCase().includes("aborted"));

      console.error("createYocoCheckout failed:", error);

      return res.status(isAbort ? 504 : 500).json({
        ok: false,
        error: isAbort ?
          "Yoco request timed out. Please try again." :
          (error.message || "Unknown server error"),
      });
    }
  }
);

// -----------------------------------------------------------------------------
// handle Yoco webhook
// -----------------------------------------------------------------------------
exports.handleYocoWebhook = onRequest(
  {
    region: REGION,
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }

    if (!YOCO_WEBHOOK_SECRET) {
      console.error("YOCO_WEBHOOK_SECRET is missing.");
      return res.status(500).send("Webhook secret not configured");
    }

    const verification = verifyYocoWebhookSignature(req);
    if (!verification.ok) {
      console.error("Yoco webhook verification failed:", verification.reason);
      return res.status(403).send("Invalid signature");
    }

    let payload = {};
    try {
      payload = req.body && typeof req.body === "object" ?
        req.body :
        JSON.parse(req.rawBody.toString("utf8"));
    } catch (error) {
      console.error("Could not parse webhook body:", error);
      return res.status(400).send("Invalid body");
    }

    try {
      const externalId = safeString(
        deepFindFirst(payload, ["externalId", "external_id"])
      );

      const clientReferenceId = safeString(
        deepFindFirst(payload, ["clientReferenceId", "client_reference_id"])
      );

      const checkoutId = safeString(
        deepFindFirst(payload, ["checkoutId", "checkout_id"]) ||
        ((payload.data && typeof payload.data === "object") ? payload.data.id : "") ||
        ""
      );

      let paymentRef = null;
      let paymentData = {};

      if (externalId) {
        paymentRef = db.collection("payments").doc(externalId);
        const snap = await paymentRef.get();
        if (snap.exists) {
          paymentData = snap.data() || {};
        } else {
          paymentRef = null;
        }
      }

      if (!paymentRef && checkoutId) {
        const checkoutSnap = await db
          .collection("payments")
          .where("yocoCheckoutId", "==", checkoutId)
          .limit(1)
          .get();

        if (!checkoutSnap.empty) {
          paymentRef = checkoutSnap.docs[0].ref;
          paymentData = checkoutSnap.docs[0].data() || {};
        }
      }

      if (!paymentRef && clientReferenceId) {
        const referenceSnap = await db
          .collection("payments")
          .where("paymentReference", "==", clientReferenceId)
          .limit(1)
          .get();

        if (!referenceSnap.empty) {
          paymentRef = referenceSnap.docs[0].ref;
          paymentData = referenceSnap.docs[0].data() || {};
        }
      }

      if (!paymentRef) {
        console.error("Could not match webhook to payment record.", {
          externalId,
          clientReferenceId,
          checkoutId,
        });
        return res.status(200).send("No matching payment record");
      }

      const eventStatus = deriveYocoEventStatus(payload);

      const receivedAmountBaseUnits = Number(
        deepFindFirst(payload, ["amount", "totalAmount", "amountPaid"]) || 0
      );
      const amountReceived = receivedAmountBaseUnits > 0 ?
        receivedAmountBaseUnits / YOCO_AMOUNT_MULTIPLIER :
        Number(paymentData.amountRequested || 0);

      await paymentRef.set({
        yocoCheckoutId: safeString(paymentData.yocoCheckoutId || checkoutId || ""),
        amountReceived,
        webhookPayload: payload,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      if (eventStatus === "paid") {
        await settleVerifiedPayment({
          paymentRef,
          paymentData: {
            ...paymentData,
            yocoCheckoutId: safeString(paymentData.yocoCheckoutId || checkoutId || ""),
            amountReceived,
          },
          yocoPayload: payload,
        });
      } else if (eventStatus === "failed") {
        await markPaymentFailed({
          paymentRef,
          paymentData,
          yocoPayload: payload,
          nextStatus: "failed",
        });
      } else {
        await paymentRef.set({
          status: "pending",
          updatedAt: FieldValue.serverTimestamp(),
          webhookPayload: payload,
        }, {merge: true});
      }

      return res.status(200).send("OK");
    } catch (error) {
      console.error("handleYocoWebhook failed:", error);
      return res.status(500).send("ERROR");
    }
  }
);

// -----------------------------------------------------------------------------
// Existing payment confirmation hook
// -----------------------------------------------------------------------------
exports.onPaymentConfirmed = onDocumentCreated(
  "payments/{paymentId}",
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log("No payment snapshot found.");
      return;
    }

    const payment = snap.data() || {};
    console.log("Payment received:", payment);

    const {
      userId,
      playerName = "",
      selectedWeeks = [],
      whatsappNumber = "",
    } = payment;

    if (!userId) {
      console.log("No userId found. Skipping.");
      return;
    }

    try {
      const pendingQuery = await db
        .collection("pendingSignups")
        .where("userId", "==", userId)
        .where("paymentStatus", "in", ["pending", "payment_deferred"])
        .get();

      const batch = db.batch();

      pendingQuery.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          paymentStatus: "paid_confirmed",
          remindersPaused: true,
          remindersEnabled: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();

      console.log("Marked matching pending signups as paid.");

      const confirmationMessage =
        `Payment confirmed for ${playerName}. ` +
        `You are confirmed for: ${selectedWeeks.join(", ")}. Thank you.`;

      console.log(
        `WhatsApp confirmation candidate -> ${whatsappNumber}: ` +
        confirmationMessage
      );

      // Optional:
      // await sendWhatsAppMessage({
      //   to: whatsappNumber,
      //   body: confirmationMessage,
      // });
    } catch (error) {
      console.error("Error processing payment confirmation:", error);
    }
  }
);

// -----------------------------------------------------------------------------
// Reminder candidate collection
// -----------------------------------------------------------------------------
async function collectReminderCandidates({
  enforceHour = false,
  forcedHour = null,
  forceAll = false,
} = {}) {
  const now = new Date();
  const currentHour = forcedHour !== null ? Number(forcedHour) : now.getHours();

  console.log("Collecting reminders at:", now.toISOString(), {
    enforceHour,
    currentHour,
    forceAll,
  });

  const snap = await db.collection("pendingSignups").get();

  if (snap.empty) {
    console.log("No pendingSignups found.");
    return [];
  }

  const reminders = [];
  const todayKey = getTodayKey();

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    const paymentStatus = String(data.paymentStatus || "").trim();
    const remindersEnabled = Boolean(data.remindersEnabled);
    const remindersPaused = Boolean(data.remindersPaused);
    const reminderPreference = normalizeReminderPreference(
      data.reminderPreference || "17:00"
    );

    const selectedWeeks = Array.isArray(data.selectedWeeks) ?
      data.selectedWeeks :
      [];

    const playerName = data.playerName || data.shortName || "Player";
    const whatsappNumber = normalizeWhatsappNumber(
      data.whatsappNumber || data.phoneNumber || ""
    );
    const monthLabel = data.monthLabel || "";
    const signupType = data.signupType || "general";
    const lastReminderDay = String(data.lastReminderDay || "").trim();

    const shouldConsider =
      paymentStatus === "payment_deferred" &&
      remindersEnabled === true &&
      !remindersPaused &&
      selectedWeeks.length > 0 &&
      Boolean(whatsappNumber);

    if (!shouldConsider) return;

    if (!forceAll && lastReminderDay === todayKey) {
      return;
    }

    let shouldSendNow = false;

    if (forceAll) {
      shouldSendNow = true;
    } else if (enforceHour) {
      shouldSendNow =
        (reminderPreference === "12:00" && currentHour === 12) ||
        (reminderPreference === "17:00" && currentHour === 17);
    } else {
      shouldSendNow =
        reminderPreference === "12:00" || reminderPreference === "17:00";
    }

    if (!shouldSendNow) return;

    const reminder = {
      docId: docSnap.id,
      userId: data.userId || "",
      playerName,
      whatsappNumber,
      reminderPreference,
      selectedWeeks,
      monthLabel,
      signupType,
      todayKey,
      message:
        `Reminder: You still have ${selectedWeeks.length} selected ` +
        `TurfKings week(s) awaiting payment. Please open the app to ` +
        `complete payment. To stop reminders, open the app and uncheck ` +
        `your selected weeks.`,
    };

    reminders.push(reminder);
    console.log("PAYMENT REMINDER CANDIDATE:", reminder);
  });

  return reminders;
}

// -----------------------------------------------------------------------------
// Manual browser / curl test endpoint
// -----------------------------------------------------------------------------
exports.schedulePaymentReminders = onRequest(
  {
    region: REGION,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const shouldSend = String(req.query.send || "false") === "true";
      const forceAll = String(req.query.force || "false") === "true";
      const forcedHourRaw = req.query.hour;
      const forcedHour = forcedHourRaw ? Number(forcedHourRaw) : null;

      const reminders = await collectReminderCandidates({
        enforceHour: !forceAll,
        forcedHour,
        forceAll,
      });

      const results = [];

      for (const reminder of reminders) {
        if (!shouldSend) {
          results.push({
            ...reminder,
            sendResult: {
              ok: false,
              dryRun: true,
              reason: "Dry run. Add ?send=true to actually send.",
            },
          });
          continue;
        }

        const sendResult = await sendWhatsAppMessage({
          to: reminder.whatsappNumber,
          body: reminder.message,
        });

        results.push({
          ...reminder,
          sendResult,
        });

        if (sendResult.ok) {
          await db.collection("pendingSignups").doc(reminder.docId).update({
            lastReminderSentAt: FieldValue.serverTimestamp(),
            lastReminderDay: reminder.todayKey,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      res.status(200).json({
        ok: true,
        count: results.length,
        sendMode: shouldSend ? "live" : "dry-run",
        forceAll,
        forcedHour,
        hasTwilioConfig,
        results,
      });
    } catch (error) {
      console.error("schedulePaymentReminders failed:", error);
      res.status(500).json({
        ok: false,
        error: error.message || String(error),
      });
    }
  }
);

// -----------------------------------------------------------------------------
// Scheduled reminder runners
// -----------------------------------------------------------------------------
exports.schedulePaymentRemindersDaily = onSchedule(
  {
    schedule: "every day 12:00",
    timeZone: "Africa/Johannesburg",
    region: REGION,
  },
  async () => {
    try {
      const reminders = await collectReminderCandidates({
        enforceHour: true,
        forcedHour: 12,
        forceAll: false,
      });

      for (const reminder of reminders) {
        const sendResult = await sendWhatsAppMessage({
          to: reminder.whatsappNumber,
          body: reminder.message,
        });

        console.log(
          `SENDING 12:00 REMINDER → ${reminder.playerName} ` +
          `(${reminder.whatsappNumber})`,
          sendResult
        );

        if (sendResult.ok) {
          await db.collection("pendingSignups").doc(reminder.docId).update({
            lastReminderSentAt: FieldValue.serverTimestamp(),
            lastReminderDay: reminder.todayKey,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error("Scheduled 12:00 reminders failed:", error);
    }
  }
);

exports.schedulePaymentRemindersEvening = onSchedule(
  {
    schedule: "every day 17:00",
    timeZone: "Africa/Johannesburg",
    region: REGION,
  },
  async () => {
    try {
      const reminders = await collectReminderCandidates({
        enforceHour: true,
        forcedHour: 17,
        forceAll: false,
      });

      for (const reminder of reminders) {
        const sendResult = await sendWhatsAppMessage({
          to: reminder.whatsappNumber,
          body: reminder.message,
        });

        console.log(
          `SENDING 17:00 REMINDER → ${reminder.playerName} ` +
          `(${reminder.whatsappNumber})`,
          sendResult
        );

        if (sendResult.ok) {
          await db.collection("pendingSignups").doc(reminder.docId).update({
            lastReminderSentAt: FieldValue.serverTimestamp(),
            lastReminderDay: reminder.todayKey,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error("Scheduled 17:00 reminders failed:", error);
    }
  }
);

// -----------------------------------------------------------------------------
// WhatsApp verification send endpoint
// -----------------------------------------------------------------------------
exports.verifyWhatsAppNumber = onRequest(
  {
    region: REGION,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const userId = String(parseRequestValue(req, "userId") || "").trim();
      const rawWhatsappNumber = String(
        parseRequestValue(req, "whatsappNumber") || ""
      ).trim();

      const whatsappNumber = normalizeWhatsappNumber(rawWhatsappNumber);

      if (!userId) {
        return res.status(400).json({
          ok: false,
          error: "Missing userId.",
        });
      }

      if (!whatsappNumber) {
        return res.status(400).json({
          ok: false,
          error: "Missing whatsappNumber.",
        });
      }

      const memberRef = await findMemberDocByUserId(userId);
      const memberSnap = await memberRef.get();
      const memberData = memberSnap.exists ? (memberSnap.data() || {}) : {};

      const verificationStatus = String(
        memberData.whatsappVerificationStatus || ""
      ).trim();

      const attemptCount = Number(
        memberData.whatsappVerificationAttemptCount || 0
      );

      if (
        verificationStatus === "manual_admin_verified" ||
        verificationStatus === "verified"
      ) {
        await memberRef.set({
          whatsappNumber,
          whatsappVerificationStatus: verificationStatus || "verified",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});

        return res.status(200).json({
          ok: true,
          alreadyVerified: true,
          whatsappVerificationStatus: verificationStatus || "verified",
        });
      }

      if (attemptCount >= 2) {
        return res.status(403).json({
          ok: false,
          blocked: true,
          whatsappVerificationStatus: "failed_twice",
          adminContactName: ADMIN_CONTACT_NAME,
          message:
            `This number could not be verified twice. ` +
            `Please contact admin ${ADMIN_CONTACT_NAME}.`,
        });
      }

      const verificationBody =
        "TurfKings: This number has been added for football reminders " +
        "like payment confirmations, weather reschedules, and match updates.";

      const sendResult = await sendWhatsAppMessage({
        to: whatsappNumber,
        body: verificationBody,
        statusCallback: TWILIO_STATUS_CALLBACK_URL,
      });

      if (!sendResult.ok) {
        return res.status(500).json({
          ok: false,
          error: sendResult.reason || "Verification send failed.",
          hasTwilioConfig,
        });
      }

      await memberRef.set({
        whatsappNumber,
        whatsappVerificationStatus: "pending",
        whatsappVerificationAdminContactName: ADMIN_CONTACT_NAME,
        whatsappVerificationLastRequestedAt: FieldValue.serverTimestamp(),
        lastVerificationSid: sendResult.sid,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      return res.status(200).json({
        ok: true,
        sid: sendResult.sid,
        status: sendResult.status,
        whatsappVerificationStatus: "pending",
      });
    } catch (error) {
      console.error("verifyWhatsAppNumber failed:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || String(error),
      });
    }
  }
);

// -----------------------------------------------------------------------------
// Twilio delivery status callback for verification messages
// -----------------------------------------------------------------------------
exports.twilioStatusCallback = onRequest(
  {
    region: REGION,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const messageSid = String(parseRequestValue(req, "MessageSid") || "")
        .trim();
      const messageStatus = String(parseRequestValue(req, "MessageStatus") || "")
        .trim()
        .toLowerCase();

      console.log("Twilio status callback:", {
        messageSid,
        messageStatus,
      });

      if (!messageSid) {
        return res.status(200).send("Missing MessageSid");
      }

      const membersSnap = await db
        .collection("members")
        .where("lastVerificationSid", "==", messageSid)
        .limit(1)
        .get();

      let targetRef = null;
      let targetData = {};

      if (!membersSnap.empty) {
        targetRef = membersSnap.docs[0].ref;
        targetData = membersSnap.docs[0].data() || {};
      } else {
        const humanSnap = await db
          .collection("humanMembers")
          .where("lastVerificationSid", "==", messageSid)
          .limit(1)
          .get();

        if (!humanSnap.empty) {
          targetRef = humanSnap.docs[0].ref;
          targetData = humanSnap.docs[0].data() || {};
        }
      }

      if (!targetRef) {
        console.log("No member found for verification SID:", messageSid);
        return res.status(200).send("No matching member");
      }

      if (messageStatus === "delivered" || messageStatus === "read") {
        await updateVerificationSuccess(targetRef);
      } else if (
        messageStatus === "failed" ||
        messageStatus === "undelivered"
      ) {
        await updateVerificationFailure(targetRef, targetData);
      } else {
        await targetRef.set({
          whatsappVerificationLastStatus: messageStatus,
          whatsappVerificationLastStatusAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }

      return res.status(200).send("OK");
    } catch (error) {
      console.error("twilioStatusCallback failed:", error);
      return res.status(500).send("ERROR");
    }
  }
);