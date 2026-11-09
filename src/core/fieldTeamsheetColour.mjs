import {kitColourKey} from "../../functions/opponentKitColours.mjs";

const clean = value => typeof value === "string" ? value.trim() : "";
const label = value => {
  const text = clean(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

export function fieldTeamsheetColour(team) {
  const assigned = clean(team?.matchColour);
  if (assigned) return label(assigned);
  // Live and legacy roster data may carry only the individual match bib colours.
  const roster = team?.kitPlayers || team?.players;
  const colours = (Array.isArray(roster) ? roster : []).map(
    player => clean(player?.matchBib?.color) || clean(player?.bibColor),
  );
  if (!colours.length || colours.some(colour => !colour)) return "";
  const family = kitColourKey(colours[0]);
  return colours.every(colour => kitColourKey(colour) === family) ? label(family) : "";
}
