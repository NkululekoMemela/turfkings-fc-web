import {test} from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFieldDecision, assertFieldDecisionRequester,
  assertFieldDecisionReview,
} from "../functions/fieldDecisionPolicy.mjs";

const venue = {
  ownerUid: "creator",
  league: {activeSeason: {id: "season-one", status: "active"}},
};
const request = {
  status: "pending", seasonId: "season-one",
  basis: "record-version-one", expiresAtMs: 2000,
};
const review = extra => assertFieldDecisionReview({
  venue, actorUid: "creator", request, seasonId: "season-one",
  currentBasis: "record-version-one", now: 1000, ...extra,
});

test("schedule requests retain the exact proposed date, time and reason", () => {
  const parameters = {
    matchDayId: "day-one", dateLocal: "2026-10-10", startTime: "18:00",
  };
  assert.deepEqual(normalizeFieldDecision({
    action: "reschedule_day", reason: "  Field flooded after heavy rain.  ", parameters,
  }), {
    action: "reschedule_day", reason: "Field flooded after heavy rain.", parameters,
  });
});
test("all four decision types accept their required details", () => {
  for (const [action, parameters] of [
    ["delay_remaining", {matchDayId: "day-one", startTime: "19:00"}],
    ["cancel_season", {}],
    ["delete_day_results", {matchDayId: "day-one"}],
  ]) assert.equal(normalizeFieldDecision({
    action, parameters, reason: "Test records require manager review.",
  }).action, action);
});
test("invalid dates, times, reasons and extra details are rejected", () => {
  const input = {
    action: "reschedule_day", reason: "Weather requires a revised schedule.",
    parameters: {matchDayId: "day-one", dateLocal: "2026-02-30", startTime: "18:00"},
  };
  assert.throws(() => normalizeFieldDecision(input), /date/);
  assert.throws(() => normalizeFieldDecision({
    ...input, parameters: {...input.parameters, dateLocal: "2026-10-10", startTime: "25:00"},
  }), /time/);
  assert.throws(() => normalizeFieldDecision({...input, reason: "short"}), /reason/);
  assert.throws(() => normalizeFieldDecision({
    action: "cancel_season", reason: input.reason, parameters: {approved: true},
  }), /unexpected/);
});
test("active junior staff can request but cannot approve", () => {
  assertFieldDecisionRequester({
    venue, staff: {status: "active"}, actorUid: "junior", seasonId: "season-one",
  });
  assert.throws(() => review({actorUid: "junior"}), /creator/);
});
test("inactive staff and outsiders cannot request", () => {
  for (const staff of [null, {status: "pending"}, {status: "rejected"}]) {
    assert.throws(() => assertFieldDecisionRequester({
      venue, staff, actorUid: "outsider", seasonId: "season-one",
    }), /active Field staff/);
  }
});
test("creator can review a current unchanged request", () => {review();});
test("expired, previously reviewed and stale requests cannot be approved", () => {
  assert.throws(() => review({now: 2000}), /expired/);
  assert.throws(() => review({request: {...request, status: "approved"}}), /pending/);
  assert.throws(() => review({currentBasis: "record-version-two"}), /records changed/);
  assert.throws(() => review({seasonId: "different-season"}), /different/);
});
