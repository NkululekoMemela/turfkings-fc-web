// src/hooks/useWhatsAppProfilePrompt.js
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

const DEFAULT_ADMIN_NAME = "Nkululeko";

function normalizeWhatsAppNumber(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  raw = raw.replace(/\s+/g, "").replace(/[()-]/g, "");

  if (raw.startsWith("whatsapp:")) raw = raw.slice(9);

  if (raw.startsWith("+")) {
    const digits = `+${raw.slice(1).replace(/\D/g, "")}`;
    return /^\+\d{9,15}$/.test(digits) ? digits : "";
  }

  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";

  if (digitsOnly.startsWith("27") && digitsOnly.length === 11) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.startsWith("0") && digitsOnly.length === 10) {
    return `+27${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.length >= 9 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }

  return "";
}

function firstNameOf(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
}

function slugFromLooseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getPhoneFromIdentity(identity, currentUser) {
  return (
    identity?.phoneNumber ||
    identity?.phone ||
    identity?.whatsAppNumber ||
    currentUser?.phoneNumber ||
    ""
  );
}

function getWhatsappProfileMessage(status) {
  switch (String(status || "")) {
    case "verified":
    case "manual_admin_verified":
      return "Your WhatsApp number has been saved for football reminders.";
    default:
      return "Add your WhatsApp number for football reminders like reschedules, payment confirmations, and match updates.";
  }
}

function buildProfileDocCandidates({
  identity,
  currentUser,
  displayName,
  userId,
}) {
  const rawIds = [
    identity?.memberId,
    identity?.playerId,
    currentUser?.uid,
    currentUser?.email,
    identity?.email,
    slugFromLooseName(displayName),
    userId,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];

  ["members", "humanMembers", "players"].forEach((collectionName) => {
    rawIds.forEach((id) => {
      const key = `${collectionName}__${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ collection: collectionName, id });
    });
  });

  return out;
}

async function resolveProfileDocTarget({
  identity,
  currentUser,
  displayName,
  userId,
}) {
  const candidates = buildProfileDocCandidates({
    identity,
    currentUser,
    displayName,
    userId,
  });

  for (const candidate of candidates) {
    try {
      const snap = await getDoc(doc(db, candidate.collection, candidate.id));
      if (snap.exists()) {
        return {
          ...candidate,
          exists: true,
          data: snap.data() || {},
        };
      }
    } catch (error) {
      console.warn("Profile target lookup skipped:", candidate, error);
    }
  }

  return {
    collection: "members",
    id: userId,
    exists: false,
    data: {},
  };
}

export default function useWhatsAppProfilePrompt({
  identity,
  currentUser,
  displayName,
  payerUserId,
}) {
  const phoneNumber = useMemo(
    () => getPhoneFromIdentity(identity, currentUser),
    [identity, currentUser]
  );

  const [profileTarget, setProfileTarget] = useState(null);
  const [profileWhatsappNumber, setProfileWhatsappNumber] = useState(phoneNumber);
  const [showWhatsAppPrompt, setShowWhatsAppPrompt] = useState(false);
  const [whatsAppInput, setWhatsAppInput] = useState(phoneNumber);
  const [whatsAppInputError, setWhatsAppInputError] = useState("");
  const [whatsAppSubmitting, setWhatsAppSubmitting] = useState(false);
  const [whatsAppVerificationStatus, setWhatsAppVerificationStatus] =
    useState("");
  const [whatsAppVerificationMessage, setWhatsAppVerificationMessage] =
    useState("");
  const [skipWhatsAppPromptThisSession, setSkipWhatsAppPromptThisSession] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileTarget() {
      const resolved = await resolveProfileDocTarget({
        identity,
        currentUser,
        displayName,
        userId: payerUserId,
      });

      if (cancelled) return;

      setProfileTarget(resolved);

      const savedNumber = normalizeWhatsAppNumber(
        resolved?.data?.whatsappNumber ||
          resolved?.data?.whatsAppNumber ||
          resolved?.data?.phoneNumber ||
          phoneNumber
      );

      const savedStatus = String(
        resolved?.data?.whatsappVerificationStatus || ""
      );

      setProfileWhatsappNumber(savedNumber);
      setWhatsAppInput(savedNumber || phoneNumber || "");
      setWhatsAppVerificationStatus(savedStatus);
      setWhatsAppVerificationMessage(getWhatsappProfileMessage(savedStatus));

      if (!savedNumber && !skipWhatsAppPromptThisSession) {
        setShowWhatsAppPrompt(true);
      }
    }

    loadProfileTarget();

    return () => {
      cancelled = true;
    };
  }, [
    identity,
    currentUser,
    displayName,
    payerUserId,
    phoneNumber,
    skipWhatsAppPromptThisSession,
  ]);

  async function handleSaveWhatsAppNumber() {
    const normalized = normalizeWhatsAppNumber(whatsAppInput);

    if (!normalized) {
      setWhatsAppInputError(
        "Please enter a valid WhatsApp number, for example +27768304880."
      );
      return;
    }

    if (!profileTarget?.collection || !profileTarget?.id) {
      setWhatsAppInputError(
        "We could not find your profile yet. Please try again."
      );
      return;
    }

    setWhatsAppSubmitting(true);
    setWhatsAppInputError("");

    try {
      await setDoc(
        doc(db, profileTarget.collection, profileTarget.id),
        {
          userId: payerUserId,
          playerName: displayName,
          shortName: firstNameOf(displayName),
          whatsappNumber: normalized,
          phoneNumber: normalized,
          whatsappNumberUpdatedAt: serverTimestamp(),
          whatsappVerificationStatus: "manual_admin_verified",
          whatsappVerificationAdminName: DEFAULT_ADMIN_NAME,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfileWhatsappNumber(normalized);
      setWhatsAppInput(normalized);
      setWhatsAppVerificationStatus("manual_admin_verified");
      setWhatsAppVerificationMessage(
        getWhatsappProfileMessage("manual_admin_verified")
      );
      setShowWhatsAppPrompt(false);
    } catch (error) {
      console.error("Failed to save WhatsApp number:", error);
      setWhatsAppInputError("Could not save your number. Please try again.");
    } finally {
      setWhatsAppSubmitting(false);
    }
  }

  const effectiveWhatsappNumber = useMemo(
    () =>
      normalizeWhatsAppNumber(
        profileWhatsappNumber || phoneNumber || whatsAppInput
      ),
    [profileWhatsappNumber, phoneNumber, whatsAppInput]
  );

  return {
    phoneNumber,
    profileTarget,
    profileWhatsappNumber,
    setProfileWhatsappNumber,
    showWhatsAppPrompt,
    setShowWhatsAppPrompt,
    whatsAppInput,
    setWhatsAppInput,
    whatsAppInputError,
    setWhatsAppInputError,
    whatsAppSubmitting,
    whatsAppVerificationStatus,
    whatsAppVerificationMessage,
    skipWhatsAppPromptThisSession,
    setSkipWhatsAppPromptThisSession,
    effectiveWhatsappNumber,
    handleSaveWhatsAppNumber,
  };
}