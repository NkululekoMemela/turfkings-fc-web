import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/core/practiceRuntime.js",
  "utf8"
);

test("Practice runtime starts through authoritative server gateway", () => {
  assert.match(
    source,
    /startPracticeSession/
  );
});

test("Practice runtime builds context from real club and authoritative session", () => {
  assert.match(
    source,
    /buildPracticeSessionContext/
  );

  assert.match(
    source,
    /clubId:\s*safeClubId/
  );

  assert.match(
    source,
    /practiceSessionId:\s*sessionId/
  );
});

test("Practice runtime keeps authoritative start and expiry", () => {
  assert.match(source, /startedAt/);
  assert.match(source, /expiresAt/);
});

test("Practice runtime does not manufacture fake Practice club IDs", () => {
  assert.doesNotMatch(
    source,
    /-practice/
  );

  assert.doesNotMatch(
    source,
    /Practice Club/
  );
});

test("Practice runtime does not use old Practice seed", () => {
  assert.doesNotMatch(
    source,
    /ensurePracticeSessionSeed/
  );

  assert.doesNotMatch(
    source,
    /practiceSessionSeed/
  );
});

test("Practice runtime performs no direct Firestore operations", () => {
  assert.doesNotMatch(
    source,
    /firebase\/firestore/
  );

  assert.doesNotMatch(
    source,
    /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/
  );
});

test("Practice runtime does not persist football state itself", () => {
  assert.doesNotMatch(
    source,
    /savePracticeState/
  );

  assert.doesNotMatch(
    source,
    /saveStateToFirebaseV2/
  );

  assert.doesNotMatch(
    source,
    /saveStateV2/
  );
});

test("Practice runtime rejects path-like club IDs", () => {
  assert.match(
    source,
    /includes\("\/"\)/
  );
});

test("Practice runtime verifies context identity boundaries", () => {
  assert.match(
    source,
    /context\.clubId\s*!==\s*safeClubId/
  );

  assert.match(
    source,
    /context\.practiceSessionId\s*!==\s*sessionId/
  );
});

test("Practice runtime identifies itself as Practice v2", () => {
  assert.match(
    source,
    /practiceVersion:\s*2/
  );

  assert.match(
    source,
    /environment:\s*"practice"/
  );
});
