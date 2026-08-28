import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync(
  "functions/practiceSessionService.js",
  "utf8"
);

const index = fs.readFileSync(
  "functions/index.js",
  "utf8"
);

test("server exposes authoritative Practice credit transfer service", () => {
  assert.match(
    service,
    /async function transferPracticeCredit/
  );

  assert.match(
    service,
    /transferPracticeCredit[\s\S]*module\.exports|module\.exports[\s\S]*transferPracticeCredit/
  );
});

test("transfer sender identity comes from authenticated user", () => {
  const start = service.indexOf(
    "async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = service.slice(start);

  assert.match(block, /authenticatedUser/);
  assert.match(block, /authenticatedUser\?\.uid/);
  assert.match(block, /authenticatedUser\?\.email/);

  assert.doesNotMatch(
    block,
    /senderUserId\s*[},=]/
  );
});

test("transfer week is server derived", () => {
  const start = service.indexOf(
    "async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = service.slice(start);

  assert.match(
    block,
    /getPracticeWeekKeyFromServerDate/
  );
});

test("transfer uses live Practice control namespace", () => {
  const start = service.indexOf(
    "async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = service.slice(start);

  assert.match(
    block,
    /\.collection\("practiceControl"\)/
  );

  assert.doesNotMatch(
    block,
    /\.collection\("practice_control"\)/
  );
});

test("transfer uses live authoritative entitlement schema", () => {
  const start = service.indexOf(
    "async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = service.slice(start);

  assert.match(block, /creditsConsumed/);
  assert.match(block, /creditsTransferredIn/);
  assert.match(block, /creditsTransferredOut/);
  assert.match(block, /weeklyBaseCredits/);
  assert.match(block, /creditsRemaining/);

  assert.doesNotMatch(block, /\bconsumedCredits\b/);
  assert.doesNotMatch(block, /\btransferredIn\b/);
  assert.doesNotMatch(block, /\btransferredOut\b/);
});

test("transfer is one atomic Firestore transaction", () => {
  const start = service.indexOf(
    "async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = service.slice(start);

  assert.match(block, /db\.runTransaction/);
  assert.match(block, /senderRef/);
  assert.match(block, /recipientRef/);
  assert.match(block, /transferRef/);
});

test("duplicate transfer IDs fail closed", () => {
  const start = service.indexOf(
    "async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = service.slice(start);

  assert.match(block, /transferSnap/);
  assert.match(
    block,
    /practice\/transfer-exists|Practice transfer already exists/
  );
});

test("transfer cannot write Official football state", () => {
  const start = service.indexOf(
    "async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = service.slice(start);

  assert.doesNotMatch(
    block,
    /\.collection\("clubs"\)[\s\S]*\.collection\("(?:state|events|results|matches|matchSignups)"\)/
  );

  assert.doesNotMatch(
    block,
    /\.collection\("sandboxes"\)/
  );
});

test("HTTP transfer endpoint is server authenticated", () => {
  assert.match(
    index,
    /exports\.transferPracticeCredit\s*=\s*onRequest/
  );

  const start = index.indexOf(
    "exports.transferPracticeCredit = onRequest("
  );

  assert.ok(start >= 0);

  const block = index.slice(start);

  assert.match(block, /requireFirebaseUser\(req\)/);
  assert.match(block, /transferPracticeCreditService/);
});

test("HTTP transfer endpoint accepts destination but not sender authority", () => {
  const start = index.indexOf(
    "exports.transferPracticeCredit = onRequest("
  );

  assert.ok(start >= 0);

  const block = index.slice(start);

  assert.match(block, /recipientUserId/);
  assert.match(block, /transferId/);
  assert.match(block, /clubId/);

  for (const forbidden of [
    "senderUserId",
    "senderRole",
    "recipientRole",
    "weekKey",
    "creditsRemaining",
    "creditsTransferredIn",
    "creditsTransferredOut",
  ]) {
    assert.doesNotMatch(
      block,
      new RegExp(
        `parseRequestValue\\\\(req,\\\\s*["']${forbidden}["']\\\\)`
      )
    );
  }
});
