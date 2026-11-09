import {strict as assert} from "node:assert";
import test from "node:test";
import {buildPlayerAttendanceSummary, savedClubAttendanceDays} from "../src/core/playerAttendanceSummary.mjs";

const member = {id:"m1",playerId:"p1",fullName:"Sam Adams",shortName:"Sam"};
const other = {id:"m2",playerId:"p2",fullName:"Sam Brown",shortName:"Sam"};

test("the Profile Summary resolves the correct squad player and counts recorded appearances", () => {
  const state = {seasons:[{seasonId:"s1",matchDayHistory:[
    {id:"week1",playerAppearances:[{playerId:"p1",matchesPlayed:2},{playerId:"p2",matchesPlayed:4}]},
    {id:"week2",playerAppearances:[{playerId:"p1",matchesPlayed:0},{playerId:"p2",matchesPlayed:1}]},
    {id:"week1",playerAppearances:[{playerId:"p1",matchesPlayed:2}]},
  ]}]};
  const summary = buildPlayerAttendanceSummary({days:savedClubAttendanceDays(state),member,members:[member,other],
    teams:[{label:"France",players:[{playerId:"p2",fullName:"Sam Brown"}]},{label:"Brazil",players:["p1"]}]});
  assert.deepEqual(summary,{attended:1,total:2,gamesPlayed:2,percent:50,teamName:"Brazil"});
});

test("older clubs can use their attendance records when no saved match days exist", () => {
  const summary = buildPlayerAttendanceSummary({days:[],member,members:[member],fallbackRows:[
    {seasonId:"old",matchDayId:"week1",playerId:"p1",attended:true,gamesPlayed:2},
    {seasonId:"old",matchDayId:"week1",playerId:"p1",attended:true,gamesPlayed:2},
  ]});
  assert.equal(summary.percent,100);
  assert.equal(summary.gamesPlayed,2);
});
