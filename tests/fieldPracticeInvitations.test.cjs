const test = require("node:test");
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const requireFunctions = createRequire(
  require("node:path").resolve("functions/package.json")
);
const {announce, validateSession} =
  requireFunctions("./fieldPracticeInvitations");

const session = {
  kind: "venueLeague", environment: "practice",
  venueId: "field", sessionId: "session", userId: "owner",
  status: "active", expiresAt: {toMillis: () => 10000},
};

test("Expired sessions and other users cannot invite Practice Clubs", () => {
  assert.throws(() => validateSession(
    session, {uid: "outsider"}, "field", "session", 1000
  ));
  assert.throws(() => validateSession(
    session, {uid: "owner"}, "field", "session", 10000
  ));
});

test("Invitations accept sandbox Clubs without recording payment or Official writes", async () => {
  const writes = [];
  const root = "sandboxes/practice/leagueVenues/field/sessions/session";
  const snap = path => ({
    exists: true,
    data: () => path === "practiceSessions/session"
      ? session : {
        environment: "practice", practiceSessionId: "session",
        league: {activeSeason: null},
      },
  });
  const db = {
    doc: path => ({path, get: async () => snap(path)}),
    runTransaction: async operation => operation({
      get: async ref => snap(ref.path),
      update: (ref, data) => writes.push({path: ref.path, data}),
      set: (ref, data) => writes.push({path: ref.path, data}),
    }),
  };
  const result = await announce({
    db, user: {uid: "owner"}, venueId: "field", sessionId: "session",
    settings: {name: "Practice League", startsOn: "2026-10-07",
      entryFee: 100, prizes: {first: 200}},
    now: 1000,
    loadCopies: async () => [{
      clubId: "club", name: "Club", players: [],
      environment: "practice", simulated: true,
    }],
  });
  assert.equal(result.accepted, 1);
  assert.ok(writes.every(w => w.path === root || w.path.startsWith(root + "/")));
  const season = writes[0].data["league.activeSeason"];
  assert.equal(season.invitations.club.status, "accepted");
  assert.equal(season.entryFee, 100);
  assert.deepEqual(season.results, []);
  assert.ok(writes.every(w => !w.path.includes("payment") &&
    !w.path.includes("notification")));
});

function invitationWorkspace(workspace) {
  const root = "sandboxes/practice/leagueVenues/field/sessions/session";
  const writes = [];
  const snap = path => ({
    exists: true,
    data: () => path === "practiceSessions/session" ? session : workspace,
  });
  const db = {
    doc: path => ({path, get: async () => snap(path)}),
    runTransaction: async operation => operation({
      get: async ref => snap(ref.path),
      update: (ref, data) => writes.push({path: ref.path, data}),
      set: (ref, data) => writes.push({path: ref.path, data}),
    }),
  };
  return {
    root, writes,
    run: () => announce({
      db, user: {uid: "owner"}, venueId: "field", sessionId: "session",
      settings: {name: "Next Practice League", startsOn: "2026-10-07"},
      now: 1000,
      loadCopies: async () => [{
        clubId: "club", name: "Club", players: [],
        environment: "practice", simulated: true,
      }],
    }),
  };
}

test("Next Practice season preserves its predecessor", async () => {
  const fixture = invitationWorkspace({
    environment: "practice", practiceSessionId: "session",
    league: {activeSeason: {
      id: "next-season", previousSeasonId: "previous-season",
      fixtures: [], results: [], clubIds: [],
    }},
  });
  const result = await fixture.run();
  assert.equal(result.seasonId, "next-season");
  const season = fixture.writes.find(w => w.path === fixture.root)
    .data["league.activeSeason"];
  assert.equal(season.previousSeasonId, "previous-season");
  assert.equal(season.invitations.club.status, "accepted");
  assert.ok(fixture.writes.every(w =>
    w.path === fixture.root || w.path.startsWith(fixture.root + "/")));
  assert.ok(!fixture.writes.some(w =>
    w.path === `${fixture.root}/seasons/previous-season`));
});

test("Occupied Practice seasons cannot be overwritten", async () => {
  for (const activity of [
    {announcedAtMs: 100},
    {invitations: {club: {status: "accepted"}}},
    {fixtures: [{id: "fixture"}]},
    {results: [{id: "result"}]},
    {savedLineups: {club: {"5": {}}}},
  ]) {
    const fixture = invitationWorkspace({
      environment: "practice", practiceSessionId: "session",
      league: {activeSeason: {id: "existing-season", ...activity}},
    });
    await assert.rejects(fixture.run(), /Close the current Practice season/);
    assert.deepEqual(fixture.writes, []);
  }
});

test("Official and other session workspaces reject invitations", async () => {
  for (const identity of [
    {environment: "official", practiceSessionId: "session"},
    {environment: "practice", practiceSessionId: "other-session"},
    {},
  ]) {
    const fixture = invitationWorkspace({
      ...identity, league: {activeSeason: null},
    });
    await assert.rejects(fixture.run(), /workspace is unavailable/);
    assert.deepEqual(fixture.writes, []);
  }
});
