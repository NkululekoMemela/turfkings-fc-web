const {test} = require("node:test");
const assert = require("node:assert/strict");
const {attendanceView} = require("../functions/fieldSeasonAttendanceView");
test("attendance projection exposes no payment or private identity fields", () => {
  const squad = {
    matchDayAvailability: {day1: {a: {status: "unavailable", actorUid: "secret"}}},
    matchDayReplacements: {day1: {a: {invitationStatus: "accepted"}}},
  };
  const [row] = attendanceView(squad, [{
    memberId: "a", sourcePlayerId: "p", fullName: "Player",
    contributionCents: 10000, paymentStatus: "paid", email: "private",
  }]);
  assert.deepEqual(Object.keys(row).sort(),
    ["availability", "coverDays", "fullName", "memberId", "sourcePlayerId"].sort());
  assert.equal(row.availability.day1, "unavailable");
  assert.deepEqual(row.coverDays, ["day1"]);
});
test("unspecified attendance defaults available and cancelled cover is excluded", () => {
  const [row] = attendanceView({
    matchDayAvailability: {day1: {}},
    matchDayReplacements: {day1: {a: {invitationStatus: "cancelled"}}},
  }, [{memberId: "a", sourcePlayerId: "p", fullName: "Player"}]);
  assert.equal(row.availability.day1, "available");
  assert.deepEqual(row.coverDays, []);
});
