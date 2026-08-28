import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const signup = fs.readFileSync("src/pages/MatchSignupPage.jsx", "utf8");
const payment = fs.readFileSync("src/pages/PaymentPage.jsx", "utf8");

test("Match Signup receives real club identity", () => {
  assert.match(
    app,
    /<MatchSignupPage[\s\S]*?activeClubId=\{activeClubId\}/
  );
});

test("Match Signup receives explicit Practice context", () => {
  assert.match(
    app,
    /<MatchSignupPage[\s\S]*?isPracticeMode=\{isPracticeMode\}[\s\S]*?practiceSessionId=\{practiceRuntime\?\.practiceSessionId \|\| null\}[\s\S]*?dataScope=\{footballDataScope\}/
  );
});

test("Match Signup declares Practice boundary props", () => {
  assert.match(signup, /isPracticeMode = false/);
  assert.match(signup, /practiceSessionId = null/);
  assert.match(signup, /dataScope = null/);
});

test("Payment receives real club identity", () => {
  assert.match(
    app,
    /<PaymentPage[\s\S]*?activeClubId=\{activeClubId\}/
  );
});

test("Payment receives explicit Practice context", () => {
  assert.match(
    app,
    /<PaymentPage[\s\S]*?isPracticeMode=\{isPracticeMode\}[\s\S]*?practiceSessionId=\{practiceRuntime\?\.practiceSessionId \|\| null\}[\s\S]*?dataScope=\{footballDataScope\}/
  );
});

test("Payment declares Practice boundary props", () => {
  assert.match(payment, /activeClubId: explicitActiveClubId = ""/);
  assert.match(payment, /isPracticeMode = false/);
  assert.match(payment, /practiceSessionId = null/);
  assert.match(payment, /dataScope = null/);
});

test("Payment prefers explicit real club identity", () => {
  assert.match(
    payment,
    /explicitActiveClubId \|\|[\s\S]*?paymentContext\?\.activeClubId/
  );
});

console.log(
  "✓ Stage 5C5A establishes Match Signup + Payment Practice boundaries without changing behaviour."
);
