import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leagueBookingScope, leaguePlayerLimit,
  reserveLeaguePlayer, paidLeagueManifest,
} from "../src/core/leagueBookingPolicy.js";

const scope = {
  venueId: "field-one", seasonId: "season-one",
  matchDayId: "day-one", clubId: "club-one",
};
const player = index => ({
  playerId: `player-${index}`, sourcePlayerId: `profile-${index}`,
  fullName: `Player ${index}`,
});

test("booking references separate Fields, seasons, dates and Clubs", () => {
  const original = leagueBookingScope(scope);
  for (const key of Object.keys(scope)) {
    assert.notEqual(original, leagueBookingScope({ ...scope, [key]: "different" }));
  }
  assert.throws(() => leagueBookingScope({ ...scope, matchDayId: "" }));
});

test("capacity is enforced and duplicate bookings consume no extra place", () => {
  let entries = {};
  for (let i = 0; i < 5; i++) {
    entries = reserveLeaguePlayer({ entries, player: player(i), limit: 5 });
  }
  assert.equal(Object.keys(entries).length, 5);
  assert.equal(reserveLeaguePlayer({ entries, player: player(0), limit: 5 }), entries);
  assert.throws(() => reserveLeaguePlayer({ entries, player: player(5), limit: 5 }));
});

test("invalid capacities and unregistered players are rejected", () => {
  for (const value of [0, 4, 31, 5.5, "bad"]) {
    assert.throws(() => leaguePlayerLimit(value));
  }
  assert.throws(() => reserveLeaguePlayer({
    player: { playerId: "guest", fullName: "Guest" }, limit: 10,
  }));
});

test("only paid players from the exact league day enter the manifest", () => {
  const entries = {
    first: { ...player(1), paymentStatus: "paid" },
    second: { ...player(2), paymentStatus: "pending" },
    third: { ...player(3), paymentStatus: "cancelled" },
  };
  const booking = { ...scope, entries };
  assert.deepEqual(paidLeagueManifest({ booking, scope }).map(p => p.playerId),
    ["player-1"]);
  assert.deepEqual(paidLeagueManifest({
    booking, scope: { ...scope, matchDayId: "day-two" },
  }), []);
  assert.deepEqual(paidLeagueManifest({ booking: null, scope }), []);
});

test("duplicate paid profiles appear only once", () => {
  const entry = { ...player(1), paymentStatus: "paid" };
  const booking = { ...scope, entries: { first: entry, duplicate: entry } };
  assert.equal(paidLeagueManifest({ booking, scope }).length, 1);
});
