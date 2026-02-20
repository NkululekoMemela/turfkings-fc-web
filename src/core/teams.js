// src/core/teams.js

// IMPORTANT:
// - team.id stays as your “match team id” (team-enoch, team-mdu, team-nk) because
//   it’s already used in match events (you showed "teamId: team-enoch").
// - team.label is the new display team name (Liverpool, Madrid, Barcelona).
// - team.captain is now a PLAYER ID (Firestore doc id), not a name string.
// - team.players is now an array of PLAYER IDs (Firestore doc ids).

export const TEAMS = [
  {
    id: "team-enoch",
    label: "Liverpool",
    captain: "enoch",
    players: ["enoch", "uhone", "mark", "barlo", "nkumbuzo", "munya"],
  },
  {
    id: "team-mdu",
    label: "Madrid",
    captain: "mdu",
    players: ["mdu", "scott", "chad", "taku", "josh", "humbu"],
  },
  {
    id: "team-nk",
    label: "Barcelona",
    captain: "nkululeko", // ✅ use real player doc id (you showed 'nkululeko' exists)
    players: ["nkululeko", "zizou", "dayaan", "dr_babs", "kolobe", "anathi"],
  },
];

export function getTeamById(teams, id) {
  return teams.find((t) => t.id === id);
}