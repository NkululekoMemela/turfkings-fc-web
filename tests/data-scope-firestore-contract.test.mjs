import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../src/core/clubFirestorePaths.js",
    import.meta.url
  ),
  "utf8"
);

test("scoped Firestore helpers use DataScope path resolver", () => {
  assert.match(source, /dataScopeStatePath/);
  assert.match(source, /dataScopeCollectionPath/);
  assert.match(source, /dataScopeDocPath/);

  assert.match(
    source,
    /export function getScopedStateDoc/
  );

  assert.match(
    source,
    /export function getScopedCollection/
  );

  assert.match(
    source,
    /export function getScopedDoc/
  );
});

test("legacy club Firestore helpers remain present", () => {
  assert.match(
    source,
    /export function getClubStateDoc/
  );

  assert.match(
    source,
    /export function getClubCollection/
  );

  assert.match(
    source,
    /export function getClubDoc/
  );
});

test("legacy club helpers still use official club path functions", () => {
  assert.match(
    source,
    /doc\(db,\s*clubStatePath\(clubId\)\)/
  );

  assert.match(
    source,
    /collection\(db,\s*clubCollectionPath\(collectionName,\s*clubId\)\)/
  );

  assert.match(
    source,
    /doc\(db,\s*clubDocPath\(collectionName,\s*docId,\s*clubId\)\)/
  );
});
