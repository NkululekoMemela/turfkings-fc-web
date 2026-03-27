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
const COMBINED_PAYMENT_LINKS = {
  6: "https://pay.yoco.com/r/2pJdrw",
  7: "https://pay.yoco.com/r/7lbkrB",
  8: "https://pay.yoco.com/r/2V5xBk",
  9: "https://pay.yoco.com/r/78PaD9",
  10: "https://pay.yoco.com/r/mRgEen",
};
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

function uniqueStrings(values = []) {
  return Array.from(
    new Set(values.map((x) => String(x || "").trim()).filter(Boolean))
  );
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

function getWhatsappProfileMessage(status) {
  switch (String(status || "")) {
    case "verified":
    case "manual_admin_verified":
      return "Your WhatsApp number has been saved for football reminders.";
    default:
      return "Add your WhatsApp number for football reminders like reschedules, payment confirmations, and match updates.";
  }
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

  for (let i = 0; i < startWeekday; i += 1) cells.push(null);

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

function getIdentityKeys(identity, displayName, shortName) {
  return uniqueStrings([
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
  ]).map(normKey);
}

function getPlayerLookupKeys(player) {
  return uniqueStrings([
    player?.id,
    player?.uid,
    player?.playerId,
    player?.memberId,
    player?.fullName,
    player?.shortName,
    firstNameOf(player?.fullName || player?.shortName || ""),
    slugFromLooseName(player?.fullName || player?.shortName || ""),
  ]).map(normKey);
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

      return uniqueStrings(candidates)
        .map(normKey)
        .some((k) => identityKeys.includes(k));
    });

    if (found) return team;
  }

  return null;
}

function extractAllSeasonsMatchDayHistory(mainData) {
  const state = mainData?.state || {};
  const seasons = Array.isArray(state?.seasons) ? state.seasons : [];
  const all = [];

  seasons.forEach((season) => {
    const history = Array.isArray(season?.matchDayHistory)
      ? season.matchDayHistory
      : [];
    history.forEach((day) => {
      all.push({
        ...day,
        seasonId: season?.seasonId || "",
      });
    });
  });

  return all;
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
    const seasonId = String(day?.seasonId || "").trim();
    const localDayId = String(day?.id || day?.matchDayId || "").trim();
    if (!localDayId) return;

    const compositeDayId = seasonId ? `${seasonId}__${localDayId}` : localDayId;
    allMatchDays.add(compositeDayId);

    const playerAppearances = Array.isArray(day?.playerAppearances)
      ? day.playerAppearances
      : [];

    const matchingEntry = playerAppearances.find((entry) => {
      const rowKeys = uniqueStrings([
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
      ]).map(normKey);

      return rowKeys.some((k) => identityKeys.includes(k));
    });

    if (!matchingEntry) return;

    attendedMatchDays.add(compositeDayId);

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
    const rowKeys = uniqueStrings([
      row.playerId,
      row.playerName,
      row.shortName,
      row.displayName,
      firstNameOf(row.playerName || row.shortName || row.displayName || ""),
      slugFromLooseName(
        row.playerName || row.shortName || row.displayName || ""
      ),
    ]).map(normKey);

    return rowKeys.some((k) => identityKeys.includes(k));
  });

  const allMatchDays = new Set(
    rows
      .map((row) =>
        `${String(row.seasonId || "").trim()}__${String(
          row.matchDayId || ""
        ).trim()}`
      )
      .filter((x) => x !== "__")
  );

  const attendedMatchDays = new Set(
    playerRows
      .filter((row) => {
        const value = String(
          row.attended ?? row.isPresent ?? row.present ?? "true"
        ).toLowerCase();
        return value !== "false" && value !== "0" && value !== "no";
      })
      .map(
        (row) =>
          `${String(row.seasonId || "").trim()}__${String(
            row.matchDayId || ""
          ).trim()}`
      )
      .filter((x) => x !== "__")
  );

  const attended = attendedMatchDays.size;
  const total = allMatchDays.size;
  const percent = total > 0 ? Math.round((attended / total) * 100) : null;

  const gamesPlayed = playerRows.reduce((sum, row) => {
    const directValue = Number(row.gamesPlayed ?? row.matchesPlayed);
    if (Number.isFinite(directValue) && directValue > 0) return sum + directValue;

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

function buildBeneficiaryStableKey(mode, targetId, targetName) {
  if (mode === "self" || mode === "existing_player") {
    return `uid:${normKey(targetId || targetName)}`;
  }
  return `guest:${normKey(targetName)}`;
}

function buildBeneficiaryPlayerId(mode, targetId, targetName) {
  if (mode === "self" || mode === "existing_player") {
    return String(targetId || slugFromLooseName(targetName)).trim();
  }
  return `guest__${slugFromLooseName(targetName)}`;
}

function buildPendingSignupId({
  signupType = DEFAULT_SIGNUP_TYPE,
  beneficiaryPlayerId,
  monthKey,
}) {
  return [
    slugFromLooseName(signupType || DEFAULT_SIGNUP_TYPE),
    slugFromLooseName(beneficiaryPlayerId || "player"),
    slugFromLooseName(monthKey || "month"),
  ].join("__");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function looksLikeEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  const [signupForMode, setSignupForMode] = useState("self");
  const [existingPlayerTargetId, setExistingPlayerTargetId] = useState("");
  const [guestPlayerName, setGuestPlayerName] = useState("");
  const [guestPlayerEmail, setGuestPlayerEmail] = useState("");

  const [secondExistingPlayerTargetId, setSecondExistingPlayerTargetId] = useState("");
  const [secondGuestPlayerName, setSecondGuestPlayerName] = useState("");
  const [secondGuestPlayerEmail, setSecondGuestPlayerEmail] = useState("");
  const [secondSelectedWeeks, setSecondSelectedWeeks] = useState([]);
  const [secondPaidWeeks, setSecondPaidWeeks] = useState([]);
  const [secondSelectionHydrated, setSecondSelectionHydrated] = useState(false);
  const [secondMatchSignupStateLoaded, setSecondMatchSignupStateLoaded] = useState(false);

  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [paidWeeks, setPaidWeeks] = useState([]);
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
  const [liveCommittedUsers, setLiveCommittedUsers] = useState([]);
  const [saveState, setSaveState] = useState("idle");
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [matchSignupStateLoaded, setMatchSignupStateLoaded] = useState(false);

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
      if (event.key === "Escape") setShowCalendarPopup(false);
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

  const payerUserId =
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
  const isCombinedMode =
    signupForMode === "self_and_existing_player" ||
    signupForMode === "self_and_guest";
  const secondSignupMode =
    signupForMode === "self_and_existing_player"
      ? "existing_player"
      : signupForMode === "self_and_guest"
      ? "guest"
      : "";

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

  const existingPlayerOptions = useMemo(() => {
    const byKey = new Map();

    const addOption = (candidate) => {
      const id = String(
        candidate?.playerId ||
          candidate?.memberId ||
          candidate?.uid ||
          candidate?.id ||
          ""
      ).trim();
      const fullName = toTitleCaseLoose(
        candidate?.fullName ||
          candidate?.playerName ||
          candidate?.displayName ||
          candidate?.name ||
          candidate?.shortName ||
          ""
      );
      const short = firstNameOf(fullName || candidate?.shortName || "");
      if (!id || !fullName) return;

      byKey.set(id, {
        id,
        fullName,
        shortName: short || fullName,
      });
    };

    liveCommittedUsers.forEach((user) =>
      addOption({
        playerId: user.userId,
        fullName: user.fullName,
        shortName: user.shortName,
      })
    );

    teams.forEach((team) => {
      const players = Array.isArray(team?.players) ? team.players : [];
      players.forEach((entry) => {
        if (typeof entry === "string") {
          addOption({
            playerId: slugFromLooseName(entry),
            fullName: entry,
            shortName: firstNameOf(entry),
          });
          return;
        }
        addOption(entry || {});
      });
    });

    addOption({
      playerId: payerUserId,
      fullName: displayName,
      shortName,
    });

    return Array.from(byKey.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }, [liveCommittedUsers, teams, payerUserId, displayName, shortName]);

  useEffect(() => {
    if (signupForMode !== "existing_player") return;
    if (existingPlayerTargetId) return;

    const selfOption = existingPlayerOptions.find(
      (item) => normKey(item.id) === normKey(payerUserId)
    );
    if (selfOption) setExistingPlayerTargetId(selfOption.id);
  }, [signupForMode, existingPlayerTargetId, existingPlayerOptions, payerUserId]);

  const beneficiary = useMemo(() => {
    if (isCombinedMode) {
      return {
        mode: "self",
        fullName: displayName,
        shortName,
        playerId: payerUserId,
        stableKey: buildBeneficiaryStableKey("self", payerUserId, displayName),
        isGuest: false,
      };
    }

    if (signupForMode === "existing_player") {
      const found = existingPlayerOptions.find(
        (item) => String(item.id) === String(existingPlayerTargetId)
      );

      const fullName = found?.fullName || displayName;
      const short = found?.shortName || firstNameOf(fullName) || "Player";
      const playerId = found?.id || existingPlayerTargetId || payerUserId;

      return {
        mode: "existing_player",
        fullName,
        shortName: short,
        playerId,
        stableKey: buildBeneficiaryStableKey(
          "existing_player",
          playerId,
          fullName
        ),
        isGuest: false,
      };
    }

    if (signupForMode === "guest") {
      const cleanGuestName = toTitleCaseLoose(guestPlayerName || "");
      const fullName = cleanGuestName || "Guest Player";
      return {
        mode: "guest",
        fullName,
        shortName: firstNameOf(fullName) || "Guest",
        playerId: buildBeneficiaryPlayerId("guest", "", fullName),
        stableKey: buildBeneficiaryStableKey("guest", "", fullName),
        isGuest: true,
      };
    }

    return {
      mode: "self",
      fullName: displayName,
      shortName,
      playerId: payerUserId,
      stableKey: buildBeneficiaryStableKey("self", payerUserId, displayName),
      isGuest: false,
    };
  }, [
    signupForMode,
    isCombinedMode,
    existingPlayerOptions,
    existingPlayerTargetId,
    guestPlayerName,
    displayName,
    shortName,
    payerUserId,
  ]);

  const pendingId = useMemo(
    () =>
      buildPendingSignupId({
        signupType,
        beneficiaryPlayerId: beneficiary.playerId,
        monthKey: calendarMonthKey,
      }),
    [signupType, beneficiary.playerId, calendarMonthKey]
  );

  const currentUserDocKey = useMemo(
    () => beneficiary.stableKey,
    [beneficiary.stableKey]
  );

  const secondBeneficiary = useMemo(() => {
    if (!isCombinedMode) return null;

    if (secondSignupMode === "existing_player") {
      const found = existingPlayerOptions.find(
        (item) => String(item.id) === String(secondExistingPlayerTargetId)
      );

      const fullName = found?.fullName || "";
      const short = found?.shortName || firstNameOf(fullName) || "Player";
      const playerId = found?.id || secondExistingPlayerTargetId || "";

      return {
        mode: "existing_player",
        fullName,
        shortName: short,
        playerId,
        stableKey: buildBeneficiaryStableKey(
          "existing_player",
          playerId,
          fullName
        ),
        isGuest: false,
        email: "",
      };
    }

    if (secondSignupMode === "guest") {
      const cleanGuestName = toTitleCaseLoose(secondGuestPlayerName || "");
      const fullName = cleanGuestName || "";
      return {
        mode: "guest",
        fullName,
        shortName: firstNameOf(fullName) || "Guest",
        playerId: fullName ? buildBeneficiaryPlayerId("guest", "", fullName) : "",
        stableKey: fullName ? buildBeneficiaryStableKey("guest", "", fullName) : "",
        isGuest: true,
        email: normalizeEmail(secondGuestPlayerEmail),
      };
    }

    return null;
  }, [
    isCombinedMode,
    secondSignupMode,
    existingPlayerOptions,
    secondExistingPlayerTargetId,
    secondGuestPlayerName,
    secondGuestPlayerEmail,
  ]);

  const secondPendingId = useMemo(
    () =>
      secondBeneficiary?.playerId
        ? buildPendingSignupId({
            signupType,
            beneficiaryPlayerId: secondBeneficiary.playerId,
            monthKey: calendarMonthKey,
          })
        : "",
    [signupType, secondBeneficiary?.playerId, calendarMonthKey]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceBadge() {
      if (beneficiary.isGuest) {
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

        const targetIdentity = {
          playerId: beneficiary.playerId,
          shortName: beneficiary.shortName,
          fullName: beneficiary.fullName,
          displayName: beneficiary.fullName,
        };

        const allHistory = mainSnap.exists()
          ? extractAllSeasonsMatchDayHistory(mainSnap.data() || {})
          : [];

        if (Array.isArray(allHistory) && allHistory.length > 0) {
          const badgeFromHistory = buildAttendanceFromMatchDayHistory({
            matchDayHistory: allHistory,
            identity: targetIdentity,
            displayName: beneficiary.fullName,
            shortName: beneficiary.shortName,
          });

          if (!cancelled) setAttendanceBadge(badgeFromHistory);
          return;
        }

        const seasonSnaps = await getDocs(collection(db, "seasons"));
        if (cancelled) return;

        const rows = [];
        for (const seasonDoc of seasonSnaps.docs) {
          try {
            const attendanceSnap = await getDocs(
              collection(db, "seasons", seasonDoc.id, "attendance")
            );
            attendanceSnap.forEach((docSnap) =>
              rows.push({
                seasonId: seasonDoc.id,
                ...(docSnap.data() || {}),
              })
            );
          } catch (error) {
            console.warn("Attendance fallback skipped for season:", seasonDoc.id, error);
          }
        }

        if (cancelled) return;

        const badgeFromAttendance = buildAttendanceFromAttendanceCollection({
          rows,
          identity: targetIdentity,
          displayName: beneficiary.fullName,
          shortName: beneficiary.shortName,
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
  }, [beneficiary]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateBeneficiarySelection() {
      try {
        setSelectionHydrated(false);
        setMatchSignupStateLoaded(false);

        const pendingSnap = await getDoc(doc(db, "pendingSignups", pendingId));
        if (cancelled) return;

        const pendingData = pendingSnap.exists() ? pendingSnap.data() || {} : {};
        const pendingSelectedWeeks = Array.isArray(pendingData.selectedWeeks)
          ? pendingData.selectedWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        const pendingPaidWeeks = Array.isArray(pendingData.paidWeeks)
          ? pendingData.paidWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        setSelectedWeeks(pendingSelectedWeeks);
        setPaidWeeks(pendingPaidWeeks);

        if (pendingData.reminderPreference) {
          setReminderPreference(String(pendingData.reminderPreference));
        }

        setPendingSelectionsSaved(pendingSelectedWeeks.length > 0);

        const matchSignupSnap = await getDoc(doc(db, "matchSignups", pendingId));
        if (cancelled) return;

        const matchSignupData = matchSignupSnap.exists()
          ? matchSignupSnap.data() || {}
          : {};

        const paidFromMatchSignup = Array.isArray(matchSignupData.paidWeeks)
          ? matchSignupData.paidWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        if (paidFromMatchSignup.length > 0) {
          setPaidWeeks(paidFromMatchSignup);
        }

        const matchSelectedWeeks = Array.isArray(matchSignupData.selectedWeeks)
          ? matchSignupData.selectedWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        if (pendingSelectedWeeks.length === 0 && matchSelectedWeeks.length > 0) {
          setSelectedWeeks(matchSelectedWeeks);
          setPendingSelectionsSaved(true);
        }
      } catch (error) {
        console.error("Failed to hydrate beneficiary signup:", error);
      } finally {
        if (!cancelled) {
          setSelectionHydrated(true);
          setMatchSignupStateLoaded(true);
        }
      }
    }

    hydrateBeneficiarySelection();

    return () => {
      cancelled = true;
    };
  }, [pendingId, weeks]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSecondBeneficiarySelection() {
      if (!isCombinedMode || !secondBeneficiary?.playerId || !secondPendingId) {
        setSecondSelectedWeeks([]);
        setSecondPaidWeeks([]);
        setSecondSelectionHydrated(!isCombinedMode);
        setSecondMatchSignupStateLoaded(!isCombinedMode);
        return;
      }

      try {
        setSecondSelectionHydrated(false);
        setSecondMatchSignupStateLoaded(false);

        const pendingSnap = await getDoc(doc(db, "pendingSignups", secondPendingId));
        if (cancelled) return;

        const pendingData = pendingSnap.exists() ? pendingSnap.data() || {} : {};
        const pendingSelectedWeeks = Array.isArray(pendingData.selectedWeeks)
          ? pendingData.selectedWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        const pendingPaidWeeks = Array.isArray(pendingData.paidWeeks)
          ? pendingData.paidWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        setSecondSelectedWeeks(pendingSelectedWeeks);
        setSecondPaidWeeks(pendingPaidWeeks);

        const matchSignupSnap = await getDoc(doc(db, "matchSignups", secondPendingId));
        if (cancelled) return;

        const matchSignupData = matchSignupSnap.exists()
          ? matchSignupSnap.data() || {}
          : {};

        const paidFromMatchSignup = Array.isArray(matchSignupData.paidWeeks)
          ? matchSignupData.paidWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        if (paidFromMatchSignup.length > 0) {
          setSecondPaidWeeks(paidFromMatchSignup);
        }

        const matchSelectedWeeks = Array.isArray(matchSignupData.selectedWeeks)
          ? matchSignupData.selectedWeeks.filter((weekId) =>
              weeks.some((week) => week.id === weekId)
            )
          : [];

        if (pendingSelectedWeeks.length === 0 && matchSelectedWeeks.length > 0) {
          setSecondSelectedWeeks(matchSelectedWeeks);
        }
      } catch (error) {
        console.error("Failed to hydrate second beneficiary signup:", error);
      } finally {
        if (!cancelled) {
          setSecondSelectionHydrated(true);
          setSecondMatchSignupStateLoaded(true);
        }
      }
    }

    hydrateSecondBeneficiarySelection();

    return () => {
      cancelled = true;
    };
  }, [isCombinedMode, secondBeneficiary?.playerId, secondPendingId, weeks]);

  useEffect(() => {
    const q = query(collection(db, "pendingSignups"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextWeekKeys = {};
        const nextPlayerWeeks = {};
        const nextCommittedUsers = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};

          const sameScope =
            String(data.monthKey || data.signupScopeId || "") ===
            String(calendarMonthKey || signupScopeId);

          if (!sameScope) return;

          const weeksForDoc = Array.isArray(data.selectedWeeks)
            ? data.selectedWeeks.filter((weekId) =>
                weeks.some((week) => week.id === weekId)
              )
            : [];

          const paidWeeksForDoc = Array.isArray(data.paidWeeks)
            ? data.paidWeeks.filter((weekId) =>
                weeks.some((week) => week.id === weekId)
              )
            : [];

          const beneficiaryId = String(
            data.beneficiaryPlayerId || data.playerId || data.userId || ""
          ).trim();

          const beneficiaryName = toTitleCaseLoose(
            data.beneficiaryName || data.playerName || data.shortName || "Player"
          );

          const beneficiaryShortName =
            firstNameOf(data.beneficiaryShortName || beneficiaryName) || "Player";

          const beneficiaryStableKey = String(
            data.beneficiaryStableKey ||
              (data.beneficiaryType === "guest"
                ? `guest:${normKey(beneficiaryName)}`
                : `uid:${normKey(beneficiaryId || beneficiaryName)}`)
          ).trim();

          weeksForDoc.forEach((weekId) => {
            if (!nextWeekKeys[weekId]) nextWeekKeys[weekId] = [];
            if (!nextWeekKeys[weekId].includes(beneficiaryStableKey)) {
              nextWeekKeys[weekId].push(beneficiaryStableKey);
            }
          });

          uniqueStrings([
            beneficiaryId,
            beneficiaryName,
            beneficiaryShortName,
            firstNameOf(beneficiaryName),
            slugFromLooseName(beneficiaryName),
          ])
            .map(normKey)
            .forEach((key) => {
              if (!nextPlayerWeeks[key]) nextPlayerWeeks[key] = [];
              weeksForDoc.forEach((weekId) => {
                if (!nextPlayerWeeks[key].includes(weekId)) {
                  nextPlayerWeeks[key].push(weekId);
                }
              });
            });

          if (weeksForDoc.length > 0) {
            const unpaidWeeks = weeksForDoc.filter(
              (weekId) => !paidWeeksForDoc.includes(weekId)
            );

            nextCommittedUsers.push({
              stableKey: beneficiaryStableKey,
              userId: beneficiaryId,
              fullName: beneficiaryName,
              shortName: beneficiaryShortName,
              beneficiaryType: data.beneficiaryType || "self",
              paymentStatus:
                data.paymentStatus ||
                (unpaidWeeks.length === 0 ? "paid" : "unpaid"),
              unpaidWeeks,
              paidWeeks: paidWeeksForDoc,
              selectedWeeks: weeksForDoc,
              amountDueNow:
                Number(data.totalAmount || 0) ||
                unpaidWeeks.length * COST_PER_GAME,
            });
          }
        });

        setLiveWeekKeys(nextWeekKeys);
        setLivePlayerWeeks(nextPlayerWeeks);
        setLiveCommittedUsers(nextCommittedUsers);
      },
      (error) => {
        console.error("Failed to subscribe to pending signups:", error);
      }
    );

    return () => unsubscribe();
  }, [calendarMonthKey, signupScopeId, weeks]);

  useEffect(() => {
    if (!selectionHydrated || !matchSignupStateLoaded) return;

    const persistPendingSelection = async () => {
      try {
        setSaveState("saving");

        const weeksToPayNow = selectedWeeks.filter(
          (weekId) => !paidWeeks.includes(weekId)
        );

        const paymentStatus =
          selectedWeeks.length === 0
            ? "not_selected"
            : weeksToPayNow.length === 0
            ? "paid"
            : paidWeeks.length > 0
            ? "part_paid"
            : "pending";

        const payload = {
          activeSeasonId: resolvedSeasonId,
          seasonAtSignupTime: resolvedSeasonId,
          signupType,
          signupScopeId,
          signupScopeLabel,
          monthLabel: calendarMonthData?.monthLabel || "",
          monthKey: calendarMonthKey,
          payerUserId,
          payerName: displayName,
          payerShortName: shortName,
          userId: payerUserId,
          playerId: beneficiary.playerId,
          playerName: beneficiary.fullName,
          shortName: beneficiary.shortName,
          beneficiaryType: beneficiary.mode,
          beneficiaryPlayerId: beneficiary.playerId,
          beneficiaryName: beneficiary.fullName,
          beneficiaryShortName: beneficiary.shortName,
          beneficiaryStableKey: beneficiary.stableKey,
          whatsappNumber: profileWhatsappNumber || phoneNumber || "",
          effectiveWhatsappNumber: effectiveWhatsappNumber || "",
          whatsappVerificationStatus:
            whatsAppVerificationStatus || "manual_admin_verified",
          selectedWeeks,
          paidWeeks,
          unpaidWeeks: weeksToPayNow,
          weeksToPayNow,
          totalAmount: weeksToPayNow.length * COST_PER_GAME,
          amountDueNow: weeksToPayNow.length * COST_PER_GAME,
          amountPaidTotal: paidWeeks.length * COST_PER_GAME,
          costPerGame: COST_PER_GAME,
          paymentStatus,
          isUnpaid: selectedWeeks.length > 0 && weeksToPayNow.length > 0,
          remindersEnabled: Boolean(effectiveWhatsappNumber) && selectedWeeks.length > 0,
          remindersPaused:
            !Boolean(effectiveWhatsappNumber) || selectedWeeks.length === 0,
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
    matchSignupStateLoaded,
    selectedWeeks,
    paidWeeks,
    resolvedSeasonId,
    signupType,
    signupScopeId,
    signupScopeLabel,
    payerUserId,
    displayName,
    shortName,
    beneficiary,
    profileWhatsappNumber,
    phoneNumber,
    effectiveWhatsappNumber,
    reminderPreference,
    whatsAppVerificationStatus,
    pendingId,
    calendarMonthData?.monthLabel,
    calendarMonthKey,
  ]);

  useEffect(() => {
    if (!isCombinedMode) return;
    if (!secondBeneficiary?.playerId) return;
    if (!secondSelectionHydrated || !secondMatchSignupStateLoaded) return;

    const persistSecondPendingSelection = async () => {
      try {
        const secondWeeksToPayNow = secondSelectedWeeks.filter(
          (weekId) => !secondPaidWeeks.includes(weekId)
        );

        const paymentStatus =
          secondSelectedWeeks.length === 0
            ? "not_selected"
            : secondWeeksToPayNow.length === 0
            ? "paid"
            : secondPaidWeeks.length > 0
            ? "part_paid"
            : "pending";

        const payload = {
          activeSeasonId: resolvedSeasonId,
          seasonAtSignupTime: resolvedSeasonId,
          signupType,
          signupScopeId,
          signupScopeLabel,
          monthLabel: calendarMonthData?.monthLabel || "",
          monthKey: calendarMonthKey,
          payerUserId,
          payerName: displayName,
          payerShortName: shortName,
          userId: payerUserId,
          playerId: secondBeneficiary.playerId,
          playerName: secondBeneficiary.fullName,
          shortName: secondBeneficiary.shortName,
          beneficiaryType: secondBeneficiary.mode,
          beneficiaryPlayerId: secondBeneficiary.playerId,
          beneficiaryName: secondBeneficiary.fullName,
          beneficiaryShortName: secondBeneficiary.shortName,
          beneficiaryStableKey: secondBeneficiary.stableKey,
          beneficiaryEmail: secondBeneficiary.email || "",
          whatsappNumber: profileWhatsappNumber || phoneNumber || "",
          effectiveWhatsappNumber: effectiveWhatsappNumber || "",
          whatsappVerificationStatus:
            whatsAppVerificationStatus || "manual_admin_verified",
          selectedWeeks: secondSelectedWeeks,
          paidWeeks: secondPaidWeeks,
          unpaidWeeks: secondWeeksToPayNow,
          weeksToPayNow: secondWeeksToPayNow,
          totalAmount: secondWeeksToPayNow.length * COST_PER_GAME,
          amountDueNow: secondWeeksToPayNow.length * COST_PER_GAME,
          amountPaidTotal: secondPaidWeeks.length * COST_PER_GAME,
          costPerGame: COST_PER_GAME,
          paymentStatus,
          isUnpaid:
            secondSelectedWeeks.length > 0 && secondWeeksToPayNow.length > 0,
          remindersEnabled: Boolean(effectiveWhatsappNumber) && secondSelectedWeeks.length > 0,
          remindersPaused:
            !Boolean(effectiveWhatsappNumber) || secondSelectedWeeks.length === 0,
          reminderPreference,
          reminderTimezone: "Africa/Johannesburg",
          lastReminderSentAt: null,
          nextReminderAt: null,
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, "pendingSignups", secondPendingId), payload, {
          merge: true,
        });
      } catch (err) {
        console.error("Failed to persist second pending signup selection:", err);
      }
    };

    persistSecondPendingSelection();
  }, [
    isCombinedMode,
    secondSelectionHydrated,
    secondMatchSignupStateLoaded,
    secondSelectedWeeks,
    secondPaidWeeks,
    resolvedSeasonId,
    signupType,
    signupScopeId,
    signupScopeLabel,
    payerUserId,
    displayName,
    shortName,
    secondBeneficiary,
    profileWhatsappNumber,
    phoneNumber,
    effectiveWhatsappNumber,
    reminderPreference,
    whatsAppVerificationStatus,
    secondPendingId,
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
        if (matchedKey && playerPhotos[matchedKey]) return playerPhotos[matchedKey];
      }

      return null;
    };
  }, [playerPhotos]);

  const photoData =
    getPlayerPhoto(beneficiary.fullName) || getPlayerPhoto(beneficiary.shortName);

  const currentTeam = useMemo(
    () =>
      beneficiary.isGuest
        ? null
        : findCurrentPlayersTeam(
            teams,
            {
              playerId: beneficiary.playerId,
              shortName: beneficiary.shortName,
              fullName: beneficiary.fullName,
            },
            beneficiary.fullName,
            beneficiary.shortName
          ),
    [teams, beneficiary]
  );

  const allRows = useMemo(() => {
    const rowsFromCommittedUsers = liveCommittedUsers.map((user, index) => ({
      id: user.userId || `${slugFromLooseName(user.fullName)}_${index}`,
      uid: user.userId || "",
      playerId: user.userId || "",
      memberId: user.userId || "",
      fullName: user.fullName,
      shortName: user.shortName || firstNameOf(user.fullName),
      stableKey: user.stableKey,
      isCurrent: normKey(user.stableKey) === normKey(beneficiary.stableKey),
      isSecondaryEditable:
        Boolean(isCombinedMode && secondBeneficiary?.stableKey) &&
        normKey(user.stableKey) === normKey(secondBeneficiary.stableKey),
      isEmpty: false,
    }));

    const uniqueMap = new Map();
    rowsFromCommittedUsers.forEach((row) => {
      uniqueMap.set(row.stableKey || row.id, row);
    });

    const committedRows = Array.from(uniqueMap.values());

    const alreadyHasCurrent = committedRows.some(
      (p) => normKey(p.stableKey) === normKey(beneficiary.stableKey)
    );

    if (!alreadyHasCurrent) {
      committedRows.push({
        id: beneficiary.playerId || slugFromLooseName(beneficiary.fullName),
        uid: beneficiary.playerId || "",
        playerId: beneficiary.playerId || "",
        memberId: beneficiary.playerId || "",
        fullName: beneficiary.fullName,
        shortName: beneficiary.shortName,
        stableKey: beneficiary.stableKey,
        isCurrent: true,
        isSecondaryEditable: false,
        isEmpty: false,
      });
    }

    if (isCombinedMode && secondBeneficiary?.playerId && secondBeneficiary?.fullName) {
      const alreadyHasSecond = committedRows.some(
        (p) => normKey(p.stableKey) === normKey(secondBeneficiary.stableKey)
      );

      if (!alreadyHasSecond) {
        committedRows.push({
          id:
            secondBeneficiary.playerId ||
            slugFromLooseName(secondBeneficiary.fullName),
          uid: secondBeneficiary.playerId || "",
          playerId: secondBeneficiary.playerId || "",
          memberId: secondBeneficiary.playerId || "",
          fullName: secondBeneficiary.fullName,
          shortName: secondBeneficiary.shortName,
          stableKey: secondBeneficiary.stableKey,
          isCurrent: false,
          isSecondaryEditable: true,
          isEmpty: false,
        });
      }
    }

    const boostedRows = committedRows.map((row) => ({
      ...row,
      isSecondaryEditable:
        Boolean(row.isSecondaryEditable) ||
        (Boolean(isCombinedMode && secondBeneficiary?.stableKey) &&
          normKey(row.stableKey) === normKey(secondBeneficiary.stableKey)),
    }));

    boostedRows.sort((a, b) => {
      const rank = (row) => {
        if (row.isCurrent) return 0;
        if (row.isSecondaryEditable) return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });

    while (boostedRows.length < MAX_PLAYERS) {
      boostedRows.push({
        id: `empty_slot_${boostedRows.length + 1}`,
        fullName: "",
        shortName: `Slot ${boostedRows.length + 1}`,
        isCurrent: false,
        isSecondaryEditable: false,
        isEmpty: true,
      });
    }

    return boostedRows.slice(0, MAX_PLAYERS);
  }, [liveCommittedUsers, currentTeam, beneficiary, isCombinedMode, secondBeneficiary]);

  const weekSelectionsAll = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const signedKeys = new Set(liveWeekKeys[week.id] || []);

      if (selectedWeeks.includes(week.id)) {
        signedKeys.add(currentUserDocKey);
      } else {
        signedKeys.delete(currentUserDocKey);
      }

      if (isCombinedMode && secondBeneficiary?.stableKey) {
        if (secondSelectedWeeks.includes(week.id)) {
          signedKeys.add(secondBeneficiary.stableKey);
        } else {
          signedKeys.delete(secondBeneficiary.stableKey);
        }
      }

      out[week.id] = signedKeys;
    });

    return out;
  }, [
    weeks,
    liveWeekKeys,
    selectedWeeks,
    currentUserDocKey,
    isCombinedMode,
    secondBeneficiary,
    secondSelectedWeeks,
  ]);

  const actualPlayersCount = useMemo(
    () => allRows.filter((row) => !row.isEmpty).length,
    [allRows]
  );

  const visibleRowCount = useMemo(() => {
    const expandableCount = Math.min(MAX_PLAYERS, actualPlayersCount + 1);
    return Math.min(
      MAX_PLAYERS,
      Math.max(DEFAULT_VISIBLE_SLOTS, expandableCount)
    );
  }, [actualPlayersCount]);

  const displayRows = useMemo(
    () => allRows.slice(0, visibleRowCount),
    [allRows, visibleRowCount]
  );

  const lastVisibleRowIndex = displayRows.length - 1;

  const weekSelections = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const signedIds = new Set();

      displayRows.forEach((player) => {
        if (player.isEmpty) return;

        if (player.isCurrent) {
          if (selectedWeeks.includes(week.id)) signedIds.add(player.id);
          return;
        }

        if (player.isSecondaryEditable) {
          if (secondSelectedWeeks.includes(week.id)) signedIds.add(player.id);
          return;
        }

        const lookupKeys = getPlayerLookupKeys(player);
        const isSelectedForThatPlayer =
          (player.stableKey &&
            (liveWeekKeys[week.id] || []).includes(player.stableKey)) ||
          lookupKeys.some((key) => (livePlayerWeeks[key] || []).includes(week.id));

        if (isSelectedForThatPlayer) signedIds.add(player.id);
      });

      out[week.id] = signedIds;
    });

    return out;
  }, [
    weeks,
    displayRows,
    livePlayerWeeks,
    liveWeekKeys,
    selectedWeeks,
    secondSelectedWeeks,
  ]);

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
    hasInitialScrollRef.current = false;
  }, [beneficiary.stableKey]);

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
    if (paidWeeks.includes(week.id)) return;

    const meta = weekMeta.find((w) => w.id === week.id);
    const isSelected = selectedWeeks.includes(week.id);

    if (isSelected) {
      setSelectedWeeks((prev) => prev.filter((id) => id !== week.id));
      return;
    }

    if ((meta?.count || 0) >= MAX_PLAYERS) return;
    setSelectedWeeks((prev) => [...prev, week.id]);
  };

  const toggleSecondWeek = (weekId) => {
    if (secondPaidWeeks.includes(weekId)) return;
    setSecondSelectedWeeks((prev) =>
      prev.includes(weekId)
        ? prev.filter((id) => id !== weekId)
        : [...prev, weekId]
    );
  };

  const paidWeekSet = useMemo(() => new Set(paidWeeks), [paidWeeks]);

  const weeksToPayNow = useMemo(
    () => selectedWeeks.filter((weekId) => !paidWeekSet.has(weekId)),
    [selectedWeeks, paidWeekSet]
  );

  const secondPaidWeekSet = useMemo(
    () => new Set(secondPaidWeeks),
    [secondPaidWeeks]
  );

  const secondWeeksToPayNow = useMemo(
    () => secondSelectedWeeks.filter((weekId) => !secondPaidWeekSet.has(weekId)),
    [secondSelectedWeeks, secondPaidWeekSet]
  );

  const combinedSelectedCount = selectedWeeks.length + secondSelectedWeeks.length;
  const combinedWeeksToPayCount =
    weeksToPayNow.length + secondWeeksToPayNow.length;

  const totalAmount =
    (isCombinedMode ? combinedWeeksToPayCount : weeksToPayNow.length) *
    COST_PER_GAME;
  const selectedCount = isCombinedMode ? combinedSelectedCount : selectedWeeks.length;
  const signupStatusText =
    selectedCount > 0
      ? `${selectedCount} week${selectedCount > 1 ? "s" : ""} selected`
      : "tick a box";

  const attendanceBadgeText = attendanceBadge.loading
    ? "Attendance loading..."
    : attendanceBadge.percent == null
    ? beneficiary.isGuest
      ? "New guest player"
      : "Attendance not available"
    : `${attendanceBadge.percent}% attendance`;

  const attendanceSubtext = attendanceBadge.loading
    ? ""
    : attendanceBadge.percent == null
    ? beneficiary.isGuest
      ? "Guest player has no previous attendance record"
      : ""
    : `${attendanceBadge.attended}/${attendanceBadge.total} match days · ${attendanceBadge.gamesPlayed} game${
        attendanceBadge.gamesPlayed === 1 ? "" : "s"
      } played`;

  const unpaidPlayersCount = useMemo(
    () =>
      liveCommittedUsers.filter(
        (user) => Array.isArray(user.unpaidWeeks) && user.unpaidWeeks.length > 0
      ).length,
    [liveCommittedUsers]
  );

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
    if (selectedWeeks.length === 0 && secondSelectedWeeks.length === 0) {
      onBack?.();
      return;
    }
    setShowLeavePrompt(true);
  };

  const handlePayNow = async () => {
    if (beneficiaryNeedsSelection) return;

    if (signupForMode === "guest" && !looksLikeEmail(guestPlayerEmail)) {
      window.alert("Please add a valid email address for the new player.");
      return;
    }

    if (signupForMode === "self_and_guest" && !looksLikeEmail(secondGuestPlayerEmail)) {
      window.alert("Please add a valid email address for the additional new player.");
      return;
    }

    try {
      if (signupForMode === "guest" && beneficiary.fullName) {
        await setDoc(
          doc(db, "players", beneficiary.playerId),
          {
            playerId: beneficiary.playerId,
            fullName: beneficiary.fullName,
            shortName: beneficiary.shortName,
            email: normalizeEmail(guestPlayerEmail),
            createdByUserId: payerUserId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (secondBeneficiary?.isGuest && secondBeneficiary.fullName) {
        await setDoc(
          doc(db, "players", secondBeneficiary.playerId),
          {
            playerId: secondBeneficiary.playerId,
            fullName: secondBeneficiary.fullName,
            shortName: secondBeneficiary.shortName,
            email: normalizeEmail(secondGuestPlayerEmail),
            createdByUserId: payerUserId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const totalWeeksForPayment = isCombinedMode
        ? combinedWeeksToPayCount
        : weeksToPayNow.length;

      const combinedPaymentLink = isCombinedMode
        ? COMBINED_PAYMENT_LINKS[totalWeeksForPayment] || ""
        : "";

      setShowLeavePrompt(false);
      onProceedToPayment?.({
        signupDocId: pendingId,
        secondSignupDocId: secondPendingId || "",
        selectedWeeks,
        paidWeeks,
        weeksToPayNow,
        secondSelectedWeeks,
        secondPaidWeeks,
        secondWeeksToPayNow,
        totalAmount,
        amountDue: totalAmount,
        costPerGame: COST_PER_GAME,
        totalWeeksForPayment,
        displayName: beneficiary.fullName,
        shortName: beneficiary.shortName,
        payerName: displayName,
        payerUserId,
        beneficiaryName: beneficiary.fullName,
        beneficiaryShortName: beneficiary.shortName,
        beneficiaryPlayerId: beneficiary.playerId,
        beneficiaryType: beneficiary.mode,
        beneficiaryStableKey: beneficiary.stableKey,
        secondBeneficiaryName: secondBeneficiary?.fullName || "",
        secondBeneficiaryShortName: secondBeneficiary?.shortName || "",
        secondBeneficiaryPlayerId: secondBeneficiary?.playerId || "",
        secondBeneficiaryType: secondBeneficiary?.mode || "",
        secondBeneficiaryStableKey: secondBeneficiary?.stableKey || "",
        combinedPaymentLink,
        paymentReference: `5s-${firstNameOf(beneficiary.fullName)}`,
      });
    } catch (error) {
      console.error("Failed to prepare payment:", error);
      window.alert("Could not prepare payment. Please try again.");
    }
  };


  const persistExitStateForBeneficiary = async ({
    docId,
    targetBeneficiary,
    targetSelectedWeeks,
    targetPaidWeeks,
    targetWeeksToPayNow,
    paymentStatus,
    remindersEnabled,
    remindersPaused,
  }) => {
    if (!docId || !targetBeneficiary?.playerId) return;

    await setDoc(
      doc(db, "pendingSignups", docId),
      {
        activeSeasonId: resolvedSeasonId,
        seasonAtSignupTime: resolvedSeasonId,
        signupType,
        signupScopeId,
        signupScopeLabel,
        monthLabel: calendarMonthData?.monthLabel || "",
        monthKey: calendarMonthKey,
        payerUserId,
        payerName: displayName,
        payerShortName: shortName,
        userId: payerUserId,
        playerId: targetBeneficiary.playerId,
        playerName: targetBeneficiary.fullName,
        shortName: targetBeneficiary.shortName,
        beneficiaryType: targetBeneficiary.mode,
        beneficiaryPlayerId: targetBeneficiary.playerId,
        beneficiaryName: targetBeneficiary.fullName,
        beneficiaryShortName: targetBeneficiary.shortName,
        beneficiaryStableKey: targetBeneficiary.stableKey,
        beneficiaryEmail: targetBeneficiary.email || "",
        whatsappNumber: profileWhatsappNumber || phoneNumber || "",
        effectiveWhatsappNumber: effectiveWhatsappNumber || "",
        whatsappVerificationStatus:
          whatsAppVerificationStatus || "manual_admin_verified",
        selectedWeeks: targetSelectedWeeks,
        paidWeeks: targetPaidWeeks,
        unpaidWeeks: targetWeeksToPayNow,
        weeksToPayNow: targetWeeksToPayNow,
        totalAmount: targetWeeksToPayNow.length * COST_PER_GAME,
        amountDueNow: targetWeeksToPayNow.length * COST_PER_GAME,
        amountPaidTotal: targetPaidWeeks.length * COST_PER_GAME,
        costPerGame: COST_PER_GAME,
        paymentStatus,
        isUnpaid: targetWeeksToPayNow.length > 0,
        remindersEnabled,
        remindersPaused,
        reminderPreference,
        reminderTimezone: "Africa/Johannesburg",
        submittedAt:
          paymentStatus === "submitted_awaiting_confirmation"
            ? serverTimestamp()
            : null,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const handlePaidSubmitted = async () => {
    try {
      if (selectedWeeks.length === 0 && secondSelectedWeeks.length === 0) {
        setShowLeavePrompt(false);
        onBack?.();
        return;
      }

      await persistExitStateForBeneficiary({
        docId: pendingId,
        targetBeneficiary: beneficiary,
        targetSelectedWeeks: selectedWeeks,
        targetPaidWeeks: paidWeeks,
        targetWeeksToPayNow: weeksToPayNow,
        paymentStatus:
          weeksToPayNow.length === 0 ? "paid" : "submitted_awaiting_confirmation",
        remindersEnabled: false,
        remindersPaused: true,
      });

      if (isCombinedMode && secondBeneficiary?.playerId && secondPendingId) {
        await persistExitStateForBeneficiary({
          docId: secondPendingId,
          targetBeneficiary: secondBeneficiary,
          targetSelectedWeeks: secondSelectedWeeks,
          targetPaidWeeks: secondPaidWeeks,
          targetWeeksToPayNow: secondWeeksToPayNow,
          paymentStatus:
            secondWeeksToPayNow.length === 0
              ? "paid"
              : "submitted_awaiting_confirmation",
          remindersEnabled: false,
          remindersPaused: true,
        });
      }

      setPendingSelectionsSaved(true);
      setShowLeavePrompt(false);
      onBack?.();
    } catch (error) {
      console.error("Paid submission save failed", error);
      setShowLeavePrompt(false);
      onBack?.();
    }
  };

  const handlePayLater = async () => {
    try {
      if (selectedWeeks.length === 0 && secondSelectedWeeks.length === 0) {
        setShowLeavePrompt(false);
        onBack?.();
        return;
      }

      await persistExitStateForBeneficiary({
        docId: pendingId,
        targetBeneficiary: beneficiary,
        targetSelectedWeeks: selectedWeeks,
        targetPaidWeeks: paidWeeks,
        targetWeeksToPayNow: weeksToPayNow,
        paymentStatus:
          weeksToPayNow.length === 0
            ? "paid"
            : paidWeeks.length > 0
            ? "part_paid"
            : "payment_deferred",
        remindersEnabled: Boolean(effectiveWhatsappNumber),
        remindersPaused: !Boolean(effectiveWhatsappNumber),
      });

      if (isCombinedMode && secondBeneficiary?.playerId && secondPendingId) {
        await persistExitStateForBeneficiary({
          docId: secondPendingId,
          targetBeneficiary: secondBeneficiary,
          targetSelectedWeeks: secondSelectedWeeks,
          targetPaidWeeks: secondPaidWeeks,
          targetWeeksToPayNow: secondWeeksToPayNow,
          paymentStatus:
            secondWeeksToPayNow.length === 0
              ? "paid"
              : secondPaidWeeks.length > 0
              ? "part_paid"
              : "payment_deferred",
          remindersEnabled: Boolean(effectiveWhatsappNumber),
          remindersPaused: !Boolean(effectiveWhatsappNumber),
        });
      }

      if (!effectiveWhatsappNumber) setShowWhatsAppPrompt(true);

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
          seasonAtSignupTime: resolvedSeasonId,
          signupType,
          signupScopeId,
          signupScopeLabel,
          monthLabel: calendarMonthData?.monthLabel || "",
          monthKey: calendarMonthKey,
          payerUserId,
          payerName: displayName,
          payerShortName: shortName,
          userId: payerUserId,
          playerId: beneficiary.playerId,
          playerName: beneficiary.fullName,
          shortName: beneficiary.shortName,
          beneficiaryType: beneficiary.mode,
          beneficiaryPlayerId: beneficiary.playerId,
          beneficiaryName: beneficiary.fullName,
          beneficiaryShortName: beneficiary.shortName,
          beneficiaryStableKey: beneficiary.stableKey,
          selectedWeeks: [],
          paidWeeks,
          unpaidWeeks: [],
          weeksToPayNow: [],
          totalAmount: 0,
          amountDueNow: 0,
          amountPaidTotal: paidWeeks.length * COST_PER_GAME,
          costPerGame: COST_PER_GAME,
          paymentStatus: paidWeeks.length > 0 ? "paid" : "not_selected",
          isUnpaid: false,
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

  const saveStateText = "";

  const beneficiaryNeedsSelection =
    signupForMode === "existing_player"
      ? !existingPlayerTargetId
      : signupForMode === "guest"
      ? !guestPlayerName.trim() || !looksLikeEmail(guestPlayerEmail)
      : signupForMode === "self_and_existing_player"
      ? !secondExistingPlayerTargetId
      : signupForMode === "self_and_guest"
      ? !secondGuestPlayerName.trim() || !looksLikeEmail(secondGuestPlayerEmail)
      : false;

  return (
    <div className="page match-signup-page">
      <section className="card signup-hero-card">
        <div className="signup-hero-compact">
          <div className="signup-hero-left">
            <div className="signup-player-avatar signup-player-avatar-hero">
              {photoData ? (
                <img
                  src={photoData}
                  alt={beneficiary.fullName}
                  className="signup-player-avatar-img"
                />
              ) : (
                <span className="signup-player-avatar-fallback">
                  {String(beneficiary.shortName || "P")
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
            </div>

            <div className="signup-hero-copy">
              <div className="signup-hero-title-row">
                <h2>Pay for next month games</h2>
              </div>

              <p className="muted signup-hero-subtext">
                Select every Wednesday available for the player you are signing up.
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

      <section className="card signup-summary-card">
        <div className="signup-reminder-choice">
          <label htmlFor="signupForMode">Who are you paying for?</label>
          <select
            id="signupForMode"
            value={signupForMode}
            onChange={(e) => {
              setSignupForMode(e.target.value);
              setExistingPlayerTargetId("");
              setGuestPlayerName("");
              setGuestPlayerEmail("");
              setSecondExistingPlayerTargetId("");
              setSecondGuestPlayerName("");
              setSecondGuestPlayerEmail("");
              setSelectedWeeks([]);
              setPaidWeeks([]);
              setSecondSelectedWeeks([]);
              setSecondPaidWeeks([]);
              setSelectionHydrated(false);
              setSecondSelectionHydrated(false);
            }}
          >
            <option value="self">Myself</option>
            <option value="existing_player">Another existing player</option>
            <option value="guest">A new player</option>
            <option value="self_and_existing_player">Myself and another existing player</option>
            <option value="self_and_guest">Myself and a new player</option>
          </select>
        </div>

        {signupForMode === "existing_player" ? (
          <div className="signup-reminder-choice">
            <select
              id="existingPlayerTargetId"
              value={existingPlayerTargetId}
              onChange={(e) => {
                setExistingPlayerTargetId(e.target.value);
                setSelectedWeeks([]);
                setPaidWeeks([]);
                setSelectionHydrated(false);
              }}
            >
              <option value="">Select player</option>
              {existingPlayerOptions.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.fullName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {signupForMode === "guest" ? (
          <>
            <div className="signup-reminder-choice">
              <input
                id="guestPlayerName"
                type="text"
                placeholder="Enter new player's name"
                value={guestPlayerName}
                onChange={(e) => {
                  setGuestPlayerName(e.target.value);
                  setSelectedWeeks([]);
                  setPaidWeeks([]);
                  setSelectionHydrated(false);
                }}
              />
            </div>
            <div className="signup-reminder-choice">
              <input
                id="guestPlayerEmail"
                type="email"
                placeholder="Enter new player's email"
                value={guestPlayerEmail}
                onChange={(e) => setGuestPlayerEmail(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {signupForMode === "self_and_existing_player" ? (
          <div className="signup-reminder-choice">
            <select
              id="secondExistingPlayerTargetId"
              value={secondExistingPlayerTargetId}
              onChange={(e) => {
                setSecondExistingPlayerTargetId(e.target.value);
                setSecondSelectedWeeks([]);
                setSecondPaidWeeks([]);
                setSecondSelectionHydrated(false);
              }}
            >
              <option value="">Select additional player</option>
              {existingPlayerOptions
                .filter((player) => String(player.id) !== String(payerUserId))
                .map((player) => (
                <option key={player.id} value={player.id}>
                  {player.fullName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {signupForMode === "self_and_guest" ? (
          <>
            <div className="signup-reminder-choice">
              <input
                id="secondGuestPlayerName"
                type="text"
                placeholder="Enter additional player's name"
                value={secondGuestPlayerName}
                onChange={(e) => {
                  setSecondGuestPlayerName(e.target.value);
                  setSecondSelectedWeeks([]);
                  setSecondPaidWeeks([]);
                  setSecondSelectionHydrated(false);
                }}
              />
            </div>
            <div className="signup-reminder-choice">
              <input
                id="secondGuestPlayerEmail"
                type="email"
                placeholder="Enter additional player's email"
                value={secondGuestPlayerEmail}
                onChange={(e) => setSecondGuestPlayerEmail(e.target.value)}
              />
            </div>
          </>
        ) : null}
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
              Wednesdays are highlighted. Tap a Wednesday to select or unselect it.
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
                const isPaid = paidWeeks.includes(cell.id);
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
                        isPaid ? "is-paid" : "",
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
                        if (!beneficiaryNeedsSelection && (!isFull || isSelected)) {
                          toggleWeek(linkedWeek);
                        }
                      }}
                      disabled={beneficiaryNeedsSelection || (isFull && !isSelected)}
                      style={{ transition: "none" }}
                    >
                      <span className="signup-calendar-day-number">
                        {cell.day}
                      </span>
                      <span className="signup-calendar-day-check">
                        {isPaid ? "✓" : isSelected ? "✓" : ""}
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
              reminders like weather reschedules, payment confirmations, and match
              updates.
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
              <h3>Leave signup?</h3>
              <button
                type="button"
                className="secondary-btn signup-calendar-close-btn"
                onClick={() => setShowLeavePrompt(false)}
              >
                ✕
              </button>
            </div>

            <p className="muted small signup-calendar-note">
              {isCombinedMode
                ? `${beneficiary.fullName} and ${
                    secondBeneficiary?.fullName || "the additional player"
                  } still have ${combinedWeeksToPayCount} unpaid week${
                    combinedWeeksToPayCount === 1 ? "" : "s"
                  } selected.`
                : `${beneficiary.fullName} still has ${weeksToPayNow.length} unpaid week${
                    weeksToPayNow.length === 1 ? "" : "s"
                  } selected.`}
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
                this time each day until payment is completed or weeks are removed.
              </p>
            </div>

            <div className="signup-leave-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={handlePayNow}
                disabled={
                  beneficiaryNeedsSelection ||
                  (isCombinedMode
                    ? combinedWeeksToPayCount === 0
                    : weeksToPayNow.length === 0)
                }
              >
                💳 Go to payment
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handlePaidSubmitted}
                disabled={
                  beneficiaryNeedsSelection ||
                  (isCombinedMode
                    ? combinedSelectedCount === 0
                    : selectedWeeks.length === 0)
                }
              >
                I’ve paid
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handlePayLater}
                disabled={beneficiaryNeedsSelection}
              >
                Pay later
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowLeavePrompt(false)}
              >
                Keep editing
              </button>
            </div>

            {!effectiveWhatsappNumber ? (
              <p className="muted small signup-leave-footnote">
                No WhatsApp number was found on your profile yet, so reminders will
                stay off until your number is available.
              </p>
            ) : null}

          </div>
        </div>
      )}

      <section className="card signup-grid-card">
        <div className="signup-grid-title-row">
          <h3>Pick your Wednesdays</h3>
          <div
            className={`signup-top-status ${
              selectedCount > 0 ? "is-active" : "is-idle"
            }`}
          >
            {signupStatusText}
            {saveStateText ? (
              <span style={{ marginLeft: 8, opacity: 0.8 }}>{saveStateText}</span>
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
              const isLastVisibleExpandableEmptyRow =
                player.isEmpty && rowIndex === lastVisibleRowIndex;

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
                          {(player.isCurrent || player.isSecondaryEditable) && (
                            <div className="matrix-player-tag">
                              {player.isCurrent
                                ? signupForMode === "self"
                                  ? "You"
                                  : signupForMode === "guest"
                                  ? "Guest"
                                  : "You"
                                : "Additional player"}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {weekMeta.map((week) => {
                    const signed = weekSelections[week.id]?.has(player.id);
                    const isEditableRow = player.isCurrent || player.isSecondaryEditable;
                    const isPaid = player.isSecondaryEditable
                      ? secondPaidWeeks.includes(week.id)
                      : paidWeeks.includes(week.id);
                    const status = week.status;

                    if (player.isEmpty) {
                      return (
                        <div
                          key={`${player.id}-${week.id}`}
                          className="matrix-view-cell matrix-empty-slot is-empty-row"
                          style={{ transition: "none" }}
                        >
                          <div className="matrix-view-inner">
                            <span className="matrix-pick-mark">
                              {isLastVisibleExpandableEmptyRow ? "+" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (isEditableRow) {
                      const canToggle =
                        !beneficiaryNeedsSelection &&
                        !isPaid &&
                        !(status.key === "full" && !signed);

                      return (
                        <button
                          key={`${player.id}-${week.id}`}
                          type="button"
                          className={[
                            "matrix-pick-cell",
                            "current-player-cell",
                            "is-current-row",
                            player.isSecondaryEditable ? "is-secondary-edit-row" : "",
                            `status-${status.key}`,
                            signed ? "is-selected is-signed" : "",
                            isPaid ? "is-paid" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            if (!canToggle) return;
                            if (player.isSecondaryEditable) {
                              toggleSecondWeek(week.id);
                              return;
                            }
                            toggleWeek(week);
                          }}
                          disabled={!canToggle}
                          style={{ transition: "none" }}
                        >
                          <div className="matrix-pick-inner">
                            <span className="matrix-pick-mark">
                              {isPaid ? "✓" : signed ? "✓" : ""}
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
                <img src={photoData} alt={beneficiary.fullName} />
              ) : (
                <span>
                  {String(beneficiary.shortName || "P")
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h3>Selection summary</h3>
              <p className="muted small">{beneficiary.fullName}</p>
            </div>
          </div>
        </div>

        <div className="signup-summary-rows">
          <div className="summary-row">
            <span>Selected match days</span>
            <strong>{isCombinedMode ? combinedSelectedCount : selectedWeeks.length}</strong>
          </div>

          <div className="summary-row">
            <span>Cost per game</span>
            <strong>R{COST_PER_GAME}</strong>
          </div>

          {isCombinedMode ? (
            <>
              <div className="summary-row">
                <span>{beneficiary.shortName}</span>
                <strong>{weeksToPayNow.length} to pay</strong>
              </div>
              <div className="summary-row">
                <span>{secondBeneficiary?.shortName || "Additional player"}</span>
                <strong>{secondWeeksToPayNow.length} to pay</strong>
              </div>
            </>
          ) : null}

          <div className="summary-row total">
            <span>Total due now</span>
            <div style={{ textAlign: "right" }}>
              <strong>R{totalAmount}</strong>
              <div className="muted small">
                ({isCombinedMode ? combinedWeeksToPayCount : weeksToPayNow.length} × R{COST_PER_GAME})
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="primary-btn signup-pay-btn"
          disabled={
            beneficiaryNeedsSelection ||
            (isCombinedMode
              ? combinedWeeksToPayCount === 0
              : weeksToPayNow.length === 0)
          }
          onClick={handlePayNow}
        >
          💳 Continue to payment
        </button>

        {((!isCombinedMode && weeksToPayNow.length === 0 && selectedWeeks.length > 0) ||
          (isCombinedMode &&
            combinedWeeksToPayCount === 0 &&
            combinedSelectedCount > 0)) ? (
          <p className="muted small" style={{ marginTop: 10 }}>
            All selected weeks are already paid.
          </p>
        ) : null}
      </section>
    </div>
  );
}