import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/storage/practiceRosterRepository.js",
  "utf8"
);

test("Practice roster uses Official club-scoped players", () => {
  assert.match(source, /getPlayersCollection/);
  assert.match(source, /getPlayersCollection\(db,\s*safeClubId\)/);
});

test("Practice roster reads through Firestore getDocs", () => {
  assert.match(source, /\bgetDocs\b/);
});

test("Practice roster repository contains no Firestore write primitives", () => {
  assert.doesNotMatch(
    source,
    /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\b/
  );
});

test("Practice roster repository does not use global players collection", () => {
  assert.doesNotMatch(
    source,
    /collection\s*\(\s*db\s*,\s*["']players["']\s*\)/
  );
});

test("Practice roster repository does not read platformPlayers as football roster", () => {
  assert.doesNotMatch(
    source,
    /collection\s*\(\s*db\s*,\s*["']platformPlayers["']\s*\)/
  );
});

test("Practice roster repository does not write sandbox football state", () => {
  assert.doesNotMatch(
    source,
    /sandboxes\/practice/
  );
});

test("Practice roster rejects path injection through clubId", () => {
  assert.match(source, /clubId\.includes\(["']\/["']\)/);
});

test("Practice roster preserves stable identity references", () => {
  assert.match(source, /playerId:/);
  assert.match(source, /memberId:/);
  assert.match(source, /platformIdentityUid:/);
});

test("Practice roster excludes inactive players", () => {
  assert.match(source, /\.filter\(/);
  assert.match(source, /active/);
});
