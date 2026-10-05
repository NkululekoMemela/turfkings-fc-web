import {test} from "node:test";
import assert from "node:assert/strict";
import {buildDatedMatchDayArchive} from "../src/core/fieldMatchDayArchive.js";

const season = () => ({
  scheduleVersion: 1, gameFormat: "5_V_5",
  matchDays: [
    {id: "day-one", dateLocal: "2026-10-03", fixtureIds: ["one", "two"]},
    {id: "day-two", dateLocal: "2026-10-10", fixtureIds: ["three"]},
  ],
  fixtures: [
    {id: "one", matchDayId: "day-one", status: "completed", clubAId: "a", clubBId: "b"},
    {id: "two", matchDayId: "day-one", status: "completed", clubAId: "c", clubBId: "d"},
    {id: "three", matchDayId: "day-two", status: "completed", clubAId: "a", clubBId: "c"},
  ],
  results: ["one", "two", "three"].map((fixtureId, index) => ({
    fixtureId, matchNo: index + 1, status: "completed",
  })),
  allEvents: [1, 2, 3].map(matchNo => ({matchNo})),
  liveMatches: {}, matchDayHistory: [],
});
const archive = value => buildDatedMatchDayArchive({
  season: value, matchDayId: "day-one", actorUid: "manager", now: 1000,
});

test("archives only the selected day's results and events", () => {
  const day = archive(season());
  assert.equal(day.id, "day-one");
  assert.deepEqual(day.results.map(r => r.fixtureId), ["one", "two"]);
  assert.deepEqual(day.allEvents.map(e => e.matchNo), [1, 2]);
});

test("unfinished scheduled fixtures block closure", () => {
  const value = season();
  value.fixtures[1].status = "scheduled";
  assert.throws(() => archive(value), /Finish every/);
});

test("missing or duplicate results block closure", () => {
  const value = season();
  value.results.pop();
  value.results.pop();
  assert.throws(() => archive(value), /Finish every/);
  value.results.push(value.results[0]);
  assert.throws(() => archive(value), /Finish every/);
});

test("live fixtures block closure", () => {
  const value = season();
  value.liveMatches.one = {status: "live"};
  assert.throws(() => archive(value), /Finish every/);
});

test("an archived day cannot be archived again", () => {
  const value = season();
  value.matchDayHistory.push({scheduledMatchDayId: "day-one"});
  assert.throws(() => archive(value), /unarchived/);
});

test("incomplete day fixture references block closure", () => {
  const value = season();
  value.matchDays[0].fixtureIds = ["one"];
  assert.throws(() => archive(value), /incomplete/);
});
