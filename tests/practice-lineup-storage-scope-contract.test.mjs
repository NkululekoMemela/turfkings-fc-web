import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lineups = fs.readFileSync(
  "src/core/lineups.js",
  "utf8"
);

const formations = fs.readFileSync(
  "src/pages/FormationsPage.jsx",
  "utf8"
);

test("Official lineup storage retains historical key", () => {
  assert.match(
    lineups,
    /if\s*\(!isPracticeMode\)\s*\{\s*return LOCAL_KEY;/
  );
});

test("Practice lineup key includes Practice namespace", () => {
  assert.match(
    lineups,
    /\$\{LOCAL_KEY\}:practice:/
  );
});

test("Practice lineup key includes real club identity", () => {
  assert.match(
    lineups,
    /safeClubId/
  );
});

test("Practice lineup key includes authoritative session identity", () => {
  assert.match(
    lineups,
    /safeSessionId/
  );
});

test("Practice lineup storage requires session identity", () => {
  assert.match(
    lineups,
    /requireLineupStorageId\(\s*practiceSessionId,\s*"practiceSessionId"/
  );
});

test("lineup storage rejects path-like IDs", () => {
  assert.match(
    lineups,
    /normalized\.includes\("\/"\)/
  );
});

test("Formations loads lineups with Practice scope", () => {
  assert.match(
    formations,
    /loadSavedLineups\(\s*activeClubId,\s*lineupStorageOptions/
  );
});

test("Formations saves lineups with Practice scope", () => {
  assert.match(
    formations,
    /saveLineups\(\s*updatedMap,\s*activeClubId,\s*lineupStorageOptions/
  );
});

test("Formations storage scope reacts to Practice session changes", () => {
  assert.match(
    formations,
    /\[isPracticeMode,\s*practiceSessionId\]/
  );
});
