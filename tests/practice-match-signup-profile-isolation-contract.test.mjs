import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../src/pages/MatchSignupPage.jsx", import.meta.url),
  "utf8"
);

test("Practice does not prompt for permanent WhatsApp profile completion", () => {
  assert.match(
    source,
    /if\s*\(\s*!isPracticeMode\s*&&\s*!savedNumber\s*&&\s*!skipWhatsAppPromptThisSession\s*\)\s*\{\s*setShowWhatsAppPrompt\(true\)/
  );
});

test("Practice hard-stops before the Official WhatsApp profile write", () => {
  const handlerStart = source.indexOf(
    "async function handleSaveWhatsAppNumber()"
  );

  assert.notEqual(handlerStart, -1);

  const handler = source.slice(handlerStart, handlerStart + 1800);

  const practiceGuard = handler.indexOf("if (isPracticeMode)");
  const officialWrite = handler.indexOf("await setDoc(");

  assert.ok(practiceGuard >= 0);
  assert.ok(officialWrite >= 0);
  assert.ok(
    practiceGuard < officialWrite,
    "Practice guard must execute before the Official profile setDoc"
  );

  assert.match(
    handler,
    /if\s*\(isPracticeMode\)\s*\{[\s\S]*?return;[\s\S]*?\}/
  );
});

test("Official profile destination remains the existing real club profile", () => {
  assert.match(
    source,
    /getClubDoc\(\s*db,\s*profileTarget\.collection,\s*profileTarget\.id,\s*activeClubId\s*\)/
  );
});

test("Profile-loading effect reacts when Practice mode changes", () => {
  assert.match(
    source,
    /payerUserId,[\s\S]*?phoneNumber,[\s\S]*?skipWhatsAppPromptThisSession,[\s\S]*?isPracticeMode,[\s\S]*?\]\);/
  );
});
