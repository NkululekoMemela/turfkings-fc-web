import test from "node:test";
import assert from "node:assert/strict";
import {clubHighlightFixtureOptions, groupHighlightFixtures, partitionMatchHighlights,
  UNASSIGNED_HIGHLIGHT_FIXTURE} from "../src/core/highlightFixtures.mjs";

const clip = (id, metadata = {}) => ({id, mediaUrl: `https://example.test/${id}.mp4`, status: "approved", ...metadata});
const now = "2026-11-09T00:30:00+02:00";

test("The South African match week uses fixture dates, even when old clips are uploaded on Monday", () => {
  const recent = clip("today", {matchId: "fresh", createdAtISO: now});
  const old = clip("old", {matchId: "older", createdAtISO: now});
  const undated = clip("legacy", {createdAtISO: now});
  const future = clip("future", {matchId: "future", matchDateISO: "2026-11-10"});
  const {current, throwbacks} = partitionMatchHighlights([recent, old, undated, future], [], {now,
    fixtures: [{matchId:"fresh", date:"2026-11-08T22:10:00Z"}, {matchId:"older", date:"2026-11-08T19:30"}],
  });
  assert.deepEqual(current.map(c => c.id), ["today"]);
  assert.deepEqual(throwbacks.map(c => c.id), ["old", "legacy", "future"]);
  assert.deepEqual(groupHighlightFixtures(throwbacks, UNASSIGNED_HIGHLIGHT_FIXTURE, UNASSIGNED_HIGHLIGHT_FIXTURE).map(c => c.id), ["legacy"]);
  assert.ok(throwbacks.every(c => c.votingLocked));
});

test("Throwbacks retain pending, rejected and saved memories for moderation, but exclude winners and deleted clips", () => {
  const raw = [
    clip("pending", {matchId:"m",status:"pending"}),
    clip("rejected", {matchId:"m",status:"rejected"}),
    clip("winner", {matchId:"m"}),
    clip("gone", {matchId:"m",deleted:true}),
  ];
  const archives = [
    clip("winner",{matchId:"m", archivedClubFeed:true}),
    clip("memory",{matchId:"m", archivedClubFeed:true,isThrowback:true}),
  ];
  const {throwbacks} = partitionMatchHighlights(raw, archives, {now});
  assert.deepEqual(throwbacks.map(c => c.id), ["pending","rejected","memory"]);
});

test("Two friendlies on the same day keep separate scores and crests, including a nil score", () => {
  const first = "friendly__5v5__2026-11-09__111__1";
  const second = "friendly__5v5__2026-11-09__222__2";
  const clips = [clip("x",{matchId:first}), clip("y",{matchId:second})];
  const scores = [{id:first, date:"2026-11-09", goalsA:2,goalsB:0,label:"France vs Brazil",teamALogoUrl:"/a.svg",teamBLogoUrl:"/b.svg"},
    {id:second,date:"2026-11-09",goalsA:1,goalsB:4,label:"France vs Brazil"}];
  const folders = clubHighlightFixtureOptions(clips, [], () => "", "", scores);
  assert.equal(folders.length, 2);
  const [a,b] = [first,second].map(id => folders.find(folder => folder.matchId === id));
  assert.deepEqual([a.goalsA,a.goalsB,a.teamALogoUrl,a.teamBLogoUrl],[2,0,"/a.svg","/b.svg"]);
  assert.deepEqual([b.goalsA,b.goalsB],[1,4]);
  assert.deepEqual(groupHighlightFixtures(clips,first),[clips[0]]);
});
