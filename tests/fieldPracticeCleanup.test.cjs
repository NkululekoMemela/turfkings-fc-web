const test = require("node:test");
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const requireFunctions = createRequire(
  require("node:path").resolve("functions/package.json")
);
const {cleanExpired} = requireFunctions("./fieldPracticeCleanup");
const {loadPracticeClubCopies} =
  requireFunctions("./fieldPracticeSessionService");

test("Copied Club contains at most six active players", async () => {
  const db = {
    collection: path => path === "clubFieldMemberships" ? {
      where: () => ({get: async () => ({docs: [{
        id: "club", data: () => ({status: "active"}),
      }]})}),
    } : {
      get: async () => ({docs: Array.from({length: 12}, (_, i) => ({
        id: `p${String(i).padStart(2, "0")}`,
        data: () => ({
          fullName: `Player ${i}`,
          status: i === 0 ? "removed" : "active",
          mentality: 4, shooting: 5, photoUrl: `photo${i}`,
        }),
      }))}),
    },
    doc: () => ({
      get: async () => ({exists: true, data: () => ({name: "Club"})}),
    }),
  };
  const clubs = await loadPracticeClubCopies({db, venueId: "field"});
  assert.equal(clubs[0].players.length, 6);
  assert.equal(clubs[0].players[0].fullName, "Player 1");
  assert.equal(clubs[0].players[0].mentality, 4);
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
