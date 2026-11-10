import test from "node:test";
import assert from "node:assert/strict";
import {GAME_FORMAT, MATCH_MODE, clubGameFormatsAfterModeSwitch, regularClubGameFormat} from "../src/core/matchConfig.js";

test("regular Club modes remember their own formats and do not borrow another mode’s 11v11", () => {
  const friendly = {matchType: MATCH_MODE.FRIENDLY, gameFormat: GAME_FORMAT.ELEVEN_V_ELEVEN};
  assert.equal(regularClubGameFormat(friendly, MATCH_MODE.LEAGUE), GAME_FORMAT.FIVE_V_FIVE);
  const league = {matchType: MATCH_MODE.LEAGUE, gameFormat: GAME_FORMAT.FIVE_V_FIVE,
    gameFormatsByMode: clubGameFormatsAfterModeSwitch(friendly, MATCH_MODE.LEAGUE)};
  assert.equal(regularClubGameFormat(league, MATCH_MODE.LEAGUE), GAME_FORMAT.FIVE_V_FIVE);
  assert.equal(regularClubGameFormat(league, MATCH_MODE.FRIENDLY), GAME_FORMAT.ELEVEN_V_ELEVEN);
});
