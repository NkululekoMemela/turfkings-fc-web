import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const entry = fs.readFileSync(
  new URL(
    "../src/pages/EntryPage.jsx",
    import.meta.url
  ),
  "utf8"
);

const coordinator = fs.readFileSync(
  new URL(
    "../src/core/platformPlayer/platformPlayerCoordinator.js",
    import.meta.url
  ),
  "utf8"
);

const repository = fs.readFileSync(
  new URL(
    "../src/core/platformPlayer/platformPlayerFirestoreRepository.js",
    import.meta.url
  ),
  "utf8"
);

test("writes require FANM development environment", () => {
  assert.match(
    entry,
    /VITE_FANM_DEVELOPMENT_SITE/
  );
});

test("writes require explicit GPI write flag", () => {
  assert.match(
    entry,
    /VITE_GPI_PLATFORM_PLAYER_WRITE/
  );
});

test("write requires safeToWrite", () => {
  assert.match(
    coordinator,
    /plan\.safeToWrite/
  );
});

test("only CREATE and MERGE plans execute", () => {
  assert.match(
    coordinator,
    /plan\.action === "CREATE"/
  );

  assert.match(
    coordinator,
    /plan\.action === "MERGE"/
  );
});

test("repository verifies current Firebase user", () => {
  assert.match(
    repository,
    /auth\.currentUser/
  );
});

test("repository rejects UID mismatch", () => {
  assert.match(
    repository,
    /only write their own Platform Player document/
  );
});

test("repository rejects email mismatch", () => {
  assert.match(
    repository,
    /authenticated email does not match Platform Player email/
  );
});

test("repository remains isolated from existing application collections", () => {
  assert.doesNotMatch(
    repository,
    /["']clubs["']/
  );

  assert.doesNotMatch(
    repository,
    /["']members["']/
  );

  assert.doesNotMatch(
    repository,
    /["']players["']/
  );

  assert.doesNotMatch(
    repository,
    /\bdeleteDoc\b/
  );

  assert.doesNotMatch(
    repository,
    /\bdeleteField\b/
  );
});

test("fresh join remains shadow-only", () => {
  assert.match(
    entry,
    /\[GPI Platform Player Plan\]\[Fresh Join\]/
  );

  assert.match(
    entry,
    /firestoreExecuted:\s*false/
  );
});
