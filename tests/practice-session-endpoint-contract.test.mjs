import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "functions/index.js",
  "utf8"
);

test("Practice endpoint is exported as HTTP function", () => {
  assert.match(
    source,
    /exports\.startPracticeSession\s*=\s*onRequest/
  );
});

test("Practice endpoint requires Firebase ID token", () => {
  assert.match(
    source,
    /admin\.auth\(\)\.verifyIdToken/
  );

  assert.match(
    source,
    /practice\/auth-required/
  );

  assert.match(
    source,
    /practice\/auth-invalid/
  );
});

test("Practice endpoint accepts POST only", () => {
  assert.match(
    source,
    /req\.method\s*!==\s*"POST"/
  );
});

test("Practice endpoint delegates business rules to server service", () => {
  assert.match(
    source,
    /startPracticeSessionService\(\{/
  );

  assert.match(
    source,
    /authenticatedUser/
  );

  assert.match(
    source,
    /clubId/
  );
});

test("endpoint does not trust client role", () => {
  const endpointStart = source.indexOf(
    "exports.startPracticeSession = onRequest("
  );

  assert.ok(endpointStart >= 0);

  const endpointSource = source.slice(endpointStart);

  assert.doesNotMatch(
    endpointSource,
    /parseRequestValue\(req,\s*["']role["']\)/
  );
});

test("endpoint does not trust client UID", () => {
  const endpointStart = source.indexOf(
    "exports.startPracticeSession = onRequest("
  );

  const endpointSource = source.slice(endpointStart);

  assert.doesNotMatch(
    endpointSource,
    /parseRequestValue\(req,\s*["'](?:uid|userId)["']\)/
  );
});

test("endpoint does not accept client timestamps or week", () => {
  const endpointStart = source.indexOf(
    "exports.startPracticeSession = onRequest("
  );

  const endpointSource = source.slice(endpointStart);

  for (const field of [
    "startedAt",
    "expiresAt",
    "weekKey",
    "durationSeconds",
  ]) {
    assert.doesNotMatch(
      endpointSource,
      new RegExp(
        `parseRequestValue\\\\(req,\\\\s*["']${field}["']\\\\)`
      )
    );
  }
});

test("known Practice failures map to explicit HTTP statuses", () => {
  assert.match(source, /practice\/not-authorized/);
  assert.match(source, /practice\/club-not-found/);
  assert.match(source, /practice\/no-credits/);

  assert.match(source, /\?\s*401/);
  assert.match(source, /\?\s*403/);
  assert.match(source, /\?\s*404/);
  assert.match(source, /\?\s*409/);
});
