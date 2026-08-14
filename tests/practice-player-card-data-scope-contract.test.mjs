import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const cards = fs.readFileSync(
  "src/pages/PlayerCardPage.jsx",
  "utf8"
);

test("Player Cards receive real club identity", () => {
  const block =
    app.match(/<PlayerCardPage[\s\S]*?\/>/)?.[0] || "";

  assert.match(block, /activeClubId=\{activeClubId\}/);
  assert.doesNotMatch(
    block,
    /activeClubId=\{sessionScopedClubId\}/
  );
});

test("Peer Review receives real club identity", () => {
  const block =
    app.match(/<PeerReviewPage[\s\S]*?\/>/)?.[0] || "";

  assert.match(block, /activeClubId=\{activeClubId\}/);
  assert.doesNotMatch(
    block,
    /activeClubId=\{sessionScopedClubId\}/
  );
});

test("Practice Player Card state uses DataScope", () => {
  assert.match(
    cards,
    /isPracticeMode[\s\S]*?getScopedStateDoc\(db,\s*dataScope\)/
  );
});

test("Official Player Card state remains club scoped", () => {
  assert.match(
    cards,
    /:\s*getClubStateDoc\(db,\s*safeActiveClubId\)/
  );
});

test("Practice Player Card peer baselines use DataScope", () => {
  assert.match(
    cards,
    /isPracticeMode[\s\S]*?getScopedPeerRatingBaselinesCollection\(db,\s*dataScope\)/
  );
});

test("Official Player Card peer baselines remain club scoped", () => {
  assert.match(
    cards,
    /:\s*getPeerRatingBaselinesCollection\(db,\s*safeActiveClubId\)/
  );
});

test("Player Card identity reads remain real club scoped", () => {
  assert.match(
    cards,
    /getDocs\(getPlayersCollection\(db,\s*safeActiveClubId\)\)/
  );

  assert.match(
    cards,
    /getDocs\(getPlayerPhotosCollection\(db,\s*safeActiveClubId\)\)/
  );
});

test("Practice Player Cards do not inherit carry snapshots", () => {
  assert.match(
    cards,
    /const carrySnapshots = isPracticeMode\s*\?\s*\{\}/
  );
});

test("Practice Player Cards do not inherit championship stars", () => {
  assert.match(
    cards,
    /const starsByPlayer = isPracticeMode\s*\?\s*\{\}/
  );
});

test("Player Card loader reacts to DataScope changes", () => {
  assert.match(
    cards,
    /\[\s*activeSeasonId,\s*finalPlayerCardSnapshot,\s*safeActiveClubId,\s*isPracticeMode,\s*dataScope,\s*\]/
  );
});

test("Player Card does not manufacture a fake Practice club ID", () => {
  assert.doesNotMatch(
    cards,
    /clubId.*-practice|-practice.*clubId/
  );
});
