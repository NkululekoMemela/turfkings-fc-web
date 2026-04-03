// src/pages/EntryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import TurfKingsLogo from "../assets/TurfKings_logo.jpeg";
import TeamPhoto from "../assets/TurfKings.jpg";

import { auth, signInWithGoogle } from "../firebaseConfig";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  query,
  orderBy,
  limit,
  deleteField,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { isCaptainEmail } from "../core/captainAuth.js";

const MEMBERS_COLLECTION = "members";
const PLAYERS_COLLECTION = "players";
const PLAYER_PHOTOS_COLLECTION = "playerPhotos";
const WITHDRAWAL_REQUESTS_COLLECTION = "member_withdrawal_requests";

const brightPrimaryStyle = {
  background:
    "radial-gradient(circle at 0% 0%, rgba(56,189,248,0.25), transparent 55%), radial-gradient(circle at 100% 100%, rgba(59,130,246,0.35), transparent 55%), linear-gradient(90deg, #22d3ee, #38bdf8, #6366f1)",
  color: "#020617",
  boxShadow:
    "0 0 0 1px rgba(148, 255, 255, 0.35), 0 0 24px rgba(56,189,248,0.50)",
  border: "none",
};

const heroCardStyle = {
  position: "relative",
  overflow: "hidden",
  background:
    "radial-gradient(circle at top left, rgba(34,211,238,0.18), transparent 32%), radial-gradient(circle at top right, rgba(99,102,241,0.18), transparent 30%), linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.96))",
  border: "1px solid rgba(56,189,248,0.22)",
  boxShadow: "0 20px 48px rgba(2,6,23,0.34)",
};

const premiumPanelStyle = {
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 14px 34px rgba(2,6,23,0.18)",
  overflow: "hidden",
};

const joinPanelStyle = {
  marginTop: "1.35rem",
  padding: "1rem",
  borderTop: "1px solid rgba(56,189,248,0.22)",
  borderRadius: "18px",
  background:
    "linear-gradient(180deg, rgba(34,211,238,0.08), rgba(15,23,42,0.02))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const leavePanelStyle = {
  marginTop: "1.35rem",
  paddingTop: "1rem",
  borderTop: "1px solid rgba(148,163,184,0.16)",
};

const leaveInnerBoxStyle = {
  marginTop: "0.75rem",
  padding: "0.95rem 1rem",
  borderRadius: "16px",
  background:
    "linear-gradient(180deg, rgba(245,158,11,0.08), rgba(15,23,42,0.02))",
  border: "1px dashed rgba(245,158,11,0.35)",
};

const previewCardStyle = {
  width: "132px",
  height: "164px",
  borderRadius: "14px",
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.35)",
  boxShadow: "0 8px 22px rgba(15,23,42,0.28)",
  marginTop: "0.6rem",
  background: "#0f172a",
};

const compactFileInputStyle = {
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
  display: "block",
};

const labelCapsuleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.45rem",
  padding: "0.22rem 0.6rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  background: "rgba(56,189,248,0.10)",
  border: "1px solid rgba(56,189,248,0.18)",
  color: "#bae6fd",
};

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugFromName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}


function normalizeWhatsAppNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) {
    return "+" + raw.slice(1).replace(/\D/g, "");
  }
  return raw.replace(/\D/g, "");
}

function looksLikeWhatsAppNumber(value) {
  const normalized = normalizeWhatsAppNumber(value);
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}


function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function makePortraitPhotoDataUrl(file, width = 420, height = 520) {
  const raw = await fileToDataUrl(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(raw);
          return;
        }

        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, width, height);

        const scale = Math.max(width / img.width, height / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (width - drawW) / 2;
        const dy = (height - drawH) / 2;

        ctx.drawImage(img, dx, dy, drawW, drawH);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = raw;
  });
}

function getPhotoDocIdsFromIdentity({ fullName = "", shortName = "", playerId = "" }) {
  const ids = [
    String(playerId || "").trim(),
    slugFromName(toTitleCase(fullName || "")),
    slugFromName(toTitleCase(shortName || "")),
    slugFromName(toTitleCase(shortName || fullName || "")),
  ].filter(Boolean);

  return Array.from(new Set(ids));
}

async function findExistingPhotoDataByIdentity(identityLike) {
  const ids = getPhotoDocIdsFromIdentity(identityLike);

  for (const id of ids) {
    try {
      const snap = await getDoc(doc(db, PLAYER_PHOTOS_COLLECTION, id));
      if (snap.exists()) {
        const data = snap.data() || {};
        if (data.photoData) {
          return {
            id,
            photoData: data.photoData,
            data,
          };
        }
      }
    } catch (err) {
      console.error("[EntryPage] Failed checking player photo:", err);
    }
  }

  return null;
}

async function savePlayerPhotoForIdentity({
  fullName = "",
  shortName = "",
  playerId = "",
  email = "",
  role = "player",
  status = "active",
  sourceMemberId = "",
  photoData = "",
}) {
  const preferredId =
    String(playerId || "").trim() ||
    slugFromName(toTitleCase(shortName || fullName || ""));

  if (!preferredId || !photoData) return null;

  await setDoc(
    doc(db, PLAYER_PHOTOS_COLLECTION, preferredId),
    {
      name: toTitleCase(fullName || shortName || preferredId),
      shortName: toTitleCase(shortName || fullName || preferredId),
      email: String(email || "").trim(),
      sourceMemberId: sourceMemberId || null,
      role,
      status,
      photoData,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return preferredId;
}

async function upsertPlayerFromMember(member) {
  if (!member) return null;

  const shortName = (member.shortName || "").trim();
  const fullName = (member.fullName || "").trim();
  const displayName = toTitleCase(shortName || fullName);

  if (!displayName) {
    console.warn("[EntryPage] upsertPlayerFromMember: empty name, skipping");
    return null;
  }

  const playerId = slugFromName(displayName);

  try {
    await setDoc(
      doc(db, PLAYERS_COLLECTION, playerId),
      {
        name: displayName,
        fullName: fullName || displayName,
        shortName: shortName || displayName,
        email: member.email || "",
        roles: {
          player: true,
          captain: member.role === "captain",
          coach: member.role === "coach",
          admin: member.role === "admin",
        },
        sourceMemberId: member.id,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return playerId;
  } catch (err) {
    console.error(
      "[EntryPage] Failed to sync member into players collection:",
      err
    );
    return null;
  }
}

async function resolveSignedInRoleFromPlayerDoc(member, emailFromGoogle = "") {
  const shortName = toTitleCase(member?.shortName || "");
  const fullName = toTitleCase(member?.fullName || "");
  const displayName = toTitleCase(shortName || fullName);

  const candidateIds = Array.from(
    new Set(
      [
        slugFromName(displayName),
        slugFromName(fullName),
        slugFromName(shortName),
        member?.playerId || "",
      ].filter(Boolean)
    )
  );

  for (const pid of candidateIds) {
    try {
      const snap = await getDoc(doc(db, PLAYERS_COLLECTION, pid));
      if (!snap.exists()) continue;

      const data = snap.data() || {};
      const roles = data.roles || {};

      if (roles.admin) return "admin";
      if (roles.captain) return "captain";
      if (roles.player) return "player";
    } catch (err) {
      console.error("[EntryPage] Failed reading player role:", err);
    }
  }

  const email = String(emailFromGoogle || member?.email || "")
    .trim()
    .toLowerCase();

  if (isCaptainEmail(email)) return "captain";
  return "player";
}

export function EntryPage({ identity, onComplete, onDevSkipToLanding }) {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsub();
  }, []);

  const isAdminViewer =
    currentUser && currentUser.email && isCaptainEmail(currentUser.email);

  const [withdrawalAlert, setWithdrawalAlert] = useState(null);

  const [memberDepartureAlert, setMemberDepartureAlert] = useState(null);

  useEffect(() => {
    if (!isAdminViewer) return;

    const q = query(
      collection(db, "yearEndRSVP_withdrawals"),
      orderBy("withdrawnAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;

      const docSnap = snap.docs[0];
      const data = docSnap.data() || {};
      if (!data.withdrawnAt) return;

      const lastSeen = Number(
        window.localStorage.getItem("tk_lastSeenWithdrawal_ts") || 0
      );

      if (data.withdrawnAt > lastSeen) {
        setWithdrawalAlert({
          name: data.name || "Unknown player",
          friends: data.friends || 0,
          withdrawnAt: data.withdrawnAt,
        });
        window.localStorage.setItem(
          "tk_lastSeenWithdrawal_ts",
          String(data.withdrawnAt)
        );
      }
    });

    return () => unsub();
  }, [isAdminViewer]);

  useEffect(() => {
    if (!isAdminViewer) return;

    const q = query(
      collection(db, WITHDRAWAL_REQUESTS_COLLECTION),
      orderBy("requestedAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;

      const docSnap = snap.docs[0];
      const data = docSnap.data() || {};
      const requestedAt = Number(data.requestedAtMs || 0);
      if (!requestedAt) return;

      const lastSeen = Number(
        window.localStorage.getItem("tk_lastSeenMemberDeparture_ts") || 0
      );

      if (requestedAt > lastSeen) {
        setMemberDepartureAlert({
          requestId: docSnap.id,
          memberId: data.memberId || "",
          playerId: data.playerId || "",
          name: data.fullName || data.shortName || "Unknown player",
          shortName: data.shortName || "",
          email: data.email || "",
          whatsappNumber: data.whatsappNumber || "",
          requestedAt,
        });
        window.localStorage.setItem(
          "tk_lastSeenMemberDeparture_ts",
          String(requestedAt)
        );
      }
    });

    return () => unsub();
  }, [isAdminViewer]);

  const [mode, setMode] = useState(() => {
    if (identity?.actingRole === "spectator" || identity?.role === "spectator") {
      return "spectator";
    }
    return "player";
  });

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState("");

  useEffect(() => {
    setLoadingMembers(true);
    setMembersError("");

    const colRef = collection(db, MEMBERS_COLLECTION);

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            fullName: data.fullName || "",
            shortName: data.shortName || data.fullName?.split(" ")[0] || "",
            email: data.email || "",
            whatsappNumber: data.whatsappNumber || "",
            role: data.role || "player",
            status: data.status || "active",
            createdAt: data.createdAt || null,
          };
        });

        list.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setMembers(list);
        setLoadingMembers(false);
      },
      (err) => {
        console.error("Error loading members:", err);
        setMembersError("Could not load TurfKings members.");
        setLoadingMembers(false);
      }
    );

    return () => unsub();
  }, []);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members]
  );

  const pendingMembers = useMemo(
    () => members.filter((m) => m.status === "pending"),
    [members]
  );

  const [selectedMemberId, setSelectedMemberId] = useState(() => {
    if (identity?.memberId) return identity.memberId;
    return "";
  });
  const [verifyError, setVerifyError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState("");

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newReqStatus, setNewReqStatus] = useState("");
  const [newReqError, setNewReqError] = useState("");
  const [newPhotoFile, setNewPhotoFile] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState("");
  const [newPhotoStatus, setNewPhotoStatus] = useState("");
  const [newWhatsApp, setNewWhatsApp] = useState("");

  const [showPhotoReminderModal, setShowPhotoReminderModal] = useState(false);
  const [photoReminderContext, setPhotoReminderContext] = useState(null);
  const [photoReminderFile, setPhotoReminderFile] = useState(null);
  const [photoReminderPreview, setPhotoReminderPreview] = useState("");
  const [photoReminderStatus, setPhotoReminderStatus] = useState("");
  const [photoReminderError, setPhotoReminderError] = useState("");
  const [showWhatsAppReminderModal, setShowWhatsAppReminderModal] = useState(false);
  const [whatsAppReminderContext, setWhatsAppReminderContext] = useState(null);
  const [whatsAppInput, setWhatsAppInput] = useState("");
  const [whatsAppReminderError, setWhatsAppReminderError] = useState("");
  const [whatsAppReminderStatus, setWhatsAppReminderStatus] = useState("");

  const [adminPreviewRole, setAdminPreviewRole] = useState("admin");

  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("");
  const [withdrawError, setWithdrawError] = useState("");

  const handleNewPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    setNewReqError("");
    setNewPhotoStatus("");

    if (!file) {
      setNewPhotoFile(null);
      setNewPhotoPreview("");
      return;
    }

    try {
      const preview = await makePortraitPhotoDataUrl(file);
      setNewPhotoFile(file);
      setNewPhotoPreview(preview);
      setNewPhotoStatus("Photo added. It will be saved with your request.");
    } catch (err) {
      console.error("[EntryPage] Failed preparing request photo:", err);
      setNewReqError("Could not prepare your photo. Please try another image.");
      setNewPhotoFile(null);
      setNewPhotoPreview("");
    } finally {
      e.target.value = "";
    }
  };

  const handleReminderPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    setPhotoReminderError("");
    setPhotoReminderStatus("");

    if (!file) {
      setPhotoReminderFile(null);
      setPhotoReminderPreview("");
      return;
    }

    try {
      const preview = await makePortraitPhotoDataUrl(file);
      setPhotoReminderFile(file);
      setPhotoReminderPreview(preview);
      setPhotoReminderStatus("Nice — this portrait preview is ready to save.");
    } catch (err) {
      console.error("[EntryPage] Failed preparing reminder photo:", err);
      setPhotoReminderError("Could not prepare your photo. Please try another image.");
      setPhotoReminderFile(null);
      setPhotoReminderPreview("");
    } finally {
      e.target.value = "";
    }
  };

  const handleClosePhotoReminder = (shouldContinue = false) => {
    setShowPhotoReminderModal(false);
    setPhotoReminderContext(null);
    setPhotoReminderFile(null);
    setPhotoReminderPreview("");
    setPhotoReminderStatus("");
    setPhotoReminderError("");

    if (shouldContinue && photoReminderContext?.onContinue) {
      photoReminderContext.onContinue();
    }
  };

  const handleCloseWhatsAppReminder = (shouldContinue = false) => {
    setShowWhatsAppReminderModal(false);
    setWhatsAppReminderContext(null);
    setWhatsAppInput("");
    setWhatsAppReminderError("");
    setWhatsAppReminderStatus("");

    if (shouldContinue && whatsAppReminderContext?.onContinue) {
      whatsAppReminderContext.onContinue();
    }
  };

  const handleSubmitNewPlayer = async () => {
    setNewReqError("");
    setNewReqStatus("");
    setNewPhotoStatus("");

    const fullName = newFullName.trim();
    const email = newEmail.trim();

    if (!fullName) {
      setNewReqError("Please enter your full name.");
      return;
    }
    if (!email || !email.includes("@")) {
      setNewReqError("Please enter a valid email address.");
      return;
    }

    const exists = members.some(
      (m) =>
        m.fullName.toLowerCase() === fullName.toLowerCase() ||
        (m.email && m.email.toLowerCase() === email.toLowerCase())
    );

    if (exists) {
      setNewReqError(
        "This name or email already exists on the TurfKings list."
      );
      return;
    }

    const shortName = fullName.split(" ")[0];
    const pendingDocId = slugFromName(fullName);

    try {
      const requestRef = await addDoc(collection(db, MEMBERS_COLLECTION), {
        fullName,
        shortName,
        email,
        whatsappNumber: normalizeWhatsAppNumber(newWhatsApp),
        role: "player",
        status: "pending",
        createdAt: serverTimestamp(),
      });

      if (newPhotoFile) {
        const portraitData = await makePortraitPhotoDataUrl(newPhotoFile);
        await savePlayerPhotoForIdentity({
          fullName,
          shortName,
          playerId: pendingDocId,
          email,
          role: "player",
          status: "pending",
          sourceMemberId: requestRef.id,
          photoData: portraitData,
        });
      }

      setNewReqStatus(
        newPhotoFile
          ? "Request captured and your profile photo has been saved for admin review."
          : "Request captured. An admin will approve you and you’ll appear on the list."
      );
      setNewFullName("");
      setNewEmail("");
      setNewWhatsApp("");
      setNewPhotoFile(null);
      setNewPhotoPreview("");
    } catch (err) {
      console.error("Error creating new member:", err);
      setNewReqError("Could not send request. Please try again.");
    }
  };

  const handleVerifyPlayer = async () => {
    setVerifyError("");
    setVerifyStatus("");

    if (!selectedMember) {
      setVerifyError("Please select your name on the TurfKings list.");
      return;
    }

    if (selectedMember.status === "pending") {
      setVerifyError(
        "This player is still pending approval. Ask a captain to approve you."
      );
      return;
    }

    if (selectedMember.status === "rejected") {
      setVerifyError(
        "This request was rejected. Please speak to a captain if this is a mistake."
      );
      return;
    }

    let u = auth.currentUser;
    if (!u) {
      try {
        await signInWithGoogle();
        u = auth.currentUser;
      } catch (err) {
        console.error("Sign in cancelled/failed:", err);
        setVerifyError("Sign-in was cancelled or failed. Please try again.");
        return;
      }
    }

    if (!u || !u.email) {
      setVerifyError(
        "Could not read your Google email. Please try again or contact admin."
      );
      return;
    }

    const googleEmail = u.email.toLowerCase().trim();
    const memberEmail = (selectedMember.email || "").toLowerCase().trim();

    if (memberEmail && googleEmail !== memberEmail) {
      setVerifyError(
        `This Google account’s email doesn’t match the one on record for ${selectedMember.fullName}.`
      );
      return;
    }

    if (!memberEmail) {
      try {
        await updateDoc(doc(db, MEMBERS_COLLECTION, selectedMember.id), {
          email: googleEmail,
        });
      } catch (err) {
        console.error("Failed to update member email:", err);
      }
    }

    const playerId = await upsertPlayerFromMember({
      ...selectedMember,
      id: selectedMember.id,
      email: googleEmail,
    });

    const resolvedRole = await resolveSignedInRoleFromPlayerDoc(
      {
        ...selectedMember,
        id: selectedMember.id,
        playerId,
        email: googleEmail,
      },
      googleEmail
    );

    const actingRole =
      isAdminViewer && adminPreviewRole ? adminPreviewRole : resolvedRole;

    setVerifyStatus(
      `Welcome, ${selectedMember.shortName}! Your email has been verified.`
    );

    const memberSnap = await getDoc(doc(db, MEMBERS_COLLECTION, selectedMember.id));
    const memberData = memberSnap.exists() ? memberSnap.data() || {} : {};

    const completionPayload = {
      role: resolvedRole,
      actingRole,
      memberId: selectedMember.id,
      playerId: playerId || null,
      fullName: selectedMember.fullName,
      shortName: selectedMember.shortName,
      email: googleEmail,
      whatsappNumber: memberData.whatsappNumber || "",
      status: selectedMember.status || "active",
    };

    const continueToApp = () => {
      const savedWhatsApp = normalizeWhatsAppNumber(memberData.whatsappNumber || "");
      if (!savedWhatsApp) {
        setWhatsAppReminderContext({
          ...completionPayload,
          onContinue: () => onComplete({
            ...completionPayload,
            whatsappNumber: normalizeWhatsAppNumber(whatsAppInput || savedWhatsApp || ""),
          }),
        });
        setWhatsAppInput("");
        setWhatsAppReminderError("");
        setWhatsAppReminderStatus("");
        setShowWhatsAppReminderModal(true);
        return;
      }

      onComplete(completionPayload);
    };

    const existingPhoto = await findExistingPhotoDataByIdentity({
      fullName: selectedMember.fullName,
      shortName: selectedMember.shortName,
      playerId: playerId || "",
    });

    if (!existingPhoto) {
      setPhotoReminderContext({
        ...completionPayload,
        onContinue: continueToApp,
      });
      setPhotoReminderPreview("");
      setPhotoReminderFile(null);
      setPhotoReminderStatus("");
      setPhotoReminderError("");
      setShowPhotoReminderModal(true);
      return;
    }

    continueToApp();
  };

  const handleSaveReminderPhoto = async () => {
    if (!photoReminderContext) return;

    if (!photoReminderFile && !photoReminderPreview) {
      handleClosePhotoReminder(true);
      return;
    }

    setPhotoReminderError("");
    setPhotoReminderStatus("");

    try {
      const portraitData =
        photoReminderPreview ||
        (photoReminderFile ? await makePortraitPhotoDataUrl(photoReminderFile) : "");

      await savePlayerPhotoForIdentity({
        fullName: photoReminderContext.fullName,
        shortName: photoReminderContext.shortName,
        playerId: photoReminderContext.playerId,
        email: photoReminderContext.email,
        role: photoReminderContext.role,
        status: photoReminderContext.status,
        sourceMemberId: photoReminderContext.memberId,
        photoData: portraitData,
      });

      handleClosePhotoReminder(true);
    } catch (err) {
      console.error("[EntryPage] Failed saving reminder photo:", err);
      setPhotoReminderError("Could not save your photo just now. You can skip and add it later.");
    }
  };

  const handleSaveWhatsAppReminder = async () => {
    if (!whatsAppReminderContext) return;

    const normalized = normalizeWhatsAppNumber(whatsAppInput);

    if (!normalized) {
      handleCloseWhatsAppReminder(true);
      return;
    }

    if (!looksLikeWhatsAppNumber(normalized)) {
      setWhatsAppReminderError("Please enter a valid WhatsApp number.");
      return;
    }

    setWhatsAppReminderError("");
    setWhatsAppReminderStatus("");

    try {
      await updateDoc(doc(db, MEMBERS_COLLECTION, whatsAppReminderContext.memberId), {
        whatsappNumber: normalized,
        updatedAt: serverTimestamp(),
      });

      handleCloseWhatsAppReminder(true);
    } catch (err) {
      console.error("[EntryPage] Failed saving WhatsApp number:", err);
      setWhatsAppReminderError("Could not save your WhatsApp number just now.");
    }
  };

  const handleSubmitWithdrawalRequest = async () => {
    setWithdrawError("");
    setWithdrawStatus("");

    if (!selectedMember) {
      setWithdrawError("Please select your name first so we know who is leaving.");
      return;
    }

    const safeEmail = String(selectedMember.email || "").trim();
    const safeWhatsApp = String(selectedMember.whatsappNumber || "").trim();

    try {
      await addDoc(collection(db, WITHDRAWAL_REQUESTS_COLLECTION), {
        memberId: selectedMember.id,
        playerId: selectedMember.playerId || slugFromName(selectedMember.shortName || selectedMember.fullName || ""),
        fullName: selectedMember.fullName || "",
        shortName: selectedMember.shortName || "",
        email: safeEmail,
        whatsappNumber: safeWhatsApp,
        status: selectedMember.status || "active",
        reason: String(withdrawReason || "").trim(),
        requestedAt: serverTimestamp(),
        requestedAtMs: Date.now(),
        processed: false,
      });

      setWithdrawStatus(
        "Your departure request has been sent to admin. You are always welcome to return in future."
      );
      setWithdrawReason("");
      setShowWithdrawForm(false);
    } catch (err) {
      console.error("[EntryPage] Failed to submit withdrawal request:", err);
      setWithdrawError("Could not send your request right now. Please try again.");
    }
  };

  const handleContinueAsSpectator = () => {
    onComplete({
      role: "spectator",
      actingRole: "spectator",
      memberId: null,
      playerId: null,
      fullName: "",
      shortName: "",
      email: "",
      status: "guest",
    });
  };

  const handleApproveMember = async (memberId) => {
    const member = members.find((m) => m.id === memberId) || null;

    try {
      await updateDoc(doc(db, MEMBERS_COLLECTION, memberId), {
        status: "active",
      });

      await upsertPlayerFromMember({
        ...member,
        id: memberId,
        status: "active",
      });
    } catch (err) {
      console.error("Approve failed:", err);
      alert("Could not approve member. Check console for details.");
    }
  };

  const handleProcessDeparture = async () => {
    if (!memberDepartureAlert?.requestId || !memberDepartureAlert?.memberId) {
      setMemberDepartureAlert(null);
      return;
    }

    const ok = window.confirm(
      `${memberDepartureAlert.name} wants to leave TurfKings.\n\n` +
        `This will clear their private contact details from the active system, ` +
        `mark them as withdrawn, and keep their historical name/stats in the archives.\n\n` +
        `Proceed?`
    );

    if (!ok) return;

    try {
      await updateDoc(doc(db, MEMBERS_COLLECTION, memberDepartureAlert.memberId), {
        status: "withdrawn",
        email: deleteField(),
        whatsappNumber: deleteField(),
        updatedAt: serverTimestamp(),
      });

      const playerId =
        memberDepartureAlert.playerId ||
        slugFromName(
          toTitleCase(
            memberDepartureAlert.shortName || memberDepartureAlert.name || ""
          )
        );

      if (playerId) {
        try {
          await updateDoc(doc(db, PLAYERS_COLLECTION, playerId), {
            email: deleteField(),
            whatsappNumber: deleteField(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("[EntryPage] Could not clear player contact details:", err);
        }
      }

      await updateDoc(
        doc(db, WITHDRAWAL_REQUESTS_COLLECTION, memberDepartureAlert.requestId),
        {
          processedAt: serverTimestamp(),
          processedAtMs: Date.now(),
          processed: true,
          outcome: "withdrawn",
        }
      );

      setMemberDepartureAlert(null);
    } catch (err) {
      console.error("[EntryPage] Failed processing departure:", err);
      window.alert("Could not process this departure request just now.");
    }
  };

  const handleRejectMember = async (memberId) => {
    try {
      await updateDoc(doc(db, MEMBERS_COLLECTION, memberId), {
        status: "rejected",
      });
    } catch (err) {
      console.error("Reject failed:", err);
      alert("Could not reject member. Check console for details.");
    }
  };

  return (
    <div className="page entry-page">
      <header className="header">
        <div className="header-title">
          <img src={TurfKingsLogo} alt="Turf Kings logo" className="tk-logo" />
          <h1>Turf Kings 5-A-Side</h1>
        </div>

        {!currentUser && (
          <p className="muted small">
            Not signed in yet. We&apos;ll ask Google for your email when you
            verify as a player.
          </p>
        )}

        {currentUser && (
          <p className="muted small">
            Currently signed in as{" "}
            <strong>{currentUser.displayName || currentUser.email}</strong>.
          </p>
        )}
      </header>

      <section className="card" style={heroCardStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={labelCapsuleStyle}>TurfKings Entry</div>
            <h2
              style={{
                marginTop: "0.9rem",
                marginBottom: "0.55rem",
                fontSize: "clamp(1.55rem, 3.2vw, 2.35rem)",
                lineHeight: 1.06,
              }}
            >
              Welcome to the Turf Kings player platform
            </h2>
            <p
              className="muted"
              style={{
                maxWidth: "640px",
                margin: 0,
                fontSize: "1rem",
                lineHeight: 1.55,
              }}
            >
              Join, verify, and get matchday ready.
            </p>


          </div>

          <div
            style={{
              borderRadius: "22px",
              overflow: "hidden",
              border: "1px solid rgba(148,163,184,0.16)",
              boxShadow: "0 18px 42px rgba(2,6,23,0.32)",
              background: "#020617",
              padding: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={TeamPhoto}
              alt="Turf Kings team"
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "320px",
                objectFit: "contain",
                objectPosition: "center",
                display: "block",
                borderRadius: "16px",
              }}
            />
          </div>
        </div>
      </section>

      <section className="card" style={premiumPanelStyle}>
        <h2 style={{ marginBottom: "0.35rem" }}>Who are you?</h2>


        <div className="pill-toggle-group" style={{ marginTop: "0.9rem" }}>
          <button
            type="button"
            className={
              "pill-toggle" + (mode === "player" ? " pill-toggle-active" : "")
            }
            onClick={() => setMode("player")}
            style={
              mode === "player"
                ? {
                    background: "#ffffff",
                    backgroundImage: "none",
                    borderColor: "rgba(255,255,255,0.92)",
                    boxShadow: "0 10px 24px rgba(255,255,255,0.12)",
                    color: "#020617",
                    WebkitTextFillColor: "#020617",
                  }
                : {
                    color: "#f8fafc",
                    WebkitTextFillColor: "#f8fafc",
                  }
            }
          >
            🏃‍♂️ TurfKings player
          </button>

          <button
            type="button"
            className={
              "pill-toggle" +
              (mode === "spectator" ? " pill-toggle-active" : "")
            }
            onClick={() => setMode("spectator")}
            style={
              mode === "spectator"
                ? {
                    background:
                      "linear-gradient(90deg, rgba(148,163,184,0.12), rgba(51,65,85,0.16))",
                    borderColor: "rgba(148,163,184,0.34)",
                    color: "#f8fafc",
                    WebkitTextFillColor: "#f8fafc",
                  }
                : {
                    color: "#f8fafc",
                    WebkitTextFillColor: "#f8fafc",
                  }
            }
          >
            👁️ I&apos;m a spectator
          </button>
        </div>
      </section>

      {mode === "player" && (
        <section className="card" style={{ ...premiumPanelStyle, overflow: "hidden" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
            <span style={labelCapsuleStyle}>Player entry</span>
          </div>
          <h2 style={{ marginTop: "0.85rem", marginBottom: "0.35rem" }}>
            Confirm your player identity
          </h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Verify yourself quickly, then we can personalize the app around your profile.
          </p>

          <div className="field-column" style={{ marginTop: "1rem" }}>
            <label>Select your name (Turf Kings player list)</label>
            <p className="muted small" style={{ marginTop: "0.25rem" }}>
              There are {activeMembers.length} players on the list – scroll down.
            </p>

            <select
              className="text-input"
              value={selectedMemberId}
              onChange={(e) => {
                setSelectedMemberId(e.target.value);
                setVerifyError("");
                setVerifyStatus("");
              }}
            >
              <option value="">Select your name...</option>

              {activeMembers.map((m, idx) => (
                <option key={m.id} value={m.id}>
                  {idx + 1}. {m.fullName}
                </option>
              ))}

              {pendingMembers.map((m, idx) => (
                <option key={m.id} value={m.id}>
                  {activeMembers.length + idx + 1}. {m.fullName} (pending
                  approval)
                </option>
              ))}
            </select>
          </div>

          {isAdminViewer && (
            <div className="field-column" style={{ marginTop: "1rem" }}>
              <label>Admin view mode</label>
              <p className="muted small" style={{ marginTop: "0.25rem" }}>
                This lets you preview the app as admin, captain, ordinary player
                or spectator.
              </p>
              <select
                className="text-input"
                value={adminPreviewRole}
                onChange={(e) => setAdminPreviewRole(e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="captain">Captain</option>
                <option value="player">Player</option>
                <option value="spectator">Spectator</option>
              </select>
            </div>
          )}

          <div className="actions-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="primary-btn"
              style={brightPrimaryStyle}
              onClick={handleVerifyPlayer}
            >
              Sign in with Gmail
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setShowNewPlayerForm((prev) => !prev);
                setNewReqError("");
                setNewReqStatus("");
              }}
            >
              {showNewPlayerForm
                ? "Close new player request"
                : "My name is not on the list"}
            </button>
          </div>

          {verifyError && (
            <p className="error-text" style={{ marginTop: "0.5rem" }}>
              {verifyError}
            </p>
          )}

          {verifyStatus && (
            <p className="success-text" style={{ marginTop: "0.5rem" }}>
              {verifyStatus}
            </p>
          )}

          {membersError && (
            <p className="error-text" style={{ marginTop: "0.5rem" }}>
              {membersError}
            </p>
          )}

          {loadingMembers && (
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
              Loading players…
            </p>
          )}

          {showNewPlayerForm && (
            <div style={joinPanelStyle}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", alignItems: "center" }}>
                <span style={labelCapsuleStyle}>Join request</span>
              </div>
              <h3 style={{ marginBottom: "0.4rem", marginTop: "0.85rem" }}>
                Request to join player list
              </h3>
              <p className="muted small" style={{ marginTop: 0, marginBottom: "0.95rem" }}>
                New players can start here. Add your name, Gmail, and optional details in one clean step.
              </p>

              <div className="field-column">
                <label>Full name</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. Nkululeko Memela"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                />
              </div>

              <div className="field-column">
                <label>Gmail address</label>
                <input
                  type="email"
                  className="text-input"
                  placeholder="e.g. yourname@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="field-column">
                <label>WhatsApp number (optional)</label>
                <input
                  type="tel"
                  className="text-input"
                  placeholder="e.g. 0821234567 or +27821234567"
                  value={newWhatsApp}
                  onChange={(e) => setNewWhatsApp(e.target.value)}
                />
                <p className="muted small" style={{ marginTop: "0.35rem" }}>
                  Used only for TurfKings reminders and updates.
                </p>
              </div>

              <div className="field-column">
                <label>Profile photo (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="text-input"
                  onChange={handleNewPhotoChange}
                  style={compactFileInputStyle}
                />
                <p className="muted small" style={{ marginTop: "0.35rem" }}>
                  Use a face-only portrait, like an ID photo. This helps future player cards look sharp.
                </p>

                {newPhotoPreview ? (
                  <div
                    style={previewCardStyle}
                  >
                    <img
                      src={newPhotoPreview}
                      alt="New player portrait preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                ) : null}

                {newPhotoStatus ? (
                  <p className="success-text" style={{ marginTop: "0.45rem" }}>
                    {newPhotoStatus}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                className="primary-btn"
                style={{ marginTop: "0.75rem" }}
                onClick={handleSubmitNewPlayer}
              >
                Request to join player list
              </button>

              {newReqError && (
                <p className="error-text" style={{ marginTop: "0.5rem" }}>
                  {newReqError}
                </p>
              )}

              {newReqStatus && (
                <p className="success-text" style={{ marginTop: "0.5rem" }}>
                  {newReqStatus}
                </p>
              )}

              <p className="muted small" style={{ marginTop: "0.4rem" }}>
                Your request will go to the TurfKings admin. Once approved
                you&apos;ll appear under the Unseeded tab and can be placed into
                a squad.
              </p>
            </div>
          )}

          <div style={leavePanelStyle}>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setShowWithdrawForm((prev) => !prev);
                setWithdrawError("");
                setWithdrawStatus("");
              }}
              style={{ fontSize: "0.88rem" }}
            >
              {showWithdrawForm ? "Close departure request" : "Need to leave TurfKings?"}
            </button>

            {showWithdrawForm && (
              <div style={leaveInnerBoxStyle}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", alignItems: "center", marginBottom: "0.55rem" }}>
                  <span
                    style={{
                      ...labelCapsuleStyle,
                      background: "rgba(245,158,11,0.10)",
                      border: "1px solid rgba(245,158,11,0.22)",
                      color: "#fcd34d",
                    }}
                  >
                    Departure request
                  </span>
                </div>
                <p className="muted small" style={{ marginBottom: "0.55rem", marginTop: 0 }}>
                  You can request to leave at any time and you will always be welcome to return.
                  If your departure is processed, your private contact details like email and WhatsApp
                  can be cleared from the active system, while your name and match stats may remain in
                  historical archives because they are part of public match records.
                </p>

                <div className="field-column">
                  <label>Optional reason</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="Optional note to admin"
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                  />
                </div>

                <div className="actions-row" style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={handleSubmitWithdrawalRequest}
                    disabled={!selectedMember}
                  >
                    Send departure request
                  </button>
                </div>

                {!selectedMember ? (
                  <p className="muted small" style={{ marginTop: "0.45rem" }}>
                    Select your name first so we know which player is requesting departure.
                  </p>
                ) : null}

                {withdrawError ? (
                  <p className="error-text" style={{ marginTop: "0.45rem" }}>
                    {withdrawError}
                  </p>
                ) : null}

                {withdrawStatus ? (
                  <p className="success-text" style={{ marginTop: "0.45rem" }}>
                    {withdrawStatus}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>
      )}

      {mode === "spectator" && (
        <section className="card" style={premiumPanelStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
            <span style={labelCapsuleStyle}>Spectator</span>
          </div>
          <h2 style={{ marginTop: "0.85rem", marginBottom: "0.35rem" }}>Spectator access</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Browse the experience without claiming a player identity.
          </p>

          <button
            type="button"
            className="primary-btn"
            style={{ ...brightPrimaryStyle, marginTop: "1rem" }}
            onClick={handleContinueAsSpectator}
          >
            Continue as spectator
          </button>
        </section>
      )}

      {isAdminViewer && (
        <section className="card" style={premiumPanelStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
            <span style={labelCapsuleStyle}>Admin desk</span>
          </div>
          <h2 style={{ marginTop: "0.85rem" }}>Pending player requests (admin only)</h2>

          {pendingMembers.length === 0 ? (
            <p className="muted">No pending requests at the moment.</p>
          ) : (
            <ul className="news-list">
              {pendingMembers.map((m) => (
                <li key={m.id} className="news-list-item">
                  <div style={{ flex: 1 }}>
                    <strong>{m.fullName}</strong>{" "}
                    {m.email && (
                      <span className="muted small">({m.email})</span>
                    )}
                  </div>

                  <div className="actions-row" style={{ gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => handleApproveMember(m.id)}
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleRejectMember(m.id)}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="muted small" style={{ marginTop: "0.5rem" }}>
            Approved players will immediately appear as <strong>active</strong>{" "}
            in the dropdown above.
          </p>
        </section>
      )}

      {showWhatsAppReminderModal && whatsAppReminderContext && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: "520px" }}>
            <h3>Add your WhatsApp number</h3>
            <p className="muted small" style={{ marginTop: "0.35rem" }}>
              This is optional, but it helps with future match reminders and updates.
            </p>

            <div className="field-column" style={{ marginTop: "1rem" }}>
              <label>Player</label>
              <div className="text-input" style={{ display: "flex", alignItems: "center" }}>
                {whatsAppReminderContext.fullName}
              </div>
            </div>

            <div className="field-column">
              <label>WhatsApp number (optional)</label>
              <input
                type="tel"
                className="text-input"
                placeholder="e.g. 0821234567 or +27821234567"
                value={whatsAppInput}
                onChange={(e) => {
                  setWhatsAppInput(e.target.value);
                  setWhatsAppReminderError("");
                  setWhatsAppReminderStatus("");
                }}
              />
            </div>

            <p className="muted small" style={{ marginTop: "0.35rem" }}>
              You can skip this for now. We will only remind registered players who still have not added it.
            </p>

            {whatsAppReminderStatus ? (
              <p className="success-text" style={{ marginTop: "0.45rem" }}>
                {whatsAppReminderStatus}
              </p>
            ) : null}

            {whatsAppReminderError ? (
              <p className="error-text" style={{ marginTop: "0.45rem" }}>
                {whatsAppReminderError}
              </p>
            ) : null}

            <div className="actions-row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handleCloseWhatsAppReminder(true)}
              >
                Skip for now
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveWhatsAppReminder}
              >
                Save number & continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhotoReminderModal && photoReminderContext && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: "560px" }}>
            <h3>Add your profile photo</h3>
            <p className="muted small" style={{ marginTop: "0.35rem" }}>
              You are already on the TurfKings system, but you do not have a player photo yet.
              This is optional, but it helps with player cards and match pages.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "132px 1fr",
                gap: "1rem",
                alignItems: "start",
                marginTop: "1rem",
              }}
            >
              <div
                style={previewCardStyle}
              >
                {photoReminderPreview ? (
                  <img
                    src={photoReminderPreview}
                    alt="Player portrait preview"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94a3b8",
                      fontSize: "0.85rem",
                      textAlign: "center",
                      padding: "0.75rem",
                    }}
                  >
                    ID-style portrait preview
                  </div>
                )}
              </div>

              <div>
                <div className="field-column" style={{ marginTop: 0 }}>
                  <label>Player</label>
                  <div className="text-input" style={{ display: "flex", alignItems: "center" }}>
                    {photoReminderContext.fullName}
                  </div>
                </div>

                <div className="field-column">
                  <label>Upload photo (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="text-input"
                    onChange={handleReminderPhotoChange}
                    style={compactFileInputStyle}
                  />
                </div>

                <p className="muted small" style={{ marginTop: "0.35rem" }}>
                  Best result: front-facing face photo, shoulders up, similar to an ID portrait.
                </p>

                {photoReminderStatus ? (
                  <p className="success-text" style={{ marginTop: "0.45rem" }}>
                    {photoReminderStatus}
                  </p>
                ) : null}

                {photoReminderError ? (
                  <p className="error-text" style={{ marginTop: "0.45rem" }}>
                    {photoReminderError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="actions-row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handleClosePhotoReminder(true)}
              >
                Skip for now
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveReminderPhoto}
              >
                Save photo & continue
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdminViewer && memberDepartureAlert && (
        <div
          style={{
            position: "fixed",
            bottom: "6.2rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            padding: "0.95rem 1rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(135deg, rgba(251,191,36,0.16), #111827)",
            border: "1px solid rgba(251,191,36,0.75)",
            color: "#f9fafb",
            boxShadow: "0 14px 40px rgba(15,23,42,0.9)",
            maxWidth: "440px",
            width: "calc(100% - 2rem)",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>
            Player departure request
          </div>

          <div style={{ lineHeight: 1.5 }}>
            <strong>{memberDepartureAlert.name}</strong> wants to leave TurfKings.
          </div>

          <div
            className="actions-row"
            style={{ marginTop: "0.8rem", justifyContent: "flex-start", gap: "0.6rem" }}
          >
            <button
              type="button"
              className="primary-btn"
              onClick={handleProcessDeparture}
            >
              Process Departure
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => setMemberDepartureAlert(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isAdminViewer && withdrawalAlert && (
        <div
          style={{
            position: "fixed",
            bottom: "1rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            padding: "0.9rem 1rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(135deg, rgba(248,113,113,0.15), #111827)",
            border: "1px solid rgba(248,113,113,0.8)",
            color: "#f9fafb",
            boxShadow: "0 14px 40px rgba(15,23,42,0.9)",
            maxWidth: "420px",
            width: "calc(100% - 2rem)",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
            Player pulled out
          </div>

          <div>
            <strong>{withdrawalAlert.name}</strong> has pulled out of the
            year-end function
            {withdrawalAlert.friends
              ? ` (with ${withdrawalAlert.friends} friend${
                  withdrawalAlert.friends === 1 ? "" : "s"
                })`
              : ""}
            .
          </div>

          <button
            type="button"
            onClick={() => setWithdrawalAlert(null)}
            style={{
              marginTop: "0.6rem",
              padding: "0.3rem 0.7rem",
              borderRadius: "999px",
              border: "none",
              background: "rgba(59,130,246,0.18)",
              color: "#bfdbfe",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}


    </div>
  );
}