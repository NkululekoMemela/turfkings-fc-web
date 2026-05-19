// src/core/teams.js
// Neutral fallback only. Real teams must come from Firebase season state.

export const TEAMS = [
  {
    id: "fallback-team-1",
    label: "Team A",
    captain: "",
    players: [],
  },
  {
    id: "fallback-team-2",
    label: "Team B",
    captain: "",
    players: [],
  },
  {
    id: "fallback-team-3",
    label: "Team C",
    captain: "",
    players: [],
  },
];

export function getTeamById(teams, id) {
  return (teams || []).find((t) => t.id === id);
}
