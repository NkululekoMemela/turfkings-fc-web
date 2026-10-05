import {test} from "node:test";
import assert from "node:assert/strict";
import {
  seasonContributionPlan, createSeasonSquadInvitations,
  respondSeasonSquadInvitation, confirmSeasonSquadPayment,
} from "../functions/fieldSeasonSquadPolicy.mjs";

const players = Array.from({length: 6}, (_, index) => ({
  sourcePlayerId: `player-${index}`, memberId: `member-${index}`,
  fullName: `Player ${index}`,
}));
const plan = () => seasonContributionPlan({
  totalCents: 450000, squadSize: 6, gameFormat: "5_V_5",
});
const invitations = () => createSeasonSquadInvitations({
  plan: plan(), players, invitedByUid: "admin", now: 100,
});

test("R4500 across six players is R750 each for the whole season", () => {
  assert.deepEqual(plan().contributions, Array(6).fill(75000));
});

test("uneven contributions preserve the exact total without fractions of cents", () => {
  const value = seasonContributionPlan({
    totalCents: 450000, squadSize: 7, gameFormat: "5_V_5",
  });
  assert.equal(value.contributions.reduce((a, b) => a + b), 450000);
  assert.equal(Math.max(...value.contributions) -
    Math.min(...value.contributions), 1);
});

test("invalid fees and squads smaller than the game format are rejected", () => {
  assert.throws(() => seasonContributionPlan({
    totalCents: 450000.5, squadSize: 6, gameFormat: "5_V_5",
  }), /fee/);
  assert.throws(() => seasonContributionPlan({
    totalCents: 450000, squadSize: 6, gameFormat: "7_V_7",
  }), /squad/);
});

test("invitations start unpaid with an agreed season contribution", () => {
  const items = invitations();
  assert.equal(items.length, 6);
  assert.equal(items[0].contributionCents, 75000);
  assert.equal(items[0].paymentStatus, "pending");
  assert.equal(items[0].invitationStatus, "pending");
});

test("duplicate players or member links cannot consume two squad places", () => {
  assert.throws(() => createSeasonSquadInvitations({
    plan: plan(), players: [...players.slice(0, 5), players[0]],
    invitedByUid: "admin",
  }), /distinct/);
  assert.throws(() => createSeasonSquadInvitations({
    plan: plan(),
    players: players.map((item, index) =>
      index === 5 ? {...item, memberId: players[0].memberId} : item),
    invitedByUid: "admin",
  }), /distinct/);
});

test("only the invited member can accept and acceptance does not mark paid", () => {
  const invitation = invitations()[0];
  assert.throws(() => respondSeasonSquadInvitation({
    invitation, response: "accepted", actorMemberId: "other",
  }), /invited member/);
  const accepted = respondSeasonSquadInvitation({
    invitation, response: "accepted", actorMemberId: "member-0", now: 200,
  });
  assert.equal(accepted.paymentStatus, "pending");
  assert.equal(invitation.invitationStatus, "pending");
  assert.throws(() => respondSeasonSquadInvitation({
    invitation: accepted, response: "declined", actorMemberId: "member-0",
  }), /already/);
});

test("payment requires acceptance and preserves the first confirmation", () => {
  const invitation = invitations()[0];
  assert.throws(() => confirmSeasonSquadPayment({
    invitation, confirmedByUid: "admin",
  }), /accept/);
  const accepted = respondSeasonSquadInvitation({
    invitation, response: "accepted", actorMemberId: "member-0",
  });
  const paid = confirmSeasonSquadPayment({
    invitation: accepted, confirmedByUid: "admin", now: 300,
  });
  assert.equal(paid.paidCents, 75000);
  assert.equal(confirmSeasonSquadPayment({
    invitation: paid, confirmedByUid: "admin", now: 400,
  }), paid);
});
