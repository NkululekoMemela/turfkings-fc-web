import test from "node:test";
import assert from "node:assert/strict";
import {
  bookingDeadline, calculateLateBookingFee, normalizeLateBookingPolicy,
} from "../functions/lateBookingPolicy.mjs";

const games = ["a", "b", "c"].map(id => ({ id, monthKey: "2026-11" }));
const closing = Date.parse("2026-10-31T00:00:00+02:00");

test("fees are opt-in for every Club", () => {
  assert.equal(calculateLateBookingFee({ games, nowMs: closing }).amount, 0);
});

test("South African closing boundary is exact", () => {
  const policy = { enabled: true, feePerGame: 7 };
  assert.equal(calculateLateBookingFee({
    policy, games, nowMs: closing - 1,
  }).amount, 0);
  assert.equal(calculateLateBookingFee({
    policy, games, nowMs: closing,
  }).amount, 21);
});

test("paid games and duplicate selections are not charged", () => {
  const result = calculateLateBookingFee({
    policy: { enabled: true },
    games: [...games, games[0]],
    paidGameIds: ["a"],
    nowMs: closing,
  });
  assert.equal(result.amount, 14);
  assert.equal(result.lateGameCount, 2);
});

test("February deadline respects ordinary and leap years", () => {
  assert.equal(bookingDeadline("2027-03").closesAtMs,
    Date.parse("2027-03-01T00:00:00+02:00"));
  assert.equal(bookingDeadline("2028-03").closesAtMs,
    Date.parse("2028-03-01T00:00:00+02:00"));
});

test("January bookings close in December of the previous year", () => {
  assert.match(bookingDeadline("2027-01").label, /^2026-12-30/);
});

test("different booking months are assessed independently", () => {
  const result = calculateLateBookingFee({
    policy: { enabled: true },
    games: [{ id: "old", monthKey: "2026-11" },
      { id: "future", monthKey: "2026-12" }],
    nowMs: closing,
  });
  assert.equal(result.amount, 7);
});

test("invalid policy and missing dates fail instead of guessing", () => {
  assert.throws(() => normalizeLateBookingPolicy({ feePerGame: -7 }));
  assert.throws(() => bookingDeadline("2026-13"));
  assert.throws(() => calculateLateBookingFee({
    policy: { enabled: true }, games: [{ id: "missing-date" }],
  }));
});
