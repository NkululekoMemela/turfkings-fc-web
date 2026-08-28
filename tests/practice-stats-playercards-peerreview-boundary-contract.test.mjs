import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const stats = fs.readFileSync("src/pages/StatsPage.jsx", "utf8");
const cards = fs.readFileSync("src/pages/PlayerCardPage.jsx", "utf8");
const peer = fs.readFileSync("src/pages/PeerReviewPage.jsx", "utf8");

test("Stats receives Practice boundary", () => {
  const block = app.match(/<StatsPage[\s\S]*?\/>/)?.[0] || "";
  assert.match(block, /isPracticeMode=\{isPracticeMode\}/);
  assert.match(block, /dataScope=\{footballDataScope\}/);
  assert.match(stats, /isPracticeMode = false/);
  assert.match(stats, /dataScope = null/);
});

test("Player Cards receive Practice boundary", () => {
  const block = app.match(/<PlayerCardPage[\s\S]*?\/>/)?.[0] || "";
  assert.match(block, /isPracticeMode=\{isPracticeMode\}/);
  assert.match(block, /dataScope=\{footballDataScope\}/);
  assert.match(cards, /isPracticeMode = false/);
  assert.match(cards, /dataScope = null/);
});

test("Peer Review receives Practice boundary", () => {
  const block = app.match(/<PeerReviewPage[\s\S]*?\/>/)?.[0] || "";
  assert.match(block, /isPracticeMode=\{isPracticeMode\}/);
  assert.match(block, /dataScope=\{footballDataScope\}/);
  assert.match(peer, /isPracticeMode = false/);
  assert.match(peer, /dataScope = null/);
});

test("Stage 5D1 does not yet alter Peer Review persistence", () => {
  assert.match(peer, /getPeerRatingsCollection/);
  assert.match(peer, /getPeerRatingBaselinesCollection/);
  assert.match(peer, /CLUB_COLLECTIONS\.peerRatings/);
  assert.match(peer, /CLUB_COLLECTIONS\.peerRatingBaselines/);
});

test("Practice cannot inherit Official completed-session history", () => {
  assert.match(
    app,
    /matchDayHistory\s*=\s*isPracticeMode\s*&&\s*!s\?\.isPracticeSeason\s*\?\s*\[\]\s*:\s*s\?\.matchDayHistory\s*\|\|\s*\[\]/
  );

  assert.match(
    app,
    /friendlyMatchDayHistory\s*=\s*isPracticeMode\s*&&\s*!s\?\.isPracticeSeason\s*\?\s*\[\]\s*:\s*s\?\.friendlyMatchDayHistory\s*\|\|\s*\[\]/
  );
});
