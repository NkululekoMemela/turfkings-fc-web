import {test} from "node:test";
import assert from "node:assert/strict";
import {assertTestSeasonDeletion} from "../functions/fieldTestSeasonDeletionPolicy.mjs";

const input = () => ({
  venue: {
    id: "field-one", ownerUid: "creator",
    league: {activeSeason: {
      id: "season-one", name: "Practice league",
      results: [{id: "test-result"}], liveMatches: {},
    }},
  },
  actorUid: "creator", seasonId: "season-one",
  confirmation: "Practice league", confirmedTest: true,
});
test("creator can explicitly confirm a test season with recorded results", () => {
  assert.equal(assertTestSeasonDeletion(input()).id, "season-one");
});
test("administrators and referees cannot delete the creator's season", () => {
  for (const actorUid of ["administrator", "referee", ""]) {
    assert.throws(() => assertTestSeasonDeletion({...input(), actorUid}), /creator/);
  }
});
test("stale season references are rejected", () => {
  assert.throws(() => assertTestSeasonDeletion({
    ...input(), seasonId: "different",
  }), /changed/);
});
test("exact name and explicit test confirmation are required", () => {
  assert.throws(() => assertTestSeasonDeletion({
    ...input(), confirmation: "practice league",
  }), /exact name/);
  assert.throws(() => assertTestSeasonDeletion({
    ...input(), confirmedTest: false,
  }), /exact name/);
});
test("both live-game representations prevent deletion", () => {
  assert.throws(() => assertTestSeasonDeletion({
    ...input(), liveMatch: {status: "live"},
  }), /live game/);
  const data = input();
  data.venue.league.activeSeason.liveMatches.game = {status: "live"};
  assert.throws(() => assertTestSeasonDeletion(data), /live game/);
});
test("confirmed payment records prevent deletion", () => {
  assert.throws(() => assertTestSeasonDeletion({
    ...input(), bookings: [{
      venueId: "field-one", seasonId: "season-one",
      entries: {player: {paymentStatus: "paid"}},
    }],
  }), /confirmed payments/);
});
test("unpaid bookings are allowed only for the selected Field and season", () => {
  const booking = {
    venueId: "field-one", seasonId: "season-one",
    entries: {player: {paymentStatus: "pending"}},
  };
  assert.equal(assertTestSeasonDeletion({
    ...input(), bookings: [booking],
  }).id, "season-one");
  assert.throws(() => assertTestSeasonDeletion({
    ...input(), bookings: [{...booking, venueId: "other-field"}],
  }), /different Field/);
});
