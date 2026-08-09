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

const firestoreRepository = fs.readFileSync(
  new URL(
    "../src/core/platformPlayer/platformPlayerFirestoreRepository.js",
    import.meta.url
  ),
  "utf8"
);

// ============================================================
// Stage 2.6 environment / single-user gate remains owned by
// EntryPage because EntryPage knows the deployment environment
// and currently authenticated user.
// ============================================================

test("Stage 2.6 requires development environment", () => {
  assert.match(
    entry,
    /VITE_FANM_DEVELOPMENT_SITE/
  );
});

test("Stage 2.6 requires explicit write switch", () => {
  assert.match(
    entry,
    /VITE_GPI_PLATFORM_PLAYER_WRITE/
  );
});

test("Stage 2.6 requires explicit allowed email", () => {
  assert.match(
    entry,
    /VITE_GPI_PLATFORM_PLAYER_WRITE_EMAIL/
  );
});

test("authenticated email must equal allowed email", () => {
  assert.match(
    entry,
    /authenticatedEmail\s*===\s*GPI_PLATFORM_PLAYER_WRITE_EMAIL/
  );
});

test("EntryPage passes single-user persistence permission to coordinator", () => {
  assert.match(
    entry,
    /persistenceAllowed:\s*platformPlayerPersistenceAllowed/
  );
});


// ============================================================
// CREATE / MERGE persistence policy now belongs to the
// Platform Player Coordinator.
// ============================================================

test("coordinator requires persistence permission before write", () => {
  assert.match(
    coordinator,
    /persistenceAllowed\s*&&/
  );
});

test("coordinator requires safeToWrite before persistence", () => {
  assert.match(
    coordinator,
    /plan\.safeToWrite/
  );
});

test("coordinator persists only CREATE or MERGE", () => {
  assert.match(
    coordinator,
    /plan\.action === "CREATE"/
  );

  assert.match(
    coordinator,
    /plan\.action === "MERGE"/
  );
});

test("coordinator owns the Platform Player upsert", () => {
  assert.match(
    coordinator,
    /upsertPlatformPlayer\(/
  );

  assert.doesNotMatch(
    entry,
    /upsertPlatformPlayer\(/
  );
});


// ============================================================
// Final repository safety wall.
// ============================================================

test("Firestore adapter verifies authenticated UID ownership", () => {
  assert.match(
    firestoreRepository,
    /only write their own Platform Player document/
  );
});

test("Firestore adapter verifies authenticated email", () => {
  assert.match(
    firestoreRepository,
    /authenticated email does not match Platform Player email/
  );
});

test("Firestore adapter remains isolated from production collections", () => {
  assert.doesNotMatch(
    firestoreRepository,
    /["']clubs["']/
  );

  assert.doesNotMatch(
    firestoreRepository,
    /["']members["']/
  );

  assert.doesNotMatch(
    firestoreRepository,
    /["']players["']/
  );

  assert.doesNotMatch(
    firestoreRepository,
    /\bdeleteDoc\b/
  );

  assert.doesNotMatch(
    firestoreRepository,
    /\bdeleteField\b/
  );
});
