import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const payment = fs.readFileSync(
  "src/pages/PaymentPage.jsx",
  "utf8"
);

test("Practice admin verification has its own sandbox branch", () => {
  const start = payment.indexOf(
    "async function verifyPayment()"
  );
  assert.ok(start >= 0);

  const block = payment.slice(start, start + 7000);

  assert.match(
    block,
    /if\s*\(isPracticeMode\)/
  );
});

test("Practice Paid confirmation marks primary selected weeks paid", () => {
  assert.match(
    payment,
    /nextStatus === "paid"[\s\S]*?uniqueWeeks\(effectivePrimaryWeeks\)/
  );

  assert.match(
    payment,
    /primaryPaidWeeks:\s*confirmedPrimaryPaidWeeks/
  );

  assert.match(
    payment,
    /paidWeeks:\s*confirmedPrimaryPaidWeeks/
  );
});

test("Practice Paid confirmation marks second player selected weeks paid", () => {
  assert.match(
    payment,
    /nextStatus === "paid"[\s\S]*?uniqueWeeks\(effectiveSecondWeeks\)/
  );

  assert.match(
    payment,
    /secondPaidWeeks:\s*confirmedSecondPaidWeeks/
  );
});

test("Practice part-paid preserves existing paid-week allocation", () => {
  assert.match(
    payment,
    /:\s*uniqueWeeks\(effectivePrimaryPaidWeeks\)/
  );

  assert.match(
    payment,
    /:\s*uniqueWeeks\(effectiveSecondPaidWeeks\)/
  );
});

test("Practice admin verification is explicitly non-financial", () => {
  assert.match(
    payment,
    /paymentMethod:\s*"Practice simulation"/
  );

  assert.match(
    payment,
    /paymentSimulation:\s*true/
  );

  assert.match(
    payment,
    /paymentProviderContacted:\s*false/
  );
});

test("Official admin verification still writes verified amount and status", () => {
  const start = payment.indexOf(
    "async function verifyPayment()"
  );
  const block = payment.slice(start, start + 8000);

  assert.match(
    block,
    /amountPaid:\s*verifiedAmount/
  );

  assert.match(
    block,
    /paymentStatus:\s*nextStatus/
  );
});

test("admin verification uses canonical scoped signup reference", () => {
  assert.match(
    payment,
    /const ref = matchSignupDocRef\(signupDocId\)/
  );
});
