// src/pages/MatchSignupPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { app, db } from "../firebaseConfig";
import { getFunctions, httpsCallable } from "firebase/functions";

const MIN_PLAYERS = 10;
const MAX_PLAYERS = 18;
const DEFAULT_VISIBLE_SLOTS = 10;
const COST_PER_GAME = 65;
const FALLBACK_SEASON_ID = "local_manual_season";
const DEFAULT_SIGNUP_TYPE = "general";

const functionsClient = getFunctions(app, "us-central1");
const verifyWhatsAppNumberCallable = httpsCallable(
  functionsClient,
  "verifyWhatsAppNumber"
);
const VERIFIED_STATUSES = new Set([
  "verified",
  "manual_admin_verified",
  "manual_admin_required",
  "failed_once",
  "failed_twice",
]);
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

function buildProfileDocCandidates({ identity, currentUser, displayName, userId }) {
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

async function resolveProfileDocTarget({ identity, currentUser, displayName, userId }) {
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

function getWhatsappProfileMessage(status, adminName) {
  switch (String(status || "")) {
    case "verified":
    case "manual_admin_verified":
      return "Your WhatsApp number has been verified and saved for football reminders.";
    case "failed_once":
      return "That number appears incorrect or unreachable. Please check it carefully and try once more.";
    case "failed_twice":
    case "manual_admin_required":
      return `We still could not verify that number after two tries. Please contact admin ${adminName} for cellphone verification.`;
    case "pending":
    case "queued":
      return "We sent a short WhatsApp check. Please wait a few seconds while we confirm delivery.";
    default:
      return "Add your WhatsApp number for football reminders like reschedules, payment confirmations, and match updates.";
  }
}


function toTitleCaseLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

function normKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildPendingSignupId({
  signupType = DEFAULT_SIGNUP_TYPE,
  displayName,
  monthLabel,
}) {
  return [
    slugFromLooseName(signupType),
    slugFromLooseName(displayName || "player"),
    slugFromLooseName(monthLabel || "month"),
  ].join("__");
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

function getNextMonthWednesdays() {
  const now = new Date();
  const year =
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = (now.getMonth() + 1) % 12;

  const dates = [];
  const d = new Date(year, month, 1);

  while (d.getMonth() === month) {
    if (d.getDay() === 3) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  return dates.map((date) => ({
    id: `${year}-${String(month + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`,
    label: date.toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    shortLabel: date.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
    }),
    fullLabel: date.toLocaleDateString("en-ZA", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    date,
  }));
}

function getCalendarMonthData(weeks = []) {
  const firstWeekDate =
    Array.isArray(weeks) && weeks.length > 0 ? weeks[0].date : null;

  const baseDate = firstWeekDate instanceof Date ? firstWeekDate : new Date();
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const cells = [];

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const id = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

    cells.push({
      id,
      day,
      weekday: date.getDay(),
      date,
    });
  }

  return {
    monthLabel: firstDay.toLocaleDateString("en-ZA", {
      month: "long",
      year: "numeric",
    }),
    cells,
  };
}

function getStatus(count) {
  if (count >= MAX_PLAYERS) {
    return { key: "full", label: "Full", shortLabel: "Full" };
  }
  if (count >= MIN_PLAYERS) {
    return { key: "viable", label: "Game on", shortLabel: "On" };
  }
  return { key: "low", label: "needs players", shortLabel: "not filled" };
}

function getEntryName(entry) {
  if (typeof entry === "string") return toTitleCaseLoose(entry);
  if (!entry || typeof entry !== "object") return "";
  return toTitleCaseLoose(
    entry.shortName ||
      entry.fullName ||
      entry.displayName ||
      entry.name ||
      entry.playerName ||
      ""
  );
}

function getEntryShortName(entry) {
  const full = getEntryName(entry);
  return firstNameOf(full) || full;
}

function getIdentityKeys(identity, displayName, shortName) {
  return [
    identity?.memberId,
    identity?.playerId,
    identity?.shortName,
    identity?.fullName,
    identity?.displayName,
    identity?.name,
    identity?.playerName,
    identity?.email,
    displayName,
    shortName,
    firstNameOf(displayName),
    slugFromLooseName(displayName),
    slugFromLooseName(shortName),
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map(normKey);
}

function findCurrentPlayersTeam(teams = [], identity, displayName, shortName) {
  const identityKeys = getIdentityKeys(identity, displayName, shortName);

  for (const team of teams) {
    const players = Array.isArray(team?.players) ? team.players : [];

    const found = players.some((entry) => {
      const candidates =
        typeof entry === "string"
          ? [entry, firstNameOf(entry), slugFromLooseName(entry)]
          : [
              entry?.playerId,
              entry?.memberId,
              entry?.id,
              entry?.uid,
              entry?.shortName,
              entry?.fullName,
              entry?.displayName,
              entry?.name,
              entry?.playerName,
              firstNameOf(
                entry?.shortName ||
                  entry?.fullName ||
                  entry?.displayName ||
                  entry?.name ||
                  entry?.playerName
              ),
              slugFromLooseName(
                entry?.shortName ||
                  entry?.fullName ||
                  entry?.displayName ||
                  entry?.name ||
                  entry?.playerName
              ),
            ];

      return candidates
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map(normKey)
        .some((k) => identityKeys.includes(k));
    });

    if (found) return team;
  }

  return null;
}

function extractMatchDayHistoryFromMainDoc(mainData, activeSeasonId) {
  const state = mainData?.state || {};
  const seasons = Array.isArray(state?.seasons) ? state.seasons : [];
  const activeSeason =
    seasons.find(
      (s) =>
        String(s?.seasonId || "").trim() === String(activeSeasonId || "").trim()
    ) || null;

  return Array.isArray(activeSeason?.matchDayHistory)
    ? activeSeason.matchDayHistory
    : [];
}

function buildAttendanceFromMatchDayHistory({
  matchDayHistory = [],
  identity,
  displayName,
  shortName,
}) {
  const identityKeys = getIdentityKeys(identity, displayName, shortName);
  const allMatchDays = new Set();
  const attendedMatchDays = new Set();
  let gamesPlayed = 0;

  (Array.isArray(matchDayHistory) ? matchDayHistory : []).forEach((day) => {
    const matchDayId = String(day?.id || day?.matchDayId || "").trim();
    if (!matchDayId) return;

    allMatchDays.add(matchDayId);

    const playerAppearances = Array.isArray(day?.playerAppearances)
      ? day.playerAppearances
      : [];

    const matchingEntry = playerAppearances.find((entry) => {
      const rowKeys = [
        entry?.playerId,
        entry?.playerName,
        entry?.shortName,
        entry?.displayName,
        firstNameOf(
          entry?.playerName || entry?.shortName || entry?.displayName || ""
        ),
        slugFromLooseName(
          entry?.playerName || entry?.shortName || entry?.displayName || ""
        ),
      ]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map(normKey);

      return rowKeys.some((k) => identityKeys.includes(k));
    });

    if (!matchingEntry) return;

    attendedMatchDays.add(matchDayId);

    const directMatchesPlayed = Number(
      matchingEntry?.matchesPlayed ?? matchingEntry?.gamesPlayed
    );

    if (Number.isFinite(directMatchesPlayed) && directMatchesPlayed > 0) {
      gamesPlayed += directMatchesPlayed;
    } else {
      const playedFlag = String(
        matchingEntry?.played ??
          matchingEntry?.didPlay ??
          matchingEntry?.wasInGame ??
          ""
      ).toLowerCase();

      if (
        playedFlag === "true" ||
        playedFlag === "1" ||
        playedFlag === "yes"
      ) {
        gamesPlayed += 1;
      }
    }
  });

  const attended = attendedMatchDays.size;
  const total = allMatchDays.size;
  const percent = total > 0 ? Math.round((attended / total) * 100) : null;

  return {
    loading: false,
    percent,
    attended,
    total,
    gamesPlayed,
  };
}

function buildAttendanceFromAttendanceCollection({
  rows = [],
  identity,
  displayName,
  shortName,
}) {
  const identityKeys = getIdentityKeys(identity, displayName, shortName);

  const playerRows = rows.filter((row) => {
    const rowKeys = [
      row.playerId,
      row.playerName,
      row.shortName,
      row.displayName,
      firstNameOf(row.playerName || row.shortName || row.displayName || ""),
      slugFromLooseName(
        row.playerName || row.shortName || row.displayName || ""
      ),
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .map(normKey);

    return rowKeys.some((k) => identityKeys.includes(k));
  });

  const allMatchDays = new Set(
    rows.map((row) => String(row.matchDayId || "").trim()).filter(Boolean)
  );

  const attendedMatchDays = new Set(
    playerRows
      .filter((row) => {
        const value = String(
          row.attended ?? row.isPresent ?? row.present ?? "true"
        ).toLowerCase();
        return value !== "false" && value !== "0" && value !== "no";
      })
      .map((row) => String(row.matchDayId || "").trim())
      .filter(Boolean)
  );

  const attended = attendedMatchDays.size;
  const total = allMatchDays.size;
  const percent = total > 0 ? Math.round((attended / total) * 100) : null;

  const gamesPlayed = playerRows.reduce((sum, row) => {
    const directValue = Number(row.gamesPlayed ?? row.matchesPlayed);
    if (Number.isFinite(directValue) && directValue > 0) {
      return sum + directValue;
    }

    const playedFlag = String(
      row.played ?? row.didPlay ?? row.wasInGame ?? ""
    ).toLowerCase();

    if (
      playedFlag === "true" ||
      playedFlag === "1" ||
      playedFlag === "yes"
    ) {
      return sum + 1;
    }

    return sum;
  }, 0);

  return {
    loading: false,
    percent,
    attended,
    total,
    gamesPlayed,
  };
}

export default function MatchSignupPage({
  identity,
  currentUser,
  teams = [],
  activeSeasonId,
  onBack,
  onProceedToPayment,
}) {
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === "undefined") return 390;
    return window.innerWidth;
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [pendingSelectionsSaved, setPendingSelectionsSaved] = useState(false);
  const [reminderPreference, setReminderPreference] = useState("17:00");
  const [profileTarget, setProfileTarget] = useState(null);
  const [profileWhatsappNumber, setProfileWhatsappNumber] = useState(
    getPhoneFromIdentity(identity, currentUser)
  );
  const [showWhatsAppPrompt, setShowWhatsAppPrompt] = useState(false);
  const [whatsAppInput, setWhatsAppInput] = useState(
    getPhoneFromIdentity(identity, currentUser)
  );
  const [whatsAppInputError, setWhatsAppInputError] = useState("");
  const [whatsAppSubmitting, setWhatsAppSubmitting] = useState(false);
  const [whatsAppVerificationStatus, setWhatsAppVerificationStatus] =
    useState("");
  const [whatsAppVerificationMessage, setWhatsAppVerificationMessage] =
    useState("");
  const [skipWhatsAppPromptThisSession, setSkipWhatsAppPromptThisSession] =
    useState(false);
  const hasPromptedBackRef = useRef(false);
  const matrixScrollRef = useRef(null);
  const currentPlayerCellRef = useRef(null);

  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [playerPhotos, setPlayerPhotos] = useState({});
  const [attendanceBadge, setAttendanceBadge] = useState({
    loading: true,
    percent: null,
    attended: 0,
    total: 0,
    gamesPlayed: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setIsMobile(window.innerWidth <= 480);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!showCalendarPopup) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowCalendarPopup(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCalendarPopup]);

  const displayName =
    identity?.shortName ||
    identity?.fullName ||
    identity?.displayName ||
    currentUser?.displayName ||
    currentUser?.email ||
    "Player";

  const shortName =
    identity?.shortName || firstNameOf(displayName) || "Player";

  const userId =
    identity?.playerId ||
    identity?.memberId ||
    currentUser?.uid ||
    slugFromLooseName(displayName);

  const weeks = useMemo(() => getNextMonthWednesdays(), []);
  const calendarMonthData = useMemo(() => getCalendarMonthData(weeks), [weeks]);

  const calendarMonthKey = useMemo(
    () =>
      weeks[0]?.date?.toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "2-digit",
      }) || "",
    [weeks]
  );

  const phoneNumber = getPhoneFromIdentity(identity, currentUser);
  const effectiveWhatsappNumber = normalizeWhatsAppNumber(
    profileWhatsappNumber || phoneNumber
  );
  const resolvedSeasonId = activeSeasonId || FALLBACK_SEASON_ID;
  const signupType = DEFAULT_SIGNUP_TYPE;
  const signupScopeId = calendarMonthKey || resolvedSeasonId;
  const signupScopeLabel = calendarMonthData?.monthLabel || "Monthly signup";

  console.log("[PayLater DEBUG] render", {
    activeSeasonId,
    resolvedSeasonId,
    displayName,
    userId,
    effectiveWhatsappNumber,
    selectedWeeks,
    reminderPreference,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfileTarget() {
      const resolved = await resolveProfileDocTarget({
        identity,
        currentUser,
        displayName,
        userId,
      });

      if (cancelled) return;

      setProfileTarget(resolved);

      const savedNumber = normalizeWhatsAppNumber(
        resolved?.data?.whatsappNumber ||
          resolved?.data?.whatsAppNumber ||
          resolved?.data?.phoneNumber ||
          phoneNumber
      );

      setProfileWhatsappNumber(savedNumber);
      setWhatsAppInput(savedNumber || phoneNumber || "");
      setWhatsAppVerificationStatus(
        String(resolved?.data?.whatsappVerificationStatus || "")
      );
      setWhatsAppVerificationMessage(
        getWhatsappProfileMessage(
          resolved?.data?.whatsappVerificationStatus || "",
          DEFAULT_ADMIN_NAME
        )
      );

      if (!savedNumber && !skipWhatsAppPromptThisSession) {
        setShowWhatsAppPrompt(true);
      }
    }

    loadProfileTarget();

    return () => {
      cancelled = true;
    };
  }, [identity, currentUser, displayName, userId, phoneNumber, skipWhatsAppPromptThisSession]);

  async function pollWhatsAppVerification(target) {
    if (!target?.collection || !target?.id) return;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const snap = await getDoc(doc(db, target.collection, target.id));
      if (!snap.exists()) continue;

      const data = snap.data() || {};
      const status = String(data.whatsappVerificationStatus || "");

      if (VERIFIED_STATUSES.has(status)) {
        const savedNumber = normalizeWhatsAppNumber(
          data.whatsappNumber || data.whatsAppNumber || data.phoneNumber || ""
        );
        setProfileWhatsappNumber(savedNumber);
        setWhatsAppInput(savedNumber);
        setWhatsAppVerificationStatus(status);
        setWhatsAppVerificationMessage(
          getWhatsappProfileMessage(status, DEFAULT_ADMIN_NAME)
        );
        setShowWhatsAppPrompt(true);
        return;
      }
    }
  }

  async function handleSaveWhatsAppNumber() {
    const normalized = normalizeWhatsAppNumber(whatsAppInput);

    if (!normalized) {
      setWhatsAppInputError(
        "Please enter a valid WhatsApp number, for example +27768304880."
      );
      return;
    }

    if (!profileTarget?.collection || !profileTarget?.id) {
      setWhatsAppInputError("We could not find your profile yet. Please try again.");
      return;
    }

    setWhatsAppSubmitting(true);
    setWhatsAppInputError("");
    setWhatsAppVerificationStatus("pending");
    setWhatsAppVerificationMessage(
      "We are sending a short WhatsApp check to confirm this number."
    );

    try {
      await setDoc(
        doc(db, profileTarget.collection, profileTarget.id),
        {
          userId,
          playerName: displayName,
          shortName,
          whatsappNumber: normalized,
          phoneNumber: normalized,
          whatsappNumberUpdatedAt: serverTimestamp(),
          whatsappVerificationStatus: "pending",
          whatsappVerificationAdminName: DEFAULT_ADMIN_NAME,
          whatsappVerificationLastPromptAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfileWhatsappNumber(normalized);

      const response = await verifyWhatsAppNumberCallable({
        userId,
        playerName: displayName,
        whatsappNumber: normalized,
        profileCollection: profileTarget.collection,
        profileDocId: profileTarget.id,
        adminName: DEFAULT_ADMIN_NAME,
      });

      const payload = response?.data || {};
      if (!payload.ok) {
        throw new Error(payload.error || "Verification request failed.");
      }

      setWhatsAppVerificationStatus(String(payload.status || "pending"));
      setWhatsAppVerificationMessage(
        getWhatsappProfileMessage(payload.status || "pending", DEFAULT_ADMIN_NAME)
      );

      await pollWhatsAppVerification(profileTarget);
    } catch (error) {
      console.error("Failed to save or verify WhatsApp number:", error);
      setWhatsAppVerificationStatus("failed_once");
      setWhatsAppVerificationMessage(
        error?.message ||
          "We could not start number verification. Please try again."
      );
      setShowWhatsAppPrompt(true);
    } finally {
      setWhatsAppSubmitting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        if (cancelled) return;

        const loaded = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const photoData = data?.photoData || "";
          const rawName = data?.name || docSnap.id || "";
          if (!photoData) return;

          const title = toTitleCaseLoose(rawName);
          const first = firstNameOf(rawName);
          const slug = slugFromLooseName(rawName);

          [rawName, title, first, slug]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .forEach((key) => {
              loaded[key] = photoData;
            });
        });

        setPlayerPhotos(loaded);
      } catch (err) {
        console.error("Failed to load player photos in MatchSignupPage:", err);
      }
    }

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceBadge() {
      if (!resolvedSeasonId) {
        if (!cancelled) {
          setAttendanceBadge({
            loading: false,
            percent: null,
            attended: 0,
            total: 0,
            gamesPlayed: 0,
          });
        }
        return;
      }

      try {
        const mainRef = doc(db, "appState_v2", "main");
        const mainSnap = await getDoc(mainRef);

        if (cancelled) return;

        const matchDayHistory = mainSnap.exists()
          ? extractMatchDayHistoryFromMainDoc(
              mainSnap.data() || {},
              resolvedSeasonId
            )
          : [];

        if (Array.isArray(matchDayHistory) && matchDayHistory.length > 0) {
          const badgeFromHistory = buildAttendanceFromMatchDayHistory({
            matchDayHistory,
            identity,
            displayName,
            shortName,
          });

          if (!cancelled) {
            setAttendanceBadge(badgeFromHistory);
          }
          return;
        }

        const snap = await getDocs(
          collection(db, "seasons", resolvedSeasonId, "attendance")
        );

        if (cancelled) return;

        const rows = snap.docs.map((docSnap) => docSnap.data() || {});
        const badgeFromAttendance = buildAttendanceFromAttendanceCollection({
          rows,
          identity,
          displayName,
          shortName,
        });

        setAttendanceBadge(badgeFromAttendance);
      } catch (err) {
        console.error("Failed to load attendance badge:", err);
        if (!cancelled) {
          setAttendanceBadge({
            loading: false,
            percent: null,
            attended: 0,
            total: 0,
            gamesPlayed: 0,
          });
        }
      }
    }

    loadAttendanceBadge();

    return () => {
      cancelled = true;
    };
  }, [resolvedSeasonId, identity, displayName, shortName]);

  useEffect(() => {
    let cancelled = false;

    async function persistPendingSelection() {
      if (!calendarMonthData?.monthLabel) return;

      try {
        const pendingId = buildPendingSignupId({
          signupType,
          displayName,
          monthLabel: calendarMonthData.monthLabel,
        });

        const basePayload = {
          activeSeasonId: resolvedSeasonId,
          signupType,
          signupScopeId,
          signupScopeLabel,
          userId,
          playerId:
            identity?.playerId ||
            identity?.memberId ||
            currentUser?.uid ||
            slugFromLooseName(displayName),
          playerName: displayName,
          shortName,
          whatsappNumber: phoneNumber,
          effectiveWhatsappNumber,
          monthLabel: calendarMonthData.monthLabel,
          monthKey: calendarMonthKey,
          costPerGame: COST_PER_GAME,
          reminderPreference,
          reminderTimezone: "Africa/Johannesburg",
          lastReminderSentAt: null,
          nextReminderAt: null,
          updatedAt: serverTimestamp(),
        };

        const payload =
          selectedWeeks.length > 0
            ? {
                ...basePayload,
                selectedWeeks,
                totalAmount: selectedWeeks.length * COST_PER_GAME,
                paymentStatus: "pending",
                remindersPaused: !Boolean(effectiveWhatsappNumber),
                createdAt: serverTimestamp(),
              }
            : {
                ...basePayload,
                selectedWeeks: [],
                totalAmount: 0,
                paymentStatus: "not_selected",
                remindersPaused: true,
                createdAt: serverTimestamp(),
              };

        await setDoc(doc(db, "pendingSignups", pendingId), payload, {
          merge: true,
        });

        if (!cancelled) {
          setPendingSelectionsSaved(selectedWeeks.length > 0);
        }
      } catch (err) {
        console.error("Failed to persist pending signup selection:", err);
      }
    }

    persistPendingSelection();

    return () => {
      cancelled = true;
    };
  }, [
    resolvedSeasonId,
    signupType,
    signupScopeId,
    signupScopeLabel,
    calendarMonthData?.monthLabel,
    calendarMonthKey,
    currentUser?.uid,
    displayName,
    identity,
    effectiveWhatsappNumber,
    reminderPreference,
    selectedWeeks,
    whatsAppVerificationStatus,
    shortName,
    userId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const hasUnpaidSelections = selectedWeeks.length > 0;

    const handleBeforeUnload = (event) => {
      if (!hasUnpaidSelections) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedWeeks]);

  const getPlayerPhoto = useMemo(() => {
    return (playerName = "") => {
      const raw = String(playerName || "").trim();
      if (!raw) return null;

      const title = toTitleCaseLoose(raw);
      const first = firstNameOf(raw);
      const slug = slugFromLooseName(raw);

      const candidates = [raw, title, first, slug]
        .map((x) => String(x || "").trim())
        .filter(Boolean);

      for (const key of candidates) {
        if (playerPhotos[key]) return playerPhotos[key];

        const matchedKey = Object.keys(playerPhotos).find(
          (k) => normKey(k) === normKey(key)
        );
        if (matchedKey && playerPhotos[matchedKey]) {
          return playerPhotos[matchedKey];
        }
      }

      return null;
    };
  }, [playerPhotos]);

  const photoData = getPlayerPhoto(displayName) || getPlayerPhoto(shortName);

  const currentTeam = useMemo(
    () => findCurrentPlayersTeam(teams, identity, displayName, shortName),
    [teams, identity, displayName, shortName]
  );

  const allRows = useMemo(() => {
    const players = Array.isArray(currentTeam?.players)
      ? currentTeam.players
      : [];

    const mapped = players
      .map((entry, index) => {
        const fullName = getEntryName(entry);
        const short = getEntryShortName(entry);

        return {
          id:
            (typeof entry === "object" &&
              (entry?.playerId ||
                entry?.memberId ||
                entry?.id ||
                entry?.uid)) ||
            `${slugFromLooseName(fullName)}_${index}`,
          fullName,
          shortName: short,
          isCurrent:
            normKey(fullName) === normKey(displayName) ||
            normKey(fullName) === normKey(shortName) ||
            normKey(short) === normKey(shortName),
          isEmpty: false,
        };
      })
      .filter((p) => p.fullName);

    const alreadyHasCurrent = mapped.some((p) => p.isCurrent);

    if (!alreadyHasCurrent) {
      mapped.push({
        id:
          identity?.playerId ||
          identity?.memberId ||
          slugFromLooseName(displayName) ||
          "current_player",
        fullName: displayName,
        shortName,
        isCurrent: true,
        isEmpty: false,
      });
    }

    while (mapped.length < MAX_PLAYERS) {
      mapped.push({
        id: `empty_slot_${mapped.length + 1}`,
        fullName: "",
        shortName: `Slot ${mapped.length + 1}`,
        isCurrent: false,
        isEmpty: true,
      });
    }

    return mapped.slice(0, MAX_PLAYERS);
  }, [currentTeam, identity, displayName, shortName]);

  const weekSelectionsAll = useMemo(() => {
    const out = {};

    weeks.forEach((week, weekIndex) => {
      const signedIds = new Set();

      allRows.forEach((player, playerIndex) => {
        if (player.isEmpty) return;

        if (player.isCurrent) {
          if (selectedWeeks.includes(week.id)) {
            signedIds.add(player.id);
          }
          return;
        }

        let shouldBeSigned = false;

        if (weekIndex % 4 === 0) shouldBeSigned = playerIndex <= 5;
        else if (weekIndex % 4 === 1) shouldBeSigned = playerIndex <= 8;
        else if (weekIndex % 4 === 2) shouldBeSigned = playerIndex <= 11;
        else shouldBeSigned = playerIndex <= 6;

        if (shouldBeSigned) signedIds.add(player.id);
      });

      out[week.id] = signedIds;
    });

    return out;
  }, [weeks, allRows, selectedWeeks]);

  const visibleRowCount = useMemo(() => {
    let lastVisibleIndex = DEFAULT_VISIBLE_SLOTS - 1;

    for (let i = DEFAULT_VISIBLE_SLOTS; i < MAX_PLAYERS; i += 1) {
      const previousRow = allRows[i - 1];
      if (!previousRow || previousRow.isEmpty) break;

      const previousRowTakenSomewhere = weeks.some((week) =>
        weekSelectionsAll[week.id]?.has(previousRow.id)
      );

      if (previousRowTakenSomewhere) {
        lastVisibleIndex = i;
      } else {
        break;
      }
    }

    return Math.min(
      MAX_PLAYERS,
      Math.max(DEFAULT_VISIBLE_SLOTS + 1, lastVisibleIndex + 1)
    );
  }, [allRows, weeks, weekSelectionsAll]);

  const displayRows = useMemo(
    () => allRows.slice(0, visibleRowCount),
    [allRows, visibleRowCount]
  );

  const weekSelections = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const signedIds = weekSelectionsAll[week.id] || new Set();
      out[week.id] = new Set(
        displayRows
          .filter((player) => signedIds.has(player.id))
          .map((player) => player.id)
      );
    });

    return out;
  }, [weeks, weekSelectionsAll, displayRows]);

  const weekMeta = useMemo(
    () =>
      weeks.map((week) => {
        const fullCount = weekSelectionsAll[week.id]?.size || 0;
        return {
          ...week,
          count: fullCount,
          status: getStatus(fullCount),
        };
      }),
    [weeks, weekSelectionsAll]
  );

  useEffect(() => {
    const scrollEl = matrixScrollRef.current;
    const currentCellEl = currentPlayerCellRef.current;

    if (!scrollEl || !currentCellEl) return;

    const rowTop = currentCellEl.offsetTop;
    const targetTop = Math.max(0, rowTop - 70);

    scrollEl.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }, [displayRows, selectedWeeks]);

  const toggleWeek = (week) => {
    const meta = weekMeta.find((w) => w.id === week.id);
    if (meta?.status?.key === "full") return;

    setSelectedWeeks((prev) =>
      prev.includes(week.id)
        ? prev.filter((id) => id !== week.id)
        : [...prev, week.id]
    );
  };

  const totalAmount = selectedWeeks.length * COST_PER_GAME;
  const selectedCount = selectedWeeks.length;
  const signupStatusText =
    selectedCount > 0
      ? `${selectedCount} week${selectedCount > 1 ? "s" : ""} selected`
      : "tick a box";

  const attendanceBadgeText = attendanceBadge.loading
    ? "Attendance loading..."
    : attendanceBadge.percent == null
    ? "Attendance not available"
    : `${attendanceBadge.percent}% attendance`;

  const attendanceSubtext = attendanceBadge.loading
    ? ""
    : attendanceBadge.percent == null
    ? ""
    : `${attendanceBadge.attended}/${attendanceBadge.total} match days · ${attendanceBadge.gamesPlayed} game${
        attendanceBadge.gamesPlayed === 1 ? "" : "s"
      } played`;

  const firstColWidth = isMobile ? 108 : 220;

  const weekColWidth = useMemo(() => {
    if (!isMobile) return 135;

    const safeWeeks = Math.max(weeks.length, 1);
    const appSidePadding = 20;
    const cardInnerPadding = 18;
    const borderAllowance = 8;

    const availableForWeeks =
      viewportWidth -
      appSidePadding -
      cardInnerPadding -
      firstColWidth -
      borderAllowance;

    const fitted = Math.floor(availableForWeeks / safeWeeks);
    const minWidth = safeWeeks >= 5 ? 44 : 52;
    const maxWidth = 62;

    return Math.max(minWidth, Math.min(maxWidth, fitted));
  }, [isMobile, weeks.length, viewportWidth, firstColWidth]);

  const denseMobileWeeks = isMobile && weeks.length >= 5;

  const handleAttemptBack = () => {
    if (selectedWeeks.length === 0) {
      onBack?.();
      return;
    }
    if (!hasPromptedBackRef.current) {
      hasPromptedBackRef.current = true;
    }
    setShowLeavePrompt(true);
  };

  const handlePayNow = () => {
    setShowLeavePrompt(false);
    onProceedToPayment?.({
      selectedWeeks,
      totalAmount,
      costPerGame: COST_PER_GAME,
    });
  };

  const handlePayLater = async () => {
    console.log("[PayLater DEBUG] clicked");

    try {
      if (selectedWeeks.length === 0) {
        console.warn("[PayLater DEBUG] aborted: no selected weeks");
        setShowLeavePrompt(false);
        return;
      }

      if (!effectiveWhatsappNumber) {
        setShowLeavePrompt(false);
        setShowWhatsAppPrompt(true);
        return;
      }

      const pendingId = buildPendingSignupId({
        signupType,
        displayName,
        monthLabel: calendarMonthData.monthLabel,
      });

      const payload = {
        activeSeasonId: resolvedSeasonId,
        signupType,
        signupScopeId,
        signupScopeLabel,
        userId,
        playerId:
          identity?.playerId ||
          identity?.memberId ||
          currentUser?.uid ||
          slugFromLooseName(displayName),
        playerName: displayName,
        shortName,
        whatsappNumber: phoneNumber,
        effectiveWhatsappNumber,
        monthLabel: calendarMonthData.monthLabel,
        monthKey: calendarMonthKey,
        selectedWeeks,
        totalAmount: selectedWeeks.length * COST_PER_GAME,
        costPerGame: COST_PER_GAME,
        paymentStatus: "payment_deferred",
        remindersEnabled: Boolean(effectiveWhatsappNumber),
        remindersPaused: !Boolean(effectiveWhatsappNumber),
        whatsAppVerificationStatus,
        reminderPreference,
        reminderTimezone: "Africa/Johannesburg",
        lastReminderSentAt: null,
        nextReminderAt: null,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      console.log("[PayLater DEBUG] pendingId", pendingId);
      console.log("[PayLater DEBUG] payload", payload);

      await setDoc(doc(db, "pendingSignups", pendingId), payload, {
        merge: true,
      });

      console.log("[PayLater DEBUG] save success");

      setPendingSelectionsSaved(true);
      setShowLeavePrompt(false);
    } catch (error) {
      console.error("[PayLater DEBUG] save failed", error);
    }
  };

  const handleClearSelections = () => {
    setSelectedWeeks([]);
    setShowLeavePrompt(false);
  };

  const isCalendarSelectable = (cellId) =>
    weeks.some((week) => week.id === cellId);

  const getWeekByCalendarCellId = (cellId) =>
    weeks.find((week) => week.id === cellId) || null;

  return (
    <div className="page match-signup-page">
      <section className="card signup-hero-card">
        <div className="signup-hero-compact">
          <div className="signup-hero-left">
            <div className="signup-player-avatar signup-player-avatar-hero">
              {photoData ? (
                <img
                  src={photoData}
                  alt={displayName}
                  className="signup-player-avatar-img"
                />
              ) : (
                <span className="signup-player-avatar-fallback">
                  {String(shortName || "P").charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="signup-hero-copy">
              <div className="signup-hero-title-row">
                <h2>Pay for next month games</h2>
              </div>

              <p className="muted signup-hero-subtext">
                Select every Wednesday you are available for next month.
              </p>

              <div className="signup-top-meta">
                <div className="signup-attendance-badge">
                  <span className="signup-attendance-badge-label">
                    Attendance
                  </span>
                  <strong>{attendanceBadgeText}</strong>
                  {attendanceSubtext ? <small>{attendanceSubtext}</small> : null}
                </div>

                <button
                  type="button"
                  className="secondary-btn signup-calendar-btn"
                  onClick={() => setShowCalendarPopup(true)}
                  aria-label="Open next month calendar"
                  title="Open next month calendar"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 2V5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M16 2V5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M3.5 9H20.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <rect
                      x="3"
                      y="4.5"
                      width="18"
                      height="16.5"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="secondary-btn signup-back-btn"
            onClick={handleAttemptBack}
          >
            ← Back
          </button>
        </div>
      </section>

      {showCalendarPopup && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCalendarPopup(false)}
        >
          <div
            className="modal signup-calendar-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="signup-calendar-modal-header">
              <h3>{calendarMonthData.monthLabel}</h3>
              <button
                type="button"
                className="secondary-btn signup-calendar-close-btn"
                onClick={() => setShowCalendarPopup(false)}
              >
                ✕
              </button>
            </div>

            <p className="muted small signup-calendar-note">
              Wednesdays are highlighted. Tap a Wednesday to select or unselect
              it.
            </p>

            <div className="signup-calendar-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label} className="signup-calendar-weekday">
                  {label}
                </div>
              ))}
            </div>

            <div className="signup-calendar-grid">
              {calendarMonthData.cells.map((cell, index) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="signup-calendar-day is-empty"
                    />
                  );
                }

                const isWednesday = cell.weekday === 3;
                const isSelectableWednesday = isCalendarSelectable(cell.id);
                const isSelected = selectedWeeks.includes(cell.id);
                const linkedWeek = getWeekByCalendarCellId(cell.id);

                if (isWednesday && isSelectableWednesday && linkedWeek) {
                  const linkedMeta = weekMeta.find((w) => w.id === linkedWeek.id);
                  const isFull = linkedMeta?.status?.key === "full";

                  return (
                    <button
                      key={cell.id}
                      type="button"
                      className={[
                        "signup-calendar-day",
                        "is-button",
                        "is-wednesday",
                        isSelected ? "is-selected" : "",
                        isFull ? "is-disabled" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={cell.date.toLocaleDateString("en-ZA", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                      onClick={() => {
                        if (!isFull) toggleWeek(linkedWeek);
                      }}
                      disabled={isFull}
                    >
                      <span className="signup-calendar-day-number">
                        {cell.day}
                      </span>
                      <span className="signup-calendar-day-check">
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                  );
                }

                return (
                  <div
                    key={cell.id}
                    className={[
                      "signup-calendar-day",
                      isWednesday ? "is-wednesday" : "",
                      isSelected ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={cell.date.toLocaleDateString("en-ZA", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  >
                    {cell.day}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showWhatsAppPrompt && (
        <div className="modal-backdrop" onClick={() => setShowWhatsAppPrompt(false)}>
          <div
            className="modal signup-leave-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="signup-calendar-modal-header">
              <h3>Stay updated on your games</h3>
              <button
                type="button"
                className="secondary-btn signup-calendar-close-btn"
                onClick={() => setShowWhatsAppPrompt(false)}
              >
                ✕
              </button>
            </div>

            <p className="muted small signup-calendar-note">
              Add your WhatsApp number so TurfKings can send football-related
              reminders like weather reschedules, payment confirmations, and
              match updates.
            </p>

            <div className="signup-reminder-choice">
              <label htmlFor="whatsAppInput">WhatsApp number</label>
              <input
                id="whatsAppInput"
                type="tel"
                placeholder="e.g. +27768304880"
                value={whatsAppInput}
                onChange={(e) => setWhatsAppInput(e.target.value)}
              />
              {whatsAppInputError ? (
                <p className="muted small" style={{ color: "#ff9b9b" }}>
                  {whatsAppInputError}
                </p>
              ) : null}
              <p className="muted small">{whatsAppVerificationMessage}</p>
            </div>

            <div className="signup-leave-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveWhatsAppNumber}
                disabled={whatsAppSubmitting}
              >
                {whatsAppSubmitting ? "Checking number..." : "Save my number"}
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setSkipWhatsAppPromptThisSession(true);
                  setShowWhatsAppPrompt(false);
                }}
              >
                Skip for now
              </button>
            </div>

            {whatsAppVerificationStatus === "failed_once" ? (
              <p className="muted small signup-leave-footnote">
                Please check the number and try again once more.
              </p>
            ) : null}

            {(whatsAppVerificationStatus === "failed_twice" ||
              whatsAppVerificationStatus === "manual_admin_required") ? (
              <p className="muted small signup-leave-footnote">
                Please contact admin {DEFAULT_ADMIN_NAME} for cellphone
                verification.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {showLeavePrompt && (
        <div className="modal-backdrop" onClick={() => setShowLeavePrompt(false)}>
          <div
            className="modal signup-leave-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="signup-calendar-modal-header">
              <h3>Complete payment?</h3>
              <button
                type="button"
                className="secondary-btn signup-calendar-close-btn"
                onClick={() => setShowLeavePrompt(false)}
              >
                ✕
              </button>
            </div>

            <p className="muted small signup-calendar-note">
              You selected {selectedWeeks.length} week
              {selectedWeeks.length === 1 ? "" : "s"}. Please continue to
              payment to secure your place.
            </p>

            <div className="signup-reminder-choice">
              <label htmlFor="reminderPreference">WhatsApp reminder time</label>
              <select
                id="reminderPreference"
                value={reminderPreference}
                onChange={(e) => setReminderPreference(e.target.value)}
              >
                <option value="12:00">12:00 midday</option>
                <option value="17:00">17:00 afternoon</option>
              </select>
              <p className="muted small">
                If you choose “I’ll pay later”, you’ll get a WhatsApp reminder at
                this time each day until you pay or uncheck your weeks.
              </p>
            </div>

            <div className="signup-leave-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={handlePayNow}
              >
                💳 Go to payment
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handlePayLater}
              >
                I’ll pay later
              </button>

              <button
                type="button"
                className="secondary-btn danger-btn"
                onClick={handleClearSelections}
              >
                Clear my selected weeks
              </button>
            </div>

            {!effectiveWhatsappNumber ? (
              <p className="muted small signup-leave-footnote">
                No WhatsApp number was found on your profile yet, so reminders
                will stay off until your number is available.
              </p>
            ) : null}

            {pendingSelectionsSaved ? (
              <p className="muted small signup-leave-footnote">
                Your selected weeks have been saved as pending.
              </p>
            ) : null}
          </div>
        </div>
      )}

      <section className="card signup-grid-card">
        <div className="signup-grid-title-row">
          <h3>Choose your Wednesdays</h3>
          <div
            className={`signup-top-status ${
              selectedCount > 0 ? "is-active" : "is-idle"
            }`}
          >
            {signupStatusText}
          </div>
        </div>

        <div
          ref={matrixScrollRef}
          className="signup-matrix-wrap"
          style={{
            maxHeight: isMobile ? "470px" : "560px",
            overflowY: "auto",
            overflowX: "auto",
          }}
        >
          <div
            className={`signup-matrix ${isMobile ? "is-mobile-matrix" : ""} ${
              denseMobileWeeks ? "is-dense-weeks" : ""
            }`}
            style={{
              gridTemplateColumns: `${firstColWidth}px repeat(${weekMeta.length}, ${weekColWidth}px)`,
            }}
          >
            <div className="matrix-corner-cell">Players</div>

            {weekMeta.map((week) => (
              <div
                key={`head-${week.id}`}
                className={`matrix-week-head status-${week.status.key}`}
                title={week.fullLabel}
              >
                <div className="matrix-week-date">
                  {isMobile ? week.shortLabel : week.label}
                </div>
                <div className={`matrix-week-status ${week.status.key}`}>
                  {isMobile ? week.status.shortLabel : week.status.label}
                </div>
                <div className="matrix-week-count">{week.count} signed</div>
              </div>
            ))}

            {displayRows.map((player, rowIndex) => {
              const playerPhoto =
                !player.isEmpty &&
                (getPlayerPhoto(player.fullName) ||
                  getPlayerPhoto(player.shortName));

              const playerHasAnySignedWeek =
                !player.isEmpty &&
                weeks.some((week) => weekSelections[week.id]?.has(player.id));

              const isSignedRow = playerHasAnySignedWeek && !player.isCurrent;
              const isEmptyRow = player.isEmpty;

              return (
                <React.Fragment key={player.id}>
                  <div
                    ref={player.isCurrent ? currentPlayerCellRef : null}
                    className={`matrix-player-cell ${
                      player.isCurrent ? "is-current-player" : ""
                    } ${isSignedRow ? "is-signed-row" : ""} ${
                      isEmptyRow ? "is-empty-row is-empty-player" : ""
                    }`}
                  >
                    {player.isEmpty ? (
                      <div className="matrix-player-empty">
                        {isMobile
                          ? `Slot ${rowIndex + 1}`
                          : `Empty slot ${rowIndex + 1}`}
                      </div>
                    ) : (
                      <div className="matrix-player-info">
                        <div className="matrix-player-avatar">
                          {playerPhoto ? (
                            <img src={playerPhoto} alt={player.fullName} />
                          ) : (
                            <span>
                              {String(player.shortName || "P")
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="matrix-player-text">
                          <div className="matrix-player-name">
                            {player.shortName}
                          </div>
                          {player.isCurrent && (
                            <div className="matrix-player-tag">You</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {weekMeta.map((week) => {
                    const signed = weekSelections[week.id]?.has(player.id);
                    const status = week.status;

                    if (player.isEmpty) {
                      return (
                        <div
                          key={`${player.id}-${week.id}`}
                          className={`matrix-view-cell matrix-empty-slot is-empty-row ${
                            signed ? "is-signed" : ""
                          }`}
                        >
                          <div className="matrix-view-inner">
                            <span className="matrix-pick-mark">
                              {signed
                                ? "✓"
                                : rowIndex === DEFAULT_VISIBLE_SLOTS
                                ? "+"
                                : ""}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (player.isCurrent) {
                      return (
                        <button
                          key={`${player.id}-${week.id}`}
                          type="button"
                          className={[
                            "matrix-pick-cell",
                            "current-player-cell",
                            "is-current-row",
                            `status-${status.key}`,
                            signed ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => toggleWeek(week)}
                          disabled={status.key === "full"}
                        >
                          <div className="matrix-pick-inner">
                            <span className="matrix-pick-mark">
                              {signed ? "✓" : ""}
                            </span>
                          </div>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={`${player.id}-${week.id}`}
                        className={`matrix-view-cell ${
                          signed ? "is-signed" : ""
                        } ${isSignedRow ? "is-signed-row" : ""}`}
                      >
                        <div className="matrix-view-inner">
                          <span className="matrix-pick-mark">
                            {signed ? "✓" : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card signup-summary-card">
        <div className="signup-summary-header">
          <div className="signup-summary-player">
            <div className="signup-summary-avatar">
              {photoData ? (
                <img src={photoData} alt={displayName} />
              ) : (
                <span>{String(shortName || "P").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <h3>Selection summary</h3>
              <p className="muted small">{shortName}</p>
            </div>
          </div>
        </div>

        <div className="signup-summary-rows">
          <div className="summary-row">
            <span>Selected match days</span>
            <strong>{selectedWeeks.length}</strong>
          </div>

          <div className="summary-row">
            <span>Cost per game</span>
            <strong>R{COST_PER_GAME}</strong>
          </div>

          <div className="summary-row total">
            <span>Total due</span>
            <strong>R{totalAmount}</strong>
          </div>
        </div>

        <button
          type="button"
          className="primary-btn signup-pay-btn"
          disabled={selectedWeeks.length === 0}
          onClick={() =>
            onProceedToPayment?.({
              selectedWeeks,
              totalAmount,
              costPerGame: COST_PER_GAME,
            })
          }
        >
          💳 Continue to payment
        </button>
      </section>
    </div>
  );
}