import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "functions/practiceSessionService.js",
  "utf8"
);

test("Practice session duration is exactly fifteen minutes", () => {
  assert.match(
    source,
    /PRACTICE_DURATION_SECONDS\s*=\s*15\s*\*\s*60/
  );
});

test("Practice start reads the real official club", () => {
  assert.match(
    source,
    /\.collection\("clubs"\)\.doc\(safeClubId\)/
  );
});

test("Practice role is independently resolved server-side", () => {
  assert.match(source, /resolvePracticeRole/);
  assert.match(source, /adminEmails/);
  assert.match(source, /captainEmails/);
});

test("Practice start uses a Firestore transaction", () => {
  assert.match(source, /db\.runTransaction/);
});

test("credit consumption and session creation share one transaction", () => {
  const transactionStart = source.indexOf("db.runTransaction");
  const entitlementWrite = source.indexOf(
    "transaction.set(\n      refs.entitlementRef"
  );
  const sessionWrite = source.indexOf(
    "transaction.set(\n      refs.sessionRef"
  );

  assert.ok(transactionStart >= 0);
  assert.ok(entitlementWrite > transactionStart);
  assert.ok(sessionWrite > transactionStart);
});

test("session control records are outside disposable sandbox", () => {
  assert.match(
    source,
    /\.collection\("practiceSessions"\)/
  );

  assert.doesNotMatch(
    source,
    /collection\("sandboxes"\)/
  );
});

test("server service never writes official football state", () => {
  assert.doesNotMatch(
    source,
    /\.collection\("clubs"\).*collection\("(events|results|matchSignups|state)"\)/
  );
});

test("Practice session records contain authoritative start and expiry", () => {
  assert.match(source, /startedAt/);
  assert.match(source, /expiresAt/);
  assert.match(source, /Timestamp\.fromDate/);
  assert.match(source, /Timestamp\.fromMillis/);
});

test("Practice business week is calculated server-side in SAST", () => {
  assert.match(source, /getPracticeWeekKeyFromServerDate/);
  assert.match(source, /2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
});

test("starting with no available credits fails closed", () => {
  assert.match(source, /practice\/no-credits/);
});
