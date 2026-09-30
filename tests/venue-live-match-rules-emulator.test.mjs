import test, { before, after, beforeEach } from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  FieldPath,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let env;
const venueId = "venue-live-test";
const fixtureId = "fixture-one";

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-venue-live",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "leagueVenues", venueId), {
      id: venueId,
      ownerUid: "field-owner",
      adminUids: ["field-owner"],
      name: "Test Field",
      league: {
        activeSeason: {
          id: "season-one",
          clubIds: ["club-a", "club-b"],
          fixtures: [{
            id: fixtureId,
            status: "scheduled",
            clubAId: "club-a",
            clubBId: "club-b",
          }],
          liveMatches: {},
        },
      },
    });
    await setDoc(doc(db, "clubs", "club-a"), {
      name: "Club A",
      adminEmails: ["captain@example.com"],
    });
  });
});

function start(db) {
  return updateDoc(
    doc(db, "leagueVenues", venueId),
    new FieldPath("league", "activeSeason", "liveMatches", fixtureId),
    {
      fixtureId,
      clubAId: "club-a",
      clubBId: "club-b",
      scoreA: 0,
      scoreB: 0,
      status: "live",
    }
  );
}

test("field owner can start the venue fixture without changing a club", async () => {
  const db = env.authenticatedContext("field-owner").firestore();
  await assertSucceeds(start(db));
  const venue = (await getDoc(doc(db, "leagueVenues", venueId))).data();
  const club = (await getDoc(doc(db, "clubs", "club-a"))).data();
  if (venue.league.activeSeason.liveMatches[fixtureId]?.status !== "live") {
    throw new Error("Venue fixture was not started.");
  }
  if (club.name !== "Club A" || club.adminEmails[0] !== "captain@example.com") {
    throw new Error("Club data changed.");
  }
});

test("club user cannot start a venue fixture", async () => {
  const db = env.authenticatedContext("club-user").firestore();
  await assertFails(start(db));
});

test("visitor cannot start a venue fixture", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(start(db));
});
