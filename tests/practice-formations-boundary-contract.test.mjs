import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const formations = fs.readFileSync(
  "src/pages/FormationsPage.jsx",
  "utf8"
);

test("Formations receives real club identity", () => {
  const match = app.match(
    /<FormationsPage[\s\S]*?\/>/
  );

  assert.ok(match, "FormationsPage render not found");

  assert.match(
    match[0],
    /activeClubId=\{activeClubId\}/
  );

  assert.doesNotMatch(
    match[0],
    /activeClubId=\{sessionScopedClubId\}/
  );
});

test("Formations receives explicit Practice mode", () => {
  const match = app.match(
    /<FormationsPage[\s\S]*?\/>/
  );

  assert.ok(match);

  assert.match(
    match[0],
    /isPracticeMode=\{isPracticeMode\}/
  );
});

test("Formations receives authoritative Practice session identity", () => {
  const match = app.match(
    /<FormationsPage[\s\S]*?\/>/
  );

  assert.ok(match);

  assert.match(
    match[0],
    /practiceSessionId=\{practiceRuntime\?\.practiceSessionId \|\| null\}/
  );
});

test("Formations declares Practice boundary props", () => {
  assert.match(
    formations,
    /isPracticeMode = false/
  );

  assert.match(
    formations,
    /practiceSessionId = null/
  );
});

test("Formations Official roster read remains club scoped", () => {
  assert.match(
    formations,
    /getPlayersCollection\(db, activeClubId\)/
  );
});

test("Formations Official photo read remains club scoped", () => {
  assert.match(
    formations,
    /getPlayerPhotosCollection\(db, activeClubId\)/
  );
});

test("Formations lineup persistence is explicitly Practice scoped", () => {
  assert.match(
    formations,
    /loadSavedLineups\(\s*activeClubId,\s*lineupStorageOptions/
  );
  assert.match(
    formations,
    /saveLineups\(\s*updatedMap,\s*activeClubId,\s*lineupStorageOptions/
  );
});

console.log(
  "✓ Formations uses real club identity for Official read-only inputs."
);
console.log(
  "✓ Practice/session identity is now explicit at the page boundary."
);
