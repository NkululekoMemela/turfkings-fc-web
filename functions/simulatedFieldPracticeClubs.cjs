const clubs = [
  ["Harbour Rovers", "#2563eb"], ["Summit United", "#dc2626"],
  ["Cedar City", "#16a34a"], ["Dune Athletic", "#d97706"],
  ["Bay Wanderers", "#9333ea"], ["Kloof Stars", "#0891b2"],
];

async function loadSimulatedFieldClubs({minimumClubs, gameFormat}) {
  if (!Number.isInteger(minimumClubs) || minimumClubs < 3 || minimumClubs > 6) {
    throw Error("Choose three to six Practice Clubs.");
  }
  const {fieldFormat} = await import("./fieldBoothShared/fieldFormat.mjs");
  const {maximum} = fieldFormat(gameFormat);
  return clubs.slice(0, minimumClubs).map(([, color], index) => {
    const name = `Test Club ${index + 1}`;
    const clubId = `sandbox-club-${index + 1}`;
    const crest = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M9 8h62v34Q70 65 40 76 10 65 9 42Z" fill="${color}" stroke="#e9f5ff" stroke-width="4"/><text x="40" y="31" text-anchor="middle" fill="white" font-family="sans-serif" font-size="12" font-weight="700">TEST</text><text x="40" y="58" text-anchor="middle" fill="white" font-family="sans-serif" font-size="25" font-weight="800">${index + 1}</text></svg>`;
    const logoUrl = "data:image/svg+xml;base64," + Buffer.from(crest).toString("base64");
    const players = Array.from({length: maximum}, (_, slot) => {
      const number = slot + 1;
      const memberId = `${clubId}-player-${number}`;
      return {memberId, sourcePlayerId: memberId, playerId: memberId, clubId,
        fullName: `${name} Player ${number}`, shortName: `Player ${number}`,
        status:"active", mentality:3, shooting:3, jerseyNumber:number, bibColor:color,
        environment:"practice", simulated:true,
        matchBib:{source:"practice", number, color, available:true, assigned:true, simulated:true}};
    });
    return {clubId, name, logoUrl, homeColor:color, awayColor:"#f8fafc", players,
      captain:players[0].fullName, captainId:players[0].memberId, environment:"practice", simulated:true};
  });
}

module.exports = {loadSimulatedFieldClubs};
