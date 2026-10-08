// Validation for team payments to the Field account.
const MAX_CENTS = 100000000;
const clean = value => String(value || "").trim();

function cents(value, allowZero = true) {
  if (!Number.isSafeInteger(value) ||
      value < (allowZero ? 0 : 1) || value > MAX_CENTS) {
    throw new Error("Enter a valid amount in rand and cents.");
  }
  return value;
}

function normalizeSettings(input = {}) {
  const bank = input.bank || {};
  const result = {
    seasonPriceCents: cents(input.seasonPriceCents ?? 0),
    matchDayPriceCents: cents(input.matchDayPriceCents ?? 0),
    bank: Object.fromEntries([
      ["accountName", 100], ["bankName", 80], ["accountNumber", 25],
      ["branchCode", 6], ["accountType", 40],
    ].map(([key, max]) => {
      const value = clean(bank[key]);
      if (value.length > max) {
        throw new Error("The banking details are too long.");
      }
      return [key, value];
    })),
  };
  if (result.bank.accountNumber &&
      !/^\d{5,25}$/.test(result.bank.accountNumber)) {
    throw new Error("Enter the Field account number using digits only.");
  }
  if (result.bank.branchCode &&
      !/^\d{6}$/.test(result.bank.branchCode)) {
    throw new Error("Enter a six-digit branch code.");
  }
  return result;
}

function bankReady(bank) {
  return Boolean(bank?.accountName && bank.bankName &&
    /^\d{5,25}$/.test(bank.accountNumber) &&
    /^\d{6}$/.test(bank.branchCode));
}

function canAuthorizeFieldBanking(venue, user, staff) {
  if (!user?.uid) return false;
  return venue?.ownerUid === user.uid || (
    staff?.status === "active" && staff.role === "field_manager"
  );
}

function canSubmitFieldBanking(venue, staff, user) {
  if (!user?.uid) return false;
  return canAuthorizeFieldBanking(venue, user, staff) || (
    staff?.status === "active" &&
    ["field_manager", "assistant_manager", "field_assistant",
      "other_staff", "referee"].includes(staff.role)
  );
}

function canManageField(venue, staff, user) {
  if (!user?.uid) return false;
  return canAuthorizeFieldBanking(venue, user, staff) || (
    staff?.status === "active" && staff.isAdministrator === true &&
    ["field_manager", "assistant_manager",
      "field_assistant", "other_staff"].includes(staff.role)
  );
}

function canManageClub(club, user) {
  if (!club || club.deleted === true ||
      club.status === "deleted" || !user?.uid) return false;
  const list = value => Array.isArray(value) ? value : [];
  if ([club.ownerUid, club.createdByUid, ...list(club.adminUids)]
    .includes(user.uid)) return true;
  const email = user.email_verified === true
    ? clean(user.email).toLowerCase() : "";
  return Boolean(email && [
    ...list(club.adminEmails), ...list(club.captainEmails),
    club.captainEmail, club.captain?.email,
  ].some(value => clean(value).toLowerCase() === email));
}

function localDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Johannesburg",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(now));
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function availableSeason(venue, now = Date.now()) {
  const season = venue?.league?.activeSeason;
  return season?.id && season.status === "active" &&
    Array.isArray(season.fixtures) && season.fixtures.length > 0 &&
    (!season.endsOn || season.endsOn >= localDate(now))
    ? season : null;
}

function bookingPlan({venue, settings, clubId, body, now = Date.now()}) {
  if (!bankReady(settings.bank) || !settings.authorizedByUid) {
    throw new Error("The Field manager must authorize banking before booking.");
  }
  const season = availableSeason(venue, now);
  let seasonId = "";
  let date = "";
  let amountDueCents;
  let label;

  if (body.kind === "season") {
    if (!season || body.seasonId !== season.id ||
        !(season.clubIds || []).includes(clubId)) {
      throw new Error("Choose a started season that includes your Club.");
    }
    seasonId = season.id;
    amountDueCents = cents(settings.seasonPriceCents, false);
    label = season.name || "Field League Season";
  } else if (body.kind === "matchDay") {
    date = body.date;
    if (typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
        new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date ||
        date < localDate(now)) {
      throw new Error("Choose a valid match date from today onwards.");
    }
    if (season && season.fixtures.some(fixture =>
      [fixture.clubAId, fixture.clubBId].includes(clubId) && (
        String(fixture.scheduledLocal || "").slice(0, 10) === date ||
        (season.matchDays || []).some(day =>
          day.dateLocal === date && day.id === fixture.matchDayId
        )
      )
    )) seasonId = season.id;
    amountDueCents = cents(settings.matchDayPriceCents, false);
    label = `Match day · ${date}`;
  } else {
    throw new Error("Choose a whole-season or match-day booking.");
  }

  if (body.expectedAmountCents !== amountDueCents ||
      body.expectedRevision !== settings.revision) {
    throw new Error("The price or banking details changed. Refresh before booking.");
  }
  const id = require("node:crypto").createHash("sha256")
    .update(JSON.stringify([
      body.venueId, clubId, body.kind,
      body.kind === "season" ? seasonId : date,
    ])).digest("hex").slice(0, 32);
  return {id, kind: body.kind, seasonId, date, label, amountDueCents};
}

function assertNoOverlap(plan, bookings) {
  if (!plan.seasonId) return;
  const other = bookings.find(item =>
    item.id !== plan.id && item.status !== "cancelled" &&
    item.seasonId === plan.seasonId && item.kind !== plan.kind
  );
  if (other) {
    throw new Error(
      "This Club has an overlapping season or match-day booking. Use the existing booking."
    );
  }
}

module.exports = {
  cents, normalizeSettings, bankReady,
  canAuthorizeFieldBanking, canSubmitFieldBanking, canManageField,
  canManageClub, localDate, availableSeason,
  bookingPlan, assertNoOverlap,
};
