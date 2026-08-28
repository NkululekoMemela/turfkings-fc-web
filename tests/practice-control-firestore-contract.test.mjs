import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../src/storage/practiceControlRepository.js",
    import.meta.url
  ),
  "utf8"
);

test("credit consumption uses Firestore transaction", () => {
  assert.match(
    source,
    /export async function consumePracticeCreditTransaction/
  );

  assert.match(
    source,
    /runTransaction\(db/
  );

  assert.match(
    source,
    /No Practice credits available/
  );
});

test("credit transfer is atomic and records ledger entry", () => {
  assert.match(
    source,
    /export async function transferPracticeCreditTransaction/
  );

  assert.match(
    source,
    /senderRef/
  );

  assert.match(
    source,
    /recipientRef/
  );

  assert.match(
    source,
    /transferRef/
  );
});

test("duplicate transfer IDs fail closed", () => {
  assert.match(
    source,
    /if \(transferSnap\.exists\(\)\)/
  );

  assert.match(
    source,
    /Practice transfer already exists/
  );
});

test("repository contains no disposable football collections", () => {
  assert.doesNotMatch(
    source,
    /sandboxes\/practice/
  );

  assert.doesNotMatch(
    source,
    /["']matches["']/
  );

  assert.doesNotMatch(
    source,
    /["']results["']/
  );

  assert.doesNotMatch(
    source,
    /["']events["']/
  );

  assert.doesNotMatch(
    source,
    /["']matchSignups["']/
  );
});

test("repository does not touch official clubs namespace", () => {
  assert.doesNotMatch(
    source,
    /doc\(\s*db,\s*["']clubs["']/
  );

  assert.doesNotMatch(
    source,
    /collection\(\s*db,\s*["']clubs["']/
  );
});
