import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const news = fs.readFileSync("src/pages/NewsPage.jsx", "utf8");

test("News receives real club identity", () => {
  const block = app.match(
    /<NewsPage[\s\S]*?\/>/
  )?.[0] || "";

  assert.match(block, /activeClubId=\{activeClubId\}/);
  assert.doesNotMatch(
    block,
    /activeClubId=\{sessionScopedClubId\}/
  );
});

test("News receives explicit Practice mode", () => {
  const block = app.match(
    /<NewsPage[\s\S]*?\/>/
  )?.[0] || "";

  assert.match(block, /isPracticeMode=\{isPracticeMode\}/);
});

test("News receives authoritative Practice session identity", () => {
  const block = app.match(
    /<NewsPage[\s\S]*?\/>/
  )?.[0] || "";

  assert.match(
    block,
    /practiceSessionId=\{practiceRuntime\?\.practiceSessionId \|\| null\}/
  );
});

test("News receives football DataScope", () => {
  const block = app.match(
    /<NewsPage[\s\S]*?\/>/
  )?.[0] || "";

  assert.match(block, /dataScope=\{footballDataScope\}/);
});

test("News declares explicit Practice boundary props", () => {
  assert.match(
    news,
    /isPracticeMode\s*=\s*false/
  );
  assert.match(
    news,
    /practiceSessionId\s*=\s*null/
  );
  assert.match(
    news,
    /dataScope\s*=\s*null/
  );
});

test("News Official roster reads use real club identity", () => {
  assert.match(
    news,
    /getPlayersCollection\(db,\s*safeActiveClubId\)/
  );
});

test("News Official photo reads use real club identity", () => {
  assert.match(
    news,
    /getPlayerPhotosCollection\(db,\s*safeActiveClubId\)/
  );
});

test("Stage 5C4B1 does not alter News UI", () => {
  assert.doesNotMatch(
    news,
    /isPracticeMode\s*\?\s*null/
  );
  assert.doesNotMatch(
    news,
    /!isPracticeMode\s*&&/
  );
});

console.log(
  "✓ News keeps identical UI while receiving explicit Practice context."
);
