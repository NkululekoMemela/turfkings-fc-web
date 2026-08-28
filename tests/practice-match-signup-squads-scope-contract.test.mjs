import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const signup = fs.readFileSync(
  "src/pages/MatchSignupPage.jsx",
  "utf8"
);
const squads = fs.readFileSync(
  "src/pages/SquadsPage.jsx",
  "utf8"
);
const app = fs.readFileSync(
  "src/App.jsx",
  "utf8"
);

test("Match Signup imports scoped signup helpers", () => {
  assert.match(signup, /getScopedPendingSignupsCollection/);
  assert.match(signup, /getScopedPendingSignupDoc/);
  assert.match(signup, /getScopedMatchSignupsCollection/);
  assert.match(signup, /getScopedMatchSignupDoc/);
});

test("Match Signup routes pending signup collection by Practice mode", () => {
  assert.match(
    signup,
    /isPracticeMode[\s\S]*?getScopedPendingSignupsCollection\(db,\s*dataScope\)/
  );
});

test("Match Signup routes match signup collection by Practice mode", () => {
  assert.match(
    signup,
    /isPracticeMode[\s\S]*?getScopedMatchSignupsCollection\(db,\s*dataScope\)/
  );
});

test("Match Signup routes signup documents by Practice mode", () => {
  assert.match(
    signup,
    /getScopedPendingSignupDoc\(db,\s*docId,\s*dataScope\)/
  );
  assert.match(
    signup,
    /getScopedMatchSignupDoc\(db,\s*docId,\s*dataScope\)/
  );
});

test("Squads receives explicit DataScope", () => {
  const block =
    app.match(/<SquadsPage[\s\S]*?\/>/)?.[0] || "";

  assert.match(block, /dataScope=\{footballDataScope\}/);
});

test("Squads reads Practice pending signups through DataScope", () => {
  assert.match(
    squads,
    /getScopedPendingSignupsCollection\(db,\s*dataScope\)/
  );
});

test("Squads reads Practice paid signups through DataScope", () => {
  assert.match(
    squads,
    /getScopedMatchSignupsCollection\(db,\s*dataScope\)/
  );
});

test("Practice Squads no longer auto-pays entire roster", () => {
  assert.doesNotMatch(
    squads,
    /paymentStatus:\s*"practice"/
  );
});

test("Practice Squads still derives paid players from paidWeeks", () => {
  assert.match(
    squads,
    /paidWeeks\.includes\(nextTeamsheetWeekId\)/
  );
  assert.match(
    squads,
    /paymentStatus:\s*"paid"/
  );
});

test("Official pending signup resolver retains legacy club collection", () => {
  assert.match(
    signup,
    /const pendingSignupsCollectionRef = \(\) =>[\s\S]*?: getPendingSignupsCollection\(db,\s*activeClubId\)/
  );
});

test("Official match signup resolver retains legacy club collection", () => {
  assert.match(
    signup,
    /const matchSignupsCollectionRef = \(\) =>[\s\S]*?: getMatchSignupsCollection\(db,\s*activeClubId\)/
  );
});

test("signup collection resolvers cannot recursively call themselves", () => {
  const pendingBlock =
    signup.match(
      /const pendingSignupsCollectionRef = \(\) =>[\s\S]*?;/
    )?.[0] || "";

  const matchBlock =
    signup.match(
      /const matchSignupsCollectionRef = \(\) =>[\s\S]*?;/
    )?.[0] || "";

  assert.doesNotMatch(
    pendingBlock,
    /:\s*pendingSignupsCollectionRef\(\)/
  );

  assert.doesNotMatch(
    matchBlock,
    /:\s*matchSignupsCollectionRef\(\)/
  );
});
