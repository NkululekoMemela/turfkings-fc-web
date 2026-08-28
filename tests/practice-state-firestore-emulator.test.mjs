import test, {
  before,
  after,
  beforeEach,
} from "node:test";

import assert from "node:assert/strict";
import fs from "node:fs";

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import {
  createPracticeStatePersistenceContext,
} from "../src/core/practiceStatePersistenceContext.js";

const PROJECT_ID = "demo-fanm-practice-state";
const rules = fs.readFileSync(
  "firestore.rules",
  "utf8"
);

const CLUB_ID = "misfits-fc";
const SESSION_ID = "session-active";
const OWNER_UID = "user-a";

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      const db = context.firestore();

      // Official state exists before Practice starts.
      await setDoc(
        doc(
          db,
          "clubs",
          CLUB_ID,
          "state",
          "main"
        ),
        {
          environment: "official",
          officialMarker: "DO-NOT-TOUCH",
          scoreA: 8,
          scoreB: 6,
        }
      );

      // Authoritative server-created Practice session.
      await setDoc(
        doc(
          db,
          "practiceSessions",
          SESSION_ID
        ),
        {
          sessionId: SESSION_ID,
          clubId: CLUB_ID,
          userId: OWNER_UID,
          status: "active",
          expiresAt: Timestamp.fromMillis(
            Date.now() + 10 * 60 * 1000
          ),
        }
      );
    }
  );
});

function practiceContext() {
  return createPracticeStatePersistenceContext({
    clubId: CLUB_ID,
    sessionId: SESSION_ID,
  });
}

function practiceStateRef(db) {
  return doc(
    db,
    practiceContext().statePath
  );
}

function officialStateRef(db) {
  return doc(
    db,
    "clubs",
    CLUB_ID,
    "state",
    "main"
  );
}

test("canonical Practice state path is physically separate from Official state", () => {
  const context = practiceContext();

  assert.equal(
    context.statePath,
    "sandboxes/practice/clubs/misfits-fc/sessions/session-active/state/main"
  );

  assert.notEqual(
    context.statePath,
    "clubs/misfits-fc/state/main"
  );
});

test("active Practice owner can persist generated football state", async () => {
  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  await assertSucceeds(
    setDoc(
      practiceStateRef(db),
      {
        practiceVersion: 2,
        environment: "practice",
        clubId: CLUB_ID,
        practiceSessionId: SESSION_ID,
        signups: [
          {
            playerId: "player-a",
          },
        ],
        teams: [],
        squads: [],
        fixtures: [],
        matches: [],
        events: [
          {
            type: "goal",
            playerId: "player-a",
          },
        ],
        results: [],
        liveMatch: null,
      }
    )
  );
});

test("Practice owner can read persisted Practice football state", async () => {
  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  await setDoc(
    practiceStateRef(db),
    {
      environment: "practice",
      events: [
        {
          type: "goal",
          playerId: "player-a",
        },
      ],
    }
  );

  const snap = await assertSucceeds(
    getDoc(
      practiceStateRef(db)
    )
  );

  assert.equal(snap.exists(), true);

  assert.equal(
    snap.data().environment,
    "practice"
  );

  assert.equal(
    snap.data().events.length,
    1
  );
});

test("Practice owner receives live subscription updates", async () => {
  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  const ref = practiceStateRef(db);

  const received = [];

  const observed = new Promise(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            "Timed out waiting for Practice state subscription."
          )
        );
      }, 5000);

      const unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) return;

          const data = snap.data() || {};
          received.push(data);

          if (
            Array.isArray(data.events) &&
            data.events.length === 1
          ) {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          }
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
    }
  );

  await setDoc(
    ref,
    {
      environment: "practice",
      events: [],
    }
  );

  await setDoc(
    ref,
    {
      environment: "practice",
      events: [
        {
          type: "goal",
          playerId: "player-b",
        },
      ],
    },
    {
      merge: true,
    }
  );

  await observed;

  assert.ok(received.length >= 1);

  assert.equal(
    received.at(-1).events.length,
    1
  );
});

test("Practice state persistence does not alter Official state", async () => {
  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  const officialBefore =
    await getDoc(
      officialStateRef(db)
    );

  assert.equal(
    officialBefore.data().officialMarker,
    "DO-NOT-TOUCH"
  );

  await setDoc(
    practiceStateRef(db),
    {
      environment: "practice",
      scoreA: 99,
      scoreB: 98,
      events: [
        {
          type: "goal",
        },
      ],
    }
  );

  const officialAfter =
    await getDoc(
      officialStateRef(db)
    );

  assert.deepEqual(
    officialAfter.data(),
    officialBefore.data()
  );

  assert.equal(
    officialAfter.data().scoreA,
    8
  );

  assert.equal(
    officialAfter.data().scoreB,
    6
  );
});

test("Practice-generated state supports permanent hard delete", async () => {
  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  const ref = practiceStateRef(db);

  await setDoc(
    ref,
    {
      environment: "practice",
      signups: [
        {
          playerId: "player-a",
        },
      ],
      events: [
        {
          type: "goal",
        },
      ],
    }
  );

  const before =
    await getDoc(ref);

  assert.equal(before.exists(), true);

  await assertSucceeds(
    deleteDoc(ref)
  );

  const after =
    await getDoc(ref);

  assert.equal(after.exists(), false);
});

test("hard deleting Practice state does not delete Official state", async () => {
  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  const practiceRef =
    practiceStateRef(db);

  await setDoc(
    practiceRef,
    {
      environment: "practice",
      temporary: true,
    }
  );

  await deleteDoc(practiceRef);

  const official =
    await getDoc(
      officialStateRef(db)
    );

  assert.equal(
    official.exists(),
    true
  );

  assert.equal(
    official.data().officialMarker,
    "DO-NOT-TOUCH"
  );
});

test("another authenticated user cannot read Practice state", async () => {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      await setDoc(
        practiceStateRef(
          context.firestore()
        ),
        {
          environment: "practice",
          privatePracticeData: true,
        }
      );
    }
  );

  const db =
    testEnv.authenticatedContext(
      "user-b"
    ).firestore();

  await assertFails(
    getDoc(
      practiceStateRef(db)
    )
  );
});

test("another authenticated user cannot write Practice state", async () => {
  const db =
    testEnv.authenticatedContext(
      "user-b"
    ).firestore();

  await assertFails(
    setDoc(
      practiceStateRef(db),
      {
        hijacked: true,
      }
    )
  );
});

test("expired authoritative session blocks further Practice writes", async () => {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "practiceSessions",
          SESSION_ID
        ),
        {
          sessionId: SESSION_ID,
          clubId: CLUB_ID,
          userId: OWNER_UID,
          status: "active",
          expiresAt: Timestamp.fromMillis(
            Date.now() - 1000
          ),
        }
      );
    }
  );

  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  await assertFails(
    setDoc(
      practiceStateRef(db),
      {
        tooLate: true,
      }
    )
  );
});

test("expired session also blocks hard delete by client", async () => {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      const adminDb =
        context.firestore();

      await setDoc(
        practiceStateRef(adminDb),
        {
          temporary: true,
        }
      );

      await setDoc(
        doc(
          adminDb,
          "practiceSessions",
          SESSION_ID
        ),
        {
          sessionId: SESSION_ID,
          clubId: CLUB_ID,
          userId: OWNER_UID,
          status: "active",
          expiresAt: Timestamp.fromMillis(
            Date.now() - 1000
          ),
        }
      );
    }
  );

  const db =
    testEnv.authenticatedContext(
      OWNER_UID
    ).firestore();

  await assertFails(
    deleteDoc(
      practiceStateRef(db)
    )
  );
});
