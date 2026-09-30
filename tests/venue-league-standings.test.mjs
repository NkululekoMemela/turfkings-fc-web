import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVenueLeagueStandings,
} from "../src/core/venueLeagueStandings.js";

const clubs = [
  { id: "zee-ladies", name: "Zee Ladies FC" },
  { id: "turf-legends", name: "Turf Legends" },
  { id: "turf-kings", name: "Turf Kings FC" },
];

test("all participating clubs appear before matches", () => {
  const table = buildVenueLeagueStandings({
    clubs,
    results: [],
  });

  assert.equal(table.length, 3);
  assert.ok(
    table.every((club) =>
      club.played === 0 &&
      club.points === 0
    )
  );
});

test("win draw loss and goals are calculated", () => {
  const table = buildVenueLeagueStandings({
    clubs,
    results: [
      {
        clubAId: "zee-ladies",
        clubBId: "turf-legends",
        scoreA: 2,
        scoreB: 1,
        status: "completed",
      },
      {
        clubAId: "turf-kings",
        clubBId: "zee-ladies",
        scoreA: 1,
        scoreB: 1,
        status: "completed",
      },
    ],
  });

  const zee = table.find(
    (club) => club.id === "zee-ladies"
  );
  const legends = table.find(
    (club) => club.id === "turf-legends"
  );
  const kings = table.find(
    (club) => club.id === "turf-kings"
  );

  assert.deepEqual(
    {
      points: zee.points,
      played: zee.played,
      won: zee.won,
      drawn: zee.drawn,
      lost: zee.lost,
      gf: zee.goalsFor,
      ga: zee.goalsAgainst,
      gd: zee.goalDifference,
    },
    {
      points: 4,
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      gf: 3,
      ga: 2,
      gd: 1,
    }
  );

  assert.equal(legends.points, 0);
  assert.equal(kings.points, 1);
});

test("live fixtures do not affect standings", () => {
  const table = buildVenueLeagueStandings({
    clubs,
    results: [
      {
        clubAId: "zee-ladies",
        clubBId: "turf-kings",
        scoreA: 5,
        scoreB: 0,
        status: "live",
      },
    ],
  });

  assert.ok(
    table.every((club) => club.played === 0)
  );
});

test("ties use goal difference then goals scored", () => {
  const table = buildVenueLeagueStandings({
    clubs,
    results: [
      {
        clubAId: "zee-ladies",
        clubBId: "turf-legends",
        scoreA: 2,
        scoreB: 0,
        status: "completed",
      },
      {
        clubAId: "turf-kings",
        clubBId: "zee-ladies",
        scoreA: 3,
        scoreB: 1,
        status: "completed",
      },
      {
        clubAId: "turf-legends",
        clubBId: "turf-kings",
        scoreA: 4,
        scoreB: 2,
        status: "completed",
      },
    ],
  });

  assert.equal(table.length, 3);
  assert.ok(
    table.every((club) => club.points === 3)
  );
  assert.equal(table[0].name, "Turf Kings FC");
});
