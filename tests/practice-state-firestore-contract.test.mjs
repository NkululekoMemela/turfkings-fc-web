import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "tests/practice-state-firestore-emulator.test.mjs",
  "utf8"
);

test("Stage 4E uses canonical Practice persistence context", () => {
  assert.match(
    source,
    /createPracticeStatePersistenceContext/
  );
});

test("Stage 4E verifies actual Firestore write and read", () => {
  assert.match(source, /\bsetDoc\(/);
  assert.match(source, /\bgetDoc\(/);
});

test("Stage 4E verifies realtime subscription", () => {
  assert.match(source, /\bonSnapshot\(/);
});

test("Stage 4E verifies hard delete", () => {
  assert.match(source, /\bdeleteDoc\(/);
});

test("Stage 4E explicitly compares Practice with Official state", () => {
  assert.match(
    source,
    /clubs[\s\S]*state[\s\S]*main/
  );

  assert.match(
    source,
    /DO-NOT-TOUCH/
  );
});

test("Stage 4E checks expired-session rejection", () => {
  assert.match(
    source,
    /expired authoritative session blocks/
  );
});
