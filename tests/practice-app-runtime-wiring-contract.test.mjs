import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/App.jsx", "utf8");

test("App imports Practice v2 runtime", () => {
  assert.match(
    source,
    /import\s*\{\s*createPracticeRuntime\s*\}\s*from\s*["']\.\/core\/practiceRuntime\.js["']/
  );
});

test("App stores authoritative Practice runtime", () => {
  assert.match(
    source,
    /\[practiceRuntime,\s*setPracticeRuntime\]/
  );
});

test("Practice selector starts authoritative runtime", () => {
  assert.match(
    source,
    /await createPracticeRuntime\(\{\s*clubId:\s*activeClubId/
  );
});

test("central Practice save receives explicit DataScope", () => {
  assert.match(
    source,
    /saveStateV2\(\s*safe,\s*footballStateClubId,\s*footballDataScope\s*\)/
  );
});

test("central Practice subscription receives explicit DataScope", () => {
  assert.match(
    source,
    /subscribeToStateV2\([\s\S]*?footballStateClubId,\s*footballDataScope\s*\)/
  );
});

test("central football persistence keeps real club identity", () => {
  assert.match(
    source,
    /const footballStateClubId = activeClubId/
  );
});


test("Official selector clears Practice runtime", () => {
  assert.match(
    source,
    /setPracticeRuntime\(null\);\s*setSessionMode\("official"\)/
  );
});

test("page boundaries no longer use synthetic Practice club identity", () => {
  assert.doesNotMatch(
    source,
    /activeClubId=\{sessionScopedClubId\}/
  );
  assert.doesNotMatch(
    source,
    /sessionScopedClubId/
  );
});
