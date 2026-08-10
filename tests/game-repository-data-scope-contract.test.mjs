import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/storage/gameRepository.js",
  "utf8"
);

test("V2 game repository accepts explicit DataScope", () => {
  assert.match(
    source,
    /export function saveStateV2\([\s\S]*?dataScope = null/
  );
});

test("V2 game repository forwards DataScope to Firebase", () => {
  assert.match(
    source,
    /saveStateToFirebaseV2\(state,\s*clubId,\s*dataScope\)/
  );
});

test("Official V2 callers remain backward compatible", () => {
  assert.match(
    source,
    /clubId = DEFAULT_CLUB_ID/
  );
});
