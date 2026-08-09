import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const coordinator = fs.readFileSync(
  new URL(
    "../src/core/platformPlayer/platformPlayerCoordinator.js",
    import.meta.url
  ),
  "utf8"
);

const entry = fs.readFileSync(
  new URL(
    "../src/pages/EntryPage.jsx",
    import.meta.url
  ),
  "utf8"
);

test("coordinator owns Platform Player read", () => {
  assert.match(
    coordinator,
    /readPlatformPlayer/
  );
});

test("coordinator owns Platform Player persistence", () => {
  assert.match(
    coordinator,
    /upsertPlatformPlayer/
  );
});

test("coordinator requires persistence permission before write", () => {
  assert.match(
    coordinator,
    /persistenceAllowed\s*&&/
  );
});

test("coordinator only persists CREATE or MERGE", () => {
  assert.match(
    coordinator,
    /plan\.action === "CREATE"/
  );

  assert.match(
    coordinator,
    /plan\.action === "MERGE"/
  );
});

test("EntryPage no longer directly reads Platform Players", () => {
  assert.doesNotMatch(
    entry,
    /readPlatformPlayer\(/
  );
});

test("EntryPage no longer directly writes Platform Players", () => {
  assert.doesNotMatch(
    entry,
    /upsertPlatformPlayer\(/
  );
});

test("EntryPage still owns club-profile reuse decision", () => {
  assert.match(
    entry,
    /reuseDecision\.shouldOfferReuse/
  );
});

test("EntryPage invokes Platform Player coordinator", () => {
  assert.match(
    entry,
    /coordinatePlatformPlayer\(/
  );
});
