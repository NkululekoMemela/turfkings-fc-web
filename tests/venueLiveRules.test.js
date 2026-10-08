import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc, Timestamp, writeBatch } from "firebase/firestore";

const venueId = "wynberg-mm-rule-test";
const seasonId = "season-rule-test";
const fixtureId = "fixture-rule-test";
const venuePath = ["leagueVenues", venueId];
const matchPath = [...venuePath, "seasons", seasonId, "matches", "current"];
const staffPath = [...venuePath, "staff", "referee"];

const approvalId = "approved-start";
const matchDayId = "day-one";
const revision = Timestamp.fromMillis(1000);
const startingLineups = Object.fromEntries(["club-a", "club-b"].map(clubId => [
  clubId, {
    formationId: "1-2-1",
    positions: Object.fromEntries(
      [1, 2, 3, 4, 5].map(i => [`p${i}`, `${clubId} Player ${i}`])
    ),
    benchSnapshot: [`${clubId} Player 6`],
    matchDayId,
    squadFingerprint: `${clubId}-fingerprint`,
    meta: {savedByRole: "captain"},
  },
]));
const sourceFormations = Object.fromEntries(
  Object.entries(startingLineups).map(([clubId, lineup]) => [
    clubId, {variants: {captain: lineup}},
  ])
);
const paidSquads = Object.fromEntries(["club-a", "club-b"].map(clubId => [
  clubId, [1, 2, 3, 4, 5, 6].map(i => ({
    playerId: `${clubId}-p${i}`,
    fullName: `${clubId} Player ${i}`,
    mentality: 3,
    shooting: 3,
  })),
]));
const matchDays = [{
  id: matchDayId,
  status: "scheduled",
  opensAtMs: 1000,
  fixtureIds: [fixtureId],
}];

const fixture = {
  id: fixtureId,
  matchDayId,
  clubAId: "club-a",
  clubBId: "club-b",
  status: "scheduled",
};
const live = {
  fixtureId,
  clubAId: "club-a",
  clubBId: "club-b",
  standbyId: "club-c",
  status: "live",
  startedByUid: "referee",
};
const season = {
  id: seasonId,
  gameFormat: "5_V_5",
  scheduleVersion: 1,
  matchDays,
  matchDayHistory: [],
  savedLineups: Object.fromEntries(
    Object.entries(sourceFormations).map(([clubId, entry]) => [
      clubId, {"5": entry},
    ])
  ),
  status: "active",
  clubIds: ["club-a", "club-b", "club-c"],
  streaks: { "club-a": 0, "club-b": 0, "club-c": 0 },
  currentMatch: {
    teamAId: "club-a",
    teamBId: "club-b",
    standbyId: "club-c",
  },
  fixtures: [fixture],
  liveMatches: { [fixtureId]: live },
  results: [],
  allEvents: [],
  currentMatchNo: 1,
};

let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-venue-live",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, ...venuePath), {
      id: venueId,
      ownerUid: "owner",
      adminUids: ["owner"],
      league: { activeSeason: season },
    });
    for (const clubId of ["club-a", "club-b"]) {
      await setDoc(doc(db, "leagueSeasonSquads",
        `${venueId}~${seasonId}~${clubId}`), {
        status: "active", updatedAt: revision,
      });
    }
    await setDoc(doc(db, ...venuePath, "seasons", seasonId,
      "startApprovals", approvalId), {
      actorUid: "referee",
      venueId, seasonId, fixtureId, matchDayId,
      clubAId: "club-a", clubBId: "club-b",
      gameFormat: "5_V_5",
      squads: paidSquads,
      startingLineups,
      sourceFormations,
      squadVersions: {"club-a": revision, "club-b": revision},
      bookingVersions: {},
      matchDays,
      matchDayHistory: [],
      expiresAt: Timestamp.fromMillis(Date.now() + 600000),
      used: false,
    });
    await setDoc(doc(db, ...staffPath), {
      uid: "referee",
      role: "referee",
      status: "active",
      isAdministrator: false,
    });
  });
});

test.after(async () => {
  await env?.cleanup();
});

test("referee writes, spectator reads, outsider is denied", async () => {
  const refereeDb = env.authenticatedContext("referee").firestore();
  const outsiderDb = env.authenticatedContext("outsider").firestore();
  const spectatorDb = env.unauthenticatedContext().firestore();
  const match = {
    venueId,
    seasonId,
    fixtureId,
    status: "live",
    currentEvents: [],
    events: [],
    fixtureIndex: 0,
    matchDayIndex: 0,
    startedByUid: "referee",
    startApprovalId: approvalId,
    paidSquads,
    confirmedLineupSnapshot: startingLineups,
  };

  const start = (db, value) => {
    const batch = writeBatch(db);
    batch.set(doc(db, ...matchPath), value);
    batch.update(doc(db, ...venuePath, "seasons", seasonId,
      "startApprovals", approvalId), {used: true});
    return batch.commit();
  };

  await assertFails(start(outsiderDb, match));
  await assertFails(setDoc(doc(refereeDb, ...matchPath), match));
  const changed = structuredClone(match);
  changed.confirmedLineupSnapshot["club-a"].positions.p2 =
    "club-a Player 6";
  await assertFails(start(refereeDb, changed));
  await assertSucceeds(start(refereeDb, match));
  await assertSucceeds(getDoc(doc(spectatorDb, ...matchPath)));
  await assertFails(updateDoc(doc(outsiderDb, ...matchPath), {
    events: [{ type: "goal" }],
  }));
  await assertSucceeds(updateDoc(doc(refereeDb, ...matchPath), {
    events: [{ type: "goal" }],
  }));

  const result = {
    id: fixtureId,
    fixtureId,
    matchNo: 1,
    teamAId: "club-a",
    teamBId: "club-b",
    standbyId: "club-c",
    goalsA: 1,
    goalsB: 0,
    completedByUid: "referee",
  };
  const completedSeason = {
    ...season,
    fixtures: [{
      ...fixture,
      status: "completed",
      goalsA: 1,
      goalsB: 0,
      completedByUid: "referee",
    }],
    liveMatches: { [fixtureId]: {
      ...live,
      status: "completed",
      scoreA: 1,
      scoreB: 0,
      completedByUid: "referee",
    } },
    results: [result],
    allEvents: [{ type: "goal" }],
    currentMatchNo: 2,
    currentMatch: {
      teamAId: "club-a",
      teamBId: "club-c",
      standbyId: "club-b",
    },
    streaks: { "club-a": 1, "club-b": 0, "club-c": 0 },
    updatedAtMs: Date.now(),
  };

  await assertFails(updateDoc(doc(outsiderDb, ...venuePath), {
    "league.activeSeason": completedSeason,
  }));
  await assertSucceeds(updateDoc(doc(refereeDb, ...venuePath), {
    "league.activeSeason": completedSeason,
  }));
  const snapshot = await getDoc(doc(spectatorDb, ...venuePath));
  assert.equal(snapshot.data().league.activeSeason.results.length, 1);
  assert.equal(
    snapshot.data().league.activeSeason.currentMatch.standbyId,
    "club-b"
  );

  await assertFails(deleteDoc(doc(outsiderDb, ...matchPath)));
  const ownerDb = env.authenticatedContext("owner").firestore();
  await assertSucceeds(deleteDoc(doc(ownerDb, ...matchPath)));
  assert.equal(
    (await getDoc(doc(spectatorDb, ...matchPath))).exists(),
    false
  );
});

test("Field Action Log is staff-readable and immutable", async () => {
  const ownerDb = env.authenticatedContext("owner").firestore();
  const refereeDb = env.authenticatedContext("referee").firestore();
  const outsiderDb = env.authenticatedContext("outsider").firestore();
  const path = [...venuePath, "actionLog", "test-entry"];
  const entry = {
    venueId,
    seasonId,
    fixtureId,
    action: "match_started",
    label: "Match started",
    details: "Test fixture; referee UID: referee",
    actorUid: "referee",
    actorEmail: "",
    actorName: "Test Referee",
    at: serverTimestamp(),
  };

  await assertFails(getDoc(doc(outsiderDb, ...path)));
  await assertSucceeds(setDoc(doc(refereeDb, ...path), entry));
  await assertSucceeds(getDoc(doc(ownerDb, ...path)));
  await assertSucceeds(getDoc(doc(refereeDb, ...path)));
  await assertFails(updateDoc(doc(refereeDb, ...path), { details: "Changed" }));
  await assertFails(deleteDoc(doc(ownerDb, ...path)));
});

test("empty Field season rollback restores only its archived predecessor", async () => {
  const rollbackId = "rollback-rule-test";
  const previousId = "previous-rule-test";
  const newId = "new-rule-test";
  const venueRefPath = ["leagueVenues", rollbackId];
  const archivePath = [...venueRefPath, "seasons", previousId];
  const ownerDb = env.authenticatedContext("owner").firestore();
  const outsiderDb = env.authenticatedContext("outsider").firestore();

  const previous = {
    id: previousId,
    status: "completed",
    endedByUid: "owner",
    results: [{ fixtureId: "saved-match" }],
  };
  const current = {
    id: newId,
    status: "active",
    previousSeasonId: previousId,
    clubIds: [],
    fixtures: [],
    results: [{ fixtureId: "unsaved-match" }],
    allEvents: [],
    matchDayHistory: [],
    liveMatches: {},
    invitations: {},
  };

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, ...venueRefPath), {
      id: rollbackId,
      ownerUid: "owner",
      adminUids: ["owner"],
      league: { activeSeason: current },
    });
    await setDoc(doc(db, ...archivePath), previous);
  });

  async function rollback(db) {
    const venueRef = doc(db, ...venueRefPath);
    const archiveRef = doc(db, ...archivePath);
    return runTransaction(db, async (tx) => {
      tx.update(venueRef, {
        "league.activeSeason": {
          ...previous,
          status: "active",
        },
      });
      tx.delete(archiveRef);
    });
  }

  await assertFails(deleteDoc(doc(ownerDb, ...archivePath)));
  await assertFails(rollback(ownerDb));
  await assertFails(rollback(outsiderDb));

  await assertSucceeds(updateDoc(doc(ownerDb, ...venueRefPath), {
    "league.activeSeason.results": [],
  }));
  await assertSucceeds(rollback(ownerDb));

  assert.equal(
    (await getDoc(doc(ownerDb, ...venueRefPath)))
      .data().league.activeSeason.id,
    previousId
  );
  assert.equal(
    (await getDoc(doc(ownerDb, ...archivePath))).exists(),
    false
  );
});

test("approved kickoff works without saved formations and rejects an altered lineup", async () => {
  const fallbackApproval = "automatic-start";
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, ...venuePath), {
      id: venueId, ownerUid: "owner", adminUids: ["owner"],
      league: {activeSeason: {...season, savedLineups: {}}},
    });
    await setDoc(doc(db, ...venuePath, "seasons", seasonId,
      "startApprovals", fallbackApproval), {
      actorUid: "referee", venueId, seasonId, fixtureId, matchDayId,
      clubAId: "club-a", clubBId: "club-b", gameFormat: "5_V_5",
      squads: paidSquads, startingLineups, sourceFormations: {},
      squadVersions: {"club-a": revision, "club-b": revision},
      bookingVersions: {}, matchDays, matchDayHistory: [],
      expiresAt: Timestamp.fromMillis(Date.now() + 600000), used: false,
    });
  });
  const db = env.authenticatedContext("referee").firestore();
  const match = {
    venueId, seasonId, fixtureId, status: "live",
    currentEvents: [], events: [], fixtureIndex: 0, matchDayIndex: 0,
    startedByUid: "referee", startApprovalId: fallbackApproval,
    paidSquads, confirmedLineupSnapshot: startingLineups,
  };
  const start = value => {
    const batch = writeBatch(db);
    batch.set(doc(db, ...matchPath), value);
    batch.update(doc(db, ...venuePath, "seasons", seasonId,
      "startApprovals", fallbackApproval), {used: true});
    return batch.commit();
  };
  const changed = structuredClone(match);
  changed.confirmedLineupSnapshot["club-a"].positions.p1 = "Outsider";
  await assertFails(start(changed));
  await assertSucceeds(start(match));
});
