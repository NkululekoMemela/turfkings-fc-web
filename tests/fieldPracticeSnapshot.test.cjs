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

test("Invitation candidates are automatic, active and capped at six", async () => {
  const {loadPracticeClubCopies} =
    requireFunctions("./fieldPracticeSessionService");
  const db = {
    collection: path => path === "clubFieldMemberships" ? {
      where: (field, op, value) => {
        assert.deepEqual([field, op, value], ["venueId", "==", "field"]);
        return {get: async () => ({
          docs: Array.from({length: 9}, (_, i) => ({
            id: `club${i}`,
            data: () => ({status: i === 0 ? "removed" : "active"}),
          })),
        })};
      },
    } : {
      get: async () => ({docs: [{
        id: "player", data: () => ({
          fullName: "Registered Player", memberId: "member",
          mentality: 4, shooting: 5, photoUrl: "photo",
          email: "private@example.com",
        }),
      }]}),
    },
    doc: () => ({
      get: async () => ({
        exists: true, data: () => ({name: "Example Club", logoUrl: "logo"}),
      }),
    }),
  };
  const copies = await loadPracticeClubCopies({db, venueId: "field"});
  assert.equal(copies.length, 6);
  assert.deepEqual(copies.map(c => c.clubId),
    ["club1", "club2", "club3", "club4", "club5", "club6"]);
  assert.equal(copies[0].players[0].mentality, 4);
  assert.equal(copies[0].players[0].photoData, "photo");
  assert.equal(copies[0].players[0].email, undefined);
});
