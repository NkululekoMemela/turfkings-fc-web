import test, {
  before,
  after,
  beforeEach,
} from "node:test";

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
  setDoc,
  Timestamp,
} from "firebase/firestore";

const PROJECT_ID = "demo-fanm-practice";
const rules = fs.readFileSync("firestore.rules", "utf8");

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
      const now = Date.now();

      await setDoc(
        doc(db, "clubs", "misfits-fc"),
        {
          name: "Misfits FC",
          adminEmails: ["admin@example.com"],
          captainEmails: ["captain@example.com"],
        }
      );

      await setDoc(
        doc(
          db,
          "practiceControl",
          "misfits-fc",
          "weeks",
          "2026-08-10",
          "entitlements",
          "user-a"
        ),
        {
          clubId: "misfits-fc",
          userId: "user-a",
          creditsRemaining: 2,
        }
      );

      await setDoc(
        doc(db, "practiceSessions", "session-active"),
        {
          sessionId: "session-active",
          clubId: "misfits-fc",
          userId: "user-a",
          status: "active",
          expiresAt: Timestamp.fromMillis(
            now + 10 * 60 * 1000
          ),
        }
      );

      await setDoc(
        doc(db, "practiceSessions", "session-expired"),
        {
          sessionId: "session-expired",
          clubId: "misfits-fc",
          userId: "user-a",
          status: "active",
          expiresAt: Timestamp.fromMillis(now - 1000),
        }
      );

      await setDoc(
        doc(db, "practiceSessions", "session-other-user"),
        {
          sessionId: "session-other-user",
          clubId: "misfits-fc",
          userId: "user-b",
          status: "active",
          expiresAt: Timestamp.fromMillis(
            now + 10 * 60 * 1000
          ),
        }
      );

      await setDoc(
        doc(db, "practiceSessions", "session-other-club"),
        {
          sessionId: "session-other-club",
          clubId: "turf-kings",
          userId: "user-a",
          status: "active",
          expiresAt: Timestamp.fromMillis(
            now + 10 * 60 * 1000
          ),
        }
      );

      await setDoc(
        doc(db, "practiceSessions", "session-closed"),
        {
          sessionId: "session-closed",
          clubId: "misfits-fc",
          userId: "user-a",
          status: "expired",
          expiresAt: Timestamp.fromMillis(
            now + 10 * 60 * 1000
          ),
        }
      );
    }
  );
});

function practiceStateDoc(
  db,
  clubId,
  sessionId
) {
  return doc(
    db,
    "sandboxes",
    "practice",
    "clubs",
    clubId,
    "sessions",
    sessionId,
    "state",
    "main"
  );
}

test("Official club discovery remains public", async () => {
  const db =
    testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(
    getDoc(doc(db, "clubs", "misfits-fc"))
  );
});

test("existing signed-in Official write remains available", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertSucceeds(
    setDoc(
      doc(db, "clubs", "misfits-fc", "state", "main"),
      { regressionProbe: true }
    )
  );
});

test("client still cannot manufacture Practice entitlement", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertFails(
    setDoc(
      doc(
        db,
        "practiceControl",
        "misfits-fc",
        "weeks",
        "2026-08-10",
        "entitlements",
        "user-a"
      ),
      { creditsRemaining: 999 },
      { merge: true }
    )
  );
});

test("client still cannot modify authoritative Practice session", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertFails(
    setDoc(
      doc(db, "practiceSessions", "session-active"),
      { expiresAt: Timestamp.fromMillis(Date.now() + 999999999) },
      { merge: true }
    )
  );
});

test("owner can write football state into active Practice sandbox", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertSucceeds(
    setDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-active"
      ),
      {
        scoreA: 4,
        scoreB: 3,
      }
    )
  );
});

test("owner can read football state from active Practice sandbox", async () => {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      await setDoc(
        practiceStateDoc(
          context.firestore(),
          "misfits-fc",
          "session-active"
        ),
        {
          scoreA: 4,
          scoreB: 3,
        }
      );
    }
  );

  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertSucceeds(
    getDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-active"
      )
    )
  );
});

test("Practice-generated football data may be hard-deleted while session is active", async () => {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      await setDoc(
        practiceStateDoc(
          context.firestore(),
          "misfits-fc",
          "session-active"
        ),
        {
          fakeSignup: true,
        }
      );
    }
  );

  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertSucceeds(
    deleteDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-active"
      )
    )
  );
});

test("another user cannot access someone else's active sandbox", async () => {
  const db =
    testEnv.authenticatedContext("user-b").firestore();

  await assertFails(
    setDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-active"
      ),
      {
        scoreA: 99,
      }
    )
  );
});

test("expired Practice session cannot write sandbox data", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertFails(
    setDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-expired"
      ),
      {
        scoreA: 99,
      }
    )
  );
});

test("closed Practice session cannot write even when expiry timestamp is future", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertFails(
    setDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-closed"
      ),
      {
        scoreA: 99,
      }
    )
  );
});

test("session for another user cannot be borrowed", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertFails(
    setDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-other-user"
      ),
      {
        scoreA: 99,
      }
    )
  );
});

test("session cannot be reused under a different club path", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertFails(
    setDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-other-club"
      ),
      {
        scoreA: 99,
      }
    )
  );
});

test("unauthenticated user cannot access Practice sandbox", async () => {
  const db =
    testEnv.unauthenticatedContext().firestore();

  await assertFails(
    getDoc(
      practiceStateDoc(
        db,
        "misfits-fc",
        "session-active"
      )
    )
  );
});

test("unrelated sandbox namespaces remain closed", async () => {
  const db =
    testEnv.authenticatedContext("user-a").firestore();

  await assertFails(
    setDoc(
      doc(
        db,
        "sandboxes",
        "development",
        "clubs",
        "misfits-fc",
        "state",
        "main"
      ),
      {
        unsafe: true,
      }
    )
  );
});
