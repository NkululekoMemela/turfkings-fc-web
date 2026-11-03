import {test} from "node:test";
import assert from "node:assert/strict";
import {
  assertClubMatchDayEditable, nextPlayerAvailability,
  createMatchDayReplacement,
} from "../functions/fieldSeasonAvailabilityPolicy.mjs";

const season = {
  status: "active", scheduleVersion: 1, clubIds: ["club"],
  matchDays: [{id: "day", status: "scheduled", fixtureIds: ["game"]}],
  fixtures: [{
    id: "game", matchDayId: "day", status: "scheduled",
    clubAId: "club", clubBId: "opponent",
  }],
  liveMatches: {},
};
const scope = {season, clubId: "club", matchDayId: "day"};
const original = {
  memberId: "original", sourcePlayerId: "player-one",
  invitationStatus: "accepted", paymentStatus: "paid",
  contributionCents: 75000, paidCents: 75000,
};
const replacement = {
  memberId: "cover", sourcePlayerId: "player-two", fullName: "Cover Player",
};

test("a scheduled Club game permits availability changes", () => {
  assert.equal(assertClubMatchDayEditable(scope).fixture.id, "game");
});

test("live, completed and archived games prevent changes", () => {
  for (const status of ["live", "completed"]) {
    assert.throws(() => assertClubMatchDayEditable({
      ...scope, liveMatch: {fixtureId: "game", status},
    }), /started/);
  }
  assert.throws(() => assertClubMatchDayEditable({
    ...scope, season: {...season, matchDayHistory: [
      {scheduledMatchDayId: "day"},
    ]},
  }), /no longer/);
});

test("byes and duplicate Club games cannot receive replacements", () => {
  assert.throws(() => assertClubMatchDayEditable({
    ...scope, season: {...season, fixtures: []},
  }), /one scheduled game/);
  assert.throws(() => assertClubMatchDayEditable({
    ...scope, season: {...season, fixtures: [
      ...season.fixtures, {...season.fixtures[0], id: "duplicate"},
    ]},
  }), /one scheduled game/);
});

test("only the accepted member can set their own availability", () => {
  assert.equal(nextPlayerAvailability({
    entry: original, actorMemberId: "original", available: false,
  }), "unavailable");
  assert.throws(() => nextPlayerAvailability({
    entry: original, actorMemberId: "outsider", available: false,
  }), /Only/);
  assert.throws(() => nextPlayerAvailability({
    entry: original, actorMemberId: "original", available: "false",
  }), /Choose/);
});

test("cover invitation starts pending and leaves season money unchanged", () => {
  const saved = structuredClone(original);
  const result = createMatchDayReplacement({
    original, replacement, originalAvailability: "unavailable",
    actorUid: "captain",
  });
  assert.equal(result.invitationStatus, "pending");
  assert.equal(result.originalMemberId, "original");
  assert.equal(Object.hasOwn(result, "paymentStatus"), false);
  assert.equal(Object.hasOwn(result, "paidCents"), false);
  assert.deepEqual(original, saved);
});

test("available or unpaid places cannot be replaced", () => {
  assert.throws(() => createMatchDayReplacement({
    original, replacement, originalAvailability: "available",
    actorUid: "captain",
  }), /unavailable/);
  assert.throws(() => createMatchDayReplacement({
    original: {...original, paymentStatus: "pending"},
    replacement, originalAvailability: "unavailable", actorUid: "captain",
  }), /paid season place/);
});
