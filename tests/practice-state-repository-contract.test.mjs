import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/storage/practiceStateRepository.js",
  "utf8"
);

test("Practice state repository reuses actual V2 persistence API", () => {
  assert.match(source, /saveStateToFirebaseV2/);
  assert.match(source, /loadStateFromFirebaseV2/);
  assert.match(source, /subscribeToStateV2/);
});

test("Practice save uses correct V2 argument order", () => {
  assert.match(
    source,
    /saveStateToFirebaseV2\(\s*state,\s*context\.clubId,\s*context\.dataScope\s*\)/
  );
});

test("Practice load passes explicit DataScope", () => {
  assert.match(
    source,
    /loadStateFromFirebaseV2\(\s*context\.clubId,\s*context\.dataScope\s*\)/
  );
});

test("Practice subscription passes callback, club and DataScope", () => {
  assert.match(
    source,
    /subscribeToStateV2\(\s*onState,\s*context\.clubId,\s*context\.dataScope\s*\)/
  );
});

test("Practice repository delegates path resolution to pure context", () => {
  assert.match(
    source,
    /createPracticeStatePersistenceContext/
  );
});

test("Practice repository does not manufacture fake club IDs", () => {
  assert.doesNotMatch(source, /-practice/);
});

test("Practice repository contains no direct Firestore primitives", () => {
  assert.doesNotMatch(
    source,
    /\b(doc|collection|setDoc|getDoc|updateDoc|deleteDoc|onSnapshot|writeBatch|runTransaction)\s*\(/
  );

  assert.doesNotMatch(
    source,
    /firebase\/firestore/
  );
});

test("Practice repository never references Official path helpers", () => {
  assert.doesNotMatch(source, /getClubStateDoc/);
  assert.doesNotMatch(source, /getClubDoc/);
});
