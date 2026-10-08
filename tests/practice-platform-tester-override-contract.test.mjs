import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync(
  "functions/practiceSessionService.js",
  "utf8"
);

const functionsIndex = fs.readFileSync(
  "functions/index.js",
  "utf8"
);

test("platform tester is server controlled by Firebase UID", () => {
  assert.match(
    service,
    /\.doc\("platformTesters"\)[\s\S]*\.collection\("users"\)[\s\S]*\.doc\(uid\)/
  );
});

test("tester must be enabled and explicitly allowed weekly bypass", () => {
  assert.match(service, /platformTester\.enabled\s*===\s*true/);
  assert.match(
    service,
    /platformTester\.bypassWeeklyStartLimit\s*===\s*true/
  );
});

test("tester entitlement has authoritative expiry", () => {
  assert.match(
    service,
    /platformTesterExpiresAtMs\s*>\s*serverNow\.getTime\(\)/
  );
});

test("ordinary users receive unlimited Practice starts", () => {
  const start = service.slice(
    service.indexOf("async function startPracticeSession"),
    service.indexOf("async function transferPracticeCredit")
  );
  assert.match(start, /unlimitedPractice:\s*true/);
  assert.match(start, /weeklyLimitApplied:\s*false/);
  assert.doesNotMatch(start, /practice\/no-credits/);
});

test("Practice starts consume no weekly credits", () => {
  const start = service.slice(
    service.indexOf("async function startPracticeSession"),
    service.indexOf("async function transferPracticeCredit")
  );
  assert.match(start, /creditConsumed:\s*false/);
  assert.doesNotMatch(start, /creditsConsumed:\s*nextConsumed/);
});

test("cross-club tester access requires explicit permission", () => {
  assert.match(
    service,
    /platformTester\.bypassClubRoleRequirement\s*===\s*true/
  );
});

test("tester sessions retain the normal authoritative production duration", () => {
  assert.match(
    service,
    /const sessionDurationSeconds\s*=\s*PRACTICE_DURATION_SECONDS/
  );
  assert.match(
    service,
    /serverNow\.getTime\(\)\s*\+\s*sessionDurationSeconds\s*\*\s*1000/
  );
  assert.match(service, /testerOverrideUsed:\s*isPlatformTester/);
});

test("tester session records retain their audit identity", () => {
  const start = service.slice(
    service.indexOf("async function startPracticeSession"),
    service.indexOf("async function transferPracticeCredit")
  );
  assert.match(start, /testerOverrideUsed:\s*isPlatformTester/);
  assert.match(start, /testerOverrideExpiresAt/);
  assert.match(start, /userId:\s*uid/);
  assert.match(start, /startedAt/);
});

test("endpoint exposes informational tester state", () => {
  assert.match(
    functionsIndex,
    /testerOverrideUsed:\s*session\.testerOverrideUsed\s*===\s*true/
  );
});
