const test = require("node:test");
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const requireFunctions = createRequire(
  require("node:path").resolve("functions/package.json")
);
const {cleanExpired} = requireFunctions("./fieldPracticeCleanup");
const {loadPracticeClubCopies} =
  requireFunctions("./fieldPracticeSessionService");

test("Sandbox copies contain six actual public players per Club",async()=>{
 const {practicePublicFixture}=require('./helpers/practicePublicClubs.cjs');const f=practicePublicFixture();
 const clubs=await loadPracticeClubCopies({db:f.db,venueId:'field'});
 assert.equal(clubs[0].players.length,6);assert.equal(clubs[0].players.every(p=>p.fullName.includes('Club')),true);
 assert.equal(clubs[0].players[0].mentality,4);
});

test("Cleanup recursively deletes only expired Field Practice data", async () => {
  const operations = [];
  const make = (id, expires, extra = {}) => ({
    id,
    data: () => ({
      kind: "venueLeague", environment: "practice",
      venueId: "field", sessionId: id,
      status: "active", expiresAt: {toMillis: () => expires},
      ...extra,
    }),
    ref: {
      update: async () => operations.push(`expire:${id}`),
      delete: async () => operations.push(`delete:${id}`),
    },
  });
  const docs = [
    make("expired", 100),
    make("active", 10000),
    make("invalid", 100, {venueId: "../official"}),
  ];
  const db = {
    collection: name => {
      assert.equal(name, "practiceSessions");
      return {
        where: (field, op, value) => {
          assert.deepEqual([field, op, value], ["kind", "==", "venueLeague"]);
          return {limit: () => ({get: async () => ({docs})})};
        },
      };
    },
    doc: path => ({path}),
    recursiveDelete: async ref => operations.push(`recursive:${ref.path}`),
  };
  assert.deepEqual(await cleanExpired({db, now: 1000}), {removed: 1});
  assert.deepEqual(operations, [
    "expire:expired",
    "recursive:sandboxes/practice/leagueVenues/field/sessions/expired",
    "delete:expired",
  ]);
});
