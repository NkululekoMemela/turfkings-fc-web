import {test} from "node:test";
import assert from "node:assert/strict";
import {seasonPaidManifest} from "../functions/fieldSeasonManifest.mjs";

const scope = {venueId: "field", seasonId: "season", clubId: "club"};
const entry = changes => ({
  memberId: "member", sourcePlayerId: "player", fullName: "Player One",
  invitationStatus: "accepted", paymentStatus: "paid",
  currency: "ZAR", contributionCents: 75000, paidCents: 75000,
  paymentConfirmedByUid: "captain", ...changes,
});
const squad = entries => ({
  ...scope, version: 1, status: "active", entries,
});

test("an accepted fully paid season player is eligible", () => {
  const result = seasonPaidManifest({scope, squad: squad({member: entry()})});
  assert.equal(result.length, 1);
  assert.equal(result[0].sourcePlayerId, "player");
  assert.equal(result[0].contributionCents, 75000);
});

test("pending, declined and unpaid invitations are excluded", () => {
  for (const changes of [
    {invitationStatus: "pending"},
    {invitationStatus: "declined"},
    {paymentStatus: "pending"},
  ]) {
    assert.deepEqual(
      seasonPaidManifest({scope, squad: squad({member: entry(changes)})}), []
    );
  }
});

test("other Fields, seasons, Clubs and inactive squads are rejected", () => {
  for (const changes of [
    {venueId: "other"}, {seasonId: "other"}, {clubId: "other"},
    {status: "cancelled"}, {version: 2},
  ]) {
    assert.throws(() => seasonPaidManifest({
      scope, squad: {...squad({member: entry()}), ...changes},
    }), /does not match/);
  }
});

test("partial payment and missing confirmation cannot enter the lineup", () => {
  for (const changes of [
    {paidCents: 74000}, {paymentConfirmedByUid: ""},
    {currency: "USD"}, {contributionCents: 0},
  ]) {
    assert.throws(() => seasonPaidManifest({
      scope, squad: squad({member: entry(changes)}),
    }), /payment/);
  }
});

test("duplicate player or member links stop lineup generation", () => {
  for (const second of [
    entry({memberId: "second"}),
    entry({sourcePlayerId: "second"}),
  ]) {
    assert.throws(() => seasonPaidManifest({
      scope, squad: squad({first: entry(), second}),
    }), /duplicate/);
  }
});

test("lineup generation preserves stored invitations and payment records", () => {
  const value = squad({member: entry()});
  const original = structuredClone(value);
  seasonPaidManifest({scope, squad: value});
  assert.deepEqual(value, original);
});
