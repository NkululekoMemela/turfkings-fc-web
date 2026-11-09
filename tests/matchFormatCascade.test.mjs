import assert from "node:assert/strict";
import test from "node:test";
import {buildMatchClassification, getPlayersPerSide, resolveGameFormat} from "../src/core/matchConfig.js";
import {fieldFormat} from "../functions/fieldBoothShared/fieldFormat.mjs";
import {resolvePreferredTeamLineup, writeLineupVariant} from "../functions/fieldBoothShared/lineups.mjs";
import {build as fieldStartingLineups} from "../functions/fieldStartingFormation.mjs";

test("a saved Club format survives a stale camera setting and reload", () => {
  const saved = JSON.parse(JSON.stringify({gameFormat:"11_V_11", cameraGameFormat:"5_V_5"}));
  assert.equal(resolveGameFormat(saved.gameFormat, saved.cameraGameFormat), "11_V_11");
  assert.equal(resolveGameFormat(undefined, "7_ASIDE"), "7_V_7");
  assert.equal(resolveGameFormat(undefined, "3_TEAM_LEAGUE"), "5_V_5");
});

for (const size of [5, 6, 7, 11]) {
  test(`${size}-a-side carries the saved formation and exact starter count into Club and Field kickoff`, () => {
    const format = `${size}_V_${size}`;
    const teams = [{id:"home"}, {id:"away"}];
    const squads = Object.fromEntries(teams.map(({id}) => [id,
      Array.from({length:size + 1}, (_, i) => ({fullName:`${id === "home" ? "Home" : "Away"} Player ${i + 1}`}))]));
    const {lineupKey, formations, defaultFormationId} = fieldFormat(format);
    const alternate = Object.values(formations).find(item => item.id !== defaultFormationId);
    const saved = {};
    let variants = {};
    for (const {id} of teams) {
      const names = squads[id].map(player => player.fullName);
      const positions = Object.fromEntries(alternate.positions.map(({id:slot}, i) => [slot,names[size-i-1]]));
      saved[id] = {formationId:alternate.id, positions, benchSnapshot:names.slice(size),
        matchDayId:"day", squadFingerprint:`squad-${id}`};
      variants = writeLineupVariant(variants, id, lineupKey, saved[id], "captain");
      assert.equal(getPlayersPerSide(format), Object.keys(positions).length);
      const kickoff = buildMatchClassification({matchMode:"FRIENDLY", gameFormat:format});
      assert.equal(kickoff.playersPerSide, size);
      const lineup = resolvePreferredTeamLineup({id}, fieldFormat(kickoff.gameFormat).lineupKey,
        variants, formations, defaultFormationId, names);
      assert.equal(lineup.formationId, alternate.id);
      assert.deepEqual(lineup.positions, positions);
    }
    const field = fieldStartingLineups({season:{gameFormat:format, savedLineups:variants},
      fixture:{clubAId:"home",clubBId:"away",matchDayId:"day"}, squads,
      squadFingerprints:{home:"squad-home",away:"squad-away"}});
    assert.deepEqual(field.startingLineups.home.positions, saved.home.positions);
    assert.deepEqual(field.startingLineups.away.benchSnapshot, saved.away.benchSnapshot);
  });
}
