import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

const app = fs.readFileSync(
  "src/App.jsx",
  "utf8"
);

test("Practice service exposes authoritative voluntary termination", () => {
  assert.match(service, /async function endPracticeSession\s*\(/);
  assert.match(service, /endPracticeSession,/);
});

test("ending Practice records the authoritative lifecycle status", () => {
  assert.match(
    service,
    /const finalStatus\s*=\s*[\s\S]*?["']expired["'][\s\S]*?["']ended["']/
  );
  assert.match(service, /status:\s*finalStatus/);
  assert.match(service, /endedAt:/);
  assert.match(service, /endedReason:\s*safeReason/);
});

test("ending Practice clears authoritative active-session pointer", () => {
  assert.match(service, /activeSessionId:\s*null/);
});

test("ending Practice does not refund or rewrite credits", () => {
  const start = service.indexOf("async function endPracticeSession");
  const end = service.indexOf(
    "async function getActivePracticeSession",
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block = service.slice(start, end);

  assert.doesNotMatch(block, /creditsConsumed\s*:/);
  assert.doesNotMatch(block, /creditsRemaining\s*:/);
  assert.doesNotMatch(block, /weeklyBaseCredits\s*:/);
  assert.doesNotMatch(block, /creditsTransferredIn\s*:/);
  assert.doesNotMatch(block, /creditsTransferredOut\s*:/);
});

test("Practice termination endpoint requires Firebase authentication", () => {
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

  assert.match(
    block,
    /requireFirebaseUser\s*\(\s*req\s*\)/
  );

  assert.match(
    block,
    /endPracticeSessionService/
  );
});

test("client termination gateway uses Firebase bearer authentication", () => {
  const start = gateway.indexOf(
    "export async function endPracticeSession"
  );

  assert.ok(start >= 0);

  const block = gateway.slice(start);

  assert.match(block, /auth\?\.currentUser/);
  assert.match(block, /getIdToken\s*\(\s*true\s*\)/);
  assert.match(
    block,
    /Authorization["']?\s*:\s*`Bearer \$\{idToken\}`/
  );
  assert.match(block, /\/endPracticeSession/);
});

test("Change Profile terminates Practice before clearing client runtime", () => {
  const start = app.indexOf(
    "const handleChangeProfile = async () =>"
  );

  const end = app.indexOf("\n  };", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block = app.slice(start, end);

  const terminate = block.indexOf("await endPracticeSession");
  const clear = block.indexOf("setPracticeRuntime(null)");
  const entry = block.indexOf("setPage(PAGE_ENTRY)");

  assert.ok(terminate >= 0);
  assert.ok(clear > terminate);
  assert.ok(entry > clear);
});

test("failed authoritative termination keeps user inside Practice", () => {
  const start = app.indexOf(
    "const handleChangeProfile = async () =>"
  );

  const end = app.indexOf("\n  };", start);

  const block = app.slice(start, end);

  assert.match(block, /Could not leave Practice yet/);
  assert.match(block, /return;/);
});

test("Practice restriction modal no longer offers Change Profile", () => {
  const marker = app.indexOf(
    "practiceRestrictionModal.buttonLabel"
  );

  assert.ok(marker >= 0);

  const block = app.slice(
    Math.max(0, marker - 1000),
    marker + 1000
  );

  assert.match(block, /Got it/);
  assert.doesNotMatch(block, />\s*Change Profile\s*</);
  assert.doesNotMatch(block, />\s*Stay in Practice\s*</);
});

test("weekly Practice exhaustion uses premium modal instead of browser alert", () => {
  assert.match(
    app,
    /Practice sessions used for this week/
  );

  const start = app.indexOf(
    'if (err?.code === "practice/no-credits")'
  );

  assert.ok(start >= 0);

  const block = app.slice(start, start + 1200);

  assert.match(block, /showPracticeRestriction/);
  assert.doesNotMatch(block, /window\.alert/);
});
