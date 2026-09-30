import test from "node:test";
import assert from "node:assert/strict";

import {
  createOfficialVenueLeagueScope,
  createPracticeVenueLeagueScope,
  normalizeVenueLeagueScope,
  venueLeagueRootPath,
  venueLeagueCollectionPath,
  venueLeagueDocPath,
  venueLeagueSeasonPath,
  venueLeagueSeasonCollectionPath,
  venueLeagueSeasonDocPath,
  assertVenueLeaguePathInScope,
} from "../src/core/venueLeaguePaths.js";

const official = createOfficialVenueLeagueScope({
  venueId: "clarendon-complex",
  seasonId: "season-1",
});

const practice = createPracticeVenueLeagueScope({
  venueId: "clarendon-complex",
  seasonId: "practice-season",
  practiceSessionId: "session-1",
});

test("creates explicit Official Venue League scope", () => {
  assert.deepEqual(official, {
    kind: "venueLeague",
    environment: "official",
    venueId: "clarendon-complex",
    seasonId: "season-1",
    practiceSessionId: "",
  });
});

test("creates explicit Practice Venue League scope", () => {
  assert.deepEqual(practice, {
    kind: "venueLeague",
    environment: "practice",
    venueId: "clarendon-complex",
    seasonId: "practice-season",
    practiceSessionId: "session-1",
  });
});

test("Official paths stay beneath leagueVenues", () => {
  assert.equal(
    venueLeagueRootPath(official),
    "leagueVenues/clarendon-complex"
  );

  assert.equal(
    venueLeagueSeasonDocPath(
      "matches",
      "fixture-1",
      official
    ),
    "leagueVenues/clarendon-complex/seasons/season-1/matches/fixture-1"
  );
});

test("Practice paths stay beneath their session sandbox", () => {
  assert.equal(
    venueLeagueRootPath(practice),
    "sandboxes/practice/leagueVenues/clarendon-complex/sessions/session-1"
  );

  assert.equal(
    venueLeagueSeasonDocPath(
      "matches",
      "fixture-1",
      practice
    ),
    "sandboxes/practice/leagueVenues/clarendon-complex/sessions/session-1/seasons/practice-season/matches/fixture-1"
  );
});

test("builds root and season collections", () => {
  assert.equal(
    venueLeagueCollectionPath("news", official),
    "leagueVenues/clarendon-complex/news"
  );

  assert.equal(
    venueLeagueDocPath("news", "welcome", official),
    "leagueVenues/clarendon-complex/news/welcome"
  );

  assert.equal(
    venueLeagueSeasonPath(official),
    "leagueVenues/clarendon-complex/seasons/season-1"
  );

  assert.equal(
    venueLeagueSeasonCollectionPath(
      "matches",
      practice
    ),
    "sandboxes/practice/leagueVenues/clarendon-complex/sessions/session-1/seasons/practice-season/matches"
  );
});

test("rejects Club scopes", () => {
  assert.throws(
    () => normalizeVenueLeagueScope({
      kind: "official",
      clubId: "turf-kings",
    }),
    /Explicit Venue League scope required/
  );
});

test("requires an explicit environment", () => {
  assert.throws(
    () => normalizeVenueLeagueScope({
      kind: "venueLeague",
      venueId: "clarendon-complex",
    }),
    /environment must be explicitly/
  );
});

test("Practice requires a session ID", () => {
  assert.throws(
    () => createPracticeVenueLeagueScope({
      venueId: "clarendon-complex",
    }),
    /practiceSessionId is required/
  );
});

test("Official paths cannot enter Practice", () => {
  assert.throws(
    () => assertVenueLeaguePathInScope(
      "sandboxes/practice/leagueVenues/clarendon-complex",
      official
    ),
    /escaped its Venue League scope/
  );
});

test("Practice paths cannot enter Official data", () => {
  assert.throws(
    () => assertVenueLeaguePathInScope(
      "leagueVenues/clarendon-complex/seasons/season-1",
      practice
    ),
    /escaped its Venue League scope/
  );
});

test("neither environment can fall back to Clubs", () => {
  for (const scope of [official, practice]) {
    const path = venueLeagueSeasonDocPath(
      "matches",
      "fixture-1",
      scope
    );

    assert.doesNotMatch(path, /^clubs\//);
    assert.doesNotMatch(path, /turf-kings/);
    assert.equal(
      assertVenueLeaguePathInScope(path, scope),
      path
    );
  }
});

test("identifiers cannot inject Firestore paths", () => {
  assert.throws(
    () => createOfficialVenueLeagueScope({
      venueId: "clubs/turf-kings",
    }),
    /cannot contain/
  );

  assert.throws(
    () => createPracticeVenueLeagueScope({
      venueId: "venue-1",
      practiceSessionId: "../official",
    }),
    /cannot contain/
  );
});
