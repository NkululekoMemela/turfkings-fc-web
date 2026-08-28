import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rules = fs.readFileSync("firestore.rules", "utf8");

test("Practice entitlement namespace has explicit rules", () => {
  assert.match(
    rules,
    /match \/practiceControl\/\{clubId\}\/weeks\/\{weekKey\}\/entitlements\/\{userId\}/
  );
});

test("Practice entitlements deny all direct client writes", () => {
  const marker =
    "match /practiceControl/{clubId}/weeks/{weekKey}/entitlements/{userId}";
  const start = rules.indexOf(marker);

  assert.ok(start >= 0);

  const block = rules.slice(start, start + 260);

  assert.match(block, /allow write:\s*if false/);
});

test("user may read only own entitlement", () => {
  assert.match(
    rules,
    /allow read:\s*if isCurrentUser\(userId\)/
  );
});

test("transfer ledger denies direct client access", () => {
  const marker =
    "match /practiceControl/{clubId}/weeks/{weekKey}/transfers/{transferId}";
  const start = rules.indexOf(marker);

  assert.ok(start >= 0);

  const block = rules.slice(start, start + 240);

  assert.match(block, /allow read,\s*write:\s*if false/);
});

test("Practice session controls deny direct writes", () => {
  const marker = "match /practiceSessions/{sessionId}";
  const start = rules.indexOf(marker);

  assert.ok(start >= 0);

  const block = rules.slice(start, start + 320);

  assert.match(block, /allow write:\s*if false/);
});

test("Practice session reads are restricted to owning user", () => {
  assert.match(
    rules,
    /resource\.data\.userId\s*==\s*request\.auth\.uid/
  );
});

test("Practice sandbox requires an active authoritative session", () => {
  assert.match(
    rules,
    /match \/sandboxes\/practice\/clubs\/\{clubId\}\/sessions\/\{sessionId\}\/\{document=\*\*\}/
  );

  assert.match(
    rules,
    /hasActivePracticeSession\(clubId, sessionId\)/
  );

  assert.match(
    rules,
    /request\.time\s*<\s*get\(sessionPath\)\.data\.expiresAt/
  );
});

test("all other sandbox namespaces remain closed", () => {
  const marker = "match /sandboxes/{document=**}";
  const start = rules.indexOf(marker);

  assert.ok(start >= 0);

  const block = rules.slice(start, start + 220);

  assert.match(block, /allow read,\s*write:\s*if false/);
});

test("legacy bootstrap explicitly excludes Practice control plane", () => {
  assert.match(
    rules,
    /topLevel\s*!=\s*"practiceControl"/
  );

  assert.match(
    rules,
    /topLevel\s*!=\s*"practiceSessions"/
  );

  assert.match(
    rules,
    /topLevel\s*!=\s*"sandboxes"/
  );
});

test("Official club bootstrap behaviour remains available", () => {
  assert.match(
    rules,
    /match \/clubs\/\{clubId\}\/\{document=\*\*\}/
  );

  assert.match(
    rules,
    /allow read:\s*if true/
  );

  assert.match(
    rules,
    /allow write:\s*if isSignedIn\(\)/
  );
});
