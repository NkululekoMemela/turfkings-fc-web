const test = require("node:test");
const assert = require("node:assert/strict");
const {project} = require("../functions/fieldMatchDaySquad");

const scope = {venueId: "field", seasonId: "season", clubId: "club"};
const day = {id: "day", dateLocal: "2026-10-10"};
const fixture = {id: "fixture", scheduledLocal: "2026-10-10T18:00:00"};
const candidates = Array.from({length: 7}, (_, index) => ({
  memberId: `member${index}`,
  sourcePlayerId: `player${index}`,
  fullName: `Player ${index}`,
  mentality: index % 5 + 1,
  shooting: 5 - index % 5,
}));

function submission(ids) {
  const args = {scope, day, fixture, candidates};
  const draft = project(args);
  return project({...args, saved: {
    memberIds: ids, fingerprint: draft.fingerprint, submittedAtMs: 1,
  }});
}

test("Five and six players can be confirmed with their Club behaviour values", () => {
  for (const count of [5, 6]) {
    const result = submission(candidates.slice(0, count).map(p => p.memberId));
    assert.equal(result.confirmed, true);
    assert.equal(result.players.length, count);
    assert.equal(result.players[0].mentality, candidates[0].mentality);
    assert.equal(result.players[0].shooting, candidates[0].shooting);
  }
});

test("Four, seven, duplicate and unknown selections cannot be confirmed", () => {
  for (const ids of [
    candidates.slice(0, 4).map(p => p.memberId),
    candidates.map(p => p.memberId),
    ["member0", "member1", "member2", "member3", "member3"],
    ["member0", "member1", "member2", "member3", "unknown"],
  ]) {
    assert.equal(submission(ids).confirmed, false);
  }
});

test("Changed squad eligibility invalidates a previous confirmation", () => {
  const args = {scope, day, fixture, candidates};
  const previous = project(args);
  const result = project({...args,
    candidates: candidates.slice(1),
    saved: {
      memberIds: candidates.slice(0, 5).map(p => p.memberId),
      fingerprint: previous.fingerprint, submittedAtMs: 1,
    },
  });
  assert.equal(result.confirmed, false);
});
