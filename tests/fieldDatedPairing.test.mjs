import {test} from "node:test";
import assert from "node:assert/strict";
import {selectDatedFieldPairing} from "../src/core/fieldDatedPairing.js";

const season = () => ({
  scheduleVersion: 1, matchDayHistory: [], liveMatches: {},
  matchDays: [
    {id: "one", fixtureIds: ["ab", "cd"]},
    {id: "two", fixtureIds: ["ac"]},
  ],
  fixtures: [
    {id: "ab", matchDayId: "one", clubAId: "a", clubBId: "b", status: "scheduled"},
    {id: "cd", matchDayId: "one", clubAId: "c", clubBId: "d", status: "scheduled"},
    {id: "ac", matchDayId: "two", clubAId: "a", clubBId: "c", status: "scheduled"},
  ],
});
const select = (value, clubAId, clubBId) =>
  selectDatedFieldPairing({season: value, clubAId, clubBId});

test("selects either orientation of a current dated pairing", () => {
  assert.equal(select(season(), "d", "c").fixture.id, "cd");
});
test("rejects future-day pairings and additional games", () => {
  assert.throws(() => select(season(), "a", "c"), /current match day/);
  assert.throws(() => select(season(), "a", "d"), /current match day/);
});
test("closing the previous day unlocks its successor", () => {
  const value = season();
  value.matchDayHistory.push({scheduledMatchDayId: "one"});
  assert.equal(select(value, "a", "c").fixture.id, "ac");
});
test("completed and live fixtures cannot be selected again", () => {
  const value = season();
  value.fixtures[0].status = "completed";
  assert.throws(() => select(value, "a", "b"));
  value.liveMatches.cd = {status: "live"};
  assert.throws(() => select(value, "c", "d"));
});
test("a Club cannot appear twice on the same day", () => {
  const value = season();
  value.fixtures[1].clubAId = "a";
  assert.throws(() => select(value, "a", "b"), /more than once/);
});
