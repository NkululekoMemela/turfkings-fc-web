// FILE: functions/index.js
// PURPOSE: Full backend logic for payments + reminder candidate collection + Twilio WhatsApp sending
// TYPE: FULL SCRIPT (replace your entire existing functions/index.js with this)

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const twilio = require("twilio");

admin.initializeApp();

const db = getFirestore();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM =
  process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

const hasTwilioConfig =
  Boolean(TWILIO_ACCOUNT_SID) &&
  Boolean(TWILIO_AUTH_TOKEN) &&
  Boolean(TWILIO_WHATSAPP_FROM);

const twilioClient = hasTwilioConfig
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

function toWhatsAppAddress(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

async function sendWhatsAppMessage({ to, body }) {
  if (!hasTwilioConfig || !twilioClient) {
    console.log("Twilio config missing. Dry-run only.", {
      to,
      from: TWILIO_WHATSAPP_FROM,
      body,
    });
    return {
      ok: false,
      dryRun: true,
      reason: "Missing Twilio configuration",
    };
  }

  const message = await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: toWhatsAppAddress(to),
    body,
  });

  return {
    ok: true,
    sid: message.sid,
    status: message.status || "queued",
  };
}

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
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();

      console.log("Marked matching pending signups as paid.");

      const confirmationMessage = `Payment confirmed for ${playerName}. You are confirmed for: ${selectedWeeks.join(
        ", "
      )}. Thank you.`;

      console.log(
        `WhatsApp confirmation candidate -> ${whatsappNumber}: ${confirmationMessage}`
      );

      // Optional: turn this on after you confirm sandbox setup works
      // await sendWhatsAppMessage({
      //   to: whatsappNumber,
      //   body: confirmationMessage,
      // });
    } catch (error) {
      console.error("Error processing payment confirmation:", error);
    }
  }
);

async function collectReminderCandidates({ enforceHour = false } = {}) {
  const now = new Date();
  const currentHour = now.getHours();

  console.log("Collecting reminders at:", now.toISOString());

  const snap = await db.collection("pendingSignups").get();

  if (snap.empty) {
    console.log("No pendingSignups found.");
    return [];
  }

  const reminders = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    const paymentStatus = String(data.paymentStatus || "").trim();
    const remindersPaused = Boolean(data.remindersPaused);
    const reminderPreference = String(
      data.reminderPreference || "17:00"
    ).trim();

    const selectedWeeks = Array.isArray(data.selectedWeeks)
      ? data.selectedWeeks
      : [];

    const playerName = data.playerName || data.shortName || "Player";
    const whatsappNumber = data.whatsappNumber || data.phoneNumber || "";
    const monthLabel = data.monthLabel || "";
    const signupType = data.signupType || "general";

    const shouldConsider =
      paymentStatus === "payment_deferred" &&
      !remindersPaused &&
      selectedWeeks.length > 0 &&
      whatsappNumber;

    if (!shouldConsider) return;

    const shouldSendNow = enforceHour
      ? (reminderPreference === "12:00" && currentHour === 12) ||
        (reminderPreference === "17:00" && currentHour === 17)
      : reminderPreference === "12:00" || reminderPreference === "17:00";

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
      message: `Reminder: You still have ${selectedWeeks.length} selected TurfKings week(s) awaiting payment. Please open the app to complete payment. To stop reminders, open the app and uncheck your selected weeks.`,
    };

    reminders.push(reminder);
    console.log("PAYMENT REMINDER CANDIDATE:", reminder);
  });

  return reminders;
}

// Manual browser test endpoint
// Use:
//   dry run -> /schedulePaymentReminders
//   real send -> /schedulePaymentReminders?send=true
exports.schedulePaymentReminders = onRequest(async (req, res) => {
  try {
    const shouldSend = String(req.query.send || "false") === "true";
    const reminders = await collectReminderCandidates({ enforceHour: false });

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
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    res.status(200).json({
      ok: true,
      count: results.length,
      sendMode: shouldSend ? "live" : "dry-run",
      results,
    });
  } catch (error) {
    console.error("schedulePaymentReminders failed:", error);
    res.status(500).json({
      ok: false,
      error: error.message || String(error),
    });
  }
});

// Future automatic runner
exports.schedulePaymentRemindersDaily = onSchedule(
  {
    schedule: "every day 12:00",
    timeZone: "Africa/Johannesburg",
  },
  async () => {
    try {
      const reminders = await collectReminderCandidates({ enforceHour: true });

      for (const reminder of reminders) {
        const sendResult = await sendWhatsAppMessage({
          to: reminder.whatsappNumber,
          body: reminder.message,
        });

        console.log(
          `SENDING REMINDER → ${reminder.playerName} (${reminder.whatsappNumber})`,
          sendResult
        );

        if (sendResult.ok) {
          await db.collection("pendingSignups").doc(reminder.docId).update({
            lastReminderSentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error("Scheduled reminders failed:", error);
    }
  }
);