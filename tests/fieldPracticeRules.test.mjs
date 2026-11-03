import {readFileSync} from "node:fs";
import {test, before, after} from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {doc, setDoc, getDoc, Timestamp} from "firebase/firestore";

let env;
const root = "sandboxes/practice/leagueVenues/field/sessions/session";

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-field-practice-isolation",
    firestore: {rules: readFileSync("firestore.rules", "utf8")},
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "practiceSessions/session"), {
      kind: "venueLeague", environment: "practice",
      sessionId: "session", venueId: "field",
      userId: "practice-user", status: "active",
      expiresAt: Timestamp.fromMillis(Date.now() + 900000),
    });
    await setDoc(doc(db, "practiceSessions/expired"), {
      kind: "venueLeague", environment: "practice",
      sessionId: "expired", venueId: "field",
      userId: "practice-user", status: "active",
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    await setDoc(doc(db, root), {league: {activeSeason: null}});
    await setDoc(doc(db, "leagueVenues/field"), {
      ownerUid: "real-owner", name: "Official Field",
      league: {activeSeason: {id: "official-season"}},
    });
  });
});
after(async () => {await env?.cleanup();});

test("Session owner can read and write its Field sandbox", async () => {
  const db = env.authenticatedContext("practice-user").firestore();
  await assertSucceeds(getDoc(doc(db, root)));
  await assertSucceeds(setDoc(doc(db, `${root}/clubs/club`), {
    name: "Sandbox Club", players: [],
  }));
  await assertSucceeds(setDoc(doc(db,
    `${root}/seasons/season/matches/current`), {status: "live"}));
});

test("Other users and unauthenticated visitors cannot read the sandbox", async () => {
  await assertFails(getDoc(doc(
    env.authenticatedContext("outsider").firestore(), root
  )));
  await assertFails(getDoc(doc(
    env.unauthenticatedContext().firestore(), root
  )));
});

test("Expired sessions and mismatched Fields cannot write", async () => {
  const db = env.authenticatedContext("practice-user").firestore();
  await assertFails(setDoc(doc(db,
    "sandboxes/practice/leagueVenues/field/sessions/expired/clubs/club"
  ), {name: "Expired"}));
  await assertFails(setDoc(doc(db,
    "sandboxes/practice/leagueVenues/other/sessions/session/clubs/club"
  ), {name: "Wrong Field"}));
});

test("Practice session cannot grant Official writes or extend its expiry", async () => {
  const db = env.authenticatedContext("practice-user").firestore();
  await assertFails(setDoc(doc(db, "leagueVenues/field"),
    {name: "Changed"}, {merge: true}));
  await assertFails(setDoc(doc(db, "practiceSessions/session"), {
    expiresAt: Timestamp.fromMillis(Date.now() + 999999999),
  }, {merge: true}));
});
