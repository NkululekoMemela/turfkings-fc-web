// src/pages/MatchSignupPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const MIN_PLAYERS = 10;
const MAX_PLAYERS = 18;
const DEFAULT_VISIBLE_SLOTS = 6;
const MAX_VISIBLE_ROWS_BEFORE_SCROLL = 5;
const COST_PER_GAME = 65;
const FALLBACK_SEASON_ID = "local_manual_season";
const DEFAULT_SIGNUP_TYPE = "general";
const DEFAULT_ADMIN_NAME = "Nkululeko";

const MOBILE_ROW_HEIGHT = 52;
const DESKTOP_ROW_HEIGHT = 60;
const MOBILE_HEADER_HEIGHT = 72;
const DESKTOP_HEADER_HEIGHT = 78;

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

function getWhatsappProfileMessage(status) {
  switch (String(status || "")) {
    case "verified":
    case "manual_admin_verified":
      return "Your WhatsApp number has been saved for football reminders.";
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
  resolvedSeasonId,
  userId,
  monthKey,
}) {
  return [
    slugFromLooseName(signupType || DEFAULT_SIGNUP_TYPE),
    slugFromLooseName(resolvedSeasonId || FALLBACK_SEASON_ID),
    slugFromLooseName(userId || "player"),
    slugFromLooseName(monthKey || "month"),
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

function getPlayerLookupKeys(player) {
  return [
    player?.id,
    player?.uid,
    player?.playerId,
    player?.memberId,
    player?.fullName,
    player?.shortName,
    firstNameOf(player?.fullName || player?.shortName || ""),
    slugFromLooseName(player?.fullName || player?.shortName || ""),
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

  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [playerPhotos, setPlayerPhotos] = useState({});
  const [attendanceBadge, setAttendanceBadge] = useState({
    loading: true,
    percent: null,
    attended: 0,
    total: 0,
    gamesPlayed: 0,
  });
  const [liveWeekKeys, setLiveWeekKeys] = useState({});
  const [livePlayerWeeks, setLivePlayerWeeks] = useState({});
  const [liveSelectionsLoaded, setLiveSelectionsLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [selectionHydrated, setSelectionHydrated] = useState(false);

  const matrixScrollRef = useRef(null);
  const currentPlayerCellRef = useRef(null);
  const hasInitialScrollRef = useRef(false);

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
    profileWhatsappNumber || phoneNumber || whatsAppInput
  );
  const resolvedSeasonId = activeSeasonId || FALLBACK_SEASON_ID;
  const signupType = DEFAULT_SIGNUP_TYPE;
  const signupScopeId = calendarMonthKey || resolvedSeasonId;
  const signupScopeLabel = calendarMonthData?.monthLabel || "Monthly signup";

  const pendingId = useMemo(
    () =>
      buildPendingSignupId({
        signupType,
        resolvedSeasonId,
        userId,
        monthKey: calendarMonthKey,
      }),
    [signupType, resolvedSeasonId, userId, calendarMonthKey]
  );

  const currentUserDocKey = useMemo(
    () => `uid:${normKey(userId)}`,
    [userId]
  );

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
    userId,
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
          userId,
          playerName: displayName,
          shortName,
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

    async function hydrateOwnSelection() {
      try {
        const snap = await getDoc(doc(db, "pendingSignups", pendingId));
        if (cancelled) return;

        const data = snap.exists() ? snap.data() || {} : {};
        const savedWeeks = Array.isArray(data.selectedWeeks)
          ? data.selectedWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        setSelectedWeeks(savedWeeks);
        if (data.reminderPreference) {
          setReminderPreference(String(data.reminderPreference));
        }
        setPendingSelectionsSaved(savedWeeks.length > 0);
      } catch (error) {
        console.error("Failed to hydrate own signup:", error);
      } finally {
        if (!cancelled) {
          setSelectionHydrated(true);
        }
      }
    }

    hydrateOwnSelection();

    return () => {
      cancelled = true;
    };
  }, [pendingId, weeks]);

  useEffect(() => {
    const q = query(collection(db, "pendingSignups"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextWeekKeys = {};
        const nextPlayerWeeks = {};

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};

          const sameScope =
            String(data.signupScopeId || "") === String(signupScopeId || "") &&
            String(data.activeSeasonId || resolvedSeasonId) ===
              String(resolvedSeasonId || "");

          if (!sameScope) return;

          const weeksForDoc = Array.isArray(data.selectedWeeks)
            ? data.selectedWeeks.filter((weekId) =>
                weeks.some((week) => week.id === weekId)
              )
            : [];

          const docIdentityKeys = [
            data.userId,
            data.playerId,
            data.playerName,
            data.shortName,
            firstNameOf(data.playerName || data.shortName || ""),
            slugFromLooseName(data.playerName || data.shortName || ""),
          ]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .map(normKey);

          const docStableKey =
            data.userId || data.playerId
              ? `uid:${normKey(data.userId || data.playerId)}`
              : `name:${normKey(data.playerName || data.shortName || docSnap.id)}`;

          weeksForDoc.forEach((weekId) => {
            if (!nextWeekKeys[weekId]) nextWeekKeys[weekId] = [];
            if (!nextWeekKeys[weekId].includes(docStableKey)) {
              nextWeekKeys[weekId].push(docStableKey);
            }
          });

          docIdentityKeys.forEach((key) => {
            if (!nextPlayerWeeks[key]) nextPlayerWeeks[key] = [];
            weeksForDoc.forEach((weekId) => {
              if (!nextPlayerWeeks[key].includes(weekId)) {
                nextPlayerWeeks[key].push(weekId);
              }
            });
          });
        });

        setLiveWeekKeys(nextWeekKeys);
        setLivePlayerWeeks(nextPlayerWeeks);
        setLiveSelectionsLoaded(true);
      },
      (error) => {
        console.error("Failed to subscribe to pending signups:", error);
        setLiveSelectionsLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [signupScopeId, resolvedSeasonId, weeks]);

  useEffect(() => {
    if (!selectionHydrated) return;

    const persistPendingSelection = async () => {
      try {
        setSaveState("saving");

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
          whatsappNumber: profileWhatsappNumber || phoneNumber || "",
          effectiveWhatsappNumber: effectiveWhatsappNumber || "",
          whatsappVerificationStatus:
            whatsAppVerificationStatus || "manual_admin_verified",
          monthLabel: calendarMonthData?.monthLabel || "",
          monthKey: calendarMonthKey,
          costPerGame: COST_PER_GAME,
          reminderPreference,
          reminderTimezone: "Africa/Johannesburg",
          lastReminderSentAt: null,
          nextReminderAt: null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        };

        const finalPayload =
          selectedWeeks.length > 0
            ? {
                ...payload,
                selectedWeeks,
                totalAmount: selectedWeeks.length * COST_PER_GAME,
                paymentStatus: "pending",
                remindersEnabled: Boolean(effectiveWhatsappNumber),
                remindersPaused: !Boolean(effectiveWhatsappNumber),
              }
            : {
                ...payload,
                selectedWeeks: [],
                totalAmount: 0,
                paymentStatus: "not_selected",
                remindersEnabled: false,
                remindersPaused: true,
              };

        await setDoc(doc(db, "pendingSignups", pendingId), finalPayload, {
          merge: true,
        });

        setPendingSelectionsSaved(selectedWeeks.length > 0);
        setSaveState("saved");
      } catch (err) {
        console.error("Failed to persist pending signup selection:", err);
        setSaveState("error");
      }
    };

    persistPendingSelection();
  }, [
    selectionHydrated,
    selectedWeeks,
    resolvedSeasonId,
    signupType,
    signupScopeId,
    signupScopeLabel,
    currentUser?.uid,
    displayName,
    identity,
    profileWhatsappNumber,
    phoneNumber,
    effectiveWhatsappNumber,
    reminderPreference,
    whatsAppVerificationStatus,
    shortName,
    userId,
    pendingId,
    calendarMonthData?.monthLabel,
    calendarMonthKey,
  ]);

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

    const committedPlayers = players
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
          uid:
            (typeof entry === "object" &&
              (entry?.playerId ||
                entry?.memberId ||
                entry?.id ||
                entry?.uid)) ||
            "",
          playerId:
            typeof entry === "object"
              ? entry?.playerId || entry?.memberId || entry?.id || entry?.uid || ""
              : "",
          memberId:
            typeof entry === "object"
              ? entry?.memberId || entry?.playerId || entry?.id || entry?.uid || ""
              : "",
          fullName,
          shortName: short,
          isCurrent:
            normKey(fullName) === normKey(displayName) ||
            normKey(fullName) === normKey(shortName) ||
            normKey(short) === normKey(shortName),
          isEmpty: false,
        };
      })
      .filter((p) => p.fullName)
      .filter((player) => {
        if (player.isCurrent) return true;

        const lookupKeys = getPlayerLookupKeys(player);
        return lookupKeys.some((key) => (livePlayerWeeks[key] || []).length > 0);
      });

    const alreadyHasCurrent = committedPlayers.some((p) => p.isCurrent);

    if (!alreadyHasCurrent) {
      committedPlayers.push({
        id:
          identity?.playerId ||
          identity?.memberId ||
          slugFromLooseName(displayName) ||
          "current_player",
        uid:
          identity?.playerId ||
          identity?.memberId ||
          currentUser?.uid ||
          "",
        playerId:
          identity?.playerId ||
          identity?.memberId ||
          currentUser?.uid ||
          "",
        memberId:
          identity?.memberId ||
          identity?.playerId ||
          currentUser?.uid ||
          "",
        fullName: displayName,
        shortName,
        isCurrent: true,
        isEmpty: false,
      });
    }

    while (committedPlayers.length < MAX_PLAYERS) {
      committedPlayers.push({
        id: `empty_slot_${committedPlayers.length + 1}`,
        fullName: "",
        shortName: `Slot ${committedPlayers.length + 1}`,
        isCurrent: false,
        isEmpty: true,
      });
    }

    return committedPlayers.slice(0, MAX_PLAYERS);
  }, [
    currentTeam,
    identity,
    currentUser?.uid,
    displayName,
    shortName,
    livePlayerWeeks,
  ]);

  const weekSelectionsAll = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const signedKeys = new Set(liveWeekKeys[week.id] || []);

      if (selectedWeeks.includes(week.id)) {
        signedKeys.add(currentUserDocKey);
      } else {
        signedKeys.delete(currentUserDocKey);
      }

      out[week.id] = signedKeys;
    });

    return out;
  }, [weeks, liveWeekKeys, selectedWeeks, currentUserDocKey]);

  const actualPlayersCount = useMemo(
    () => allRows.filter((row) => !row.isEmpty).length,
    [allRows]
  );

  const visibleRowCount = useMemo(() => {
    return Math.min(
      MAX_PLAYERS,
      Math.max(DEFAULT_VISIBLE_SLOTS, actualPlayersCount)
    );
  }, [actualPlayersCount]);

  const displayRows = useMemo(
    () => allRows.slice(0, visibleRowCount),
    [allRows, visibleRowCount]
  );

  const weekSelections = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const signedIds = new Set();

      displayRows.forEach((player) => {
        if (player.isEmpty) return;

        if (player.isCurrent) {
          if (selectedWeeks.includes(week.id)) {
            signedIds.add(player.id);
          }
          return;
        }

        const lookupKeys = getPlayerLookupKeys(player);
        const isSelectedForThatPlayer = lookupKeys.some((key) =>
          (livePlayerWeeks[key] || []).includes(week.id)
        );

        if (isSelectedForThatPlayer) {
          signedIds.add(player.id);
        }
      });

      out[week.id] = signedIds;
    });

    return out;
  }, [weeks, displayRows, livePlayerWeeks, selectedWeeks]);

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
    if (hasInitialScrollRef.current) return;

    const scrollEl = matrixScrollRef.current;
    const currentCellEl = currentPlayerCellRef.current;

    if (!scrollEl || !currentCellEl) return;

    const rowTop = currentCellEl.offsetTop;
    const targetTop = Math.max(0, rowTop - 70);

    scrollEl.scrollTop = targetTop;
    hasInitialScrollRef.current = true;
  }, [displayRows]);

  const toggleWeek = (week) => {
    const meta = weekMeta.find((w) => w.id === week.id);
    const isSelected = selectedWeeks.includes(week.id);

    if (isSelected) {
      setSelectedWeeks((prev) => prev.filter((id) => id !== week.id));
      return;
    }

    if ((meta?.count || 0) >= MAX_PLAYERS) return;

    setSelectedWeeks((prev) => [...prev, week.id]);
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

  const rowHeight = isMobile ? MOBILE_ROW_HEIGHT : DESKTOP_ROW_HEIGHT;
  const headerHeight = isMobile ? MOBILE_HEADER_HEIGHT : DESKTOP_HEADER_HEIGHT;
  const visibleRowsInViewport = Math.min(
    MAX_VISIBLE_ROWS_BEFORE_SCROLL,
    displayRows.length
  );
  const matrixViewportHeight =
    headerHeight + visibleRowsInViewport * rowHeight + 10;

  const handleAttemptBack = () => {
    if (selectedWeeks.length === 0) {
      onBack?.();
      return;
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
    try {
      if (selectedWeeks.length === 0) {
        setShowLeavePrompt(false);
        onBack?.();
        return;
      }

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
        whatsappNumber: profileWhatsappNumber || phoneNumber || "",
        effectiveWhatsappNumber: effectiveWhatsappNumber || "",
        whatsappVerificationStatus:
          whatsAppVerificationStatus || "manual_admin_verified",
        monthLabel: calendarMonthData?.monthLabel || "",
        monthKey: calendarMonthKey,
        selectedWeeks,
        totalAmount: selectedWeeks.length * COST_PER_GAME,
        costPerGame: COST_PER_GAME,
        paymentStatus: "payment_deferred",
        remindersEnabled: Boolean(effectiveWhatsappNumber),
        remindersPaused: !Boolean(effectiveWhatsappNumber),
        reminderPreference,
        reminderTimezone: "Africa/Johannesburg",
        lastReminderSentAt: null,
        nextReminderAt: null,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "pendingSignups", pendingId), payload, {
        merge: true,
      });

      if (!effectiveWhatsappNumber) {
        setShowWhatsAppPrompt(true);
      }

      setPendingSelectionsSaved(true);
      setShowLeavePrompt(false);
      onBack?.();
    } catch (error) {
      console.error("Pay later save failed", error);
      setShowLeavePrompt(false);
      onBack?.();
    }
  };

  const handleClearSelections = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to clear all selected weeks?"
    );
    if (!confirmed) return;

    try {
      setSelectedWeeks([]);
      await setDoc(
        doc(db, "pendingSignups", pendingId),
        {
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
          selectedWeeks: [],
          totalAmount: 0,
          costPerGame: COST_PER_GAME,
          paymentStatus: "not_selected",
          remindersEnabled: false,
          remindersPaused: true,
          whatsappNumber: profileWhatsappNumber || phoneNumber || "",
          effectiveWhatsappNumber: effectiveWhatsappNumber || "",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Failed to clear selections:", error);
    } finally {
      setShowLeavePrompt(false);
      onBack?.();
    }
  };

  const isCalendarSelectable = (cellId) =>
    weeks.some((week) => week.id === cellId);

  const getWeekByCalendarCellId = (cellId) =>
    weeks.find((week) => week.id === cellId) || null;

  const saveStateText =
    saveState === "saving"
      ? "Saving..."
      : saveState === "saved"
      ? "Saved"
      : saveState === "error"
      ? "Save failed"
      : "";

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
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (label) => (
                  <div key={label} className="signup-calendar-weekday">
                    {label}
                  </div>
                )
              )}
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
                        isSelected ? "is-selected is-signed" : "",
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
                        if (!isFull || isSelected) toggleWeek(linkedWeek);
                      }}
                      disabled={isFull && !isSelected}
                      style={{ transition: "none" }}
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
                      isSelected ? "is-selected is-signed" : "",
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
        <div
          className="modal-backdrop"
          onClick={() => setShowWhatsAppPrompt(false)}
        >
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
                {whatsAppSubmitting ? "Saving..." : "Save my number"}
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
                Your selected weeks have been saved.
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
            {saveStateText ? (
              <span style={{ marginLeft: 8, opacity: 0.8 }}>
                {saveStateText}
              </span>
            ) : null}
          </div>
        </div>

        <div
          ref={matrixScrollRef}
          className="signup-matrix-wrap"
          style={{
            height: `${matrixViewportHeight}px`,
            maxHeight: `${matrixViewportHeight}px`,
            overflowY:
              displayRows.length > MAX_VISIBLE_ROWS_BEFORE_SCROLL ? "auto" : "hidden",
            overflowX: "auto",
            overflowAnchor: "none",
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
          }}
        >
          <div
            className={`signup-matrix ${isMobile ? "is-mobile-matrix" : ""} ${
              denseMobileWeeks ? "is-dense-weeks" : ""
            }`}
            style={{
              gridTemplateColumns: `${firstColWidth}px repeat(${weekMeta.length}, ${weekColWidth}px)`,
              borderCollapse: "collapse",
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
                          className="matrix-view-cell matrix-empty-slot is-empty-row"
                          style={{ transition: "none" }}
                        >
                          <div className="matrix-view-inner">
                            <span className="matrix-pick-mark" />
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
                            signed ? "is-selected is-signed" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => toggleWeek(week)}
                          disabled={status.key === "full" && !signed}
                          style={{ transition: "none" }}
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
                        style={{ transition: "none" }}
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
            <div style={{ textAlign: "right" }}>
              <strong>R{totalAmount}</strong>
              <div className="muted small">
                ({selectedWeeks.length} × R{COST_PER_GAME})
              </div>
            </div>
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