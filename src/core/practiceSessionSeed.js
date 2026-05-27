// src/core/practiceSessionSeed.js

import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

const PRACTICE_PLAYER_NAMES = [
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
    seasons: [
      {
        seasonId: activeSeasonId,
        seasonNo: 1,
        createdAt: now,
        updatedAt: now,
        teams: leagueTeams,
        fiveVFiveTeams: friendlyTeams,
        currentMatchNo: 1,
        currentMatch: {
          teamAId: leagueTeams[0].id,
          teamBId: leagueTeams[1].id,
          standbyId: leagueTeams[2].id,
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

export async function ensurePracticeSessionSeed(
  db,
  sessionScopedClubId,
  sourceClub = {}
) {
  const safeClubId = String(sessionScopedClubId || "").trim();

  if (!safeClubId || !safeClubId.endsWith("-practice")) {
    return { seeded: false, reason: "not-practice" };
  }

  const rootRef = doc(db, "clubs", safeClubId);
  const stateRef = doc(db, "clubs", safeClubId, "state", "main");
  const seededRef = doc(
    db,
    "clubs",
    safeClubId,
    "settings",
    "practiceSeed"
  );

  const seededSnap = await getDoc(seededRef);

  if (seededSnap.exists() && seededSnap.data()?.seedVersion === 1) {
    return { seeded: false, reason: "already-seeded" };
  }

  const players = PRACTICE_PLAYER_NAMES.map(buildPracticePlayer);

  const weekId = new Date().toISOString().slice(0, 10);

  const batch = writeBatch(db);

  batch.set(
    rootRef,
    {
      id: safeClubId,
      name: `${sourceClub?.name || "Club"} Practice`,
      baseClubId: sourceClub?.id || "",
      isPracticeClub: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(stateRef, buildPracticeState(), { merge: true });

  players.forEach((player, index) => {
    const playerRef = doc(
      db,
      "clubs",
      safeClubId,
      "players",
      player.id
    );

    const memberRef = doc(
      db,
      "clubs",
      safeClubId,
      "members",
      player.id
    );

    const signupRef = doc(
      db,
      "clubs",
      safeClubId,
      "matchSignups",
      `practice-${player.id}`
    );

    batch.set(
      playerRef,
      {
        ...player,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      memberRef,
      {
        id: player.id,
        playerId: player.id,
        fullName: player.fullName,
        displayName: player.fullName,
        role: "player",
        status: "active",
        isPracticeMember: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      signupRef,
      {
        id: `practice-${player.id}`,
        playerId: player.id,
        beneficiaryPlayerId: player.id,
        playerName: player.fullName,
        fullName: player.fullName,
        displayName: player.fullName,
        paid: true,
        paymentStatus: "paid",
        status: "paid",
        amountPaid: 0,
        source: "practice-seed",
        isPracticeSignup: true,
        paidWeeks: [weekId],
        primaryPaidWeeks: [weekId],
        selectedWeeks: [weekId],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        sortIndex: index,
      },
      { merge: true }
    );
  });

  batch.set(
    seededRef,
    {
      seedVersion: 1,
      playerCount: players.length,
      weekId,
      seededAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return {
    seeded: true,
    playerCount: players.length,
    weekId,
  };
}
