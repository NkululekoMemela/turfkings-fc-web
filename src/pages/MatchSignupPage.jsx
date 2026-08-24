// src/pages/MatchSignupPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  getClubDoc,
  getClubCollection,
  getClubStateDoc,
  getPlayersCollection,
  getPlayerPhotosCollection,
  getPendingSignupsCollection,
  getMatchSignupsCollection,
  getScopedPendingSignupsCollection,
  getScopedPendingSignupDoc,
  getScopedMatchSignupsCollection,
  getScopedMatchSignupDoc,
} from "../core/clubFirestorePaths";
import { CLUB_COLLECTIONS } from "../core/clubPaths";
import { showPremiumConfirm } from "../components/UI/PremiumConfirm";
import {
  cancelPaidMatchAndIssueCredit,
  listAvailablePlayerMatchCredits,
  listClubMatchCredits,
  redeemMatchCreditForMatch,
  returnRedeemedMatchTicketToWallet,
  MATCH_CREDIT_SOURCE,
  MATCH_CREDIT_STATUS,
} from "../core/payments/matchCreditsRepository";
import {
  cancelPracticePaidMatchAndIssueCredit,
  listAvailablePracticeMatchCredits,
  listPracticeMatchCredits,
  redeemPracticeMatchCreditForMatch,
  returnPracticeRedeemedMatchTicketToWallet,
} from "../core/payments/practiceMatchCreditsRepository";

const MIN_PLAYERS = 10;
const MAX_PLAYERS = 25;
const LEAGUE_PLAYERS = 15;
const DEFAULT_VISIBLE_SLOTS = 6;
const MAX_VISIBLE_ROWS_BEFORE_SCROLL = 5;
const COST_PER_GAME = 65;
const ADMIN_SETTINGS_CODE = "3333";
const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
const CHALLENGE_PLAYER_LIMIT_OPTIONS = [5, 6, 10, 12, 15];
const DEFAULT_MATCH_SIGNUP_SETTINGS = {
  weeklyDay: 3,
  weeklyStartTime: "18:00",
  weeklyPrice: COST_PER_GAME,
  challenge: {
    enabled: true,
    title: "Challenge",
    date: "2026-04-28",
    maxPlayers: 10,
    price: COST_PER_GAME,
  },
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

function uniqueWeekIds(values = []) {
  return Array.from(
    new Set(values.map((x) => String(x || "").trim()).filter(Boolean))
  ).sort();
}

function readSignupCache(key) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(`signup_cache__${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      selectedWeeks: Array.isArray(parsed?.selectedWeeks)
        ? parsed.selectedWeeks.filter(Boolean)
        : [],
      paidWeeks: Array.isArray(parsed?.paidWeeks)
        ? parsed.paidWeeks.filter(Boolean)
        : [],
      reminderPreference: String(parsed?.reminderPreference || "17:00"),
    };
  } catch (error) {
    console.warn("Signup cache read skipped:", error);
    return null;
  }
}

function writeSignupCache(key, payload) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.sessionStorage.setItem(
      `signup_cache__${key}`,
      JSON.stringify({
        selectedWeeks: uniqueWeekIds(payload?.selectedWeeks || []),
        paidWeeks: uniqueWeekIds(payload?.paidWeeks || []),
        reminderPreference: String(payload?.reminderPreference || "17:00"),
      })
    );
  } catch (error) {
    console.warn("Signup cache write skipped:", error);
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
  activeClubId = "turf-kings",
}) {
  const candidates = buildProfileDocCandidates({
    identity,
    currentUser,
    displayName,
    userId,
  });

  for (const candidate of candidates) {
    try {
      const snap = await getDoc(getClubDoc(db, candidate.collection, candidate.id, activeClubId));
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

function mergeMatchSignupSettings(raw = {}) {
  const defaultChallenge = DEFAULT_MATCH_SIGNUP_SETTINGS.challenge;
  const rawChallenge = raw?.challenge || {};

  const weeklyDay = Number(raw?.weeklyDay);
  const weeklyStartTimeRaw = String(
    raw?.weeklyStartTime || DEFAULT_MATCH_SIGNUP_SETTINGS.weeklyStartTime
  ).trim();
  const weeklyStartTime = /^([01]\\d|2[0-3]):[0-5]\\d$/.test(weeklyStartTimeRaw)
    ? weeklyStartTimeRaw
    : DEFAULT_MATCH_SIGNUP_SETTINGS.weeklyStartTime;
  const weeklyPrice = Number(raw?.weeklyPrice);
  const challengeMaxPlayers = Number(rawChallenge?.maxPlayers);
  const challengePrice = Number(rawChallenge?.price);

  return {
    weeklyDay: Number.isInteger(weeklyDay) && weeklyDay >= 0 && weeklyDay <= 6
      ? weeklyDay
      : DEFAULT_MATCH_SIGNUP_SETTINGS.weeklyDay,
    weeklyStartTime,
    weeklyPrice: Number.isFinite(weeklyPrice) && weeklyPrice > 0
      ? weeklyPrice
      : DEFAULT_MATCH_SIGNUP_SETTINGS.weeklyPrice,
    challenge: {
      enabled: typeof rawChallenge?.enabled === "boolean"
        ? rawChallenge.enabled
        : defaultChallenge.enabled,
      title: String(rawChallenge?.title || defaultChallenge.title || "Challenge").trim() || "Challenge",
      date: String(rawChallenge?.date || defaultChallenge.date || "").trim(),
      maxPlayers: CHALLENGE_PLAYER_LIMIT_OPTIONS.includes(challengeMaxPlayers)
        ? challengeMaxPlayers
        : defaultChallenge.maxPlayers,
      price: Number.isFinite(challengePrice) && challengePrice > 0
        ? challengePrice
        : defaultChallenge.price,
    },
  };
}

function buildDateId(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function getMatchStartTimeForWeek(
  week,
  settings = DEFAULT_MATCH_SIGNUP_SETTINGS
) {
  const fixture = week?.fixturePayload || {};

  const candidates = [
    fixture.kickoff,
    fixture.kickoffTime,
    fixture.startTime,
    fixture.time,
    week?.kickoff,
    week?.kickoffTime,
    settings?.weeklyStartTime,
    DEFAULT_MATCH_SIGNUP_SETTINGS.weeklyStartTime,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();

    const match = value.match(/(?:^|T)([01]\\d|2[0-3]):([0-5]\\d)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }

  return DEFAULT_MATCH_SIGNUP_SETTINGS.weeklyStartTime;
}

function buildMatchKickoffDate(
  week,
  settings = DEFAULT_MATCH_SIGNUP_SETTINGS
) {
  if (!(week?.date instanceof Date) || Number.isNaN(week.date.getTime())) {
    return null;
  }

  const startTime = getMatchStartTimeForWeek(week, settings);
  const [hoursText, minutesText] = startTime.split(":");

  const kickoff = new Date(
    week.date.getFullYear(),
    week.date.getMonth(),
    week.date.getDate(),
    Number(hoursText),
    Number(minutesText),
    0,
    0
  );

  return Number.isNaN(kickoff.getTime()) ? null : kickoff;
}

function getMatchCreditDeadline(
  week,
  settings = DEFAULT_MATCH_SIGNUP_SETTINGS
) {
  const kickoff = buildMatchKickoffDate(week, settings);
  if (!kickoff) return null;

  return new Date(kickoff.getTime() - 48 * 60 * 60 * 1000);
}

function isAutomaticMatchCreditCancellationEligible(
  week,
  settings = DEFAULT_MATCH_SIGNUP_SETTINGS,
  now = new Date()
) {
  const deadline = getMatchCreditDeadline(week, settings);
  if (!deadline) return false;

  return now.getTime() <= deadline.getTime();
}

function parseClubWeeklySchedule(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return null;

  const dayMap = {
    sunday: 0, sundays: 0,
    monday: 1, mondays: 1,
    tuesday: 2, tuesdays: 2,
    wednesday: 3, wednesdays: 3,
    thursday: 4, thursdays: 4,
    friday: 5, fridays: 5,
    saturday: 6, saturdays: 6,
  };

  const dayKey = Object.keys(dayMap).find((key) => raw.includes(key));
  const timeMatch = raw.match(/(\d{1,2})[:h](\d{2})/);

  if (!dayKey || !timeMatch) return null;

  const [, hourText, minuteText] = timeMatch;
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return {
    day: dayMap[dayKey],
    startTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function getWeekdayName(dayNumber) {
  return WEEKDAY_OPTIONS.find((item) => Number(item.value) === Number(dayNumber))?.label || "Wednesday";
}

function buildMatchDayFromDate(date, overrides = {}) {
  const id = overrides.id || buildDateId(date);
  const isChallenge = Boolean(overrides.isChallenge);
  const title = String(overrides.title || (isChallenge ? "Challenge" : "Match day")).trim();

  return {
    id,
    type: isChallenge ? "challenge" : "weekly",
    title,
    isChallenge,
    maxPlayers: Number(overrides.maxPlayers || MAX_PLAYERS),
    costPerGame: Number(overrides.costPerGame || COST_PER_GAME),
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
  };
}

function getPrimarySignupScopeMonth() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shouldShiftToNextMonth = today.getDate() >= 25;
  const targetYear = shouldShiftToNextMonth
    ? now.getMonth() === 11
      ? now.getFullYear() + 1
      : now.getFullYear()
    : now.getFullYear();
  const targetMonth = shouldShiftToNextMonth
    ? (now.getMonth() + 1) % 12
    : now.getMonth();

  return new Date(targetYear, targetMonth, 1).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "2-digit",
  });
}

function getMonthWednesdays({ visibleOnly = true, settings = DEFAULT_MATCH_SIGNUP_SETTINGS } = {}) {
  const mergedSettings = mergeMatchSignupSettings(settings);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shouldShiftToNextMonth = today.getDate() >= 25;

  const monthTargets = [];

  monthTargets.push({
    year: now.getFullYear(),
    month: now.getMonth(),
    includeOnlyFuture: visibleOnly,
  });

  if (shouldShiftToNextMonth) {
    monthTargets.push({
      year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(),
      month: (now.getMonth() + 1) % 12,
      includeOnlyFuture: false,
    });
  }

  const byId = new Map();

  monthTargets.forEach(({ year, month, includeOnlyFuture }) => {
    const d = new Date(year, month, 1);

    while (d.getMonth() === month) {
      const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const isTargetWeekday = candidate.getDay() === Number(mergedSettings.weeklyDay);
      const shouldInclude = includeOnlyFuture ? candidate >= today : true;

      if (isTargetWeekday && shouldInclude) {
        const matchDay = buildMatchDayFromDate(candidate, {
          type: "weekly",
          title: getWeekdayName(mergedSettings.weeklyDay),
          maxPlayers: MAX_PLAYERS,
          costPerGame: mergedSettings.weeklyPrice,
        });
        byId.set(matchDay.id, matchDay);
      }

      d.setDate(d.getDate() + 1);
    }
  });

  const challenge = mergedSettings.challenge || {};
  if (challenge.enabled && challenge.date) {
    const challengeDate = new Date(`${challenge.date}T12:00:00`);
    if (!Number.isNaN(challengeDate.getTime())) {
      const shouldIncludeChallenge = visibleOnly
        ? challengeDate >= today
        : true;

      if (shouldIncludeChallenge) {
        const challengeMatchDay = buildMatchDayFromDate(challengeDate, {
          id: challenge.date,
          isChallenge: true,
          title: challenge.title || "Challenge",
          maxPlayers: challenge.maxPlayers,
          costPerGame: challenge.price,
        });
        byId.set(challengeMatchDay.id, challengeMatchDay);
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.date - b.date);
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

function getCalendarMonthsData(weeks = []) {
  const safeWeeks = Array.isArray(weeks) ? weeks : [];
  const monthKeys = [];

  safeWeeks.forEach((week) => {
    if (!(week?.date instanceof Date)) return;
    const key = `${week.date.getFullYear()}-${String(week.date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthKeys.includes(key)) monthKeys.push(key);
  });

  if (!monthKeys.length) return [getCalendarMonthData([])];

  return monthKeys.map((key) => {
    const [yearRaw, monthRaw] = key.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw) - 1;

    return getCalendarMonthData([
      {
        date: new Date(year, month, 1),
      },
    ]);
  });
}

function getStatus(count, maxPlayers = MAX_PLAYERS, isChallenge = false) {
  const cap = Number(maxPlayers || MAX_PLAYERS);
  if (count >= cap) {
    return { key: "full", label: "Full", shortLabel: "Full" };
  }
  if (isChallenge) {
    return { key: "challenge", label: "Challenge", shortLabel: "Challenge" };
  }
  if (count >= LEAGUE_PLAYERS) {
    return { key: "league", label: "League", shortLabel: "League" };
  }
  if (count >= MIN_PLAYERS) {
    return { key: "viable", label: "Game on", shortLabel: "Game on" };
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

function statusFromWeekState(selectedWeeks, paidWeeks) {
  const selected = uniqueWeekIds(selectedWeeks);
  const paid = uniqueWeekIds(paidWeeks);
  if (selected.length === 0) return "not_selected";
  const unpaid = selected.filter((weekId) => !paid.includes(weekId));
  return unpaid.length === 0 ? "paid" : "pending";
}

export default function MatchSignupPage({
  identity,
  activeRole = "",
  currentUser,
  teams = [],
  activeSeasonId,
  selectedTeamName = "",
  currentTeamName = "",
  activeClubId = "turf-kings",
  activeClub = null,
  isPracticeMode = false,
  practiceSessionId = null,
  dataScope = null,
  onBack,
  onProceedToPayment,
}) {
  const activeClubName = String(activeClub?.name || activeClub?.clubName || activeClubId || "This club").trim();

  const clubWeeklyScheduleText = String(
    activeClub?.weeklyPlayTime ||
    activeClub?.schedule?.weeklyPlayTime ||
    activeClub?.schedule?.playTime ||
    activeClub?.playTime ||
    ""
  ).trim();

  const clubWeeklySchedule = useMemo(
    () => parseClubWeeklySchedule(clubWeeklyScheduleText),
    [clubWeeklyScheduleText]
  );

  const pendingSignupsCollectionRef = () =>
    isPracticeMode
      ? getScopedPendingSignupsCollection(db, dataScope)
      : getPendingSignupsCollection(db, activeClubId);

  const matchSignupsCollectionRef = () =>
    isPracticeMode
      ? getScopedMatchSignupsCollection(db, dataScope)
      : getMatchSignupsCollection(db, activeClubId);

  const pendingSignupDocRef = (docId) =>
    isPracticeMode
      ? getScopedPendingSignupDoc(db, docId, dataScope)
      : getClubDoc(
          db,
          CLUB_COLLECTIONS.pendingSignups,
          docId,
          activeClubId
        );

  const matchSignupDocRef = (docId) =>
    isPracticeMode
      ? getScopedMatchSignupDoc(db, docId, dataScope)
      : getClubDoc(
          db,
          CLUB_COLLECTIONS.matchSignups,
          docId,
          activeClubId
        );
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === "undefined") return 390;
    return window.innerWidth;
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [calendarMonthPage, setCalendarMonthPage] = useState(0);
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
  const [existingPlayerSearch, setExistingPlayerSearch] = useState("");
  const [guestPlayerName, setGuestPlayerName] = useState("");

  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [paidWeeks, setPaidWeeks] = useState([]);

  const [availableMatchCredits, setAvailableMatchCredits] = useState([]);
  const [clubMatchCredits, setClubMatchCredits] = useState([]);
  const [matchCreditsLoading, setMatchCreditsLoading] = useState(false);
  const [matchCreditBusyWeekId, setMatchCreditBusyWeekId] = useState("");
  const [matchCreditMessage, setMatchCreditMessage] = useState("");

  const [showMatchTicketWallet, setShowMatchTicketWallet] = useState(false);
  const [matchTicketWalletMode, setMatchTicketWalletMode] = useState("menu");
  const [matchTicketBusy, setMatchTicketBusy] = useState(false);
  const [matchTicketMinimized, setMatchTicketMinimized] = useState(false);
  const [directoryPlayers, setDirectoryPlayers] = useState([]);
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
  const [adminCleanupTargetId, setAdminCleanupTargetId] = useState("");
  const [adminCleanupBusy, setAdminCleanupBusy] = useState(false);
  const [adminCleanupMessage, setAdminCleanupMessage] = useState("");
  const [adminCleanupError, setAdminCleanupError] = useState("");
  const [adminVerifyWeeks, setAdminVerifyWeeks] = useState([]);
  const [adminRemovePaidWeeks, setAdminRemovePaidWeeks] = useState([]);
  const [adminAddPaidWeeks, setAdminAddPaidWeeks] = useState([]);
  const [adminVerifyBusy, setAdminVerifyBusy] = useState(false);
  const [showAdminCleanupPanel, setShowAdminCleanupPanel] = useState(false);

  const [showBulkPaidModal, setShowBulkPaidModal] = useState(false);
  const [bulkPaidSelectedPlayerIds, setBulkPaidSelectedPlayerIds] = useState([]);
  const [bulkPaidBusy, setBulkPaidBusy] = useState(false);
  const [bulkPaidMessage, setBulkPaidMessage] = useState("");
  const [bulkPaidError, setBulkPaidError] = useState("");
  const [matchSignupSettings, setMatchSignupSettings] = useState(DEFAULT_MATCH_SIGNUP_SETTINGS);

  const effectiveMatchSignupSettings = useMemo(
    () => ({
      ...matchSignupSettings,
      weeklyDay:
        clubWeeklySchedule?.day ??
        matchSignupSettings.weeklyDay,
      weeklyStartTime:
        clubWeeklySchedule?.startTime ||
        matchSignupSettings.weeklyStartTime ||
        DEFAULT_MATCH_SIGNUP_SETTINGS.weeklyStartTime,
    }),
    [matchSignupSettings, clubWeeklySchedule]
  );

  const [sharedChallengeFixtures, setSharedChallengeFixtures] = useState([]);
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

  useEffect(() => {
    const ref = getClubDoc(db, "state", "matchSignupSettings", activeClubId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setMatchSignupSettings(DEFAULT_MATCH_SIGNUP_SETTINGS);
          return;
        }
        setMatchSignupSettings(mergeMatchSignupSettings(snap.data() || {}));
      },
      (error) => {
        console.error("Failed to subscribe to match signup settings:", error);
        setMatchSignupSettings(DEFAULT_MATCH_SIGNUP_SETTINGS);
      }
    );

    return () => unsubscribe();
  }, [activeClubId]);

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



  useEffect(() => {
    if (!activeClubId) {
      setSharedChallengeFixtures([]);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "fixtures")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fixtures = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() || {};

            return {
              fixtureId: docSnap.id,
              ...data,
            };
          })
          .filter((fixture) => {
            return (
              fixture?.source === "club_challenge" &&
              fixture?.status !== "cancelled"
            );
          });

        setSharedChallengeFixtures(fixtures);
      },
      (error) => {
        console.error("Failed to subscribe to shared fixtures:", error);
      }
    );

    return () => unsub();
  }, [activeClubId]);


  const allMonthWeeks = useMemo(() => {
    const generatedWeeks = getMonthWednesdays({
      visibleOnly: false,
      settings: effectiveMatchSignupSettings,
    });

    const byId = new Map();

    generatedWeeks.forEach((week) => {
      byId.set(week.id, week);
    });

    sharedChallengeFixtures.forEach((fixture) => {
      const dateText =
        fixture?.proposedDate ||
        fixture?.date ||
        "";

      if (!dateText) return;

      const fixtureDate = new Date(`${dateText}T12:00:00`);
      if (Number.isNaN(fixtureDate.getTime())) return;

      const fixtureId =
        fixture.fixtureId ||
        fixture.challengeId ||
        buildDateId(fixtureDate);

      const opponentName =
        fixture.opponentName ||
        fixture.awayClubName ||
        fixture.homeClubName ||
        "Challenge";

      const challengeWeek = buildMatchDayFromDate(fixtureDate, {
        id: fixtureId,
        isChallenge: true,
        title: `${opponentName} (${String(fixture.format || "5v5").toUpperCase()})`,
        maxPlayers:
          Number(fixture.maxPlayers || matchSignupSettings.challenge.maxPlayers || MAX_PLAYERS),
        costPerGame:
          Number(fixture.price || matchSignupSettings.challenge.price || COST_PER_GAME),
      });

      challengeWeek.fixtureSource = "shared_club_fixture";
      challengeWeek.fixtureId = fixtureId;
      challengeWeek.opponentName = opponentName;
      challengeWeek.fixturePayload = fixture;

      byId.set(challengeWeek.id, challengeWeek);
    });

    return Array.from(byId.values()).sort((a, b) => a.date - b.date);
  }, [effectiveMatchSignupSettings, sharedChallengeFixtures]);
  const weeks = useMemo(() => {
    const today = new Date();

    return allMonthWeeks.filter((week) => {
      return week?.date instanceof Date && week.date >= new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
    });
  }, [allMonthWeeks]);

  /*
    Visible/payable cycle:
    - remaining current-month fixtures
    - the Challenge fixture, if active and upcoming
    - next-month fixtures once we are in advance-payment mode

    Older weeks remain in Firestore history, but they are intentionally excluded
    from the live payment grid, admin verification buttons, and "weeks paid"
    counters so the admin panel does not become crowded over time.
  */
  const visibleWeekIds = useMemo(
    () => new Set(weeks.map((week) => week.id)),
    [weeks]
  );

  const calendarMonthData = useMemo(
    () => getCalendarMonthData(allMonthWeeks),
    [allMonthWeeks]
  );

  const calendarMonthsData = useMemo(
    () => getCalendarMonthsData(allMonthWeeks),
    [allMonthWeeks]
  );

  const activeCalendarMonthData =
    calendarMonthsData[Math.min(calendarMonthPage, Math.max(calendarMonthsData.length - 1, 0))] ||
    calendarMonthsData[0] ||
    calendarMonthData;

  useEffect(() => {
    setCalendarMonthPage((prev) =>
      Math.min(prev, Math.max(calendarMonthsData.length - 1, 0))
    );
  }, [calendarMonthsData.length]);

  const calendarMonthKey = useMemo(() => getPrimarySignupScopeMonth(), [weeks]);

  const phoneNumber = getPhoneFromIdentity(identity, currentUser);
  const effectiveWhatsappNumber = normalizeWhatsAppNumber(
    profileWhatsappNumber || phoneNumber || whatsAppInput
  );
  const resolvedSeasonId = activeSeasonId || FALLBACK_SEASON_ID;
  const signupType = DEFAULT_SIGNUP_TYPE;
  const signupScopeId = calendarMonthKey || resolvedSeasonId;
  const signupScopeLabel = calendarMonthData?.monthLabel || "Monthly signup";

  useEffect(() => {
    let cancelled = false;

    async function loadProfileTarget() {
      const resolved = await resolveProfileDocTarget({
        identity,
        currentUser,
        displayName,
        userId: payerUserId,
        activeClubId,
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

      if (
        !isPracticeMode &&
        !savedNumber &&
        !skipWhatsAppPromptThisSession
      ) {
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
    isPracticeMode,
  ]);

  async function handleSaveWhatsAppNumber() {
    if (isPracticeMode) {
      setShowWhatsAppPrompt(false);
      setWhatsAppInputError("");
      return;
    }

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
        getClubDoc(db, profileTarget.collection, profileTarget.id, activeClubId),
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
        const snap = await getDocs(getPlayerPhotosCollection(db, activeClubId));
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

    async function loadPlayersDirectory() {
      try {
        const snap = await getDocs(getPlayersCollection(db, activeClubId));
        if (cancelled) return;

        const nextPlayers = [];

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const fullName = toTitleCaseLoose(
            data?.fullName ||
              data?.displayName ||
              data?.name ||
              data?.playerName ||
              data?.shortName ||
              ""
          );

          const playerId = String(
            data?.playerId ||
              data?.memberId ||
              data?.uid ||
              data?.id ||
              docSnap.id ||
              ""
          ).trim();

          if (!fullName || !playerId) return;

          nextPlayers.push({
            id: playerId,
            docId: docSnap.id,
            fullName,
            shortName: toTitleCaseLoose(
              data?.shortName || firstNameOf(fullName) || fullName
            ),
          });
        });

        console.table(
          nextPlayers.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            shortName: p.shortName,
          }))
        );

        setDirectoryPlayers(nextPlayers);
      } catch (error) {
        console.error("Failed to load players directory in MatchSignupPage:", error);
        if (!cancelled) setDirectoryPlayers([]);
      }
    }

    loadPlayersDirectory();

    return () => {
      cancelled = true;
    };
  }, []);

  const existingPlayerOptions = useMemo(() => {
    const byKey = new Map();
    const byName = new Set();

    const addOption = (candidate) => {
      const id = String(candidate?.id || candidate?.playerId || candidate?.memberId || candidate?.uid || "").trim();
      const fullName = toTitleCaseLoose(
        candidate?.fullName ||
          candidate?.playerName ||
          candidate?.displayName ||
          candidate?.name ||
          candidate?.shortName ||
          ""
      );
      const short = toTitleCaseLoose(candidate?.shortName || firstNameOf(fullName) || fullName);
      if (!id || !fullName) return;

      const normalizedName = normKey(fullName);
      if (byKey.has(id) || byName.has(normalizedName)) return;

      byKey.set(id, {
        id,
        fullName,
        shortName: short || fullName,
      });
      byName.add(normalizedName);
    };

    directoryPlayers.forEach(addOption);

    addOption({
      id: payerUserId,
      fullName: displayName,
      shortName,
    });

    return Array.from(byKey.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }, [directoryPlayers, payerUserId, displayName, shortName]);

  useEffect(() => {
    if (signupForMode === "guest") {
      setSignupForMode("self");
      setGuestPlayerName("");
      setSelectedWeeks([]);
      setPaidWeeks([]);
      setSelectionHydrated(false);
    }
  }, [signupForMode]);

  const beneficiary = useMemo(() => {
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

  useEffect(() => {
    let cancelled = false;

    async function loadMatchCredits() {
      if (
        !activeClubId ||
        !beneficiary?.playerId ||
        beneficiary?.isGuest
      ) {
        setAvailableMatchCredits([]);
        setClubMatchCredits([]);
        return;
      }

      try {
        setMatchCreditsLoading(true);

        const [credits, clubCredits] = await Promise.all([
          isPracticeMode
            ? listAvailablePracticeMatchCredits({
                dataScope,
                playerId: beneficiary.playerId,
              })
            : listAvailablePlayerMatchCredits({
                clubId: activeClubId,
                playerId: beneficiary.playerId,
              }),
          isPracticeMode
            ? listPracticeMatchCredits({
                dataScope,
              })
            : listClubMatchCredits({
                clubId: activeClubId,
              }),
        ]);

        if (!cancelled) {
          setAvailableMatchCredits(credits);
          setClubMatchCredits(clubCredits);
        }
      } catch (error) {
        console.error("Failed to load Match Tickets:", error);
        if (!cancelled) {
          setAvailableMatchCredits([]);
        }
      } finally {
        if (!cancelled) {
          setMatchCreditsLoading(false);
        }
      }
    }

    loadMatchCredits();

    return () => {
      cancelled = true;
    };
  }, [
    activeClubId,
    beneficiary?.playerId,
    beneficiary?.isGuest,
    isPracticeMode,
    dataScope,
  ]);

  const currentUserDocKey = useMemo(
    () => beneficiary.stableKey,
    [beneficiary.stableKey]
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
        const mainRef = getClubStateDoc(db, activeClubId);
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

        const seasonSnaps = await getDocs(getClubCollection(db, CLUB_COLLECTIONS.seasons, activeClubId));
        if (cancelled) return;

        const rows = [];
        await Promise.all(
          seasonSnaps.docs.map(async (seasonDoc) => {
            try {
              const attendanceSnap = await getDocs(
                collection(db, "clubs", activeClubId, "seasons", seasonDoc.id, "attendance")
              );
              attendanceSnap.forEach((docSnap) =>
                rows.push({
                  seasonId: seasonDoc.id,
                  ...(docSnap.data() || {}),
                })
              );
            } catch (error) {
              console.warn(
                "Attendance fallback skipped for season:",
                seasonDoc.id,
                error
              );
            }
          })
        );

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
    const cached = readSignupCache(pendingId);
    if (cached) {
      setSelectedWeeks(
        cached.selectedWeeks.filter((weekId) => visibleWeekIds.has(weekId))
      );
      setPaidWeeks(
        cached.paidWeeks.filter((weekId) => visibleWeekIds.has(weekId))
      );
      if (cached.reminderPreference) {
        setReminderPreference(cached.reminderPreference);
      }
      setPendingSelectionsSaved(cached.selectedWeeks.length > 0);
    }
  }, [pendingId, visibleWeekIds]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateBeneficiarySelection() {
      try {
        setSelectionHydrated(false);
        setMatchSignupStateLoaded(false);

        const [pendingSnap, matchSignupSnap] = await Promise.all([
          getDoc(pendingSignupDocRef(pendingId)),
          getDoc(matchSignupDocRef(pendingId)),
        ]);

        if (cancelled) return;

        const pendingData = pendingSnap.exists() ? pendingSnap.data() || {} : {};
        const matchSignupData = matchSignupSnap.exists()
          ? matchSignupSnap.data() || {}
          : {};

        const pendingSelectedWeeks = Array.isArray(pendingData.selectedWeeks)
          ? pendingData.selectedWeeks.filter((weekId) =>
              visibleWeekIds.has(weekId)
            )
          : [];

        const pendingPaidWeeks = Array.isArray(pendingData.paidWeeks)
          ? pendingData.paidWeeks.filter((weekId) =>
              visibleWeekIds.has(weekId)
            )
          : [];

        const matchSelectedWeeks = Array.isArray(matchSignupData.selectedWeeks)
          ? matchSignupData.selectedWeeks.filter((weekId) =>
              visibleWeekIds.has(weekId)
            )
          : [];

        const matchPaidWeeks = Array.isArray(
          matchSignupData.paidWeeks || matchSignupData.primaryPaidWeeks
        )
          ? (matchSignupData.paidWeeks || matchSignupData.primaryPaidWeeks).filter(
              (weekId) => visibleWeekIds.has(weekId)
            )
          : [];

        const nextSelectedWeeks = uniqueWeekIds([
          ...pendingSelectedWeeks,
          ...matchSelectedWeeks,
        ]);

        const nextPaidWeeks = uniqueWeekIds([
          ...pendingPaidWeeks,
          ...matchPaidWeeks,
        ]);

        setSelectedWeeks(nextSelectedWeeks);
        setPaidWeeks(nextPaidWeeks);

        if (
          pendingData.reminderPreference &&
          String(pendingData.reminderPreference) !== String(reminderPreference)
        ) {
          setReminderPreference(String(pendingData.reminderPreference));
        }

        setPendingSelectionsSaved(nextSelectedWeeks.length > 0);
        writeSignupCache(pendingId, {
          selectedWeeks: nextSelectedWeeks,
          paidWeeks: nextPaidWeeks,
          reminderPreference:
            pendingData.reminderPreference || reminderPreference,
        });
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
  }, [pendingId, visibleWeekIds, reminderPreference]);

  useEffect(() => {
    writeSignupCache(pendingId, {
      selectedWeeks,
      paidWeeks,
      reminderPreference,
    });
  }, [pendingId, selectedWeeks, paidWeeks, reminderPreference]);

  useEffect(() => {
    let latestPendingDocs = [];
    let latestMatchSignupDocs = [];

    const rebuildLiveSignupState = () => {
      const combinedByDocId = new Map();

      const addRecord = ({ docId, data, source }) => {
        if (!docId) return;

        const previous = combinedByDocId.get(docId) || {};
        combinedByDocId.set(docId, {
          ...previous,
          ...(data || {}),
          docId,
          sourceCollections: uniqueStrings([
            ...(previous.sourceCollections || []),
            source,
          ]),
        });
      };

      latestPendingDocs.forEach((item) =>
        addRecord({
          docId: item.docId,
          data: item.data,
          source: "pendingSignups",
        })
      );

      latestMatchSignupDocs.forEach((item) =>
        addRecord({
          docId: item.docId,
          data: item.data,
          source: "matchSignups",
        })
      );

      const nextWeekKeys = {};
      const nextPlayerWeeks = {};
      const nextCommittedUsers = [];

      Array.from(combinedByDocId.values()).forEach((data) => {
        const selectedFromRecord = Array.isArray(data.selectedWeeks)
          ? data.selectedWeeks
          : [];

        const paidFromRecord = Array.isArray(data.paidWeeks || data.primaryPaidWeeks)
          ? data.paidWeeks || data.primaryPaidWeeks
          : [];

        const weeksForDoc = selectedFromRecord.filter((weekId) =>
          visibleWeekIds.has(weekId)
        );

        const paidWeeksForDoc = paidFromRecord.filter((weekId) =>
          visibleWeekIds.has(weekId)
        );

        const sameScope =
          String(data.monthKey || data.signupScopeId || "") ===
          String(calendarMonthKey || signupScopeId);

        /*
          Keep both:
          1) normal pendingSignups records,
          2) matchSignups records created when a player reached payment flow.
          This makes May/Yoco-failed payments visible for manual verification.
        */
        if (!sameScope && weeksForDoc.length === 0 && paidWeeksForDoc.length === 0) {
          return;
        }

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

        if (weeksForDoc.length > 0 || paidWeeksForDoc.length > 0) {
          const unpaidWeeks = weeksForDoc.filter(
            (weekId) => !paidWeeksForDoc.includes(weekId)
          );

          nextCommittedUsers.push({
            docId: data.docId,
            stableKey: beneficiaryStableKey,
            userId: beneficiaryId,
            fullName: beneficiaryName,
            shortName: beneficiaryShortName,
            beneficiaryType: data.beneficiaryType || "self",
            paymentStatus:
              data.paymentStatus ||
              (unpaidWeeks.length === 0 ? "paid" : "pending"),
            unpaidWeeks,
            paidWeeks: paidWeeksForDoc,
            selectedWeeks: weeksForDoc,
            amountDueNow:
              Number(data.totalAmount || data.amountDueNow || data.amountDue || 0) ||
              sumWeekCosts(unpaidWeeks),
            sourceCollections: data.sourceCollections || [],
            rawData: data,
          });
        }
      });

      setLiveWeekKeys(nextWeekKeys);
      setLivePlayerWeeks(nextPlayerWeeks);
      setLiveCommittedUsers(nextCommittedUsers);
    };

    const pendingQuery = query(pendingSignupsCollectionRef());
    const matchSignupQuery = query(matchSignupsCollectionRef());

    const unsubscribePending = onSnapshot(
      pendingQuery,
      (snapshot) => {
        latestPendingDocs = snapshot.docs.map((docSnap) => ({
          docId: docSnap.id,
          data: docSnap.data() || {},
        }));
        rebuildLiveSignupState();
      },
      (error) => {
        console.error("Failed to subscribe to pending signups:", error);
      }
    );

    const unsubscribeMatchSignups = onSnapshot(
      matchSignupQuery,
      (snapshot) => {
        latestMatchSignupDocs = snapshot.docs.map((docSnap) => ({
          docId: docSnap.id,
          data: docSnap.data() || {},
        }));
        rebuildLiveSignupState();
      },
      (error) => {
        console.error("Failed to subscribe to match signups:", error);
      }
    );

    return () => {
      unsubscribePending();
      unsubscribeMatchSignups();
    };
  }, [calendarMonthKey, signupScopeId, weeks, visibleWeekIds]);

  const paidWeekSet = useMemo(() => new Set(paidWeeks), [paidWeeks]);

  const currentBeneficiaryLiveRecords = useMemo(() => {
    const targetStableKey = normKey(beneficiary.stableKey);
    const targetPlayerId = normKey(beneficiary.playerId);
    const targetName = normKey(beneficiary.fullName || beneficiary.shortName);

    return liveCommittedUsers.filter((user) => {
      const userStableKey = normKey(user?.stableKey);
      const userId = normKey(user?.userId);
      const userName = normKey(user?.fullName || user?.shortName);

      if (targetStableKey && userStableKey && targetStableKey === userStableKey) return true;
      if (targetPlayerId && userId && targetPlayerId === userId) return true;
      return Boolean(targetName) && Boolean(userName) && targetName === userName;
    });
  }, [liveCommittedUsers, beneficiary.stableKey, beneficiary.playerId, beneficiary.fullName, beneficiary.shortName]);

  const liveSelectedWeeksForCurrent = useMemo(
    () =>
      uniqueWeekIds(
        currentBeneficiaryLiveRecords.flatMap((user) =>
          Array.isArray(user?.selectedWeeks) ? user.selectedWeeks : []
        )
      ),
    [currentBeneficiaryLiveRecords]
  );

  const livePaidWeeksForCurrent = useMemo(
    () =>
      uniqueWeekIds(
        currentBeneficiaryLiveRecords.flatMap((user) =>
          Array.isArray(user?.paidWeeks) ? user.paidWeeks : []
        )
      ),
    [currentBeneficiaryLiveRecords]
  );

  const effectiveSelectedWeeks = useMemo(
    () => uniqueWeekIds([...selectedWeeks, ...liveSelectedWeeksForCurrent]),
    [selectedWeeks, liveSelectedWeeksForCurrent]
  );

  const effectivePaidWeeks = useMemo(
    () => uniqueWeekIds([...paidWeeks, ...livePaidWeeksForCurrent]),
    [paidWeeks, livePaidWeeksForCurrent]
  );

  const effectivePaidWeekSet = useMemo(
    () => new Set(effectivePaidWeeks),
    [effectivePaidWeeks]
  );

  const paidWeeksFromAllKnownRecords = useMemo(
    () =>
      uniqueWeekIds([
        ...effectivePaidWeeks,
        ...currentBeneficiaryLiveRecords.flatMap((user) => {
          const rawPaidWeeks = user?.rawData?.paidWeeks || user?.rawData?.primaryPaidWeeks;
          if (Array.isArray(rawPaidWeeks)) return rawPaidWeeks;
          if (Array.isArray(user?.paidWeeks)) return user.paidWeeks;
          return [];
        }),
      ]),
    [effectivePaidWeeks, currentBeneficiaryLiveRecords]
  );

  const visiblePaidWeeks = useMemo(
    () => effectivePaidWeeks.filter((weekId) => visibleWeekIds.has(weekId)),
    [effectivePaidWeeks, visibleWeekIds]
  );

  const upcomingMonthPaymentSummary = useMemo(() => {
    const regularWeeks = allMonthWeeks.filter((week) => !week?.isChallenge);
    if (!regularWeeks.length) {
      return {
        label: "Upcoming month",
        paidCount: 0,
        totalCount: 0,
      };
    }

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const monthMap = new Map();
    regularWeeks.forEach((week) => {
      if (!(week?.date instanceof Date)) return;
      const key = `${week.date.getFullYear()}-${String(week.date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          key,
          date: new Date(week.date.getFullYear(), week.date.getMonth(), 1),
          weeks: [],
        });
      }
      monthMap.get(key).weeks.push(week);
    });

    const orderedMonths = Array.from(monthMap.values()).sort(
      (a, b) => a.date - b.date
    );

    const futureMonth =
      orderedMonths.find((item) => item.key > currentMonthKey) ||
      orderedMonths[orderedMonths.length - 1];

    const paidSet = new Set(paidWeeksFromAllKnownRecords);
    const paidCount = futureMonth.weeks.filter((week) => paidSet.has(week.id)).length;

    return {
      label: futureMonth.date.toLocaleDateString("en-ZA", {
        month: "long",
        year: "numeric",
      }),
      paidCount,
      totalCount: futureMonth.weeks.length,
    };
  }, [allMonthWeeks, paidWeeksFromAllKnownRecords]);

  const specialEventPaymentSummary = useMemo(() => {
    const challengeWeeks = allMonthWeeks.filter((week) => week?.isChallenge);
    const paidSet = new Set(paidWeeksFromAllKnownRecords);
    const paidCount = challengeWeeks.filter((week) => paidSet.has(week.id)).length;

    return {
      totalCount: challengeWeeks.length,
      paidCount,
      hasPaid: paidCount > 0,
    };
  }, [allMonthWeeks, paidWeeksFromAllKnownRecords]);

  const weekById = useMemo(() => {
    const map = new Map();
    allMonthWeeks.forEach((week) => map.set(week.id, week));
    weeks.forEach((week) => map.set(week.id, week));
    return map;
  }, [allMonthWeeks, weeks]);

  const getCostForWeekId = (weekId) => Number(weekById.get(weekId)?.costPerGame || matchSignupSettings.weeklyPrice || COST_PER_GAME);

  const sumWeekCosts = (weekIds = []) =>
    uniqueWeekIds(weekIds).reduce((sum, weekId) => sum + getCostForWeekId(weekId), 0);

  const selectedEventDetails = useMemo(
    () =>
      selectedWeeks.map((weekId) => {
        const week = weekById.get(weekId);
        return {
          id: weekId,
          title:
            week?.isChallenge && week?.opponentName
              ? `⚔️ ${week.opponentName}`
              : week?.title || "Match day",
          type: week?.type || "weekly",
          isChallenge: Boolean(week?.isChallenge),
          dateLabel: week?.label || weekId,
          costPerGame: getCostForWeekId(weekId),
        };
      }),
    [selectedWeeks, weekById, matchSignupSettings]
  );

  const eventPrices = useMemo(() => {
    const out = {};
    selectedWeeks.forEach((weekId) => {
      out[weekId] = getCostForWeekId(weekId);
    });
    return out;
  }, [selectedWeeks, weekById, matchSignupSettings]);

  const weeksToPayNow = useMemo(
    () => effectiveSelectedWeeks.filter((weekId) => !effectivePaidWeekSet.has(weekId)),
    [effectiveSelectedWeeks, effectivePaidWeekSet]
  );

  const isFullyPaidSelection =
    effectiveSelectedWeeks.length > 0 && weeksToPayNow.length === 0;

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

  const resolvedCurrentTeamName = useMemo(() => {
    const identityTeamName = String(
      identity?.selectedTeamName ||
        identity?.currentTeamName ||
        identity?.teamName ||
        identity?.team ||
        ""
    ).trim();

    return (
      String(selectedTeamName || "").trim() ||
      String(currentTeamName || "").trim() ||
      identityTeamName ||
      String(currentTeam?.name || currentTeam?.teamName || currentTeam?.label || "").trim() ||
      "—"
    );
  }, [selectedTeamName, currentTeamName, identity, currentTeam]);

  const allRows = useMemo(() => {
    const rowsFromCommittedUsers = liveCommittedUsers.map((user, index) => ({
      id: user.userId || `${slugFromLooseName(user.fullName)}_${index}`,
      uid: user.userId || "",
      playerId: user.userId || "",
      memberId: user.userId || "",
      fullName: user.fullName,
      shortName: user.shortName || firstNameOf(user.fullName),
      stableKey: user.stableKey,
      isCurrent:
        normKey(user.stableKey) === normKey(beneficiary.stableKey) ||
        (
          user.userId &&
          beneficiary.playerId &&
          normKey(user.userId) === normKey(beneficiary.playerId)
        ),
      isEmpty: false,
      isWithdrawnHistoryOnly: false,
    }));

    /*
     * Only individual player withdrawals belong in the matrix withdrawal
     * history. A whole-match admin/weather cancellation is NOT a player
     * withdrawal and therefore must not paint everybody purple.
     */
    const withdrawalSources = new Set([
      MATCH_CREDIT_SOURCE.PLAYER_EARLY_CANCELLATION,
      MATCH_CREDIT_SOURCE.ADMIN_EXCEPTION,
    ]);

    const withdrawnRows = clubMatchCredits
      .filter((credit) => withdrawalSources.has(credit?.sourceType))
      .filter((credit) =>
        visibleWeekIds.has(String(credit?.sourceWeekId || "").trim())
      )
      .map((credit, index) => {
        const playerId = String(credit?.playerId || "").trim();
        const fullName = toTitleCaseLoose(
          credit?.playerName || "Player"
        );

        return {
          id:
            playerId ||
            `withdrawn_${slugFromLooseName(fullName)}_${index}`,
          uid: playerId,
          playerId,
          memberId: playerId,
          fullName,
          shortName: firstNameOf(fullName) || fullName,
          stableKey:
            playerId
              ? `uid:${normKey(playerId)}`
              : `withdrawn:${normKey(fullName)}`,
          isCurrent:
            (
              playerId &&
              beneficiary.playerId &&
              normKey(playerId) === normKey(beneficiary.playerId)
            ) ||
            normKey(fullName) === normKey(beneficiary.fullName),
          isEmpty: false,
          isWithdrawnHistoryOnly: true,
        };
      });

    const identityKey = (row) =>
      normKey(
        row?.playerId ||
        row?.uid ||
        row?.fullName ||
        row?.stableKey ||
        row?.id ||
        ""
      );

    const uniqueMap = new Map();

    /*
     * Active/committed players go in first.
     */
    rowsFromCommittedUsers.forEach((row) => {
      const key = identityKey(row);
      if (key) uniqueMap.set(key, row);
    });

    /*
     * Then append anyone who withdrew and no longer has an active booking.
     * If they still have another active booking, preserve the active row.
     */
    withdrawnRows.forEach((row) => {
      const key = identityKey(row);

      if (!key || uniqueMap.has(key)) return;

      uniqueMap.set(key, row);
    });

    const committedRows = Array.from(uniqueMap.values());

    const alreadyHasCurrent = committedRows.some(
      (row) =>
        row.isCurrent ||
        (
          row.playerId &&
          beneficiary.playerId &&
          normKey(row.playerId) === normKey(beneficiary.playerId)
        ) ||
        normKey(row.fullName) === normKey(beneficiary.fullName)
    );

    if (!alreadyHasCurrent) {
      committedRows.push({
        id:
          beneficiary.playerId ||
          slugFromLooseName(beneficiary.fullName),
        uid: beneficiary.playerId || "",
        playerId: beneficiary.playerId || "",
        memberId: beneficiary.playerId || "",
        fullName: beneficiary.fullName,
        shortName: beneficiary.shortName,
        stableKey: beneficiary.stableKey,
        isCurrent: true,
        isEmpty: false,
        isWithdrawnHistoryOnly: false,
      });
    }

    while (committedRows.length < MAX_PLAYERS) {
      committedRows.push({
        id: `empty_slot_${committedRows.length + 1}`,
        fullName: "",
        shortName: `Slot ${committedRows.length + 1}`,
        isCurrent: false,
        isEmpty: true,
        isWithdrawnHistoryOnly: false,
      });
    }

    return committedRows.slice(0, MAX_PLAYERS);
  }, [
    liveCommittedUsers,
    beneficiary,
    clubMatchCredits,
    visibleWeekIds,
  ]);

  const weekSelectionsAll = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const signedKeys = new Set(liveWeekKeys[week.id] || []);

      if (effectiveSelectedWeeks.includes(week.id)) {
        signedKeys.add(currentUserDocKey);
      }

      out[week.id] = signedKeys;
    });

    return out;
  }, [weeks, liveWeekKeys, effectiveSelectedWeeks, currentUserDocKey]);

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
          if (effectiveSelectedWeeks.includes(week.id)) signedIds.add(player.id);
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
  }, [weeks, displayRows, livePlayerWeeks, liveWeekKeys, effectiveSelectedWeeks]);

  const weekPaidSelections = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const paidIds = new Set();

      displayRows.forEach((player) => {
        if (player.isEmpty) return;

        if (player.isCurrent) {
          if (effectivePaidWeekSet.has(week.id)) paidIds.add(player.id);
          return;
        }

        const lookupKeys = getPlayerLookupKeys(player);
        const paidForThatPlayer = liveCommittedUsers.some((user) => {
          const paidWeeksForUser = Array.isArray(user?.paidWeeks)
            ? user.paidWeeks
            : [];

          if (!paidWeeksForUser.includes(week.id)) return false;

          const userKeys = uniqueStrings([
            user?.stableKey,
            user?.userId,
            user?.fullName,
            user?.shortName,
            firstNameOf(user?.fullName || user?.shortName || ""),
            slugFromLooseName(user?.fullName || user?.shortName || ""),
          ]).map(normKey);

          if (player.stableKey && userKeys.includes(normKey(player.stableKey))) {
            return true;
          }

          return lookupKeys.some((key) => userKeys.includes(key));
        });

        if (paidForThatPlayer) paidIds.add(player.id);
      });

      out[week.id] = paidIds;
    });

    return out;
  }, [weeks, displayRows, liveCommittedUsers, effectivePaidWeekSet]);

  const withdrawnPlayerWeekKeys = useMemo(() => {
    const out = new Set();

    const withdrawalSources = new Set([
      MATCH_CREDIT_SOURCE.PLAYER_EARLY_CANCELLATION,
      MATCH_CREDIT_SOURCE.ADMIN_EXCEPTION,
    ]);

    clubMatchCredits
      .filter((credit) => withdrawalSources.has(credit?.sourceType))
      .forEach((credit) => {
        const withdrawalWeekIds = uniqueWeekIds([
          credit?.sourceWeekId,
          ...(Array.isArray(credit?.withdrawalWeekIds)
            ? credit.withdrawalWeekIds
            : []),
        ]);

        const playerId = normKey(credit?.playerId || "");
        const playerName = normKey(credit?.playerName || "");
        const firstName = normKey(
          firstNameOf(credit?.playerName || "")
        );

        withdrawalWeekIds.forEach((weekId) => {
          [playerId, playerName, firstName]
            .filter(Boolean)
            .forEach((key) => {
              out.add(`${key}::${weekId}`);
            });
        });
      });

    return out;
  }, [clubMatchCredits]);

  const isPlayerWithdrawnForWeek = (player, weekId) => {
    if (!player || player.isEmpty || !weekId) return false;

    const keys = uniqueStrings([
      player.playerId,
      player.uid,
      player.memberId,
      player.fullName,
      player.shortName,
      firstNameOf(player.fullName || player.shortName || ""),
    ])
      .map(normKey)
      .filter(Boolean);

    return keys.some((key) =>
      withdrawnPlayerWeekKeys.has(`${key}::${weekId}`)
    );
  };

  const weekMeta = useMemo(
    () =>
      weeks.map((week) => {
        const fullCount = weekSelectionsAll[week.id]?.size || 0;
        return {
          ...week,
          count: fullCount,
          status: getStatus(fullCount, week.maxPlayers, week.isChallenge),
        };
      }),
    [weeks, weekSelectionsAll]
  );

  const matchTicketUseWeeks = useMemo(() => {
    return weekMeta.filter((week) => {
      const kickoff = buildMatchKickoffDate(
        week,
        effectiveMatchSignupSettings
      );

      if (!kickoff || kickoff.getTime() <= Date.now()) {
        return false;
      }

      if (
        effectiveSelectedWeeks.includes(week.id) ||
        effectivePaidWeekSet.has(week.id)
      ) {
        return false;
      }

      if (week?.status?.key === "full") {
        return false;
      }

      return true;
    });
  }, [
    weekMeta,
    effectiveMatchSignupSettings,
    effectiveSelectedWeeks,
    effectivePaidWeekSet,
  ]);

  const matchTicketCancelWeeks = useMemo(() => {
    return weekMeta.filter((week) => {
      if (!effectivePaidWeekSet.has(week.id)) {
        return false;
      }

      const kickoff = buildMatchKickoffDate(
        week,
        effectiveMatchSignupSettings
      );

      if (!kickoff || kickoff.getTime() <= Date.now()) {
        return false;
      }

      return true;
    });
  }, [
    weekMeta,
    effectiveMatchSignupSettings,
    effectivePaidWeekSet,
  ]);

  const handleUseMatchTicket = async (week) => {
    if (!week?.id || matchTicketBusy) return;

    const credit = availableMatchCredits[0];

    if (!credit?.id) {
      setMatchCreditMessage("You do not currently have a Match Ticket.");
      setMatchTicketWalletMode("menu");
      return;
    }

    const confirmed = await showPremiumConfirm({
      icon: "🎟️",
      title: `Use Match Ticket for ${
        week.shortLabel || week.label || "this match"
      }?`,
      message:
        "This match will be booked and marked as paid immediately.",
      detail:
        "No payment will be taken. One Match Ticket will be used.",
      confirmText: "Use Match Ticket",
      cancelText: "Back",
      variant: "success",
    });

    if (!confirmed) return;

    try {
      setMatchTicketBusy(true);
      setMatchCreditMessage("");

      const redeemTicket =
        isPracticeMode
          ? redeemPracticeMatchCreditForMatch
          : redeemMatchCreditForMatch;

      const result = await redeemTicket({
        ...(isPracticeMode
          ? { dataScope }
          : { clubId: activeClubId }),
        creditId: credit.id,
        playerId: beneficiary.playerId,
        playerName: beneficiary.fullName,
        signupDocId: pendingId,
        weekId: week.id,

        signupIdentity: {
          signupDocId: pendingId,
          sourcePendingSignupId: pendingId,

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
          displayName: beneficiary.fullName,

          beneficiaryType: beneficiary.mode,
          beneficiaryPlayerId: beneficiary.playerId,
          beneficiaryName: beneficiary.fullName,
          beneficiaryShortName: beneficiary.shortName,
          beneficiaryStableKey: beneficiary.stableKey,
        },

        redeemedBy:
          currentUser?.uid ||
          currentUser?.email ||
          beneficiary.playerId,
      });

      setSelectedWeeks(result.selectedWeeks || []);
      setPaidWeeks(result.paidWeeks || []);

      writeSignupCache(pendingId, {
        selectedWeeks: result.selectedWeeks || [],
        paidWeeks: result.paidWeeks || [],
        reminderPreference,
      });

      const [credits, clubCredits] = await Promise.all([
        isPracticeMode
          ? listAvailablePracticeMatchCredits({
              dataScope,
              playerId: beneficiary.playerId,
            })
          : listAvailablePlayerMatchCredits({
              clubId: activeClubId,
              playerId: beneficiary.playerId,
            }),

        isPracticeMode
          ? listPracticeMatchCredits({
              dataScope,
            })
          : listClubMatchCredits({
              clubId: activeClubId,
            }),
      ]);

      setAvailableMatchCredits(credits);
      setClubMatchCredits(clubCredits);

      if (credits.length < 1) {
        setMatchTicketMinimized(false);
      }

      setShowMatchTicketWallet(false);
      setMatchTicketWalletMode("menu");

      setMatchCreditMessage(
        `Match Ticket used — ${
          week.shortLabel || week.label || "your match"
        } is booked and paid.`
      );
    } catch (error) {
      console.error("Failed to use Match Ticket:", error);

      await showPremiumConfirm({
        title: "Match Ticket not used",
        message:
          error?.message ||
          "Your ticket and booking were not changed.",
        confirmText: "OK",
        cancelText: "",
      });
    } finally {
      setMatchTicketBusy(false);
    }
  };

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

  const toggleWeek = async (week) => {
    if (effectivePaidWeekSet.has(week.id)) return;

    const meta = weekMeta.find((w) => w.id === week.id);
    const isSelected = effectiveSelectedWeeks.includes(week.id);

    if (isSelected) {
      const nextSelectedWeeks = effectiveSelectedWeeks.filter((id) => id !== week.id);
      const nextPaidWeeks = effectivePaidWeeks.filter((id) => id !== week.id);
      const nextUnpaidWeeks = nextSelectedWeeks.filter(
        (id) => !nextPaidWeeks.includes(id)
      );
      const nextPaymentStatus = statusFromWeekState(nextSelectedWeeks, nextPaidWeeks);

      setSelectedWeeks(nextSelectedWeeks);
      setPaidWeeks(nextPaidWeeks);

      const patch = {
        selectedWeeks: nextSelectedWeeks,
        paidWeeks: nextPaidWeeks,
        primaryPaidWeeks: nextPaidWeeks,
        unpaidWeeks: nextUnpaidWeeks,
        unpaidPrimaryWeeks: nextUnpaidWeeks,
        weeksToPayNow: nextUnpaidWeeks,
        totalAmount: sumWeekCosts(nextUnpaidWeeks),
        amountDueNow: sumWeekCosts(nextUnpaidWeeks),
        amountPaidTotal: sumWeekCosts(nextPaidWeeks),
        paymentStatus: nextPaymentStatus,
        isUnpaid: nextUnpaidWeeks.length > 0,
        updatedAt: serverTimestamp(),
      };

      try {
        await Promise.all([
          setDoc(pendingSignupDocRef(pendingId), patch, { merge: true }),
          setDoc(matchSignupDocRef(pendingId), patch, { merge: true }),
        ]);
      } catch (error) {
        console.error("Failed to remove unpaid week selection:", error);
      }

      return;
    }

    if ((meta?.count || 0) >= Number(meta?.maxPlayers || MAX_PLAYERS)) return;
    setSelectedWeeks((prev) => uniqueWeekIds([...prev, week.id]));
  };

  const getRedeemedMatchTicketForWeek = (weekId) => {
    const safeWeekId = String(weekId || "").trim();

    if (!safeWeekId) return null;

    return (
      clubMatchCredits.find(
        (credit) =>
          credit?.status === MATCH_CREDIT_STATUS.REDEEMED &&
          String(credit?.playerId || "").trim() ===
            String(beneficiary?.playerId || "").trim() &&
          String(credit?.redeemedWeekId || "").trim() === safeWeekId
      ) || null
    );
  };

  const handlePaidMatchCreditCancellation = async (week) => {
    if (!week?.id) return;
    if (beneficiary?.isGuest) return;
    if (!effectivePaidWeekSet.has(week.id)) return;

    const kickoff = buildMatchKickoffDate(
      week,
      effectiveMatchSignupSettings
    );

    const deadline = getMatchCreditDeadline(
      week,
      effectiveMatchSignupSettings
    );

    const eligible =
      isAutomaticMatchCreditCancellationEligible(
        week,
        effectiveMatchSignupSettings
      );

    if (!kickoff || !deadline) {
      await showPremiumConfirm({
        title: "Match unavailable",
        message:
          "We could not determine the kickoff time for this match.",
        confirmText: "OK",
        cancelText: "",
      });
      return;
    }

    if (!eligible) {
      await showPremiumConfirm({
        icon: "⏱️",
        title: "Inside the 48-hour window",
        message:
          "Automatic Match Ticket returns close 48 hours before kickoff.",
        detail:
          "An admin can still grant an exception when appropriate.",
        confirmText: "OK",
        cancelText: "",
      });
      return;
    }

    const redeemedTicket =
      getRedeemedMatchTicketForWeek(week.id);

    const confirmed = await showPremiumConfirm({
      icon: "🎟️",
      title: redeemedTicket
        ? "Return your Match Ticket?"
        : "Cancel this match?",
      message: redeemedTicket
        ? "Your place will be released and your Match Ticket will return to your wallet."
        : "Your place will be released and a Match Ticket will be added to your wallet.",
      confirmText: redeemedTicket
        ? "Return Ticket"
        : "Cancel Match",
      cancelText: "Keep Booking",
      variant: "success",
    });

    if (!confirmed) return;

    setMatchCreditBusyWeekId(week.id);
    setMatchCreditMessage("");

    try {
      if (redeemedTicket) {
        const returnTicket =
          isPracticeMode
            ? returnPracticeRedeemedMatchTicketToWallet
            : returnRedeemedMatchTicketToWallet;

        await returnTicket({
          ...(isPracticeMode
            ? { dataScope }
            : { clubId: activeClubId }),
          creditId: redeemedTicket.id,
          playerId: beneficiary.playerId,
          signupDocId: pendingId,
          weekId: week.id,
          returnedBy:
            currentUser?.uid ||
            currentUser?.email ||
            beneficiary.playerId,
        });
      } else {
        const cancelForTicket =
          isPracticeMode
            ? cancelPracticePaidMatchAndIssueCredit
            : cancelPaidMatchAndIssueCredit;

        await cancelForTicket({
          ...(isPracticeMode
            ? { dataScope }
            : { clubId: activeClubId }),
          playerId: beneficiary.playerId,
          playerName: beneficiary.fullName,
          signupDocId: pendingId,
          weekId: week.id,
          sourceType:
            MATCH_CREDIT_SOURCE.PLAYER_EARLY_CANCELLATION,
          issuedBy:
            currentUser?.uid ||
            currentUser?.email ||
            beneficiary.playerId,
        });
      }

      const nextSelectedWeeks =
        effectiveSelectedWeeks.filter(
          (id) => id !== week.id
        );

      const nextPaidWeeks =
        effectivePaidWeeks.filter(
          (id) => id !== week.id
        );

      setSelectedWeeks(nextSelectedWeeks);
      setPaidWeeks(nextPaidWeeks);

      writeSignupCache(pendingId, {
        selectedWeeks: nextSelectedWeeks,
        paidWeeks: nextPaidWeeks,
        reminderPreference,
      });

      const [credits, clubCredits] =
        await Promise.all([
          isPracticeMode
            ? listAvailablePracticeMatchCredits({
                dataScope,
                playerId: beneficiary.playerId,
              })
            : listAvailablePlayerMatchCredits({
                clubId: activeClubId,
                playerId: beneficiary.playerId,
              }),
          isPracticeMode
            ? listPracticeMatchCredits({
                dataScope,
              })
            : listClubMatchCredits({
                clubId: activeClubId,
              }),
        ]);

      setAvailableMatchCredits(credits);
      setClubMatchCredits(clubCredits);

      if (credits.length > 0) {
        setMatchTicketMinimized(false);
      }

      setMatchCreditMessage(
        redeemedTicket
          ? "Match Ticket returned to your wallet."
          : "Match cancelled — Match Ticket added."
      );
    } catch (error) {
      console.error(
        "Failed to cancel Match Ticket booking:",
        error
      );

      await showPremiumConfirm({
        title: "Booking unchanged",
        message:
          error?.message ||
          "Nothing was changed. Please try again.",
        confirmText: "OK",
        cancelText: "",
      });
    } finally {
      setMatchCreditBusyWeekId("");
    }
  };

  const fieldContributionDueNow = sumWeekCosts(weeksToPayNow);
  const serviceFeePerGame = 7.5;
  const serviceFeeDueNow = weeksToPayNow.length * serviceFeePerGame;
  const totalAmount = fieldContributionDueNow + serviceFeeDueNow;
  const selectedCount = selectedWeeks.length;

  const signupStatusText = isFullyPaidSelection
    ? `${paidWeeks.length} week${paidWeeks.length === 1 ? "" : "s"} paid`
    : selectedCount > 0
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
    : `${attendanceBadge.attended}/${attendanceBadge.total} weeks · ${attendanceBadge.gamesPlayed} game${
        attendanceBadge.gamesPlayed === 1 ? "" : "s"
      } played`;

  const unpaidPlayersCount = useMemo(
    () =>
      liveCommittedUsers.filter(
        (user) => Array.isArray(user.unpaidWeeks) && user.unpaidWeeks.length > 0
      ).length,
    [liveCommittedUsers]
  );

  const canManageSignupsAsAdmin = useMemo(() => {
    const effectiveRole = String(
      activeRole || identity?.actingRole || identity?.role || currentUser?.role || ""
    )
      .trim()
      .toLowerCase();

    return effectiveRole === "admin";
  }, [activeRole, identity, currentUser]);

  const BULK_PAID_MAX_PLAYERS = 18;

  const bulkPaidTargetWeek = useMemo(
    () => (Array.isArray(weeks) && weeks.length ? weeks[0] : null),
    [weeks]
  );

  const bulkPaidAlreadyPaidKeys = useMemo(() => {
    const out = new Set();
    const targetWeekId = String(bulkPaidTargetWeek?.id || "").trim();

    if (!targetWeekId) return out;

    liveCommittedUsers.forEach((user) => {
      const paid = Array.isArray(user?.paidWeeks)
        ? user.paidWeeks
        : [];

      if (!paid.includes(targetWeekId)) return;

      const id = normKey(
        user?.userId ||
        user?.rawData?.beneficiaryPlayerId ||
        user?.rawData?.playerId ||
        ""
      );

      const name = normKey(
        user?.fullName ||
        user?.shortName ||
        user?.rawData?.beneficiaryName ||
        ""
      );

      if (id) out.add(`id:${id}`);
      if (name) out.add(`name:${name}`);
    });

    return out;
  }, [liveCommittedUsers, bulkPaidTargetWeek]);

  const isBulkPlayerAlreadyPaid = (player) => {
    const id = normKey(player?.id || "");
    const name = normKey(player?.fullName || player?.shortName || "");

    return (
      (id && bulkPaidAlreadyPaidKeys.has(`id:${id}`)) ||
      (name && bulkPaidAlreadyPaidKeys.has(`name:${name}`))
    );
  };

  const adminCleanupCandidates = useMemo(() => {
    if (!canManageSignupsAsAdmin) return [];

    const groupedByPlayer = new Map();

    const getPlayerKey = (user) =>
      normKey(
        user?.userId || user?.stableKey || user?.fullName || user?.shortName || ""
      );

    const mergeIntoGroup = (user) => {
      const playerKey = getPlayerKey(user);
      if (!playerKey) return;

      const previous = groupedByPlayer.get(playerKey);

      const previousSelected = Array.isArray(previous?.selectedWeeks)
        ? previous.selectedWeeks
        : [];
      const previousPaid = Array.isArray(previous?.paidWeeks)
        ? previous.paidWeeks
        : [];
      const previousSourceCollections = Array.isArray(previous?.sourceCollections)
        ? previous.sourceCollections
        : [];
      const previousDocIds = Array.isArray(previous?.relatedDocIds)
        ? previous.relatedDocIds
        : [];

      const incomingSelected = Array.isArray(user?.selectedWeeks)
        ? user.selectedWeeks
        : [];
      const incomingPaid = Array.isArray(user?.paidWeeks) ? user.paidWeeks : [];

      const mergedSelectedWeeks = uniqueWeekIds([
        ...previousSelected,
        ...incomingSelected,
      ]).filter((weekId) => visibleWeekIds.has(weekId));

      const mergedPaidWeeks = uniqueWeekIds([
        ...previousPaid,
        ...incomingPaid,
      ]).filter((weekId) => visibleWeekIds.has(weekId));

      const mergedUnpaidWeeks = mergedSelectedWeeks.filter(
        (weekId) => !mergedPaidWeeks.includes(weekId)
      );

      const relatedDocIds = uniqueStrings([
        ...previousDocIds,
        user?.docId,
      ]);

      /*
        Prefer an existing pendingSignups doc as the primary admin target when
        possible, because reminders and manual verification naturally live there.
        If none exists, fall back to whatever record we have and create/merge the
        missing pendingSignups doc when verifying.
      */
      const previousSources = previousSourceCollections.map((x) =>
        String(x || "").trim()
      );
      const incomingSources = Array.isArray(user?.sourceCollections)
        ? user.sourceCollections.map((x) => String(x || "").trim())
        : [];

      const previousHasPending = previousSources.includes("pendingSignups");
      const incomingHasPending = incomingSources.includes("pendingSignups");

      const primary =
        !previous || (!previousHasPending && incomingHasPending) ? user : previous;

      groupedByPlayer.set(playerKey, {
        ...(primary || user),
        docId: primary?.docId || user?.docId || previous?.docId || "",
        stableKey: primary?.stableKey || user?.stableKey || previous?.stableKey || "",
        userId: primary?.userId || user?.userId || previous?.userId || "",
        fullName: primary?.fullName || user?.fullName || previous?.fullName || "",
        shortName: primary?.shortName || user?.shortName || previous?.shortName || "",
        beneficiaryType:
          primary?.beneficiaryType ||
          user?.beneficiaryType ||
          previous?.beneficiaryType ||
          "self",
        selectedWeeks: mergedSelectedWeeks,
        paidWeeks: mergedPaidWeeks,
        unpaidWeeks: mergedUnpaidWeeks,
        amountDueNow: sumWeekCosts(mergedUnpaidWeeks),
        paymentStatus:
          mergedSelectedWeeks.length === 0
            ? "not_selected"
            : mergedUnpaidWeeks.length === 0
            ? "paid"
            : "pending",
        sourceCollections: uniqueStrings([
          ...previousSourceCollections,
          ...incomingSources,
        ]),
        relatedDocIds,
        rawData: {
          ...(previous?.rawData || {}),
          ...(user?.rawData || {}),
          selectedWeeks: mergedSelectedWeeks,
          paidWeeks: mergedPaidWeeks,
          unpaidWeeks: mergedUnpaidWeeks,
        },
      });
    };

    liveCommittedUsers
      .filter((user) => String(user?.docId || "").trim())
      .forEach(mergeIntoGroup);

    /*
      If the current admin/player has ticked visible boxes that are not yet
      written to Firestore, include that local draft in the admin verifier.
      This keeps the admin panel aligned with the yellow ticks in the matrix.
    */
    const currentDraftSelectedWeeks = uniqueWeekIds(effectiveSelectedWeeks).filter(
      (weekId) => visibleWeekIds.has(weekId)
    );
    const currentDraftPaidWeeks = uniqueWeekIds(effectivePaidWeeks).filter(
      (weekId) => visibleWeekIds.has(weekId)
    );
    const currentDraftUnpaidWeeks = currentDraftSelectedWeeks.filter(
      (weekId) => !currentDraftPaidWeeks.includes(weekId)
    );

    if (currentDraftSelectedWeeks.length > 0) {
      mergeIntoGroup({
        docId: pendingId,
        stableKey: beneficiary.stableKey,
        userId: beneficiary.playerId,
        fullName: beneficiary.fullName,
        shortName: beneficiary.shortName,
        beneficiaryType: beneficiary.mode,
        paymentStatus:
          currentDraftUnpaidWeeks.length === 0 ? "paid" : "pending",
        unpaidWeeks: currentDraftUnpaidWeeks,
        paidWeeks: currentDraftPaidWeeks,
        selectedWeeks: currentDraftSelectedWeeks,
        amountDueNow: sumWeekCosts(currentDraftUnpaidWeeks),
        sourceCollections: ["localDraft", "pendingSignups"],
        relatedDocIds: [pendingId],
        rawData: {
          selectedWeeks: currentDraftSelectedWeeks,
          paidWeeks: currentDraftPaidWeeks,
          unpaidWeeks: currentDraftUnpaidWeeks,
          monthKey: calendarMonthKey,
          signupScopeId,
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
        },
      });
    }

    return Array.from(groupedByPlayer.values()).sort((a, b) => {
      const unpaidDiff =
        (Array.isArray(b?.unpaidWeeks) ? b.unpaidWeeks.length : 0) -
        (Array.isArray(a?.unpaidWeeks) ? a.unpaidWeeks.length : 0);
      if (unpaidDiff !== 0) return unpaidDiff;

      const selectedDiff =
        (Array.isArray(b?.selectedWeeks) ? b.selectedWeeks.length : 0) -
        (Array.isArray(a?.selectedWeeks) ? a.selectedWeeks.length : 0);
      if (selectedDiff !== 0) return selectedDiff;

      return String(a?.fullName || "").localeCompare(String(b?.fullName || ""));
    });
  }, [
    canManageSignupsAsAdmin,
    liveCommittedUsers,
    effectiveSelectedWeeks,
    effectivePaidWeeks,
    visibleWeekIds,
    pendingId,
    beneficiary,
    calendarMonthKey,
    signupScopeId,
    payerUserId,
    displayName,
    shortName,
  ]);

  const adminSelectedTarget = useMemo(
    () =>
      adminCleanupCandidates.find((item) => item.docId === adminCleanupTargetId) ||
      null,
    [adminCleanupCandidates, adminCleanupTargetId]
  );

  const adminTargetUnpaidWeeks = useMemo(() => {
    if (!adminSelectedTarget) return [];
    return Array.isArray(adminSelectedTarget.unpaidWeeks)
      ? uniqueWeekIds(adminSelectedTarget.unpaidWeeks)
      : [];
  }, [adminSelectedTarget]);

  const adminTargetPaidWeeks = useMemo(() => {
    if (!adminSelectedTarget) return [];
    return Array.isArray(adminSelectedTarget.paidWeeks)
      ? uniqueWeekIds(adminSelectedTarget.paidWeeks)
      : [];
  }, [adminSelectedTarget]);

  const adminTargetSelectedWeeks = useMemo(() => {
    if (!adminSelectedTarget) return [];
    return Array.isArray(adminSelectedTarget.selectedWeeks)
      ? uniqueWeekIds(adminSelectedTarget.selectedWeeks)
      : [];
  }, [adminSelectedTarget]);

  const adminTargetAvailableWeeksToAdd = useMemo(() => {
    if (!adminSelectedTarget) return [];

    return weeks
      .filter(
        (week) =>
          !adminTargetSelectedWeeks.includes(week.id) &&
          !adminTargetPaidWeeks.includes(week.id)
      )
      .map((week) => week.id);
  }, [adminSelectedTarget, weeks, adminTargetSelectedWeeks, adminTargetPaidWeeks]);

  const adminTargetRelatedRecords = useMemo(() => {
    if (!adminSelectedTarget) return [];

    const targetStableKey = String(adminSelectedTarget.stableKey || "").trim();
    const targetUserId = normKey(adminSelectedTarget.userId || "");
    const targetName = normKey(
      adminSelectedTarget.fullName || adminSelectedTarget.shortName || ""
    );
    const relatedDocIds = Array.isArray(adminSelectedTarget.relatedDocIds)
      ? adminSelectedTarget.relatedDocIds
      : [];

    const related = liveCommittedUsers.filter((user) => {
      const stableKey = String(user?.stableKey || "").trim();
      const userId = normKey(user?.userId || "");
      const fullName = normKey(user?.fullName || user?.shortName || "");
      const docId = String(user?.docId || "").trim();

      if (docId && relatedDocIds.includes(docId)) return true;
      if (targetStableKey && stableKey && targetStableKey === stableKey) return true;
      if (targetUserId && userId && targetUserId === userId) return true;
      return Boolean(targetName) && Boolean(fullName) && targetName === fullName;
    });

    if (!related.length && adminSelectedTarget?.docId) {
      return [adminSelectedTarget];
    }

    return related;
  }, [adminSelectedTarget, liveCommittedUsers]);

  useEffect(() => {
    if (!canManageSignupsAsAdmin) return;
    if (
      adminCleanupTargetId &&
      adminCleanupCandidates.some((item) => item.docId === adminCleanupTargetId)
    ) {
      return;
    }
    setAdminCleanupTargetId(adminCleanupCandidates[0]?.docId || "");
  }, [canManageSignupsAsAdmin, adminCleanupCandidates, adminCleanupTargetId]);

  useEffect(() => {
    setAdminVerifyWeeks([]);
    setAdminRemovePaidWeeks([]);
    setAdminAddPaidWeeks([]);
  }, [adminCleanupTargetId]);

  const firstColWidth = isMobile ? 108 : 190;

  const weekColWidth = useMemo(() => {
    if (!isMobile) return 112;

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
    if (selectedWeeks.length === 0 || isFullyPaidSelection) {
      onBack?.();
      return;
    }
    setShowLeavePrompt(true);
  };

  async function handlePayNow() {
    if (beneficiaryNeedsSelection || weeksToPayNow.length === 0) return;

    try {
      const paymentStatus = statusFromWeekState(selectedWeeks, paidWeeks);

      await setDoc(
        matchSignupDocRef(pendingId),
        {
          signupDocId: pendingId,
          sourcePendingSignupId: pendingId,
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
          displayName: beneficiary.fullName,
          beneficiaryType: beneficiary.mode,
          beneficiaryPlayerId: beneficiary.playerId,
          beneficiaryName: beneficiary.fullName,
          beneficiaryShortName: beneficiary.shortName,
          beneficiaryStableKey: beneficiary.stableKey,
          selectedWeeks,
          paidWeeks,
          primaryPaidWeeks: paidWeeks,
          unpaidWeeks: weeksToPayNow,
          unpaidPrimaryWeeks: weeksToPayNow,
          weeksToPayNow,
          totalGamesSelected: selectedWeeks.length,
          amountDue: totalAmount,
          amountPaid: sumWeekCosts(paidWeeks),
          paymentIntentAmount: totalAmount,
          totalAmount,
          amountDueNow: totalAmount,
          amountPaidTotal: sumWeekCosts(paidWeeks),
          costPerGame: matchSignupSettings.weeklyPrice || COST_PER_GAME,
          eventPrices,
          selectedEventDetails,
          paymentStatus,
          paymentForMode:
            signupForMode === "self"
              ? "self"
              : signupForMode === "existing_player"
              ? "other"
              : "self",
          paymentMethod: "Yoco",
          paymentReference: `5s-${firstNameOf(beneficiary.fullName)}`,
          whatsappNumber: profileWhatsappNumber || phoneNumber || "",
          effectiveWhatsappNumber: effectiveWhatsappNumber || "",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      setShowLeavePrompt(false);

      onProceedToPayment?.({
        signupDocId: pendingId,
        sourcePendingSignupId: pendingId,
        selectedWeeks,
        paidWeeks,
        primaryPaidWeeks: paidWeeks,
        weeksToPayNow,
        secondSelectedWeeks: [],
        secondPaidWeeks: [],
        secondWeeksToPayNow: [],
        totalAmount,
        amountDue: totalAmount,
        costPerGame: matchSignupSettings.weeklyPrice || COST_PER_GAME,
          eventPrices,
          selectedEventDetails,
        paymentForMode:
          signupForMode === "self"
            ? "self"
            : signupForMode === "existing_player"
            ? "other"
            : "self",
        displayName: beneficiary.fullName,
        shortName: beneficiary.shortName,
        playerId: beneficiary.playerId,
        payerName: displayName,
        payerUserId,
        beneficiaryName: beneficiary.fullName,
        beneficiaryShortName: beneficiary.shortName,
        beneficiaryPlayerId: beneficiary.playerId,
        beneficiaryType: beneficiary.mode,
        beneficiaryStableKey: beneficiary.stableKey,
        secondDisplayName: "",
        secondPlayerId: "",
        secondEmail: "",
        secondBeneficiaryName: "",
        secondBeneficiaryShortName: "",
        secondBeneficiaryPlayerId: "",
        secondBeneficiaryType: "",
        secondBeneficiaryStableKey: "",
        paymentReference: `5s-${firstNameOf(beneficiary.fullName)}`,
      });
    } catch (error) {
      console.error("Failed to prepare payment:", error);
    }
  }

  const handlePayLater = async () => {
    try {
      if (selectedWeeks.length === 0) {
        setShowLeavePrompt(false);
        onBack?.();
        return;
      }

      const paymentStatus = statusFromWeekState(selectedWeeks, paidWeeks);

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
        totalAmount,
        amountDueNow: totalAmount,
        amountPaidTotal: sumWeekCosts(paidWeeks),
        costPerGame: matchSignupSettings.weeklyPrice || COST_PER_GAME,
          eventPrices,
          selectedEventDetails,
        paymentStatus,
        isUnpaid: weeksToPayNow.length > 0,
        remindersEnabled: Boolean(effectiveWhatsappNumber),
        remindersPaused: !Boolean(effectiveWhatsappNumber),
        reminderPreference,
        reminderTimezone: "Africa/Johannesburg",
        lastReminderSentAt: null,
        nextReminderAt: null,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      await setDoc(pendingSignupDocRef(pendingId), payload, {
        merge: true,
      });

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

  const resetLocalStateForRemovedTarget = (targetDocIds = []) => {
    if (!Array.isArray(targetDocIds) || !targetDocIds.length) return;
    if (targetDocIds.includes(pendingId)) {
      setSelectedWeeks([]);
      setPaidWeeks([]);
      setPendingSelectionsSaved(false);
      setSelectionHydrated(false);
      setMatchSignupStateLoaded(false);
    }
  };

  const removeSignupCacheEntries = (docIds = []) => {
    try {
      if (typeof window === "undefined") return;
      docIds.forEach((docId) => {
        if (!docId) return;
        window.sessionStorage.removeItem(`signup_cache__${docId}`);
      });
    } catch (error) {
      console.warn("Signup cache delete skipped:", error);
    }
  };

  const buildAdminSignupIdentityPayload = (target, existingData = {}) => {
    const targetName =
      target?.fullName ||
      existingData?.beneficiaryName ||
      existingData?.playerName ||
      "Player";

    const targetShortName =
      target?.shortName ||
      existingData?.beneficiaryShortName ||
      existingData?.shortName ||
      firstNameOf(targetName) ||
      "Player";

    const targetUserId =
      target?.userId ||
      existingData?.beneficiaryPlayerId ||
      existingData?.playerId ||
      existingData?.userId ||
      slugFromLooseName(targetName);

    return {
      activeSeasonId: resolvedSeasonId,
      seasonAtSignupTime: resolvedSeasonId,
      signupType,
      signupScopeId,
      signupScopeLabel,
      monthLabel: calendarMonthData?.monthLabel || "",
      monthKey: calendarMonthKey,
      payerUserId: existingData?.payerUserId || payerUserId,
      payerName: existingData?.payerName || displayName,
      payerShortName: existingData?.payerShortName || shortName,
      userId: targetUserId,
      playerId: targetUserId,
      playerName: targetName,
      shortName: targetShortName,
      displayName: targetName,
      beneficiaryType: target?.beneficiaryType || existingData?.beneficiaryType || "self",
      beneficiaryPlayerId: targetUserId,
      beneficiaryName: targetName,
      beneficiaryShortName: targetShortName,
      beneficiaryStableKey:
        target?.stableKey ||
        existingData?.beneficiaryStableKey ||
        buildBeneficiaryStableKey("self", targetUserId, targetName),
    };
  };

  /*
   * Shared existing Match Signup admin-paid write operation.
   *
   * This follows the same data shape used by the existing
   * "Add booking as paid" administration workflow.
   *
   * The bulk selector is only another caller of this operation.
   */
  const applyExistingAdminPaidOperation = async ({
    target,
    weeksToAdd = [],
    paymentMethod = "manual_admin_add_paid_week",
  }) => {
    const addWeeks = uniqueWeekIds(weeksToAdd).filter((weekId) =>
      weeks.some((week) => week.id === weekId)
    );

    if (!target?.docId || !addWeeks.length) return false;

    const pendingRef = pendingSignupDocRef(target.docId);
    const pendingSnap = await getDoc(pendingRef);

    const pendingData = pendingSnap.exists()
      ? pendingSnap.data() || {}
      : target.rawData || {};

    const existingSelectedWeeks = Array.isArray(pendingData.selectedWeeks)
      ? uniqueWeekIds(pendingData.selectedWeeks)
      : Array.isArray(target.selectedWeeks)
      ? uniqueWeekIds(target.selectedWeeks)
      : [];

    const existingPaidWeeks = Array.isArray(
      pendingData.paidWeeks || pendingData.primaryPaidWeeks
    )
      ? uniqueWeekIds(
          pendingData.paidWeeks || pendingData.primaryPaidWeeks
        )
      : Array.isArray(target.paidWeeks)
      ? uniqueWeekIds(target.paidWeeks)
      : [];

    const nextSelectedWeeks = uniqueWeekIds([
      ...existingSelectedWeeks,
      ...addWeeks,
    ]);

    const nextPaidWeeks = uniqueWeekIds([
      ...existingPaidWeeks,
      ...addWeeks,
    ]);

    const nextUnpaidWeeks = nextSelectedWeeks.filter(
      (weekId) => !nextPaidWeeks.includes(weekId)
    );

    const nextStatus = statusFromWeekState(
      nextSelectedWeeks,
      nextPaidWeeks
    );

    const verifier =
      identity?.email ||
      identity?.displayName ||
      identity?.shortName ||
      DEFAULT_ADMIN_NAME;

    const identityPayload = buildAdminSignupIdentityPayload(
      target,
      pendingData
    );

    await setDoc(
      pendingRef,
      {
        ...identityPayload,
        selectedWeeks: nextSelectedWeeks,
        paidWeeks: nextPaidWeeks,
        unpaidWeeks: nextUnpaidWeeks,
        weeksToPayNow: nextUnpaidWeeks,
        totalAmount: sumWeekCosts(nextUnpaidWeeks),
        amountDueNow: sumWeekCosts(nextUnpaidWeeks),
        amountPaidTotal: sumWeekCosts(nextPaidWeeks),
        paymentStatus: nextStatus,
        isUnpaid: nextUnpaidWeeks.length > 0,
        remindersEnabled:
          Boolean(pendingData.effectiveWhatsappNumber) &&
          nextUnpaidWeeks.length > 0,
        remindersPaused:
          !Boolean(pendingData.effectiveWhatsappNumber) ||
          nextUnpaidWeeks.length === 0,
        verifiedBy: verifier,
        verifiedAt: serverTimestamp(),
        paymentMethod,
        updatedAt: serverTimestamp(),
        createdAt:
          pendingData.createdAt || serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      matchSignupDocRef(target.docId),
      {
        ...identityPayload,
        selectedWeeks: nextSelectedWeeks,
        paidWeeks: nextPaidWeeks,
        primaryPaidWeeks: nextPaidWeeks,
        unpaidWeeks: nextUnpaidWeeks,
        weeksToPayNow: nextUnpaidWeeks,
        amountDue: sumWeekCosts(nextUnpaidWeeks),
        amountPaid: sumWeekCosts(nextPaidWeeks),
        paymentIntentAmount: 0,
        paymentStatus: nextStatus,
        verifiedBy: verifier,
        verifiedAt: serverTimestamp(),
        paymentVerifiedAt: serverTimestamp(),
        paymentMethod,
        updatedAt: serverTimestamp(),
        createdAt:
          pendingData.createdAt || serverTimestamp(),
      },
      { merge: true }
    );

    /*
     * Keep the currently viewed beneficiary in sync immediately.
     *
     * Firestore remains authoritative, but without this local update
     * the live matrix can already show PAID while the page summary
     * still says "0 weeks paid" until another hydration cycle.
     */
    if (String(target.docId || "") === String(pendingId || "")) {
      const visibleSelectedWeeks = nextSelectedWeeks.filter(
        (weekId) => visibleWeekIds.has(weekId)
      );

      const visiblePaidWeeks = nextPaidWeeks.filter(
        (weekId) => visibleWeekIds.has(weekId)
      );

      setSelectedWeeks(visibleSelectedWeeks);
      setPaidWeeks(visiblePaidWeeks);
      setPendingSelectionsSaved(visibleSelectedWeeks.length > 0);

      writeSignupCache(pendingId, {
        selectedWeeks: visibleSelectedWeeks,
        paidWeeks: visiblePaidWeeks,
        reminderPreference,
      });
    }

    return true;
  };

  const handleBulkMarkPlayersPaid = async () => {
    if (!canManageSignupsAsAdmin) return;

    const targetWeekId = String(
      bulkPaidTargetWeek?.id || ""
    ).trim();

    if (!targetWeekId) {
      setBulkPaidError(
        "No current or upcoming match day is available."
      );
      return;
    }

    const selectedPlayers = directoryPlayers.filter((player) =>
      bulkPaidSelectedPlayerIds.includes(player.id)
    );

    if (!selectedPlayers.length) {
      setBulkPaidError("Select at least one player.");
      return;
    }

    if (selectedPlayers.length > BULK_PAID_MAX_PLAYERS) {
      setBulkPaidError(
        `You can mark a maximum of ${BULK_PAID_MAX_PLAYERS} players at once.`
      );
      return;
    }

    const confirmed = await showPremiumConfirm({
      icon: "✅",
      title: `Mark ${selectedPlayers.length} player${
        selectedPlayers.length === 1 ? "" : "s"
      } as paid?`,
      message:
        bulkPaidTargetWeek?.fullLabel ||
        bulkPaidTargetWeek?.label ||
        targetWeekId,
      detail: isPracticeMode
        ? "Practice only — no real payment is taken. The player will be treated as paid inside this Practice session."
        : "Use this for cash, EFT, or another payment you have personally verified.",
      confirmText: "Mark selected as paid",
      variant: "success",
    });

    if (!confirmed) return;

    setBulkPaidBusy(true);
    setBulkPaidMessage("");
    setBulkPaidError("");

    try {
      for (const player of selectedPlayers) {
        /*
         * Prefer the existing admin candidate because it carries
         * the authoritative Match Signup document identity.
         */
        let target = adminCleanupCandidates.find((candidate) => {
          const candidateUserId = normKey(
            candidate?.userId || ""
          );
          const playerId = normKey(player?.id || "");

          if (
            candidateUserId &&
            playerId &&
            candidateUserId === playerId
          ) {
            return true;
          }

          return (
            normKey(
              candidate?.fullName ||
              candidate?.shortName ||
              ""
            ) ===
            normKey(
              player?.fullName ||
              player?.shortName ||
              ""
            )
          );
        });

        /*
         * A directory player may never have used Match Signup before.
         * In that case construct exactly the same canonical document
         * identity Match Signup uses for an existing-player beneficiary.
         */
        if (!target) {
          const docId = buildPendingSignupId({
            signupType,
            beneficiaryPlayerId: player.id,
            monthKey: calendarMonthKey,
          });

          target = {
            docId,
            userId: player.id,
            fullName:
              player.fullName ||
              player.shortName ||
              "Player",
            shortName:
              player.shortName ||
              player.fullName ||
              "Player",
            stableKey: buildBeneficiaryStableKey(
              "existing_player",
              player.id,
              player.fullName ||
                player.shortName ||
                ""
            ),
            beneficiaryType: "existing_player",
            selectedWeeks: [],
            paidWeeks: [],
            rawData: {},
          };
        }

        await applyExistingAdminPaidOperation({
          target,
          weeksToAdd: [targetWeekId],
          paymentMethod: isPracticeMode
            ? "practice_manual_admin_paid"
            : "manual_admin_add_paid_week",
        });
      }

      setBulkPaidMessage(
        `${selectedPlayers.length} player${
          selectedPlayers.length === 1 ? "" : "s"
        } marked paid for ${
          bulkPaidTargetWeek?.shortLabel ||
          bulkPaidTargetWeek?.label ||
          targetWeekId
        }.`
      );

      setBulkPaidSelectedPlayerIds([]);
      setShowBulkPaidModal(false);
    } catch (error) {
      console.error("BULK PAID FAILURE:", error);
      console.error(
        "BULK PAID ERROR CODE:",
        error?.code
      );
      console.error(
        "BULK PAID ERROR MESSAGE:",
        error?.message
      );

      setBulkPaidError(
        `Could not mark the selected players as paid: ${
          error?.code ||
          error?.message ||
          "unknown error"
        }`
      );
    } finally {
      setBulkPaidBusy(false);
    }
  };

  const handleAdminVerifyWeeks = async (weeksToVerify = []) => {
    if (!canManageSignupsAsAdmin || !adminCleanupTargetId) return;

    const verifyWeeks = uniqueWeekIds(weeksToVerify).filter((weekId) =>
      weeks.some((week) => week.id === weekId)
    );

    if (!verifyWeeks.length) return;

    const target = adminCleanupCandidates.find(
      (item) => item.docId === adminCleanupTargetId
    );

    if (!target) return;

    setAdminVerifyBusy(true);
    setAdminCleanupMessage("");
    setAdminCleanupError("");

    try {
      const changed = await applyExistingAdminPaidOperation({
        target,
        weeksToAdd: verifyWeeks,
        paymentMethod: "manual_admin_verify",
      });

      if (!changed) {
        throw new Error(
          "No valid booking was available to mark as paid."
        );
      }

      setAdminVerifyWeeks([]);

      setAdminCleanupMessage(
        `${target.fullName || target.shortName || "Player"} marked as paid.`
      );
    } catch (error) {
      console.error("ADMIN VERIFY PAID FAILURE:", error);
      console.error("ADMIN VERIFY PAID ERROR CODE:", error?.code);
      console.error("ADMIN VERIFY PAID ERROR MESSAGE:", error?.message);

      setAdminCleanupError(
        `Could not mark booking as paid: ${
          error?.code ||
          error?.message ||
          "unknown error"
        }`
      );
    } finally {
      setAdminVerifyBusy(false);
    }
  };

  const handleAdminVerifyAllUnpaidWeeks = async () => {
    if (!adminTargetUnpaidWeeks.length) return;
    await handleAdminVerifyWeeks(adminTargetUnpaidWeeks);
  };

  const handleAdminAddMissingPaidWeeks = async (weeksToAdd = []) => {
    if (!canManageSignupsAsAdmin || !adminCleanupTargetId) return;

    const addWeeks = uniqueWeekIds(weeksToAdd).filter((weekId) =>
      weeks.some((week) => week.id === weekId)
    );
    if (!addWeeks.length) return;

    const target = adminCleanupCandidates.find(
      (item) => item.docId === adminCleanupTargetId
    );
    if (!target) return;

    const confirmed = await showPremiumConfirm({
      icon: "📅",
      title: `Add ${addWeeks.length} missing paid fixture${addWeeks.length === 1 ? "" : "s"} for ${target.fullName}?`,
      message: "Use this only after you have received the payment.",
      detail: "This will add the selected booking and mark it as paid immediately.",
      confirmText: "Yes, add and mark as paid",
      variant: "success",
    });
    if (!confirmed) return;

    setAdminVerifyBusy(true);
    setAdminCleanupMessage("");
    setAdminCleanupError("");

    try {
      const pendingRef = pendingSignupDocRef(target.docId);
      const pendingSnap = await getDoc(pendingRef);
      const pendingData = pendingSnap.exists()
        ? pendingSnap.data() || {}
        : target.rawData || {};

      const existingSelectedWeeks = Array.isArray(pendingData.selectedWeeks)
        ? uniqueWeekIds(pendingData.selectedWeeks)
        : Array.isArray(target.selectedWeeks)
        ? uniqueWeekIds(target.selectedWeeks)
        : [];

      const existingPaidWeeks = Array.isArray(
        pendingData.paidWeeks || pendingData.primaryPaidWeeks
      )
        ? uniqueWeekIds(pendingData.paidWeeks || pendingData.primaryPaidWeeks)
        : Array.isArray(target.paidWeeks)
        ? uniqueWeekIds(target.paidWeeks)
        : [];

      const nextSelectedWeeks = uniqueWeekIds([
        ...existingSelectedWeeks,
        ...addWeeks,
      ]);
      const nextPaidWeeks = uniqueWeekIds([...existingPaidWeeks, ...addWeeks]);
      const nextUnpaidWeeks = nextSelectedWeeks.filter(
        (weekId) => !nextPaidWeeks.includes(weekId)
      );
      const nextStatus = statusFromWeekState(nextSelectedWeeks, nextPaidWeeks);

      const verifier =
        identity?.email ||
        identity?.displayName ||
        identity?.shortName ||
        DEFAULT_ADMIN_NAME;

      const identityPayload = buildAdminSignupIdentityPayload(target, pendingData);

      await setDoc(
        pendingRef,
        {
          ...identityPayload,
          selectedWeeks: nextSelectedWeeks,
          paidWeeks: nextPaidWeeks,
          unpaidWeeks: nextUnpaidWeeks,
          weeksToPayNow: nextUnpaidWeeks,
          totalAmount: sumWeekCosts(nextUnpaidWeeks),
          amountDueNow: sumWeekCosts(nextUnpaidWeeks),
          amountPaidTotal: sumWeekCosts(nextPaidWeeks),
          paymentStatus: nextStatus,
          isUnpaid: nextUnpaidWeeks.length > 0,
          remindersEnabled:
            Boolean(pendingData.effectiveWhatsappNumber) &&
            nextUnpaidWeeks.length > 0,
          remindersPaused:
            !Boolean(pendingData.effectiveWhatsappNumber) ||
            nextUnpaidWeeks.length === 0,
          verifiedBy: verifier,
          verifiedAt: serverTimestamp(),
          paymentMethod: "manual_admin_add_paid_week",
          updatedAt: serverTimestamp(),
          createdAt: pendingData.createdAt || serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        matchSignupDocRef(target.docId),
        {
          ...identityPayload,
          selectedWeeks: nextSelectedWeeks,
          paidWeeks: nextPaidWeeks,
          primaryPaidWeeks: nextPaidWeeks,
          unpaidWeeks: nextUnpaidWeeks,
          weeksToPayNow: nextUnpaidWeeks,
          amountDue: sumWeekCosts(nextUnpaidWeeks),
          amountPaid: sumWeekCosts(nextPaidWeeks),
          paymentIntentAmount: 0,
          paymentStatus: nextStatus,
          verifiedBy: verifier,
          verifiedAt: serverTimestamp(),
          paymentVerifiedAt: serverTimestamp(),
          paymentMethod: "manual_admin_add_paid_week",
          updatedAt: serverTimestamp(),
          createdAt: pendingData.createdAt || serverTimestamp(),
        },
        { merge: true }
      );

      setAdminAddPaidWeeks([]);
      setAdminCleanupMessage(
        `${target.fullName} added as paid for ${addWeeks.length} missing fixture${
          addWeeks.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      console.error("Failed to add missing paid weeks:", error);
      setAdminCleanupError("Could not add the selected paid fixtures. Please try again.");
    } finally {
      setAdminVerifyBusy(false);
    }
  };

  const handleAdminClearUnpaidWeeks = async () => {
    if (!canManageSignupsAsAdmin || !adminCleanupTargetId) return;

    const target = adminCleanupCandidates.find(
      (item) => item.docId === adminCleanupTargetId
    );
    if (!target) return;

    const confirmed = await showPremiumConfirm({
      icon: "🧹",
      title: `Remove unpaid bookings for ${target.fullName}?`,
      message: "Paid bookings will remain.",
      detail: "This only clears unpaid bookings. It will not remove bookings already marked as paid.",
      confirmText: "Remove unpaid bookings",
      variant: "warning",
    });
    if (!confirmed) return;

    setAdminCleanupBusy(true);
    setAdminCleanupMessage("");
    setAdminCleanupError("");

    try {
      const pendingRef = pendingSignupDocRef(target.docId);
      const pendingSnap = await getDoc(pendingRef);
      if (!pendingSnap.exists()) {
        throw new Error("Pending signup record not found.");
      }

      const data = pendingSnap.data() || {};
      const paidWeeksOnly = Array.isArray(data.paidWeeks)
        ? data.paidWeeks.filter((weekId) => visibleWeekIds.has(weekId))
        : [];
      const nextStatus = paidWeeksOnly.length > 0 ? "paid" : "not_selected";

      await setDoc(
        pendingRef,
        {
          selectedWeeks: paidWeeksOnly,
          unpaidWeeks: [],
          weeksToPayNow: [],
          totalAmount: 0,
          amountDueNow: 0,
          amountPaidTotal: paidWeeksOnly.length * COST_PER_GAME,
          paymentStatus: nextStatus,
          isUnpaid: false,
          remindersEnabled: false,
          remindersPaused: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        matchSignupDocRef(target.docId),
        {
          selectedWeeks: paidWeeksOnly,
          paidWeeks: paidWeeksOnly,
          primaryPaidWeeks: paidWeeksOnly,
          unpaidWeeks: [],
          weeksToPayNow: [],
          amountDue: 0,
          amountPaid: paidWeeksOnly.length * COST_PER_GAME,
          paymentIntentAmount: 0,
          paymentStatus: nextStatus,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setAdminCleanupMessage(`Unpaid weeks cleared for ${target.fullName}.`);
    } catch (error) {
      console.error("Failed to clear unpaid weeks:", error);
      setAdminCleanupError("Could not clear unpaid weeks. Please try again.");
    } finally {
      setAdminCleanupBusy(false);
    }
  };

  const handleAdminRemoveTarget = async () => {
    if (!canManageSignupsAsAdmin || !adminCleanupTargetId) return;

    const target = adminCleanupCandidates.find(
      (item) => item.docId === adminCleanupTargetId
    );
    if (!target) return;

    const targetRecords = adminTargetRelatedRecords.length
      ? adminTargetRelatedRecords
      : [target];

    const targetDocIds = uniqueStrings(targetRecords.map((item) => item.docId));
    const totalPaidWeeks = targetRecords.reduce(
      (sum, item) => sum + (Array.isArray(item?.paidWeeks) ? item.paidWeeks.length : 0),
      0
    );

    const confirmed = await showPremiumConfirm({
      icon: "🗑️",
      title: `Remove ${target.fullName} from this month?`,
      message:
        totalPaidWeeks > 0
          ? `This will remove all monthly records found for this player, including ${totalPaidWeeks} paid week${totalPaidWeeks === 1 ? "" : "s"}.`
          : "This will remove all monthly records found for this player.",
      detail: "Use this only for mistakes, tests, or records you intentionally want gone.",
      confirmText: "Yes, remove player",
      variant: "danger",
    });
    if (!confirmed) return;

    setAdminCleanupBusy(true);
    setAdminCleanupMessage("");
    setAdminCleanupError("");

    try {
      await Promise.all(
        targetDocIds.map(async (docId) => {
          await deleteDoc(pendingSignupDocRef(docId));
          try {
            await deleteDoc(matchSignupDocRef(docId));
          } catch (error) {
            console.warn("Match signup delete skipped:", error);
          }
        })
      );

      removeSignupCacheEntries(targetDocIds);
      resetLocalStateForRemovedTarget(targetDocIds);

      setAdminCleanupTargetId("");
      setAdminVerifyWeeks([]);
      setAdminRemovePaidWeeks([]);
      setAdminCleanupMessage(
        `${target.fullName} was removed from this month${
          targetDocIds.length > 1 ? ` across ${targetDocIds.length} records` : ""
        }.`
      );
    } catch (error) {
      console.error("Failed to remove signup target:", error);
      setAdminCleanupError("Could not remove that record. Please try again.");
    } finally {
      setAdminCleanupBusy(false);
    }
  };

  const handleAdminRemovePaidWeeks = async (weeksToRemove = []) => {
    if (!canManageSignupsAsAdmin || !adminCleanupTargetId) return;

    const target = adminCleanupCandidates.find(
      (item) => item.docId === adminCleanupTargetId
    );
    if (!target) return;

    const removeWeeks = uniqueWeekIds(weeksToRemove).filter((weekId) =>
      adminTargetPaidWeeks.includes(weekId)
    );
    if (!removeWeeks.length) return;

    const confirmed = await showPremiumConfirm({
      icon: "↩️",
      title: `Undo ${removeWeeks.length} paid booking${removeWeeks.length === 1 ? "" : "s"} for ${target.fullName}?`,
      message: "This is intended for mistakes or test payments.",
      detail: "The selected paid booking(s) will be removed from this month.",
      confirmText: "Undo paid booking",
      variant: "warning",
    });
    if (!confirmed) return;

    setAdminCleanupBusy(true);
    setAdminCleanupMessage("");
    setAdminCleanupError("");

    try {
      const targetRecords = adminTargetRelatedRecords.length
        ? adminTargetRelatedRecords
        : [target];
      const removedDocIds = [];

      for (const record of targetRecords) {
        const pendingRef = getClubDoc(db, CLUB_COLLECTIONS.pendingSignups, record.docId, activeClubId);
        const pendingSnap = await getDoc(pendingRef);
        if (!pendingSnap.exists()) continue;

        const pendingData = pendingSnap.data() || {};
        const existingSelectedWeeks = Array.isArray(pendingData.selectedWeeks)
          ? uniqueWeekIds(pendingData.selectedWeeks).filter((weekId) =>
              visibleWeekIds.has(weekId)
            )
          : [];
        const existingPaidWeeks = Array.isArray(pendingData.paidWeeks)
          ? uniqueWeekIds(pendingData.paidWeeks).filter((weekId) =>
              visibleWeekIds.has(weekId)
            )
          : [];

        const nextSelectedWeeks = existingSelectedWeeks.filter(
          (weekId) => !removeWeeks.includes(weekId)
        );
        const nextPaidWeeks = existingPaidWeeks.filter(
          (weekId) => !removeWeeks.includes(weekId)
        );
        const nextUnpaidWeeks = nextSelectedWeeks.filter(
          (weekId) => !nextPaidWeeks.includes(weekId)
        );

        if (!nextSelectedWeeks.length) {
          await deleteDoc(pendingRef);
          try {
            await deleteDoc(matchSignupDocRef(record.docId));
          } catch (error) {
            console.warn("Match signup delete skipped:", error);
          }
          removedDocIds.push(record.docId);
          continue;
        }

        const nextStatus = statusFromWeekState(nextSelectedWeeks, nextPaidWeeks);

        await setDoc(
          pendingRef,
          {
            selectedWeeks: nextSelectedWeeks,
            paidWeeks: nextPaidWeeks,
            unpaidWeeks: nextUnpaidWeeks,
            weeksToPayNow: nextUnpaidWeeks,
            totalAmount: sumWeekCosts(nextUnpaidWeeks),
            amountDueNow: sumWeekCosts(nextUnpaidWeeks),
            amountPaidTotal: sumWeekCosts(nextPaidWeeks),
            paymentStatus: nextStatus,
            isUnpaid: nextUnpaidWeeks.length > 0,
            remindersEnabled:
              Boolean(pendingData.effectiveWhatsappNumber) &&
              nextUnpaidWeeks.length > 0,
            remindersPaused:
              !Boolean(pendingData.effectiveWhatsappNumber) ||
              nextUnpaidWeeks.length === 0,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await setDoc(
          matchSignupDocRef(record.docId),
          {
            selectedWeeks: nextSelectedWeeks,
            paidWeeks: nextPaidWeeks,
            primaryPaidWeeks: nextPaidWeeks,
            unpaidWeeks: nextUnpaidWeeks,
            weeksToPayNow: nextUnpaidWeeks,
            amountDue: sumWeekCosts(nextUnpaidWeeks),
            amountPaid: sumWeekCosts(nextPaidWeeks),
            paymentIntentAmount: 0,
            paymentStatus: nextStatus,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (removedDocIds.length) {
        removeSignupCacheEntries(removedDocIds);
        resetLocalStateForRemovedTarget(removedDocIds);
      }

      setAdminRemovePaidWeeks([]);
      setAdminCleanupMessage(
        `${target.fullName} had ${removeWeeks.length} paid week${
          removeWeeks.length === 1 ? "" : "s"
        } removed.`
      );
    } catch (error) {
      console.error("Failed to remove paid weeks:", error);
      setAdminCleanupError("Could not remove the selected paid weeks. Please try again.");
    } finally {
      setAdminCleanupBusy(false);
    }
  };

  const handleClearSelections = async () => {
    const confirmed = await showPremiumConfirm({
      icon: "🧽",
      title: "Clear selected bookings?",
      message: "This will remove your current unpaid selections.",
      detail: "Paid bookings will not be removed.",
      confirmText: "Clear selected bookings",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      setSelectedWeeks([]);
      await setDoc(
        pendingSignupDocRef(pendingId),
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
          amountPaidTotal: sumWeekCosts(paidWeeks),
          costPerGame: matchSignupSettings.weeklyPrice || COST_PER_GAME,
          eventPrices,
          selectedEventDetails,
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

  const beneficiaryNeedsSelection =
    signupForMode === "existing_player" ? !existingPlayerTargetId : false;

  const contentMaxWidth = isMobile ? "100%" : "1180px";

  const historicalViewMode = weeksToPayNow.length === 0;

const getSpecialColumnStyle = (week, base = {}, edge = "middle") => {
  if (!week?.isChallenge) return base;

  const radiusTop =
    edge === "top" ? { borderTopLeftRadius: 8, borderTopRightRadius: 8 } : {};
  const radiusBottom =
    edge === "bottom" ? { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 } : {};

  return {
    ...base,
    background: base.background || undefined,
    borderLeft: "1.5px solid rgba(248, 113, 113, 0.82)",
    borderRight: "1.5px solid rgba(248, 113, 113, 0.82)",
    boxShadow: "inset 0 0 0 1px rgba(248, 113, 113, 0.08)",
    ...radiusTop,
    ...radiusBottom,
  };
};

  return (
    <div
      className="page match-signup-page"
      style={{ maxWidth: contentMaxWidth, margin: "0 auto" }}
    >
      <section className="card signup-hero-card">
        <div className="signup-hero-compact">
          <div className="signup-hero-left">
            <div className="signup-player-avatar signup-player-avatar-hero">
              {photoData ? (
                <img
                  src={photoData}
                  alt={beneficiary.fullName}
                  className="signup-player-avatar-img"
                  loading="eager"
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
                <h2>Pay for upcoming games</h2>
              </div>

              <p className="muted signup-hero-subtext">
                Select the remaining current games, next month games, and any special Challenge fixture.
              </p>

              <div className="signup-top-meta">
                <div className="signup-attendance-badge">
                  <span className="signup-attendance-badge-label">
                    Attendance Badge 🛡️
                  </span>
                  <strong>{attendanceBadgeText}</strong>
                  {attendanceSubtext ? <small>{attendanceSubtext}</small> : null}
                </div>
              </div>
            </div>
          </div>

          <div
            className="signup-hero-actions"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: isMobile ? "flex-start" : "flex-end",
              gap: isMobile ? 8 : 10,
              flexWrap: "wrap",
            }}
          >
            {!beneficiary?.isGuest ? (
              <button
                type="button"
                className={[
                  "tk-match-pull-out-btn",
                  isPracticeMode ? "is-practice-ticket" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  setMatchTicketWalletMode("cancel");
                  setShowMatchTicketWallet(true);
                }}
                disabled={matchTicketBusy}
                title={
                  isPracticeMode
                    ? "Pull out of an upcoming Practice match"
                    : "Pull out of an upcoming match"
                }
                style={{ touchAction: "manipulation" }}
              >
                <span
                  className="tk-match-pull-out-icon"
                  aria-hidden="true"
                >
                  ↩
                </span>

                <span className="tk-match-pull-out-copy">
                  <strong>Match pull out</strong>
                  <small>Can't make it this week?</small>
                </span>

                {isPracticeMode ? (
                  <span className="tk-practice-feature-tag">
                    Practice
                  </span>
                ) : null}
              </button>
            ) : null}

            <button
              type="button"
              className="secondary-btn signup-calendar-btn"
              onClick={() => {
                setCalendarMonthPage(0);
                setShowCalendarPopup(true);
              }}
              aria-label="Open next month calendar"
              title="Open next month calendar"
              style={{ touchAction: "manipulation" }}
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
      </section>

      {matchCreditMessage ? (
        <div
          className="tk-golden-ticket-toast"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">🎟️</span>
          <strong>{matchCreditMessage}</strong>
        </div>
      ) : null}

      {!beneficiary?.isGuest &&
      availableMatchCredits.length > 0 ? (
        <div
          className={[
            "tk-floating-match-ticket",
            matchTicketMinimized ? "is-minimized" : "",
            isPracticeMode ? "is-practice-ticket" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {matchTicketMinimized ? (
            <button
              type="button"
              className="tk-floating-ticket-restore"
              onClick={() => setMatchTicketMinimized(false)}
              aria-label={`Open Match Ticket. ${availableMatchCredits.length} available.`}
              title="Open Match Ticket"
            >
              <span aria-hidden="true">🎟️</span>
              <strong>
                {availableMatchCredits.length}
              </strong>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="tk-floating-ticket-main"
                onClick={() => {
                  setMatchTicketWalletMode("use");
                  setShowMatchTicketWallet(true);
                }}
                disabled={matchTicketBusy}
                aria-label={`Use Match Ticket. ${availableMatchCredits.length} available.`}
              >
                <span
                  className="tk-floating-ticket-icon"
                  aria-hidden="true"
                >
                  🎟️
                </span>

                <span className="tk-floating-ticket-copy">
                  <strong>Match Ticket</strong>
                  <small>
                    {`${availableMatchCredits.length} available`}
                  </small>
                </span>

                <span
                  className="tk-floating-ticket-count"
                  aria-hidden="true"
                >
                  {availableMatchCredits.length}
                </span>
              </button>

              <button
                type="button"
                className="tk-floating-ticket-minimize"
                onClick={() => setMatchTicketMinimized(true)}
                aria-label="Minimize Match Ticket"
                title="Hide to the side"
              >
                ‹
              </button>
            </>
          )}
        </div>
      ) : null}

      {showMatchTicketWallet ? (
        <div
          className="tk-match-ticket-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !matchTicketBusy) {
              setShowMatchTicketWallet(false);
              setMatchTicketWalletMode("menu");
            }
          }}
        >
          <section
            className="tk-match-ticket-wallet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-ticket-wallet-title"
          >
            <div className="tk-match-ticket-wallet-head">
              <div>
                <span className="tk-match-ticket-eyebrow">🎟️ MATCH TICKET</span>
                <h2 id="match-ticket-wallet-title">
                  {matchTicketWalletMode === "cancel"
                    ? "Match pull out"
                    : "Use Ticket"}
                </h2>
              </div>

              <button
                type="button"
                className="tk-match-ticket-close"
                onClick={() => {
                  if (matchTicketBusy) return;
                  setShowMatchTicketWallet(false);
                  setMatchTicketWalletMode("menu");
                }}
                aria-label="Close Match Ticket"
              >
                ×
              </button>
            </div>

            {matchTicketWalletMode === "menu" ? (
              <>
                <div className="tk-match-ticket-balance">
                  <strong>{availableMatchCredits.length}</strong>
                  <span>
                    Match Ticket{availableMatchCredits.length === 1 ? "" : "s"} available
                  </span>
                </div>

                <p className="tk-match-ticket-help">
                  Use it whenever you need it.
                </p>

                <div className="tk-match-ticket-actions">
                  <button
                    type="button"
                    className="tk-match-ticket-action primary"
                    onClick={() => setMatchTicketWalletMode("use")}
                    disabled={
                      matchTicketBusy ||
                      availableMatchCredits.length < 1
                    }
                  >
                    <span className="tk-match-ticket-action-icon">🎟️</span>
                    <span>
                      <strong>Use Ticket</strong>
                      <small>
                        {availableMatchCredits.length > 0
                          ? "Book a future match"
                          : "You do not have a ticket available yet."}
                      </small>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="tk-match-ticket-action"
                    onClick={() => setMatchTicketWalletMode("cancel")}
                    disabled={matchTicketBusy}
                  >
                    <span className="tk-match-ticket-action-icon">📅</span>
                    <span>
                      <strong>Cancel Match</strong>
                      <small>
                        Release your place
                      </small>
                    </span>
                  </button>
                </div>
              </>
            ) : null}

            {matchTicketWalletMode === "use" ? (
              <>
                <p className="tk-match-ticket-help">
                  Choose a match.
                </p>

                <div className="tk-match-ticket-match-list">
                  {matchTicketUseWeeks.length > 0 ? (
                    matchTicketUseWeeks.map((week) => (
                      <button
                        key={week.id}
                        type="button"
                        className="tk-match-ticket-match"
                        onClick={() => handleUseMatchTicket(week)}
                        disabled={matchTicketBusy}
                      >
                        <span>
                          <strong>
                            {week.shortLabel || week.label || week.id}
                          </strong>
                          <small>No payment required</small>
                        </span>
                        <span className="tk-match-ticket-match-cta">
                          Use ticket →
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="tk-match-ticket-empty">
                      No available upcoming matches to book right now.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="tk-match-ticket-back"
                  onClick={() => setMatchTicketWalletMode("menu")}
                  disabled={matchTicketBusy}
                >
                  ← Back
                </button>
              </>
            ) : null}

            {matchTicketWalletMode === "cancel" ? (
              <>
                <p className="tk-match-ticket-help">
                  Choose a match.
                </p>

                <div className="tk-match-ticket-match-list">
                  {matchTicketCancelWeeks.length > 0 ? (
                    matchTicketCancelWeeks.map((week) => {
                      const eligible =
                        isAutomaticMatchCreditCancellationEligible(
                          week,
                          effectiveMatchSignupSettings
                        );

                      const redeemedTicket =
                        getRedeemedMatchTicketForWeek(week.id);

                      return (
                        <button
                          key={week.id}
                          type="button"
                          className="tk-match-ticket-match"
                          onClick={() => {
                            if (!eligible) return;
                            setShowMatchTicketWallet(false);
                            setMatchTicketWalletMode("menu");
                            handlePaidMatchCreditCancellation(week);
                          }}
                          disabled={!eligible || matchTicketBusy}
                        >
                          <span>
                            <strong>
                              {week.shortLabel || week.label || week.id}
                            </strong>
                            <small>
                              {eligible
                                ? redeemedTicket
                                  ? "Ticket returns to wallet"
                                  : "Receive a Match Ticket"
                                : "Inside 48 hours"}
                            </small>
                          </span>

                          <span className="tk-match-ticket-match-cta">
                            {eligible
                              ? redeemedTicket
                                ? "Return Ticket →"
                                : "Cancel →"
                              : "Locked"}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="tk-match-ticket-empty">
                      You do not have a paid future match to cancel.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="tk-match-ticket-back"
                  onClick={() => setMatchTicketWalletMode("menu")}
                  disabled={matchTicketBusy}
                >
                  ← Back
                </button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      <section className="card signup-summary-card tk-booking-for-card">
        <div className="tk-booking-for-head">
          <div>
            <span>Booking owner</span>
            <h2>Who are you booking for?</h2>
          </div>
          <p>Choose yourself or book on behalf of another club player.</p>
        </div>

        <div className="tk-booking-for-options">
          <button
            type="button"
            className={`tk-booking-for-option ${signupForMode === "self" ? "is-active" : ""}`}
            onClick={() => {
              setSignupForMode("self");
              setExistingPlayerSearch("");
              setSelectedWeeks([]);
              setPaidWeeks([]);
              setSelectionHydrated(false);
            }}
          >
            <span className="tk-booking-for-icon">👤</span>
            <div>
              <strong>Myself</strong>
              <small>Book your own upcoming games.</small>
            </div>
            <em>{signupForMode === "self" ? "✓" : ""}</em>
          </button>

          <button
            type="button"
            className={`tk-booking-for-option ${signupForMode === "existing_player" ? "is-active" : ""}`}
            onClick={() => {
              setSignupForMode("existing_player");
              setExistingPlayerTargetId("");
              setExistingPlayerSearch("");
              setSelectedWeeks([]);
              setPaidWeeks([]);
              setSelectionHydrated(false);
            }}
          >
            <span className="tk-booking-for-icon">👥</span>
            <div>
              <strong>{`Another ${activeClubName} player`}</strong>
              <small>Book and pay on their behalf.</small>
            </div>
            <em>{signupForMode === "existing_player" ? "✓" : ""}</em>
          </button>
        </div>

        {signupForMode === "existing_player" ? (
          <div className="tk-player-picker">
            <label htmlFor="existingPlayerSearch">Choose player</label>
            <input
              id="existingPlayerSearch"
              className="text-input"
              type="search"
              placeholder="Search player name..."
              value={existingPlayerSearch}
              onChange={(e) => setExistingPlayerSearch(e.target.value)}
            />

            <div className="tk-player-picker-list">
              {existingPlayerOptions
                .filter((player) =>
                  !existingPlayerSearch.trim() ||
                  String(player.fullName || "")
                    .toLowerCase()
                    .includes(existingPlayerSearch.trim().toLowerCase())
                )
                .map((player) => {
                  const picked = String(existingPlayerTargetId) === String(player.id);
                  return (
                    <button
                      key={player.id}
                      type="button"
                      className={`tk-player-picker-option ${picked ? "is-active" : ""}`}
                      onClick={() => {
                        setExistingPlayerTargetId(player.id);
                        setExistingPlayerSearch(player.fullName || "");
                        setSelectedWeeks([]);
                        setPaidWeeks([]);
                        setSelectionHydrated(false);
                      }}
                    >
                      <span>{String(player.fullName || "P").slice(0, 1).toUpperCase()}</span>
                      <strong>{player.fullName}</strong>
                      <em>{picked ? "✓" : ""}</em>
                    </button>
                  );
                })}
              {existingPlayerOptions.filter((player) =>
                !existingPlayerSearch.trim() ||
                String(player.fullName || "")
                  .toLowerCase()
                  .includes(existingPlayerSearch.trim().toLowerCase())
              ).length === 0 ? (
                <p className="muted small" style={{ margin: "8px 2px 0" }}>
                  No matching player found. Typing here only searches existing players.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {canManageSignupsAsAdmin ? (
        <section className="card signup-summary-card" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setShowAdminCleanupPanel((prev) => !prev)}
              style={{ touchAction: "manipulation" }}
            >
              {showAdminCleanupPanel ? "Hide manage player" : "Show manage player"}
            </button>
          </div>
        </section>
      ) : null}

      {canManageSignupsAsAdmin && showAdminCleanupPanel ? (
        <section className="card signup-summary-card">
          <div className="signup-reminder-choice">
            <label htmlFor="adminCleanupTargetId">Manage player</label>
            <select
              id="adminCleanupTargetId"
              value={adminCleanupTargetId}
              onChange={(e) => setAdminCleanupTargetId(e.target.value)}
            >
              <option value="">Select a player record</option>
              {adminCleanupCandidates.map((user) => (
                <option key={user.docId} value={user.docId}>
                  {user.fullName} ·{" "}
                  {Array.isArray(user.unpaidWeeks) ? user.unpaidWeeks.length : 0} unpaid
                  {" · "}
                  {Array.isArray(user.paidWeeks) ? user.paidWeeks.length : 0} paid
                </option>
              ))}
            </select>
            <p className="muted small">
              Select a player, then manage their bookings and payments.
            </p>
          </div>

          {adminSelectedTarget ? (
            <div className="tk-manage-player-panel">
              <div className="tk-manage-player-status">
                <div>
                  <span>Selected player</span>
                  <strong>{adminSelectedTarget.fullName || "Player"}</strong>
                </div>
                <div className="tk-manage-player-counts">
                  <em>{adminTargetUnpaidWeeks.length} unpaid</em>
                  <em>{adminTargetPaidWeeks.length} paid</em>
                </div>
              </div>

              <div className="tk-manage-section">
                <div className="tk-manage-section-head">
                  <span>💳</span>
                  <div>
                    <h3>Payments</h3>
                    <p>Confirm player payments.</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="primary-btn tk-manage-main-action"
                  disabled={adminVerifyBusy || !adminTargetUnpaidWeeks.length}
                  onClick={handleAdminVerifyAllUnpaidWeeks}
                  style={{ touchAction: "manipulation" }}
                >
                  {adminVerifyBusy ? "Working..." : "Confirm all unpaid bookings"}
                </button>

                <div className="tk-manage-subsection">
                  <p>Choose specific bookings</p>

                  <div className="tk-manage-chip-row">
                    {adminTargetUnpaidWeeks.length > 0 ? (
                      adminTargetUnpaidWeeks.map((weekId) => {
                        const weekObj = weeks.find((w) => w.id === weekId);
                        const picked = adminVerifyWeeks.includes(weekId);
                        return (
                          <button
                            key={weekId}
                            type="button"
                            className={picked ? "primary-btn" : "secondary-btn"}
                            onClick={() =>
                              setAdminVerifyWeeks((prev) =>
                                prev.includes(weekId)
                                  ? prev.filter((id) => id !== weekId)
                                  : uniqueWeekIds([...prev, weekId])
                              )
                            }
                            style={{ touchAction: "manipulation" }}
                          >
                            {weekObj?.shortLabel || weekId}
                          </button>
                        );
                      })
                    ) : (
                      <p className="muted small">No unpaid bookings to confirm.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={adminVerifyBusy || !adminVerifyWeeks.length}
                    onClick={() => handleAdminVerifyWeeks(adminVerifyWeeks)}
                    style={{ touchAction: "manipulation" }}
                  >
                    {adminVerifyBusy ? "Working..." : "Confirm selected bookings"}
                  </button>
                </div>
              </div>

              <div className="tk-manage-section">
                <div className="tk-manage-section-head">
                  <span>📅</span>
                  <div>
                    <h3>Bookings</h3>
                    <p>Add a booking when the player paid but forgot to select the match.</p>
                  </div>
                </div>

                <div className="tk-manage-chip-row">
                  {adminTargetAvailableWeeksToAdd.length > 0 ? (
                    adminTargetAvailableWeeksToAdd.map((weekId) => {
                      const weekObj = weeks.find((w) => w.id === weekId);
                      const picked = adminAddPaidWeeks.includes(weekId);
                      return (
                        <button
                          key={`add-paid-${weekId}`}
                          type="button"
                          className={picked ? "primary-btn" : "secondary-btn"}
                          onClick={() =>
                            setAdminAddPaidWeeks((prev) =>
                              prev.includes(weekId)
                                ? prev.filter((id) => id !== weekId)
                                : uniqueWeekIds([...prev, weekId])
                            )
                          }
                          style={{ touchAction: "manipulation" }}
                        >
                          {weekObj?.shortLabel || weekId}
                        </button>
                      );
                    })
                  ) : (
                    <p className="muted small">No additional bookings can be added.</p>
                  )}
                </div>

                <button
                  type="button"
                  className="secondary-btn"
                  disabled={adminVerifyBusy || !adminAddPaidWeeks.length}
                  onClick={() => handleAdminAddMissingPaidWeeks(adminAddPaidWeeks)}
                  style={{ touchAction: "manipulation" }}
                >
                  {adminVerifyBusy ? "Working..." : "Add booking as paid"}
                </button>
              </div>

              <div className="tk-manage-section">
                <div className="tk-manage-section-head">
                  <span>🧹</span>
                  <div>
                    <h3>Remove</h3>
                    <p>Remove unpaid bookings or remove the player from this month.</p>
                  </div>
                </div>

                <div className="tk-manage-action-grid">
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={adminCleanupBusy || !adminCleanupTargetId}
                    onClick={handleAdminClearUnpaidWeeks}
                    style={{ touchAction: "manipulation" }}
                  >
                    {adminCleanupBusy ? "Working..." : "Remove unpaid bookings"}
                  </button>

                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={adminCleanupBusy || !adminCleanupTargetId}
                    onClick={handleAdminRemoveTarget}
                    style={{ touchAction: "manipulation" }}
                  >
                    Remove player
                  </button>
                </div>
              </div>

              <details className="tk-manage-section tk-manage-advanced">
                <summary>
                  <span>⚙️</span>
                  <div>
                    <h3>Advanced</h3>
                    <p>Undo an incorrect payment confirmation.</p>
                  </div>
                </summary>

                <div className="tk-manage-chip-row">
                  {adminTargetPaidWeeks.length > 0 ? (
                    adminTargetPaidWeeks.map((weekId) => {
                      const weekObj = weeks.find((w) => w.id === weekId);
                      const picked = adminRemovePaidWeeks.includes(weekId);
                      return (
                        <button
                          key={`remove-paid-${weekId}`}
                          type="button"
                          className={picked ? "primary-btn" : "secondary-btn"}
                          onClick={() =>
                            setAdminRemovePaidWeeks((prev) =>
                              prev.includes(weekId)
                                ? prev.filter((id) => id !== weekId)
                                : uniqueWeekIds([...prev, weekId])
                            )
                          }
                          style={{ touchAction: "manipulation" }}
                        >
                          {weekObj?.shortLabel || weekId}
                        </button>
                      );
                    })
                  ) : (
                    <p className="muted small">No paid bookings available to undo.</p>
                  )}
                </div>

                <button
                  type="button"
                  className="secondary-btn"
                  disabled={adminCleanupBusy || !adminRemovePaidWeeks.length}
                  onClick={() => handleAdminRemovePaidWeeks(adminRemovePaidWeeks)}
                  style={{ touchAction: "manipulation" }}
                >
                  {adminCleanupBusy ? "Working..." : "Undo paid booking"}
                </button>
              </details>
            </div>
          ) : null}

          {adminCleanupMessage ? (
            <p className="muted small" style={{ marginTop: 10, color: "#9ef0b2" }}>
              {adminCleanupMessage}
            </p>
          ) : null}

          {adminCleanupError ? (
            <p className="muted small" style={{ marginTop: 10, color: "#ff9b9b" }}>
              {adminCleanupError}
            </p>
          ) : null}
        </section>
      ) : null}

      {showBulkPaidModal && canManageSignupsAsAdmin && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!bulkPaidBusy) setShowBulkPaidModal(false);
          }}
          style={{ zIndex: 14000 }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(94vw, 760px)",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Mark players paid</h3>
                <p className="muted small" style={{ margin: "6px 0 0" }}>
                  {bulkPaidTargetWeek?.fullLabel ||
                    bulkPaidTargetWeek?.label ||
                    bulkPaidTargetWeek?.id}
                </p>
              </div>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowBulkPaidModal(false)}
                disabled={bulkPaidBusy}
              >
                ✕
              </button>
            </div>

            <p className="muted small">
              Select players whose cash, EFT, or other manual payment you have received
              or personally verified for this match day.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(2, minmax(0, 1fr))",
                gap: 10,
                marginTop: 14,
              }}
            >
              {directoryPlayers.map((player) => {
                const alreadyPaid = isBulkPlayerAlreadyPaid(player);
                const selected = bulkPaidSelectedPlayerIds.includes(player.id);
                const photo =
                  getPlayerPhoto(player.fullName) ||
                  getPlayerPhoto(player.shortName);

                return (
                  <button
                    key={`bulk-paid-${player.id}`}
                    type="button"
                    className={
                      selected
                        ? "primary-btn"
                        : "secondary-btn"
                    }
                    disabled={alreadyPaid || bulkPaidBusy}
                    onClick={() => {
                      setBulkPaidError("");

                      setBulkPaidSelectedPlayerIds((prev) => {
                        if (prev.includes(player.id)) {
                          return prev.filter((id) => id !== player.id);
                        }

                        if (prev.length >= BULK_PAID_MAX_PLAYERS) {
                          setBulkPaidError(
                            `You can select a maximum of ${BULK_PAID_MAX_PLAYERS} players.`
                          );
                          return prev;
                        }

                        return [...prev, player.id];
                      });
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      justifyContent: "flex-start",
                      minHeight: 64,
                      textAlign: "left",
                      opacity: alreadyPaid ? 0.55 : 1,
                      touchAction: "manipulation",
                    }}
                  >
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        overflow: "hidden",
                        flex: "0 0 44px",
                        display: "grid",
                        placeItems: "center",
                        background: "rgba(255,255,255,0.08)",
                        fontWeight: 800,
                      }}
                    >
                      {photo ? (
                        <img
                          src={photo}
                          alt={player.fullName}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        String(player.shortName || player.fullName || "P")
                          .charAt(0)
                          .toUpperCase()
                      )}
                    </span>

                    <span
                      style={{
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <strong
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {player.fullName}
                      </strong>

                      <small>
                        {alreadyPaid
                          ? "Paid"
                          : selected
                          ? "Selected"
                          : "Tap to select"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              <strong>
                {bulkPaidSelectedPlayerIds.length} selected
              </strong>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={bulkPaidBusy}
                  onClick={() => {
                    const selectable = directoryPlayers
                      .filter((player) => !isBulkPlayerAlreadyPaid(player))
                      .slice(0, Math.min(15, BULK_PAID_MAX_PLAYERS))
                      .map((player) => player.id);

                    setBulkPaidSelectedPlayerIds(selectable);
                    setBulkPaidError("");
                  }}
                >
                  Select 15
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  disabled={bulkPaidBusy}
                  onClick={() => {
                    setBulkPaidSelectedPlayerIds([]);
                    setBulkPaidError("");
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            {bulkPaidError ? (
              <p
                className="error-text"
                style={{ marginTop: 12 }}
              >
                {bulkPaidError}
              </p>
            ) : null}

            <div
              className="actions-row"
              style={{ marginTop: 18 }}
            >
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowBulkPaidModal(false)}
                disabled={bulkPaidBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={handleBulkMarkPlayersPaid}
                disabled={
                  bulkPaidBusy ||
                  bulkPaidSelectedPlayerIds.length === 0
                }
              >
                {bulkPaidBusy
                  ? "Marking paid..."
                  : `Mark selected as paid (${bulkPaidSelectedPlayerIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <h3>Upcoming game months</h3>
              <button
                type="button"
                className="secondary-btn signup-calendar-close-btn"
                onClick={() => setShowCalendarPopup(false)}
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
            </div>

            <p className="muted small signup-calendar-note">
              Weekly match days are highlighted. The Challenge fixture appears in the main table as a special event.
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                margin: "12px 0 10px",
              }}
            >
              <button
                type="button"
                className="secondary-btn signup-calendar-close-btn"
                onClick={() => setCalendarMonthPage((prev) => Math.max(0, prev - 1))}
                disabled={calendarMonthPage <= 0}
                aria-label="Previous month"
                style={{
                  touchAction: "manipulation",
                  opacity: calendarMonthPage <= 0 ? 0.42 : 1,
                }}
              >
                ‹
              </button>

              <h4 style={{ margin: 0, textAlign: "center" }}>
                {activeCalendarMonthData.monthLabel}
              </h4>

              <button
                type="button"
                className="secondary-btn signup-calendar-close-btn"
                onClick={() =>
                  setCalendarMonthPage((prev) =>
                    Math.min(calendarMonthsData.length - 1, prev + 1)
                  )
                }
                disabled={calendarMonthPage >= calendarMonthsData.length - 1}
                aria-label="Next month"
                style={{
                  touchAction: "manipulation",
                  opacity:
                    calendarMonthPage >= calendarMonthsData.length - 1 ? 0.42 : 1,
                }}
              >
                ›
              </button>
            </div>

            <div style={{ minHeight: 360 }}>
              <div className="signup-calendar-weekdays">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                  <div key={`${activeCalendarMonthData.monthLabel}-${label}`} className="signup-calendar-weekday">
                    {label}
                  </div>
                ))}
              </div>

              <div className="signup-calendar-grid">
                {activeCalendarMonthData.cells.map((cell, index) => {
                  if (!cell) {
                    return (
                      <div
                        key={`${activeCalendarMonthData.monthLabel}-empty-${index}`}
                        className="signup-calendar-day is-empty"
                      />
                    );
                  }

                  const linkedWeek = getWeekByCalendarCellId(cell.id);
                  const isSelectableDay = Boolean(linkedWeek);
                  const isTargetWeekday =
                    cell.weekday === Number(matchSignupSettings.weeklyDay);
                  const isSpecialFixture = Boolean(linkedWeek?.isChallenge);
                  const isSelected = effectiveSelectedWeeks.includes(cell.id);
                  const isPaid = effectivePaidWeekSet.has(cell.id);

                  if (isSelectableDay && linkedWeek) {
                    const linkedMeta = weekMeta.find((w) => w.id === linkedWeek.id);
                    const isFull = linkedMeta?.status?.key === "full";
                    const disableCalendarClick =
                      beneficiaryNeedsSelection ||
                      isPaid ||
                      (isFull && !isSelected);

                    return (
                      <button
                        key={cell.id}
                        type="button"
                        className={[
                          "signup-calendar-day",
                          "is-button",
                          isTargetWeekday ? "is-wednesday" : "",
                          isSpecialFixture ? "is-challenge-week" : "",
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
                          if (!disableCalendarClick) {
                            toggleWeek(linkedWeek);
                          }
                        }}
                        disabled={disableCalendarClick}
                        style={{
                          transition: "none",
                          touchAction: "manipulation",
                          borderColor: isSpecialFixture
                            ? "rgba(248, 113, 113, 0.86)"
                            : undefined,
                        }}
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
                        isTargetWeekday ? "is-wednesday" : "",
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

            {calendarMonthsData.length > 1 ? (
              <p className="muted small" style={{ marginTop: 8, textAlign: "center" }}>
                Month {calendarMonthPage + 1} of {calendarMonthsData.length}
              </p>
            ) : null}
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
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
            </div>

            <p className="muted small signup-calendar-note">
              {`Add your WhatsApp number so ${activeClubName} can send football-related`}
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
                style={{ touchAction: "manipulation" }}
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
                style={{ touchAction: "manipulation" }}
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeavePrompt && !isFullyPaidSelection ? (
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
                style={{ touchAction: "manipulation" }}
              >
                ✕
              </button>
            </div>

            <p className="muted small signup-calendar-note">
              {beneficiary.fullName} has {selectedWeeks.length} selected week
              {selectedWeeks.length === 1 ? "" : "s"} and {weeksToPayNow.length} new
              unpaid week{weeksToPayNow.length === 1 ? "" : "s"}.
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

            <div
              className="signup-leave-actions"
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(3, minmax(0, 1fr))",
              }}
            >
              <button
                type="button"
                className="primary-btn"
                onClick={handlePayNow}
                disabled={beneficiaryNeedsSelection || weeksToPayNow.length === 0}
                style={{ touchAction: "manipulation" }}
              >
                💳 Go to payment
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handlePayLater}
                disabled={beneficiaryNeedsSelection}
                style={{ touchAction: "manipulation" }}
              >
                I’ll pay later
              </button>

              <button
                type="button"
                className="secondary-btn danger-btn"
                onClick={handleClearSelections}
                style={{ touchAction: "manipulation" }}
              >
                Clear selected weeks
              </button>
            </div>

            {!effectiveWhatsappNumber ? (
              <p className="muted small signup-leave-footnote">
                No WhatsApp number was found on your profile yet, so reminders will
                stay off until your number is available.
              </p>
            ) : null}

            {pendingSelectionsSaved ? (
              <p className="muted small signup-leave-footnote">
                Your selected weeks have been saved.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {canManageSignupsAsAdmin && bulkPaidTargetWeek ? (
        <section className="card">
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Manual payment confirmation</h3>
              <p className="muted small" style={{ margin: "6px 0 0" }}>
                Quickly mark several existing club players as paid for the next match day.
              </p>
            </div>

            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setBulkPaidError("");
                setBulkPaidMessage("");
                setBulkPaidSelectedPlayerIds([]);
                setShowBulkPaidModal(true);
              }}
              disabled={bulkPaidBusy}
              style={{ touchAction: "manipulation" }}
            >
              Mark players paid
            </button>
          </div>

          {bulkPaidMessage ? (
            <p
              className="muted small"
              style={{ marginTop: 10, color: "#8ee89a" }}
            >
              {bulkPaidMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card signup-grid-card">
        <div className="signup-grid-title-row">
          <h3>Pick your match days</h3>
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
              gridTemplateColumns: isMobile
                ? `${firstColWidth}px repeat(${weekMeta.length}, ${weekColWidth}px)`
                : `${firstColWidth}px repeat(${weekMeta.length}, minmax(140px, 1fr))`,
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <div className="matrix-corner-cell">Players</div>

            {weekMeta.map((week) => (
              <div
                key={`head-${week.id}`}
                className={`matrix-week-head status-${week.status.key} ${week.isChallenge ? "is-challenge-week" : ""}`}
                title={week.fullLabel}
                style={getSpecialColumnStyle(week, week.isChallenge ? { position: "relative", overflow: "hidden" } : {}, "top")}
              >
{week.isChallenge ? (
  <div
    aria-hidden="true"
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 0,
      color: "rgba(248, 113, 113, 0.22)",
      fontWeight: 950,
      fontSize: isMobile ? 13 : 18,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      transform: "rotate(-18deg)",
      pointerEvents: "none",
      userSelect: "none",
    }}
  >
    Challenge
  </div>
) : null}

                <div className="matrix-week-date">
                  {isMobile ? week.shortLabel : week.label}
                </div>
                <div className={`matrix-week-status ${week.status.key}`}>
                  {week.isChallenge ? "Challenge" : isMobile ? week.status.shortLabel : week.status.label}
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
                          {player.isCurrent && (
                            <div className="matrix-player-tag">
                              {signupForMode === "self"
                                ? "You"
                                : signupForMode === "guest"
                                ? "Guest"
                                : "Paying for"}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {weekMeta.map((week) => {
                    const signed = weekSelections[week.id]?.has(player.id);
                    const isPaid = player.isCurrent
                      ? effectivePaidWeekSet.has(week.id)
                      : Boolean(canManageSignupsAsAdmin && weekPaidSelections[week.id]?.has(player.id));
                    const status = week.status;

                    if (player.isEmpty) {
                      return (
                        <div
                          key={`${player.id}-${week.id}`}
                          className="matrix-view-cell matrix-empty-slot is-empty-row"
                          style={getSpecialColumnStyle(
                            week,
                            { transition: "none" },
                            rowIndex === lastVisibleRowIndex ? "bottom" : "middle"
                          )}
                        >
                          <div className="matrix-view-inner">
                            <span className="matrix-pick-mark">
                              {isLastVisibleExpandableEmptyRow ? "+" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const isWithdrawn =
                      isPlayerWithdrawnForWeek(
                        player,
                        week.id
                      );

                    if (isWithdrawn && !signed && !isPaid) {
                      if (player.isCurrent) {
                        return (
                          <button
                            key={`${player.id}-${week.id}`}
                            type="button"
                            className={[
                              "matrix-pick-cell",
                              "current-player-cell",
                              "is-current-row",
                              "is-withdrawn",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => toggleWeek(week)}
                            disabled={
                              beneficiaryNeedsSelection ||
                              (status.key === "full" && !signed)
                            }
                            style={getSpecialColumnStyle(week, {
                              transition: "none",
                              touchAction: "manipulation",
                            })}
                            title="Withdrew previously · click to book this match again"
                          >
                            <div className="matrix-pick-inner">
                              <span className="matrix-pick-mark tk-withdrawn-mark">
                                ✓
                              </span>
                            </div>
                          </button>
                        );
                      }

                      return (
                        <div
                          key={`${player.id}-${week.id}`}
                          className="matrix-view-cell is-withdrawn"
                          style={getSpecialColumnStyle(
                            week,
                            { transition: "none" },
                            rowIndex === lastVisibleRowIndex
                              ? "bottom"
                              : "middle"
                          )}
                          title="Withdrew · Match Ticket issued"
                        >
                          <div className="matrix-view-inner">
                            <span className="matrix-pick-mark tk-withdrawn-mark">
                              ✓
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (player.isCurrent) {
                      if (isPaid) {
                        return (
                          <div
                            key={`${player.id}-${week.id}`}
                            className={[
                              "matrix-view-cell",
                              "current-player-cell",
                              "is-current-row",
                              "is-paid",
                              signed ? "is-signed" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={getSpecialColumnStyle(
                              week,
                              { transition: "none" }
                            )}
                            title="Paid · playing"
                          >
                            <div className="matrix-view-inner">
                              <span className="matrix-pick-mark">
                                ✓
                              </span>
                            </div>
                          </div>
                        );
                      }

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
                          disabled={
                            beneficiaryNeedsSelection ||
                            isPaid ||
                            (status.key === "full" && !signed)
                          }
                          style={getSpecialColumnStyle(week, {
                            transition: "none",
                            touchAction: "manipulation",
                          })}
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
                        className={[
                          "matrix-view-cell",
                          signed ? "is-signed" : "",
                          isPaid ? "is-paid" : "",
                          isSignedRow ? "is-signed-row" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={getSpecialColumnStyle(
                          week,
                          { transition: "none" },
                          rowIndex === lastVisibleRowIndex ? "bottom" : "middle"
                        )}
                        title={
                          isPaid
                            ? "Paid"
                            : signed
                            ? "Selected, awaiting verification"
                            : ""
                        }
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
        {historicalViewMode ? (
          <>
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
                  <h3>Summary</h3>
                </div>
              </div>
            </div>

            <div className="signup-summary-rows">
              <div className="summary-row">
                <span>Attendance</span>
                <strong>
                  {attendanceBadge.percent == null
                    ? "—"
                    : `${attendanceBadge.percent}%`}
                </strong>
              </div>

              <div className="summary-row">
                <span>Weeks attended</span>
                <strong>{attendanceBadge.attended}</strong>
              </div>

              <div className="summary-row">
                <span>Games played</span>
                <strong>{attendanceBadge.gamesPlayed}</strong>
              </div>

              <div className="summary-row">
                <span>Current team</span>
                <strong>{resolvedCurrentTeamName}</strong>
              </div>

              {isFullyPaidSelection ? (
                <>
                  <div className="summary-row">
                    <span>Upcoming fixtures paid</span>
                    <strong>
                      {visiblePaidWeeks.length} week{visiblePaidWeeks.length === 1 ? "" : "s"}
                    </strong>
                  </div>

                  <div className="summary-row">
                    <span>{upcomingMonthPaymentSummary.label} paid</span>
                    <strong>
                      {upcomingMonthPaymentSummary.paidCount} week{upcomingMonthPaymentSummary.paidCount === 1 ? "" : "s"}
                    </strong>
                  </div>

                  {specialEventPaymentSummary.totalCount > 0 ? (
                    <div className="summary-row">
                      <span>Special event</span>
                      <strong>
                        {specialEventPaymentSummary.hasPaid
                          ? `Paid · ${specialEventPaymentSummary.paidCount} fixture${
                              specialEventPaymentSummary.paidCount === 1 ? "" : "s"
                            }`
                          : "Not paid"}
                      </strong>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="summary-row total">
                <span>Profile</span>
                <div style={{ textAlign: "right" }}>
                  <strong>
                    {beneficiary.isGuest ? "Guest player" : "Squad player"}
                  </strong>
                  <div className="muted small">
                    {beneficiary.isGuest
                      ? "No old stats yet"
                      : attendanceBadge.percent == null
                      ? "History loading"
                      : isFullyPaidSelection
                      ? "Fully paid and confirmed"
                      : "Ready for next month"}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
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
                  <h3>Summary</h3>
                </div>
              </div>
            </div>

            <div className="signup-summary-rows">
              <div className="summary-row">
                <span>Selected match days</span>
                <strong>{selectedWeeks.length}</strong>
              </div>

              <div className="summary-row">
                <span>Already paid</span>
                <strong>{paidWeeks.length}</strong>
              </div>

              <div className="summary-row">
                <span>New to charge</span>
                <strong>
                  {weeksToPayNow.length} match day{weeksToPayNow.length === 1 ? "" : "s"}
                </strong>
              </div>

              <div className="summary-row total">
                <span>Total due now</span>
                <div style={{ textAlign: "right" }}>
                  <strong>R{totalAmount}</strong>
                  <div className="muted small">
                    ({weeksToPayNow.length} selected unpaid match day{weeksToPayNow.length === 1 ? "" : "s"})
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="primary-btn signup-pay-btn"
              disabled={beneficiaryNeedsSelection || weeksToPayNow.length === 0}
              onClick={handlePayNow}
              style={{
                touchAction: "manipulation",
                width: isMobile ? "100%" : "min(360px, 100%)",
              }}
            >
              💳 Continue to payment
            </button>

            {weeksToPayNow.length === 0 && selectedWeeks.length > 0 ? (
              <p className="muted small" style={{ marginTop: 10 }}>
                All selected weeks are already paid.
              </p>
            ) : selectedWeeks.length > 0 ? (
              <p className="muted small" style={{ marginTop: 10 }}>
                Payment is still required. You can continue to payment or change your selected weeks.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
