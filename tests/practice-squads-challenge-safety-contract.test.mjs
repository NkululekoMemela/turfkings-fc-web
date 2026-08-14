import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/pages/SquadsPage.jsx", "utf8");

test("Practice blocks shared challenge fixture creation", () => {
  const marker = source.indexOf(
    "Club Challenge fixture creation is disabled in Practice"
  );
  const write = source.indexOf(
    'batch.set(doc(db, "clubChallengeFixtures", fixtureId)'
  );

  assert.ok(marker >= 0, "Practice fixture-creation guard is missing");
  assert.ok(write >= 0, "Official challenge fixture write disappeared");
  assert.ok(marker < write, "Practice guard must occur before Official write");
});

test("Practice blocks challenge fixture change requests", () => {
  const start = source.indexOf(
    "const handleSubmitChallengeChangeRequest = async"
  );
  const end = source.indexOf(
    "const handleCancelChallenge = async",
    start
  );
  const block = source.slice(start, end);

  assert.match(block, /if\s*\(\s*isPracticeMode\s*\)/);
  assert.match(
    block,
    /Club Challenge change requests are disabled in Practice/
  );
  assert.match(block, /challengeNotices/);
});

test("Practice blocks challenge cancellation", () => {
  const start = source.indexOf(
    "const handleCancelChallenge = async"
  );
  const end = source.indexOf(
    "const confirmLeagueIdentityChange",
    start
  );
  const block = source.slice(start, end);

  assert.match(block, /if\s*\(\s*isPracticeMode\s*\)/);
  assert.match(
    block,
    /Club Challenge cancellation is disabled in Practice/
  );
  assert.match(block, /batch\.delete/);
  assert.match(block, /challengeNotices/);
});

test("Official shared challenge operations remain present", () => {
  assert.match(source, /clubChallengeFixtures/);
  assert.match(source, /acceptedChallenges/);
  assert.match(source, /challengeNotices/);
  assert.match(source, /batch\.commit\(\)/);
});
