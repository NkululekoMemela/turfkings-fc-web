const clubs = [
  ["Harbour Rovers", "#2563eb"], ["Summit United", "#dc2626"],
  ["Cedar City", "#16a34a"], ["Dune Athletic", "#d97706"],
  ["Bay Wanderers", "#9333ea"], ["Kloof Stars", "#0891b2"],
];

function loadSimulatedFieldClubs({minimumClubs, gameFormat}) {
  if (!Number.isInteger(minimumClubs) || minimumClubs < 3 || minimumClubs > 6) {
    throw Error("Choose three to six Practice Clubs.");
  }
  if (gameFormat !== "5_V_5") throw Error("Field Practice currently uses five-a-side.");
  return clubs.slice(0, minimumClubs).map(([name, color], index) => {
    const clubId = `sandbox-club-${index + 1}`;
    const players = Array.from({length: 6}, (_, slot) => {
      const number = slot + 1;
      const memberId = `${clubId}-player-${number}`;
      return {memberId, sourcePlayerId: memberId, playerId: memberId, clubId,
        fullName: `${name.split(" ")[0]} Player ${number}`, shortName: `Player ${number}`,
        status:"active", mentality:3, shooting:3, jerseyNumber:number, bibColor:color,
        environment:"practice", simulated:true,
        matchBib:{source:"practice", number, color, available:true, assigned:true, simulated:true}};
    });
    return {clubId, name, homeColor:color, awayColor:"#f8fafc", players,
      captain:players[0].fullName, captainId:players[0].memberId, environment:"practice", simulated:true};
  });
}

module.exports = {loadSimulatedFieldClubs};
