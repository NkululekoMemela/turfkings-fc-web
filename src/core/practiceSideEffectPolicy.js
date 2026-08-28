// src/core/practiceSideEffectPolicy.js
//
// Practice v2 side-effect safety boundary.
//
// PURPOSE:
// Practice must be able to use real Official club information as
// read-only input while preventing Practice activity from mutating
// Official operational data or triggering real external effects.
//
// This policy does NOT perform persistence itself.
// It classifies what a runtime is allowed to do.
//
// PRACTICE RULES:
//   Official read-only input       -> allowed
//   Practice sandbox football      -> allowed
//   Official mutation              -> blocked
//   External side effect           -> blocked / simulated by caller
//
// Official mode remains unrestricted by this Practice-specific policy.

export const PRACTICE_EFFECT = Object.freeze({
  OFFICIAL_INPUT_READ: "official_input_read",
  FOOTBALL_STATE_WRITE: "football_state_write",
  OFFICIAL_MUTATION: "official_mutation",
  EXTERNAL_EFFECT: "external_effect",
});

export const PRACTICE_EFFECT_DECISION = Object.freeze({
  ALLOW: "allow",
  BLOCK: "block",
  SIMULATE: "simulate",
});

function normalizeEnvironment(value = "") {
  const environment = String(value || "").trim().toLowerCase();

  if (environment === "official" || environment === "practice") {
    return environment;
  }

  throw new Error(
    `[PracticeSideEffectPolicy] Unsupported environment: ${String(value)}`
  );
}

function normalizeEffect(value = "") {
  const effect = String(value || "").trim();

  if (!Object.values(PRACTICE_EFFECT).includes(effect)) {
    throw new Error(
      `[PracticeSideEffectPolicy] Unsupported effect: ${String(value)}`
    );
  }

  return effect;
}

export function getPracticeEffectDecision({
  environment,
  effect,
} = {}) {
  const safeEnvironment = normalizeEnvironment(environment);
  const safeEffect = normalizeEffect(effect);

  if (safeEnvironment === "official") {
    return PRACTICE_EFFECT_DECISION.ALLOW;
  }

  switch (safeEffect) {
    case PRACTICE_EFFECT.OFFICIAL_INPUT_READ:
      return PRACTICE_EFFECT_DECISION.ALLOW;

    case PRACTICE_EFFECT.FOOTBALL_STATE_WRITE:
      return PRACTICE_EFFECT_DECISION.ALLOW;

    case PRACTICE_EFFECT.OFFICIAL_MUTATION:
      return PRACTICE_EFFECT_DECISION.BLOCK;

    case PRACTICE_EFFECT.EXTERNAL_EFFECT:
      return PRACTICE_EFFECT_DECISION.SIMULATE;

    default:
      throw new Error(
        "[PracticeSideEffectPolicy] Effect classification failed closed."
      );
  }
}

export function canReadOfficialInput(environment) {
  return (
    getPracticeEffectDecision({
      environment,
      effect: PRACTICE_EFFECT.OFFICIAL_INPUT_READ,
    }) === PRACTICE_EFFECT_DECISION.ALLOW
  );
}

export function canWriteFootballState(environment) {
  return (
    getPracticeEffectDecision({
      environment,
      effect: PRACTICE_EFFECT.FOOTBALL_STATE_WRITE,
    }) === PRACTICE_EFFECT_DECISION.ALLOW
  );
}

export function canMutateOfficialData(environment) {
  return (
    getPracticeEffectDecision({
      environment,
      effect: PRACTICE_EFFECT.OFFICIAL_MUTATION,
    }) === PRACTICE_EFFECT_DECISION.ALLOW
  );
}

export function canTriggerExternalEffect(environment) {
  return (
    getPracticeEffectDecision({
      environment,
      effect: PRACTICE_EFFECT.EXTERNAL_EFFECT,
    }) === PRACTICE_EFFECT_DECISION.ALLOW
  );
}

export function shouldSimulateExternalEffect(environment) {
  return (
    getPracticeEffectDecision({
      environment,
      effect: PRACTICE_EFFECT.EXTERNAL_EFFECT,
    }) === PRACTICE_EFFECT_DECISION.SIMULATE
  );
}

export function assertOfficialMutationAllowed(environment) {
  if (!canMutateOfficialData(environment)) {
    throw new Error(
      "[PracticeSideEffectPolicy] SAFETY BLOCK: Practice cannot mutate Official data."
    );
  }

  return true;
}

export function assertFootballStateWriteAllowed(environment) {
  if (!canWriteFootballState(environment)) {
    throw new Error(
      "[PracticeSideEffectPolicy] SAFETY BLOCK: football-state write is not allowed."
    );
  }

  return true;
}
