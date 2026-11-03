import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  fieldSeasonRegistrationOpen, fieldSeasonMinimumClubs,
  fieldSeasonProjectedPrizes,
} from "../src/core/fieldSeasonLifecycle.js";

const require = createRequire(import.meta.url);
const { registrationOpen } = require("../functions/fieldSeasonInvitationHandlers.js");
const season = {
  id: "season-one", status: "active", announcedAtMs: 1,
  registrationOpen: true, signupDeadlineAtMs: 2000,
  results: [], matchDayHistory: [],
};

test("late joins qualify only for the current open registration window", () => {
  for (const open of [fieldSeasonRegistrationOpen, registrationOpen]) {
    assert.equal(open(season, 1000), true);
    assert.equal(open(season, 2000), true);
    assert.equal(open(season, 2001), false);
    assert.equal(open({ ...season, registrationOpen: false }, 1000), false);
    assert.equal(open({ ...season, status: "cancelled" }, 1000), false);
    assert.equal(open({ ...season, firstPlayAtMs: 500 }, 1000), false);
    assert.equal(open({ ...season, results: [{}] }, 1000), false);
    assert.equal(open({ ...season, announcedAtMs: null }, 1000), false);
  }
});

test("prepared match permits invitations; confirmed play closes them", () => {
  assert.equal(registrationOpen(season, 1000, {
    status: "live", confirmedLineupSnapshot: null,
  }), true);
  assert.equal(registrationOpen(season, 1000, {
    status: "live", confirmedLineupSnapshot: { confirmed: true },
  }), false);
});

test("minimum Clubs and the published prize increases are explicit", () => {
  assert.equal(fieldSeasonMinimumClubs("6"), 6);
  assert.throws(() => fieldSeasonMinimumClubs("2"));
  assert.throws(() => fieldSeasonMinimumClubs("3.5"));
  const terms = {
    minimumClubs: 6,
    prizes: { first: 1000, second: 500, third: 200 },
    prizeIncreasePerClub: { first: 100, second: 50, third: 25 },
  };
  assert.deepEqual(fieldSeasonProjectedPrizes(terms, 4), terms.prizes);
  assert.deepEqual(fieldSeasonProjectedPrizes(terms, 8), {
    first: 1200, second: 600, third: 250,
  });
});
