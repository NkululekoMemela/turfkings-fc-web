import test from "node:test";
import assert from "node:assert/strict";

import {
  DATA_ENVIRONMENT,
  assertDataScopePath,
  createOfficialDataScope,
  createPracticeDataScope,
  dataScopeCollectionPath,
  dataScopeDocPath,
  dataScopeRoot,
  dataScopeStatePath,
  isOfficialDataScope,
  isPracticeDataScope,
  normalizeDataScope,
} from "../src/core/dataScope.js";

test("Official scope resolves only beneath clubs", () => {
  const scope = createOfficialDataScope("misfits-fc");

  assert.deepEqual(scope, {
    environment: DATA_ENVIRONMENT.OFFICIAL,
    clubId: "misfits-fc",
    practiceSessionId: null,
  });

  assert.equal(
    dataScopeRoot(scope),
    "clubs/misfits-fc"
  );

  assert.equal(
    dataScopeStatePath(scope),
    "clubs/misfits-fc/state/main"
  );

  assert.equal(
    dataScopeCollectionPath("players", scope),
    "clubs/misfits-fc/players"
  );

  assert.equal(
    dataScopeDocPath("players", "jackson", scope),
    "clubs/misfits-fc/players/jackson"
  );

  assert.equal(isOfficialDataScope(scope), true);
  assert.equal(isPracticeDataScope(scope), false);
});

test("Practice scope resolves only beneath sandboxes/practice", () => {
  const scope = createPracticeDataScope({
    clubId: "misfits-fc",
    practiceSessionId: "ps_123",
  });

  assert.deepEqual(scope, {
    environment: DATA_ENVIRONMENT.PRACTICE,
    clubId: "misfits-fc",
    practiceSessionId: "ps_123",
  });

  assert.equal(
    dataScopeRoot(scope),
    "sandboxes/practice/clubs/misfits-fc/sessions/ps_123"
  );

  assert.equal(
    dataScopeStatePath(scope),
    "sandboxes/practice/clubs/misfits-fc/sessions/ps_123/state/main"
  );

  assert.equal(
    dataScopeCollectionPath("players", scope),
    "sandboxes/practice/clubs/misfits-fc/sessions/ps_123/players"
  );

  assert.equal(
    dataScopeDocPath("players", "jackson", scope),
    "sandboxes/practice/clubs/misfits-fc/sessions/ps_123/players/jackson"
  );

  assert.equal(isPracticeDataScope(scope), true);
  assert.equal(isOfficialDataScope(scope), false);
});

test("Practice scope requires a session ID", () => {
  assert.throws(
    () =>
      createPracticeDataScope({
        clubId: "misfits-fc",
      }),
    /practiceSessionId is required/
  );
});

test("IDs cannot smuggle Firestore paths into DataScope", () => {
  assert.throws(
    () =>
      createOfficialDataScope("clubs/misfits-fc"),
    /must be a Firestore document ID/
  );

  assert.throws(
    () =>
      createPracticeDataScope({
        clubId: "misfits-fc",
        practiceSessionId: "sessions/evil",
      }),
    /must be a Firestore document ID/
  );
});

test("Practice invariant rejects official club paths", () => {
  const scope = createPracticeDataScope({
    clubId: "misfits-fc",
    practiceSessionId: "ps_123",
  });

  assert.throws(
    () =>
      assertDataScopePath(
        scope,
        "clubs/misfits-fc/state/main"
      ),
    /SAFETY VIOLATION/
  );
});

test("Practice invariant rejects paths outside its sandbox namespace", () => {
  const scope = createPracticeDataScope({
    clubId: "misfits-fc",
    practiceSessionId: "ps_123",
  });

  assert.throws(
    () =>
      assertDataScopePath(
        scope,
        "someOtherNamespace/misfits-fc/state/main"
      ),
    /SAFETY VIOLATION/
  );
});

test("Official invariant rejects sandbox paths", () => {
  const scope = createOfficialDataScope("misfits-fc");

  assert.throws(
    () =>
      assertDataScopePath(
        scope,
        "sandboxes/practice/clubs/misfits-fc/sessions/ps_123/state/main"
      ),
    /SAFETY VIOLATION/
  );
});

test("Legacy string input normalizes to Official scope", () => {
  assert.deepEqual(
    normalizeDataScope("misfits-fc"),
    createOfficialDataScope("misfits-fc")
  );
});

test("Unknown environments fail closed", () => {
  assert.throws(
    () =>
      normalizeDataScope({
        environment: "mystery",
        clubId: "misfits-fc",
      }),
    /Unsupported environment/
  );
});
