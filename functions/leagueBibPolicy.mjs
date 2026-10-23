export function bibNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!["string", "number"].includes(typeof value) || !/^\d{1,3}$/.test(String(value))) return null;
  return Number(value);
}
export function leagueBibIssues(players, numbers = {}) {
  const issues = [], seen = new Map();
  for (const player of players) {
    const name = player.fullName || player.name || "Player";
    const registered = bibNumber(player.jerseyNumber);
    const chosen = Object.hasOwn(numbers, player.sourcePlayerId) ? bibNumber(numbers[player.sourcePlayerId]) : registered;
    if (player.ownsNumberedBib !== true) issues.push(`${name}: own a numbered bib and record it in Profile.`);
    if (!String(player.bibColor || "").trim()) issues.push(`${name}: record the colour of your numbered bib in Profile.`);
    if (registered === null || chosen === null) issues.push(`${name}: a visible bib number is required for official league play.`);
    else {
      if (chosen !== registered) issues.push(`${name}: the teamsheet number must match the owned bib number in Profile.`);
      if (seen.has(chosen)) issues.push(`#${chosen}: ${seen.get(chosen)} and ${name} cannot share a bib number in the same squad.`);
      seen.set(chosen, name);
    }
  }
  return issues;
}
export function assertLeagueBibs(players, numbers = {}) {
  const issues = leagueBibIssues(players, numbers);
  if (issues.length) throw new Error(`Official league kit is incomplete. ${issues.join(" ")}`);
}
export function leagueSubmissionDeadline(scheduledLocal) {
  const kickoff = Date.parse(`${scheduledLocal}+02:00`);
  if (!Number.isFinite(kickoff)) throw new Error("The fixture needs a valid kickoff time.");
  return kickoff - 86400000;
}
