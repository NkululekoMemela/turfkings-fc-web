import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const venueId = "wynberg-mm-rule-test";
const seasonId = "season-rule-test";
const fixtureId = "fixture-rule-test";
const venuePath = ["leagueVenues", venueId];
const matchPath = [...venuePath, "seasons", seasonId, "matches", "current"];
const staffPath = [...venuePath, "staff", "referee"];

const fixture = {
  id: fixtureId,
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
  };

  await assertFails(setDoc(doc(outsiderDb, ...matchPath), match));
  await assertSucceeds(setDoc(doc(refereeDb, ...matchPath), match));
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
