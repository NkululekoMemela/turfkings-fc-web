import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hook = fs.readFileSync(
  "src/hooks/usePeerRatings.js",
  "utf8"
);

const app = fs.readFileSync(
  "src/App.jsx",
  "utf8"
);

test("peer ratings hook imports Official and scoped collection helpers", () => {
  assert.match(hook, /getPeerRatingsCollection/);
  assert.match(hook, /getScopedPeerRatingsCollection/);
});

test("peer ratings hook accepts explicit environment context", () => {
  assert.match(
    hook,
    /activeClubId\s*=\s*null[\s\S]*isPracticeMode\s*=\s*false[\s\S]*dataScope\s*=\s*null/
  );
});

test("Practice peer ratings use DataScope collection", () => {
  assert.match(
    hook,
    /isPracticeMode[\s\S]*\?\s*getScopedPeerRatingsCollection\(db,\s*dataScope\)/
  );
});

test("Official peer ratings use real active club identity", () => {
  assert.match(
    hook,
    /:\s*getPeerRatingsCollection\(db,\s*activeClubId\)/
  );
});

test("hook does not manufacture a synthetic Practice club", () => {
  assert.doesNotMatch(hook, /-practice/);
});

test("peer ratings subscription reacts to DataScope changes", () => {
  assert.match(
    hook,
    /\[\s*activeSeasonId,\s*activeClubId,\s*isPracticeMode,\s*dataScope,\s*\]/
  );
});

test("App passes real club identity to peer ratings hook", () => {
  assert.match(
    app,
    /usePeerRatings\([\s\S]*?activeClubId,[\s\S]*?isPracticeMode,[\s\S]*?dataScope:\s*footballDataScope/
  );
});

test("App uses one shared peer ratings hook", () => {
  const calls = app.match(/usePeerRatings\(/g) || [];
  assert.equal(calls.length, 1);
});
