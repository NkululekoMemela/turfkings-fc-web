import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");

test("Practice blocks returned camera highlight persistence", () => {
  assert.match(
    app,
    /const persistReturnedHighlightsToFirebase = async \(items\) => \{[\s\S]*?if \(isPracticeMode\) return;/
  );
});

test("Practice blocks direct highlight uploads", () => {
  assert.match(
    app,
    /const handleUploadHighlight = async \(payload\) => \{[\s\S]*?if \(isPracticeMode\) \{[\s\S]*?Video highlight uploads are disabled/
  );
});

test("Practice blocks highlight vote persistence", () => {
  assert.match(
    app,
    /if \(\s*!isPracticeMode &&\s*userId &&\s*currentVideoHighlightsMatchId\s*\) \{[\s\S]*?saveHighlightVotesToFirebase/
  );
});

test("Practice blocks highlight archival during match finalisation", () => {
  assert.match(
    app,
    /if \(\s*!isPracticeMode &&\s*currentVideoHighlightsMatchId &&\s*highlightArchiveSelection\s*\) \{[\s\S]*?archiveWinningHighlightsToFirebase/
  );
});

test("VideoHighlightsPage receives real club identity", () => {
  const block = app.match(
    /<VideoHighlightsPage[\s\S]*?\/>/
  )?.[0] || "";

  assert.match(block, /activeClubId=\{activeClubId\}/);
  assert.doesNotMatch(block, /activeClubId=\{sessionScopedClubId\}/);
});

// Practice deliberately keeps Highlights UI parity with Official.
// Navigation/camera visibility is covered by
// practice-highlights-ui-parity-contract.test.mjs.
// This contract protects only permanent/external effects.
