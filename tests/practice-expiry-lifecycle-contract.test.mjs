import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const service = fs.readFileSync(
  "functions/practiceSessionService.js",
  "utf8"
);
const functionsIndex = fs.readFileSync(
  "functions/index.js",
  "utf8"
);
const gateway = fs.readFileSync(
  "src/storage/practiceSessionGateway.js",
  "utf8"
);

test("Practice warns once during the final forty-five seconds and remains dismissible", () => {
  assert.match(
    app,
    /practiceRemainingSeconds\s*>\s*0[\s\S]*practiceRemainingSeconds\s*<=\s*45/
  );
  assert.match(app, /45 seconds remaining/);
  assert.match(app, /buttonLabel:\s*"OK"/);
  assert.match(app, /practiceExpiryWarningAcknowledgedRef\.current/);
});

test("Practice handles zero only once", () => {
  assert.match(app, /practiceRemainingSeconds\s*!==\s*0/);
  assert.match(app, /practiceExpiryHandledRef\.current/);
  assert.match(app, /Practice session ended/);
});

test("timed expiry requests authoritative lifecycle reason", () => {
  assert.match(
    app,
    /endPracticeSession\(\{[\s\S]*?reason:\s*"time-expired"/
  );
});

test("expired Practice returns to Choose Session", () => {
  assert.match(app, /setPracticeRuntime\(null\)/);
  assert.match(app, /setSessionMode\("official"\)/);
  assert.match(app, /setShowSessionSelector\(true\)/);
  assert.match(app, /setPage\(PAGE_LANDING\)/);
});

test("server distinguishes timeout from Change Profile", () => {
  const start = service.indexOf("async function endPracticeSession");
  const end = service.indexOf(
    "async function getActivePracticeSession",
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block = service.slice(start, end);

  assert.match(block, /reason\s*=\s*"change-profile"/);
  assert.match(block, /safeReason/);
  assert.match(block, /finalStatus/);
  assert.match(block, /"time-expired"/);
  assert.match(block, /"expired"/);
  assert.match(block, /"ended"/);
  assert.match(block, /endedReason:\s*safeReason/);
});

test("expiry clears pointer without refunding credit", () => {
  const start = service.indexOf("async function endPracticeSession");
  const end = service.indexOf(
    "async function getActivePracticeSession",
    start
  );

  const block = service.slice(start, end);

  assert.match(block, /activeSessionId:\s*null/);
  assert.doesNotMatch(block, /creditsConsumed\s*:/);
  assert.doesNotMatch(block, /creditsRemaining\s*:/);
});

test("HTTP endpoint normalizes lifecycle reason", () => {
  const start = functionsIndex.indexOf(
    "exports.endPracticeSession"
  );

  const end = functionsIndex.indexOf(
    "exports.startPracticeSession",
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block = functionsIndex.slice(start, end);

  assert.match(block, /req\.body\?\.reason/);
  assert.match(block, /"time-expired"/);
  assert.match(block, /"change-profile"/);
  assert.match(block, /reason,/);
});

test("client gateway carries normalized lifecycle reason", () => {
  const start = gateway.indexOf(
    "export async function endPracticeSession"
  );

  assert.ok(start >= 0);

  const block = gateway.slice(start);

  assert.match(block, /reason\s*=\s*"change-profile"/);
  assert.match(block, /reason\s*===\s*"time-expired"/);
  assert.match(block, /"change-profile"/);
});
