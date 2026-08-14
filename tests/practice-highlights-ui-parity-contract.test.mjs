import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");

test("Practice does not block Highlights page navigation", () => {
  const start = app.indexOf("const handleGoToViewHighlights");
  assert.ok(start >= 0);

  const end = app.indexOf(
    "const applyRecoveredLiveDraftToControls",
    start
  );
  assert.ok(end > start);

  const block = app.slice(start, end);

  assert.match(
    block,
    /setPage\(PAGE_VIEW_HIGHLIGHTS\)/
  );

  assert.doesNotMatch(
    block,
    /if\s*\(\s*isPracticeMode\s*\)/
  );

  assert.doesNotMatch(
    block,
    /Highlights are for Official Sessions/
  );
});

test("Practice does not block the Highlights camera entry point", () => {
  const start = app.indexOf("const handleOpenHighlightsCamera");
  assert.ok(start >= 0);

  const end = app.indexOf(
    "const handle",
    start + "const handleOpenHighlightsCamera".length
  );

  const block =
    end > start
      ? app.slice(start, end)
      : app.slice(start, start + 7000);

  assert.doesNotMatch(
    block,
    /if\s*\(\s*isPracticeMode\s*\)/
  );

  assert.doesNotMatch(
    block,
    /Camera uploads are for Official Sessions/
  );
});

test("Highlights page remains rendered in Practice", () => {
  assert.match(
    app,
    /\{page === PAGE_VIEW_HIGHLIGHTS && \(/
  );

  assert.match(
    app,
    /<VideoHighlightsPage/
  );
});

test("Highlights page keeps real club identity", () => {
  const start = app.indexOf("<VideoHighlightsPage");
  assert.ok(start >= 0);

  const block = app.slice(start, start + 2500);

  assert.match(
    block,
    /activeClubId=\{activeClubId\}/
  );

  assert.doesNotMatch(
    block,
    /activeClubId=\{sessionScopedClubId\}/
  );
});
