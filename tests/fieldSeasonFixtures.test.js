import test from "node:test";
import assert from "node:assert/strict";
import { reconcileFieldSeasonFixtures as reconcile } from
  "../src/core/fieldSeasonFixtures.js";

const clubs = new Map([["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]]);
const old = [
  { id: "fixture-s-0-1", clubAId: "a", clubBId: "b", status: "scheduled" },
  { id: "fixture-s-0-2", clubAId: "a", clubBId: "c", status: "scheduled" },
  { id: "fixture-s-1-2", clubAId: "b", clubBId: "c", status: "scheduled" },
];
const options = season => ({ season, clubs, actorUid: "owner", now: 123 });

test("late Club gets all missing pairings without replacing existing fixtures", () => {
  const result = reconcile(options({ id: "s", fixtures: old }));
  assert.equal(result.length, 6);
  assert.deepEqual(result.slice(0, 3), old);
  assert.equal(result.filter(f => f.clubBId === "d").length, 3);
  assert.deepEqual(reconcile(options({ id: "s", fixtures: result })), result);
});

test("manual schedule is preserved and missing Club requires explicit scheduling", () => {
  const manual = old.map(f => ({ ...f, scheduledLocal: "2026-10-01T18:00" }));
  assert.throws(
    () => reconcile(options({ id: "s", fixtures: manual })),
    /manually arranged schedule/,
  );
  const three = new Map([...clubs].slice(0, 3));
  assert.deepEqual(reconcile({
    ...options({ id: "s", fixtures: manual }), clubs: three,
  }), manual);
});

test("fixtures are never expanded after play or while a match is live", () => {
  for (const extra of [
    { firstPlayAtMs: 1 },
    { results: [{}] },
    { liveMatches: { one: { status: "live" } } },
  ]) {
    assert.deepEqual(reconcile(options({ id: "s", fixtures: old, ...extra })), old);
  }
});

test("initial automatic schedule includes every unique pairing", () => {
  const result = reconcile(options({ id: "s", fixtures: [] }));
  assert.equal(result.length, 6);
  const pairs = result.map(f => JSON.stringify([f.clubAId, f.clubBId].sort()));
  assert.equal(new Set(pairs).size, 6);
});
