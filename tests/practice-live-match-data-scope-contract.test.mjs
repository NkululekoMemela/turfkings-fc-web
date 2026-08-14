import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");

const router = fs.readFileSync(
  "src/pages/LiveMatchPage.jsx",
  "utf8"
);

const friendly = fs.readFileSync(
  "src/pages/Friendly_LiveMatchPage.jsx",
  "utf8"
);

const league = fs.readFileSync(
  "src/pages/ThreeTeamLeague_LiveMatchPage.jsx",
  "utf8"
);

for (const [label, source] of [
  ["Friendly", friendly],
  ["ThreeTeamLeague", league],
]) {
  test(`${label} live match imports scoped match helper`, () => {
    assert.match(
      source,
      /getScopedMatchDoc/
    );
  });

  test(`${label} live match accepts explicit dataScope`, () => {
    assert.match(
      source,
      /dataScope = null/
    );
  });

  test(`${label} live match resolves Practice match docs through DataScope`, () => {
    assert.match(
      source,
      /resolveLiveMatchDoc\(dataScope\)/
    );

    assert.match(
      source,
      /getScopedMatchDoc\(db,\s*MATCH_DOC_ID,\s*dataScope\)/
    );
  });

  test(`${label} live match preserves legacy Official fallback`, () => {
    assert.match(
      source,
      /:\s*getMatchDoc\(db,\s*MATCH_DOC_ID\)/
    );
  });
}

test("App passes footballDataScope into LiveMatchPage router", () => {
  const start = app.indexOf("<LiveMatchPage");
  assert.ok(start >= 0, "LiveMatchPage render not found");

  const end = app.indexOf("/>", start);
  assert.ok(end > start, "LiveMatchPage render is not closed");

  const block = app.slice(start, end + 2);
  const occurrences =
    block.match(/dataScope=\{footballDataScope\}/g) || [];

  assert.equal(
    occurrences.length,
    1,
    `Expected exactly one LiveMatchPage dataScope prop, found ${occurrences.length}`
  );
});

test("App live-match boundary keeps real club identity", () => {
  assert.match(
    app,
    /activeClubId=\{footballStateClubId\}\s*dataScope=\{footballDataScope\}/
  );
});


test("LiveMatchPage forwards App props through sharedProps", () => {
  assert.match(
    router,
    /const sharedProps\s*=\s*\{\s*\.\.\.props,/
  );

  assert.match(
    router,
    /<ThreeTeamLeagueLiveMatchPage\s+\{\.\.\.sharedProps\}/
  );

  assert.match(
    router,
    /<FriendlyLiveMatchPage\s+\{\.\.\.sharedProps\}/
  );
});

test("central Practice DataScope still derives from authoritative runtime", () => {
  assert.match(
    app,
    /practiceRuntime\?\.dataScope/
  );
});
