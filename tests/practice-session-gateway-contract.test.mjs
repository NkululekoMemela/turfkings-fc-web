import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/storage/practiceSessionGateway.js",
  "utf8"
);

test("gateway uses Firebase current user", () => {
  assert.match(source, /auth\?\.currentUser/);
});

test("gateway obtains Firebase ID token", () => {
  assert.match(
    source,
    /currentUser\.getIdToken\(true\)/
  );
});

test("gateway sends ID token as bearer authorization", () => {
  assert.match(
    source,
    /"Authorization": `Bearer \$\{idToken\}`/
  );
});

test("gateway calls startPracticeSession function", () => {
  assert.match(
    source,
    /\/startPracticeSession/
  );
});

test("gateway request body contains clubId", () => {
  assert.match(
    source,
    /JSON\.stringify\(\{\s*clubId: safeClubId/
  );
});

test("gateway does not send client role", () => {
  const bodyStart = source.indexOf(
    "body: JSON.stringify"
  );

  const bodyArea = source.slice(
    bodyStart,
    bodyStart + 220
  );

  assert.doesNotMatch(
    bodyArea,
    /\brole\b/
  );
});

test("gateway does not send UID or email", () => {
  const bodyStart = source.indexOf(
    "body: JSON.stringify"
  );

  const bodyArea = source.slice(
    bodyStart,
    bodyStart + 220
  );

  assert.doesNotMatch(
    bodyArea,
    /\b(uid|userId|email)\b/
  );
});

test("gateway does not send timing or entitlement authority", () => {
  const bodyStart = source.indexOf(
    "body: JSON.stringify"
  );

  const bodyArea = source.slice(
    bodyStart,
    bodyStart + 260
  );

  for (const field of [
    "startedAt",
    "expiresAt",
    "weekKey",
    "creditsRemaining",
    "durationSeconds",
  ]) {
    assert.doesNotMatch(
      bodyArea,
      new RegExp(field)
    );
  }
});

test("gateway requires authoritative session response", () => {
  assert.match(source, /session\.sessionId/);
  assert.match(source, /session\.startedAt/);
  assert.match(source, /session\.expiresAt/);
});
