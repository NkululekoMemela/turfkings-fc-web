// src/core/practiceSessionSeed.js

export const PRACTICE_PLAYER_NAMES = [
  "Sipho Dlamini",
  "Thabo Mokoena",
  "Lerato Khumalo",
  "Mandla Nkosi",
  "Sibusiso Ndlovu",
  "Ayanda Mthembu",
  "Kagiso Molefe",
  "Nkululeko Zulu",
  "Teboho Maseko",
  "Bongani Sithole",
  "Aiden Brooks",
  "Caleb Morgan",
  "Liam Carter",
  "Noah Ellis",
  "Gabriel Hayes",
  "Mateo Silva",
  "Diego Santos",
  "Luca Romano",
  "Ahmed Khan",
  "Youssef Hassan",
  "Kenji Tanaka",
  "Hiroshi Sato",
  "Kwame Mensah",
  "Samuel Okafor",
];

function slugFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstNameOf(name) {
  return String(name || "").trim().split(/\s+/)[0] || name;
}

function buildPracticePlayer(name, index) {
  const id = slugFromName(name) || `practice-player-${index + 1}`;
  const firstName = firstNameOf(name);

  return {
    id,
    fullName: name,
    name: firstName,
    shortName: firstName,
    displayName: name,
    aliases: [name, firstName],
    status: "active",
    isPracticePlayer: true,
    roles: {
      player: true,
      captain: false,
      admin: false,
      coach: false,
    },
  };
}


export function buildPracticePlayers() {
  return PRACTICE_PLAYER_NAMES.map(buildPracticePlayer);
}

export function buildPracticeState() {
  const now = new Date().toISOString();

  const leagueTeams = [
    {
      id: "newcastle-club",
      label: "Newcastle Club",
      abbrev: "NEW",
      captain: "",
      captainId: null,
      players: [],
    },
    {
      id: "barca-stars",
      label: "Barca Stars",
      abbrev: "BAR",
      captain: "",
      captainId: null,
      players: [],
    },
    {
      id: "madrid-boys",
      label: "Madrid Boys",
      abbrev: "MAD",
      captain: "",
      captainId: null,
      players: [],
    },
  ];

  const friendlyTeams = [
    {
      id: "newcastle-club",
      label: "Newcastle Club",
      abbrev: "NEW",
      captain: "",
      captainId: null,
      players: [],
    },
    {
      id: "barca-stars",
      label: "Barca Stars",
      abbrev: "BAR",
      captain: "",
      captainId: null,
      players: [],
    },
  ];

  const activeSeasonId = "practice-S1";

  return {
    activeSeasonId,
    isPracticeState: true,
    sessionMode: "practice",
    matchType: "FRIENDLY",
    gameFormat: "5_V_5",
    seasons: [
      {
        seasonId: activeSeasonId,
        seasonNo: 1,
        isPracticeSeason: true,
        sessionMode: "practice",
        matchType: "FRIENDLY",
        gameFormat: "5_V_5",
        createdAt: now,
        updatedAt: now,
        teams: leagueTeams,
        fiveVFiveTeams: friendlyTeams,
        currentMatchNo: 1,
        currentMatch: {
          teamAId: friendlyTeams[0].id,
          teamBId: friendlyTeams[1].id,
          standbyId: null,
        },
        currentEvents: [],
        allEvents: [],
        results: [],
        matchDayHistory: [],
      },
    ],
    playerPhotosByName: {},
    yearEndAttendance: [],
    updatedAt: now,
  };
}
