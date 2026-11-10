import {buildBestOutfieldAssignment} from "./playerPositioning.mjs";

import {fieldFormat} from "./fieldBoothShared/fieldFormat.mjs";
import {getFormationSlotFamily} from "./playerPositioning.mjs";

const normalize = value => String(value || "").trim()
  .replace(/\s+/g, " ").toLowerCase();

function savedPositions(lineup, players, fixture, squadFingerprint, formations) {
  if (!lineup || !Object.hasOwn(formations, lineup.formationId) ||
      lineup.matchDayId !== fixture.matchDayId || !squadFingerprint ||
      lineup.squadFingerprint !== squadFingerprint) return null;
  const byName = new Map(players.map(player =>
    [normalize(player.fullName), player.fullName]));
  const positions = {};
  const used = new Set();
  for (const {id: slot} of formations[lineup.formationId].positions) {
    const key = normalize(lineup.positions?.[slot]);
    if (!byName.has(key) || used.has(key)) return null;
    used.add(key);
    positions[slot] = byName.get(key);
  }
  const benchSnapshot = players.filter(player =>
    !used.has(normalize(player.fullName))).map(player => player.fullName);
  if (!Array.isArray(lineup.benchSnapshot) ||
      JSON.stringify(lineup.benchSnapshot.map(normalize)) !==
      JSON.stringify(benchSnapshot.map(normalize))) return null;
  return {positions, benchSnapshot};
}

export function build({season, fixture, squads, squadFingerprints}) {
  const startingLineups = {};
  const sourceFormations = {};
  const {minimum, maximum, lineupKey, formations, defaultFormationId} = fieldFormat(season.gameFormat);
  for (const clubId of [fixture.clubAId, fixture.clubBId]) {
    const players = squads[clubId] || [];
    if (players.length < minimum || players.length > maximum) {
      throw new Error(`${clubId}: send ${minimum} or ${maximum} eligible players first.`);
    }
    const names = players.map(player => normalize(player.fullName));
    if (names.some(name => !name) || new Set(names).size !== names.length) {
      throw new Error(`${clubId}: correct duplicate or missing squad names.`);
    }
    const entry = season.savedLineups?.[clubId]?.[lineupKey] || {};
    const squadFingerprint = squadFingerprints?.[clubId] || "";
    let selected = null;
    let lineup = null;
    for (const candidate of [entry.variants?.captain, entry.variants?.admin]) {
      selected = savedPositions(candidate, players, fixture, squadFingerprint, formations);
      if (selected) {lineup = candidate; break;}
    }
    if (selected) {
      sourceFormations[clubId] = entry;
    } else {
      // Keep the existing first-five starter / sixth-player bench convention.
      // Mentality does not determine who is a goalkeeper.
      const starters = players.slice(0, minimum);
      const slots = formations[defaultFormationId].positions;
      const goalkeeper = slots.find(slot => getFormationSlotFamily(slot) === "goalkeeper");
      const outfield = slots.filter(slot => slot.id !== goalkeeper.id);
      const outfieldPlayers = starters.slice(0, minimum - 1);
      const assigned = minimum === 11
        ? outfield.map((position, index) => ({position, player: outfieldPlayers[index]}))
        : buildBestOutfieldAssignment(outfieldPlayers, outfield).assignments;
      selected = {
        positions: Object.fromEntries(assigned.map(item =>
          [item.position.id, item.player.fullName])),
        benchSnapshot: players.slice(minimum).map(player => player.fullName),
      };
      selected.positions[goalkeeper.id] = starters[minimum - 1].fullName;
      lineup = {formationId: defaultFormationId, meta: {automatic: true}};
    }
    startingLineups[clubId] = {
      formationId: lineup.formationId,
      ...selected,
      guestPlayers: [],
      matchDayId: fixture.matchDayId,
      squadFingerprint,
      meta: {...lineup.meta},
    };
  }
  return {startingLineups, sourceFormations};
}
