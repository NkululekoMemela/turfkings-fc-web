/* eslint-env node */
/* global require, process, exports */
// FILE: functions/index.js
// PURPOSE: Payments + reminder collection + Twilio WhatsApp sending +
//          WhatsApp number verification lifecycle
// TYPE: FULL SCRIPT (replace your entire existing functions/index.js)

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");

admin.initializeApp();
const db = getFirestore();

// -----------------------------------------------------------------------------
// Twilio config
// Supports BOTH:
// 1) legacy firebase functions config: functions.config().twilio.*
// 2) process.env variables for future migration
// -----------------------------------------------------------------------------
let legacyTwilioConfig = {};
try {
  legacyTwilioConfig = (functions.config().twilio || {});
} catch (error) {
  legacyTwilioConfig = {};
}

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

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.PROJECT_ID ||
  admin.app().options.projectId ||
  "";

const REGION = "us-central1";

const TWILIO_STATUS_CALLBACK_URL =
  process.env.TWILIO_STATUS_CALLBACK_URL ||
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/twilioStatusCallback`;

const ADMIN_CONTACT_NAME =
  process.env.ADMIN_CONTACT_NAME ||
  "Nkululeko";

const hasTwilioConfig =
  Boolean(TWILIO_ACCOUNT_SID) &&
  Boolean(TWILIO_AUTH_TOKEN) &&
  Boolean(TWILIO_WHATSAPP_FROM);

const twilioClient = hasTwilioConfig ?
  twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) :
  null;

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------
function toWhatsAppAddress(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
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
// Payment confirmation
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
            confirmationMessage,
        );

        // Optional:
        // await sendWhatsAppMessage({
        //   to: whatsappNumber,
        //   body: confirmationMessage,
        // });
      } catch (error) {
        console.error("Error processing payment confirmation:", error);
      }
    },
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
        data.reminderPreference || "17:00",
    );

    const selectedWeeks = Array.isArray(data.selectedWeeks) ?
      data.selectedWeeks :
      [];

    const playerName = data.playerName || data.shortName || "Player";
    const whatsappNumber = normalizeWhatsappNumber(
        data.whatsappNumber || data.phoneNumber || "",
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
    },
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
              sendResult,
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
    },
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
              sendResult,
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
    },
);

// -----------------------------------------------------------------------------
// WhatsApp verification send endpoint
// Frontend calls this after user enters number for the first time.
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
            parseRequestValue(req, "whatsappNumber") || "",
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
            memberData.whatsappVerificationStatus || "",
        ).trim();

        const attemptCount = Number(
            memberData.whatsappVerificationAttemptCount || 0,
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
    },
);

// -----------------------------------------------------------------------------
// Twilio delivery status callback for verification messages
// Twilio posts MessageSid + MessageStatus here.
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
    },
);