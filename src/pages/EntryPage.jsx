// src/pages/EntryPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import TurfKingsLogo from "../assets/TurfKings_logo.jpeg";
import TeamPhoto from "../assets/TurfKings.jpg";
import { buildClubIdentity } from "../core/clubIdentity.js";
import { removePlayerFromSavedLineups } from "../core/lineups.js";

const FANM_HOME_LOGO = "/HomePage/Logo_icon.jpeg";

import { auth, signInWithGoogle } from "../firebaseConfig";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  where,
  serverTimestamp,
  setDoc,
  query,
  orderBy,
  limit,
  deleteField,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { isCaptainEmail } from "../core/captainAuth.js";
import { ClubChatWidget } from "../components/ClubChat/ClubChatWidget.jsx";
import {
  findCandidatePlatformIdentity,
} from "../storage/platformIdentityRepository.js";

const MEMBERS_COLLECTION = "members";
const PLAYERS_COLLECTION = "players";
const PLAYER_PHOTOS_COLLECTION = "playerPhotos";
const WITHDRAWAL_REQUESTS_COLLECTION = "member_withdrawal_requests";

const DEFAULT_CLUB_ID = "turf-kings";
const DEFAULT_CLUB_NAME = "Turf Kings FC";

function safeClubIdFromSelectedClub(club) {
  return String(club?.id || DEFAULT_CLUB_ID).trim() || DEFAULT_CLUB_ID;
}

function safeClubNameFromSelectedClub(club) {
  return String(club?.name || DEFAULT_CLUB_NAME).trim() || DEFAULT_CLUB_NAME;
}

function clubRootDocRef(clubId) {
  return doc(db, "clubs", safeClubIdFromSelectedClub({ id: clubId }));
}

function clubCollectionRef(clubId, collectionName) {
  return collection(db, "clubs", safeClubIdFromSelectedClub({ id: clubId }), collectionName);
}

function clubDocRef(clubId, collectionName, docId) {
  return doc(db, "clubs", safeClubIdFromSelectedClub({ id: clubId }), collectionName, String(docId || "").trim());
}

function membersCollectionRef(clubId) {
  return clubCollectionRef(clubId, MEMBERS_COLLECTION);
}

function memberDocRef(clubId, memberId) {
  return clubDocRef(clubId, MEMBERS_COLLECTION, memberId);
}

function playersCollectionRef(clubId) {
  return clubCollectionRef(clubId, PLAYERS_COLLECTION);
}

function playerDocRef(clubId, playerId) {
  return clubDocRef(clubId, PLAYERS_COLLECTION, playerId);
}

function playerPhotosCollectionRef(clubId) {
  return clubCollectionRef(clubId, PLAYER_PHOTOS_COLLECTION);
}

function playerPhotoDocRef(clubId, photoId) {
  return clubDocRef(clubId, PLAYER_PHOTOS_COLLECTION, photoId);
}

import HomePage_HUB_ClubProfileEditorModal from "../components/HomePage_HUB/HomePage_HUB_ClubProfileEditorModal.jsx";
function withdrawalRequestsCollectionRef(clubId) {
  return clubCollectionRef(clubId, WITHDRAWAL_REQUESTS_COLLECTION);
}

function withdrawalRequestDocRef(clubId, requestId) {
  return clubDocRef(clubId, WITHDRAWAL_REQUESTS_COLLECTION, requestId);
}

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

const rejoiningBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.2rem 0.55rem",
  borderRadius: "999px",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.025em",
  textTransform: "uppercase",
  background: "linear-gradient(90deg, rgba(16,185,129,0.18), rgba(34,211,238,0.13))",
  border: "1px solid rgba(45,212,191,0.42)",
  color: "#99f6e4",
  boxShadow: "0 0 18px rgba(45,212,191,0.12)",
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

async function makeLandscapePhotoDataUrl(file, width = 900, height = 506) {
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

        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, width, height);

        const scale = Math.max(width / img.width, height / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (width - drawW) / 2;
        const dy = (height - drawH) / 2;

        ctx.drawImage(img, dx, dy, drawW, drawH);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = raw;
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

async function findExistingPhotoDataByIdentity(identityLike, clubId = DEFAULT_CLUB_ID) {
  const ids = getPhotoDocIdsFromIdentity(identityLike);

  for (const id of ids) {
    try {
      const snap = await getDoc(playerPhotoDocRef(clubId, id));
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
  clubId = DEFAULT_CLUB_ID,
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
    playerPhotoDocRef(clubId, preferredId),
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

async function upsertPlayerFromMember(member, clubId = DEFAULT_CLUB_ID) {
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
      playerDocRef(clubId, playerId),
      {
        name: displayName,
        fullName: fullName || displayName,
        shortName: shortName || displayName,
        email: member.email || "",
        whatsappNumber: member.whatsappNumber || "",
        phoneNumber:
          member.phoneNumber ||
          member.whatsappNumber ||
          "",
        photoUrl: member.photoUrl || "",
        platformIdentityUid:
          member.platformIdentityUid ||
          member.uid ||
          "",
        platformIdentityConfirmed:
          member.platformIdentityConfirmed === true,
        platformIdentitySourceClubId:
          member.platformIdentitySourceClubId || "",
        platformIdentitySourceMemberId:
          member.platformIdentitySourceMemberId || "",
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

async function resolveSignedInRoleFromPlayerDoc(member, emailFromGoogle = "", clubId = DEFAULT_CLUB_ID) {
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
      const snap = await getDoc(playerDocRef(clubId, pid));
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

function getPrivateContactDeletePayload(extra = {}) {
  return {
    email: deleteField(),
    whatsappNumber: deleteField(),
    phoneNumber: deleteField(),
    whatsappNumberUpdatedAt: deleteField(),
    whatsappVerificationAdminName: deleteField(),
    whatsappVerificationStatus: deleteField(),
    ...extra,
  };
}

async function clearWithdrawnPlayerPrivateDetails({ clubId = DEFAULT_CLUB_ID, memberId = "", playerId = "" }) {
  if (memberId) {
    await updateDoc(
      memberDocRef(clubId, memberId),
      getPrivateContactDeletePayload({
        status: "withdrawn",
        updatedAt: serverTimestamp(),
      })
    );
  }

  if (playerId) {
    try {
      await updateDoc(
        playerDocRef(clubId, playerId),
        getPrivateContactDeletePayload({
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err) {
      console.error("[EntryPage] Could not clear player contact details:", err);
    }
  }
}

export function EntryPage({
  identity,
  selectedClub,
  entryPageIntent = null,
  onComplete,
  onDevSkipToLanding,
  onGoHome,
  onClubUpdated,
  onOpenClubChat,
}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [clubHeroOverride, setClubHeroOverride] = useState("");
  const [clubHeroStatus, setClubHeroStatus] = useState("");
  const [clubHeroError, setClubHeroError] = useState("");
  const [entryClubProfileOverride, setEntryClubProfileOverride] = useState(null);
  const [showEntryClubEditor, setShowEntryClubEditor] = useState(false);

  const activeClub = useMemo(() => {
    const baseClub = selectedClub || {
      id: DEFAULT_CLUB_ID,
      name: DEFAULT_CLUB_NAME,
      logoUrl: TurfKingsLogo,
      image: TeamPhoto,
      weeklyPlayTime: "Wednesdays · 19:00",
    };

    return entryClubProfileOverride
      ? { ...baseClub, ...entryClubProfileOverride }
      : baseClub;
  }, [selectedClub, entryClubProfileOverride]);

  const activeClubIdentity = useMemo(
    () => buildClubIdentity(activeClub),
    [activeClub]
  );

  const activeClubId = activeClubIdentity.id;
  const activeClubName = activeClubIdentity.name;
  const activeClubShortName = activeClubIdentity.shortName;
  const isTurfKingsClub = activeClubIdentity.isTurfKings;
  const activeClubLogoSrc = activeClubIdentity.logoUrl;
  const activeClubHeroImage =
    clubHeroOverride ||
    activeClub?.heroImage ||
    activeClub?.teamPhoto ||
    (isTurfKingsClub ? TeamPhoto : "");

  const canEditClubHero = false;

  useEffect(() => {
    if (!activeClubId) return;

    const unsub = onSnapshot(
      doc(db, "clubs", activeClubId),
      (snap) => {
        if (!snap.exists()) return;

        const freshClub = {
          id: snap.id,
          ...(snap.data() || {}),
        };

        setEntryClubProfileOverride((current) => ({
          ...(current || {}),
          ...freshClub,
        }));
      },
      (error) => {
        console.error("[EntryPage] Could not load latest club profile:", error);
      }
    );

    return () => unsub();
  }, [activeClubId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsub();
  }, []);

  const isAdminViewer = (() => {
    const email = String(currentUser?.email || "").trim().toLowerCase();
    const uid = String(currentUser?.uid || "").trim();

    if (!email && !uid) return false;

    const clubAdminUids = [
      activeClub?.createdByUid,
      activeClub?.ownerUid,
      ...(Array.isArray(activeClub?.adminUids) ? activeClub.adminUids : []),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (uid && clubAdminUids.includes(uid)) return true;

    const clubAdminEmails = [
      activeClub?.adminEmail,
      activeClub?.ownerEmail,
      activeClub?.captainEmail,
      activeClub?.createdByEmail,
      activeClub?.createdBy,
      activeClub?.captain?.email,
      ...(Array.isArray(activeClub?.adminEmails) ? activeClub.adminEmails : []),
      ...(Array.isArray(activeClub?.captainEmails) ? activeClub.captainEmails : []),
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);

    return isCaptainEmail(email) || clubAdminEmails.includes(email);
  })();

  const realCanEditClubHero = isAdminViewer && !isTurfKingsClub;

  const [withdrawalAlert, setWithdrawalAlert] = useState(null);

  const [memberDepartureAlerts, setMemberDepartureAlerts] = useState([]);
  const [incomingChallengeAlerts, setIncomingChallengeAlerts] = useState([]);
  const [challengeNoticeAlerts, setChallengeNoticeAlerts] = useState([]);
  const [fixtureAlternativeModal, setFixtureAlternativeModal] = useState(null);
  const [fixtureAlternativeMessage, setFixtureAlternativeMessage] = useState("");
  const [fixtureDiscussionModal, setFixtureDiscussionModal] = useState(null);
  const [fixtureDiscussionMessages, setFixtureDiscussionMessages] = useState([]);
  const [fixtureDiscussionDraft, setFixtureDiscussionDraft] = useState("");

  const [challengerChatFixture, setChallengerChatFixture] = useState(null);
  const [activeChatRoom, setActiveChatRoom] = useState("club");
  const [challengerChatMessages, setChallengerChatMessages] = useState([]);
  const [challengerChatDraft, setChallengerChatDraft] = useState("");
  const [challengerChatEmojiOpen, setChallengerChatEmojiOpen] = useState(false);
  const challengerChatEndRef = useRef(null);

  const [clubChatMessages, setClubChatMessages] = useState([]);
  const [clubChatDraft, setClubChatDraft] = useState("");
  const [clubChatOpen, setClubChatOpen] = useState(false);
  const [clubChatTeaseOpen, setClubChatTeaseOpen] = useState(false);
  const [clubChatEmojiOpen, setClubChatEmojiOpen] = useState(false);
  const [clubChatLastSeenMs, setClubChatLastSeenMs] = useState(() => {
    try {
      return Number(window.localStorage.getItem(`fanm_club_chat_seen_${activeClubId}`) || 0);
    } catch {
      return 0;
    }
  });
  const clubChatEndRef = useRef(null);
  const [isAdminNoticePanelOpen, setIsAdminNoticePanelOpen] = useState(false);
  const [activeAdminNoticeIndex, setActiveAdminNoticeIndex] = useState(0);
  const [dismissedPendingNoticeIds, setDismissedPendingNoticeIds] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("tk_dismissedPendingNoticeIds") || "[]");
    } catch (err) {
      return [];
    }
  });

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
      withdrawalRequestsCollectionRef(activeClubId),
      orderBy("requestedAt", "desc"),
      limit(10)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setMemberDepartureAlerts([]);
        return;
      }

      const unreadDepartures = snap.docs
        .map((d) => {
          const data = d.data() || {};
          return { docSnap: d, data };
        })
        .filter(({ data }) => !data.adminAcknowledgedAt && !data.adminAcknowledgedAtMs)
        .map(({ docSnap, data }) => ({
          requestId: docSnap.id,
          memberId: data.memberId || "",
          playerId: data.playerId || "",
          name: data.fullName || data.shortName || "Unknown player",
          shortName: data.shortName || "",
          requestedAt: Number(data.requestedAtMs || 0),
          isLegacyNotice:
            data.outcome === "withdrawn" || data.outcome === "withdrawn_by_player",
        }))
        .filter((item) => item.requestedAt);

      setMemberDepartureAlerts(unreadDepartures);

      if (unreadDepartures.length > 0) {
        try {
          navigator.vibrate?.(250);
        } catch (err) {
          // Vibration is optional and may be blocked on some devices/browsers.
        }
      }
    });

    return () => unsub();
  }, [isAdminViewer, activeClubId]);

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
    if (!isAdminViewer || !activeClubId) {
      setChallengeNoticeAlerts([]);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "challengeNotices"),
      orderBy("createdAtMs", "desc"),
      limit(12)
    );

    const unsub = onSnapshot(q, (snap) => {
      const notices = snap.docs
        .map((d) => ({
          noticeDocId: d.id,
          ...(d.data() || {}),
        }))
        .filter((notice) => notice.status !== "acknowledged");

      setChallengeNoticeAlerts(notices);
    });

    return () => unsub();
  }, [isAdminViewer, activeClubId]);


  useEffect(() => {
    if (!isAdminViewer) return;

    const q = query(
      collection(db, "clubs", activeClubId, "incomingChallenges"),
      orderBy("createdAtMs", "desc"),
      limit(12)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setIncomingChallengeAlerts([]);
        return;
      }

      const challenges = snap.docs
        .map((d) => {
          const data = d.data() || {};

          return {
            challengeId: d.id,
            challengerClubId: data.challengerClubId || "",
            challengerClubName: data.challengerClubName || "Unknown club",
            challengerAdminName: data.challengerAdminName || "Club admin",
            proposedDate: data.proposedDate || "",
            proposedKickoff: data.proposedKickoff || "",
            format: data.format || "5v5",
            message: data.message || "",
            status: data.status || "pending",
            createdAtMs: Number(data.createdAtMs || 0),
          };
        })
        .filter((item) => item.status === "pending");

      setIncomingChallengeAlerts(challenges);
    });

    return () => unsub();
  }, [activeClubId, isAdminViewer]);


  useEffect(() => {
    setLoadingMembers(true);
    setMembersError("");

    const colRef = membersCollectionRef(activeClubId);

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            fullName:
              data.fullName ||
              data.displayName ||
              data.name ||
              data.playerName ||
              data.email?.split("@")[0] ||
              "Unnamed player",

            shortName:
              data.shortName ||
              data.fullName?.split(" ")[0] ||
              data.displayName?.split(" ")[0] ||
              data.name?.split(" ")[0] ||
              data.playerName?.split(" ")[0] ||
              data.email?.split("@")[0] ||
              "Player",
            email: data.email || "",
            whatsappNumber: data.whatsappNumber || "",
            phoneNumber: data.phoneNumber || "",
            photoUrl:
              data.photoUrl ||
              data.profilePhotoUrl ||
              "",
            uid: data.uid || "",
            platformIdentityUid:
              data.platformIdentityUid ||
              data.uid ||
              "",
            platformIdentityConfirmed:
              data.platformIdentityConfirmed === true,
            platformIdentitySourceClubId:
              data.platformIdentitySourceClubId || "",
            platformIdentitySourceMemberId:
              data.platformIdentitySourceMemberId || "",
            playerId:
              data.playerId ||
              slugFromName(
                data.shortName ||
                data.fullName ||
                data.displayName ||
                data.name ||
                ""
              ),
            role: data.role || "player",
            previousRoleBeforeAdmin:
              data.previousRoleBeforeAdmin || "",
            status: data.status || "active",
            createdAt: data.createdAt || null,
            rejoinRequestedAt: data.rejoinRequestedAt || null,
          };
        });

        console.log(
          "[EntryPage] Loaded members for",
          activeClubId,
          list.map((m) => ({
            id: m.id,
            fullName: m.fullName,
            shortName: m.shortName,
            email: m.email,
            role: m.role,
            status: m.status,
          }))
        );

        list.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setMembers(list);
        setLoadingMembers(false);
      },
      (err) => {
        console.error("Error loading members:", err);
        setMembersError(`Could not load ${activeClubName} members.`);
        setLoadingMembers(false);
      }
    );

    return () => unsub();
  }, [activeClubId, activeClubName]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members]
  );

  const pendingMembers = useMemo(
    () => members.filter((m) => m.status === "pending"),
    [members]
  );

  const adminNotices = useMemo(() => {
    if (!isAdminViewer) return [];

    const notices = [];

    memberDepartureAlerts.forEach((departure) => {
      notices.push({
        id: `departure-${departure.requestId}`,
        type: "departure",
        title: `${activeClubName} notice`,
        tag: "Admin alert",
        icon: "🔔",
        message: (
          <>
            <strong>{departure.name}</strong> has sadly decided to leave the group.
          </>
        ),
        helper:
          "Acknowledging this notice will mark the departure as read and remove any remaining private contact details from active records.",
        payload: departure,
      });
    });

    incomingChallengeAlerts.forEach((challenge) => {
      notices.push({
        id: `challenge-${challenge.challengeId}`,
        type: "club_challenge",
        title: "Incoming challenge",
        tag: challenge.format.toUpperCase(),
        icon: "⚔️",
        message: (
          <>
            <strong>{challenge.challengerClubName}</strong> challenged {activeClubName}.
          </>
        ),
        helper:
          `${challenge.proposedDate || "No date"} · ${challenge.proposedKickoff || "No kickoff"}${challenge.message ? ` · ${challenge.message}` : ""}`,
        payload: challenge,
      });
    });

    challengeNoticeAlerts.forEach((notice) => {
      if (notice.type === "challenge_cancelled") {
        notices.push({
          id: `challenge-notice-${notice.noticeDocId}`,
          type: "challenge_cancelled",
          title: "Fixture cancelled",
          tag: "Club Challenge",
          icon: "⚠️",
          message: (
            <>
              <strong>{notice.fromClubName || "A club"}</strong> cancelled the challenge between{" "}
              <strong>{notice.homeClubName || "Home club"}</strong> and{" "}
              <strong>{notice.awayClubName || "Away club"}</strong>.
            </>
          ),
          helper:
            notice.reason
              ? `Reason: ${notice.reason}`
              : "No cancellation reason was provided.",
          payload: notice,
        });
        return;
      }

      if (notice.type === "challenge_change_requested") {
        notices.push({
          id: `challenge-change-${notice.noticeDocId}`,
          type: "challenge_change_requested",
          title: "Fixture update requested",
          tag: "Club Challenge",
          icon: "📝",
          message: (
            <>
              <strong>{notice.fromClubName || "A club"}</strong> wants to update the fixture details.
            </>
          ),
          helper:
            `${notice.proposedDate || "No date"} · ${notice.proposedKickoff || "No kickoff"} · ${notice.venue || "No venue"} · ${(notice.format || "5v5").toUpperCase()}${notice.reason ? ` · ${notice.reason}` : ""}`,
          payload: notice,
        });
        return;
      }

      if (notice.type === "challenge_change_reply") {
        notices.push({
          id: `challenge-reply-${notice.noticeDocId}`,
          type: "challenge_change_reply",
          title: "Alternative proposed",
          tag: "Club Challenge",
          icon: "💬",
          message: (
            <>
              <strong>{notice.fromClubName || "A club"}</strong> replied with an alternative proposal.
            </>
          ),
          helper: notice.message || "No message was included.",
          payload: notice,
        });
      }
    });


    pendingMembers
      .forEach((m) => {
        notices.push({
          id: `pending-${m.id}`,
          type: "new_player",
          title: "New player request",
          tag: m.rejoinRequestedAt ? "Rejoining player" : "Pending signup",
          icon: m.rejoinRequestedAt ? "↩️" : "✨",
          message: (
            <>
              <strong>{m.fullName}</strong>{" "}
              {m.rejoinRequestedAt
                ? `wants to rejoin ${activeClubName}.`
                : `wants to join ${activeClubName}.`}
            </>
          ),
          helper:
            "Approve or reject this request directly here. The old Admin Desk section has been removed to keep the entry page clean.",
          payload: m,
        });
      });

    return notices;
  }, [
    activeClubName,
    incomingChallengeAlerts,
    challengeNoticeAlerts,
    isAdminViewer,
    memberDepartureAlerts,
    pendingMembers,
  ]);

  const notificationCount = adminNotices.length;
  const activeAdminNotice = adminNotices[Math.min(activeAdminNoticeIndex, Math.max(notificationCount - 1, 0))] || null;

  useEffect(() => {
    if (notificationCount > 0) {
      setIsAdminNoticePanelOpen(true);
    } else {
      setIsAdminNoticePanelOpen(false);
      setActiveAdminNoticeIndex(0);
    }
  }, [notificationCount]);

  useEffect(() => {
    if (activeAdminNoticeIndex > Math.max(notificationCount - 1, 0)) {
      setActiveAdminNoticeIndex(Math.max(notificationCount - 1, 0));
    }
  }, [activeAdminNoticeIndex, notificationCount]);

  const [selectedMemberId, setSelectedMemberId] = useState(() => {
    if (identity?.clubId === activeClubId && identity?.memberId) return identity.memberId;
    return "";
  });

  useEffect(() => {
    setSelectedMemberId(identity?.clubId === activeClubId && identity?.memberId ? identity.memberId : "");
    setVerifyError("");
    setVerifyStatus("");
  }, [activeClubId]);
  const [verifyError, setVerifyError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState("");

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);

  useEffect(() => {
    if (entryPageIntent === "join-club") {
      setShowNewPlayerForm(true);
      setNewReqError("");
      setNewReqStatus("");
    }
  }, [entryPageIntent]);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newReqStatus, setNewReqStatus] = useState("");
  const [newReqError, setNewReqError] = useState("");
  const [newPhotoFile, setNewPhotoFile] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState("");
  const [newPhotoStatus, setNewPhotoStatus] = useState("");
  const [newWhatsApp, setNewWhatsApp] = useState("");
  const [joinIdentityCandidate, setJoinIdentityCandidate] = useState(null);
  const [joinIdentityLookupPending, setJoinIdentityLookupPending] =
    useState(false);

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
  const [showAdminPreviewControls, setShowAdminPreviewControls] = useState(false);

  const [showAdminPrivilegesModal, setShowAdminPrivilegesModal] = useState(false);
  const [clubManagementSection, setClubManagementSection] = useState(null);

  const [profileMemberId, setProfileMemberId] = useState("");
  const [profileDraft, setProfileDraft] = useState({
    fullName: "",
    email: "",
    whatsappNumber: "",
    photoData: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [adminPrivilegesMemberId, setAdminPrivilegesMemberId] = useState("");
  const [adminPrivilegesSaving, setAdminPrivilegesSaving] = useState(false);
  const [adminPrivilegesError, setAdminPrivilegesError] = useState("");
  const [adminPrivilegesStatus, setAdminPrivilegesStatus] = useState("");

  const [terminationMemberId, setTerminationMemberId] = useState("");
  const [terminationMember, setTerminationMember] = useState(null);
  const [terminationConfirmation, setTerminationConfirmation] = useState("");
  const [terminationSaving, setTerminationSaving] = useState(false);
  const [terminationError, setTerminationError] = useState("");

  const [identitySafetyAudit, setIdentitySafetyAudit] = useState(null);
  const [identitySafetyAuditLoading, setIdentitySafetyAuditLoading] =
    useState(false);
  const [identitySafetyAuditError, setIdentitySafetyAuditError] = useState("");

  const adminPrivilegesMember = useMemo(
    () =>
      members.find((member) => member.id === adminPrivilegesMemberId) ||
      null,
    [members, adminPrivilegesMemberId]
  );

  const terminationCandidate = useMemo(
    () =>
      members.find((member) => member.id === terminationMemberId) ||
      null,
    [members, terminationMemberId]
  );

  const signedInMember = useMemo(() => {
    const identityMemberId = String(
      identity?.memberId ||
      identity?.sourceMemberId ||
      ""
    ).trim();

    const identityPlayerId = String(
      identity?.playerId || ""
    ).trim();

    const signedInEmail = String(
      currentUser?.email ||
      identity?.email ||
      ""
    )
      .trim()
      .toLowerCase();

    return (
      members.find((member) => {
        const memberEmail = String(member?.email || "")
          .trim()
          .toLowerCase();

        return (
          (identityMemberId && String(member?.id || "") === identityMemberId) ||
          (
            identityPlayerId &&
            String(member?.playerId || "") === identityPlayerId
          ) ||
          (
            signedInEmail &&
            memberEmail &&
            memberEmail === signedInEmail
          )
        );
      }) || null
    );
  }, [members, identity, currentUser]);

  const profileMember = useMemo(
    () =>
      members.find((member) => member.id === profileMemberId) ||
      null,
    [members, profileMemberId]
  );

  const canOpenClubManagement = Boolean(
    isAdminViewer || signedInMember
  );

  const canEditSelectedProfile = Boolean(
    profileMember &&
    (
      isAdminViewer ||
      profileMember.id === signedInMember?.id
    )
  );

  const protectedMainAdminEmail = String(
    activeClub?.captain?.email ||
    activeClub?.captainEmail ||
    ""
  )
    .trim()
    .toLowerCase();

  const adminPrivilegesMemberEmail = String(
    adminPrivilegesMember?.email || ""
  )
    .trim()
    .toLowerCase();

  const adminPrivilegesMemberUid = String(
    adminPrivilegesMember?.uid ||
    adminPrivilegesMember?.platformIdentityUid ||
    ""
  ).trim();

  const currentClubAdminEmails = (
    Array.isArray(activeClub?.adminEmails)
      ? activeClub.adminEmails
      : []
  )
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  const currentClubAdminUids = (
    Array.isArray(activeClub?.adminUids)
      ? activeClub.adminUids
      : []
  )
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const adminPrivilegesMemberIsAdmin = Boolean(
    adminPrivilegesMember &&
    (
      adminPrivilegesMember.role === "admin" ||
      (
        adminPrivilegesMemberEmail &&
        currentClubAdminEmails.includes(adminPrivilegesMemberEmail)
      ) ||
      (
        adminPrivilegesMemberUid &&
        currentClubAdminUids.includes(adminPrivilegesMemberUid)
      )
    )
  );

  const adminPrivilegesMemberIsProtected = Boolean(
    adminPrivilegesMemberEmail &&
    protectedMainAdminEmail &&
    adminPrivilegesMemberEmail === protectedMainAdminEmail
  );

  const currentClubAdministrators = useMemo(() => {
    return members
      .filter((member) => {
        const email = String(member?.email || "").trim().toLowerCase();
        const uid = String(
          member?.uid || member?.platformIdentityUid || ""
        ).trim();

        return (
          member?.role === "admin" ||
          (email && currentClubAdminEmails.includes(email)) ||
          (uid && currentClubAdminUids.includes(uid))
        );
      })
      .map((member) => {
        const email = String(member?.email || "").trim().toLowerCase();

        return {
          ...member,
          isMainAdmin: Boolean(
            email &&
            protectedMainAdminEmail &&
            email === protectedMainAdminEmail
          ),
        };
      })
      .sort((a, b) => {
        if (a.isMainAdmin && !b.isMainAdmin) return -1;
        if (!a.isMainAdmin && b.isMainAdmin) return 1;
        return String(a.fullName || "").localeCompare(
          String(b.fullName || "")
        );
      });
  }, [
    members,
    currentClubAdminEmails,
    currentClubAdminUids,
    protectedMainAdminEmail,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileDraft() {
      setProfileError("");
      setProfileStatus("");

      if (!profileMember?.id) {
        setProfileDraft({
          fullName: "",
          email: "",
          whatsappNumber: "",
          photoData: "",
        });
        return;
      }

      const existingPhoto = await findExistingPhotoDataByIdentity(
        profileMember,
        activeClubId
      );

      if (cancelled) return;

      setProfileDraft({
        fullName: toTitleCase(
          profileMember.fullName ||
          profileMember.shortName ||
          ""
        ),
        email: String(profileMember.email || "").trim(),
        whatsappNumber: String(
          profileMember.whatsappNumber ||
          profileMember.phoneNumber ||
          ""
        ).trim(),
        photoData:
          existingPhoto?.photoData ||
          profileMember.photoData ||
          profileMember.photoUrl ||
          "",
      });
    }

    loadProfileDraft();

    return () => {
      cancelled = true;
    };
  }, [profileMember, activeClubId]);

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    setProfileError("");
    setProfileStatus("");

    try {
      const photoData = await makePortraitPhotoDataUrl(file);
      setProfileDraft((current) => ({
        ...current,
        photoData,
      }));
    } catch (error) {
      console.error("[EntryPage] Could not prepare profile photo:", error);
      setProfileError("Could not prepare this photo.");
    }
  };

  const handleSavePlayerProfile = async () => {
    if (!canEditSelectedProfile || !profileMember?.id) {
      setProfileError("You cannot edit this profile.");
      return;
    }

    const fullName = toTitleCase(profileDraft.fullName);
    const email = String(profileDraft.email || "")
      .trim()
      .toLowerCase();
    const whatsappNumber = normalizeWhatsAppNumber(
      profileDraft.whatsappNumber
    );

    if (!fullName) {
      setProfileError("Enter the player's full name.");
      return;
    }

    if (email && !email.includes("@")) {
      setProfileError("Enter a valid email address.");
      return;
    }

    if (
      whatsappNumber &&
      !looksLikeWhatsAppNumber(whatsappNumber)
    ) {
      setProfileError("Enter a valid WhatsApp number.");
      return;
    }

    setProfileSaving(true);
    setProfileError("");
    setProfileStatus("");

    try {
      const existingPlayerId =
        String(profileMember.playerId || "").trim() ||
        slugFromName(
          profileMember.shortName ||
          profileMember.fullName ||
          fullName
        );

      const memberPatch = {
        fullName,
        shortName: fullName,
        email,
        whatsappNumber,
        phoneNumber: whatsappNumber,
        profileUpdatedAt: serverTimestamp(),
        profileUpdatedByUid: currentUser?.uid || "",
        profileUpdatedByRole: isAdminViewer ? "admin" : "player",
        updatedAt: serverTimestamp(),
      };

      if (profileDraft.photoData) {
        memberPatch.photoData = profileDraft.photoData;
        memberPatch.photoUrl = profileDraft.photoData;
      }

      const batch = writeBatch(db);

      batch.set(
        memberDocRef(activeClubId, profileMember.id),
        memberPatch,
        { merge: true }
      );

      if (existingPlayerId) {
        batch.set(
          playerDocRef(activeClubId, existingPlayerId),
          {
            name: fullName,
            fullName,
            shortName: fullName,
            email,
            whatsappNumber,
            phoneNumber: whatsappNumber,
            photoUrl:
              profileDraft.photoData ||
              profileMember.photoUrl ||
              "",
            sourceMemberId: profileMember.id,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();

      if (profileDraft.photoData) {
        await savePlayerPhotoForIdentity({
          clubId: activeClubId,
          fullName,
          shortName: fullName,
          playerId: existingPlayerId,
          email,
          role: profileMember.role || "player",
          status: profileMember.status || "active",
          sourceMemberId: profileMember.id,
          photoData: profileDraft.photoData,
        });
      }

      setProfileStatus("Profile updated.");
    } catch (error) {
      console.error("[EntryPage] Could not update profile:", error);
      setProfileError("Could not save these profile changes.");
    } finally {
      setProfileSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function runIdentitySafetyAudit() {
      const member = terminationCandidate;

      setIdentitySafetyAudit(null);
      setIdentitySafetyAuditError("");

      if (!member?.id) {
        setIdentitySafetyAuditLoading(false);
        return;
      }

      setIdentitySafetyAuditLoading(true);

      try {
        const memberEmail = String(member.email || "")
          .trim()
          .toLowerCase();

        const memberUid = String(member.uid || "").trim();

        const platformIdentityUid = String(
          member.platformIdentityUid || memberUid || ""
        ).trim();

        const playerId =
          String(member.playerId || "").trim() ||
          slugFromName(member.shortName || member.fullName || "");

        const selectedMemberKey = String(member.id || "");

        const duplicateEmailMembers = memberEmail
          ? members.filter((candidate) => {
              if (String(candidate.id || "") === selectedMemberKey) return false;

              return (
                String(candidate.email || "").trim().toLowerCase() ===
                memberEmail
              );
            })
          : [];

        const duplicateUidMembers = memberUid
          ? members.filter((candidate) => {
              if (String(candidate.id || "") === selectedMemberKey) return false;

              return String(candidate.uid || "").trim() === memberUid;
            })
          : [];

        const duplicatePlatformIdentityMembers = platformIdentityUid
          ? members.filter((candidate) => {
              if (String(candidate.id || "") === selectedMemberKey) return false;

              return (
                String(
                  candidate.platformIdentityUid ||
                    candidate.uid ||
                    ""
                ).trim() === platformIdentityUid
              );
            })
          : [];

        const duplicatePlayerIdMembers = playerId
          ? members.filter((candidate) => {
              if (String(candidate.id || "") === selectedMemberKey) return false;

              const candidatePlayerId =
                String(candidate.playerId || "").trim() ||
                slugFromName(
                  candidate.shortName ||
                    candidate.fullName ||
                    ""
                );

              return candidatePlayerId === playerId;
            })
          : [];

        let playerProfileExists = false;

        if (playerId) {
          try {
            const playerSnap = await getDoc(
              playerDocRef(activeClubId, playerId)
            );
            playerProfileExists = playerSnap.exists();
          } catch (error) {
            console.warn(
              "[EntryPage] Identity audit could not read player profile:",
              error
            );
          }
        }

        async function countMatchingDocuments(collectionName, matches) {
          const paths = new Set();

          for (const [fieldName, fieldValue] of matches) {
            const cleanValue = String(fieldValue || "").trim();
            if (!cleanValue) continue;

            try {
              const snap = await getDocs(
                query(
                  clubCollectionRef(activeClubId, collectionName),
                  where(fieldName, "==", cleanValue)
                )
              );

              snap.docs.forEach((document) => {
                paths.add(document.ref.path);
              });
            } catch (error) {
              console.warn(
                `[EntryPage] Identity audit could not query ${collectionName}.${fieldName}:`,
                error
              );
            }
          }

          return paths.size;
        }

        const [photoCount, signupCount, pendingSignupCount] =
          await Promise.all([
            countMatchingDocuments(PLAYER_PHOTOS_COLLECTION, [
              ["sourceMemberId", member.id],
              ["memberId", member.id],
              ["playerId", playerId],
              ["email", memberEmail],
            ]),
            countMatchingDocuments("matchSignups", [
              ["memberId", member.id],
              ["playerId", playerId],
              ["email", memberEmail],
            ]),
            countMatchingDocuments("pendingSignups", [
              ["memberId", member.id],
              ["playerId", playerId],
              ["email", memberEmail],
            ]),
          ]);

        const currentEmail = String(currentUser?.email || "")
          .trim()
          .toLowerCase();

        const currentUid = String(currentUser?.uid || "").trim();

        const isSelf = Boolean(
          (memberEmail &&
            currentEmail &&
            memberEmail === currentEmail) ||
            (memberUid &&
              currentUid &&
              memberUid === currentUid) ||
            (platformIdentityUid &&
              currentUid &&
              platformIdentityUid === currentUid)
        );

        const isProtectedMainAdmin = Boolean(
          memberEmail &&
            protectedMainAdminEmail &&
            memberEmail === protectedMainAdminEmail
        );

        const blockers = [];
        const warnings = [];

        if (isProtectedMainAdmin) {
          blockers.push(
            "This is the protected main club administrator."
          );
        }

        if (isSelf) {
          blockers.push(
            "This member shares the currently signed-in administrator account."
          );
        }

        if (duplicateEmailMembers.length) {
          blockers.push(
            `Email is shared with ${duplicateEmailMembers.length} other member record${duplicateEmailMembers.length === 1 ? "" : "s"}.`
          );
        }

        if (duplicateUidMembers.length) {
          blockers.push(
            `Firebase UID is shared with ${duplicateUidMembers.length} other member record${duplicateUidMembers.length === 1 ? "" : "s"}.`
          );
        }

        if (duplicatePlatformIdentityMembers.length) {
          blockers.push(
            `Platform identity is shared with ${duplicatePlatformIdentityMembers.length} other member record${duplicatePlatformIdentityMembers.length === 1 ? "" : "s"}.`
          );
        }

        if (duplicatePlayerIdMembers.length) {
          blockers.push(
            `Player profile identifier is shared with ${duplicatePlayerIdMembers.length} other member record${duplicatePlayerIdMembers.length === 1 ? "" : "s"}.`
          );
        }

        if (!memberEmail) {
          warnings.push("No verified email is stored for this member.");
        }

        if (!memberUid && !platformIdentityUid) {
          warnings.push(
            "No Firebase or platform identity UID is stored."
          );
        }

        if (!playerProfileExists) {
          warnings.push(
            "No matching active player profile was found."
          );
        }

        const safe = blockers.length === 0;

        if (!cancelled) {
          setIdentitySafetyAudit({
            memberId: member.id,
            memberName: member.fullName || member.shortName || "Member",
            safe,
            status: safe
              ? warnings.length
                ? "attention"
                : "safe"
              : "unsafe",
            blockers,
            warnings,
            duplicateEmailMembers,
            duplicateUidMembers,
            duplicatePlatformIdentityMembers,
            duplicatePlayerIdMembers,
            playerId,
            playerProfileExists,
            photoCount,
            signupCount,
            pendingSignupCount,
            isSelf,
            isProtectedMainAdmin,
          });
        }
      } catch (error) {
        console.error(
          "[EntryPage] Identity Safety Audit failed:",
          error
        );

        if (!cancelled) {
          setIdentitySafetyAuditError(
            "The identity safety audit could not be completed. Termination has been blocked."
          );
          setIdentitySafetyAudit(null);
        }
      } finally {
        if (!cancelled) {
          setIdentitySafetyAuditLoading(false);
        }
      }
    }

    runIdentitySafetyAudit();

    return () => {
      cancelled = true;
    };
  }, [
    terminationCandidate,
    activeClubId,
    members,
    currentUser?.email,
    currentUser?.uid,
    protectedMainAdminEmail,
  ]);

  const selectedTerminationMemberPassedIdentitySafetyAudit = Boolean(
    identitySafetyAudit?.safe &&
      identitySafetyAudit?.memberId &&
      identitySafetyAudit.memberId === terminationCandidate?.id
  );

  const terminationMemberPassedIdentitySafetyAudit = Boolean(
    identitySafetyAudit?.safe &&
      identitySafetyAudit?.memberId &&
      identitySafetyAudit.memberId === terminationMember?.id
  );

  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("");
  const [withdrawError, setWithdrawError] = useState("");

  const handleClubHeroPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    setClubHeroStatus("");
    setClubHeroError("");

    if (!file) return;

    try {
      const heroData = await makeLandscapePhotoDataUrl(file);

      const existingGallery = Array.isArray(activeClub?.media?.gallery)
        ? activeClub.media.gallery
            .map((item) => (typeof item === "string" ? { url: item } : item))
            .filter((item) => item?.url)
        : [];

      const safeExistingGallery = existingGallery
        .filter((item) => item.url && !String(item.url).startsWith("data:image"))
        .slice(0, 2);

      const nextGallery = [
        { url: heroData, role: "main", uploadedAtMs: Date.now() },
        ...safeExistingGallery,
      ].slice(0, 3);

      await setDoc(
        clubRootDocRef(activeClubId),
        {
          heroImage: heroData,
          teamPhoto: heroData,
          media: {
            ...(activeClub?.media || {}),
            coverImageUrl: heroData,
            gallery: nextGallery,
            updatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setClubHeroOverride(heroData);
      setClubHeroStatus("Main club photo updated. Gallery kept to a maximum of 3 photos.");
    } catch (err) {
      console.error("[EntryPage] Failed updating club hero photo:", err);
      setClubHeroError("Could not update the main club photo. Please try another image.");
    } finally {
      e.target.value = "";
    }
  };

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

  const submitNewPlayerRequest = async (
    confirmedIdentity = null
  ) => {
    setNewReqError("");
    setNewReqStatus("");
    setNewPhotoStatus("");

    const fullName = newFullName.trim();
    const email = newEmail.trim();

    const inheritedWhatsApp =
      confirmedIdentity?.whatsappNumber ||
      confirmedIdentity?.phoneNumber ||
      "";

    const resolvedWhatsApp = normalizeWhatsAppNumber(
      newWhatsApp || inheritedWhatsApp
    );

    const platformIdentityUid =
      confirmedIdentity?.platformIdentityUid ||
      confirmedIdentity?.uid ||
      "";

    const inheritedPhoto =
      confirmedIdentity?.photoData ||
      confirmedIdentity?.photoUrl ||
      "";

    if (!fullName) {
      setNewReqError("Please enter your full name.");
      return;
    }
    if (!email || !email.includes("@")) {
      setNewReqError("Please enter a valid email address.");
      return;
    }

    const normalizedFullName = fullName.toLowerCase();
    const normalizedEmail = email.toLowerCase();
    const shortName = fullName.split(" ")[0];
    const pendingDocId = slugFromName(fullName);

    const existingMember = members.find((m) => {
      const sameName = String(m.fullName || "").toLowerCase() === normalizedFullName;
      const sameEmail =
        m.email && String(m.email || "").toLowerCase() === normalizedEmail;
      return sameName || sameEmail;
    });

    if (existingMember) {
      if (existingMember.status === "withdrawn") {
        try {
          await updateDoc(memberDocRef(activeClubId, existingMember.id), {
            fullName,
            shortName,
            email,
            whatsappNumber: resolvedWhatsApp,
            phoneNumber: resolvedWhatsApp,
            platformIdentityUid,
            platformIdentityConfirmed: Boolean(confirmedIdentity),
            platformIdentitySourceClubId:
              confirmedIdentity?.clubId || "",
            platformIdentitySourceMemberId:
              confirmedIdentity?.memberId || "",
            role: "player",
            status: "pending",
            rejoinRequestedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (newPhotoFile || inheritedPhoto) {
            const portraitData = newPhotoFile
              ? await makePortraitPhotoDataUrl(newPhotoFile)
              : inheritedPhoto;

            await savePlayerPhotoForIdentity({
              clubId: activeClubId,
              fullName,
              shortName,
              playerId: pendingDocId,
              email,
              role: "player",
              status: "pending",
              sourceMemberId: existingMember.id,
              photoData: portraitData,
            });
          }

          setNewReqStatus(
            newPhotoFile || inheritedPhoto
              ? "Rejoin request captured and your profile photo has been saved for admin review."
              : "Rejoin request captured. An admin will approve you again."
          );
          setNewFullName("");
          setNewEmail("");
          setNewWhatsApp("");
          setNewPhotoFile(null);
          setNewPhotoPreview("");
          return;
        } catch (err) {
          console.error("Error creating rejoin request:", err);
          setNewReqError("Could not send rejoin request. Please try again.");
          return;
        }
      }

      setNewReqError(
        existingMember.status === "pending"
          ? "This player already has a pending request awaiting admin approval."
          : `This name or email already exists on the ${activeClubName} list.`
      );
      return;
    }

    try {
      const requestRef = await addDoc(membersCollectionRef(activeClubId), {
        fullName,
        shortName,
        email,
        whatsappNumber: resolvedWhatsApp,
        phoneNumber: resolvedWhatsApp,
        platformIdentityUid,
        platformIdentityConfirmed: Boolean(confirmedIdentity),
        platformIdentitySourceClubId:
          confirmedIdentity?.clubId || "",
        platformIdentitySourceMemberId:
          confirmedIdentity?.memberId || "",
        role: "player",
        status: "pending",
        createdAt: serverTimestamp(),
      });

      if (newPhotoFile || inheritedPhoto) {
        const portraitData = newPhotoFile
          ? await makePortraitPhotoDataUrl(newPhotoFile)
          : inheritedPhoto;

        await savePlayerPhotoForIdentity({
          clubId: activeClubId,
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
        newPhotoFile || inheritedPhoto
          ? "Request captured and your profile photo has been copied into this club for admin review."
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

  const handleSubmitNewPlayer = async () => {
    setNewReqError("");
    setNewReqStatus("");

    const fullName = newFullName.trim();
    const email = newEmail.trim().toLowerCase();

    if (!fullName) {
      setNewReqError("Please enter your full name.");
      return;
    }

    if (!email || !email.includes("@")) {
      setNewReqError("Please enter a valid email address.");
      return;
    }

    const nameParts = fullName
      .replace(/\s+/g, " ")
      .split(" ")
      .filter(Boolean);

    if (nameParts.length < 2) {
      setNewReqError(
        "Please enter your first name and surname."
      );
      return;
    }

    setJoinIdentityLookupPending(true);

    try {
      const candidates = await findCandidatePlatformIdentity({
        firstName: nameParts[0],
        surname: nameParts.slice(1).join(" "),
        email,
      });

      const candidate = candidates.find(
        (item) => item.clubId !== activeClubId
      );

      if (candidate) {
        setJoinIdentityCandidate(candidate);
        return;
      }

      await submitNewPlayerRequest(null);
    } catch (error) {
      console.warn(
        "[EntryPage] Existing player lookup could not be completed:",
        error
      );

      /*
       * A lookup failure must not prevent a legitimate join request.
       */
      await submitNewPlayerRequest(null);
    } finally {
      setJoinIdentityLookupPending(false);
    }
  };

  const acceptJoinIdentityCandidate = async () => {
    if (!joinIdentityCandidate) return;

    const candidate = joinIdentityCandidate;

    setNewFullName(
      candidate.fullName ||
      [candidate.firstName, candidate.surname]
        .filter(Boolean)
        .join(" ")
    );

    if (
      !newWhatsApp.trim() &&
      (candidate.whatsappNumber || candidate.phoneNumber)
    ) {
      setNewWhatsApp(
        candidate.whatsappNumber ||
        candidate.phoneNumber
      );
    }

    const existingProfilePhoto =
      candidate.photoData ||
      candidate.photoUrl ||
      "";

    if (!newPhotoPreview && existingProfilePhoto) {
      setNewPhotoPreview(existingProfilePhoto);
      setNewPhotoStatus(
        "Your existing profile photo will be copied into this club."
      );
    }

    setJoinIdentityCandidate(null);
    await submitNewPlayerRequest(candidate);
  };

  const declineJoinIdentityCandidate = async () => {
    setJoinIdentityCandidate(null);
    await submitNewPlayerRequest(null);
  };

  const handleVerifyPlayer = async () => {
    setVerifyError("");
    setVerifyStatus("");

    if (!selectedMember) {
      setVerifyError(`Please select your name on the ${activeClubName} list.`);
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

    try {
      await updateDoc(
        memberDocRef(activeClubId, selectedMember.id),
        {
          email: googleEmail,
          uid: u.uid,
          platformIdentityUid:
            selectedMember.platformIdentityUid ||
            u.uid,
          updatedAt: serverTimestamp(),
        }
      );
    } catch (err) {
      console.error(
        "Failed to update verified member identity:",
        err
      );
    }

    const playerId = await upsertPlayerFromMember({
      ...selectedMember,
      id: selectedMember.id,
      email: googleEmail,
      uid: u.uid,
      platformIdentityUid:
        selectedMember.platformIdentityUid ||
        u.uid,
    }, activeClubId);

    const resolvedRole = await resolveSignedInRoleFromPlayerDoc(
      {
        ...selectedMember,
        id: selectedMember.id,
        playerId,
        email: googleEmail,
      },
      googleEmail,
      activeClubId
    );

    // Important for admin preview mode:
    // - realRole preserves the Google/account-backed role for reference.
    // - role and actingRole are both set to the selected preview role so downstream
    //   pages that check either identity.role or identity.actingRole behave consistently.
    const effectiveRole =
      isAdminViewer && adminPreviewRole ? adminPreviewRole : resolvedRole;
    const actingRole = effectiveRole;

    setVerifyStatus(
      `Welcome, ${selectedMember.shortName}! Your email has been verified.`
    );

    const memberSnap = await getDoc(memberDocRef(activeClubId, selectedMember.id));
    const memberData = memberSnap.exists() ? memberSnap.data() || {} : {};

    const completionPayload = {
      clubId: activeClubId,
      clubName: activeClubName,
      // Keep the app UI fully aligned with the selected preview mode.
      // Some downstream pages use identity.role, others use identity.actingRole.
      role: effectiveRole,
      actingRole,
      realRole: resolvedRole,
      isRolePreview: isAdminViewer && effectiveRole !== resolvedRole,
      memberId: selectedMember.id,
      playerId: playerId || null,
      fullName: selectedMember.fullName,
      shortName: selectedMember.shortName,
      email: googleEmail,
      whatsappNumber: memberData.whatsappNumber || "",
      status: selectedMember.status || "active",
    };

    /*
     * Existing members may have joined this club before cross-club profile
     * migration existed. In that case, recover the matching source profile
     * once during sign-in, then copy confirmed details into this club.
     */
    const destinationExistingPhoto =
      await findExistingPhotoDataByIdentity(
        {
          fullName: selectedMember.fullName,
          shortName: selectedMember.shortName,
          playerId: playerId || "",
        },
        activeClubId
      );

    let sourceIdentityCandidate = null;

    if (
      !destinationExistingPhoto ||
      !normalizeWhatsAppNumber(memberData.whatsappNumber || "")
    ) {
      const identityNameParts = String(
        selectedMember.fullName || ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .split(" ")
        .filter(Boolean);

      if (identityNameParts.length >= 2) {
        try {
          const candidates =
            await findCandidatePlatformIdentity({
              firstName: identityNameParts[0],
              surname: identityNameParts.slice(1).join(" "),
              email: googleEmail,
            });

          sourceIdentityCandidate =
            candidates.find(
              (candidate) =>
                candidate.clubId &&
                candidate.clubId !== activeClubId
            ) || null;
        } catch (error) {
          console.warn(
            "[EntryPage] Could not recover an existing cross-club profile:",
            error
          );
        }
      }
    }

    /*
     * The platform identity lookup may find the correct member while failing
     * to attach the separately stored playerPhotos document. Before showing
     * the reminder, directly recover the photo from the confirmed source club.
     */
    if (
      sourceIdentityCandidate?.clubId &&
      !sourceIdentityCandidate.photoData &&
      !sourceIdentityCandidate.photoUrl
    ) {
      try {
        const recoveredSourcePhoto =
          await findExistingPhotoDataByIdentity(
            {
              fullName:
                sourceIdentityCandidate.fullName ||
                selectedMember.fullName,
              shortName:
                sourceIdentityCandidate.shortName ||
                selectedMember.shortName,
              playerId:
                sourceIdentityCandidate.playerId ||
                "",
            },
            sourceIdentityCandidate.clubId
          );

        if (recoveredSourcePhoto?.photoData) {
          sourceIdentityCandidate = {
            ...sourceIdentityCandidate,
            photoData: recoveredSourcePhoto.photoData,
            photoUrl: recoveredSourcePhoto.photoData,
          };

          console.log(
            "[EntryPage] Recovered source profile photo:",
            sourceIdentityCandidate.clubId,
            recoveredSourcePhoto.id
          );
        }
      } catch (error) {
        console.warn(
          "[EntryPage] Could not directly recover source profile photo:",
          error
        );
      }
    }

    const inheritedWhatsApp =
      sourceIdentityCandidate?.whatsappNumber ||
      sourceIdentityCandidate?.phoneNumber ||
      "";

    const continueToApp = () => {
      const savedWhatsApp = normalizeWhatsAppNumber(
        memberData.whatsappNumber ||
        inheritedWhatsApp ||
        ""
      );
      if (!savedWhatsApp) {
        setWhatsAppReminderContext({
          ...completionPayload,
          onContinue: () => onComplete({
            ...completionPayload,
            whatsappNumber: normalizeWhatsAppNumber(whatsAppInput || savedWhatsApp || ""),
          }),
        });
        setWhatsAppInput(savedWhatsApp);
        setWhatsAppReminderError("");
        setWhatsAppReminderStatus(
          inheritedWhatsApp
            ? "We found this number on your existing profile. Confirm it to copy it into this club."
            : ""
        );
        setShowWhatsAppReminderModal(true);
        return;
      }

      onComplete(completionPayload);
    };

    const existingPhoto = destinationExistingPhoto;

    if (!existingPhoto) {
      const inheritedPhoto =
        sourceIdentityCandidate?.photoData ||
        sourceIdentityCandidate?.photoUrl ||
        "";

      setPhotoReminderContext({
        ...completionPayload,
        inheritedProfile: Boolean(inheritedPhoto),
        sourceClubName:
          sourceIdentityCandidate?.clubName || "",
        onContinue: continueToApp,
      });

      setPhotoReminderPreview(inheritedPhoto);
      setPhotoReminderFile(null);
      setPhotoReminderStatus(
        inheritedPhoto
          ? `We found your existing profile photo${
              sourceIdentityCandidate?.clubName
                ? ` from ${sourceIdentityCandidate.clubName}`
                : ""
            }. Confirm it to copy it into ${activeClubName}.`
          : ""
      );
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
        clubId: activeClubId,
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
      await updateDoc(
        memberDocRef(
          activeClubId,
          whatsAppReminderContext.memberId
        ),
        {
          whatsappNumber: normalized,
          phoneNumber: normalized,
          updatedAt: serverTimestamp(),
        }
      );

      if (whatsAppReminderContext.playerId) {
        await setDoc(
          playerDocRef(
            activeClubId,
            whatsAppReminderContext.playerId
          ),
          {
            whatsappNumber: normalized,
            phoneNumber: normalized,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

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

    try {
      const playerId =
        selectedMember.playerId ||
        slugFromName(selectedMember.shortName || selectedMember.fullName || "");

      await addDoc(withdrawalRequestsCollectionRef(activeClubId), {
        memberId: selectedMember.id,
        playerId,
        fullName: selectedMember.fullName || "",
        shortName: selectedMember.shortName || "",
        statusBeforeLeaving: selectedMember.status || "active",
        reason: String(withdrawReason || "").trim(),
        requestedAt: serverTimestamp(),
        requestedAtMs: Date.now(),
        processed: true,
        outcome: "withdrawn_by_player",
      });

      await clearWithdrawnPlayerPrivateDetails({
        clubId: activeClubId,
        memberId: selectedMember.id,
        playerId,
      });

      setWithdrawStatus(
        `You have left ${activeClubName}. Your private contact details have been removed from the active system. You are always welcome to return in future.`
      );
      setWithdrawReason("");
      setShowWithdrawForm(false);
    } catch (err) {
      console.error("[EntryPage] Failed to submit withdrawal request:", err);
      setWithdrawError("Could not send your request right now. Please try again.");
    }
  };

  function isChallengerChatActive(fixture = {}) {
    const status = String(fixture?.status || "").toLowerCase();

    if (
      status.includes("cancel") ||
      status.includes("rejected") ||
      status.includes("declined")
    ) {
      return false;
    }

    const dateText = String(fixture?.proposedDate || "").trim();
    if (!dateText) return true;

    const kickoffText = String(fixture?.proposedKickoff || "23:59").trim();
    const timeText = /^\d{2}:\d{2}$/.test(kickoffText) ? kickoffText : "23:59";
    const fixtureTime = new Date(`${dateText}T${timeText}:00`);

    if (Number.isNaN(fixtureTime.getTime())) return true;

    return fixtureTime.getTime() + 24 * 60 * 60 * 1000 >= Date.now();
  }

  useEffect(() => {
    if (!activeClubId) {
      setChallengerChatFixture(null);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "fixtures"),
      orderBy("createdAtMs", "desc"),
      limit(8)
    );

    const unsub = onSnapshot(q, (snap) => {
      const fixtures = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
        .filter((fixture) => fixture?.source === "club_challenge")
        .filter((fixture) => isChallengerChatActive(fixture))
        .filter((fixture) =>
          [fixture.homeClubId, fixture.awayClubId]
            .map((value) => String(value || ""))
            .includes(String(activeClubId || ""))
        )
        .sort((a, b) => {
          const aTime = new Date(`${a.proposedDate || "2999-12-31"}T${a.proposedKickoff || "23:59"}:00`).getTime();
          const bTime = new Date(`${b.proposedDate || "2999-12-31"}T${b.proposedKickoff || "23:59"}:00`).getTime();
          return aTime - bTime;
        });

      setChallengerChatFixture(fixtures[0] || null);
    });

    return () => unsub();
  }, [activeClubId]);

  useEffect(() => {
    if (!challengerChatFixture?.fixtureId) {
      setChallengerChatMessages([]);
      return;
    }

    const q = query(
      collection(db, "clubChallengeFixtures", challengerChatFixture.fixtureId, "messages"),
      orderBy("createdAtMs", "asc"),
      limit(80)
    );

    const unsub = onSnapshot(q, (snap) => {
      setChallengerChatMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
      );
    });

    return () => unsub();
  }, [challengerChatFixture?.fixtureId]);

  useEffect(() => {
    if (activeChatRoom !== "challenger") return;
    challengerChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [challengerChatMessages.length, activeChatRoom]);

  const challengerChatOpponentName =
    challengerChatFixture &&
    String(challengerChatFixture.homeClubId || "") === String(activeClubId || "")
      ? challengerChatFixture.awayClubName || "Opponent Club"
      : challengerChatFixture?.homeClubName || "Opponent Club";

  const canSendChallengerChat =
    Boolean(currentUser) &&
    Boolean(challengerChatFixture?.fixtureId) &&
    (Boolean(selectedMember?.id) || Boolean(isAdminViewer));

  const addChallengerChatEmoji = (emoji) => {
    setChallengerChatDraft((current) => `${current || ""}${emoji}`);
    setChallengerChatEmojiOpen(false);
  };

  const handleSendChallengerChatMessage = async () => {
    const text = String(challengerChatDraft || "").trim();

    if (!text || !canSendChallengerChat || !challengerChatFixture?.fixtureId) return;

    const senderName =
      selectedMember?.fullName ||
      selectedMember?.shortName ||
      currentUser?.displayName ||
      currentUser?.email?.split("@")[0] ||
      "Club member";

    try {
      await addDoc(collection(db, "clubChallengeFixtures", challengerChatFixture.fixtureId, "messages"), {
        type: "challenger_chat",
        text,
        fromClubId: activeClubId,
        fromClubName: activeClubName,
        senderName,
        senderUid: currentUser?.uid || "",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });

      setChallengerChatDraft("");
      setChallengerChatEmojiOpen(false);
    } catch (err) {
      console.error("[EntryPage] Failed sending challenger chat message:", err);
      window.alert("Could not send this challenger chat message just now.");
    }
  };

  useEffect(() => {
    if (!activeClubId) {
      setClubChatMessages([]);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "chatMessages"),
      orderBy("createdAtMs", "asc"),
      limit(80)
    );

    const unsub = onSnapshot(q, (snap) => {
      setClubChatMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
      );
    });

    return () => unsub();
  }, [activeClubId]);

  useEffect(() => {
    clubChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [clubChatMessages.length]);

  const canSendClubChat =
    Boolean(currentUser) &&
    Boolean(activeClubId) &&
    (Boolean(selectedMember?.id) || Boolean(isAdminViewer));

  const addClubChatEmoji = (emoji) => {
    setClubChatDraft((current) => `${current || ""}${emoji}`);
    setClubChatEmojiOpen(false);
  };

  const handleSendClubChatMessage = async () => {
    const text = String(clubChatDraft || "").trim();
    if (!text || !canSendClubChat) return;

    const senderName =
      selectedMember?.fullName ||
      selectedMember?.shortName ||
      currentUser?.displayName ||
      currentUser?.email?.split("@")[0] ||
      "Club member";

    const senderRole = isAdminViewer
      ? "admin"
      : selectedMember?.role || identity?.role || "player";

    try {
      await addDoc(collection(db, "clubs", activeClubId, "chatMessages"), {
        text,
        senderName,
        senderRole,
        senderEmail: currentUser?.email || selectedMember?.email || identity?.email || "",
        senderUid: currentUser?.uid || "",
        clubId: activeClubId,
        clubName: activeClubName,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });

      setClubChatDraft("");
      setClubChatEmojiOpen(false);
    } catch (err) {
      console.error("[EntryPage] Failed sending club chat message:", err);
      window.alert("Could not send this club chat message just now.");
    }
  };

  const clubChatLatestMessageMs = clubChatMessages.reduce(
    (latest, message) => Math.max(latest, Number(message.createdAtMs || 0)),
    0
  );

  const clubChatUnreadCount = clubChatMessages.filter(
    (message) =>
      Number(message.createdAtMs || 0) > Number(clubChatLastSeenMs || 0) &&
      String(message.senderUid || "") !== String(currentUser?.uid || "")
  ).length;

  const challengerChatLatestMessageMs = challengerChatMessages.reduce(
    (latest, message) => Math.max(latest, Number(message.createdAtMs || 0)),
    0
  );

  const [challengerChatLastSeenMs, setChallengerChatLastSeenMs] = useState(() => {
    try {
      return Number(window.localStorage.getItem(`fanm_challenger_chat_seen_${challengerChatFixture?.fixtureId || "none"}`) || 0);
    } catch {
      return 0;
    }
  });

  const challengerChatUnreadCount = challengerChatMessages.filter(
    (message) =>
      Number(message.createdAtMs || 0) > Number(challengerChatLastSeenMs || 0) &&
      String(message.senderUid || "") !== String(currentUser?.uid || "")
  ).length;

  useEffect(() => {
    if (activeChatRoom !== "challenger" || !challengerChatFixture?.fixtureId || !challengerChatLatestMessageMs) return;

    try {
      window.localStorage.setItem(
        `fanm_challenger_chat_seen_${challengerChatFixture.fixtureId}`,
        String(challengerChatLatestMessageMs)
      );
    } catch {
      // localStorage is optional
    }

    setChallengerChatLastSeenMs(challengerChatLatestMessageMs);
  }, [activeChatRoom, challengerChatFixture?.fixtureId, challengerChatLatestMessageMs]);

  useEffect(() => {
    if (!clubChatOpen || !activeClubId || !clubChatLatestMessageMs) return;

    try {
      window.localStorage.setItem(
        `fanm_club_chat_seen_${activeClubId}`,
        String(clubChatLatestMessageMs)
      );
    } catch {
      // localStorage is optional
    }

    setClubChatLastSeenMs(clubChatLatestMessageMs);
  }, [clubChatOpen, activeClubId, clubChatLatestMessageMs]);

  useEffect(() => {
    if (clubChatOpen) {
      setClubChatTeaseOpen(false);
      return;
    }

    let idleTimer;
    let shrinkTimer;

    const startIdleTimer = () => {
      setClubChatTeaseOpen(false);
      window.clearTimeout(idleTimer);
      window.clearTimeout(shrinkTimer);

      idleTimer = window.setTimeout(() => {
        setClubChatTeaseOpen(true);

        shrinkTimer = window.setTimeout(() => {
          setClubChatTeaseOpen(false);
        }, 2000);
      }, 7000);
    };

    startIdleTimer();

    const activityEvents = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, startIdleTimer, { passive: true });
    });

    return () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(shrinkTimer);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, startIdleTimer);
      });
    };
  }, [clubChatOpen]);

  const handleContinueAsSpectator = () => {
    onComplete({
      clubId: activeClubId,
      clubName: activeClubName,
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
      await updateDoc(memberDocRef(activeClubId, memberId), {
        status: "active",
        rejoinReviewedAt: serverTimestamp(),
        rejoinRequestedAt: deleteField(),
      });

      await upsertPlayerFromMember({
        ...member,
        id: memberId,
        status: "active",
      }, activeClubId);
    } catch (err) {
      console.error("Approve failed:", err);
      alert("Could not approve member. Check console for details.");
    }
  };

  const handleSetClubAdminPrivilege = async (shouldBeAdmin) => {
    if (!isAdminViewer) {
      setAdminPrivilegesError(
        "Only an existing club administrator can change administrator privileges."
      );
      return;
    }

    if (!adminPrivilegesMember?.id) {
      setAdminPrivilegesError("Select a club member first.");
      return;
    }

    if (!adminPrivilegesMemberEmail) {
      setAdminPrivilegesError(
        "This member needs a verified Gmail address before administrator privileges can be assigned."
      );
      return;
    }

    if (!shouldBeAdmin && adminPrivilegesMemberIsProtected) {
      setAdminPrivilegesError(
        "The main club administrator is protected and cannot be demoted."
      );
      return;
    }

    setAdminPrivilegesSaving(true);
    setAdminPrivilegesError("");
    setAdminPrivilegesStatus("");

    try {
      const batch = writeBatch(db);

      const memberPatch = {
        role: shouldBeAdmin
          ? "admin"
          : adminPrivilegesMember.previousRoleBeforeAdmin || "player",
        updatedAt: serverTimestamp(),
      };

      if (shouldBeAdmin && adminPrivilegesMember.role !== "admin") {
        memberPatch.previousRoleBeforeAdmin =
          adminPrivilegesMember.role || "player";
      }

      if (!shouldBeAdmin) {
        memberPatch.previousRoleBeforeAdmin = deleteField();
      }

      batch.set(
        memberDocRef(activeClubId, adminPrivilegesMember.id),
        memberPatch,
        { merge: true }
      );

      const administratorName = String(
        adminPrivilegesMember.fullName ||
        adminPrivilegesMember.shortName ||
        ""
      ).trim();

      const clubPatch = {
        adminEmails: shouldBeAdmin
          ? arrayUnion(adminPrivilegesMemberEmail)
          : arrayRemove(adminPrivilegesMemberEmail),
        updatedAt: serverTimestamp(),
      };

      if (administratorName) {
        clubPatch.adminNames = shouldBeAdmin
          ? arrayUnion(administratorName)
          : arrayRemove(administratorName);
      }

      const platformSuperAdminEmail = "nkululekolerato@gmail.com";
      const promotedAdminEmail = String(
        adminPrivilegesMemberEmail || ""
      )
        .trim()
        .toLowerCase();

      const isPlatformSuperAdminAccount =
        promotedAdminEmail === platformSuperAdminEmail;

      if (
        shouldBeAdmin &&
        administratorName &&
        !isPlatformSuperAdminAccount
      ) {
        clubPatch.delegatedAdminName = administratorName;
        clubPatch.delegatedAdminEmail = promotedAdminEmail;
        clubPatch.delegatedAdminUid =
          adminPrivilegesMemberUid || "";
      }

      if (
        !shouldBeAdmin &&
        String(activeClub?.delegatedAdminEmail || "")
          .trim()
          .toLowerCase() === promotedAdminEmail
      ) {
        clubPatch.delegatedAdminName = deleteField();
        clubPatch.delegatedAdminEmail = deleteField();
        clubPatch.delegatedAdminUid = deleteField();
      }

      if (adminPrivilegesMemberUid) {
        clubPatch.adminUids = shouldBeAdmin
          ? arrayUnion(adminPrivilegesMemberUid)
          : arrayRemove(adminPrivilegesMemberUid);
      }

      batch.set(
        clubRootDocRef(activeClubId),
        clubPatch,
        { merge: true }
      );

      await batch.commit();

      setAdminPrivilegesStatus(
        shouldBeAdmin
          ? `${adminPrivilegesMember.fullName} is now a club administrator.`
          : `${adminPrivilegesMember.fullName} is no longer a club administrator.`
      );
    } catch (error) {
      console.error(
        "[EntryPage] Failed updating club administrator privilege:",
        error
      );
      setAdminPrivilegesError(
        "Could not update administrator privileges just now. Please try again."
      );
    } finally {
      setAdminPrivilegesSaving(false);
    }
  };

  const collectMatchingDocumentRefs = async ({
    collectionName,
    matches = [],
  }) => {
    const refs = new Map();

    for (const [fieldName, fieldValue] of matches) {
      const cleanValue = String(fieldValue || "").trim();
      if (!cleanValue) continue;

      try {
        const snap = await getDocs(
          query(
            clubCollectionRef(activeClubId, collectionName),
            where(fieldName, "==", cleanValue)
          )
        );

        snap.docs.forEach((document) => {
          refs.set(document.ref.path, document.ref);
        });
      } catch (error) {
        console.warn(
          `[EntryPage] Could not query ${collectionName}.${fieldName}:`,
          error
        );
      }
    }

    return Array.from(refs.values());
  };

  const handleTerminateClubMembership = async () => {
    const member = terminationMember;

    if (!isAdminViewer) {
      setTerminationError(
        "Only an existing club administrator can terminate membership."
      );
      return;
    }

    if (!member?.id) {
      setTerminationError("No club member was selected.");
      return;
    }

    if (
      !identitySafetyAudit?.safe ||
      identitySafetyAudit?.memberId !== member.id
    ) {
      setTerminationError(
        "Termination is blocked because this member has not passed the Identity Safety Audit."
      );
      return;
    }

    const memberEmail = String(member.email || "").trim().toLowerCase();
    const memberUid = String(
      member.uid || member.platformIdentityUid || ""
    ).trim();

    const isProtectedMainAdmin = Boolean(
      memberEmail &&
      protectedMainAdminEmail &&
      memberEmail === protectedMainAdminEmail
    );

    if (isProtectedMainAdmin) {
      setTerminationError(
        "The main club administrator is protected and cannot be terminated."
      );
      return;
    }

    const currentEmail = String(currentUser?.email || "")
      .trim()
      .toLowerCase();
    const currentUid = String(currentUser?.uid || "").trim();

    if (
      (memberEmail && currentEmail && memberEmail === currentEmail) ||
      (memberUid && currentUid && memberUid === currentUid)
    ) {
      setTerminationError(
        "You cannot terminate your own membership while signed in as administrator."
      );
      return;
    }

    const expectedConfirmation = String(member.fullName || "").trim();

    if (
      String(terminationConfirmation || "").trim().toLowerCase() !==
      expectedConfirmation.toLowerCase()
    ) {
      setTerminationError(
        `Type ${expectedConfirmation} exactly to confirm termination.`
      );
      return;
    }

    setTerminationSaving(true);
    setTerminationError("");

    try {
      const playerId =
        String(member.playerId || "").trim() ||
        slugFromName(member.shortName || member.fullName || "");

      const photoRefs = await collectMatchingDocumentRefs({
        collectionName: PLAYER_PHOTOS_COLLECTION,
        matches: [
          ["sourceMemberId", member.id],
          ["memberId", member.id],
          ["playerId", playerId],
          ["email", memberEmail],
        ],
      });

      const memberFullName = String(
        member.fullName || member.shortName || ""
      ).trim();

      const signupRefs = await collectMatchingDocumentRefs({
        collectionName: "matchSignups",
        matches: [
          ["memberId", member.id],
          ["sourceMemberId", member.id],
          ["playerId", playerId],
          ["beneficiaryPlayerId", playerId],
          ["userId", playerId],
          ["email", memberEmail],
          ["beneficiaryEmail", memberEmail],
          ["playerEmail", memberEmail],
          ["playerName", memberFullName],
          ["beneficiaryName", memberFullName],
          ["displayName", memberFullName],
          ["shortName", member.shortName],
        ],
      });

      const pendingSignupRefs = await collectMatchingDocumentRefs({
        collectionName: "pendingSignups",
        matches: [
          ["memberId", member.id],
          ["sourceMemberId", member.id],
          ["playerId", playerId],
          ["beneficiaryPlayerId", playerId],
          ["userId", playerId],
          ["email", memberEmail],
          ["beneficiaryEmail", memberEmail],
          ["playerEmail", memberEmail],
          ["playerName", memberFullName],
          ["beneficiaryName", memberFullName],
          ["displayName", memberFullName],
          ["shortName", member.shortName],
        ],
      });

      const batch = writeBatch(db);

      // Remove the active club identity.
      batch.delete(memberDocRef(activeClubId, member.id));

      if (playerId) {
        batch.delete(playerDocRef(activeClubId, playerId));
      }

      photoRefs.forEach((ref) => batch.delete(ref));
      signupRefs.forEach((ref) => batch.delete(ref));
      pendingSignupRefs.forEach((ref) => batch.delete(ref));

      // Remove stale administrator access if this was an additional admin.
      const clubPatch = {
        updatedAt: serverTimestamp(),
      };

      if (memberEmail) {
        clubPatch.adminEmails = arrayRemove(memberEmail);
      }

      if (memberUid) {
        clubPatch.adminUids = arrayRemove(memberUid);
      }

      batch.set(
        clubRootDocRef(activeClubId),
        clubPatch,
        { merge: true }
      );

      await batch.commit();

      const deletedPlayerNames = Array.from(
        new Set(
          [
            member.fullName,
            member.shortName,
            member.displayName,
            member.name,
            playerId,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      removePlayerFromSavedLineups({
        activeClubId,
        playerId,
        names: deletedPlayerNames,
      });

      try {
        window.localStorage.setItem(
          `fanm_deleted_player_cleanup_${activeClubId}`,
          JSON.stringify({
            playerId,
            names: deletedPlayerNames,
            deletedAtMs: Date.now(),
          })
        );
      } catch (cleanupStorageError) {
        console.warn(
          "[EntryPage] Could not queue squad cleanup:",
          cleanupStorageError
        );
      }

      setAdminPrivilegesMemberId("");
      setTerminationMember(null);
      setTerminationConfirmation("");
      setTerminationError("");
      setAdminPrivilegesStatus(
        `${member.fullName} has been permanently removed from the active club database. Historical matches and statistics were preserved.`
      );
    } catch (error) {
      console.error(
        "[EntryPage] Failed terminating club membership:",
        error
      );
      setTerminationError(
        "Could not terminate this membership just now. No further action should be taken until the database is checked."
      );
    } finally {
      setTerminationSaving(false);
    }
  };

  const handleCloseDepartureNotice = async (departureNotice) => {
    const departure = departureNotice?.payload || departureNotice;

    if (!departure?.requestId) {
      return;
    }

    try {
      await clearWithdrawnPlayerPrivateDetails({
        clubId: activeClubId,
        memberId: departure.memberId,
        playerId:
          departure.playerId ||
          slugFromName(departure.shortName || departure.name || ""),
      });

      await updateDoc(
        withdrawalRequestDocRef(activeClubId, departure.requestId),
        {
          adminAcknowledgedAt: serverTimestamp(),
          adminAcknowledgedAtMs: Date.now(),
          processed: true,
          outcome: "withdrawn_notice_acknowledged",
        }
      );

      setMemberDepartureAlerts((prev) =>
        prev.filter((item) => item.requestId !== departure.requestId)
      );
    } catch (err) {
      console.error("[EntryPage] Failed acknowledging departure notice:", err);
      window.alert("Could not close this departure notice just now. Please try again.");
    }
  };

  const markChallengeNoticeAcknowledged = async (noticePayload) => {
    const noticeId = noticePayload?.noticeDocId || noticePayload?.noticeId;
    if (!noticeId) return;

    await updateDoc(
      doc(db, "clubs", activeClubId, "challengeNotices", noticeId),
      {
        status: "acknowledged",
        acknowledgedAt: serverTimestamp(),
        acknowledgedAtMs: Date.now(),
      }
    );

    setChallengeNoticeAlerts((prev) =>
      prev.filter((item) => item.noticeDocId !== noticeId)
    );
  };

  useEffect(() => {
    if (!fixtureDiscussionModal?.fixtureId) {
      setFixtureDiscussionMessages([]);
      return;
    }

    const q = query(
      collection(db, "clubChallengeFixtures", fixtureDiscussionModal.fixtureId, "messages"),
      orderBy("createdAtMs", "asc"),
      limit(80)
    );

    const unsub = onSnapshot(q, (snap) => {
      setFixtureDiscussionMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
      );
    });

    return () => unsub();
  }, [fixtureDiscussionModal?.fixtureId]);

  const openFixtureDiscussion = (noticePayload) => {
    if (!noticePayload?.fixtureId) return;
    setFixtureDiscussionModal(noticePayload);
    setFixtureDiscussionDraft("");
  };

  const handleSendFixtureDiscussionMessage = async () => {
    const text = String(fixtureDiscussionDraft || "").trim();
    if (!text || !fixtureDiscussionModal?.fixtureId) return;

    try {
      await addDoc(
        collection(db, "clubChallengeFixtures", fixtureDiscussionModal.fixtureId, "messages"),
        {
          type: "discussion",
          text,
          fromClubId: activeClubId,
          fromClubName: activeClubName,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
        }
      );

      setFixtureDiscussionDraft("");
    } catch (err) {
      console.error("[EntryPage] Failed sending fixture discussion message:", err);
      window.alert("Could not send this discussion message just now.");
    }
  };

  const handleAcceptFixtureAlternative = async (noticePayload) => {
    if (!noticePayload?.fixtureId) return;

    try {
      const fixtureId = noticePayload.fixtureId;
      const participatingClubIds = Array.from(
        new Set(
          [
            noticePayload.homeClubId,
            noticePayload.awayClubId,
            activeClubId,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      const patch = {
        status: "alternative_accepted",
        alternativeAcceptedByClubId: activeClubId,
        alternativeAcceptedByClubName: activeClubName,
        alternativeMessage: noticePayload.message || "",
        alternativeAcceptedAt: serverTimestamp(),
        alternativeAcceptedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      };

      const batch = writeBatch(db);

      batch.set(doc(db, "clubChallengeFixtures", fixtureId), patch, { merge: true });

      participatingClubIds.forEach((clubId) => {
        batch.set(doc(db, "clubs", clubId, "fixtures", fixtureId), patch, { merge: true });
      });

      await batch.commit();
      await markChallengeNoticeAcknowledged(noticePayload);
    } catch (err) {
      console.error("[EntryPage] Failed accepting fixture alternative:", err);
      window.alert("Could not accept this alternative just now.");
    }
  };

  const handleContinueOriginalFixtureRequest = async (noticePayload) => {
    if (!noticePayload?.fixtureId) return;

    try {
      await markChallengeNoticeAcknowledged(noticePayload);
    } catch (err) {
      console.error("[EntryPage] Failed continuing fixture request:", err);
      window.alert("Could not close this alternative just now.");
    }
  };

  const handleAcceptFixtureChange = async (noticePayload) => {
    if (!noticePayload?.fixtureId) return;

    try {
      const fixtureId = noticePayload.fixtureId;
      const participatingClubIds = Array.from(
        new Set(
          [
            noticePayload.homeClubId,
            noticePayload.awayClubId,
            activeClubId,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      const patch = {
        status: "change_accepted",
        proposedDate: noticePayload.proposedDate || "",
        proposedKickoff: noticePayload.proposedKickoff || "",
        venue: noticePayload.venue || "",
        format: noticePayload.format || "5v5",
        changeAcceptedByClubId: activeClubId,
        changeAcceptedByClubName: activeClubName,
        changeAcceptedAt: serverTimestamp(),
        changeAcceptedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      };

      const batch = writeBatch(db);

      batch.set(doc(db, "clubChallengeFixtures", fixtureId), patch, { merge: true });

      participatingClubIds.forEach((clubId) => {
        batch.set(doc(db, "clubs", clubId, "fixtures", fixtureId), patch, { merge: true });
      });

      await batch.commit();
      await markChallengeNoticeAcknowledged(noticePayload);
    } catch (err) {
      console.error("[EntryPage] Failed accepting fixture change:", err);
      window.alert("Could not accept this fixture update just now.");
    }
  };

  const openFixtureAlternativeModal = (noticePayload) => {
    if (!noticePayload?.fixtureId) return;
    setFixtureAlternativeModal(noticePayload);
    setFixtureAlternativeMessage("");
  };

  const handleSubmitFixtureAlternative = async () => {
    const noticePayload = fixtureAlternativeModal;
    if (!noticePayload?.fixtureId) return;

    const cleanMessage = String(fixtureAlternativeMessage || "").trim();
    if (!cleanMessage) return;

    try {
      const targetClubId = noticePayload.fromClubId || "";
      const noticeId = `change_reply_${noticePayload.fixtureId}_${Date.now()}`;

      if (targetClubId) {
        await addDoc(collection(db, "clubs", targetClubId, "challengeNotices"), {
          noticeId,
          type: "challenge_change_reply",
          fixtureId: noticePayload.fixtureId,
          challengeId: noticePayload.challengeId || "",
          fromClubId: activeClubId,
          fromClubName: activeClubName,
          toClubId: targetClubId,
          homeClubId: noticePayload.homeClubId || "",
          homeClubName: noticePayload.homeClubName || "",
          awayClubId: noticePayload.awayClubId || "",
          awayClubName: noticePayload.awayClubName || "",
          message: cleanMessage,
          status: "open",
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
        });
      }

      await markChallengeNoticeAcknowledged(noticePayload);
      setFixtureAlternativeModal(null);
      setFixtureAlternativeMessage("");
    } catch (err) {
      console.error("[EntryPage] Failed sending alternative fixture suggestion:", err);
      window.alert("Could not send your alternative suggestion just now.");
    }
  };

  const handleAcknowledgeAdminNotice = async (notice) => {
    if (!notice) return;

    if (notice.type === "departure") {
      await handleCloseDepartureNotice(notice);
      return;
    }

    if (notice.type === "challenge_cancelled") {
      const noticeId = notice.payload?.noticeDocId || notice.payload?.noticeId;
      if (noticeId) {
        try {
          await updateDoc(
            doc(db, "clubs", activeClubId, "challengeNotices", noticeId),
            {
              status: "acknowledged",
              acknowledgedAt: serverTimestamp(),
              acknowledgedAtMs: Date.now(),
            }
          );
        } catch (err) {
          console.error("[EntryPage] Failed acknowledging challenge notice:", err);
          window.alert("Could not close this challenge notice just now.");
          return;
        }
      }

      setChallengeNoticeAlerts((prev) =>
        prev.filter((item) => item.noticeDocId !== notice.payload?.noticeDocId)
      );
      return;
    }

    if (notice.type === "new_player") {
      return;
    }
  };



  const handleAcceptChallenge = async (challenge) => {
    if (!challenge?.challengeId) return;

    try {
      const fixtureId =
        challenge.fixtureId ||
        `challenge_${String(
          challenge.challengeId || Date.now()
        ).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      const participatingClubIds = Array.from(
        new Set(
          [
            challenge.challengerClubId,
            activeClubId,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      const acceptedPayload = {
        ...challenge,

        targetClubId: activeClubId,
        targetClubName: activeClubName,

        status: "accepted",
        acceptedAt: serverTimestamp(),
        acceptedAtMs: Date.now(),

        fixtureId,
        fixtureStatus: "fixture_created_automatically",
      };

      const fixturePayload = {
        fixtureId,

        source: "club_challenge",
        challengeId: challenge.challengeId || "",

        status: "confirmed",
        signupStatus: "open",

        homeClubId: challenge.challengerClubId || "",
        homeClubName: challenge.challengerClubName || "Home Club",

        awayClubId: activeClubId,
        awayClubName: activeClubName,

        homeClubLogo:
          challenge.challengerClubLogo ||
          challenge.challengerLogo ||
          challenge.challengerClubBadge ||
          "",

        awayClubLogo:
          challenge.targetClubLogo ||
          challenge.targetLogo ||
          challenge.targetClubBadge ||
          "",

        participatingClubIds,

        format: challenge.format || "5v5",

        proposedDate:
          challenge.proposedDate || "",

        proposedKickoff:
          challenge.proposedKickoff || "18:30",

        venue:
          challenge.venue ||
          challenge.proposedVenue ||
          "Venue to be confirmed",

        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),

        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      };

      const batch = writeBatch(db);

      batch.update(
        doc(
          db,
          "clubs",
          activeClubId,
          "incomingChallenges",
          challenge.challengeId
        ),
        {
          status: "accepted",
          respondedAt: serverTimestamp(),
          respondedAtMs: Date.now(),

          fixtureId,
          fixtureStatus: "fixture_created_automatically",
        }
      );

      const acceptedChallengeRef = doc(
        collection(db, "acceptedClubChallenges")
      );

      batch.set(acceptedChallengeRef, acceptedPayload);

      const targetAcceptedRef = doc(
        collection(
          db,
          "clubs",
          activeClubId,
          "acceptedChallenges"
        )
      );

      batch.set(targetAcceptedRef, {
        ...acceptedPayload,
        acceptedChallengeDocId: targetAcceptedRef.id,
      });

      if (challenge.challengerClubId) {
        const challengerAcceptedRef = doc(
          collection(
            db,
            "clubs",
            challenge.challengerClubId,
            "acceptedChallenges"
          )
        );

        batch.set(challengerAcceptedRef, {
          ...acceptedPayload,
          acceptedChallengeDocId: challengerAcceptedRef.id,
        });
      }

      batch.set(
        doc(db, "clubChallengeFixtures", fixtureId),
        fixturePayload,
        { merge: true }
      );

      participatingClubIds.forEach((clubId) => {
        batch.set(
          doc(db, "clubs", clubId, "fixtures", fixtureId),
          fixturePayload,
          { merge: true }
        );
      });

      await batch.commit();
    } catch (err) {
      console.error("[EntryPage] Failed accepting challenge:", err);
      window.alert("Could not accept challenge.");
    }
  };

  const handleRejectChallenge = async (challenge) => {
    if (!challenge?.challengeId) return;

    try {
      await updateDoc(
        doc(db, "clubs", activeClubId, "incomingChallenges", challenge.challengeId),
        {
          status: "rejected",
          respondedAt: serverTimestamp(),
          respondedAtMs: Date.now(),
        }
      );
    } catch (err) {
      console.error("[EntryPage] Failed rejecting challenge:", err);
      window.alert("Could not reject challenge.");
    }
  };


  const handleRejectMember = async (memberId) => {
    try {
      await updateDoc(memberDocRef(activeClubId, memberId), {
        status: "rejected",
        rejoinReviewedAt: serverTimestamp(),
        rejoinRequestedAt: deleteField(),
      });
    } catch (err) {
      console.error("Reject failed:", err);
      alert("Could not reject member. Check console for details.");
    }
  };

  return (
    <div className="page entry-page">
      <style>{`
        @keyframes tkNoticeFloat { 0%, 100% { transform: translateY(0) scale(1); } 45% { transform: translateY(-5px) scale(1.035); } }
        @keyframes tkNoticePulse { 0% { box-shadow: 0 0 0 0 rgba(34,211,238,0.44), 0 18px 48px rgba(2,6,23,0.45); } 70% { box-shadow: 0 0 0 14px rgba(34,211,238,0), 0 18px 48px rgba(2,6,23,0.45); } 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0), 0 18px 48px rgba(2,6,23,0.45); } }
        @keyframes tkNoticeRing { 0%, 100% { transform: rotate(0deg); } 12% { transform: rotate(13deg); } 24% { transform: rotate(-11deg); } 36% { transform: rotate(9deg); } 48% { transform: rotate(-7deg); } 60% { transform: rotate(4deg); } }
        @keyframes tkNoticeSlideIn { from { opacity: 0; transform: translateX(18px) scale(0.96); } to { opacity: 1; transform: translateX(0) scale(1); } }
        .tk-admin-notification-dock { position: fixed; right: max(0.85rem, env(safe-area-inset-right)); top: calc(5.15rem + env(safe-area-inset-top)); z-index: 4000; pointer-events: none; }
        .tk-admin-notification-bell { pointer-events: auto; position: relative; width: 3.25rem; height: 3.25rem; border: 0; border-radius: 999px; cursor: pointer; display: grid; place-items: center; background: radial-gradient(circle at 28% 20%, rgba(255,255,255,0.35), transparent 25%), linear-gradient(135deg, rgba(34,211,238,0.98), rgba(99,102,241,0.96)); color: #020617; box-shadow: 0 18px 48px rgba(2,6,23,0.46); animation: tkNoticePulse 1.85s ease-out infinite, tkNoticeFloat 2.6s ease-in-out infinite; }
        .tk-admin-notification-bell span { display: inline-block; animation: tkNoticeRing 1.35s ease-in-out infinite; transform-origin: 50% 10%; font-size: 1.25rem; }
        .tk-admin-notification-count { position: absolute; top: -0.32rem; right: -0.32rem; min-width: 1.28rem; height: 1.28rem; padding: 0 0.28rem; border-radius: 999px; display: grid; place-items: center; background: #ef4444; color: #fff; border: 2px solid rgba(15,23,42,0.98); font-size: 0.72rem; font-weight: 950; line-height: 1; box-shadow: 0 8px 22px rgba(239,68,68,0.38); }
        .tk-admin-notification-card { pointer-events: auto; width: min(350px, calc(100vw - 1.7rem)); border-radius: 22px; overflow: hidden; background: radial-gradient(circle at top left, rgba(34,211,238,0.22), transparent 36%), radial-gradient(circle at bottom right, rgba(34,197,94,0.16), transparent 38%), linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.97)); border: 1px solid rgba(125,211,252,0.34); color: #f8fafc; box-shadow: 0 24px 70px rgba(2,6,23,0.62); animation: tkNoticeSlideIn 180ms ease-out; }
        .tk-admin-notification-topline { display: flex; align-items: center; gap: 0.75rem; padding: 0.86rem 0.95rem 0.62rem; border-bottom: 1px solid rgba(148,163,184,0.15); }
        .tk-admin-notification-icon { flex: 0 0 auto; width: 2.3rem; height: 2.3rem; border-radius: 999px; display: grid; place-items: center; background: radial-gradient(circle at 28% 20%, rgba(255,255,255,0.35), transparent 25%), linear-gradient(135deg, rgba(34,211,238,0.98), rgba(99,102,241,0.96)); color: #020617; box-shadow: 0 0 0 0 rgba(34,211,238,0.44); animation: tkNoticePulse 1.85s ease-out infinite; }
        .tk-admin-notification-icon span { display: inline-block; animation: tkNoticeRing 1.35s ease-in-out infinite; transform-origin: 50% 10%; }
        .tk-admin-notification-title-wrap { min-width: 0; flex: 1; }
        .tk-admin-notification-count-pill { margin-left: auto; border-radius: 999px; padding: 0.18rem 0.5rem; font-size: 0.68rem; font-weight: 950; color: #e0f2fe; background: rgba(14,165,233,0.14); border: 1px solid rgba(56,189,248,0.24); }
        .tk-admin-notification-title { font-weight: 900; letter-spacing: 0.01em; line-height: 1.15; }
        .tk-admin-notification-tag { display: inline-flex; align-items: center; width: max-content; margin-top: 0.28rem; border-radius: 999px; padding: 0.16rem 0.48rem; font-size: 0.66rem; font-weight: 900; text-transform: uppercase; color: #bae6fd; background: rgba(14,165,233,0.12); border: 1px solid rgba(56,189,248,0.22); }
        .tk-admin-notification-body { padding: 0.86rem 0.95rem 0.95rem; }
        .tk-admin-notification-message { margin: 0; line-height: 1.42; font-size: 0.92rem; }
        .tk-admin-notification-helper { margin: 0.65rem 0 0; color: #94a3b8; line-height: 1.42; font-size: 0.78rem; }
        .tk-admin-notification-actions { display: flex; flex-wrap: wrap; gap: 0.55rem; justify-content: flex-start; margin-top: 0.9rem; }
        .tk-admin-notification-nav { display: flex; align-items: center; justify-content: space-between; gap: 0.55rem; margin-top: 0.9rem; padding-top: 0.78rem; border-top: 1px solid rgba(148,163,184,0.14); }
        .tk-admin-notification-nav-buttons { display: flex; gap: 0.45rem; }
        .tk-admin-notification-nav-btn { border: 1px solid rgba(148,163,184,0.28); border-radius: 999px; padding: 0.42rem 0.72rem; color: #dbeafe; font-size: 0.76rem; font-weight: 850; cursor: pointer; background: rgba(15,23,42,0.58); }
        .tk-admin-notification-nav-btn:disabled { opacity: 0.38; cursor: not-allowed; }
        .tk-admin-notification-minimize { border: 0; border-radius: 999px; padding: 0.42rem 0.72rem; color: #bae6fd; font-size: 0.76rem; font-weight: 900; cursor: pointer; background: rgba(14,165,233,0.13); }
        .tk-admin-notification-primary { border: 0; border-radius: 999px; padding: 0.6rem 1rem; color: #022c22; font-weight: 900; cursor: pointer; background: linear-gradient(90deg, #22d3ee, #34d399); box-shadow: 0 10px 26px rgba(34,211,238,0.18); }
        .tk-admin-notification-secondary { border: 1px solid rgba(148,163,184,0.34); border-radius: 999px; padding: 0.6rem 1rem; color: #e2e8f0; font-weight: 850; cursor: pointer; background: rgba(15,23,42,0.7); }

        .tk-entry-signedin-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.85rem;
          margin-top: 0.35rem;
        }
        .tk-entry-home-btn {
          flex: 0 0 auto;
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.36);
          background: rgba(255,255,255,0.94);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          cursor: pointer;
          box-shadow: 0 12px 26px rgba(2,6,23,0.28), 0 0 0 1px rgba(34,211,238,0.08);
          transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
          touch-action: manipulation;
        }
        .tk-entry-home-btn:hover {
          transform: translateY(-1px);
          border-color: rgba(34,211,238,0.65);
          box-shadow: 0 16px 32px rgba(2,6,23,0.34), 0 0 18px rgba(34,211,238,0.18);
        }
        .tk-entry-home-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 999px;
          display: block;
        }

        .entry-page .header {
          position: relative;
        }

        .tk-entry-club-edit-btn {
          position: absolute;
          top: 0.85rem;
          right: 0.85rem;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(15,23,42,0.62);
          color: rgba(248,250,252,0.84);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-weight: 950;
          z-index: 5;
          backdrop-filter: blur(10px);
        }

        .tk-entry-club-edit-btn:hover {
          background: rgba(15,23,42,0.92);
          color: #ffffff;
        }
        @media (max-width: 520px) { .tk-admin-notification-dock { right: 0.62rem; top: calc(4.45rem + env(safe-area-inset-top)); } .tk-admin-notification-card { width: min(330px, calc(100vw - 1.24rem)); border-radius: 19px; } }
      `}</style>
      <header className="header">
        {isAdminViewer ? (
          <button
            type="button"
            className="tk-entry-club-edit-btn"
            onClick={() => setShowEntryClubEditor(true)}
            title="Edit club profile"
            aria-label="Edit club profile"
          >
            ✎
          </button>
        ) : null}

        <div className="header-title">
          <img src={activeClubLogoSrc} alt={`${activeClubName} logo`} className="tk-logo" />
          <h1>{activeClubName}</h1>
        </div>

        {!currentUser && (
          <p className="muted small">
            Not signed in yet. We&apos;ll ask Google for your email when you
            verify as a player.
          </p>
        )}

        <div className="tk-entry-signedin-row">
          {currentUser ? (
            <p className="muted small" style={{ margin: 0 }}>
              Currently signed in as{" "}
              <strong>{currentUser.displayName || currentUser.email}</strong>.
            </p>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Return to the homepage anytime.
            </p>
          )}

          {onGoHome && (
            <button
              type="button"
              className="tk-entry-home-btn"
              onClick={onGoHome}
              title="Back to 5 Asides Near Me HomePage"
              aria-label="Back to 5 Asides Near Me HomePage"
            >
              <img src={FANM_HOME_LOGO} alt="5 Asides Near Me" />
            </button>
          )}
        </div>
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
            <div style={labelCapsuleStyle}>{activeClubShortName} Entry</div>
            <h2
              style={{
                marginTop: "0.9rem",
                marginBottom: "0.55rem",
                fontSize: "clamp(1.55rem, 3.2vw, 2.35rem)",
                lineHeight: 1.06,
              }}
            >
              Welcome to the {activeClubName} player platform
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
            <div
              style={{
                width: "100%",
                position: "relative",
              }}
            >
              {activeClubHeroImage ? (
                <img
                  src={activeClubHeroImage}
                  alt={`${activeClubName} club`}
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
              ) : (
                <div
                  style={{
                    minHeight: "260px",
                    borderRadius: "16px",
                    display: "grid",
                    placeItems: "center",
                    border: "1px dashed rgba(148,163,184,0.22)",
                    background:
                      "radial-gradient(circle at 50% 35%, rgba(34,211,238,0.08), transparent 34%), rgba(2,6,23,0.72)",
                    color: "rgba(226,232,240,0.34)",
                    fontSize: "0.78rem",
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  upload group photo
                </div>
              )}

              {realCanEditClubHero ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <label
                    title="Change main club photo"
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      width: "38px",
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "999px",
                      background: "rgba(2,6,23,0.72)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      color: "#f8fafc",
                      fontSize: "1rem",
                      fontWeight: 900,
                      cursor: "pointer",
                      backdropFilter: "blur(10px)",
                      zIndex: 5,
                    }}
                  >
                    ✎
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleClubHeroPhotoChange}
                      style={{ display: "none" }}
                    />
                  </label>


                  {clubHeroStatus ? (
                    <p className="success-text" style={{ marginTop: "0.45rem" }}>
                      {clubHeroStatus}
                    </p>
                  ) : null}

                  {clubHeroError ? (
                    <p className="error-text" style={{ marginTop: "0.45rem" }}>
                      {clubHeroError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
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
            🏃‍♂️ {activeClubShortName} player
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

      <ClubChatWidget
        activeClubId={activeClubId}
        activeClubName={activeClubName}
        currentUser={currentUser}
        selectedMember={selectedMember}
        identity={identity}
        isAdminViewer={isAdminViewer}
        premiumPanelStyle={premiumPanelStyle}
        variant="launcher"
      />

      {mode === "player" && (
        <section className="card" style={{ ...premiumPanelStyle, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.6rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={labelCapsuleStyle}>Player entry</span>

            {canOpenClubManagement && (
              <button
                type="button"
                aria-label="Manage club administrator privileges"
                title="Manage club administrators"
                onClick={() => {
                  setClubManagementSection(null);
                  setProfileMemberId(
                    isAdminViewer ? "" : signedInMember?.id || ""
                  );
                  setProfileError("");
                  setProfileStatus("");
                  setAdminPrivilegesMemberId("");
                  setTerminationMemberId("");
                  setAdminPrivilegesError("");
                  setAdminPrivilegesStatus("");
                  setTerminationError("");
                  setIdentitySafetyAudit(null);
                  setIdentitySafetyAuditError("");
                  setShowAdminPrivilegesModal(true);
                }}
                style={{
                  width: "2.35rem",
                  height: "2.35rem",
                  marginLeft: "auto",
                  display: "inline-grid",
                  placeItems: "center",
                  borderRadius: "999px",
                  border: "1px solid rgba(56,189,248,0.28)",
                  background:
                    "linear-gradient(180deg, rgba(56,189,248,0.13), rgba(15,23,42,0.18))",
                  color: "#bae6fd",
                  cursor: "pointer",
                  boxShadow: "0 8px 22px rgba(2,6,23,0.18)",
                }}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.36.68.64.94.29.26.67.4 1.06.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.66Z" />
                </svg>
              </button>
            )}
          </div>
          <h2 style={{ marginTop: "0.85rem", marginBottom: "0.35rem" }}>
            Confirm your player identity
          </h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Verify yourself quickly, then we can personalize the app around your profile.
          </p>

          <div className="field-column" style={{ marginTop: "1rem" }}>
            <label>Select your name ({activeClubName} player list)</label>
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
            <div
              style={{
                marginTop: "1rem",
                borderRadius: "18px",
                border: "1px solid rgba(56,189,248,0.18)",
                background:
                  "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(15,23,42,0.04))",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setShowAdminPreviewControls((prev) => !prev)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  color: "#e0f2fe",
                  cursor: "pointer",
                  padding: "0.75rem 0.85rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: "0.18rem" }}>
                  <strong style={{ fontSize: "0.9rem" }}>Admin view mode</strong>
                  <span className="muted small">
                    Current preview: <strong>{adminPreviewRole}</strong>
                  </span>
                </span>
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    borderRadius: "999px",
                    padding: "0.25rem 0.55rem",
                    background: "rgba(15,23,42,0.42)",
                    border: "1px solid rgba(148,163,184,0.18)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {showAdminPreviewControls ? "Hide" : "Change"}
                </span>
              </button>

              {showAdminPreviewControls && (
                <div className="field-column" style={{ padding: "0 0.85rem 0.85rem" }}>
                  <p className="muted small" style={{ marginTop: 0 }}>
                    Default is admin. If you choose player, captain, or spectator,
                    the rest of the app receives that selected role as the active identity.
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

            {!showNewPlayerForm && (
              <button
                type="button"
                className="secondary-btn join-club-flip-button"
                onClick={() => {
                  setShowNewPlayerForm(true);
                  setNewReqError("");
                  setNewReqStatus("");

                  window.setTimeout(() => {
                    document
                      .getElementById("entry-join-request-panel")
                      ?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                  }, 80);
                }}
              >
                <span className="join-club-flip-button__stage">
                  <span className="join-club-flip-button__face join-club-flip-button__face--front">
                    My name is not on the list
                  </span>
                  <span className="join-club-flip-button__face join-club-flip-button__face--back">
                    Click to join
                  </span>
                </span>
              </button>
            )}
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
            <div
              id="entry-join-request-panel"
              className="entry-join-request-panel"
              style={joinPanelStyle}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.55rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={labelCapsuleStyle}>Join request</span>

                <button
                  type="button"
                  className="secondary-btn entry-join-request-close"
                  onClick={() => {
                    setShowNewPlayerForm(false);
                    setNewReqError("");
                    setNewReqStatus("");
                  }}
                >
                  Close
                </button>
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
                  Used only for {activeClubName} reminders and updates.
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

              {joinIdentityCandidate ? (
                <div
                  style={{
                    marginTop: "0.9rem",
                    padding: "1rem",
                    borderRadius: "16px",
                    border:
                      "1px solid rgba(45,212,191,0.38)",
                    background:
                      "linear-gradient(180deg, rgba(16,185,129,0.13), rgba(15,23,42,0.08))",
                  }}
                >
                  <span style={rejoiningBadgeStyle}>
                    Existing player found
                  </span>

                  <h3 style={{ margin: "0.75rem 0 0.35rem" }}>
                    Is this your profile?
                  </h3>

                  <p
                    className="muted small"
                    style={{ marginTop: 0 }}
                  >
                    We found a matching profile from{" "}
                    <strong>
                      {joinIdentityCandidate.clubName ||
                        joinIdentityCandidate.clubId}
                    </strong>
                    .
                  </p>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.8rem",
                      marginTop: "0.8rem",
                    }}
                  >
                    {(
                      joinIdentityCandidate.photoData ||
                      joinIdentityCandidate.photoUrl
                    ) ? (
                      <img
                        src={
                          joinIdentityCandidate.photoData ||
                          joinIdentityCandidate.photoUrl
                        }
                        alt=""
                        style={{
                          width: "62px",
                          height: "72px",
                          borderRadius: "12px",
                          objectFit: "cover",
                        }}
                      />
                    ) : null}

                    <div
                      style={{
                        display: "grid",
                        gap: "0.2rem",
                      }}
                    >
                      <strong>
                        {joinIdentityCandidate.fullName}
                      </strong>
                      <small>
                        {joinIdentityCandidate.email}
                      </small>
                      <small>
                        {joinIdentityCandidate.whatsappNumber ||
                          joinIdentityCandidate.phoneNumber ||
                          "No WhatsApp number saved"}
                      </small>
                    </div>
                  </div>

                  <p
                    className="muted small"
                    style={{ marginTop: "0.8rem" }}
                  >
                    Your contact details and profile photo can be
                    reused. Statistics, roles, payments and match
                    history remain separate for each club.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.6rem",
                      marginTop: "0.85rem",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={declineJoinIdentityCandidate}
                    >
                      No, create this request
                    </button>

                    <button
                      type="button"
                      className="primary-btn"
                      onClick={acceptJoinIdentityCandidate}
                    >
                      Yes, use my profile
                    </button>
                  </div>
                </div>
              ) : null}

              {!joinIdentityCandidate ? (
                <button
                  type="button"
                  className="primary-btn"
                  style={{ marginTop: "0.75rem" }}
                  onClick={handleSubmitNewPlayer}
                  disabled={joinIdentityLookupPending}
                >
                  {joinIdentityLookupPending
                    ? "Checking existing profiles..."
                    : "Request to join player list"}
                </button>
              ) : null}

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
                Your request will go to the {activeClubName} admin. Once approved
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
              {showWithdrawForm ? "Close departure request" : `Need to leave ${activeClubName}?`}
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
            <h3>
              {photoReminderContext.inheritedProfile
                ? "Use your existing profile photo?"
                : "Add your profile photo"}
            </h3>
            <p className="muted small" style={{ marginTop: "0.35rem" }}>
              {photoReminderContext.inheritedProfile ? (
                <>
                  We found a more complete player profile
                  {photoReminderContext.sourceClubName
                    ? ` in ${photoReminderContext.sourceClubName}`
                    : ""}
                  , including your existing profile photo.
                  <br /><br />
                  Press <strong>Save photo & continue</strong> to copy that profile photo into this club,
                  or upload a different one if you would prefer to replace it.
                </>
              ) : (
                <>
                  You are already on the {activeClubName} system, but you do not have a player photo yet.
                  This is optional, but it helps with player cards and match pages.
                </>
              )}
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

      <HomePage_HUB_ClubProfileEditorModal
        isOpen={showEntryClubEditor}
        club={activeClub}
        adminIdentity={{
          ...(identity || {}),
          ...(selectedMember || {}),
          email: currentUser?.email || selectedMember?.email || identity?.email || "",
        }}
        onClose={() => setShowEntryClubEditor(false)}
        onSaved={(updatedClub) => {
          setEntryClubProfileOverride((current) => ({
            ...(current || {}),
            ...(updatedClub || {}),
          }));

          if (typeof onClubUpdated === "function") {
            onClubUpdated(updatedClub);
          }

          setShowEntryClubEditor(false);
        }}
      />

      {fixtureDiscussionModal && (
        <div className="modal-backdrop">
          <div className="modal fixture-discussion-modal">
            <div className="fixture-discussion-head">
              <div>
                <h3>Fixture discussion</h3>
                <p className="muted small">
                  {fixtureDiscussionModal.homeClubName || "Home Club"} vs{" "}
                  {fixtureDiscussionModal.awayClubName || "Away Club"}
                </p>
              </div>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setFixtureDiscussionModal(null);
                  setFixtureDiscussionDraft("");
                }}
              >
                Close
              </button>
            </div>

            <div className="fixture-discussion-messages">
              {fixtureDiscussionMessages.length ? (
                fixtureDiscussionMessages.map((message) => {
                  const isMine = String(message.fromClubId || "") === String(activeClubId || "");

                  return (
                    <div
                      key={message.id}
                      className={`fixture-discussion-message ${isMine ? "is-mine" : ""}`}
                    >
                      <strong>{message.fromClubName || "Club"}</strong>
                      <p>{message.text || message.message || ""}</p>
                    </div>
                  );
                })
              ) : (
                <div className="fixture-discussion-empty">
                  No discussion yet. Start the conversation below.
                </div>
              )}
            </div>

            <div className="fixture-discussion-compose">
              <textarea
                className="text-input"
                rows={3}
                value={fixtureDiscussionDraft}
                onChange={(event) => setFixtureDiscussionDraft(event.target.value)}
                placeholder="Type a fixture message..."
              />

              <button
                type="button"
                className="primary-btn"
                disabled={!String(fixtureDiscussionDraft || "").trim()}
                onClick={handleSendFixtureDiscussionMessage}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {fixtureAlternativeModal && (
        <div className="modal-backdrop">
          <div className="modal fixture-alternative-modal">
            <div className="fixture-alternative-icon">💬</div>

            <h3>Suggest an alternative</h3>

            <p className="muted small">
              Send a clear alternative to{" "}
              <strong>
                {fixtureAlternativeModal.fromClubName || "the other club"}
              </strong>
              . They will receive your proposal as a fixture notification.
            </p>

            <textarea
              className="text-input"
              rows={4}
              value={fixtureAlternativeMessage}
              onChange={(event) => setFixtureAlternativeMessage(event.target.value)}
              placeholder="Example: Can we move this to Sunday 18:00 at UCT Turf Sports Fields?"
            />

            <div className="fixture-alternative-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setFixtureAlternativeModal(null);
                  setFixtureAlternativeMessage("");
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-btn"
                disabled={!String(fixtureAlternativeMessage || "").trim()}
                onClick={handleSubmitFixtureAlternative}
              >
                Send alternative
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdminViewer && notificationCount > 0 && (
        <div className="tk-admin-notification-dock" aria-live="polite">
          {!isAdminNoticePanelOpen ? (
            <button
              type="button"
              className="tk-admin-notification-bell"
              onClick={() => setIsAdminNoticePanelOpen(true)}
              aria-label={`Open ${notificationCount} ${activeClubName} notification${notificationCount === 1 ? "" : "s"}`}
            >
              <span aria-hidden="true">🔔</span>
              <div className="tk-admin-notification-count">{notificationCount}</div>
            </button>
          ) : activeAdminNotice ? (
            <div className="tk-admin-notification-card" role="status">
              <div className="tk-admin-notification-topline">
                <div className="tk-admin-notification-icon" aria-hidden="true">
                  <span>{activeAdminNotice.icon || "🔔"}</span>
                </div>

                <div className="tk-admin-notification-title-wrap">
                  <div className="tk-admin-notification-title">{activeAdminNotice.title}</div>
                  <div className="tk-admin-notification-tag">{activeAdminNotice.tag}</div>
                </div>

                <div className="tk-admin-notification-count-pill">
                  {Math.min(activeAdminNoticeIndex + 1, notificationCount)} of {notificationCount}
                </div>
              </div>

              <div className="tk-admin-notification-body">
                <p className="tk-admin-notification-message">
                  {activeAdminNotice.message}
                </p>

                <p className="tk-admin-notification-helper">
                  {activeAdminNotice.helper}
                </p>

                {activeAdminNotice.type === "club_challenge" ? (
                  <div className="tk-admin-notification-actions">
                    <button
                      type="button"
                      className="tk-admin-notification-primary"
                      onClick={() => handleAcceptChallenge(activeAdminNotice.payload)}
                    >
                      Accept
                    </button>

                    <button
                      type="button"
                      className="tk-admin-notification-secondary"
                      onClick={() => handleRejectChallenge(activeAdminNotice.payload)}
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      className="tk-admin-notification-nav-btn"
                      disabled
                      title="Club chat coming soon"
                    >
                      Discuss
                    </button>
                  </div>
                ) : activeAdminNotice.type === "challenge_change_requested" ? (
                  <div className="tk-admin-notification-actions">
                    <button
                      type="button"
                      className="tk-admin-notification-primary"
                      onClick={() => handleAcceptFixtureChange(activeAdminNotice.payload)}
                    >
                      Accept update
                    </button>

                    <button
                      type="button"
                      className="tk-admin-notification-secondary"
                      onClick={() => openFixtureAlternativeModal(activeAdminNotice.payload)}
                    >
                      Suggest alternative
                    </button>
                  </div>
                ) : activeAdminNotice.type === "challenge_change_reply" ? (
                  <div className="tk-admin-notification-actions">
                    <button
                      type="button"
                      className="tk-admin-notification-primary"
                      onClick={() => handleAcceptFixtureAlternative(activeAdminNotice.payload)}
                    >
                      Accept alternative
                    </button>

                    <button
                      type="button"
                      className="tk-admin-notification-secondary"
                      onClick={() => handleContinueOriginalFixtureRequest(activeAdminNotice.payload)}
                    >
                      Continue request
                    </button>

                    <button
                      type="button"
                      className="tk-admin-notification-nav-btn"
                      onClick={() => openFixtureDiscussion(activeAdminNotice.payload)}
                    >
                      Open discussion
                    </button>
                  </div>
                ) : activeAdminNotice.type === "new_player" ? (
                  <div className="tk-admin-notification-actions">
                    <button
                      type="button"
                      className="tk-admin-notification-primary"
                      onClick={async () => {
                        await handleApproveMember(activeAdminNotice.payload?.id);
                        await handleAcknowledgeAdminNotice(activeAdminNotice);
                      }}
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      className="tk-admin-notification-secondary"
                      onClick={async () => {
                        await handleRejectMember(activeAdminNotice.payload?.id);
                        await handleAcknowledgeAdminNotice(activeAdminNotice);
                      }}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="tk-admin-notification-actions">
                    <button
                      type="button"
                      className="tk-admin-notification-primary"
                      onClick={() => handleAcknowledgeAdminNotice(activeAdminNotice)}
                    >
                      Got it
                    </button>
                  </div>
                )}

                <div className="tk-admin-notification-nav">
                  <div className="tk-admin-notification-nav-buttons">
                    <button
                      type="button"
                      className="tk-admin-notification-nav-btn"
                      disabled={notificationCount <= 1}
                      onClick={() =>
                        setActiveAdminNoticeIndex((idx) =>
                          idx <= 0 ? notificationCount - 1 : idx - 1
                        )
                      }
                    >
                      Back
                    </button>

                    <button
                      type="button"
                      className="tk-admin-notification-nav-btn"
                      disabled={notificationCount <= 1}
                      onClick={() =>
                        setActiveAdminNoticeIndex((idx) =>
                          idx >= notificationCount - 1 ? 0 : idx + 1
                        )
                      }
                    >
                      Next
                    </button>
                  </div>

                  <button
                    type="button"
                    className="tk-admin-notification-minimize"
                    onClick={() => setIsAdminNoticePanelOpen(false)}
                  >
                    Minimize
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {canOpenClubManagement && showAdminPrivilegesModal && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Club management"
            style={{
              width: "min(94vw, 620px)",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <span style={labelCapsuleStyle}>Club controls</span>
                <h3 style={{ margin: "0.75rem 0 0.25rem" }}>
                  Club Management
                </h3>
                <p className="muted small" style={{ margin: 0 }}>
                  Manage your club.
                </p>
              </div>

              <button
                type="button"
                className="secondary-btn"
                aria-label="Close Club Management"
                onClick={() => {
                  setClubManagementSection(null);
                  setShowAdminPrivilegesModal(false);
                }}
                style={{
                  width: "2.35rem",
                  minWidth: "2.35rem",
                  height: "2.35rem",
                  padding: 0,
                  borderRadius: "999px",
                  fontSize: "1.25rem",
                }}
              >
                ×
              </button>
            </div>

            {/* Player Profiles */}
            <section
              style={{
                marginTop: "1rem",
                borderRadius: "20px",
                border: "1px solid rgba(167,139,250,0.34)",
                background:
                  "linear-gradient(180deg, rgba(124,58,237,0.13), rgba(15,23,42,0.18))",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setClubManagementSection((current) =>
                    current === "profiles" ? null : "profiles"
                  )
                }
                aria-expanded={clubManagementSection === "profiles"}
                style={{
                  width: "100%",
                  border: 0,
                  padding: "0.95rem 1rem",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.8rem",
                  textAlign: "left",
                }}
              >
                <span>
                  <strong style={{ display: "block" }}>
                    {isAdminViewer
                      ? "👤 Player Profiles"
                      : "👤 Player Profile"}
                  </strong>
                  <span className="muted small">
                    {isAdminViewer
                      ? "Update player details."
                      : "Update your details."}
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  style={{
                    color: "#c4b5fd",
                    fontSize: "1.15rem",
                    transform:
                      clubManagementSection === "profiles"
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                    transition: "transform 180ms ease",
                  }}
                >
                  ›
                </span>
              </button>

              {clubManagementSection === "profiles" && (
                <div
                  style={{
                    padding: "0 1rem 1rem",
                    borderTop: "1px solid rgba(167,139,250,0.18)",
                  }}
                >
                  {isAdminViewer ? (
                    <div
                      className="field-column"
                      style={{ marginTop: "0.9rem" }}
                    >
                      <label>Select player</label>

                      <select
                        className="text-input"
                        value={profileMemberId}
                        onChange={(event) => {
                          setProfileMemberId(event.target.value);
                          setProfileError("");
                          setProfileStatus("");
                        }}
                      >
                        <option value="">Select a player...</option>

                        {activeMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {!profileMember ? (
                    <p
                      className="muted small"
                      style={{ marginTop: "0.9rem", marginBottom: 0 }}
                    >
                      {isAdminViewer
                        ? "Select a player."
                        : "Your member profile could not be matched."}
                    </p>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.8rem",
                          marginTop: "0.9rem",
                          padding: "0.8rem",
                          borderRadius: "16px",
                          border: "1px solid rgba(167,139,250,0.2)",
                          background: "rgba(124,58,237,0.07)",
                        }}
                      >
                        <div
                          style={{
                            width: "64px",
                            height: "64px",
                            flex: "0 0 64px",
                            overflow: "hidden",
                            borderRadius: "18px",
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(15,23,42,0.45)",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {profileDraft.photoData ? (
                            <img
                              src={profileDraft.photoData}
                              alt=""
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: "1.6rem" }}>👤</span>
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: "block" }}>
                            {toTitleCase(
                              profileDraft.fullName ||
                              profileMember.fullName ||
                              profileMember.shortName ||
                              "Player"
                            )}
                          </strong>
                          <span className="muted small">
                            {profileMember.role === "admin"
                              ? "Administrator"
                              : profileMember.role === "captain"
                                ? "Captain"
                                : "Player"}
                          </span>
                        </div>
                      </div>

                      <div
                        className="field-column"
                        style={{ marginTop: "0.9rem" }}
                      >
                        <label>Profile photo</label>
                        <input
                          type="file"
                          accept="image/*"
                          className="text-input"
                          style={compactFileInputStyle}
                          onChange={handleProfilePhotoChange}
                        />
                      </div>

                      <div
                        className="field-column"
                        style={{ marginTop: "0.8rem" }}
                      >
                        <label>Full name</label>
                        <input
                          type="text"
                          className="text-input"
                          value={profileDraft.fullName}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              fullName: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div
                        className="field-column"
                        style={{ marginTop: "0.8rem" }}
                      >
                        <label>Email</label>
                        <input
                          type="email"
                          className="text-input"
                          value={profileDraft.email}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div
                        className="field-column"
                        style={{ marginTop: "0.8rem" }}
                      >
                        <label>WhatsApp</label>
                        <input
                          type="tel"
                          className="text-input"
                          value={profileDraft.whatsappNumber}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              whatsappNumber: event.target.value,
                            }))
                          }
                        />
                      </div>

                      {profileError && (
                        <p className="error-text">{profileError}</p>
                      )}

                      {profileStatus && (
                        <p className="success-text">{profileStatus}</p>
                      )}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          marginTop: "0.9rem",
                        }}
                      >
                        <button
                          type="button"
                          className="primary-btn"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(124,58,237,0.98), rgba(76,29,149,0.98))",
                            borderColor: "rgba(196,181,253,0.55)",
                          }}
                          disabled={
                            profileSaving || !canEditSelectedProfile
                          }
                          onClick={handleSavePlayerProfile}
                        >
                          {profileSaving
                            ? "Saving..."
                            : "Save Profile"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>

            {isAdminViewer && (
              <>
                {/* Administrator Management */}
                <section
              style={{
                marginTop: "1rem",
                borderRadius: "20px",
                border: "1px solid rgba(56,189,248,0.3)",
                background:
                  "linear-gradient(180deg, rgba(14,165,233,0.1), rgba(15,23,42,0.18))",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setClubManagementSection((current) =>
                    current === "admins" ? null : "admins"
                  )
                }
                aria-expanded={clubManagementSection === "admins"}
                style={{
                  width: "100%",
                  border: 0,
                  padding: "0.95rem 1rem",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.8rem",
                  textAlign: "left",
                }}
              >
                <span>
                  <strong style={{ display: "block" }}>
                    👑 Administrators
                  </strong>
                  <span className="muted small">
                    Manage administrators.
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  style={{
                    color: "#7dd3fc",
                    fontSize: "1.15rem",
                    transform:
                      clubManagementSection === "admins"
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                    transition: "transform 180ms ease",
                  }}
                >
                  ›
                </span>
              </button>

              {clubManagementSection === "admins" && (
                <div
                  style={{
                    padding: "0 1rem 1rem",
                    borderTop: "1px solid rgba(56,189,248,0.16)",
                  }}
                >
                  <div
                    style={{
                      marginTop: "0.9rem",
                      padding: "0.85rem",
                      borderRadius: "16px",
                      border: "1px solid rgba(148,163,184,0.16)",
                      background: "rgba(2,6,23,0.2)",
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: "0.6rem" }}>
                      Current administrators
                    </strong>

                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      {currentClubAdministrators.map((administrator) => (
                        <div
                          key={administrator.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.7rem",
                            padding: "0.62rem 0.68rem",
                            borderRadius: "14px",
                            border: administrator.isMainAdmin
                              ? "1px solid rgba(250,204,21,0.3)"
                              : "1px solid rgba(56,189,248,0.18)",
                            background: administrator.isMainAdmin
                              ? "rgba(250,204,21,0.07)"
                              : "rgba(56,189,248,0.05)",
                          }}
                        >
                          <strong style={{ overflowWrap: "anywhere" }}>
                            {administrator.isMainAdmin ? "★ " : "◆ "}
                            {administrator.fullName}
                          </strong>

                          <span
                            style={{
                              flex: "0 0 auto",
                              padding: "0.24rem 0.5rem",
                              borderRadius: "999px",
                              border: "1px solid rgba(148,163,184,0.2)",
                              background: "rgba(15,23,42,0.3)",
                              fontSize: "0.67rem",
                              fontWeight: 900,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {administrator.isMainAdmin
                              ? "Main admin · Protected"
                              : "Club admin"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="field-column" style={{ marginTop: "0.9rem" }}>
                    <label>Select member</label>
                    <select
                      className="text-input"
                      value={adminPrivilegesMemberId}
                      onChange={(event) => {
                        setAdminPrivilegesMemberId(event.target.value);
                        setAdminPrivilegesError("");
                        setAdminPrivilegesStatus("");
                      }}
                    >
                      <option value="">Select a member...</option>
                      {activeMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}
                          {member.role === "admin"
                            ? " — Club administrator"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {adminPrivilegesMember && (
                    <div
                      style={{
                        marginTop: "0.8rem",
                        padding: "0.8rem",
                        borderRadius: "16px",
                        border: adminPrivilegesMemberIsProtected
                          ? "1px solid rgba(250,204,21,0.3)"
                          : "1px solid rgba(56,189,248,0.2)",
                        background: adminPrivilegesMemberIsProtected
                          ? "rgba(250,204,21,0.07)"
                          : "rgba(14,165,233,0.06)",
                      }}
                    >
                      <strong>{adminPrivilegesMember.fullName}</strong>
                      <span
                        className="muted small"
                        style={{ display: "block", marginTop: "0.25rem" }}
                      >
                        {adminPrivilegesMemberIsProtected
                          ? "Main administrator · Protected"
                          : adminPrivilegesMemberIsAdmin
                            ? "Club administrator"
                            : "Club member"}
                      </span>
                    </div>
                  )}

                  {adminPrivilegesError && (
                    <p className="error-text">{adminPrivilegesError}</p>
                  )}

                  {adminPrivilegesStatus && (
                    <p className="success-text">{adminPrivilegesStatus}</p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: "0.85rem",
                    }}
                  >
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={
                        !adminPrivilegesMember ||
                        adminPrivilegesSaving ||
                        (
                          adminPrivilegesMemberIsAdmin &&
                          adminPrivilegesMemberIsProtected
                        )
                      }
                      onClick={() =>
                        handleSetClubAdminPrivilege(
                          !adminPrivilegesMemberIsAdmin
                        )
                      }
                      style={
                        adminPrivilegesMemberIsAdmin
                          ? {
                              background:
                                "linear-gradient(180deg, rgba(220,38,38,0.96), rgba(127,29,29,0.98))",
                              borderColor: "rgba(248,113,113,0.65)",
                            }
                          : brightPrimaryStyle
                      }
                    >
                      {adminPrivilegesSaving
                        ? "Saving..."
                        : adminPrivilegesMemberIsAdmin
                          ? "Remove Admin Privileges"
                          : "Promote to Club Admin"}
                    </button>
                  </div>
                </div>
              )}
            </section>

              </>
            )}

            {isAdminViewer && (
              <>
                {/* Player-list Cleanup */}
                <section
              style={{
                marginTop: "0.8rem",
                borderRadius: "20px",
                border: "1px solid rgba(248,113,113,0.34)",
                background:
                  "linear-gradient(180deg, rgba(127,29,29,0.14), rgba(15,23,42,0.18))",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setClubManagementSection((current) =>
                    current === "cleanup" ? null : "cleanup"
                  )
                }
                aria-expanded={clubManagementSection === "cleanup"}
                style={{
                  width: "100%",
                  border: 0,
                  padding: "0.95rem 1rem",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.8rem",
                  textAlign: "left",
                }}
              >
                <span>
                  <strong style={{ display: "block" }}>
                    🧹 Player-list Cleanup
                  </strong>
                  <span className="muted small">
                    Remove inactive players.
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  style={{
                    color: "#fca5a5",
                    fontSize: "1.15rem",
                    transform:
                      clubManagementSection === "cleanup"
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                    transition: "transform 180ms ease",
                  }}
                >
                  ›
                </span>
              </button>

              {clubManagementSection === "cleanup" && (
                <div
                  style={{
                    padding: "0 1rem 1rem",
                    borderTop: "1px solid rgba(248,113,113,0.16)",
                  }}
                >
                  <div
                    style={{
                      marginTop: "0.9rem",
                      padding: "0.8rem",
                      borderRadius: "16px",
                      border: "1px solid rgba(52,211,153,0.18)",
                      background: "rgba(16,185,129,0.05)",
                    }}
                  >
                    <strong style={{ display: "block", fontSize: "0.83rem" }}>
                      Match history remains
                    </strong>
                    <span
                      className="muted small"
                      style={{ display: "block", marginTop: "0.3rem" }}
                    >
                      Results, goals, assists, cards and statistics stay.
                    </span>
                  </div>

                  <div className="field-column" style={{ marginTop: "0.9rem" }}>
                    <label>Select player</label>
                    <select
                      className="text-input"
                      value={terminationMemberId}
                      onChange={(event) => {
                        setTerminationMemberId(event.target.value);
                        setTerminationMember(null);
                        setTerminationConfirmation("");
                        setTerminationError("");
                        setIdentitySafetyAudit(null);
                        setIdentitySafetyAuditError("");
                      }}
                    >
                      <option value="">Select a player...</option>
                      {activeMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {terminationCandidate && (
                    <div
                      style={{
                        marginTop: "0.85rem",
                        padding: "0.9rem",
                        borderRadius: "17px",
                        border:
                          identitySafetyAudit?.status === "safe"
                            ? "1px solid rgba(52,211,153,0.3)"
                            : identitySafetyAudit?.status === "attention"
                              ? "1px solid rgba(250,204,21,0.3)"
                              : identitySafetyAudit?.status === "unsafe"
                                ? "1px solid rgba(248,113,113,0.36)"
                                : "1px solid rgba(148,163,184,0.18)",
                        background:
                          identitySafetyAudit?.status === "safe"
                            ? "rgba(16,185,129,0.07)"
                            : identitySafetyAudit?.status === "attention"
                              ? "rgba(250,204,21,0.07)"
                              : identitySafetyAudit?.status === "unsafe"
                                ? "rgba(127,29,29,0.14)"
                                : "rgba(2,6,23,0.2)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.7rem",
                        }}
                      >
                        <strong>Identity Safety Audit</strong>
                        <span
                          style={{
                            padding: "0.25rem 0.55rem",
                            borderRadius: "999px",
                            border: "1px solid rgba(148,163,184,0.2)",
                            background: "rgba(15,23,42,0.3)",
                            fontSize: "0.69rem",
                            fontWeight: 900,
                          }}
                        >
                          {identitySafetyAuditLoading
                            ? "Checking..."
                            : identitySafetyAudit?.status === "safe"
                              ? "Safe"
                              : identitySafetyAudit?.status === "attention"
                                ? "Safe · Attention"
                                : identitySafetyAudit?.status === "unsafe"
                                  ? "Unsafe"
                                  : "Pending"}
                        </span>
                      </div>

                      <strong
                        style={{ display: "block", marginTop: "0.7rem" }}
                      >
                        {terminationCandidate.fullName}
                      </strong>

                      {identitySafetyAuditLoading && (
                        <p className="muted small">Checking records…</p>
                      )}

                      {identitySafetyAuditError && (
                        <p className="error-text">
                          {identitySafetyAuditError}
                        </p>
                      )}

                      {identitySafetyAudit && (
                        <div
                          style={{
                            display: "grid",
                            gap: "0.42rem",
                            marginTop: "0.7rem",
                          }}
                        >
                          <div className="muted small">
                            {identitySafetyAudit.duplicateEmailMembers.length
                              ? "⚠ Shared email"
                              : "✓ Email unshared"}
                          </div>

                          <div className="muted small">
                            {identitySafetyAudit.duplicateUidMembers.length ||
                            identitySafetyAudit
                              .duplicatePlatformIdentityMembers.length
                              ? "⚠ Shared account"
                              : "✓ Account unshared"}
                          </div>

                          <div className="muted small">
                            {identitySafetyAudit
                              .duplicatePlayerIdMembers.length
                              ? "⚠ Shared player ID"
                              : "✓ Player ID unique"}
                          </div>

                          <div className="muted small">
                            {identitySafetyAudit.playerProfileExists
                              ? "✓ Player profile found"
                              : "• Player profile not found"}
                          </div>

                          <div className="muted small">
                            • Photos: {identitySafetyAudit.photoCount}
                          </div>

                          <div className="muted small">
                            • Signups: {identitySafetyAudit.signupCount}
                          </div>

                          {identitySafetyAudit.blockers.length > 0 && (
                            <div
                              style={{
                                marginTop: "0.3rem",
                                padding: "0.7rem",
                                borderRadius: "14px",
                                border:
                                  "1px solid rgba(248,113,113,0.26)",
                                background: "rgba(127,29,29,0.14)",
                              }}
                            >
                              <strong>Removal blocked</strong>
                              {identitySafetyAudit.blockers.map(
                                (message, index) => (
                                  <div
                                    key={`${message}-${index}`}
                                    className="muted small"
                                    style={{ marginTop: "0.35rem" }}
                                  >
                                    • {message}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {terminationError && (
                    <p className="error-text">{terminationError}</p>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: "0.85rem",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={
                        !terminationCandidate ||
                        identitySafetyAuditLoading ||
                        !selectedTerminationMemberPassedIdentitySafetyAudit
                      }
                      onClick={() => {
                        if (
                          !selectedTerminationMemberPassedIdentitySafetyAudit
                        ) {
                          setTerminationError(
                            "Removal is blocked until the safety audit passes."
                          );
                          return;
                        }

                        setTerminationError("");
                        setTerminationConfirmation("");
                        setTerminationMember(terminationCandidate);
                      }}
                      style={{
                        color: "#fecaca",
                        borderColor: "rgba(248,113,113,0.42)",
                        background: "rgba(127,29,29,0.18)",
                      }}
                    >
                      Remove from Player List
                    </button>
                  </div>
                </div>
              )}
            </section>

              </>
            )}


          </div>
        </div>
      )}

      {isAdminViewer && terminationMember && (
        <div className="modal-backdrop modal-backdrop--nested-popup">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Terminate club membership"
            style={{
              width: "min(92vw, 520px)",
              maxHeight: "88vh",
              overflowY: "auto",
            }}
          >
            <span
              style={{
                ...labelCapsuleStyle,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(248,113,113,0.24)",
                color: "#fecaca",
              }}
            >
              Permanent action
            </span>

            <h3 style={{ marginTop: "0.85rem", marginBottom: "0.4rem" }}>
              Terminate {terminationMember.fullName}?
            </h3>

            <p className="muted small">
              This permanently removes the member’s active club identity,
              football profile, club photo and current or future signup
              records.
            </p>

            <div
              style={{
                marginTop: "0.85rem",
                padding: "0.85rem",
                borderRadius: "16px",
                border: "1px solid rgba(52,211,153,0.2)",
                background: "rgba(16,185,129,0.06)",
              }}
            >
              <strong style={{ display: "block" }}>
                Historical football records will remain
              </strong>
              <span
                className="muted small"
                style={{ display: "block", marginTop: "0.3rem" }}
              >
                Completed matches, scorelines, goals, assists, cards, league
                records and statistics will not be deleted.
              </span>
            </div>

            <div className="field-column" style={{ marginTop: "1rem" }}>
              <label>
                Type <strong>{terminationMember.fullName}</strong> to confirm
              </label>
              <input
                type="text"
                className="text-input"
                value={terminationConfirmation}
                onChange={(event) => {
                  setTerminationConfirmation(event.target.value);
                  setTerminationError("");
                }}
                placeholder={terminationMember.fullName}
                autoComplete="off"
              />
            </div>

            {terminationError && (
              <p className="error-text" style={{ marginTop: "0.7rem" }}>
                {terminationError}
              </p>
            )}

            <div className="actions-row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="secondary-btn"
                disabled={terminationSaving}
                onClick={() => {
                  setTerminationMember(null);
                  setTerminationConfirmation("");
                  setTerminationError("");
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-btn"
                disabled={
                  terminationSaving ||
                  !terminationMemberPassedIdentitySafetyAudit ||
                  String(terminationConfirmation || "")
                    .trim()
                    .toLowerCase() !==
                    String(terminationMember.fullName || "")
                      .trim()
                      .toLowerCase()
                }
                onClick={handleTerminateClubMembership}
                style={{
                  background:
                    "linear-gradient(180deg, rgba(220,38,38,0.98), rgba(127,29,29,0.98))",
                  borderColor: "rgba(248,113,113,0.68)",
                }}
              >
                {terminationSaving
                  ? "Terminating..."
                  : "Permanently Terminate Membership"}
              </button>
            </div>
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
