import test from "node:test";
import assert from "node:assert/strict";
import {clubFixtureHighlightMatchId, fieldHighlightMatchId, clipBelongsToLiveFixture} from "../src/core/liveFixtureClips.mjs";
import {fieldSpectatorView} from "../src/core/fieldSpectatorView.mjs";

test("Field highlights use the exact venue, season and fixture even when two matches share clubs", () => {
  const matchId = fieldHighlightMatchId("wynberg", "season-1", "fixture-2");
  const scope = {matchId, venueId: "wynberg", seasonId: "season-1", fixtureId: "fixture-2"};
  assert.equal(matchId, "venue__wynberg__season-1__fixture-2");
  assert.equal(fieldHighlightMatchId("wynberg", "", "fixture-2"), "");
  assert.equal(clipBelongsToLiveFixture({matchId, fixtureId: "fixture-2"}, scope), true);
  assert.equal(clipBelongsToLiveFixture({matchContext: {fixtureId: matchId}}, scope), true);
  assert.equal(clipBelongsToLiveFixture({matchContext: {fixtureId: "fixture-1"}}, scope), false);
  assert.equal(clipBelongsToLiveFixture({matchId, seasonId: "season-2"}, scope), false);
  assert.equal(clipBelongsToLiveFixture({matchId, status: "rejected"}, scope), false);
});

test("Friendly clips need a linked capture or a matching match number and capture time", () => {
  const match = {gameFormat: "5_V_5", matchNumber: 1, teamAId: "a", teamBId: "b",
    startedAtISO: "2026-11-07T10:15:00Z", completedAtISO: "2026-11-07T10:20:00Z",
    isFinished: true, events: [{captureRequestId: "this-match-goal"}]};
  const matchId = clubFixtureHighlightMatchId(match);
  const scope = {matchId, match};
  assert.equal(matchId, "friendly__5v5__2026-11-07");
  assert.equal(clipBelongsToLiveFixture({captureRequestId: "this-match-goal"}, scope), true);
  assert.equal(clipBelongsToLiveFixture({captureRequestId: "earlier-match-goal"}, scope), false);
  assert.equal(clipBelongsToLiveFixture({matchNo: 1, capturedAtISO: "2026-11-07T10:16:00Z"}, scope), true);
  assert.equal(clipBelongsToLiveFixture({matchNo: 1, capturedAtISO: "2026-11-07T10:06:00Z"}, scope), false);
  assert.equal(clipBelongsToLiveFixture({matchNo: 2, capturedAtISO: "2026-11-07T10:16:00Z"}, scope), false);
  assert.equal(clipBelongsToLiveFixture({matchNo: 1, createdAtISO: "2026-11-07T10:16:00Z"}, scope), false);
  assert.equal(clipBelongsToLiveFixture({matchNo: 1, teamId: "other", capturedAtISO: "2026-11-07T10:16:00Z"}, scope), false);
});

test("Club Mini-League derives the bucket from the match on screen rather than the upcoming rotation", () => {
  const match = {matchNumber: 2, teamAId: "b", teamBId: "a"};
  const matchId = clubFixtureHighlightMatchId(match, "season-1");
  assert.equal(matchId, "league__season-1__match_2__b_vs_a");
  assert.equal(clipBelongsToLiveFixture({matchNo: 2}, {matchId, match}), true);
  assert.equal(clipBelongsToLiveFixture({matchNo: 3}, {matchId, match}), false);
});

test("tapping a Field notification for an earlier match never shows a different live match", () => {
  const live = {fixtureId: "new", status: "live"};
  const result = {fixtureId: "earlier", status: "completed"};
  assert.deepEqual(fieldSpectatorView({season: {results: [result]}, live, requestedFixtureId: "earlier"}), {kind: "result", match: result});
  assert.deepEqual(fieldSpectatorView({live: result, requestedFixtureId: "earlier"}), {kind: "result", match: result});
  assert.deepEqual(fieldSpectatorView({live, requestedFixtureId: "unknown"}), {kind: "empty", match: null});
});
