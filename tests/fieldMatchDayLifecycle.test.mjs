import {test} from "node:test";
import assert from "node:assert/strict";
import {
  matchDayReviewTiming, evaluateMatchDayReview,
} from "../functions/fieldMatchDayLifecycle.mjs";

const readyAtMs = Date.parse("2026-10-03T21:00:00+02:00");
const season = () => ({
  scheduleVersion: 1,
  matchDays: [{
    id: "day-one", dateLocal: "2026-10-03", fixtureIds: ["fixture-one"],
  }],
  fixtures: [{
    id: "fixture-one", matchDayId: "day-one",
    clubAId: "a", clubBId: "b", status: "completed",
  }],
  results: [{
    fixtureId: "fixture-one", status: "completed", matchNo: 1,
  }],
  liveMatches: {}, matchDayHistory: [], allEvents: [],
});
const evaluate = (now, review = null, value = season()) =>
  evaluateMatchDayReview({season: value, matchDayId: "day-one", review, now});

test("reminder is two hours later and closure is 23:59 SAST", () => {
  const timing = matchDayReviewTiming(readyAtMs);
  assert.equal(timing.reminderAtMs, Date.parse("2026-10-03T23:00:00+02:00"));
  assert.equal(timing.autoCloseAtMs, Date.parse("2026-10-03T23:59:00+02:00"));
});

test("completion requests an initial notification", () => {
  const result = evaluate(readyAtMs);
  assert.equal(result.notify, true);
  assert.equal(result.remind, false);
  assert.equal(result.close, false);
});

test("two-hour reminder is sent only once", () => {
  const now = readyAtMs + 7200000;
  const review = {readyAtMs, initialSentAtMs: readyAtMs};
  assert.equal(evaluate(now, review).remind, true);
  assert.equal(evaluate(now, {...review, reminderSentAtMs: now}).remind, false);
});

test("23:59 closes the day and suppresses further reminders", () => {
  const now = Date.parse("2026-10-03T23:59:00+02:00");
  const result = evaluate(now, {readyAtMs, initialSentAtMs: readyAtMs});
  assert.equal(result.close, true);
  assert.equal(result.remind, false);
});

test("unfinished and archived days never close automatically", () => {
  const value = season();
  value.fixtures[0].status = "scheduled";
  assert.equal(evaluate(readyAtMs, null, value).ready, false);
  value.fixtures[0].status = "completed";
  value.matchDayHistory.push({scheduledMatchDayId: "day-one"});
  assert.equal(evaluate(readyAtMs, null, value).ready, false);
});

test("early testing uses the actual completion night's cutoff", () => {
  const value = season();
  value.matchDays[0].dateLocal = "2026-12-01";
  const result = evaluate(readyAtMs, null, value);
  assert.equal(result.autoCloseAtMs, Date.parse("2026-10-03T23:59:00+02:00"));
});

test("completion after the cutoff closes immediately", () => {
  const now = Date.parse("2026-10-03T23:59:30+02:00");
  assert.equal(evaluate(now).close, true);
});
