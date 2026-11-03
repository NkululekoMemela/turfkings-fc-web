import {test} from "node:test";
import assert from "node:assert/strict";
import {applyFieldScheduleDecision} from "../functions/fieldDecisionSchedule.mjs";

const season = () => ({
  status: "active", scheduleVersion: 1, liveMatches: {}, matchDayHistory: [],
  scheduleSettings: {matchMinutes: 40, halftimeMinutes: 5, turnaroundMinutes: 5},
  matchDays: [
    {id: "day-one", status: "scheduled", dateLocal: "2026-10-10", fixtureIds: ["one", "two"]},
    {id: "day-two", status: "scheduled", dateLocal: "2026-10-17", fixtureIds: ["three"]},
  ],
  fixtures: [
    {id: "one", matchDayId: "day-one", status: "scheduled", scheduledLocal: "2026-10-10T18:00"},
    {id: "two", matchDayId: "day-one", status: "scheduled", scheduledLocal: "2026-10-10T18:50"},
    {id: "three", matchDayId: "day-two", status: "scheduled", scheduledLocal: "2026-10-17T18:00"},
  ],
});
const change = extra => applyFieldScheduleDecision({
  season: season(), actorUid: "creator", now: 1,
  decision: {
    action: "reschedule_day", reason: "Rain has flooded the playing field.",
    parameters: {matchDayId: "day-one", dateLocal: "2026-10-11", startTime: "19:00"},
  }, ...extra,
});
test("approved rescheduling moves one day's games and preserves other days", () => {
  const result = change();
  assert.equal(result.fixtures[0].scheduledLocal, "2026-10-11T19:00");
  assert.equal(result.fixtures[1].scheduledLocal, "2026-10-11T19:50");
  assert.deepEqual(result.fixtures[2], season().fixtures[2]);
  assert.equal(result.matchDays[0].opensAtMs, Date.parse("2026-10-11T00:00:00+02:00"));
});
test("started and archived days cannot be moved wholesale", () => {
  const played = season();
  played.fixtures[0].status = "completed";
  assert.throws(() => change({season: played}), /started/);
  const archived = season();
  archived.matchDayHistory = [{scheduledMatchDayId: "day-one"}];
  assert.throws(() => change({season: archived}), /available/);
});
test("a reschedule cannot reorder days or spill past midnight", () => {
  const decision = {
    action: "reschedule_day", reason: "Rain has flooded the playing field.",
    parameters: {matchDayId: "day-one", dateLocal: "2026-10-18", startTime: "18:00"},
  };
  assert.throws(() => change({decision}), /dates in order/);
  assert.throws(() => change({decision: {
    ...decision, parameters: {...decision.parameters, dateLocal: "2026-10-11", startTime: "23:00"},
  }}), /midnight/);
});
test("invalid fixture references prevent schedule changes", () => {
  const broken = season();
  broken.matchDays[0].fixtureIds.push("missing");
  assert.throws(() => change({season: broken}), /references/);
});
