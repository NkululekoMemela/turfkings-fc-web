const test = require("node:test");
const assert = require("node:assert/strict");
const receipts = require("../functions/fieldLeagueEntryReceipt");
const season = {
  id: "season1", status: "active", announcedAtMs: 1, entryFee: 4500,
  clubIds: ["club1"],
  invitations: {club1: {status: "accepted", clubName: "Example Club"}},
};

function setup({isAdmin = true, current = season} = {}) {
  const rows = new Map();
  const db = {
    doc: path => ({path}),
    getAll: async (...refs) => refs.map(ref => ({
      data: () => rows.get(ref.path),
    })),
    runTransaction: async operation => {
      const writes = [];
      const result = await operation({
        get: async ref => {
          assert.equal(writes.length, 0);
          return {data: () => rows.get(ref.path)};
        },
        set: (ref, value) => writes.push([ref.path, value]),
      });
      for (const [path, value] of writes) rows.set(path, value);
      return result;
    },
  };
  const loadContext = async () => ({
    isAdmin, venue: {league: {activeSeason: structuredClone(current)}},
    staff: {name: "Field Admin"},
  });
  return {
    db, rows, loadContext,
    args: {
      db, loadContext, user: {uid: "admin"}, venueId: "field1",
      seasonId: "season1", clubId: "club1",
      expectedAmountCents: 450000, now: 12345,
    },
  };
}

test("Acceptance remains visible while unpaid and cannot authorize play", async () => {
  const {args} = setup();
  const result = await receipts.view(args);
  assert.equal(result.clubs[0].paid, false);
  assert.throws(() => receipts.assertPaid({
    venueId: "field1", season, clubId: "club1",
  }), /confirm.*payment/);
});

test("Receipt records agreed amount, administrator and time; repeat is idempotent", async () => {
  const {args, rows} = setup();
  await receipts.confirm(args);
  const receipt = rows.get(receipts.pathFor("field1", "season1", "club1"));
  assert.equal(receipt.amountCents, 450000);
  assert.equal(receipt.confirmedByUid, "admin");
  assert.equal(receipt.confirmedByName, "Field Admin");
  assert.equal(receipt.confirmedAtMs, 12345);
  assert.doesNotThrow(() => receipts.assertPaid({
    venueId: "field1", season, clubId: "club1", receipt,
  }));
  assert.equal((await receipts.confirm({...args, now: 99999})).alreadyConfirmed, true);
  assert.equal(receipt.confirmedAtMs, 12345);
});

test("Non-administrators cannot view or confirm receipts", async () => {
  const {args, rows} = setup({isAdmin: false});
  await assert.rejects(receipts.view(args), /administrator/);
  await assert.rejects(receipts.confirm(args), /administrator/);
  assert.equal(rows.size, 0);
});

test("Pending invitation cannot be converted to acceptance by recording receipt", async () => {
  const current = structuredClone(season);
  current.invitations.club1.status = "pending";
  const {args, rows} = setup({current});
  await assert.rejects(receipts.confirm(args), /accept/);
  assert.equal(rows.size, 0);
});

test("Stale season and changed amount cannot create receipts", async () => {
  const {args, rows} = setup();
  await assert.rejects(receipts.confirm({...args, seasonId: "old"}), /active/);
  await assert.rejects(receipts.confirm({...args, expectedAmountCents: 1}), /changed/);
  assert.equal(rows.size, 0);
});

test("Wrong season receipt cannot authorize play", () => {
  assert.throws(() => receipts.assertPaid({
    venueId: "field1", season, clubId: "club1",
    receipt: {
      venueId: "field1", seasonId: "other", clubId: "club1",
      status: "paid", currency: "ZAR", amountCents: 450000,
      confirmedByUid: "admin", confirmedAtMs: 1,
    },
  }), /confirm.*payment/);
});
