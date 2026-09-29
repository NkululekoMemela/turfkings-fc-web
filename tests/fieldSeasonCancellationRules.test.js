import test from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, serverTimestamp, writeBatch,
} from "firebase/firestore";

let env;
const base = ["leagueVenues", "cancellation-field"];
const source = {
  id: "season-one", status: "active", registrationOpen: true,
  clubIds: ["club-one"], invitations: {}, fixtures: [],
  results: [], matchDayHistory: [], liveMatches: {}, allEvents: [],
};
const signedIn = uid => env.authenticatedContext(uid, {
  email: `${uid}@example.com`, email_verified: true,
}).firestore();

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-season-cancellation",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
test.after(async () => env?.cleanup());
test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), ...base), {
      id: "cancellation-field", ownerUid: "owner",
      league: { activeSeason: source },
    });
  });
});

function cancel(db, reason = "Not enough Club signups") {
  const batch = writeBatch(db);
  batch.set(doc(db, ...base, "seasons", source.id), {
    ...source, status: "cancelled", registrationOpen: false,
    cancellationReason: reason, endedAtMs: Date.now(), endedByUid: "owner",
  });
  batch.update(doc(db, ...base), {
    "league.activeSeason": {
      id: "season-two", status: "active", previousSeasonId: source.id,
      clubIds: [], invitations: {}, fixtures: [], results: [],
    },
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

test("owner can archive an unplayed season with its cancellation reason", async () => {
  await assertSucceeds(cancel(signedIn("owner")));
});

test("outsiders and missing explanations cannot cancel a season", async () => {
  await assertFails(cancel(signedIn("outsider")));
  await assertFails(cancel(signedIn("owner"), ""));
});

test("a current match prevents cancellation even if root results are empty", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(
      doc(context.firestore(), ...base, "seasons", source.id, "matches", "current"),
      { status: "live" },
    );
  });
  await assertFails(cancel(signedIn("owner")));
});
