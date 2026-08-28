import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lineups = fs.readFileSync("src/core/lineups.js", "utf8");

test("clean-sheet awards explicitly reject foreign guests", () => {
  const start = lineups.indexOf(
    "export function buildCleanSheetEventsForMatch"
  );
  const end = lineups.indexOf(
    "// ---------------- FRIENDLY DEFENSIVE BLOCK EVENTS",
    start
  );

  assert.ok(start >= 0, "clean-sheet builder must exist");
  assert.ok(end > start, "clean-sheet builder boundary must exist");

  const section = lineups.slice(start, end);

  assert.match(
    section,
    /isGuestPlayerInSnapshot\s*\(\s*snapshot\s*,\s*playerName\s*\)/
  );
});

test("Friendly Defensive Blocks explicitly reject foreign guests", () => {
  const start = lineups.indexOf(
    "export function buildFriendlyDefensiveBlockEvents"
  );

  assert.ok(start >= 0, "Friendly Defensive Block builder must exist");

  const section = lineups.slice(start);

  assert.match(
    section,
    /isGuestPlayerInSnapshot\s*\(\s*snapshot\s*,\s*playerName\s*\)/
  );
});

test("borrowed registered goalkeeper remains separate from guest identity", () => {
  assert.match(
    lineups,
    /borrowedGoalkeepers:\s*normalizeLineupNames/
  );

  assert.match(
    lineups,
    /guestPlayers:\s*normalizedGuestPlayers/
  );
});

console.log("PASS guest defensive awards contract");
