import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLateBookingFee,
  findBookingMember,
  isNewTurfKingsMember,
} from "../functions/lateBookingPolicy.mjs";

const time = value => Date.parse(value);

test("Turf Kings exemption ends at the exact one-month anniversary", () => {
  const args = {
    clubId: "turf-kings",
    joinedAt: "2026-09-02T10:00:00+02:00",
  };
  assert.equal(isNewTurfKingsMember({
    ...args, nowMs: time("2026-10-02T09:59:59+02:00"),
  }), true);
  assert.equal(isNewTurfKingsMember({
    ...args, nowMs: time("2026-10-02T10:00:00+02:00"),
  }), false);
});

test("month-end anniversaries handle February and leap years", () => {
  for (const [year, day] of [[2026, 28], [2028, 29]]) {
    const args = {
      clubId: "turf-kings",
      joinedAt: `${year}-01-31T23:30:00+02:00`,
    };
    const anniversary = time(`${year}-02-${day}T23:30:00+02:00`);
    assert.equal(isNewTurfKingsMember({
      ...args, nowMs: anniversary - 1,
    }), true);
    assert.equal(isNewTurfKingsMember({
      ...args, nowMs: anniversary,
    }), false);
  }
});

test("other Clubs and missing or future membership dates are not exempt", () => {
  const nowMs = time("2026-10-02T12:00:00+02:00");
  assert.equal(isNewTurfKingsMember({
    clubId: "another-club", joinedAt: "2026-10-01", nowMs,
  }), false);
  for (const joinedAt of [null, "", "invalid", "2026-11-01"]) {
    assert.equal(isNewTurfKingsMember({
      clubId: "turf-kings", joinedAt, nowMs,
    }), false);
  }
});

test("booking for two people exempts only the new beneficiary", () => {
  const input = {
    clubId: "turf-kings",
    policy: { enabled: true, feePerGame: 7 },
    nowMs: time("2026-10-02T12:00:00+02:00"),
    members: [
      { id: "new", playerId: "new-player", createdAt: "2026-09-20" },
      { id: "old", playerId: "old-player", createdAt: "2025-01-01" },
    ],
    games: [
      { id: "primary:2026-10-07", monthKey: "2026-10", playerId: "new-player" },
      { id: "second:2026-10-07", monthKey: "2026-10", playerId: "old-player" },
    ],
  };
  assert.equal(calculateLateBookingFee(input).amount, 7);
  assert.equal(calculateLateBookingFee({
    ...input, clubId: "another-club",
  }).amount, 14);
});

test("member matching rejects ambiguity and prefers the player identifier", () => {
  const members = [
    { id: "a", playerId: "player-a", uid: "shared" },
    { id: "b", playerId: "player-b", uid: "shared" },
  ];
  assert.equal(findBookingMember(members, "player-a").id, "a");
  assert.equal(findBookingMember(members, "shared"), null);
});

test("Firestore membership timestamps are supported", () => {
  const joined = time("2026-09-20T12:00:00+02:00");
  const nowMs = time("2026-10-02T12:00:00+02:00");
  for (const joinedAt of [
    { seconds: joined / 1000 },
    { toMillis: () => joined },
  ]) {
    assert.equal(isNewTurfKingsMember({
      clubId: "turf-kings", joinedAt, nowMs,
    }), true);
  }
});
