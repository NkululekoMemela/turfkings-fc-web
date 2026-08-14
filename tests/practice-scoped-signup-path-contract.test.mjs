import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const paths = fs.readFileSync(
  "src/core/clubFirestorePaths.js",
  "utf8"
);

const scope = fs.readFileSync(
  "src/core/dataScope.js",
  "utf8"
);

test("legacy Official signup helpers remain present", () => {
  assert.match(
    paths,
    /getMatchSignupsCollection\(db,\s*clubId = DEFAULT_CLUB_ID\)/
  );
  assert.match(
    paths,
    /getPendingSignupsCollection\(db,\s*clubId = DEFAULT_CLUB_ID\)/
  );
});

test("scoped pending signup collection helper exists", () => {
  assert.match(
    paths,
    /export function getScopedPendingSignupsCollection/
  );
});

test("scoped pending signup document helper exists", () => {
  assert.match(
    paths,
    /export function getScopedPendingSignupDoc/
  );
});

test("scoped match signup collection helper exists", () => {
  assert.match(
    paths,
    /export function getScopedMatchSignupsCollection/
  );
});

test("scoped match signup document helper exists", () => {
  assert.match(
    paths,
    /export function getScopedMatchSignupDoc/
  );
});

test("scoped signup helpers normalize explicit DataScope", () => {
  const count = (
    paths.match(/normalizeDataScope\(dataScope\)/g) || []
  ).length;

  assert.ok(
    count >= 4,
    `expected at least four explicit signup DataScope normalizations, found ${count}`
  );
});

test("pending signup paths use DataScope resolver", () => {
  assert.match(
    paths,
    /dataScopeCollectionPath\(\s*CLUB_COLLECTIONS\.pendingSignups/
  );
  assert.match(
    paths,
    /dataScopeDocPath\(\s*CLUB_COLLECTIONS\.pendingSignups/
  );
});

test("match signup paths use DataScope resolver", () => {
  assert.match(
    paths,
    /dataScopeCollectionPath\(\s*CLUB_COLLECTIONS\.matchSignups/
  );
  assert.match(
    paths,
    /dataScopeDocPath\(\s*CLUB_COLLECTIONS\.matchSignups/
  );
});

test("Practice DataScope root is session scoped", () => {
  assert.match(
    scope,
    /sandboxes\/practice\/clubs\/\$\{normalized\.clubId\}/
  );
  assert.match(
    scope,
    /sessions\/\$\{normalized\.practiceSessionId\}/
  );
});

test("signup path helpers do not manufacture fake Practice clubs", () => {
  assert.doesNotMatch(
    paths,
    /clubId.*-practice|-practice.*clubId/
  );
});
