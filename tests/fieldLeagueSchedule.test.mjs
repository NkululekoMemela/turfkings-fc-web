import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFieldLeagueSchedule, validLeagueDate,
} from "../src/core/fieldLeagueSchedule.js";

function schedule(count, extra = {}) {
  return buildFieldLeagueSchedule({
    seasonId: "season-test",
    clubs: new Map(Array.from({ length: count }, (_, i) =>
      [`club-${i}`, `Club ${i}`])),
    startsOn: "2026-10-03", ...extra,
  });
}

for (const count of [3, 6, 10]) {
  test(`${count} Clubs: unique pairings and one appearance per day`, () => {
    const { fixtures, matchDays } = schedule(count);
    assert.equal(fixtures.length, count * (count - 1) / 2);
    const pairs = fixtures.map(f =>
      [f.clubAId, f.clubBId].sort().join("|"));
    assert.equal(new Set(pairs).size, pairs.length);
    for (const day of matchDays) {
      const games = fixtures.filter(f => f.matchDayId === day.id);
      assert.equal(games.length, Math.floor(count / 2));
      const appearances = games.flatMap(f => [f.clubAId, f.clubBId]);
      assert.equal(new Set(appearances).size, appearances.length);
      assert.equal(day.byeClubIds.length, count % 2);
    }
    assert.equal(matchDays[1].dateLocal, "2026-10-10");
    assert.equal(fixtures[0].matchSeconds, 2400);
  });
}

test("calendar validation rejects impossible dates", () => {
  assert.equal(validLeagueDate("2026-02-30"), false);
  assert.equal(validLeagueDate("2028-02-29"), true);
  assert.throws(() => schedule(6, { startsOn: "2026-02-30" }));
});

test("a match night cannot spill past midnight", () => {
  assert.throws(() => schedule(10, { startTime: "22:00" }));
});

test("weekly rounds cross month and year boundaries", () => {
  const result = schedule(6, { startsOn: "2026-12-28" });
  assert.equal(result.matchDays[1].dateLocal, "2027-01-04");
});
