import {buildBestOutfieldAssignment} from "./playerPositioning.mjs";

const formationIds = new Set(["2-0-2", "1-2-1", "2-1-1", "1-1-2"]);
const normalize = value => String(value || "").trim()
  .replace(/\s+/g, " ").toLowerCase();
const defaultPositions = [
  {id: "p1", label: "LW"}, {id: "p2", label: "RW"},
  {id: "p3", label: "LB"}, {id: "p4", label: "RB"},
];

function savedPositions(lineup, players, fixture, squadFingerprint) {
  if (!lineup || !formationIds.has(lineup.formationId) ||
      lineup.matchDayId !== fixture.matchDayId || !squadFingerprint ||
      lineup.squadFingerprint !== squadFingerprint) return null;
  const byName = new Map(players.map(player =>
    [normalize(player.fullName), player.fullName]));
  const positions = {};
  const used = new Set();
  for (const slot of ["p1", "p2", "p3", "p4", "p5"]) {
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
  if (season.gameFormat !== "5_V_5") {
    return {startingLineups, sourceFormations};
  }
  for (const clubId of [fixture.clubAId, fixture.clubBId]) {
    const players = squads[clubId] || [];
    if (players.length < 5 || players.length > 6) {
      throw new Error(`${clubId}: send five or six eligible players first.`);
    }
    const names = players.map(player => normalize(player.fullName));
    if (names.some(name => !name) || new Set(names).size !== names.length) {
      throw new Error(`${clubId}: correct duplicate or missing squad names.`);
    }
    const entry = season.savedLineups?.[clubId]?.["5"] || {};
    const squadFingerprint = squadFingerprints?.[clubId] || "";
    let selected = null;
    let lineup = null;
    for (const candidate of [entry.variants?.captain, entry.variants?.admin]) {
      selected = savedPositions(candidate, players, fixture, squadFingerprint);
      if (selected) {lineup = candidate; break;}
    }
    if (selected) {
      sourceFormations[clubId] = entry;
    } else {
      // Keep the existing first-five starter / sixth-player bench convention.
      // Mentality does not determine who is a goalkeeper.
      const starters = players.slice(0, 5);
      const assignment = buildBestOutfieldAssignment(starters.slice(0, 4), defaultPositions);
      selected = {
        positions: Object.fromEntries(assignment.assignments.map(item =>
          [item.position.id, item.player.fullName])),
        benchSnapshot: players.slice(5).map(player => player.fullName),
      };
      selected.positions.p5 = starters[4].fullName;
      lineup = {formationId: "2-0-2", meta: {automatic: true}};
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
