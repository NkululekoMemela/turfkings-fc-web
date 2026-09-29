import test from "node:test";
import assert from "node:assert/strict";
import {
  fieldSeasonHasPlayRecords,
  fieldSeasonCancellationReason,
  fieldSeasonPrizeAmounts,
} from "../src/core/fieldSeasonLifecycle.js";

test("signups and scheduled fixtures alone do not mean play started", () => {
  assert.equal(fieldSeasonHasPlayRecords({
    clubIds: ["club-one"], invitations: { one: { status: "accepted" } },
    fixtures: [{ status: "scheduled" }],
  }), false);
  for (const data of [
    { results: [{}] },
    { matchDayHistory: [{}] },
    { currentEvents: [{}] },
    { allEvents: [{}] },
    { liveMatches: { one: { status: "completed" } } },
    { fixtures: [{ status: "live" }] },
  ]) assert.equal(fieldSeasonHasPlayRecords(data), true);
});

test("cancellation requires a meaningful explanation", () => {
  assert.throws(() => fieldSeasonCancellationReason(""), /Explain/);
  assert.throws(() => fieldSeasonCancellationReason("Too few"), /Explain/);
  assert.throws(() => fieldSeasonCancellationReason("x".repeat(501)), /Explain/);
  assert.equal(
    fieldSeasonCancellationReason("  Not enough Club signups  "),
    "Not enough Club signups"
  );
});

test("all podium prizes are explicit valid currency amounts", () => {
  assert.deepEqual(fieldSeasonPrizeAmounts({
    first: "10000", second: "2500", third: "0",
  }), { first: 10000, second: 2500, third: 0 });
  for (const value of ["", -1, "invalid", Infinity]) {
    assert.throws(() => fieldSeasonPrizeAmounts({
      first: 100, second: value, third: 0,
    }), /valid prize/);
  }
});
