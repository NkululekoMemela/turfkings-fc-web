import {test} from "node:test";
import assert from "node:assert/strict";
import {
  tickFieldMatchClock, startFieldSecondHalf, fieldHalfSecondsLeft,
} from "../src/core/fieldMatchClock.js";

const state = () => ({
  status: "live", clockVersion: 1, clockPhase: "first_half",
  matchSeconds: 2400, secondsLeft: 2400, halftimeSeconds: 300,
  running: true, timeUp: false,
});

test("the first half displays twenty minutes", () => {
  assert.equal(fieldHalfSecondsLeft(state()), 1200);
});
test("first-half completion stops play and begins a five-minute break", () => {
  const result = tickFieldMatchClock({...state(), secondsLeft: 1201}, 1000);
  assert.equal(result.secondsLeft, 1200);
  assert.equal(result.clockPhase, "halftime");
  assert.equal(result.running, false);
  assert.equal(result.timeUp, false);
  assert.equal(result.halftimeEndsAtMs, 301000);
});
test("halftime does not consume playing time", () => {
  const value = tickFieldMatchClock({...state(), secondsLeft: 1201}, 1000);
  assert.deepEqual(tickFieldMatchClock(value, 200000), value);
});
test("second-half kickoff requires the full break and explicit action", () => {
  const value = tickFieldMatchClock({...state(), secondsLeft: 1201}, 1000);
  assert.throws(() => startFieldSecondHalf(value, 300999), /Wait/);
  const patch = startFieldSecondHalf(value, 301000);
  assert.equal(patch.clockPhase, "second_half");
  assert.equal(patch.secondsLeft, 1200);
  assert.equal(patch.running, true);
});
test("only the second-half endpoint marks full time", () => {
  const result = tickFieldMatchClock({
    ...state(), clockPhase: "second_half", secondsLeft: 1,
  });
  assert.equal(result.clockPhase, "full_time");
  assert.equal(result.timeUp, true);
  assert.equal(result.running, false);
});
test("paused and completed games do not tick", () => {
  const value = {...state(), running: false};
  assert.deepEqual(tickFieldMatchClock(value), value);
  const completed = {...state(), status: "completed"};
  assert.deepEqual(tickFieldMatchClock(completed), completed);
});

test("halftime displays zero remaining first-half playing time", () => {
  assert.equal(fieldHalfSecondsLeft({
    ...state(), clockPhase: "halftime", secondsLeft: 1200,
  }), 0);
});
