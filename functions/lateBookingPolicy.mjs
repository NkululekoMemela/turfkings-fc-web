export const DEFAULT_LATE_BOOKING_POLICY = {
  enabled: false,
  feePerGame: 7,
  deadlineDay: 30,
  timeZone: "Africa/Johannesburg",
};

export function normalizeLateBookingPolicy(raw = {}) {
  const fee = Number(raw.feePerGame ?? 7);
  const day = Number(raw.deadlineDay ?? 30);
  if (!Number.isFinite(fee) || fee < 0 || fee > 1000) {
    throw new Error("Late booking fee must be between R0 and R1000.");
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("Booking deadline day must be between 1 and 31.");
  }
  return {
    enabled: raw.enabled === true,
    feePerGame: Math.round(fee * 100) / 100,
    deadlineDay: day,
    timeZone: "Africa/Johannesburg",
  };
}

// monthKey is the month being booked, for example "2026-11".
// South Africa uses UTC+02:00 throughout the year.
export function bookingDeadline(monthKey, deadlineDay = 30) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey));
  if (!match) throw new Error("A valid booking month is required.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || month < 1 || month > 12) {
    throw new Error("Invalid booking month.");
  }
  if (!Number.isInteger(deadlineDay) || deadlineDay < 1 || deadlineDay > 31) {
    throw new Error("Invalid deadline day.");
  }
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const y = previous.getUTCFullYear();
  const m = previous.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(deadlineDay, lastDay);
  // Fees begin at 00:00 after the closing day in South Africa.
  const closesAtMs = Date.UTC(y, m, day + 1) - 2 * 60 * 60 * 1000;
  const label = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")} at 23:59 SAST`;
  return { closesAtMs, label };
}

// Membership dates must come from the Club member record.
function membershipTime(value) {
  if (value == null || value === "") return NaN;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const seconds = value.seconds ?? value._seconds;
  if (Number.isFinite(seconds)) return seconds * 1000;
  return typeof value === "string" ? Date.parse(value) : NaN;
}

export function isNewTurfKingsMember({
  clubId,
  joinedAt,
  nowMs = Date.now(),
} = {}) {
  if (clubId !== "turf-kings") return false;
  const joinedMs = membershipTime(joinedAt);
  if (!Number.isFinite(joinedMs) || !Number.isFinite(nowMs) ||
      joinedMs > nowMs) return false;

  // Calculate the anniversary in South African local time.
  const offset = 2 * 60 * 60 * 1000;
  const joined = new Date(joinedMs + offset);
  const year = joined.getUTCFullYear();
  const nextMonth = joined.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, nextMonth + 1, 0)).getUTCDate();
  const anniversary = Date.UTC(
    year, nextMonth, Math.min(joined.getUTCDate(), lastDay),
    joined.getUTCHours(), joined.getUTCMinutes(),
    joined.getUTCSeconds(), joined.getUTCMilliseconds()
  ) - offset;
  return nowMs < anniversary;
}

export function findBookingMember(members = [], playerId = "") {
  const id = String(playerId || "").trim();
  if (!id) return null;
  // Prefer a player/member ID before considering an account UID.
  const exact = members.filter(member =>
    String(member.playerId || "") === id ||
    String(member.id || "") === id
  );
  const matches = exact.length ? exact : members.filter(member =>
    String(member.uid || "") === id ||
    String(member.platformIdentityUid || "") === id
  );
  return matches.length === 1 ? matches[0] : null;
}

export function calculateLateBookingFee({
  policy = {},
  games = [],
  paidGameIds = [],
  clubId = "",
  members = [],
  nowMs = Date.now(),
} = {}) {
  const settings = normalizeLateBookingPolicy(policy);
  if (!Number.isFinite(nowMs)) throw new Error("Invalid payment time.");
  const paid = new Set(paidGameIds.map(String));
  const seen = new Set();
  const lateGames = [];
  if (settings.enabled) {
    for (const game of games) {
      const id = String(game.id || "").trim();
      if (!id) throw new Error("A game reference is required.");
      if (seen.has(id) || paid.has(id)) continue;
      seen.add(id);
      const member = findBookingMember(members, game.playerId);
      if (member && isNewTurfKingsMember({
        clubId,
        joinedAt: member.joinedAt || member.createdAt,
        nowMs,
      })) continue;
      const deadline = bookingDeadline(game.monthKey, settings.deadlineDay);
      if (nowMs >= deadline.closesAtMs) {
        lateGames.push({ id, monthKey: game.monthKey, deadline: deadline.label });
      }
    }
  }
  return {
    lateGames,
    lateGameCount: lateGames.length,
    feePerGame: settings.feePerGame,
    amount: Math.round(lateGames.length * settings.feePerGame * 100) / 100,
  };
}
