import test, { before, after, beforeEach } from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let env;
const projectId = "demo-fanm-venue-invitations";
const venueId = "clarendon-test-owner";
const clubId = "existing-club";

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
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
      name: "Clarendon Test",
      ownerUid: "field-owner",
      adminUids: ["field-owner"],
      visibility: { listed: true },
      league: {
        activeSeason: {
          id: "season-test",
          name: "Test Season",
          clubIds: [],
          invitations: {},
        },
      },
    });
    await setDoc(doc(db, "clubs", clubId), {
      name: "Existing Club",
      adminEmails: ["club-admin@example.com"],
    });
  });
});

test("field owner can invite a club without changing its club record", async () => {
  const db = env.authenticatedContext("field-owner").firestore();
  await assertSucceeds(updateDoc(doc(db, "leagueVenues", venueId), {
    [`league.activeSeason.invitations.${clubId}`]: {
      clubId,
      status: "pending",
    },
  }));
  const club = await getDoc(doc(db, "clubs", clubId));
  const venue = await getDoc(doc(db, "leagueVenues", venueId));
  if (club.data().name !== "Existing Club" ||
      venue.data().league.activeSeason.invitations[clubId].status !== "pending") {
    throw new Error("Invitation or club isolation did not persist correctly.");
  }
});

test("club administrator cannot edit field invitations", async () => {
  const db = env.authenticatedContext("club-admin", {
    email: "club-admin@example.com",
  }).firestore();
  await assertFails(updateDoc(doc(db, "leagueVenues", venueId), {
    [`league.activeSeason.invitations.${clubId}`]: {
      clubId,
      status: "accepted",
    },
  }));
});

test("visitor cannot create an invitation", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(updateDoc(doc(db, "leagueVenues", venueId), {
    [`league.activeSeason.invitations.${clubId}`]: {
      clubId,
      status: "pending",
    },
  }));
});

test("field owner can schedule a venue fixture without changing club data", async () => {
  const owner = env.authenticatedContext("field-owner").firestore();
  const other = env.authenticatedContext("club-admin", {
    email: "club-admin@example.com",
  }).firestore();
  const ref = doc(owner, "leagueVenues", venueId);

  await assertSucceeds(updateDoc(ref, {
    "league.activeSeason.fixtures": [{
      id: "fixture-1",
      clubAId: clubId,
      clubBId: "another-club",
      status: "scheduled",
    }],
  }));
  await assertFails(updateDoc(doc(other, "leagueVenues", venueId), {
    "league.activeSeason.fixtures": [{
      id: "fixture-changed-by-club",
      status: "scheduled",
    }],
  }));

  const club = await getDoc(doc(owner, "clubs", clubId));
  const venue = await getDoc(ref);
  if (club.data().name !== "Existing Club" ||
      venue.data().league.activeSeason.fixtures[0].id !== "fixture-1") {
    throw new Error("Fixture write crossed the club/venue boundary.");
  }
});
