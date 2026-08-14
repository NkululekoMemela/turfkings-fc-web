import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cards = fs.readFileSync(
  "src/pages/PlayerCardPage.jsx",
  "utf8"
);

test("Official Player Card season snapshot key remains unchanged", () => {
  assert.match(
    cards,
    /`tk_player_card_snapshot_\$\{activeSeasonId\}`/
  );
});

test("Official Player Card latest snapshot key remains unchanged", () => {
  assert.match(
    cards,
    /"tk_player_card_snapshot_latest"/
  );
});

test("Practice snapshot namespace includes real club identity", () => {
  assert.match(
    cards,
    /safeStoragePart\(safeActiveClubId\)/
  );
});

test("Practice snapshot namespace includes authoritative session identity", () => {
  assert.match(
    cards,
    /dataScope\?\.practiceSessionId/
  );

  assert.match(
    cards,
    /safeStoragePart\(practiceSessionId\)/
  );
});

test("Practice snapshot namespace is explicitly distinct from Official", () => {
  assert.match(
    cards,
    /tk_player_card_snapshot_practice_/
  );
});

test("Practice season snapshot is session scoped", () => {
  assert.match(
    cards,
    /seasonSnapshotKey\s*=\s*`\$\{practicePrefix\}_\$\{safeStoragePart\(activeSeasonId\)\}`/
  );
});

test("Practice latest snapshot is session scoped", () => {
  assert.match(
    cards,
    /latestSnapshotKey\s*=\s*`\$\{practicePrefix\}_latest`/
  );
});

test("Practice fails closed without authoritative session ID", () => {
  assert.match(
    cards,
    /if\s*\(!practiceSessionId\)[\s\S]*?return;/
  );
});

test("snapshot writes use resolved environment-specific keys", () => {
  assert.match(
    cards,
    /window\.localStorage\.setItem\(\s*seasonSnapshotKey/
  );

  assert.match(
    cards,
    /window\.localStorage\.setItem\(\s*latestSnapshotKey/
  );
});

test("snapshot effect reacts to Practice scope changes", () => {
  assert.match(
    cards,
    /playersWithRatings,\s*isPracticeMode,\s*dataScope,\s*safeActiveClubId,\s*\]/
  );
});
