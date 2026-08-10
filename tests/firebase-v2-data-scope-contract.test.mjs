import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../src/storage/firebaseRepository.js",
    import.meta.url
  ),
  "utf8"
);

test("V2 repository imports scoped state helper", () => {
  assert.match(source, /getScopedStateDoc/);
});

test("V2 repository has one central state document resolver", () => {
  assert.match(
    source,
    /function resolveV2StateDoc/
  );

  assert.match(
    source,
    /if \(dataScope\) \{\s*return getScopedStateDoc\(db, dataScope\);/
  );

  assert.match(
    source,
    /return getClubStateDoc\(db, clubId\);/
  );
});

test("V2 save accepts optional explicit DataScope", () => {
  assert.match(
    source,
    /export async function saveStateToFirebaseV2\(\s*state,\s*clubId = DEFAULT_CLUB_ID,\s*dataScope = null/
  );

  assert.match(
    source,
    /const ref = resolveV2StateDoc\(clubId, dataScope\);/
  );
});

test("V2 load accepts optional explicit DataScope", () => {
  assert.match(
    source,
    /export async function loadStateFromFirebaseV2\(\s*clubId = DEFAULT_CLUB_ID,\s*dataScope = null/
  );
});

test("V2 subscription accepts optional explicit DataScope", () => {
  assert.match(
    source,
    /export function subscribeToStateV2\(\s*callback,\s*clubId = DEFAULT_CLUB_ID,\s*dataScope = null/
  );
});

test("legacy Official fallback remains getClubStateDoc", () => {
  assert.match(
    source,
    /return getClubStateDoc\(db, clubId\);/
  );
});

test("Practice is never inferred from clubId naming", () => {
  const resolverMatch = source.match(
    /function resolveV2StateDoc[\s\S]*?\n\}/
  );

  assert.ok(resolverMatch);

  assert.doesNotMatch(
    resolverMatch[0],
    /-practice/
  );

  assert.doesNotMatch(
    resolverMatch[0],
    /includes\(["']practice/
  );
});
