import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/storage/practiceSessionGateway.js",
  "utf8"
);

test("Practice gateway exposes transferPracticeCredit", () => {
  assert.match(
    source,
    /export async function transferPracticeCredit/
  );
});

test("transfer gateway requires club, recipient, and transfer ID", () => {
  const start = source.indexOf(
    "export async function transferPracticeCredit"
  );

  assert.ok(start >= 0);

  const block = source.slice(start);

  assert.match(block, /clubId/);
  assert.match(block, /recipientUserId/);
  assert.match(block, /transferId/);
});

test("transfer gateway authenticates with Firebase ID token", () => {
  const start = source.indexOf(
    "export async function transferPracticeCredit"
  );

  const block = source.slice(start);

  assert.match(block, /auth\?\.currentUser/);
  assert.match(block, /getIdToken\(true\)/);
  assert.match(block, /Authorization/);
  assert.match(block, /Bearer \$\{idToken\}/);
});

test("transfer gateway calls authoritative server endpoint", () => {
  const start = source.indexOf(
    "export async function transferPracticeCredit"
  );

  const block = source.slice(start);

  assert.match(
    block,
    /getFunctionsBaseUrl\(\)\}\/transferPracticeCredit/
  );
});

test("transfer request cannot declare sender or accounting authority", () => {
  const start = source.indexOf(
    "export async function transferPracticeCredit"
  );

  const block = source.slice(start);

  for (const forbidden of [
    "senderUserId:",
    "senderRole:",
    "recipientRole:",
    "weekKey:",
    "creditsRemaining:",
    "creditsTransferredIn:",
    "creditsTransferredOut:",
  ]) {
    assert.doesNotMatch(block, new RegExp(forbidden));
  }
});

test("transfer gateway propagates server error code and status", () => {
  const start = source.indexOf(
    "export async function transferPracticeCredit"
  );

  const block = source.slice(start);

  assert.match(block, /data\?\.code/);
  assert.match(block, /error\.status = response\.status/);
});

test("transfer gateway returns server transfer result", () => {
  const start = source.indexOf(
    "export async function transferPracticeCredit"
  );

  const block = source.slice(start);

  assert.match(block, /data\?\.transfer/);
  assert.match(block, /return data\.transfer/);
});
