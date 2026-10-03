import {test} from "node:test";
import assert from "node:assert/strict";
import {assertFieldMatchDayProgression} from "../functions/fieldMatchDayProgression.mjs";

const season = () => ({
  scheduleVersion: 1,
  matchDays: [
    {id: "one", roundNo: 1}, {id: "two", roundNo: 2},
    {id: "three", roundNo: 3},
  ],
  matchDayHistory: [],
});
const check = (value, matchDayId) =>
  assertFieldMatchDayProgression({season: value, matchDayId});

test("the first match day is available", () => {
  assert.doesNotThrow(() => check(season(), "one"));
});
test("the next day requires the previous archive", () => {
  const value = season();
  assert.throws(() => check(value, "two"), /End match day 1/);
  value.matchDayHistory.push({scheduledMatchDayId: "one"});
  assert.doesNotThrow(() => check(value, "two"));
});
test("match days cannot be skipped", () => {
  const value = season();
  value.matchDayHistory.push({scheduledMatchDayId: "one"});
  assert.throws(() => check(value, "three"), /End match day 2/);
});
test("testing mode does not bypass review and closure", () => {
  const value = {...season(), allowEarlyStarts: true};
  assert.throws(() => check(value, "two"), /End match day/);
});
test("archived and unknown match days cannot start", () => {
  const value = season();
  value.matchDayHistory.push({id: "one"});
  assert.throws(() => check(value, "one"), /already ended/);
  assert.throws(() => check(value, "unknown"), /published/);
});
