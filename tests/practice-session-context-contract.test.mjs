import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/core/practiceSessionContext.js",
  "utf8"
);

test("Practice context builds a Practice DataScope", () => {
  assert.match(
    source,
    /createPracticeDataScope/
  );

  assert.match(
    source,
    /practiceSessionId:\s*safeSessionId/
  );
});

test("Practice context loads roster from real club", () => {
  assert.match(
    source,
    /loadPracticeRoster\(/
  );

  assert.match(
    source,
    /loadPracticeRoster\(\s*safeClubId\s*\)/
  );
});

test("Practice context keeps real club ID and sandbox session ID separate", () => {
  assert.match(source, /clubId:\s*safeClubId/);
  assert.match(
    source,
    /practiceSessionId:\s*safeSessionId/
  );
});

test("Practice context performs no Firestore writes", () => {
  assert.doesNotMatch(
    source,
    /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\b/
  );
});

test("Practice context never manufactures a -practice club ID", () => {
  assert.doesNotMatch(
    source,
    /-practice/
  );
});

test("Practice context does not copy roster into sandbox", () => {
  assert.doesNotMatch(
    source,
    /getScopedCollection|getScopedDoc|setDoc|writeBatch/
  );
});

test("Practice context rejects path-like IDs", () => {
  assert.match(
    source,
    /includes\(["']\/["']\)/
  );
});
