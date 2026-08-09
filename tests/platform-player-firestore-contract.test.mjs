import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../src/core/platformPlayer/platformPlayerFirestoreRepository.js",
    import.meta.url
  ),
  "utf8"
);

test("repository uses platformPlayers collection", () => {
  assert.match(
    source,
    /platformPlayers/
  );
});

test("repository contains no club collection write path", () => {
  assert.doesNotMatch(
    source,
    /doc\s*\(\s*db\s*,\s*["']clubs["']/
  );
});

test("repository contains no members write path", () => {
  assert.doesNotMatch(
    source,
    /["']members["']/
  );
});

test("repository contains no players write path", () => {
  assert.doesNotMatch(
    source,
    /["']players["']/
  );
});

test("repository performs no deletes", () => {
  assert.doesNotMatch(
    source,
    /\bdeleteDoc\b/
  );

  assert.doesNotMatch(
    source,
    /\bdeleteField\b/
  );
});

test("repository requires Firebase UID", () => {
  assert.match(
    source,
    /Firebase UID is required/
  );
});

test("repository requires verified email", () => {
  assert.match(
    source,
    /verified email is required/
  );
});

test("repository starts schema versioning at version 1", () => {
  assert.match(
    source,
    /schemaVersion:\s*1/
  );
});
