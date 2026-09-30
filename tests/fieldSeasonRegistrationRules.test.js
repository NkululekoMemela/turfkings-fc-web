import test from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

let env;
const venueId = "registration-field";
const clubId = "registration-club";
const base = ["leagueVenues", venueId];

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-registration-window",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
test.after(async () => env?.cleanup());

async function seed(deadline, confirmed = false) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "clubs", clubId), {
      ownerUid: "club-admin", createdByUid: "club-admin",
      adminUids: ["club-admin"], adminEmails: [],
    });
    await setDoc(doc(db, "clubFieldMemberships", clubId), {
      clubId, venueId, status: "active",
    });
    await setDoc(doc(db, ...base), {
      id: venueId, ownerUid: "field-owner",
      league: {
        activeSeason: {
          id: "season-one", status: "active",
          announcedAtMs: 1, registrationOpen: true,
          signupDeadlineAtMs: deadline,
          results: [], matchDayHistory: [], clubIds: [],
          invitations: {
            [clubId]: {
              clubId, clubName: "Registration Club", status: "pending",
            },
          },
        },
      },
    });
    if (confirmed) {
      await setDoc(
        doc(db, ...base, "seasons", "season-one", "matches", "current"),
        { status: "live", confirmedLineupSnapshot: { confirmed: true } },
      );
    }
  });
}

async function accept() {
  const db = env.authenticatedContext("club-admin", {
    email: "admin@example.com", email_verified: true,
  }).firestore();
  const ref = doc(db, ...base);
  const season = (await getDoc(ref)).data().league.activeSeason;
  return updateDoc(ref, {
    "league.activeSeason": {
      ...season,
      invitations: {
        ...season.invitations,
        [clubId]: {
          ...season.invitations[clubId],
          status: "accepted", confirmedByUid: "club-admin",
          confirmedAt: serverTimestamp(),
        },
      },
      clubIds: [clubId], lastRespondingClubId: clubId,
    },
    updatedAt: serverTimestamp(),
  });
}

test("signup is allowed before its deadline", async () => {
  await seed(Date.now() + 3600000);
  await assertSucceeds(accept());
});

test("expired deadline blocks signup even when registrationOpen is true", async () => {
  await seed(Date.now() - 3600000);
  await assertFails(accept());
});

test("confirmed play blocks signup before the closure handler runs", async () => {
  await seed(Date.now() + 3600000, true);
  await assertFails(accept());
});
