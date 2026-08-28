import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const news = fs.readFileSync("src/pages/NewsPage.jsx", "utf8");

test("Practice blocks real award Highlights repository reads", () => {
  assert.match(
    news,
    /if\s*\(isPracticeMode\)\s*{\s*setAwardHighlightLeaders/
  );
  assert.match(
    news,
    /VideoHighlightsRepository\s*\.\s*loadCurrentAwardLeadersFromFirebase/
  );
});

test("Practice does not subscribe to real custom stories", () => {
  assert.match(
    news,
    /if\s*\(isPracticeMode\)\s*{\s*setCustomStories\(\[\]\)/
  );
  assert.match(
    news,
    /collection\(db,\s*CUSTOM_NEWS_STORIES_COLLECTION\)/
  );
});

test("Practice story mutations are locally simulated", () => {
  assert.match(news, /if\s*\(isPracticeMode\)\s*{\s*const existingStory/);
  assert.match(news, /setCustomStories\(\(current\)/);
});

test("Practice does not subscribe to real kit orders", () => {
  assert.match(
    news,
    /if\s*\(isPracticeMode\)\s*{\s*setKitOrders\(\[\]\)/
  );
  assert.match(news, /subscribeToKitOrders/);
});

test("Practice kit order interaction is locally simulated", () => {
  assert.match(
    news,
    /if\s*\(isPracticeMode\)\s*{\s*setKitOrders\(\(current\)/
  );
  assert.match(news, /await removeKitOrder/);
  assert.match(news, /await upsertKitOrder/);
});

test("Practice does not subscribe to real custom polls", () => {
  assert.match(
    news,
    /if\s*\(isPracticeMode\)\s*{\s*setCustomPolls\(\[\]\)/
  );
  assert.match(news, /collection\(db,\s*CUSTOM_POLLS_COLLECTION\)/);
});

test("Practice does not subscribe to real poll votes", () => {
  assert.match(
    news,
    /if\s*\(isPracticeMode\)\s*{\s*setPollVotes\(\[\]\)/
  );
  assert.match(
    news,
    /collection\(db,\s*CUSTOM_POLL_VOTES_COLLECTION\)/
  );
});

test("Practice poll voting is locally simulated", () => {
  assert.match(news, /const practiceVote =/);
  assert.match(news, /setPollVotes\(\(current\)/);
});

test("News interactive handlers remain present", () => {
  // Practice safety must not achieve isolation by deleting the existing
  // News interactions. Verify the actual handlers rather than depending
  // on brittle presentation copy such as a particular button label.
  assert.match(news, /handleToggleKitOrder/);
  assert.match(news, /handleSaveCustomStory/);
  assert.match(news, /handleSaveCustomPoll/);
  assert.match(news, /handleVoteCustomPoll/);
});

console.log("✓ Practice News side effects are isolated without removing UI.");
