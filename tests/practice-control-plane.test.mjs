import test from "node:test";
import assert from "node:assert/strict";

const {
  PRACTICE_SESSION_DURATION_SECONDS,
  PRACTICE_WEEKLY_CREDIT_ALLOCATION,
  isPracticeEligibleRole,
  getPracticeWeekKey,
  createPracticeWeeklyEntitlement,
  getPracticeCreditsAvailable,
  consumePracticeCredit,
  transferPracticeCredit,
  createPracticeSessionWindow,
  isPracticeSessionExpired,
} = await import("../src/core/practiceControlPlane.js");

test("Practice session duration is exactly 15 minutes", () => {
  assert.equal(PRACTICE_SESSION_DURATION_SECONDS, 900);
});

test("weekly allocation is exactly three credits", () => {
  assert.equal(PRACTICE_WEEKLY_CREDIT_ALLOCATION, 3);
});

test("only admin and captain roles are eligible", () => {
  assert.equal(isPracticeEligibleRole("admin"), true);
  assert.equal(isPracticeEligibleRole("captain"), true);
  assert.equal(isPracticeEligibleRole("player"), false);
  assert.equal(isPracticeEligibleRole("guest"), false);
});

test("new weekly entitlement starts with three available credits", () => {
  const entitlement = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-10T12:00:00Z",
  });

  assert.equal(entitlement.allocatedCredits, 3);
  assert.equal(entitlement.consumedCredits, 0);
  assert.equal(getPracticeCreditsAvailable(entitlement), 3);
});

test("Practice week resets Monday 00:00 South African time", () => {
  assert.equal(
    getPracticeWeekKey("2026-08-10T12:00:00Z"),
    "2026-08-10"
  );

  // Sunday 23:59:59 SAST is still the previous Practice week.
  assert.equal(
    getPracticeWeekKey("2026-08-16T21:59:59Z"),
    "2026-08-10"
  );

  // Monday 00:00:00 SAST = Sunday 22:00:00 UTC.
  assert.equal(
    getPracticeWeekKey("2026-08-16T22:00:00Z"),
    "2026-08-17"
  );

  assert.equal(
    getPracticeWeekKey("2026-08-17T00:00:00Z"),
    "2026-08-17"
  );
});

test("credit is consumed immediately at session start", () => {
  const initial = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "captain",
    at: "2026-08-10T12:00:00Z",
  });

  const afterStart = consumePracticeCredit(initial);

  assert.equal(initial.consumedCredits, 0);
  assert.equal(afterStart.consumedCredits, 1);
  assert.equal(getPracticeCreditsAvailable(afterStart), 2);
});

test("three starts exhaust the weekly allocation", () => {
  let entitlement = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-10T12:00:00Z",
  });

  entitlement = consumePracticeCredit(entitlement);
  entitlement = consumePracticeCredit(entitlement);
  entitlement = consumePracticeCredit(entitlement);

  assert.equal(getPracticeCreditsAvailable(entitlement), 0);

  assert.throws(
    () => consumePracticeCredit(entitlement),
    /No Practice credits available/
  );
});

test("unused credits do not roll into a new week", () => {
  const weekOne = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-10T12:00:00Z",
  });

  const weekTwo = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-17T12:00:00Z",
  });

  assert.notEqual(weekOne.weekKey, weekTwo.weekKey);
  assert.equal(getPracticeCreditsAvailable(weekTwo), 3);
});

test("same-club transfer moves exactly one existing credit", () => {
  const sender = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-10T12:00:00Z",
  });

  const recipient = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-b",
    role: "captain",
    at: "2026-08-10T12:00:00Z",
  });

  const beforeTotal =
    getPracticeCreditsAvailable(sender) +
    getPracticeCreditsAvailable(recipient);

  const transferred = transferPracticeCredit({
    sender,
    recipient,
  });

  assert.equal(
    getPracticeCreditsAvailable(transferred.sender),
    2
  );

  assert.equal(
    getPracticeCreditsAvailable(transferred.recipient),
    4
  );

  const afterTotal =
    getPracticeCreditsAvailable(transferred.sender) +
    getPracticeCreditsAvailable(transferred.recipient);

  assert.equal(afterTotal, beforeTotal);
});

test("credits cannot be transferred between clubs", () => {
  const sender = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-10T12:00:00Z",
  });

  const recipient = createPracticeWeeklyEntitlement({
    clubId: "turf-kings",
    userId: "user-b",
    role: "captain",
    at: "2026-08-10T12:00:00Z",
  });

  assert.throws(
    () => transferPracticeCredit({ sender, recipient }),
    /cannot cross clubs/
  );
});

test("credits cannot be transferred across weekly boundaries", () => {
  const sender = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-10T12:00:00Z",
  });

  const recipient = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-b",
    role: "captain",
    at: "2026-08-17T12:00:00Z",
  });

  assert.throws(
    () => transferPracticeCredit({ sender, recipient }),
    /cannot cross weeks/
  );
});

test("transfer recipient must also be an eligible club role", () => {
  const sender = createPracticeWeeklyEntitlement({
    clubId: "misfits-fc",
    userId: "user-a",
    role: "admin",
    at: "2026-08-10T12:00:00Z",
  });

  const recipient = {
    ...createPracticeWeeklyEntitlement({
      clubId: "misfits-fc",
      userId: "user-b",
      role: "captain",
      at: "2026-08-10T12:00:00Z",
    }),
    role: "player",
  };

  assert.throws(
    () => transferPracticeCredit({ sender, recipient }),
    /Recipient is not Practice eligible/
  );
});

test("Practice session window has authoritative expiry timestamp", () => {
  const session = createPracticeSessionWindow({
    startedAt: "2026-08-10T12:00:00Z",
  });

  assert.equal(
    session.startedAt,
    "2026-08-10T12:00:00.000Z"
  );

  assert.equal(
    session.expiresAt,
    "2026-08-10T12:15:00.000Z"
  );

  assert.equal(session.durationSeconds, 900);
});

test("session expires from expiresAt rather than client countdown state", () => {
  const session = createPracticeSessionWindow({
    startedAt: "2026-08-10T12:00:00Z",
  });

  assert.equal(
    isPracticeSessionExpired(
      session,
      "2026-08-10T12:14:59Z"
    ),
    false
  );

  assert.equal(
    isPracticeSessionExpired(
      session,
      "2026-08-10T12:15:00Z"
    ),
    true
  );

  assert.equal(
    isPracticeSessionExpired(
      session,
      "2026-08-10T13:00:00Z"
    ),
    true
  );
});
