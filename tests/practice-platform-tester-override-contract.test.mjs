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

test("ordinary users remain subject to weekly exhaustion", () => {
  assert.match(
    service,
    /!isPlatformTester\s*&&\s*availableBeforeStart\s*<=\s*0/
  );
});

test("tester does not consume ordinary weekly credits", () => {
  assert.match(
    service,
    /isPlatformTester\s*\?\s*consumed\s*:\s*consumed\s*\+\s*1/
  );
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

test("tester activity is separately auditable", () => {
  assert.match(service, /testerStartsThisWeek/);
  assert.match(service, /testerOverrideLastUsedAt/);
});

test("endpoint exposes informational tester state", () => {
  assert.match(
    functionsIndex,
    /testerOverrideUsed:\s*session\.testerOverrideUsed\s*===\s*true/
  );
});
