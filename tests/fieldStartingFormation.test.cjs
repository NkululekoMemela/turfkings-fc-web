const test = require("node:test");
const assert = require("node:assert/strict");
let build;
test.before(async () => {
  ({build} = await import("../functions/fieldStartingFormation.mjs"));
});

function setup(count = 6) {
  const fixture = {clubAId: "a", clubBId: "b", matchDayId: "day"};
  const season = {gameFormat: "5_V_5", savedLineups: {}};
  const squads = {};
  const squadFingerprints = {a: "fingerprint-a", b: "fingerprint-b"};
  for (const clubId of ["a", "b"]) {
    squads[clubId] = Array.from({length: count}, (_, i) => ({
      fullName: `${clubId} Player ${i}`, clubId,
    }));
    const lineup = {
      formationId: "1-2-1",
      positions: Object.fromEntries([0, 1, 2, 3, 4].map(i =>
        [`p${i + 1}`, squads[clubId][i].fullName])),
      benchSnapshot: squads[clubId].slice(5).map(p => p.fullName),
      matchDayId: "day", squadFingerprint: squadFingerprints[clubId],
      meta: {savedByRole: "captain"},
    };
    season.savedLineups[clubId] = {"5": {variants: {captain: lineup}}};
  }
  return {season, fixture, squads, squadFingerprints};
}

test("Kickoff preserves exact formation, positions and substitute", () => {
  const args = setup();
  const saved = args.season.savedLineups.a["5"].variants.captain;
  const before = structuredClone(args);
  const result = build(args);
  assert.equal(result.startingLineups.a.formationId, saved.formationId);
  assert.deepEqual(result.startingLineups.a.positions, saved.positions);
  assert.deepEqual(result.startingLineups.a.benchSnapshot, saved.benchSnapshot);
  assert.deepEqual(args, before);
});

test("Five-player squad starts with no substitute", () => {
  assert.deepEqual(build(setup(5)).startingLineups.a.benchSnapshot, []);
});

test("Captain formation takes precedence over administrator variant", () => {
  const args = setup();
  const variants = args.season.savedLineups.a["5"].variants;
  variants.admin = {...variants.captain, formationId: "2-0-2"};
  assert.equal(build(args).startingLineups.a.formationId, "1-2-1");
});

test("Missing, stale, incomplete and duplicated saved lineups fall back automatically", () => {
  for (const mutate of [
    args => delete args.season.savedLineups.a,
    args => args.squadFingerprints.a = "changed",
    args => args.season.savedLineups.a["5"].variants.captain.positions.p1 = null,
    args => {
      const p = args.season.savedLineups.a["5"].variants.captain.positions;
      p.p2 = p.p1;
    },
    args => args.season.savedLineups.a["5"].variants.captain.matchDayId = "other",
  ]) {
    const args = setup();
    mutate(args);
    const result = build(args);
    assert.equal(Object.keys(result.startingLineups.a.positions).length, 5);
    assert.equal(new Set(Object.values(result.startingLineups.a.positions)).size, 5);
    assert.equal(result.startingLineups.a.meta.automatic, true);
  }
});

test("Other game formats retain their existing start path", () => {
  const args = setup();
  args.season.gameFormat = "6_V_6";
  assert.deepEqual(build(args), {startingLineups: {}, sourceFormations: {}});
});

test("Automatic outfield positions use mentality and shooting without selecting GK", () => {
  const args = setup();
  args.season.savedLineups = {};
  for (const id of ["a", "b"]) {
    args.squads[id].forEach((p, i) => {
      p.mentality = i < 2 ? 1 : 5;
      p.shooting = i < 2 ? 1 : 5;
    });
  }
  const result = build(args);
  assert.equal(result.startingLineups.a.positions.p1, "a Player 2");
  assert.equal(result.startingLineups.a.positions.p2, "a Player 3");
  assert.equal(result.startingLineups.a.positions.p3, "a Player 0");
  assert.equal(result.startingLineups.a.positions.p4, "a Player 1");
  assert.equal(result.startingLineups.a.positions.p5, "a Player 4");
  assert.deepEqual(result.startingLineups.a.benchSnapshot, ["a Player 5"]);
});

test("Invalid or insufficient squads still cannot produce a lineup", () => {
  const short = setup();
  short.squads.a = short.squads.a.slice(0, 4);
  assert.throws(() => build(short), /five or six/);
  const args = setup();
  args.squads.a[1].fullName = args.squads.a[0].fullName;
  assert.throws(() => build(args), /duplicate/);
});
