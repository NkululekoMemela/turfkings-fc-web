import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const lineups = fs.readFileSync("src/core/lineups.js", "utf8");

test("clean-sheet engine accepts an explicit formation map", () => {
  assert.match(
    lineups,
    /formationMap\s*=\s*FORMATIONS_5/
  );

  assert.match(
    lineups,
    /getGoalkeeperFromSnapshot\(lineupA,\s*formationMap\)/
  );

  assert.match(
    lineups,
    /getDefensivePlayersFromSnapshot\(lineupA,\s*formationMap\)/
  );

  assert.match(
    lineups,
    /getGoalkeeperFromSnapshot\(lineupB,\s*formationMap\)/
  );

  assert.match(
    lineups,
    /getDefensivePlayersFromSnapshot\(lineupB,\s*formationMap\)/
  );
});

test("App resolves 5v5 6v6 and 7v7 formation families", () => {
  assert.match(
    app,
    /resolved\s*===\s*GAME_FORMAT\.SIX_V_SIX[\s\S]*?return FORMATIONS_6/
  );

  assert.match(
    app,
    /resolved\s*===\s*GAME_FORMAT\.SEVEN_V_SEVEN[\s\S]*?return FORMATIONS_7/
  );

  assert.match(
    app,
    /return FORMATIONS_5/
  );
});

test("both League clean-sheet paths pass active formation map", () => {
  const matches =
    app.match(
      /formationMap:\s*getFormationMapForGameFormat\(\s*matchMeta\.gameFormat\s*\)/g
    ) || [];

  assert.equal(
    matches.length,
    2,
    "both League clean-sheet paths must use the active formation family"
  );
});

console.log("PASS multi-format clean-sheet contract");
