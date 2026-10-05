import {test} from "node:test";
import assert from "node:assert/strict";
import {buildFieldFixturePosterRows} from "../src/core/fieldFixturePoster.js";

const teams = [
  {id: "a", label: "Alpha FC"},
  {id: "b", label: "Bravo FC"},
  {id: "c", label: "Charlie FC"},
];
const season = {
  name: "Test League",
  matchDays: [
    {id: "one", roundNo: 1, dateLocal: "2026-10-10", byeClubIds: ["c"]},
    {id: "two", roundNo: 2, dateLocal: "2026-10-17", byeClubIds: ["b"]},
  ],
  fixtures: [
    {id: "ab", matchDayId: "one", clubAId: "a", clubBId: "b",
      scheduledLocal: "2026-10-10T18:00", status: "scheduled"},
    {id: "ca", matchDayId: "two", clubAId: "c", clubBId: "a",
      scheduledLocal: "2026-10-17T19:00", status: "completed"},
  ],
  liveMatches: {},
};

test("league poster contains every fixture and bye with dates and times", () => {
  const rows = buildFieldFixturePosterRows({season, teams});
  assert.equal(rows.length, 4);
  assert.equal(rows[0].nameA, "Alpha FC");
  assert.equal(rows[0].nameB, "Bravo FC");
  assert.equal(rows[0].date, "10 Oct 2026");
  assert.equal(rows[0].time, "18:00");
  assert.equal(rows[2].date, "17 Oct 2026");
  assert.equal(rows[2].time, "19:00");
  assert.equal(rows[2].status, "Completed");
});

test("own Club poster includes home and away games without other Clubs' byes", () => {
  const rows = buildFieldFixturePosterRows({season, teams, clubId: "a"});
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => [row.clubAId, row.clubBId]),
    [["a", "b"], ["c", "a"]]);
});

test("own Club poster includes its bye and excludes unrelated games", () => {
  const rows = buildFieldFixturePosterRows({season, teams, clubId: "c"});
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nameA, "Charlie FC");
  assert.equal(rows[0].nameB, "BYE");
  assert.equal(rows[0].time, "");
  assert.equal(rows[0].date, "10 Oct 2026");
  assert.equal(rows[1].clubAId, "c");
});

test("legacy undated fixtures remain visible without invented dates", () => {
  const rows = buildFieldFixturePosterRows({
    season: {fixtures: [{id: "old", clubAId: "a", clubBId: "b"}]},
    teams,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "Date to be announced");
  assert.equal(rows[0].time, "");
});

test("live status overrides a fixture's scheduled status", () => {
  const rows = buildFieldFixturePosterRows({
    season: {...season, liveMatches: {ab: {status: "live"}}}, teams,
  });
  assert.equal(rows[0].status, "Live");
});

test("export does not change stored fixtures or match days", () => {
  const before = JSON.stringify(season);
  buildFieldFixturePosterRows({season, teams, clubId: "a"});
  assert.equal(JSON.stringify(season), before);
});

test("single fixture advert contains its date, kickoff and opponents without byes", () => {
  const rows = buildFieldFixturePosterRows({
    season, teams, fixtureId: "ca",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nameA, "Charlie FC");
  assert.equal(rows[0].nameB, "Alpha FC");
  assert.equal(rows[0].date, "17 Oct 2026");
  assert.equal(rows[0].time, "19:00");
});

test("a removed fixture cannot export an unrelated game", () => {
  assert.deepEqual(buildFieldFixturePosterRows({
    season, teams, fixtureId: "removed",
  }), []);
});
