import test from "node:test";
import assert from "node:assert/strict";

import {
  createCleanPracticeSessionState,
  assertCleanPracticeSessionState,
} from "../src/core/practiceSessionBootstrap.js";

const roster = [
  {
    id: "player-a",
    name: "Player A",
    position: "GK",
  },
  {
    id: "player-b",
    name: "Player B",
    position: "DEF",
  },
];

test("new Practice session starts with clean generated football state", () => {
  const state = createCleanPracticeSessionState({
    clubId: "misfits-fc",
    sessionId: "session-a",
    roster,
  });

  assert.equal(state.clubId, "misfits-fc");
  assert.equal(state.practiceSessionId, "session-a");

  assert.deepEqual(state.signups, []);
  assert.deepEqual(state.teams, []);
  assert.deepEqual(state.squads, []);
  assert.deepEqual(state.fixtures, []);
  assert.deepEqual(state.matches, []);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.results, []);
  assert.equal(state.liveMatch, null);

  assert.equal(
    assertCleanPracticeSessionState(state),
    true
  );
});

test("real roster identities remain available to Practice", () => {
  const state = createCleanPracticeSessionState({
    clubId: "misfits-fc",
    sessionId: "session-a",
    roster,
  });

  assert.equal(state.roster.length, 2);
  assert.equal(state.roster[0].id, "player-a");
  assert.equal(state.roster[0].playerId, "player-a");
  assert.equal(state.roster[1].id, "player-b");
});

test("different Practice sessions receive independent state", () => {
  const first = createCleanPracticeSessionState({
    clubId: "misfits-fc",
    sessionId: "session-a",
    roster,
  });

  first.signups.push({
    playerId: "player-a",
  });

  first.events.push({
    type: "goal",
    playerId: "player-a",
  });

  const second = createCleanPracticeSessionState({
    clubId: "misfits-fc",
    sessionId: "session-b",
    roster,
  });

  assert.equal(first.signups.length, 1);
  assert.equal(first.events.length, 1);

  assert.deepEqual(second.signups, []);
  assert.deepEqual(second.events, []);
  assert.equal(
    second.practiceSessionId,
    "session-b"
  );
});

test("Practice session state does not mutate source roster objects", () => {
  const sourceRoster = [
    {
      id: "player-a",
      name: "Player A",
    },
  ];

  const before = JSON.stringify(sourceRoster);

  createCleanPracticeSessionState({
    clubId: "misfits-fc",
    sessionId: "session-a",
    roster: sourceRoster,
  });

  assert.equal(
    JSON.stringify(sourceRoster),
    before
  );
});

test("Practice bootstrap rejects club path injection", () => {
  assert.throws(
    () =>
      createCleanPracticeSessionState({
        clubId: "clubs/misfits-fc",
        sessionId: "session-a",
        roster,
      }),
    /must not contain/
  );
});

test("Practice bootstrap rejects session path injection", () => {
  assert.throws(
    () =>
      createCleanPracticeSessionState({
        clubId: "misfits-fc",
        sessionId: "session/a",
        roster,
      }),
    /must not contain/
  );
});

test("clean-state assertion rejects inherited Practice activity", () => {
  const state = createCleanPracticeSessionState({
    clubId: "misfits-fc",
    sessionId: "session-a",
    roster,
  });

  state.results.push({
    teamA: 8,
    teamB: 6,
  });

  assert.throws(
    () => assertCleanPracticeSessionState(state),
    /results must start empty/
  );
});
