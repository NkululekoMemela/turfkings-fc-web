import test from "node:test";
import assert from "node:assert/strict";

const {
  PRACTICE_DATA_CLASS,
  getPracticeDataClass,
  canPracticeWriteOfficialSurface,
  mustPracticeUseDataScope,
  mustPracticeSimulateOrBlock,
  isLegacyPracticeSurface,
} = await import("../src/core/practiceDataPolicy.js");

test("real club players remain Official read-only inputs", () => {
  assert.equal(
    getPracticeDataClass("players"),
    PRACTICE_DATA_CLASS.OFFICIAL_READ_ONLY
  );

  assert.equal(canPracticeWriteOfficialSurface("players"), false);
});

test("members remain Official read-only inputs", () => {
  assert.equal(
    getPracticeDataClass("members"),
    PRACTICE_DATA_CLASS.OFFICIAL_READ_ONLY
  );
});

test("football state must use DataScope", () => {
  for (const surface of [
    "state",
    "seasons",
    "matches",
    "matchSignups",
    "pendingSignups",
    "attendance",
    "peerRatings",
    "peerRatingBaselines",
  ]) {
    assert.equal(
      mustPracticeUseDataScope(surface),
      true,
      `${surface} must be DataScope-aware`
    );
  }
});

test("external effects must be simulated or blocked", () => {
  for (const surface of [
    "payments",
    "notifications",
    "newsStories",
    "videoHighlights",
    "permanentAwards",
    "email",
    "whatsapp",
  ]) {
    assert.equal(
      mustPracticeSimulateOrBlock(surface),
      true,
      `${surface} must not create a real Practice side effect`
    );
  }
});

test("global Platform Player identity is not sandbox football state", () => {
  assert.equal(
    getPracticeDataClass("platformPlayers"),
    PRACTICE_DATA_CLASS.PLATFORM_OFFICIAL
  );

  assert.equal(mustPracticeUseDataScope("platformPlayers"), false);
});

test("Practice v1 machinery is explicitly marked for retirement", () => {
  for (const surface of [
    "practiceSyntheticClub",
    "practiceDummyPlayers",
    "practiceSeed",
  ]) {
    assert.equal(isLegacyPracticeSurface(surface), true);
  }
});

test("unknown surfaces fail closed instead of being guessed", () => {
  assert.throws(
    () => getPracticeDataClass("mysteryCollection"),
    /Unclassified data surface/
  );
});

test("Practice never writes directly to Official surfaces", () => {
  for (const surface of [
    "players",
    "members",
    "state",
    "matches",
    "payments",
    "platformPlayers",
  ]) {
    assert.equal(
      canPracticeWriteOfficialSurface(surface),
      false
    );
  }
});
