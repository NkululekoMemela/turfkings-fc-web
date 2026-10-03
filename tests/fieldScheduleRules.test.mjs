import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch,
} from "firebase/firestore";

let environment;
const venuePath = "leagueVenues/schedule-test";
const matchPath = `${venuePath}/seasons/season-one/matches/current`;
const database = uid => environment.authenticatedContext(uid, {
  email: `${uid}@example.com`,
}).firestore();

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-field-schedule",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => { await environment?.cleanup(); });
beforeEach(async () => { await environment.clearFirestore(); });

async function seed({ future = true, testing = false, legacy = false } = {}) {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, venuePath), {
      id: "schedule-test", ownerUid: "creator", adminUids: ["creator"],
      league: { activeSeason: {
        id: "season-one", status: "active", gameFormat: "5_V_5",
        scheduleVersion: legacy ? 0 : 1,
        allowEarlyStarts: testing,
        fixtures: [{
          id: "fixture-one", matchDayId: "day-one", status: "scheduled",
          clubAId: "club-a", clubBId: "club-b",
        }],
        matchDays: [{
          id: "day-one", status: "scheduled", fixtureIds: ["fixture-one"],
          opensAtMs: Date.now() + (future ? 86400000 : -86400000),
        }],
        clubIds: ["club-a", "club-b"], liveMatches: {},
        results: [], allEvents: [], matchDayHistory: [],
      }},
    });
    const seededSeason = (await getDoc(doc(db, venuePath)))
      .data().league.activeSeason;
    const version = Timestamp.fromMillis(Date.now() - 1000);
    for (const clubId of ["club-a", "club-b"]) {
      await setDoc(doc(db,
        `leagueClubBookings/schedule-test~season-one~day-one~${clubId}`), {
        updatedAt: version,
      });
    }
    for (const uid of ["referee", "creator"]) {
      await setDoc(doc(db,
        `${venuePath}/seasons/season-one/startApprovals/${uid}`), {
        venueId: "schedule-test", seasonId: "season-one",
        fixtureId: "fixture-one", matchDayId: "day-one",
        actorUid: uid, gameFormat: "5_V_5",
        clubAId: "club-a", clubBId: "club-b",
        bookingVersions: {"club-a": version, "club-b": version},
        matchDayHistory: seededSeason.matchDayHistory,
        matchDays: seededSeason.matchDays,
        expiresAt: Timestamp.fromMillis(Date.now() + 600000),
        used: false,
      });
    }
    for (const uid of ["referee", "administrator"]) {
      await setDoc(doc(db, `${venuePath}/staff/${uid}`), {
        uid, status: "active",
        role: uid === "referee" ? "referee" : "manager",
        isAdministrator: uid === "administrator",
      });
    }
  });
}

const live = extra => ({
  venueId: "schedule-test", seasonId: "season-one",
  fixtureId: "fixture-one", fixtureIndex: 0, matchDayIndex: 0,
  status: "live", startedByUid: "referee", secondsLeft: 2400,
  ...extra,
});
const approvalPath = uid =>
  `${venuePath}/seasons/season-one/startApprovals/${uid}`;

const start = (uid = "referee", extra = {}) => {
  const db = database(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, matchPath), live({
    startedByUid: uid, startApprovalId: uid, ...extra,
  }));
  batch.update(doc(db, approvalPath(uid)), {used: true});
  return batch.commit();
};

async function changeApproval(patch) {
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), approvalPath("referee")), patch);
  });
}

test("future dates block referees and the creator", async () => {
  await seed();
  await assertFails(start());
  await assertFails(start("creator", { startedByUid: "creator" }));
});

test("an arrived date permits play and timer updates", async () => {
  await seed({ future: false });
  await assertSucceeds(start());
  await assertSucceeds(updateDoc(doc(database("referee"), matchPath), {
    secondsLeft: 2399,
  }));
});

test("testing mode permits an early start", async () => {
  await seed({ testing: true });
  await assertSucceeds(start());
});

test("only the creator can enable testing mode", async () => {
  await seed();
  const patch = {
    "league.activeSeason.allowEarlyStarts": true,
    "league.activeSeason.testingChangedByUid": "creator",
    "league.activeSeason.testingChangedAt": serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await assertFails(updateDoc(doc(database("administrator"), venuePath), patch));
  await assertFails(updateDoc(doc(database("referee"), venuePath), patch));
  await assertSucceeds(updateDoc(doc(database("creator"), venuePath), patch));
});

test("forged fixture references are rejected", async () => {
  await seed({ future: false });
  await assertFails(start("referee", { fixtureIndex: 99 }));
  await assertFails(start("referee", { matchDayIndex: -1 }));
  await assertFails(start("referee", { fixtureId: "different-fixture" }));
});

test("live schedule references cannot be changed", async () => {
  await seed({ future: false });
  await assertSucceeds(start());
  await assertFails(updateDoc(doc(database("referee"), matchPath), {
    matchDayIndex: 1,
  }));
});

test("legacy seasons cannot start without a valid dated approval", async () => {
  await seed({ legacy: true });
  await environment.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), approvalPath("referee")));
  });
  await assertFails(start());
});

test("missing approval and unconsumed approval cannot start play", async () => {
  await seed({future: false});
  await assertFails(setDoc(doc(database("referee"), matchPath),
    live({startApprovalId: "missing"})));
  await assertFails(setDoc(doc(database("referee"), matchPath),
    live({startApprovalId: "referee"})));
});

test("expired approvals cannot start play", async () => {
  await seed({future: false});
  await changeApproval({expiresAt: Timestamp.fromMillis(Date.now() - 1000)});
  await assertFails(start());
});

test("payment changes invalidate the approval", async () => {
  await seed({future: false});
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(),
      "leagueClubBookings/schedule-test~season-one~day-one~club-a"), {
      updatedAt: Timestamp.fromMillis(Date.now() + 1000),
    });
  });
  await assertFails(start());
});

test("an approval cannot be reused after cancellation", async () => {
  await seed({future: false});
  await assertSucceeds(start());
  await assertSucceeds(deleteDoc(doc(database("referee"), matchPath)));
  await assertFails(start());
});

test("clients cannot forge server approvals", async () => {
  await seed({future: false});
  await assertFails(setDoc(doc(database("creator"), approvalPath("forged")), {
    actorUid: "creator", used: false,
  }));
  await assertFails(updateDoc(doc(database("referee"), approvalPath("referee")), {
    expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
  }));
});

test("completed matches cannot be restarted with the same approval", async () => {
  await seed({future: false});
  await assertSucceeds(start());
  await assertSucceeds(updateDoc(doc(database("referee"), matchPath), {
    status: "completed",
  }));
  await assertFails(updateDoc(doc(database("referee"), matchPath), {
    status: "live",
  }));
});

test("referees may select a current dated fixture but cannot alter its opponents", async () => {
  await seed({future: false});
  await assertSucceeds(updateDoc(doc(database("referee"), venuePath), {
    "league.activeSeason.selectedFixtureId": "fixture-one",
    "league.activeSeason.selectedFixtureIndex": 0,
    "league.activeSeason.selectedMatchDayIndex": 0,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(database("referee"), venuePath), {
    "league.activeSeason.selectedFixtureIndex": 99,
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(database("referee"), venuePath), {
    "league.activeSeason.fixtures": [{
      id: "fixture-one", clubAId: "club-a", clubBId: "other-club",
      matchDayId: "day-one", status: "scheduled",
    }],
    updatedAt: serverTimestamp(),
  }));
});
