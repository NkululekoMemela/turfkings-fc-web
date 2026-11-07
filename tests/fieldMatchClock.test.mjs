import {test} from "node:test";
import assert from "node:assert/strict";
import {
  tickFieldMatchClock, startFieldSecondHalf, fieldHalfSecondsLeft, fieldMatchProgress,
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
test("the referee can start the second half before the break ends", () => {
  const value = tickFieldMatchClock({...state(), secondsLeft: 1201}, 1000);
  assert.ok(value.halftimeEndsAtMs > 1000);
  assert.throws(() => startFieldSecondHalf(state()), /not at halftime/);
  const patch = startFieldSecondHalf(value);
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

test("match progress pauses at half-time and includes added playing time", () => {
  assert.equal(fieldMatchProgress({matchSeconds: 1200, secondsLeft: 600}), 50);
  assert.equal(fieldMatchProgress({matchSeconds: 1200, secondsLeft: 0, additionalSeconds: 120, additionalSecondsLeft: 60}), 95.45454545454545);
  assert.equal(fieldMatchProgress({matchSeconds: 1200, secondsLeft: 0, additionalSeconds: 120}), 100);
});
