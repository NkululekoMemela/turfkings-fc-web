import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createPracticeDataScope,
  dataScopeDocPath,
} from "../src/core/dataScope.js";

test("Practice attendance resolves only beneath the active Practice session", () => {
  const scope = createPracticeDataScope({
    clubId: "misfits-fc",
    practiceSessionId: "practice-session-123",
  });

  const path = dataScopeDocPath(
    "attendance",
    "2026-08-16__player-7",
    scope
  );

  assert.equal(
    path,
    "sandboxes/practice/clubs/misfits-fc/sessions/practice-session-123/attendance/2026-08-16__player-7"
  );

  assert.ok(
    path.startsWith(
      "sandboxes/practice/clubs/misfits-fc/sessions/practice-session-123/"
    )
  );

  assert.ok(!path.startsWith("seasons/"));
  assert.ok(!path.startsWith("clubs/"));
});

test("App keeps Official attendance path unchanged and branches Practice through DataScope", () => {
  const source = fs.readFileSync(
    new URL("../src/App.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /const attendanceRef = isPracticeDataScope\(dataScope\)/
  );

  assert.match(
    source,
    /dataScopeDocPath\(\s*"attendance",\s*attendanceDocId,\s*dataScope\s*\)/
  );

  // Existing Official attendance destination must remain intact.
  assert.match(
    source,
    /doc\(\s*db,\s*"seasons",\s*safeSeasonId,\s*"attendance",\s*attendanceDocId\s*\)/
  );

  // End Match Day must supply the active football scope.
  assert.match(
    source,
    /saveParticipationForMatchDay\(\{[\s\S]*?dataScope:\s*footballDataScope,[\s\S]*?\}\)/
  );
});
