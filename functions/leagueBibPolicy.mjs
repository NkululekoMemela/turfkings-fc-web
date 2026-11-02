export function bibNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!["string", "number"].includes(typeof value) || !/^\d{1,3}$/.test(String(value))) return null;
  return Number(value);
}
export function leagueBibIssues(players, numbers = {}) {
  const issues = [], seen = new Map();
  for (const player of players) {
    const name = player.fullName || player.name || "Player";
    const assigned = ["club","hired"].includes(player.matchBib?.source) && (player.matchBib.available === true || (player.matchBib.assigned===true && player.matchBib.allocationSource==="field")) &&
      bibNumber(player.matchBib.number) === bibNumber(player.jerseyNumber) &&
      String(player.matchBib.color || "").trim() === String(player.bibColor || "").trim();
    const registered = bibNumber(player.jerseyNumber);
    const chosen = Object.hasOwn(numbers, player.sourcePlayerId) ? bibNumber(numbers[player.sourcePlayerId]) : registered;
    if (player.ownsNumberedBib !== true && !assigned) issues.push(`${name}: assign an available numbered club or hired bib, or record an owned bib in Profile.`);
    if (!String(player.bibColor || "").trim()) issues.push(`${name}: confirm the bib colour.`);
    if (registered === null || chosen === null) issues.push(`${name}: a visible bib number is required for official league play.`);
    else {
      if (chosen !== registered) issues.push(`${name}: the teamsheet number must match the owned bib number in Profile.`);
      if (seen.has(chosen)) issues.push(`(${chosen}): ${seen.get(chosen)} and ${name} cannot share a bib number in the same squad.`);
      seen.set(chosen, name);
    }
  }
  return issues;
}
export function assertLeagueBibs(players, numbers = {}) {
  const issues = leagueBibIssues(players, numbers);
  if (issues.length) throw new Error(`Official league kit is incomplete. ${issues.join(" ")}`);
}
