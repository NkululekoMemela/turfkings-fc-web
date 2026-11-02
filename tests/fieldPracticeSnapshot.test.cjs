const test = require("node:test");
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const requireFunctions = createRequire(
  require("node:path").resolve("functions/package.json")
);
const {cleanSeason, canPractice, start} =
  requireFunctions("./fieldPracticeSessionService");

test("Practice starts with fresh football activity", () => {
  const source = {
    id: "season", clubIds: ["a", "b"],
    fixtures: [{id: "f", clubAId: "a", clubBId: "b",
      matchDayId: "d", status: "completed", scoreA: 5}],
    matchDays: [{id: "d", dateLocal: "2026-10-07",
      fixtureIds: ["f"], status: "completed"}],
    results: [{scoreA: 5}], savedLineups: {a: {old: true}},
  };
  const copy = cleanSeason(source, 123);
  assert.deepEqual(copy.results, []);
  assert.deepEqual(copy.savedLineups, {});
  assert.equal(copy.fixtures[0].status, "scheduled");
  assert.equal(copy.fixtures[0].scoreA, undefined);
  assert.equal(copy.matchDays[0].opensAtMs, 123);
  assert.equal(source.fixtures[0].status, "completed");
});

test("Practice requires owner or authorized active official", () => {
  const venue = {ownerUid: "owner"};
  assert.equal(canPractice(venue, null, {uid: "owner"}), true);
  assert.equal(canPractice(venue,
    {status: "active", role: "referee"}, {uid: "ref"}), true);
  assert.equal(canPractice(venue,
    {status: "removed", isAdministrator: true}, {uid: "x"}), false);
  assert.equal(canPractice(venue, null, {uid: "outsider"}), false);
  assert.equal(canPractice(venue, null,
    {uid: "owner", cameraSession: true}), false);
});

test("Practice starts without an Official season and writes only isolated data", async () => {
  const writes = [];
  const db = {
    doc: path => ({
      path,
      get: async () => ({
        exists: path === "leagueVenues/field",
        data: () => path === "leagueVenues/field"
          ? {ownerUid: "owner", name: "Example Field"}
          : undefined,
      }),
    }),
    collection: () => {
      throw new Error("Session entry must not clone Clubs or send invitations.");
    },
    batch: () => ({
      set: (ref, data) => writes.push({path: ref.path, data}),
      commit: async () => {},
    }),
  };
  const result = await start({
    db, user: {uid: "owner"}, venueId: "field", now: 1000,
  });
  assert.equal(result.seasonId, "");
  assert.equal(Date.parse(result.expiresAt) - Date.parse(result.startedAt),
    900000);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(w =>
    w.path.startsWith("sandboxes/practice/leagueVenues/field/") ||
    w.path.startsWith("practiceSessions/")
  ));
  const root = writes.find(w => w.path.startsWith("sandboxes/"));
  assert.equal(root.data.league.activeSeason, null);
  assert.equal(root.data.practiceClubLimit, 6);
});

test("Practice uses published squads from real Clubs and never reads private player records",async()=>{
 const {practicePublicFixture}=require('./helpers/practicePublicClubs.cjs');
 const f=practicePublicFixture({count:6,fieldIds:['club2']});
 const copies=await requireFunctions('./fieldPracticeSessionService').loadPracticeClubCopies({db:f.db,venueId:'field'});
 assert.equal(copies.length,6);assert.equal(copies[0].clubId,'club2');assert.equal(copies[0].poolSource,'field');assert.equal(copies[0].players.length,6);assert.equal(copies[0].players[0].mentality,4);assert.equal(copies[0].players[0].photoData,'https://example.com/photo.png');assert.equal(copies[0].players[0].email,undefined);
});
