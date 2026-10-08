const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../functions/fieldTeamPaymentService");

const root = "leagueVenues/field1";
const manager = {uid: "manager"};
const staff = {uid: "staff", name: "Client supplied name"};
const settings = {
  seasonPriceCents: 120000,
  matchDayPriceCents: 65000,
  bank: {
    accountName: "Example Field", bankName: "Example Bank",
    accountNumber: "1234567890", branchCode: "123456",
  },
};

function database() {
  const rows = new Map([
    [root, {ownerUid: "manager", name: "Example Field"}],
    [`${root}/staff/staff`, {
      name: "Gambu", status: "active", role: "field_assistant",
      isAdministrator: true,
    }],
  ]);
  const db = {
    rows,
    doc: path => ({path}),
    collection: path => ({
      doc: id => ({path: `${path}/${id}`}),
      where: (field, operator, expected) => {
        assert.equal(operator, "==");
        return {collectionPath: path, field, expected};
      },
    }),
    async runTransaction(operation) {
      const writes = [];
      const read = async ref => {
        assert.equal(writes.length, 0, "Reads must precede writes");
        if (ref.collectionPath) {
          const prefix = `${ref.collectionPath}/`;
          return {docs: [...rows].filter(([path, value]) =>
            path.startsWith(prefix) &&
            !path.slice(prefix.length).includes("/") &&
            value[ref.field] === ref.expected
          ).map(([path, value]) => ({
            id: path.slice(prefix.length),
            data: () => structuredClone(value),
          }))};
        }
        const value = rows.get(ref.path);
        return {
          exists: value !== undefined,
          data: () => value === undefined ? undefined : structuredClone(value),
        };
      };
      const tx = {
        get: read,
        getAll: (...refs) => Promise.all(refs.map(read)),
        set: (ref, value) => writes.push([ref.path, value, false]),
        update: (ref, value) => writes.push([ref.path, value, true]),
      };
      const result = await operation(tx);
      for (const [path, value, merge] of writes) {
        rows.set(path, structuredClone(
          merge ? {...rows.get(path), ...value} : value
        ));
      }
      return result;
    },
  };
  return db;
}

async function submit(db) {
  return service.saveBankingSettings({
    db, user: staff, venueId: "field1",
    settings, expectedRevision: 0,
  });
}

function review(db, user = manager, decision = "authorize") {
  return service.reviewBankingSettings({
    db, user, venueId: "field1", requestId: "staff", decision,
  });
}


function seedLegacyBankingRequest(db) {
  db.rows.set(`${root}/bankingRequests/staff`, {
    settings, baseRevision: 0,
    submittedByUid: "staff", submittedByName: "Gambu",
    managerUid: "manager", submittedAtMs: Date.now(),
    status: "pending",
  });
}

test("All active Field staff roles activate banking immediately", async () => {
  for (const role of [
    "field_manager", "assistant_manager", "field_assistant",
    "other_staff", "referee",
  ]) {
    const db = database();
    Object.assign(db.rows.get(`${root}/staff/staff`), {
      role, isAdministrator: false,
    });
    assert.deepEqual(await submit(db), {saved: true});
    const active = db.rows.get(`${root}/paymentConfig/current`);
    assert.equal(active.authorizedByUid, "staff");
    assert.equal(active.bank.accountNumber, settings.bank.accountNumber);
    assert.equal(active.revision, 1);
    assert.equal(db.rows.has(`${root}/bankingRequests/staff`), false);
  }
});

test("Pending, removed and inactive staff cannot activate banking", async () => {
  for (const status of ["pending", "removed", "inactive"]) {
    const db = database();
    db.rows.get(`${root}/staff/staff`).status = status;
    await assert.rejects(submit(db));
    assert.equal(db.rows.has(`${root}/paymentConfig/current`), false);
  }
});

test("Stale revisions cannot overwrite active banking", async () => {
  const db = database();
  await submit(db);
  const before = structuredClone(db.rows.get(`${root}/paymentConfig/current`));
  await assert.rejects(submit(db), /Payment settings changed/);
  assert.deepEqual(db.rows.get(`${root}/paymentConfig/current`), before);
});

test("Saving supersedes the staff member's old pending request", async () => {
  const db = database();
  seedLegacyBankingRequest(db);
  await submit(db);
  assert.equal(db.rows.get(`${root}/bankingRequests/staff`).status, "superseded");
  assert.equal(db.rows.get(`${root}/paymentConfig/current`).authorizedByUid, "staff");
});

test("Owner and active staff can update banking and prices with an audit", async () => {
  const db = database();
  await service.saveBankingSettings({
    db, user: manager, venueId: "field1", settings, expectedRevision: 0,
  });
  await service.saveBankingSettings({
    db, user: staff, venueId: "field1",
    settings: {
      ...settings, matchDayPriceCents: 70000,
      bank: {...settings.bank, accountNumber: "9876543210"},
    },
    expectedRevision: 1,
  });
  const active = db.rows.get(`${root}/paymentConfig/current`);
  assert.equal(active.matchDayPriceCents, 70000);
  assert.equal(active.bank.accountNumber, "9876543210");
  assert.equal(active.authorizedByUid, "staff");
  assert.equal(active.revision, 2);
  assert.equal([...db.rows.keys()].filter(key =>
    key.startsWith(`${root}/paymentAudit/`)
  ).length, 2);
});

test("Unregistered and camera users cannot submit", async () => {
  const db = database();
  for (const user of [{uid: "outsider"}, {...staff, cameraSession: true}]) {
    await assert.rejects(service.saveBankingSettings({
      db, user, venueId: "field1", settings, expectedRevision: 0,
    }));
  }
  assert.equal(db.rows.has(`${root}/paymentConfig/current`), false);
});

// Banking manager notification tests
const {notifyManager} = require("../functions/fieldTeamPaymentNotifications");

function addDevices(db, devices) {
  db.collectionGroup = name => {
    assert.equal(name, "notificationDevices");
    return {
      where: (key, operation, uid) => {
        assert.equal(key, "firebaseUid");
        assert.equal(operation, "==");
        assert.equal(uid, "manager");
        return {
          get: async () => ({
            docs: devices.map((data, index) => ({
              data: () => data, ref: {path: `devices/${index}`},
            })),
          }),
        };
      },
    };
  };
}

function notify(db, sendBatch) {
  return notifyManager({
    db, sendBatch, venueId: "field1", requestId: "staff",
  });
}

test("Notification names staff, deduplicates tokens and sends once", async () => {
  const db = database();
  seedLegacyBankingRequest(db);
  addDevices(db, [
    {firebaseUid: "manager", enabled: true, token: "token1"},
    {firebaseUid: "manager", enabled: true, token: "token1"},
    {firebaseUid: "manager", enabled: false, token: "disabled"},
    {firebaseUid: "outsider", enabled: true, token: "wrong-owner"},
  ]);
  let calls = 0;
  const send = async message => {
    calls++;
    assert.equal(message.tokenRecords.length, 1);
    assert.match(message.body, /Gambu.*5 Asides Near Me/);
    assert.equal(message.body.includes("1234567890"), false);
    assert.equal(message.data.venueId, "field1");
    assert.equal(message.data.type, "field_manager_approval");
    return {successCount: 1};
  };
  assert.equal((await notify(db, send)).status, "sent");
  assert.equal((await notify(db, send)).status, "skipped");
  assert.equal(calls, 1);
});

test("No registered device leaves the request pending", async () => {
  const db = database();
  seedLegacyBankingRequest(db);
  addDevices(db, []);
  const result = await notify(db, async () => {
    assert.fail("Must not send without a device");
  });
  assert.equal(result.status, "no_devices");
  assert.equal(db.rows.get(`${root}/bankingRequests/staff`).status, "pending");
});

test("Failed notification can retry successfully", async () => {
  const db = database();
  seedLegacyBankingRequest(db);
  addDevices(db, [{firebaseUid: "manager", enabled: true, token: "token1"}]);
  await assert.rejects(notify(db, async () => ({successCount: 0})));
  assert.equal(
    db.rows.get(`${root}/bankingRequests/staff`).managerPush.status, "failed"
  );
  assert.equal((await notify(db, async () => ({successCount: 1}))).status, "sent");
});

test("Reviewed requests do not send approval notifications", async () => {
  const db = database();
  seedLegacyBankingRequest(db);
  await review(db, manager, "reject");
  assert.equal((await notify(db, async () => {
    assert.fail("Must not send for a reviewed request");
  })).status, "skipped");
});

test("Changed manager blocks notification to the previous manager", async () => {
  const db = database();
  seedLegacyBankingRequest(db);
  db.rows.get(root).ownerUid = "new-manager";
  assert.equal((await notify(db, async () => {
    assert.fail("Must not send to the previous manager");
  })).status, "skipped");
});

// Club Signup access tests
function signupDatabase() {
  const db = database();
  db.getAll = async (...refs) => refs.map(ref => {
    const value = db.rows.get(ref.path);
    return {
      exists: value !== undefined,
      data: () => value === undefined ? undefined : structuredClone(value),
    };
  });
  db.rows.set("clubs/club1", {name: "Example Club", ownerUid: "leader"});
  db.rows.set("clubFieldMemberships/club1", {
    venueId: "field1", status: "active",
  });
  return db;
}

test("Registered Club leader can access Signup and approved banking", async () => {
  const db = signupDatabase();
  await service.saveBankingSettings({
    db, user: manager, venueId: "field1",
    settings, expectedRevision: 0,
  });
  const result = await service.signupView({
    db, user: {uid: "leader"}, venueId: "field1", clubId: "club1",
  });
  assert.equal(result.canBook, true);
  assert.equal(result.club.name, "Example Club");
  assert.equal(result.settings.bank.accountNumber, "1234567890");
  assert.equal(result.canManageBanking, false);
});

test("Legacy pending banking is not exposed as an active account", async () => {
  const db = signupDatabase();
  seedLegacyBankingRequest(db);
  const result = await service.signupView({
    db, user: {uid: "leader"}, venueId: "field1", clubId: "club1",
  });
  assert.equal(result.settings, null);
});

test("Player and Club registered elsewhere cannot access booking", async () => {
  const db = signupDatabase();
  await assert.rejects(service.signupView({
    db, user: {uid: "player"}, venueId: "field1", clubId: "club1",
  }));
  db.rows.get("clubFieldMemberships/club1").venueId = "other-field";
  await assert.rejects(service.signupView({
    db, user: {uid: "leader"}, venueId: "field1", clubId: "club1",
  }));
});

test("Field staff can access Signup administration without a Club", async () => {
  const db = signupDatabase();
  const result = await service.signupView({
    db, user: staff, venueId: "field1",
  });
  assert.equal(result.canManageBanking, true);
  assert.equal(result.canBook, false);
  assert.equal(result.club, null);
});

// Team booking policy tests
const paymentPolicy = require("../functions/fieldTeamPaymentPolicy");
const bookingNow = Date.parse("2026-10-05T12:00:00Z");

function dayPlan(overrides = {}) {
  return paymentPolicy.bookingPlan({
    venue: {},
    settings: {...settings, revision: 1, authorizedByUid: "manager"},
    clubId: "club1", now: bookingNow,
    body: {
      venueId: "field1", kind: "matchDay", date: "2026-10-06",
      expectedAmountCents: 65000, expectedRevision: 1, ...overrides,
    },
  });
}

test("Match-day booking works off-season and has a stable ID", () => {
  const plan = dayPlan();
  assert.equal(plan.date, "2026-10-06");
  assert.equal(plan.amountDueCents, 65000);
  assert.equal(plan.seasonId, "");
  assert.equal(plan.id, dayPlan().id);
});

test("Invalid dates and changed prices are rejected", () => {
  for (const date of ["2026-02-30", "2026-10-04", "tomorrow"]) {
    assert.throws(() => dayPlan({date}), /valid match date/);
  }
  assert.throws(() => dayPlan({expectedAmountCents: 1}), /price or banking/);
  assert.throws(() => dayPlan({expectedRevision: 0}), /price or banking/);
});

test("Season booking is unavailable off-season", () => {
  assert.throws(() => dayPlan({
    kind: "season", seasonId: "missing",
  }), /started season/);
});

test("Covered match-day and season bookings cannot overlap", () => {
  assert.throws(() => paymentPolicy.assertNoOverlap(
    {id: "day1", kind: "matchDay", seasonId: "season1"},
    [{id: "season-booking", kind: "season", seasonId: "season1", status: "pending"}],
  ), /overlapping/);
  assert.doesNotThrow(() => paymentPolicy.assertNoOverlap(
    {id: "day1", kind: "matchDay", seasonId: "season1"},
    [{id: "season-booking", kind: "season", seasonId: "season1", status: "cancelled"}],
  ));
});

// Team booking storage tests
async function bookingDatabase() {
  const db = signupDatabase();
  await service.saveBankingSettings({
    db, user: manager, venueId: "field1",
    settings, expectedRevision: 0,
  });
  return db;
}

function book(db, overrides = {}, user = {uid: "leader"}) {
  return service.createTeamBooking({
    db, user, now: bookingNow,
    body: {
      venueId: "field1", clubId: "club1", kind: "matchDay",
      date: "2026-10-06", expectedAmountCents: 65000,
      expectedRevision: 1, ...overrides,
    },
  });
}

test("Booking is unpaid, uses server banking, and is not duplicated", async () => {
  const db = await bookingDatabase();
  const first = (await book(db, {
    bank: {accountNumber: "fake"}, amountPaidCents: 65000,
  })).booking;
  const second = (await book(db)).booking;
  assert.equal(first.id, second.id);
  assert.equal(first.amountPaidCents, 0);
  assert.equal(first.status, "pending");
  assert.equal(first.bank.accountNumber, "1234567890");
  assert.equal(first.amountDueCents, 65000);
  assert.equal([...db.rows.keys()].filter(
    path => path.startsWith(`${root}/teamPayments/`)
  ).length, 1);
  assert.equal(db.rows.get(`${root}/paymentLocks/club1`).bookingId, first.id);
});

test("Player and unregistered Club cannot create bookings", async () => {
  const db = await bookingDatabase();
  await assert.rejects(book(db, {}, {uid: "player"}), /admin or leader/);
  db.rows.get("clubFieldMemberships/club1").status = "inactive";
  await assert.rejects(book(db), /admin or leader/);
  assert.equal([...db.rows.keys()].some(
    path => path.startsWith(`${root}/teamPayments/`)
  ), false);
});

test("Changed quote cannot create a booking", async () => {
  const db = await bookingDatabase();
  await assert.rejects(book(db, {expectedAmountCents: 1}), /price or banking/);
  await assert.rejects(book(db, {expectedRevision: 0}), /price or banking/);
});

test("Season booking blocks a covered match day but permits other dates", async () => {
  const db = await bookingDatabase();
  db.rows.get(root).league = {activeSeason: {
    id: "season1", name: "Season One", status: "active",
    endsOn: "2026-12-01", clubIds: ["club1"],
    fixtures: [{
      clubAId: "club1", clubBId: "club2",
      scheduledLocal: "2026-10-06T18:00",
    }],
  }};
  await book(db, {
    kind: "season", seasonId: "season1", expectedAmountCents: 120000,
  });
  await assert.rejects(book(db), /overlapping/);
  assert.equal((await book(db, {date: "2026-10-07"})).booking.kind, "matchDay");
});

// Team payment reporting and receipt tests
async function paymentDatabase() {
  const db = await bookingDatabase();
  const originalCollection = db.collection;
  db.collection = path => {
    const collection = originalCollection(path);
    const snapshot = query => ({
      docs: [...db.rows].filter(([key, value]) =>
        key.startsWith(`${path}/`) &&
        !key.slice(path.length + 1).includes("/") &&
        (!query || value[query.field] === query.expected)
      ).map(([key, value]) => ({
        id: key.slice(path.length + 1),
        data: () => structuredClone(value),
      })),
    });
    return {
      ...collection,
      get: async () => snapshot(),
      where: (...args) => {
        const query = collection.where(...args);
        return {...query, get: async () => snapshot(query)};
      },
    };
  };
  return db;
}

function report(db, bookingId, user = {uid: "leader"}) {
  return service.reportTeamTransfer({
    db, bookingId, user, venueId: "field1", now: bookingNow,
  });
}

function verify(db, bookingId, receivedCents, user = manager) {
  return service.verifyTeamReceipt({
    db, bookingId, receivedCents, user, venueId: "field1", now: bookingNow,
  });
}

test("Transfer report remains unpaid and cannot be submitted by another user", async () => {
  const db = await paymentDatabase();
  const booking = (await book(db)).booking;
  await assert.rejects(report(db, booking.id, {uid: "outsider"}));
  await report(db, booking.id);
  await report(db, booking.id);
  const stored = db.rows.get(`${root}/teamPayments/${booking.id}`);
  assert.equal(stored.awaitingVerification, true);
  assert.equal(stored.amountPaidCents, 0);
  assert.equal(stored.status, "pending");
});

test("Club leader and referee cannot confirm receipt", async () => {
  const db = await paymentDatabase();
  const booking = (await book(db)).booking;
  await assert.rejects(verify(db, booking.id, 65000, {uid: "leader"}));
  db.rows.set(`${root}/staff/referee`, {
    role: "referee", status: "active", isAdministrator: true,
  });
  await assert.rejects(verify(db, booking.id, 65000, {uid: "referee"}));
});

test("Partial and full receipts create only the newly received amounts", async () => {
  const db = await paymentDatabase();
  const booking = (await book(db)).booking;
  await report(db, booking.id);
  await verify(db, booking.id, 20000);
  assert.equal(db.rows.get(`${root}/teamPayments/${booking.id}`).status, "part_paid");
  await assert.rejects(verify(db, booking.id, 10000));
  await assert.rejects(verify(db, booking.id, 65001));
  await verify(db, booking.id, 65000);
  await verify(db, booking.id, 65000);
  const stored = db.rows.get(`${root}/teamPayments/${booking.id}`);
  assert.equal(stored.status, "paid");
  assert.equal(stored.awaitingVerification, false);
  const receipts = [...db.rows].filter(([key]) =>
    key.startsWith(`${root}/teamPayments/${booking.id}/receipts/`)
  ).map(([, value]) => value.amountCents).sort((a, b) => a - b);
  assert.deepEqual(receipts, [20000, 45000]);
});

test("Club sees its own bookings; Field manager sees Field bookings", async () => {
  const db = await paymentDatabase();
  const booking = (await book(db)).booking;
  db.rows.set(`${root}/teamPayments/other-booking`, {
    clubId: "club2", amountDueCents: 10000, createdAtMs: 1,
  });
  const own = await service.paymentView({
    db, user: {uid: "leader"}, venueId: "field1", clubId: "club1",
  });
  assert.deepEqual(own.bookings.map(item => item.id), [booking.id]);
  const all = await service.paymentView({
    db, user: manager, venueId: "field1",
  });
  assert.equal(all.bookings.length, 2);
  await assert.rejects(service.paymentView({
    db, user: {uid: "leader"}, venueId: "field1", clubId: "club2",
  }));
});

// Complete Signup Club directory tests
test("Directory includes active registered Clubs and excludes others", async () => {
  const db = await paymentDatabase();
  for (const [id, venueId, status, deleted] of [
    ["club2", "field1", "active", false],
    ["inactive", "field1", "inactive", false],
    ["elsewhere", "other-field", "active", false],
    ["deleted", "field1", "active", true],
  ]) {
    db.rows.set(`clubFieldMemberships/${id}`, {venueId, status});
    db.rows.set(`clubs/${id}`, {
      name: id === "club2" ? "A Club With A Long Full Name" : id,
      deleted,
    });
  }
  const result = await service.signupDirectory({
    db, user: {uid: "leader"}, venueId: "field1", clubId: "club1",
  });
  assert.deepEqual(result.clubs.map(club => club.id), ["club2", "club1"]);
  assert.equal(result.clubs[0].fullName, "A Club With A Long Full Name");
  assert.equal(result.clubs[1].isCurrent, true);
  assert.equal(result.clubs[0].isCurrent, false);
});

test("Field manager can load all registered Club rows", async () => {
  const db = await paymentDatabase();
  const result = await service.signupDirectory({
    db, user: manager, venueId: "field1",
  });
  assert.equal(result.canManageBanking, true);
  assert.equal(result.clubs.length, 1);
  assert.equal(result.clubs[0].id, "club1");
});

test("Player cannot obtain the Signup directory", async () => {
  const db = await paymentDatabase();
  await assert.rejects(service.signupDirectory({
    db, user: {uid: "player"}, venueId: "field1", clubId: "club1",
  }));
});

// Cloned matrix booking-state tests
test("Matrix distinguishes pending, paid and cancelled dates without banking data", async () => {
  const db = await paymentDatabase();
  for (const [id, date, status] of [
    ["pending", "2026-10-06", "pending"],
    ["paid", "2026-10-07", "paid"],
    ["partial", "2026-10-08", "part_paid"],
    ["cancelled", "2026-10-09", "cancelled"],
  ]) {
    db.rows.set(`${root}/teamPayments/${id}`, {
      clubId: "club1", kind: "matchDay", date, status,
      bank: settings.bank, reference: "PRIVATE-REFERENCE",
    });
  }
  const result = await service.signupDirectory({
    db, user: manager, venueId: "field1",
  });
  const record = result.signupRecords[0].data;
  assert.deepEqual(record.selectedWeeks, [
    "2026-10-06", "2026-10-07", "2026-10-08",
  ]);
  assert.deepEqual(record.paidWeeks, ["2026-10-07"]);
  assert.equal(record.playerId, "club1");
  assert.equal("bank" in record, false);
  assert.equal("reference" in record, false);
});

test("Paid season covers only this Club's published fixture dates", async () => {
  const db = await paymentDatabase();
  db.rows.get(root).league = {activeSeason: {
    id: "season1", status: "active", endsOn: "2099-12-31",
    clubIds: ["club1"],
    fixtures: [
      {clubAId: "club1", clubBId: "club2", scheduledLocal: "2099-10-06T18:00"},
      {clubAId: "club2", clubBId: "club3", scheduledLocal: "2099-10-07T18:00"},
    ],
  }};
  db.rows.set(`${root}/teamPayments/season-booking`, {
    clubId: "club1", kind: "season", seasonId: "season1", status: "paid",
  });
  const result = await service.signupDirectory({
    db, user: manager, venueId: "field1",
  });
  assert.deepEqual(result.signupRecords[0].data.selectedWeeks, ["2099-10-06"]);
  assert.deepEqual(result.signupRecords[0].data.paidWeeks, ["2099-10-06"]);
});

// Field booking settings permissions
function saveBookingSettings(db, user, overrides = {}) {
  return service.saveFieldBookingSettings({
    db, user, venueId: "field1",
    settings: {
      maxPlayers: 12,
      lateBookingFee: {enabled: true, feePerGame: 7},
      ...overrides,
    },
    now: bookingNow,
  });
}

test("Field manager and active administrator can save Field booking settings", async () => {
  for (const user of [manager, staff]) {
    const db = database();
    db.rows.get(root).bookingSettings = {existingOption: "preserved"};
    const result = await saveBookingSettings(db, user);
    assert.equal(result.bookingSettings.maxPlayers, 12);
    assert.equal(result.bookingSettings.existingOption, "preserved");
    assert.equal(result.bookingSettings.lateBookingFee.enabled, true);
    assert.equal(db.rows.get(root).bookingSettings.maxPlayers, 12);
    assert.equal([...db.rows.keys()].some(key =>
      key.startsWith(`${root}/paymentAudit/`)
    ), true);
  }
});

test("Club leader and non-administrator staff cannot save Field settings", async () => {
  for (const user of [{uid: "leader"}, staff]) {
    const db = database();
    db.rows.get(`${root}/staff/staff`).isAdministrator = false;
    await assert.rejects(saveBookingSettings(db, user));
    assert.equal(db.rows.get(root).bookingSettings, undefined);
  }
});

test("Invalid capacity or late fee leaves Field settings unchanged", async () => {
  for (const overrides of [
    {maxPlayers: 0},
    {maxPlayers: 101},
    {maxPlayers: 2.5},
    {lateBookingFee: {enabled: true, feePerGame: -1}},
    {lateBookingFee: {enabled: true, feePerGame: 7.123}},
  ]) {
    const db = database();
    await assert.rejects(saveBookingSettings(db, manager, overrides));
    assert.equal(db.rows.get(root).bookingSettings, undefined);
  }
});
