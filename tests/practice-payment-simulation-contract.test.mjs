import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const payment = fs.readFileSync("src/pages/PaymentPage.jsx", "utf8");

test("Practice can enter Match Signup instead of being blocked", () => {
  const block =
    app.match(
      /const handleGoToMatchSignup = \(\) => \{[\s\S]*?setPage\(PAGE_MATCH_SIGNUP\);[\s\S]*?\};/
    )?.[0] || "";

  assert.doesNotMatch(
    block,
    /Payments are for Official Sessions/
  );

  assert.match(block, /setPage\(PAGE_MATCH_SIGNUP\)/);
});

test("Payment uses scoped Practice match signup document", () => {
  assert.match(
    payment,
    /isPracticeMode[\s\S]*?getScopedMatchSignupDoc\(db,\s*docId,\s*dataScope\)/
  );
});

test("Official Payment retains historical match signup document", () => {
  assert.match(
    payment,
    /getClubDoc\([\s\S]*?CLUB_COLLECTIONS\.matchSignups[\s\S]*?docId[\s\S]*?activeClubId/
  );
});

test("Practice simulation exists before functions URL resolution", () => {
  const practiceIndex = payment.indexOf("if (isPracticeMode) {");
  const functionsIndex = payment.indexOf(
    "const functionsBaseUrl = getFunctionsBaseUrl();"
  );

  assert.ok(practiceIndex >= 0);
  assert.ok(functionsIndex >= 0);
  assert.ok(
    practiceIndex < functionsIndex,
    "Practice must branch before external payment infrastructure."
  );
});

test("Practice simulation never redirects to Paystack", () => {
  const start = payment.indexOf(
    "// PRACTICE PAYMENT SIMULATION"
  );
  const end = payment.indexOf(
    "const functionsBaseUrl = getFunctionsBaseUrl();",
    start
  );

  assert.ok(start >= 0 && end > start);

  const block = payment.slice(start, end);

  assert.doesNotMatch(block, /createPaystackCheckout/);
  assert.doesNotMatch(block, /postJson\(/);
  assert.doesNotMatch(block, /window\.location\.assign/);
  assert.match(block, /paymentProviderContacted:\s*false/);
});

test("Practice simulation records primary paid weeks", () => {
  assert.match(
    payment,
    /primaryPaidWeeks:\s*simulatedPrimaryPaidWeeks/
  );
  assert.match(
    payment,
    /paidWeeks:\s*simulatedPrimaryPaidWeeks/
  );
});

test("Practice simulation records second-player paid weeks", () => {
  assert.match(
    payment,
    /secondPaidWeeks:\s*simulatedSecondPaidWeeks/
  );
});

test("Practice simulation is explicitly marked non-financial", () => {
  assert.match(
    payment,
    /paymentMethod:\s*"Practice simulation"/
  );
  assert.match(
    payment,
    /paymentSimulation:\s*true/
  );
});

test("Official Paystack checkout remains present", () => {
  assert.match(
    payment,
    /createPaystackCheckout/
  );
  assert.match(
    payment,
    /window\.location\.assign\(redirectUrl\)/
  );
});

test("Payment subscription follows Practice session changes", () => {
  assert.match(
    payment,
    /\[\s*signupDocId,\s*activeClubId,\s*isPracticeMode,\s*practiceSessionId,\s*dataScope,\s*\]/
  );
});
