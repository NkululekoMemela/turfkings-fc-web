import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
  test(`${label} live match uses club-scoped lineup loader`, () => {
    assert.match(
      source,
      /loadSavedLineups\(\s*activeClubId,/
    );
  });

  test(`${label} derives Practice lineup mode from DataScope`, () => {
    assert.match(
      source,
      /isPracticeMode:\s*dataScope\?\.environment === "practice"/
    );
  });

  test(`${label} uses authoritative Practice session for lineup storage`, () => {
    assert.match(
      source,
      /practiceSessionId:\s*dataScope\?\.practiceSessionId \|\| null/
    );
  });

  test(`${label} lineup memo reacts to Practice session changes`, () => {
    assert.match(
      source,
      /dataScope\?\.practiceSessionId/
    );
  });

  test(`${label} no longer uses the global bare lineup loader`, () => {
    assert.doesNotMatch(
      source,
      /loadSavedLineups\(\s*\)/
    );
  });
}
