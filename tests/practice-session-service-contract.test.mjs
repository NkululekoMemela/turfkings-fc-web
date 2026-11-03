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

test("session creation and recovery pointer share one transaction", () => {
  const start = source.slice(
    source.indexOf("async function startPracticeSession"),
    source.indexOf("async function transferPracticeCredit")
  );
  assert.match(start, /db\.runTransaction/);
  assert.match(start, /transaction\.set\(refs\.sessionRef/);
  assert.match(start, /transaction\.set\(refs\.entitlementRef/);
  assert.match(start, /activeSessionId:\s*sessionId/);
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

test("Practice starts without a weekly credit restriction", () => {
  const start = source.slice(
    source.indexOf("async function startPracticeSession"),
    source.indexOf("async function transferPracticeCredit")
  );
  assert.match(start, /unlimitedPractice:\s*true/);
  assert.match(start, /creditConsumed:\s*false/);
  assert.match(start, /weeklyLimitApplied:\s*false/);
  assert.doesNotMatch(start, /practice\/no-credits/);
});

test("Practice start stores the active session pointer on entitlement", () => {
  assert.match(
    source,
    /activeSessionId:\s*sessionId/
  );
});

test("Practice service exposes active-session recovery", () => {
  assert.match(
    source,
    /async function getActivePracticeSession/
  );
});

test("active-session recovery reads the entitlement pointer", () => {
  const recovery = source.slice(
    source.indexOf("async function getActivePracticeSession")
  );
  assert.match(recovery, /await entitlementRef\.get\(\)/);
  assert.match(recovery, /entitlement\.activeSessionId/);
  assert.match(recovery, /await sessionRef\.get\(\)/);
});

test("active-session recovery validates server expiry", () => {
  assert.match(
    source,
    /expiresAt/
  );
  assert.match(
    source,
    /serverNow|getTime\(\)/
  );
});

test("active-session recovery does not consume another credit", () => {
  const fnStart = source.indexOf("async function getActivePracticeSession");
  assert.ok(fnStart >= 0);

  const recoverySource = source.slice(fnStart);

  assert.doesNotMatch(
    recoverySource,
    /creditsConsumed:\s*nextConsumed/
  );
});

test("active-session recovery validates club and user ownership", () => {
  const fnStart = source.indexOf("async function getActivePracticeSession");
  assert.ok(fnStart >= 0);

  const recoverySource = source.slice(fnStart);

  assert.match(recoverySource, /clubId/);
  assert.match(recoverySource, /userId/);
});
