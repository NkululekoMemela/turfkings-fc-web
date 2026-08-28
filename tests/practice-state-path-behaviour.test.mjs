import test from "node:test";
import assert from "node:assert/strict";

import {
  createPracticeStatePersistenceContext,
} from "../src/core/practiceStatePersistenceContext.js";

test("Practice state resolves beneath session sandbox", () => {
  const context =
    createPracticeStatePersistenceContext({
      clubId: "misfits-fc",
      sessionId: "session-a",
    });

  assert.equal(
    context.statePath,
    "sandboxes/practice/clubs/misfits-fc/sessions/session-a/state/main"
  );
});

test("different Practice sessions resolve to different state documents", () => {
  const first =
    createPracticeStatePersistenceContext({
      clubId: "misfits-fc",
      sessionId: "session-a",
    });

  const second =
    createPracticeStatePersistenceContext({
      clubId: "misfits-fc",
      sessionId: "session-b",
    });

  assert.notEqual(
    first.statePath,
    second.statePath
  );

  assert.equal(
    first.statePath,
    "sandboxes/practice/clubs/misfits-fc/sessions/session-a/state/main"
  );

  assert.equal(
    second.statePath,
    "sandboxes/practice/clubs/misfits-fc/sessions/session-b/state/main"
  );
});

test("same session ID under different clubs cannot collide", () => {
  const first =
    createPracticeStatePersistenceContext({
      clubId: "misfits-fc",
      sessionId: "session-a",
    });

  const second =
    createPracticeStatePersistenceContext({
      clubId: "turf-kings",
      sessionId: "session-a",
    });

  assert.notEqual(
    first.statePath,
    second.statePath
  );
});

test("Practice persistence is explicitly sandbox scoped", () => {
  const context =
    createPracticeStatePersistenceContext({
      clubId: "misfits-fc",
      sessionId: "session-a",
    });

  assert.equal(context.environment, "practice");
  assert.equal(context.clubId, "misfits-fc");
  assert.equal(
    context.practiceSessionId,
    "session-a"
  );

  assert.equal(
    context.dataScope.practiceSessionId,
    "session-a"
  );

  assert.match(
    context.statePath,
    /^sandboxes\/practice\//
  );

  assert.doesNotMatch(
    context.statePath,
    /^clubs\//
  );
});

test("Practice persistence rejects club path injection", () => {
  assert.throws(
    () =>
      createPracticeStatePersistenceContext({
        clubId: "clubs/misfits-fc",
        sessionId: "session-a",
      }),
    /must not contain/
  );
});

test("Practice persistence rejects session path injection", () => {
  assert.throws(
    () =>
      createPracticeStatePersistenceContext({
        clubId: "misfits-fc",
        sessionId: "sessions/session-a",
      }),
    /must not contain/
  );
});
