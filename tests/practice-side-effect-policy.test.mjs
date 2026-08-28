import test from "node:test";
import assert from "node:assert/strict";

import {
  PRACTICE_EFFECT,
  PRACTICE_EFFECT_DECISION,
  getPracticeEffectDecision,
  canReadOfficialInput,
  canWriteFootballState,
  canMutateOfficialData,
  canTriggerExternalEffect,
  shouldSimulateExternalEffect,
  assertOfficialMutationAllowed,
  assertFootballStateWriteAllowed,
} from "../src/core/practiceSideEffectPolicy.js";

test("Practice may read real Official inputs", () => {
  assert.equal(
    canReadOfficialInput("practice"),
    true
  );
});

test("Practice may write disposable football state", () => {
  assert.equal(
    canWriteFootballState("practice"),
    true
  );
});

test("Practice cannot mutate Official data", () => {
  assert.equal(
    canMutateOfficialData("practice"),
    false
  );
});

test("Practice cannot trigger real external effects", () => {
  assert.equal(
    canTriggerExternalEffect("practice"),
    false
  );
});

test("Practice external effects are classified for simulation", () => {
  assert.equal(
    shouldSimulateExternalEffect("practice"),
    true
  );

  assert.equal(
    getPracticeEffectDecision({
      environment: "practice",
      effect: PRACTICE_EFFECT.EXTERNAL_EFFECT,
    }),
    PRACTICE_EFFECT_DECISION.SIMULATE
  );
});

test("Practice Official mutations fail closed", () => {
  assert.throws(
    () => assertOfficialMutationAllowed("practice"),
    /SAFETY BLOCK/
  );
});

test("Practice sandbox football writes pass policy", () => {
  assert.equal(
    assertFootballStateWriteAllowed("practice"),
    true
  );
});

test("Official mode retains normal Official mutation capability", () => {
  assert.equal(
    canMutateOfficialData("official"),
    true
  );

  assert.equal(
    assertOfficialMutationAllowed("official"),
    true
  );
});

test("Official mode retains real external effects", () => {
  assert.equal(
    canTriggerExternalEffect("official"),
    true
  );

  assert.equal(
    shouldSimulateExternalEffect("official"),
    false
  );
});

test("unknown environment fails closed", () => {
  assert.throws(
    () => canReadOfficialInput("mystery"),
    /Unsupported environment/
  );
});

test("unknown effect fails closed", () => {
  assert.throws(
    () =>
      getPracticeEffectDecision({
        environment: "practice",
        effect: "guess_this_effect",
      }),
    /Unsupported effect/
  );
});
