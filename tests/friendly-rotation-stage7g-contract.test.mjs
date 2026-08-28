import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  chooseNextFriendlyGoalkeeper,
  buildFriendlyGoalkeeperOnlyRotation,
} from "../src/core/playerRotation.js";

const friendlySource = fs.readFileSync(
  "src/pages/Friendly_LiveMatchPage.jsx",
  "utf8"
);

const appSource = fs.readFileSync(
  "src/App.jsx",
  "utf8"
);

function makeFormation(count) {
  return {
    id: `test-${count}`,
    positions: [
      ...Array.from(
        { length: count - 1 },
        (_, index) => ({
          id: `p${index + 1}`,
          label: index === 0 ? "ST" : `OUT${index}`,
        })
      ),
      {
        id: `p${count}`,
        label: "GK",
      },
    ],
  };
}

function makeLineup(teamId, count) {
  const positions = {};

  for (let i = 1; i <= count; i += 1) {
    positions[`p${i}`] =
      i === count
        ? `${teamId} Keeper`
        : `${teamId} Player ${i}`;
  }

  return {
    teamId,
    formationId: `test-${count}`,
    positions,
    benchSnapshot: [],
  };
}

test(
  "Friendly rotation setup auto-prompt requires a real bench",
  () => {
    assert.match(
      friendlySource,
      /!hasRotationBench\s*\|\|/
    );

    assert.match(
      friendlySource,
      /setShowRotationModal\(true\)/
    );
  }
);

test(
  "Friendly rotation triggers are not disabled merely because there is no bench",
  () => {
    const timeGuard =
      friendlySource.match(
        /normalizedActiveRotationMode !== "time"[\s\S]{0,180}?return;/
      )?.[0] || "";

    const goalGuard =
      friendlySource.match(
        /normalizedActiveRotationMode !== "goals"[\s\S]{0,180}?return;/
      )?.[0] || "";

    assert.ok(timeGuard);
    assert.ok(goalGuard);

    assert.doesNotMatch(
      timeGuard,
      /hasRotationBench/
    );

    assert.doesNotMatch(
      goalGuard,
      /hasRotationBench/
    );
  }
);

test(
  "Friendly keeps the existing substitute rotation engine",
  () => {
    assert.match(
      friendlySource,
      /buildFriendlyInMatchRotation/
    );

    assert.match(
      friendlySource,
      /benchPlayers\.length > 0/
    );
  }
);

test(
  "Friendly no-bench rotation uses goalkeeper fairness engine",
  () => {
    assert.match(
      friendlySource,
      /chooseNextFriendlyGoalkeeper/
    );

    assert.match(
      friendlySource,
      /buildFriendlyGoalkeeperOnlyRotation/
    );

    assert.match(
      friendlySource,
      /applyFriendlyNoBenchGoalkeeperRotations/
    );
  }
);

test(
  "Friendly persists automatic GK changes as authoritative lineup truth",
  () => {
    assert.match(
      friendlySource,
      /persistDisciplineLineups\(\s*currentSnapshots\s*\)/
    );
  }
);

test(
  "App tells Friendly whether rotation setup has already been reviewed",
  () => {
    assert.match(
      appSource,
      /rotationReminderConfigured=\{Boolean\([\s\S]*?rotationReminderUpdatedAtISO[\s\S]*?\)\}/
    );
  }
);

for (const playerCount of [5, 6, 7]) {
  test(
    `${playerCount}v${playerCount} no-bench Friendly chooses and applies a new goalkeeper`,
    () => {
      const formation =
        makeFormation(playerCount);

      const lineup =
        makeLineup("A", playerCount);

      const choice =
        chooseNextFriendlyGoalkeeper({
          teamId: "A",
          currentLineup: lineup,
          formation,
          lineupTimeline: [
            {
              timeSeconds: 0,
              snapshots: {
                A: lineup,
              },
            },
          ],
        });

      assert.equal(
        choice.resolved,
        true
      );

      assert.notEqual(
        choice.nextGoalkeeper,
        `A Keeper`
      );

      const rotation =
        buildFriendlyGoalkeeperOnlyRotation({
          currentLineup: lineup,
          formation,
          nextGoalkeeper:
            choice.nextGoalkeeper,
        });

      assert.equal(
        rotation.resolved,
        true
      );

      assert.equal(
        rotation.positions[`p${playerCount}`],
        choice.nextGoalkeeper
      );

      assert.equal(
        rotation.benchPlayers.length,
        0
      );
    }
  );
}

test(
  "GK fairness gives every never-GK player priority before recycling a previous keeper",
  () => {
    const formation =
      makeFormation(5);

    const initial =
      makeLineup("A", 5);

    const firstChoice =
      chooseNextFriendlyGoalkeeper({
        teamId: "A",
        currentLineup: initial,
        formation,
        lineupTimeline: [
          {
            timeSeconds: 0,
            snapshots: {
              A: initial,
            },
          },
        ],
      });

    const firstRotation =
      buildFriendlyGoalkeeperOnlyRotation({
        currentLineup: initial,
        formation,
        nextGoalkeeper:
          firstChoice.nextGoalkeeper,
      });

    const afterFirst = {
      ...initial,
      positions:
        firstRotation.positions,
    };

    const secondChoice =
      chooseNextFriendlyGoalkeeper({
        teamId: "A",
        currentLineup: afterFirst,
        formation,
        lineupTimeline: [
          {
            timeSeconds: 0,
            snapshots: {
              A: initial,
            },
          },
          {
            timeSeconds: 300,
            snapshots: {
              A: afterFirst,
            },
          },
        ],
      });

    assert.equal(
      secondChoice.resolved,
      true
    );

    assert.notEqual(
      secondChoice.nextGoalkeeper,
      firstChoice.nextGoalkeeper
    );

    assert.notEqual(
      secondChoice.nextGoalkeeper,
      "A Keeper"
    );
  }
);

console.log("");
console.log("==========================================");
console.log("STAGE 7G FRIENDLY ROTATION CONTRACT");
console.log("==========================================");
