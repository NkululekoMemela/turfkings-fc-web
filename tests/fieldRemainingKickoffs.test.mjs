import {test} from "node:test";
import assert from "node:assert/strict";
import {rescheduleRemainingKickoffs} from "../src/core/fieldRemainingKickoffs.js";

const now = Date.parse("2026-10-03T19:00:00+02:00");
const season = () => ({
  matchDays: [{id: "day", dateLocal: "2026-10-03", status: "scheduled"}],
  fixtures: [
    {id: "played", matchDayId: "day", status: "completed", scheduledLocal: "2026-10-03T18:00"},
    {id: "next", matchDayId: "day", status: "scheduled", scheduledLocal: "2026-10-03T19:00"},
    {id: "last", matchDayId: "day", status: "scheduled", scheduledLocal: "2026-10-03T19:50"},
  ],
  results: [{fixtureId: "played", completedAtMs: now - 600000}],
  liveMatches: {}, matchDayHistory: [],
});
const move = (value, startTime = "19:10", liveMatch = null) =>
  rescheduleRemainingKickoffs({season: value, matchDayId: "day",
    startTime, actorUid: "manager", liveMatch, now});

test("moves remaining games at 50-minute intervals and preserves played fixtures", () => {
  const value = season();
  const result = move(value);
  assert.deepEqual(result.fixtures[0], value.fixtures[0]);
  assert.equal(result.fixtures[1].scheduledLocal, "2026-10-03T19:10");
  assert.equal(result.fixtures[2].scheduledLocal, "2026-10-03T20:00");
});
test("rejects past kickoffs and midnight overflow", () => {
  assert.throws(() => move(season(), "18:59"), /future/);
  assert.throws(() => move(season(), "23:00"), /midnight/);
});
test("a live fixture remains unchanged and blocks overlapping kickoffs", () => {
  const value = season();
  value.liveMatches.next = {status: "live"};
  const live = {fixtureId: "next", status: "live", secondsLeft: 1200};
  assert.throws(() => move(value, "19:10", live), /finish/);
  const result = move(value, "19:30", live);
  assert.deepEqual(result.fixtures[1], value.fixtures[1]);
  assert.equal(result.fixtures[2].scheduledLocal, "2026-10-03T19:30");
});
test("archived days cannot be changed", () => {
  const value = season();
  value.matchDayHistory.push({scheduledMatchDayId: "day"});
  assert.throws(() => move(value), /no longer/);
});
