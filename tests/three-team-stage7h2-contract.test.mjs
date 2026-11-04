import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(
  "src/pages/ThreeTeamLeague_LiveMatchPage.jsx",
  "utf8"
);

const lineups = fs.readFileSync(
  "src/core/lineups.js",
  "utf8"
);

test("verified lineup snapshot preserves borrowed goalkeeper identity", () => {
  assert.match(
    lineups,
    /borrowedGoalkeepers:\s*normalizeLineupNames/
  );
});

test("borrowed goalkeeper is not represented as a foreign guest", () => {
  assert.match(
    page,
    /borrowedGoalkeepers:\s*\[allowedPlayer\]/
  );

  assert.match(
    page,
    /guestPlayers:\s*\(prev\?\.guestPlayers \|\| \[\]\)\.filter/
  );
});

test("borrowed registered player is explicitly restricted to GK", () => {
  assert.match(
    page,
    /String\(position\?\.label \|\| ""\)\.toUpperCase\(\) === "GK"/
  );

  assert.match(
    page,
    /nextPositions\[gkPosition\.id\]\s*=\s*allowedPlayer/
  );
});

test("borrowed GK can come from another ThreeTeamLeague team", () => {
  assert.match(
    page,
    /\.filter\(\(team\) => team\?\.id !== teamAId\)/
  );

  assert.match(
    page,
    /\.filter\(\(team\) => team\?\.id !== teamBId\)/
  );
});

test("short-handed referee receives both recovery routes", () => {
  assert.match(
    page,
    /Borrow a registered player from/
  );

  assert.match(
    page,
    /add a guest below/
  );

  assert.match(
    page,
    /Borrow goalkeeper/
  );

  assert.match(
    page,
    /className="live-guest-add"/
  );
});

test("foreign guest clean-sheet exclusion remains intact", () => {
  assert.match(
    lineups,
    /if \(isGuestPlayerInSnapshot\(snapshot, playerName\)\) return;/
  );
});

test("borrowed goalkeeper metadata participates in lineup equality", () => {
  assert.match(
    page,
    /aBorrowedGoalkeepers/
  );

  assert.match(
    page,
    /bBorrowedGoalkeepers/
  );
});

test("borrowed goalkeeper survives verified lineup snapshot", () => {
  assert.match(
    page,
    /borrowedGoalkeepers:\s*uniquePlayersNormalized/
  );
});

test("borrowed goalkeeper never becomes borrowing team's registered player", () => {
  const borrowHandlerStart = page.indexOf(
    "const handleBorrowGoalkeeper"
  );

  const guestHandlerStart = page.indexOf(
    "const handleGuestAdd",
    borrowHandlerStart
  );

  assert.ok(borrowHandlerStart >= 0);
  assert.ok(guestHandlerStart > borrowHandlerStart);

  const handler = page.slice(
    borrowHandlerStart,
    guestHandlerStart
  );

  assert.doesNotMatch(
    handler,
    /registeredPlayers\s*:/
  );

  assert.doesNotMatch(
    handler,
    /allRegistered\.push/
  );
});

console.log(`
==========================================
STAGE 7H2 BORROWED GK CONTRACT
==========================================
`);
