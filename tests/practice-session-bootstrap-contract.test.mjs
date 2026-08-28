import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/core/practiceSessionBootstrap.js",
  "utf8"
);

test("Practice bootstrap creates explicitly disposable football state", () => {
  for (const field of [
    "signups",
    "teams",
    "squads",
    "fixtures",
    "matches",
    "events",
    "results",
  ]) {
    assert.match(
      source,
      new RegExp(`${field}:\\s*\\[\\]`)
    );
  }

  assert.match(source, /liveMatch:\s*null/);
});

test("Practice bootstrap keeps real club and session identities separate", () => {
  assert.match(source, /clubId:\s*safeClubId/);
  assert.match(source, /practiceSessionId:\s*safeSessionId/);
});

test("Practice bootstrap does not manufacture a Practice club", () => {
  assert.doesNotMatch(source, /-practice/);
  assert.doesNotMatch(source, /practice-\$\{/);
});

test("Practice bootstrap performs no Firestore operations", () => {
  assert.doesNotMatch(
    source,
    /\b(addDoc|setDoc|updateDoc|deleteDoc|getDoc|getDocs|writeBatch|runTransaction)\b/
  );
  assert.doesNotMatch(
    source,
    /firebase\/firestore/
  );
});

test("Practice bootstrap does not contain Official collection paths", () => {
  assert.doesNotMatch(source, /collection\s*\([^)]*["']clubs["']/);
  assert.doesNotMatch(source, /collection\s*\([^)]*["']players["']/);
});

test("Practice bootstrap treats roster as input rather than generated state", () => {
  assert.match(source, /roster\s*=\s*\[\]/);
  assert.match(source, /roster:\s*normalizedRoster/);
});

test("Practice bootstrap validates clean disposable state", () => {
  assert.match(
    source,
    /assertCleanPracticeSessionState/
  );
  assert.match(
    source,
    /must start empty/
  );
});

test("Practice bootstrap rejects path-like identifiers", () => {
  assert.match(source, /includes\("\/"\)/);
});

test("Practice bootstrap identifies itself as Practice v2", () => {
  assert.match(source, /practiceVersion:\s*2/);
  assert.match(source, /environment:\s*"practice"/);
});
