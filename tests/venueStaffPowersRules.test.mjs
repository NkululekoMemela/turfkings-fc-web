import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, updateDoc, getDoc, serverTimestamp, writeBatch,
} from "firebase/firestore";

let environment;
const venueId = "powers-test-field";
const venuePath = `leagueVenues/${venueId}`;
const staffPath = uid => `${venuePath}/staff/${uid}`;
const powersPath = uid => `${venuePath}/staffPermissions/${uid}`;
const season = {
  id: "season-one", name: "Season One", status: "active",
  clubIds: [], fixtures: [], results: [], allEvents: [],
  matchDayHistory: [], liveMatches: {}, currentMatchNo: 1,
};
const database = uid => environment.authenticatedContext(
  uid, { email: `${uid}@example.com` }
).firestore();
const powers = (uid, values = {}) => ({
  uid, endMatchDay: false, endSeason: false, ...values,
  updatedByUid: "creator", updatedAt: serverTimestamp(),
});
const saveDay = uid => updateDoc(doc(database(uid), venuePath), {
  "league.activeSeason.matchDayHistory": [{
    id: "day-one", endedByUid: uid, endedAtMs: 1,
    results: [], allEvents: [], clubIds: [],
  }],
  "league.activeSeason.updatedAtMs": 1,
  updatedAt: serverTimestamp(),
});

async function closeSeason(uid) {
  const db = database(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, `${venuePath}/seasons/season-one`), {
    ...season, status: "cancelled", registrationOpen: false,
    cancellationReason: "Insufficient clubs registered",
    endedByUid: uid, endedAtMs: 1,
  });
  batch.update(doc(db, venuePath), {
    "league.activeSeason": {
      ...season, id: "season-two", previousSeasonId: "season-one",
    },
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-field-staff-powers",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => {
  await environment?.cleanup();
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, venuePath), {
      id: venueId, ownerUid: "creator", createdByUid: "creator",
      adminUids: ["creator"], adminEmails: [],
      ownerEmail: "creator@example.com",
      createdByEmail: "creator@example.com",
      league: { activeSeason: season },
    });
    for (const [uid, role, administrator] of [
      ["assistant", "assistant_manager", true],
      ["referee", "referee", false],
      ["inactive", "other_staff", true],
    ]) {
      await setDoc(doc(db, staffPath(uid)), {
        uid, name: uid, email: `${uid}@example.com`, role,
        status: uid === "inactive" ? "rejected" : "active",
        isAdministrator: administrator, isCreator: false,
      });
    }
  });
});

test("only the creator can assign staff powers", async () => {
  await assertSucceeds(setDoc(
    doc(database("creator"), powersPath("assistant")),
    powers("assistant", { endMatchDay: true }),
  ));
  await assertFails(setDoc(
    doc(database("assistant"), powersPath("assistant")),
    { ...powers("assistant", { endSeason: true }),
      updatedByUid: "assistant" },
  ));
  await assertFails(setDoc(
    doc(database("referee"), powersPath("referee")),
    { ...powers("referee", { endSeason: true }),
      updatedByUid: "referee" },
  ));
  await assertFails(setDoc(
    doc(database("creator"), powersPath("inactive")),
    powers("inactive", { endSeason: true }),
  ));
});

test("referees and administrators cannot close anything by default", async () => {
  for (const uid of ["referee", "assistant"]) {
    await assertFails(saveDay(uid));
    await assertFails(closeSeason(uid));
  }
});

test("End Match Day permission does not grant End Season", async () => {
  await assertSucceeds(setDoc(
    doc(database("creator"), powersPath("assistant")),
    powers("assistant", { endMatchDay: true }),
  ));
  await assertSucceeds(saveDay("assistant"));
  await assertFails(closeSeason("assistant"));
});

test("End Season permission does not grant End Match Day", async () => {
  await assertSucceeds(setDoc(
    doc(database("creator"), powersPath("assistant")),
    powers("assistant", { endSeason: true }),
  ));
  await assertFails(saveDay("assistant"));
  await assertSucceeds(closeSeason("assistant"));
});

test("revoking a power immediately blocks its use", async () => {
  const ref = doc(database("creator"), powersPath("assistant"));
  await assertSucceeds(setDoc(
    ref, powers("assistant", { endMatchDay: true, endSeason: true }),
  ));
  await assertSucceeds(setDoc(ref, powers("assistant")));
  await assertFails(saveDay("assistant"));
  await assertFails(closeSeason("assistant"));
});

test("the creator retains both powers without a permission document", async () => {
  await assertSucceeds(saveDay("creator"));
  // Reset the fixture to test season closure independently.
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), venuePath), {
      "league.activeSeason": season,
    });
  });
  await assertSucceeds(closeSeason("creator"));
});

test("staff can read their own powers but not another person's", async () => {
  await assertSucceeds(setDoc(
    doc(database("creator"), powersPath("assistant")),
    powers("assistant"),
  ));
  await assertSucceeds(getDoc(
    doc(database("assistant"), powersPath("assistant")),
  ));
  await assertFails(getDoc(
    doc(database("referee"), powersPath("assistant")),
  ));
});
