import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  PLAYER_AVAILABILITY,
  buildNextAppearanceParticipationRotation,
  buildNextAppearanceGoalkeeperConstraint,
} from "../src/core/playerRotation.js";

import {
  createVerifiedLineupSnapshot,
} from "../src/core/lineups.js";

const formation = {
  id: "test-formation",
  label: "Test",
  positions: [
    { id: "gk", label: "GK" },
    { id: "left", label: "DEF" },
    { id: "centre", label: "MID" },
    { id: "right", label: "FWD" },
  ],
};

const registeredPlayers = [
  "Alex",
  "Bob",
  "Cara",
  "Dan",
  "Erin",
];

const previousLineup = {
  formationId: formation.id,
  positions: {
    gk: "Alex",
    left: "Bob",
    centre: "Cara",
    right: "Dan",
  },
  benchSnapshot: ["Erin"],
};

function buildParticipation({
  previous = previousLineup,
  playerStates = [],
} = {}) {
  return buildNextAppearanceParticipationRotation({
    previousLineup: previous,
    registeredPlayers,
    playerStates,
    appearanceHistory: [
      {
        matchNo: 1,
        snapshot: previous,
      },
    ],
    goalkeeperPositionId: "gk",
  });
}

test("normal incoming substitute starts goalkeeper", () => {
  const participation = buildParticipation();

  assert.equal(participation.rotationRequired, true);
  assert.equal(participation.incomingStarter, "Erin");
  assert.equal(participation.outgoingStarter, "Alex");

  const goalkeeper =
    buildNextAppearanceGoalkeeperConstraint({
      participationRotation: participation,
      formation,
      appearanceHistory: [
        {
          matchNo: 1,
          snapshot: previousLineup,
        },
      ],
    });

  assert.equal(goalkeeper.resolved, true);
  assert.equal(goalkeeper.goalkeeperPlayer, "Erin");
  assert.equal(
    goalkeeper.reason,
    "incoming_rotation_player_starts_as_goalkeeper"
  );
});

test("restricted incoming player still starts outfield", () => {
  const participation = buildParticipation();

  const goalkeeper =
    buildNextAppearanceGoalkeeperConstraint({
      participationRotation: participation,
      formation,
      appearanceHistory: [
        {
          matchNo: 1,
          snapshot: previousLineup,
        },
      ],
      goalkeeperRestrictedPlayerKeys: ["Erin"],
    });

  assert.equal(goalkeeper.resolved, true);
  assert.notEqual(goalkeeper.goalkeeperPlayer, "Erin");
  assert.equal(
    goalkeeper.incomingGoalkeeperRestricted,
    true
  );
  assert.equal(
    goalkeeper.reason,
    "restricted_incoming_player_starts_outfield"
  );
  assert.ok(goalkeeper.outfieldPlayers.includes("Erin"));
});

test("multiple restricted players are never assigned goalkeeper", () => {
  const participation = buildParticipation();

  const goalkeeper =
    buildNextAppearanceGoalkeeperConstraint({
      participationRotation: participation,
      formation,
      appearanceHistory: [
        {
          matchNo: 1,
          snapshot: previousLineup,
        },
      ],
      goalkeeperRestrictedPlayerKeys: [
        "Erin",
        "Bob",
        "Cara",
      ],
    });

  assert.equal(goalkeeper.resolved, true);
  assert.equal(goalkeeper.goalkeeperPlayer, "Dan");
});

test("manual decision is requested when every starter is restricted", () => {
  const participation = buildParticipation();

  const goalkeeper =
    buildNextAppearanceGoalkeeperConstraint({
      participationRotation: participation,
      formation,
      goalkeeperRestrictedPlayerKeys: [
        "Bob",
        "Cara",
        "Dan",
        "Erin",
      ],
    });

  assert.equal(goalkeeper.resolved, false);
  assert.equal(
    goalkeeper.reason,
    "no_goalkeeper_eligible_starter"
  );
  assert.equal(
    goalkeeper.requiresManualGoalkeeperDecision,
    true
  );
});

test("late previous substitute receives no false starting priority", () => {
  const participation = buildParticipation({
    playerStates: [
      {
        name: "Erin",
        availability: PLAYER_AVAILABILITY.LATE,
      },
    ],
  });

  assert.equal(participation.rotationRequired, false);
  assert.equal(
    participation.reason,
    "no_eligible_previous_substitute"
  );
  assert.equal(participation.incomingStarter, null);
});

test("confirmed manual lineup becomes the next rotation source", () => {
  const refereeConfirmedLineup = {
    formationId: formation.id,
    positions: {
      gk: "Cara",
      left: "Alex",
      centre: "Dan",
      right: "Erin",
    },
    benchSnapshot: ["Bob"],
  };

  const participation = buildParticipation({
    previous: refereeConfirmedLineup,
  });

  assert.equal(participation.rotationRequired, true);
  assert.equal(participation.incomingStarter, "Bob");
  assert.equal(participation.outgoingStarter, "Cara");
});

test("verified snapshot preserves Hand injury restrictions", () => {
  const snapshot = createVerifiedLineupSnapshot({
    teamId: "team-a",
    lineup: {
      ...previousLineup,
      goalkeeperRestrictedPlayerKeys: ["Erin"],
    },
    formationMap: {
      [formation.id]: formation,
    },
    registeredPlayers,
  });

  assert.deepEqual(
    snapshot.goalkeeperRestrictedPlayerKeys,
    ["Erin"]
  );
});

test("live page resets late status and wires all three controls", () => {
  const page = fs.readFileSync(
    "src/pages/ThreeTeamLeague_LiveMatchPage.jsx",
    "utf8"
  );

  const formations = fs.readFileSync(
    "src/pages/FormationsPage.jsx",
    "utf8"
  );

  assert.match(
    page,
    /Late is match-specific/
  );

  assert.match(
    page,
    /aria-label="Hand injury goalkeeper restrictions"/
  );

  assert.doesNotMatch(
    page,
    /aria-label="Open Hand injury list"/
  );

  assert.match(
    page,
    /Set tonight’s rotation foundation/
  );

  assert.match(
    page,
    /teamARestrictedPlayerKeys/
  );

  assert.match(
    page,
    /teamBRestrictedPlayerKeys/
  );

  assert.match(
    formations,
    /\{canManageHandInjury && \(/
  );

  assert.match(
    formations,
    /saveRole === LINEUP_SAVE_ROLE_GENERAL/
  );
});
