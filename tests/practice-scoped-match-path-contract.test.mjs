import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pathsSource = fs.readFileSync(
  new URL("../src/core/clubFirestorePaths.js", import.meta.url),
  "utf8"
);

const scopeSource = fs.readFileSync(
  new URL("../src/core/dataScope.js", import.meta.url),
  "utf8"
);

test("legacy Official match helper remains present", () => {
  assert.match(
    pathsSource,
    /export function getMatchDoc\(db,\s*docId,\s*clubId = DEFAULT_CLUB_ID\)/
  );
});

test("scoped match collection helper exists", () => {
  assert.match(
    pathsSource,
    /export function getScopedMatchesCollection\(db,\s*dataScope\)/
  );
});

test("scoped match document helper exists", () => {
  assert.match(
    pathsSource,
    /export function getScopedMatchDoc\(db,\s*docId,\s*dataScope\)/
  );
});

test("scoped match helpers normalize explicit DataScope", () => {
  assert.match(
    pathsSource,
    /normalizeDataScope\(dataScope\)/
  );
});

test("scoped match collection delegates to DataScope collection path", () => {
  assert.match(
    pathsSource,
    /dataScopeCollectionPath\(\s*CLUB_COLLECTIONS\.matches/
  );
});

test("scoped match document delegates to DataScope document path", () => {
  assert.match(
    pathsSource,
    /dataScopeDocPath\(\s*CLUB_COLLECTIONS\.matches,\s*docId/
  );
});

test("Practice DataScope root is session scoped", () => {
  assert.match(
    scopeSource,
    /sandboxes\/practice\/clubs\/\$\{normalized\.clubId\}/
  );
  assert.match(
    scopeSource,
    /sessions\/\$\{normalized\.practiceSessionId\}/
  );
});

test("Practice match helper does not manufacture fake club IDs", () => {
  const scopedSection =
    pathsSource.split(
      "// DATASCOPE-AWARE MATCH HELPERS"
    )[1] || "";

  assert.doesNotMatch(
    scopedSection,
    /clubId\s*\+\s*["'`]-practice/
  );
});
